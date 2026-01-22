import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClone,
  faPaperclip,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { Link2 } from "lucide-react";
import AttachmentPreviewModal, { type AttachmentPreviewItem } from "@/shared/ui/AttachmentPreviewModal";
import BudgetLineTransactionsDrawer from "./BudgetLineTransactionsDrawer";
import { useOrg } from "@/app/contexts/useOrg";
import { fetchHqAllocationsByProject } from "@/hq/lib/hqApi";
import styles from "@/dashboard/project/features/budget/pages/budget-page.module.css";
import { formatUSD } from "@/shared/utils/budgetUtils";
import type { Task } from "@/shared/utils/api";
import {
  BUDGET_TASK_LINK_TYPES,
  getTaskLinkTypeForBudgetItem,
  inferBudgetTaskLinkTypeFromTitle,
  taskHasBudgetLink,
  type BudgetTaskLinkType,
} from "@/shared/utils/budgetTaskLinks";

const MOBILE_BREAKPOINT = 768;

const PAGINATION_ESTIMATE = 96;

const EMPTY_PLACEHOLDER = "\u2014";

const toAttachmentPreviewItems = (raw: unknown): AttachmentPreviewItem[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const attachmentEntry = entry as Record<string, unknown>;
      const urlCandidate =
        typeof attachmentEntry.url === "string" && attachmentEntry.url.trim();
      if (!urlCandidate) return null;
      const fileNameCandidate =
        typeof attachmentEntry.fileName === "string" && attachmentEntry.fileName.trim();
      const mimeTypeCandidate =
        typeof attachmentEntry.mimeType === "string" ? attachmentEntry.mimeType : undefined;
      const idCandidate =
        typeof attachmentEntry.id === "string" && attachmentEntry.id.trim()
          ? attachmentEntry.id.trim()
          : undefined;
      return {
        id: idCandidate,
        fileName: fileNameCandidate || "Attachment",
        mimeType: mimeTypeCandidate,
        url: urlCandidate,
      } satisfies AttachmentPreviewItem;
    })
    .filter(Boolean) as AttachmentPreviewItem[];
};

type NormalizedPaymentStatus = "PAID" | "PARTIAL" | "UNPAID";

const normalizePaymentStatus = (status: unknown): NormalizedPaymentStatus => {
  if (typeof status !== "string") return "UNPAID";
  const cleaned = status.replace(/[^A-Z]+$/, "").trim().toUpperCase();
  if (!cleaned) return "UNPAID";
  if (cleaned.includes("UNPAID")) return "UNPAID";
  if (cleaned.includes("PART")) return "PARTIAL";
  if (cleaned.includes("PAID")) return "PAID";
  return "UNPAID";
};
type BudgetItem = Record<string, unknown> & {
  budgetItemId: string;
  key: string;
};

interface BudgetItemsTableProps {
  dataSource: BudgetItem[];
  selectedRowKeys: string[];
  setSelectedRowKeys: (keys: string[] | ((prev: string[]) => string[])) => void;
  lockedLines: string[];
  openEditModal: (record: BudgetItem) => void;
  openDuplicateModal: (record: BudgetItem) => void;
  openDeleteModal: (ids: string[]) => void;
  openWorkModal?: (record: BudgetItem) => void;
  tasks?: Task[];
  workCountByLineItemId?: Record<string, number>;
  workCoverageByLineItemId?: Record<string, Partial<Record<BudgetTaskLinkType, "missing" | "pending" | "done">>>;
  onCreateMissingWorkStage?: (record: BudgetItem, stage: BudgetTaskLinkType) => void;
  onUnlinkWorkTask?: (budgetItemId: string, task: Task) => Promise<void> | void;
  tableRef: React.RefObject<HTMLDivElement>;
  tableHeight: number;
  pageSize: number;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  isSelectMode: boolean;
  projectId?: string;
}

const BudgetItemsTable: React.FC<BudgetItemsTableProps> = React.memo(
  ({
    dataSource,
    selectedRowKeys,
    setSelectedRowKeys,
    lockedLines,
    openEditModal,
    openDuplicateModal,
    openDeleteModal,
    openWorkModal,
    tasks,
    workCountByLineItemId,
    workCoverageByLineItemId,
    onCreateMissingWorkStage,
    onUnlinkWorkTask,
    tableRef,
    tableHeight,
    pageSize,
    currentPage,
    setCurrentPage,
    isSelectMode,
    projectId,
  }) => {
  const { activeOrgId } = useOrg();
  const [isMobile, setIsMobile] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Allocation data for budget lines
  const [allocationsByBudgetItem, setAllocationsByBudgetItem] = useState<Record<string, number>>({});
  const [allocationDrawerOpen, setAllocationDrawerOpen] = useState(false);
  const [allocationDrawerItem, setAllocationDrawerItem] = useState<{ id: string; name?: string } | null>(null);
  const menuContainersRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [coverageMenuOpenForId, setCoverageMenuOpenForId] = useState<string | null>(null);
  const coverageDropdownRef = useRef<HTMLDivElement | null>(null);
  const [isCoveragePopoverHovered, setIsCoveragePopoverHovered] = useState(false);
  const [optimisticUnlinkedByLineId, setOptimisticUnlinkedByLineId] = useState<Record<string, Record<string, true>>>({});
  const [attachmentMenuState, setAttachmentMenuState] = useState<{
    id: string;
    items: AttachmentPreviewItem[];
  } | null>(null);
  const attachmentDropdownRef = useRef<HTMLDivElement | null>(null);
  const [attachmentPreviewItems, setAttachmentPreviewItems] = useState<AttachmentPreviewItem[]>([]);
  const [attachmentPreviewIndex, setAttachmentPreviewIndex] = useState(0);
  const [attachmentPreviewOpen, setAttachmentPreviewOpen] = useState(false);

  // Extract budget item IDs for batch fetch
  const budgetItemIds = useMemo(
    () => dataSource.map((item) => item.budgetItemId),
    [dataSource]
  );

  // Fetch allocation data for budget line items using batch endpoint
  useEffect(() => {
    if (!activeOrgId || !projectId || budgetItemIds.length === 0) {
      setAllocationsByBudgetItem({});
      return;
    }

    let cancelled = false;

    fetchHqAllocationsByProject(activeOrgId, projectId, budgetItemIds)
      .then((res) => {
        if (cancelled) return;
        setAllocationsByBudgetItem(res.allocations ?? {});
      })
      .catch(() => {
        if (!cancelled) setAllocationsByBudgetItem({});
      });

    return () => {
      cancelled = true;
    };
  }, [activeOrgId, projectId, budgetItemIds]);

    useEffect(() => {
      if (typeof window === "undefined") return;
      const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
      const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
        setIsMobile(event.matches);
      };

      handleChange(mediaQuery);

      const listener = (event: MediaQueryListEvent) => handleChange(event);

      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", listener);
        return () => mediaQuery.removeEventListener("change", listener);
      }

      mediaQuery.addListener(listener);
    return () => mediaQuery.removeListener(listener);
  }, []);

  useEffect(() => {
    if (!coverageMenuOpenForId) return undefined;

    const onPointerDown = (event: MouseEvent | PointerEvent) => {
      const target = event.target as Node | null;
      if (target && coverageDropdownRef.current?.contains(target)) return;
      setCoverageMenuOpenForId(null);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [coverageMenuOpenForId]);

  useEffect(() => {
    if (coverageMenuOpenForId) return;
    setIsCoveragePopoverHovered(false);
  }, [coverageMenuOpenForId]);

  useEffect(() => {
    if (!tasks || tasks.length === 0) return;
    setOptimisticUnlinkedByLineId((prev) => {
      let changed = false;
      const next: Record<string, Record<string, true>> = { ...prev };

      for (const [lineId, removedMap] of Object.entries(prev)) {
        if (!removedMap) continue;
        const kept: Record<string, true> = { ...removedMap };

        for (const taskId of Object.keys(removedMap)) {
          const task = tasks.find((t) => t.taskId === taskId);
          const stillLinked = task ? taskHasBudgetLink(task, lineId) : false;
          if (!stillLinked) {
            delete kept[taskId];
            changed = true;
          }
        }

        if (Object.keys(kept).length === 0) {
          if (next[lineId]) {
            delete next[lineId];
            changed = true;
          }
        } else {
          next[lineId] = kept;
        }
      }

      return changed ? next : prev;
    });
  }, [tasks]);

  const openAttachmentPreview = useCallback((items: AttachmentPreviewItem[], index: number) => {
    if (!items.length) return;
    const boundedIndex = Math.min(Math.max(index, 0), items.length - 1);
    setAttachmentPreviewItems(items);
    setAttachmentPreviewIndex(boundedIndex);
    setAttachmentPreviewOpen(true);
  }, []);

  const closeAttachmentPreview = useCallback(() => {
    setAttachmentPreviewOpen(false);
    setAttachmentPreviewItems([]);
    setAttachmentPreviewIndex(0);
  }, []);

    const costKeys = useMemo(
      () => [
        "itemBudgetedCost",
        "itemActualCost",
        "itemReconciledCost",
        "itemFinalCost",
      ],
      []
    );

    const isDefined = useCallback((val: unknown) => {
      if (val === undefined || val === null) return false;
      const str = String(val).trim();
      if (!str) return false;
      const num = parseFloat(str.replace(/[$,]/g, ""));
      if (!Number.isNaN(num)) {
        return num !== 0;
      }
      return str !== "0";
    }, []);

    const getActiveCostKey = useCallback(
      (item: BudgetItem) => {
        if (isDefined(item.itemReconciledCost)) return "itemReconciledCost";
        if (isDefined(item.itemActualCost)) return "itemActualCost";
        return "itemBudgetedCost";
      },
      [isDefined]
    );

    const primaryMetrics = useMemo(
      () => [
        { key: "quantity", label: "Qty" },
        { key: "unit", label: "U" },
        { key: "itemBudgetedCost", label: "BC" },
        { key: "itemActualCost", label: "AC" },
        { key: "itemReconciledCost", label: "RC" },
      ],
      []
    );

    const summaryMetrics = useMemo(
      () => [
        { key: "itemMarkUp", label: "MK" },
        { key: "itemFinalCost", label: "FC" },
      ],
      []
    );

    const availableIds = useMemo(
      () => dataSource.map((item) => String(item.budgetItemId)),
      [dataSource]
    );

    const availableIdSet = useMemo(() => new Set(availableIds), [availableIds]);

    const selectedInScope = useMemo(
      () => selectedRowKeys.filter((id) => availableIdSet.has(id)),
      [selectedRowKeys, availableIdSet]
    );

    const isSelectAllChecked =
      isSelectMode && availableIds.length > 0 && selectedInScope.length === availableIds.length;

    const handleSelectAllChange = useCallback(
      (checked: boolean) => {
        if (!isSelectMode) return;
        setSelectedRowKeys((prevKeys) => {
          if (checked) {
            const next = new Set(prevKeys);
            availableIds.forEach((id) => next.add(id));
            return Array.from(next);
          }
          return prevKeys.filter((id) => !availableIdSet.has(id));
        });
      },
      [availableIds, availableIdSet, isSelectMode, setSelectedRowKeys]
    );

    const handleClearSelection = useCallback(() => {
      if (!isSelectMode) return;
      setSelectedRowKeys((prevKeys) => prevKeys.filter((id) => !availableIdSet.has(id)));
    }, [availableIdSet, isSelectMode, setSelectedRowKeys]);

    const toggleSelection = useCallback(
      (record: BudgetItem, checked: boolean) => {
        if (!isSelectMode) return;
        const id = String(record.budgetItemId);
        setSelectedRowKeys((prevKeys) => {
          const nextKeys = new Set(prevKeys);
          if (checked) {
            nextKeys.add(id);
          } else {
            nextKeys.delete(id);
          }
          return Array.from(nextKeys);
        });
      },
      [isSelectMode, setSelectedRowKeys]
    );

    const handleCardKeyDown = useCallback(
      (
        event: React.KeyboardEvent<HTMLElement>,
        record: BudgetItem,
        isLocked: boolean,
        isInSelectMode: boolean,
        isSelected: boolean
      ) => {
        if (isLocked) return;
        if (isInSelectMode) {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            setOpenMenuId(null);
            toggleSelection(record, !isSelected);
          }
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          setOpenMenuId(null);
          openEditModal(record);
        } else if (event.key === " ") {
          event.preventDefault();
          setOpenMenuId(null);
          openDeleteModal([record.budgetItemId]);
        }
      },
      [openDeleteModal, openEditModal, setOpenMenuId, toggleSelection]
    );

    useEffect(() => {
      const totalItems = dataSource.length;
      const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / pageSize);
      if (currentPage > totalPages) {
        setCurrentPage(totalPages);
      }
    }, [currentPage, dataSource.length, pageSize, setCurrentPage]);

    const paginatedData = useMemo(() => {
      const startIndex = Math.max(0, (currentPage - 1) * pageSize);
      return dataSource.slice(startIndex, startIndex + pageSize);
    }, [dataSource, currentPage, pageSize]);

    const formatMetricValue = useCallback(
      (record: BudgetItem, metricKey: string) => {
        const value = record[metricKey];
        if (metricKey === "itemMarkUp") {
          if (typeof value === "number") {
            return `${Math.round(value * 100)}%`;
          }
          return value ? String(value) : EMPTY_PLACEHOLDER;
        }

        if (costKeys.includes(metricKey)) {
          if (metricKey === "itemFinalCost") {
            const amount = isDefined(value) ? formatUSD(Number(value)) : EMPTY_PLACEHOLDER;
            const status = normalizePaymentStatus(record.paymentStatus);
            const statusLabel =
              status === "PAID" ? "Paid" : status === "PARTIAL" ? "Partially paid" : "Unpaid";
            const statusClass =
              status === "PAID"
                ? styles.paid
                : status === "PARTIAL"
                ? styles.partial
                : styles.unpaid;

            return (
              <span className={styles.costWithStatus}>
                {amount}
                <span
                  className={`${styles.statusDot} ${statusClass}`}
                  role="img"
                  aria-label={`${statusLabel} status`}
                />
              </span>
            );
          }

          if (!isDefined(value)) return EMPTY_PLACEHOLDER;
          const activeKey = getActiveCostKey(record);
          const formatted = formatUSD(Number(value));
          return activeKey === metricKey
            ? formatted
            : (
                <span className={styles.dimmed}>{formatted}</span>
              );
        }

        if (value === undefined || value === null || value === "") {
          return EMPTY_PLACEHOLDER;
        }

        return String(value);
      },
      [costKeys, getActiveCostKey, isDefined]
    );

        const listStyle = useMemo(() => {
      if (!tableHeight) return undefined;
      const minHeight = Math.max(0, tableHeight - PAGINATION_ESTIMATE);
      return { minHeight };
    }, [tableHeight]);

    const isEmpty = paginatedData.length === 0;

    const registerMenuContainer = useCallback(
      (id: string, node: HTMLDivElement | null) => {
        if (node) {
          menuContainersRef.current.set(id, node);
        } else {
          menuContainersRef.current.delete(id);
        }
      },
      []
    );

    useEffect(() => {
      if (typeof document === "undefined") return undefined;

      const handleDocumentClick = (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Node)) return;

        for (const container of menuContainersRef.current.values()) {
          if (container.contains(target)) {
            return;
          }
        }

        setOpenMenuId(null);
      };

      document.addEventListener("click", handleDocumentClick);
      return () => document.removeEventListener("click", handleDocumentClick);
  }, [setOpenMenuId]);

  useEffect(() => {
    if (!attachmentMenuState) return undefined;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && attachmentDropdownRef.current?.contains(target)) return;
      setAttachmentMenuState(null);
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [attachmentMenuState]);

    useEffect(() => {
      if (typeof document === "undefined") return undefined;

      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setOpenMenuId(null);
        }
      };

      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }, [setOpenMenuId]);

  const previewAttachment = attachmentPreviewItems[attachmentPreviewIndex] ?? null;

  const toggleAttachmentMenuForRecord = useCallback(
    (event: React.SyntheticEvent, recordId: string, attachments: AttachmentPreviewItem[]) => {
      event.stopPropagation();
      const isSame = attachmentMenuState?.id === recordId;
      setAttachmentMenuState(isSame ? null : { id: recordId, items: attachments });
    },
    [attachmentMenuState],
  );

    return (
      <>
        <div ref={tableRef} className={styles.tableContainer}>
        {isSelectMode && dataSource.length > 0 && isMobile && (
          <div className={styles.cardListHeader}>
            <button
              type="button"
              className={styles.cardHeaderButton}
              onClick={() => handleSelectAllChange(true)}
              disabled={isSelectAllChecked}
            >
              {isSelectAllChecked ? "All selected" : "Select all"}
              <span className={styles.selectionCount}>
                {selectedInScope.length}/{availableIds.length}
              </span>
            </button>
            <button
              type="button"
              className={styles.clearSelectionButton}
              onClick={handleClearSelection}
              disabled={selectedInScope.length === 0}
            >
              Clear selection
            </button>
          </div>
        )}

        <div
          className={`${styles.cardListWrapper}${
            isEmpty ? ` ${styles.cardListWrapperEmpty}` : ""
          }`}
          style={listStyle}
        >
          {isEmpty ? (
            <div className={styles.emptyPlaceholder}>No budget items to display</div>
          ) : (
            <div className={`${styles.cardList}${isMobile ? ` ${styles.cardListMobile}` : ""}`}>
              {paginatedData.map((record) => {
                const isSelected = selectedRowKeys.includes(record.budgetItemId);
                const isLocked = lockedLines.includes(record.budgetItemId);
                 const attachmentsForRecord = toAttachmentPreviewItems(record.attachments);
                 const attachmentCount = attachmentsForRecord.length;
                 const workCount = workCountByLineItemId?.[record.budgetItemId] ?? 0;
                 const coverage = workCoverageByLineItemId?.[record.budgetItemId] ?? null;
                 const coverageCount = coverage
                   ? BUDGET_TASK_LINK_TYPES.reduce((sum, t) => {
                       const state = coverage[t.id] ?? "missing";
                       return sum + (state === "missing" ? 0 : 1);
                     }, 0)
                   : 0;
                 const isAttachmentMenuOpen = attachmentMenuState?.id === record.budgetItemId;
                 const menuAttachments = isAttachmentMenuOpen ? attachmentMenuState?.items ?? attachmentsForRecord : attachmentsForRecord;

                 return (
                  <article
                    key={record.key}
                    className={`${styles.card}${
                      isSelectMode && isSelected ? ` ${styles.cardSelected}` : ""
                    }${isLocked ? ` ${styles.cardLocked}` : ""}${
                      openMenuId === record.budgetItemId ? ` ${styles.cardMenuOpen}` : ""
                    }`}
                    role={isSelectMode ? "checkbox" : "button"}
                    tabIndex={isLocked ? -1 : 0}
                    aria-checked={isSelectMode ? isSelected : undefined}
                    aria-disabled={isLocked}
                    onClick={() => {
                      if (isLocked) return;
                      setOpenMenuId(null);
                      if (isSelectMode) {
                        toggleSelection(record, !isSelected);
                      } else {
                        openEditModal(record);
                      }
                    }}
                    onKeyDown={(event) =>
                      handleCardKeyDown(event, record, isLocked, isSelectMode, isSelected)
                    }
                    onPointerEnter={() => {
                      if (!coverageMenuOpenForId) return;
                      if (isCoveragePopoverHovered) return;
                      if (coverageMenuOpenForId !== record.budgetItemId) {
                        setCoverageMenuOpenForId(null);
                      }
                    }}
                  >
                    <div className={styles.cardRow}>
                      {isSelectMode && (
                        <label className={styles.cardCheckbox}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isLocked}
                            onChange={(event) => {
                              event.stopPropagation();
                              toggleSelection(record, event.target.checked);
                            }}
                            onClick={(event) => event.stopPropagation()}
                            aria-label="Select budget line item"
                          />
                        </label>
                      )}

                      <div className={styles.cardHeaderGrid}>
                        <div className={styles.cardHeaderMeta}>
                          <div className={styles.cardIdentifiers}>
                            <span className={styles.cardKey}>{String(record.elementKey ?? "—")}</span>
                            {record.elementId && (
                              <span className={styles.cardId}>{String(record.elementId)}</span>
                            )}
                          </div>
                        </div>

                        <div className={styles.cardHeaderMetricsTop}>
                          <div className={`${styles.cardMetricRow} ${styles.cardMetricRowTop}`}
                            aria-label="Quantity, unit, and costs"
                          >
                            {primaryMetrics.map((metric) => (
                              <div key={metric.key} className={styles.cardMetric}>
                                <span className={styles.cardMetricLabel}>{metric.label}</span>
                                <span className={styles.cardMetricValue}>
                                  {formatMetricValue(record, metric.key)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className={styles.cardHeaderTitle}>
                          <div className={styles.cardTitle}>
                            {record.description ? String(record.description) : "No description"}
                          </div>
                        </div>

                        <div className={styles.cardHeaderMetricsBottom}>
                          <div className={`${styles.cardMetricRow} ${styles.cardMetricRowSummary}`}
                            aria-label="Markup and final cost"
                          >
                            {summaryMetrics.map((metric) => (
                              <div
                                key={metric.key}
                                className={`${styles.cardMetric} ${styles.cardMetricSummary}`}
                              >
                                <span className={styles.cardMetricLabel}>{metric.label}</span>
                                <span className={styles.cardMetricValue}>
                                  {formatMetricValue(record, metric.key)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className={styles.cardFooterRow}>
                        <div className={styles.cardFooterLeft}>
                          {openWorkModal && (
                            <button
                              type="button"
                              className={styles.workChipButton}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (isLocked || isSelectMode) return;
                                openWorkModal(record);
                              }}
                              disabled={isLocked || isSelectMode}
                              title="Tasks"
                            >
                              <span>Tasks •</span>
                              <span className={styles.workChipCount}>{workCount}</span>
                            </button>
                          )}

                          {/* Allocation indicator */}
                          {projectId && (
                            <button
                              type="button"
                              className={styles.allocationChipButton}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (isSelectMode) return;
                                setAllocationDrawerItem({
                                  id: record.budgetItemId,
                                  name: record.description ? String(record.description) : undefined,
                                });
                                setAllocationDrawerOpen(true);
                              }}
                              disabled={isSelectMode}
                              title="View linked transactions"
                            >
                              <Link2 size={12} />
                              <span>Spend</span>
                              {allocationsByBudgetItem[record.budgetItemId] ? (
                                <span className={styles.allocationChipAmount}>
                                  {formatUSD(allocationsByBudgetItem[record.budgetItemId])}
                                </span>
                              ) : null}
                            </button>
                          )}

                          {coverage ? (
                            <div className={styles.coverageAddWrapper}>
                              <button
                                type="button"
                                className={styles.coverageAddButton}
                                aria-haspopup="menu"
                                aria-expanded={coverageMenuOpenForId === record.budgetItemId}
                                disabled={isLocked || isSelectMode || !onCreateMissingWorkStage}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (isLocked || isSelectMode || !onCreateMissingWorkStage) return;
                                  setCoverageMenuOpenForId((prev) =>
                                    prev === record.budgetItemId ? null : record.budgetItemId
                                  );
                                }}
                                title="Coverage"
                              >
                                <span>Coverage</span>
                                <span aria-hidden>·</span>
                                <span>{coverageCount}</span>
                              </button>

                              {coverageMenuOpenForId === record.budgetItemId ? (
                                <div
                                  className={styles.coverageDropdown}
                                  ref={coverageDropdownRef}
                                  role="menu"
                                  aria-label="Add coverage"
                                  onPointerEnter={() => setIsCoveragePopoverHovered(true)}
                                  onPointerLeave={() => setIsCoveragePopoverHovered(false)}
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {(() => {
                                    const budgetItemId = record.budgetItemId;
                                    const removedForLine = optimisticUnlinkedByLineId[budgetItemId] ?? {};
                                    const linked = (tasks ?? [])
                                      .filter((t) => taskHasBudgetLink(t, budgetItemId))
                                      .filter((t) => (t.taskId ? !removedForLine[t.taskId] : true));

                                    const grouped: Record<BudgetTaskLinkType, Task[]> = {
                                      quote: [],
                                      procure: [],
                                      build: [],
                                      install: [],
                                      strike: [],
                                      invoice: [],
                                    };

                                    linked.forEach((t) => {
                                      const linkType =
                                        getTaskLinkTypeForBudgetItem(t, budgetItemId) ??
                                        inferBudgetTaskLinkTypeFromTitle(t.title ?? "");
                                      grouped[linkType].push(t);
                                    });

                                    return (
                                      <div className={styles.coverageRows}>
                                        {BUDGET_TASK_LINK_TYPES.map((step) => {
                                          const stepTasks = grouped[step.id] ?? [];
                                          const canMutate = !isLocked && !isSelectMode;
                                          const canAdd = canMutate && Boolean(onCreateMissingWorkStage);
                                          const canUnlink = canMutate && Boolean(onUnlinkWorkTask);

                                          return (
                                            <div key={step.id} className={styles.coverageRow} role="none">
                                              <div className={styles.coverageRowLabel}>{step.label}</div>
                                              <div className={styles.coverageRowChips}>
                                                {stepTasks.length === 0 ? (
                                                  <span className={styles.coverageRowEmpty}>—</span>
                                                ) : (
                                                  stepTasks.map((t) => {
                                                    const title =
                                                      (t.title || "Untitled task").trim() || "Untitled task";
                                                    const taskId = t.taskId ?? title;
                                                    const hasRealTaskId = Boolean(t.taskId);
                                                    const canUnlinkThis = canUnlink && hasRealTaskId;

                                                    return (
                                                      <span
                                                        key={taskId}
                                                        className={styles.coverageTaskChip}
                                                        title={title}
                                                      >
                                                        <span className={styles.coverageTaskChipText}>{title}</span>
                                                        <button
                                                          type="button"
                                                          className={styles.coverageTaskChipRemove}
                                                          aria-label={`Unlink ${step.label} task`}
                                                          disabled={!canUnlinkThis}
                                                          onClick={(event) => {
                                                            event.stopPropagation();
                                                            if (!canUnlinkThis) return;

                                                            setOptimisticUnlinkedByLineId((prev) => ({
                                                              ...prev,
                                                              [budgetItemId]: {
                                                                ...(prev[budgetItemId] ?? {}),
                                                                [t.taskId as string]: true,
                                                              },
                                                            }));

                                                            Promise.resolve(
                                                              onUnlinkWorkTask?.(budgetItemId, t)
                                                            ).catch(() => {
                                                              setOptimisticUnlinkedByLineId((prev) => {
                                                                const existing = prev[budgetItemId];
                                                                if (!existing || !existing[t.taskId as string]) return prev;
                                                                const nextLine = { ...existing };
                                                                delete nextLine[t.taskId as string];
                                                                const next = { ...prev };
                                                                if (Object.keys(nextLine).length === 0) {
                                                                  delete next[budgetItemId];
                                                                } else {
                                                                  next[budgetItemId] = nextLine;
                                                                }
                                                                return next;
                                                              });
                                                            });
                                                          }}
                                                        >
                                                          ×
                                                        </button>
                                                      </span>
                                                    );
                                                  })
                                                )}
                                              </div>

                                              <button
                                                type="button"
                                                className={styles.coverageRowAction}
                                                disabled={!canAdd}
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  if (!canAdd) return;
                                                  onCreateMissingWorkStage?.(record, step.id);
                                                }}
                                              >
                                                Add
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  })()}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {attachmentCount > 0 && (
                            <div className={styles.attachmentIconWrapper}>
                              <button
                                type="button"
                                className={styles.attachmentIconButton}
                                role="button"
                                aria-haspopup="menu"
                                aria-expanded={isAttachmentMenuOpen}
                                onClick={(event) =>
                                  toggleAttachmentMenuForRecord(
                                    event,
                                    record.budgetItemId,
                                    attachmentsForRecord,
                                  )
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    toggleAttachmentMenuForRecord(
                                      event,
                                      record.budgetItemId,
                                      attachmentsForRecord,
                                    );
                                  }
                                }}
                              >
                                <FontAwesomeIcon icon={faPaperclip} />
                                <span className={styles.cardAttachmentCount}>{attachmentCount}</span>
                              </button>
                              {isAttachmentMenuOpen && (
                                <div className={styles.attachmentDropdown} ref={attachmentDropdownRef}>
                                  {menuAttachments.map((attachment, index) => (
                                    <button
                                      key={`${record.budgetItemId}-attachment-${attachment.id ?? index}`}
                                      type="button"
                                      className={styles.attachmentDropdownItem}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openAttachmentPreview(menuAttachments, index);
                                        setAttachmentMenuState(null);
                                      }}
                                    >
                                      <span className={styles.attachmentDropdownThumbnail} aria-hidden="true">
                                        {attachment.mimeType?.startsWith("image") ? (
                                          <img src={attachment.url} alt="" />
                                        ) : (
                                          <FontAwesomeIcon icon={faPaperclip} />
                                        )}
                                      </span>
                                      <span className={styles.attachmentDropdownLabel}>
                                        <span className={styles.attachmentDropdownFileName}>
                                          {attachment.fileName}
                                        </span>
                                        <span className={styles.attachmentDropdownMeta}>
                                          {attachment.mimeType || "File"}
                                        </span>
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div
                          className={styles.cardFooterActions}
                          ref={(node) => registerMenuContainer(record.budgetItemId, node)}
                        >
                          <button
                            className={`${styles.cardMenuTrigger}${
                              openMenuId === record.budgetItemId
                                ? ` ${styles.cardMenuTriggerActive}`
                                : ""
                            }`}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenMenuId((prev) =>
                                prev === record.budgetItemId ? null : record.budgetItemId
                              );
                            }}
                            aria-label="Line item options"
                            aria-haspopup="menu"
                            aria-expanded={openMenuId === record.budgetItemId}
                            aria-controls={
                              openMenuId === record.budgetItemId
                                ? `budget-card-menu-${record.key}`
                                : undefined
                            }
                          >
                            <span aria-hidden className={styles.cardMenuEllipsis}>
                              ⋯
                            </span>
                          </button>
                          {openMenuId === record.budgetItemId && (
                            <div
                              id={`budget-card-menu-${record.key}`}
                              role="menu"
                              className={styles.cardMenu}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <button
                                type="button"
                                role="menuitem"
                                className={styles.cardMenuItem}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setOpenMenuId(null);
                                  openDuplicateModal(record);
                                }}
                              >
                                <span className={styles.cardMenuItemIcon}>
                                  <FontAwesomeIcon icon={faClone} />
                                </span>
                                <span>Duplicate</span>
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className={`${styles.cardMenuItem} ${styles.cardMenuItemDanger}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setOpenMenuId(null);
                                  openDeleteModal([record.budgetItemId]);
                                }}
                              >
                                <span className={styles.cardMenuItemIcon}>
                                  <FontAwesomeIcon icon={faTrash} />
                                </span>
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        </div>

        <AttachmentPreviewModal
          attachment={previewAttachment}
          isOpen={attachmentPreviewOpen && Boolean(previewAttachment)}
          onRequestClose={closeAttachmentPreview}
        />

        {/* Budget line transactions drawer */}
        {projectId && allocationDrawerItem ? (
          <BudgetLineTransactionsDrawer
            isOpen={allocationDrawerOpen}
            onClose={() => {
              setAllocationDrawerOpen(false);
              setAllocationDrawerItem(null);
            }}
            projectId={projectId}
            budgetItemId={allocationDrawerItem.id}
            budgetItemName={allocationDrawerItem.name}
          />
        ) : null}
      </>
    );
  }
);

export default BudgetItemsTable;
