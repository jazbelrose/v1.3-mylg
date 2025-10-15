import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, ChevronDown, Search } from "lucide-react";

import mobileStyles from "@/dashboard/home/components/projects-panel.module.css";
import desktopStyles from "@/dashboard/home/components/ProjectsPanelDesktop.module.css";
import styles from "./BudgetToolbar.module.css";

type SortOrder = "ascend" | "descend" | null;

type SortOptionValue =
  | "default"
  | "elementKey-asc"
  | "elementKey-desc"
  | "description-asc"
  | "description-desc"
  | "budgeted-desc"
  | "budgeted-asc"
  | "final-desc"
  | "final-asc";

type SortOption = {
  value: SortOptionValue;
  label: string;
  field: string | null;
  order: SortOrder;
};

type GroupByOption = "none" | "areaGroup" | "invoiceGroup" | "category";

interface GroupOption {
  value: GroupByOption;
  label: string;
}

const GROUP_OPTIONS: GroupOption[] = [
  { label: "None", value: "none" },
  { label: "Area Group", value: "areaGroup" },
  { label: "Invoice Group", value: "invoiceGroup" },
  { label: "Category", value: "category" },
];

const SORT_OPTIONS: SortOption[] = [
  { value: "default", label: "Default order", field: null, order: null },
  { value: "elementKey-asc", label: "Element Key (A→Z)", field: "elementKey", order: "ascend" },
  { value: "elementKey-desc", label: "Element Key (Z→A)", field: "elementKey", order: "descend" },
  { value: "description-asc", label: "Description (A→Z)", field: "description", order: "ascend" },
  { value: "description-desc", label: "Description (Z→A)", field: "description", order: "descend" },
  { value: "budgeted-desc", label: "Budgeted Cost (High→Low)", field: "itemBudgetedCost", order: "descend" },
  { value: "budgeted-asc", label: "Budgeted Cost (Low→High)", field: "itemBudgetedCost", order: "ascend" },
  { value: "final-desc", label: "Final Cost (High→Low)", field: "itemFinalCost", order: "descend" },
  { value: "final-asc", label: "Final Cost (Low→High)", field: "itemFinalCost", order: "ascend" },
];

interface BudgetMobileFilterProps {
  filterQuery: string;
  onFilterQueryChange: (query: string) => void;
  sortField: string | null;
  sortOrder: SortOrder;
  onSortChange: (field: string | null, order: SortOrder) => void;
  groupBy: GroupByOption;
  onGroupChange: (group: GroupByOption) => void;
}

const BudgetMobileFilter: React.FC<BudgetMobileFilterProps> = ({
  filterQuery,
  onFilterQueryChange,
  sortField,
  sortOrder,
  onSortChange,
  groupBy,
  onGroupChange,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointer = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current) return;
      if (event.target instanceof Node && containerRef.current.contains(event.target)) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
    };
  }, [open]);

  const currentSortValue = useMemo<SortOptionValue>(() => {
    if (!sortField || !sortOrder) {
      return "default";
    }

    const match = SORT_OPTIONS.find(
      (option) => option.field === sortField && option.order === sortOrder
    );

    return match ? match.value : "default";
  }, [sortField, sortOrder]);

  const activeGroupOption = useMemo(
    () => GROUP_OPTIONS.find((option) => option.value === groupBy),
    [groupBy]
  );

  const isGroupActive = groupBy !== "none";

  const isActive =
    filterQuery.trim().length > 0 || currentSortValue !== "default" || isGroupActive;

  const filterButtonLabel = isGroupActive
    ? activeGroupOption?.label ?? "Filter"
    : "Filter";

  const filterButtonAriaLabel = isGroupActive
    ? `Group budget items by ${activeGroupOption?.label ?? "selection"}`
    : "Filter budget items";

  const handleSortChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value as SortOptionValue;
    const option = SORT_OPTIONS.find((opt) => opt.value === nextValue) ?? SORT_OPTIONS[0];
    onSortChange(option.field, option.order);
  };

  const handleGroupChange = (value: GroupByOption) => {
    onGroupChange(value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((prev) => !prev);
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className={styles.mobileFilterRoot} ref={containerRef}>
      <button
        type="button"
        className={`${mobileStyles.recents} ${styles.mobileFilterButton} ${
          isActive ? styles.mobileFilterActive : ""
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={filterButtonAriaLabel}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
      >
        <span className={styles.mobileFilterButtonText}>
          {filterButtonLabel}
        </span>
      </button>
      {open && (
        <div
          className={`${mobileStyles.filterPop} ${mobileStyles.filterPopStart} ${styles.mobileFilterPopover}`}
          role="menu"
        >
          <div className={styles.mobileFilterSection}>
            <span className={styles.mobileFilterLabel}>Group by</span>
            <div
              className={styles.mobileFilterGroup}
              role="group"
              aria-label="Group budget items"
            >
              {GROUP_OPTIONS.map((option) => {
                const isActiveOption = option.value === groupBy;
                const className = isActiveOption
                  ? `${styles.mobileFilterGroupButton} ${styles.mobileFilterGroupButtonActive}`
                  : styles.mobileFilterGroupButton;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={className}
                    onClick={() => handleGroupChange(option.value)}
                    aria-pressed={isActiveOption}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className={styles.mobileFilterDivider} />
          <div className={styles.mobileFilterSection}>
            <span className={styles.mobileFilterLabel}>Search</span>
            <div className={desktopStyles.filterField}>
              <Search size={16} aria-hidden className={desktopStyles.filterFieldIcon} />
              <input
                type="search"
                className={desktopStyles.filterInput}
                placeholder="Search budget items..."
                value={filterQuery}
                onChange={(event) => onFilterQueryChange(event.target.value)}
                aria-label="Filter budget items"
              />
            </div>
          </div>
          <div className={styles.mobileFilterDivider} />
          <div className={styles.mobileFilterSection}>
            <span className={styles.mobileFilterLabel}>Sort</span>
            <div className={`${desktopStyles.filterField} ${desktopStyles.filterSelect}`}>
              <ArrowUpDown size={16} aria-hidden className={desktopStyles.filterFieldIcon} />
              <select
                className={desktopStyles.filterSelectControl}
                value={currentSortValue}
                onChange={handleSortChange}
                aria-label="Sort budget items"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden className={desktopStyles.filterSelectChevron} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BudgetMobileFilter;
