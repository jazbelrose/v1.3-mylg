import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faClone,
  faClock,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import styles from "@/dashboard/project/features/budget/pages/budget-page.module.css";
import { formatUSD } from "@/shared/utils/budgetUtils";

const MOBILE_BREAKPOINT = 768;

const PAGINATION_ESTIMATE = 96;

const EMPTY_PLACEHOLDER = "\u2014";

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
  openEventModal: (record: BudgetItem) => void;
  eventsByLineItem: Record<string, Record<string, unknown>[]>;
  tableRef: React.RefObject<HTMLDivElement>;
  tableHeight: number;
  pageSize: number;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  isSelectMode: boolean;
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
    openEventModal,
    eventsByLineItem,
    tableRef,
    tableHeight,
    pageSize,
    currentPage,
    setCurrentPage,
    isSelectMode,
  }) => {
    const [isMobile, setIsMobile] = useState(false);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const menuContainersRef = useRef<Map<string, HTMLDivElement>>(new Map());

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
      if (typeof document === "undefined") return undefined;

      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setOpenMenuId(null);
        }
      };

      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }, [setOpenMenuId]);

    return (
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

        <div className={styles.cardListWrapper} style={listStyle}>
          {paginatedData.length === 0 ? (
            <div className={styles.emptyPlaceholder}>No budget items to display</div>
          ) : (
            <div className={`${styles.cardList}${isMobile ? ` ${styles.cardListMobile}` : ""}`}>
              {paginatedData.map((record) => {
                const isSelected = selectedRowKeys.includes(record.budgetItemId);
                const isLocked = lockedLines.includes(record.budgetItemId);
                const events = eventsByLineItem[record.budgetItemId] || [];
                const eventCount = events.length;

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
                  >
                    <div className={styles.cardRow}>
                      <div className={styles.cardPrimary}>
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
                        <div className={styles.cardSummary}>
                          <div className={styles.cardIdentifiers}>
                            <span className={styles.cardKey}>
                              {String(record.elementKey ?? "—")}
                            </span>
                            {record.elementId && (
                              <span className={styles.cardId}>
                                {String(record.elementId)}
                              </span>
                            )}
                          </div>
                          <div className={styles.cardDescription}>
                            {record.description
                              ? String(record.description)
                              : "No description"}
                          </div>
                        </div>
                      </div>

                      <div className={styles.cardMetrics}>
                        <div className={styles.cardMetricRow}>
                          {primaryMetrics.map((metric) => (
                            <div key={metric.key} className={styles.cardMetric}>
                              <span className={styles.cardMetricLabel}>{metric.label}</span>
                              <span className={styles.cardMetricValue}>
                                {formatMetricValue(record, metric.key)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div
                          className={`${styles.cardMetricRow} ${styles.cardMetricRowSummary}`}
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
                      <div
                        className={styles.cardControls}
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
                          aria-label={
                            eventCount > 0
                              ? `View options for ${eventCount} scheduled events`
                              : "View budget line item options"
                          }
                          aria-haspopup="menu"
                          aria-expanded={openMenuId === record.budgetItemId}
                          aria-controls={
                            openMenuId === record.budgetItemId
                              ? `budget-card-menu-${record.key}`
                              : undefined
                          }
                        >
                          <FontAwesomeIcon icon={faChevronDown} />
                          {eventCount > 0 && (
                            <span className={styles.cardEventBadge}>{eventCount}</span>
                          )}
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
                                openEventModal(record);
                              }}
                            >
                              <span className={styles.cardMenuItemIcon}>
                                <FontAwesomeIcon icon={faClock} />
                              </span>
                              <span>Manage events</span>
                            </button>
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
                              <span>Duplicate line item</span>
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
                              <span>Delete line item</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

      </div>
    );
  }
);

export default BudgetItemsTable;
