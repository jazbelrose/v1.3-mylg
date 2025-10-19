import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Pagination } from "antd";
import { Tooltip as AntTooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClone, faTrash } from "@fortawesome/free-solid-svg-icons";
import BudgetMobileFilter from "./BudgetMobileFilter";
import styles from "./BudgetToolbar.module.css";

type SortOrder = "ascend" | "descend" | null;

type GroupByOption = "none" | "areaGroup" | "invoiceGroup" | "category";

interface BudgetToolbarProps {
  selectedRowKeys: string[];
  handleDuplicateSelected: () => void;
  openDeleteModal: (ids: string[]) => void;
  openCreateModal?: () => void;
  filterQuery: string;
  onFilterQueryChange: (query: string) => void;
  sortField: string | null;
  sortOrder: SortOrder;
  onSortChange: (field: string | null, order: SortOrder) => void;
  groupBy: GroupByOption;
  onGroupChange: (group: GroupByOption) => void;
  isSelectAllChecked: boolean;
  onSelectAllChange: (checked: boolean) => void;
  selectionCount: number;
  totalCount: number;
  onClearSelection: () => void;
  isSelectMode: boolean;
  onToggleSelectMode: (next: boolean) => void;
  currentPage: number;
  pageSize: number;
  onPaginationChange: (page: number, pageSize: number) => void;
}

const BudgetToolbar: React.FC<BudgetToolbarProps> = ({
  selectedRowKeys,
  handleDuplicateSelected,
  openDeleteModal,
  openCreateModal,
  filterQuery,
  onFilterQueryChange,
  sortField,
  sortOrder,
  onSortChange,
  groupBy,
  onGroupChange,
  isSelectAllChecked,
  onSelectAllChange,
  selectionCount,
  totalCount,
  onClearSelection,
  isSelectMode,
  onToggleSelectMode,
  currentPage,
  pageSize,
  onPaginationChange,
}) => {
  const [isMobile, setIsMobile] = useState(false);
  const [isSelectMenuOpen, setIsSelectMenuOpen] = useState(false);
  const selectModeContainerRef = useRef<HTMLDivElement | null>(null);
  const selectMenuRef = useRef<HTMLDivElement | null>(null);
  const selectMenuId = useId();
  const hasRows = totalCount > 0;
  const selectionLabel = useMemo(
    () => `${selectionCount}/${totalCount}`,
    [selectionCount, totalCount]
  );
  const allSelected = useMemo(
    () => hasRows && isSelectAllChecked && selectionCount === totalCount,
    [hasRows, isSelectAllChecked, selectionCount, totalCount]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const MOBILE_BREAKPOINT = 768;
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const updateMatch = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(event.matches);
    };

    updateMatch(mediaQuery);

    const listener = (event: MediaQueryListEvent) => updateMatch(event);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery.removeEventListener("change", listener);
    }

    mediaQuery.addListener(listener);
    return () => mediaQuery.removeListener(listener);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setIsSelectMenuOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isSelectMode) {
      setIsSelectMenuOpen(false);
    }
  }, [isSelectMode]);

  useEffect(() => {
    if (!isSelectMenuOpen) return;

    const handlePointer = (event: MouseEvent | TouchEvent) => {
      if (!(event.target instanceof Node)) return;
      if (
        selectMenuRef.current?.contains(event.target) ||
        selectModeContainerRef.current?.contains(event.target)
      ) {
        return;
      }
      setIsSelectMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);

    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
    };
  }, [isSelectMenuOpen]);

  const handleSelectButtonClick = () => {
    if (!isSelectMode) {
      onToggleSelectMode(true);
      if (isMobile) {
        setIsSelectMenuOpen(true);
      }
      return;
    }

    if (isMobile) {
      setIsSelectMenuOpen((prev) => !prev);
      return;
    }

    onToggleSelectMode(false);
    if (selectionCount > 0) {
      onClearSelection();
    }
  };

  const handleCloseSelectMode = () => {
    if (isSelectMode) {
      onToggleSelectMode(false);
      if (selectionCount > 0) {
        onClearSelection();
      }
    }
    setIsSelectMenuOpen(false);
  };

  const handleSelectAll = () => {
    if (!hasRows) return;
    onSelectAllChange(true);
  };

  const selectModeActions = (
    <>
      <button
        type="button"
        className={styles.selectModeAction}
        onClick={handleSelectAll}
        disabled={allSelected}
      >
        {allSelected ? "All selected" : "Select all"}
        <span className={styles.selectionCount}>{selectionLabel}</span>
      </button>
      <button
        type="button"
        className={styles.selectModeAction}
        onClick={onClearSelection}
        disabled={selectionCount === 0}
      >
        Clear selection
      </button>
      <div className={styles.selectionActions}>
        <div className={styles.iconSlot}>
          <AntTooltip title="Duplicate Selected">
            <button
              type="button"
              className={styles.iconActionButton}
              onClick={handleDuplicateSelected}
              aria-label="Duplicate selected"
              disabled={selectionCount === 0}
            >
              <FontAwesomeIcon icon={faClone} />
            </button>
          </AntTooltip>
        </div>
        <div className={styles.iconSlot}>
          <AntTooltip title="Delete Selected">
            <button
              type="button"
              className={styles.iconActionButton}
              onClick={() => openDeleteModal(selectedRowKeys)}
              aria-label="Delete selected"
              disabled={selectionCount === 0}
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </AntTooltip>
        </div>
      </div>
    </>
  );

  return (
    <div className={styles.toolbar}>
      <div className={styles.filterControls}>
        <div className={styles.mobileFilterWrap}>
          <BudgetMobileFilter
            filterQuery={filterQuery}
            onFilterQueryChange={onFilterQueryChange}
            sortField={sortField}
            sortOrder={sortOrder}
            onSortChange={onSortChange}
            groupBy={groupBy}
            onGroupChange={onGroupChange}
          />
        </div>
        {hasRows && (
          <Pagination
            className={`${styles.toolbarPagination} ${styles.desktopPagination}`}
            current={currentPage}
            pageSize={pageSize}
            total={totalCount}
            showSizeChanger
            pageSizeOptions={["10", "20", "50", "100"]}
            size="small"
            onChange={onPaginationChange}
            onShowSizeChange={onPaginationChange}
          />
        )}
      </div>
      <div className={styles.rightControls}>
        {hasRows && (
          <>
            <div className={styles.mobilePaginationWrap}>
              <Pagination
                className={`${styles.toolbarPagination} ${styles.mobilePagination}`}
                current={currentPage}
                pageSize={pageSize}
                total={totalCount}
                size="small"
                simple
                onChange={onPaginationChange}
              />
            </div>
            <div className={styles.selectModeContainer}>
              <div
                className={`${styles.selectModePill}${
                  isSelectMode ? ` ${styles.selectModePillActive}` : ""
                }`}
                ref={selectModeContainerRef}
              >
                <button
                  type="button"
                  className={styles.selectModeToggle}
                  onClick={handleSelectButtonClick}
                  aria-pressed={isSelectMode}
                  aria-haspopup={isMobile ? "menu" : undefined}
                  aria-expanded={isMobile ? isSelectMenuOpen : isSelectMode}
                  aria-controls={isMobile ? selectMenuId : undefined}
                  disabled={!hasRows}
                >
                  <span className={styles.selectLabel}>Select</span>
                </button>
                {!isMobile && isSelectMode && (
                  <div className={styles.selectModeExpanded}>{selectModeActions}</div>
                )}
              </div>
              {isMobile && isSelectMode && (
                <div
                  id={selectMenuId}
                  className={`${styles.selectModeMobilePopover}${
                    isSelectMenuOpen ? ` ${styles.selectModeMobilePopoverOpen}` : ""
                  }`}
                  role="menu"
                  ref={selectMenuRef}
                >
                  <div className={styles.selectModePopoverContent}>{selectModeActions}</div>
                  <div className={styles.selectModePopoverFooter}>
                    <button
                      type="button"
                      className={styles.selectModeClose}
                      onClick={handleCloseSelectMode}
                    >
                      Exit select mode
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
        {openCreateModal && (
          <button
            type="button"
            className={styles.addButton}
            onClick={openCreateModal}
            aria-label="Add item"
          >
            <span className={styles.addIcon} aria-hidden="true">
              +
            </span>
            <span className={styles.addLabel}>Add Item</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default BudgetToolbar;








