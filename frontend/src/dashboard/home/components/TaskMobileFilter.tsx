import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, ChevronDown, Search, User } from "lucide-react";

import mobileStyles from "@/dashboard/home/components/projects-panel.module.css";
import desktopStyles from "@/dashboard/home/components/ProjectsPanelDesktop.module.css";
import styles from "@/dashboard/project/features/budget/components/BudgetToolbar.module.css";

type FilterOption = "due" | "completed" | "overdue" | "mine" | "all";

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
  { value: "due", label: "Due" },
  { value: "completed", label: "Completed" },
  { value: "overdue", label: "Overdue" },
  { value: "mine", label: "Mine" },
];

interface TaskMobileFilterProps {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  sortField: string | null;
  sortOrder: "asc" | "desc" | null;
  onSortChange: (field: string | null, order: "asc" | "desc" | null) => void;
  activeFilter: FilterOption;
  onFilterChange: (filter: FilterOption) => void;
  statusFilter: string | null;
  onStatusFilterChange: (status: string | null) => void;
  assignedByFilter: string | null;
  onAssignedByFilterChange: (filterValue: string | null) => void;
  assignedByOptions?: Array<{ id: string; name: string }>;
  assignedToFilter: string | null;
  onAssignedToFilterChange: (filterValue: string | null) => void;
  assignedToOptions?: Array<{ id: string; name: string }>;
}

const TaskMobileFilter: React.FC<TaskMobileFilterProps> = ({
  searchQuery,
  onSearchQueryChange,
  sortField,
  sortOrder,
  onSortChange,
  activeFilter,
  onFilterChange,
  assignedByFilter,
  onAssignedByFilterChange,
  assignedByOptions = [],
  assignedToFilter,
  onAssignedToFilterChange,
  assignedToOptions = [],
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
    assignedByFilter !== null ||
    assignedToFilter !== null;

  const filterButtonLabel = activeFilter !== "all" 
    ? FILTER_BUTTONS.find(f => f.value === activeFilter)?.label || "Filter"
    : "Filter";

  const defaultAssignmentTab: "assignedTo" | "assignedBy" =
    assignedToOptions.length > 0
      ? "assignedTo"
      : assignedByOptions.length > 0
        ? "assignedBy"
        : "assignedTo";
  const [activeAssignmentTab, setActiveAssignmentTab] = useState<"assignedTo" | "assignedBy">(
    defaultAssignmentTab,
  );

  const assignmentConfig = useMemo(() => {
    const isAssignedTo = activeAssignmentTab === "assignedTo";
    const options = isAssignedTo ? assignedToOptions : assignedByOptions;
    const value = isAssignedTo ? assignedToFilter : assignedByFilter;
    const onChange = isAssignedTo ? onAssignedToFilterChange : onAssignedByFilterChange;
    const placeholder = isAssignedTo ? "All assigned to" : "All assigned by";
    const ariaLabel = isAssignedTo ? "Filter tasks by assignee" : "Filter tasks by creator";
    return { isAssignedTo, options, value, onChange, placeholder, ariaLabel };
  }, [
    activeAssignmentTab,
    assignedByFilter,
    assignedByOptions,
    assignedToFilter,
    assignedToOptions,
    onAssignedByFilterChange,
    onAssignedToFilterChange,
  ]);

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
              aria-label="Filter tasks"
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
                All
              </button>
            </div>
          </div>
          {(assignedByOptions.length > 0 || assignedToOptions.length > 0) && (
            <>
              <div className={styles.mobileFilterDivider} />
              <div className={styles.mobileFilterSection}>
                <span className={styles.mobileFilterLabel}>Assignment</span>
                <div className={styles.mobileFilterGroup}>
                  <button
                    type="button"
                    className={
                      activeAssignmentTab === "assignedTo"
                        ? `${styles.mobileFilterGroupButton} ${styles.mobileFilterGroupButtonActive}`
                        : styles.mobileFilterGroupButton
                    }
                    onClick={() => setActiveAssignmentTab("assignedTo")}
                    disabled={assignedToOptions.length === 0}
                  >
                    Assigned to
                  </button>
                  <button
                    type="button"
                    className={
                      activeAssignmentTab === "assignedBy"
                        ? `${styles.mobileFilterGroupButton} ${styles.mobileFilterGroupButtonActive}`
                        : styles.mobileFilterGroupButton
                    }
                    onClick={() => setActiveAssignmentTab("assignedBy")}
                    disabled={assignedByOptions.length === 0}
                  >
                    Assigned by
                  </button>
                </div>
                <div className={`${desktopStyles.filterField} ${desktopStyles.filterSelect}`}>
                  <User size={16} aria-hidden className={desktopStyles.filterFieldIcon} />
                  <select
                    className={desktopStyles.filterSelectControl}
                    value={assignmentConfig.value || ""}
                    onChange={(event) =>
                      assignmentConfig.onChange(event.target.value || null)
                    }
                    aria-label={assignmentConfig.ariaLabel}
                  >
                    <option value="">{assignmentConfig.placeholder}</option>
                    {assignmentConfig.options.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
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
