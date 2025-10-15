import React, { useMemo, useState, useEffect } from "react";
import { Pagination } from "antd";
import { Tooltip as AntTooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClone, faTrash } from "@fortawesome/free-solid-svg-icons";
import BudgetMobileFilter from "./BudgetMobileFilter";
import styles from "./BudgetToolbar.module.css";

type SortOrder = "ascend" | "descend" | null;

type GroupByOption = "none" | "areaGroup" | "invoiceGroup" | "category";

// Hook to detect if we're on mobile/desktop
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth <= 900); // Same breakpoint as CSS
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  return isMobile;
};

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
  const isMobile = useIsMobile();
  const hasRows = totalCount > 0;
  const selectionLabel = useMemo(
    () => `${selectionCount}/${totalCount}`,
    [selectionCount, totalCount]
  );
  const allSelected = useMemo(
    () => hasRows && isSelectAllChecked && selectionCount === totalCount,
    [hasRows, isSelectAllChecked, selectionCount, totalCount]
  );

  const handleToggleSelectMode = () => {
    const next = !isSelectMode;
    onToggleSelectMode(next);
    if (!next && selectionCount > 0) {
      onClearSelection();
    }
  };

  const handleSelectAll = () => {
    if (!hasRows) return;
    onSelectAllChange(true);
  };

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
            <div
              className={`${styles.selectModePill}${
                isSelectMode ? ` ${styles.selectModePillActive}` : ""
              }`}
            >
              <button
                type="button"
                className={styles.selectModeToggle}
                onClick={handleToggleSelectMode}
                aria-pressed={isSelectMode}
                disabled={!hasRows}
              >
                <span className={styles.selectLabel}>Select</span>
              </button>
              {isSelectMode && (
                <div className={styles.selectModeExpanded}>
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








