import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, ChevronDown, Search, User } from "lucide-react";

import mobileStyles from "@/dashboard/home/components/projects-panel.module.css";
import desktopStyles from "@/dashboard/home/components/ProjectsPanelDesktop.module.css";
import styles from "@/dashboard/project/features/budget/components/BudgetToolbar.module.css";

type FilterOption = "due-week" | "coming-up" | "no-due" | "completed" | "overdue" | "mine" | "all";

type SortOptionValue = "default" | "dueDate-asc" | "dueDate-desc" | "title-asc" | "title-desc";

type SortOption = {
  value: SortOptionValue;
  label: string;
  field: string | null;
  order: "asc" | "desc" | null;
};

const SORT_OPTIONS: SortOption[] = [
  { value: "default", label: "Default order", field: null, order: null },
  { value: "dueDate-asc", label: "Due Date (Earliest)", field: "dueDate", order: "asc" },
  { value: "dueDate-desc", label: "Due Date (Latest)", field: "dueDate", order: "desc" },
  { value: "title-asc", label: "Title (A→Z)", field: "title", order: "asc" },
  { value: "title-desc", label: "Title (Z→A)", field: "title", order: "desc" },
];

interface FilterButtonConfig {
  value: FilterOption;
  label: string;
}

const FILTER_BUTTONS: FilterButtonConfig[] = [
  { value: "due-week", label: "Due this week" },
  { value: "coming-up", label: "Coming up" },
  { value: "no-due", label: "No due date" },
  { value: "completed", label: "Completed" },
];

const QUICK_FILTERS: FilterButtonConfig[] = [
  { value: "mine", label: "Mine" },
  { value: "overdue", label: "Overdue" },
];

interface TaskMobileFilterProps {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  sortField: string | null;
  sortOrder: "asc" | "desc" | null;
  onSortChange: (field: string | null, order: "asc" | "desc" | null) => void;
  activeFilter: FilterOption;
  onFilterChange: (filter: FilterOption) => void;
  assigneeFilter: string | null;
  onAssigneeFilterChange: (assigneeId: string | null) => void;
  statusFilter: string | null;
  onStatusFilterChange: (status: string | null) => void;
  assigneeOptions?: Array<{ id: string; name: string }>;
}

const TaskMobileFilter: React.FC<TaskMobileFilterProps> = ({
  searchQuery,
  onSearchQueryChange,
  sortField,
  sortOrder,
  onSortChange,
  activeFilter,
  onFilterChange,
  assigneeFilter,
  onAssigneeFilterChange,
  assigneeOptions = [],
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

  const isActive =
    searchQuery.trim().length > 0 ||
    currentSortValue !== "default" ||
    activeFilter !== "all" ||
    assigneeFilter !== null;

  const filterButtonLabel = activeFilter !== "all" 
    ? FILTER_BUTTONS.find(f => f.value === activeFilter)?.label || 
      QUICK_FILTERS.find(f => f.value === activeFilter)?.label || 
      "Filter"
    : "Filter";

  const handleSortChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value as SortOptionValue;
    const option = SORT_OPTIONS.find((opt) => opt.value === nextValue) ?? SORT_OPTIONS[0];
    onSortChange(option.field, option.order);
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
        aria-label="Filter tasks"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
      >
        <span className={styles.mobileFilterButtonText}>{filterButtonLabel}</span>
      </button>
      {open && (
        <div
          className={`${mobileStyles.filterPop} ${mobileStyles.filterPopStart} ${styles.mobileFilterPopover}`}
          role="menu"
        >
          <div className={styles.mobileFilterSection}>
            <span className={styles.mobileFilterLabel}>Quick filters</span>
            <div
              className={styles.mobileFilterGroup}
              role="group"
              aria-label="Filter tasks by time period"
            >
              {FILTER_BUTTONS.map((option) => {
                const isActiveOption = option.value === activeFilter;
                const className = isActiveOption
                  ? `${styles.mobileFilterGroupButton} ${styles.mobileFilterGroupButtonActive}`
                  : styles.mobileFilterGroupButton;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={className}
                    onClick={() => onFilterChange(option.value)}
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
            <span className={styles.mobileFilterLabel}>Other filters</span>
            <div
              className={styles.mobileFilterGroup}
              role="group"
              aria-label="Additional task filters"
            >
              {QUICK_FILTERS.map((option) => {
                const isActiveOption = option.value === activeFilter;
                const className = isActiveOption
                  ? `${styles.mobileFilterGroupButton} ${styles.mobileFilterGroupButtonActive}`
                  : styles.mobileFilterGroupButton;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={className}
                    onClick={() => onFilterChange(option.value)}
                    aria-pressed={isActiveOption}
                  >
                    {option.label}
                  </button>
                );
              })}
              <button
                type="button"
                className={
                  activeFilter === "all"
                    ? `${styles.mobileFilterGroupButton} ${styles.mobileFilterGroupButtonActive}`
                    : styles.mobileFilterGroupButton
                }
                onClick={() => onFilterChange("all")}
                aria-pressed={activeFilter === "all"}
              >
                All tasks
              </button>
            </div>
          </div>
          {assigneeOptions.length > 0 && (
            <>
              <div className={styles.mobileFilterDivider} />
              <div className={styles.mobileFilterSection}>
                <span className={styles.mobileFilterLabel}>Assignee</span>
                <div className={`${desktopStyles.filterField} ${desktopStyles.filterSelect}`}>
                  <User size={16} aria-hidden className={desktopStyles.filterFieldIcon} />
                  <select
                    className={desktopStyles.filterSelectControl}
                    value={assigneeFilter || ""}
                    onChange={(e) => onAssigneeFilterChange(e.target.value || null)}
                    aria-label="Filter by assignee"
                  >
                    <option value="">All assignees</option>
                    {assigneeOptions.map((assignee) => (
                      <option key={assignee.id} value={assignee.id}>
                        {assignee.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} aria-hidden className={desktopStyles.filterSelectChevron} />
                </div>
              </div>
            </>
          )}
          <div className={styles.mobileFilterDivider} />
          <div className={styles.mobileFilterSection}>
            <span className={styles.mobileFilterLabel}>Search</span>
            <div className={desktopStyles.filterField}>
              <Search size={16} aria-hidden className={desktopStyles.filterFieldIcon} />
              <input
                type="search"
                className={desktopStyles.filterInput}
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                aria-label="Search tasks"
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
                aria-label="Sort tasks"
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

export default TaskMobileFilter;
export type { FilterOption };
