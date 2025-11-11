import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FC, type RefObject } from "react";
import { ArrowUpDown, ChevronDown, Filter, Search } from "lucide-react";

import desktopStyles from "./ProjectsPanelDesktop.module.css";
import mobileStyles from "@/dashboard/home/components/projects-panel.module.css";

export type TaskFilterOption = "due" | "completed" | "overdue" | "mine" | "all";

type TaskSortValue = "default" | "dueDate-asc" | "dueDate-desc" | "title-asc" | "title-desc";

type TaskFilterMenuProps = {
  filtersOpen: boolean;
  filtersRef: RefObject<HTMLDivElement>;
  filtersId: string;
  activeFilter: TaskFilterOption;
  onFilterChange: (filter: TaskFilterOption) => void;
  query: string;
  onQueryChange: (value: string) => void;
  toggleFilters: () => void;
  sortField: string | null;
  sortOrder: "asc" | "desc" | null;
  onSortChange: (field: string | null, order: "asc" | "desc" | null) => void;
  triggerLabel?: string;
  popoverAlign?: "start" | "end";
};

const FILTER_OPTIONS: Array<{ value: TaskFilterOption; label: string }> = [
  { value: "all", label: "All tasks" },
  { value: "due", label: "Due" },
  { value: "completed", label: "Completed" },
  { value: "overdue", label: "Overdue" },
  { value: "mine", label: "Mine" },
];

const SORT_OPTIONS: Array<{ 
  value: TaskSortValue; 
  label: string; 
  field: string | null; 
  order: "asc" | "desc" | null;
}> = [
  { value: "default", label: "Default order", field: null, order: null },
  { value: "dueDate-asc", label: "Due Date (Earliest)", field: "dueDate", order: "asc" },
  { value: "dueDate-desc", label: "Due Date (Latest)", field: "dueDate", order: "desc" },
  { value: "title-asc", label: "Title (A→Z)", field: "title", order: "asc" },
  { value: "title-desc", label: "Title (Z→A)", field: "title", order: "desc" },
];

export const TaskFilterMenu: FC<TaskFilterMenuProps> = ({
  filtersOpen,
  filtersRef,
  filtersId,
  activeFilter,
  onFilterChange,
  query,
  onQueryChange,
  toggleFilters,
  sortField,
  sortOrder,
  onSortChange,
  triggerLabel,
  popoverAlign = "end",
}) => {
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [activeSortIndex, setActiveSortIndex] = useState(0);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    onQueryChange(event.target.value);
  };

  const currentSortValue: TaskSortValue = 
    sortField && sortOrder ? `${sortField}-${sortOrder}` as TaskSortValue : "default";

  const currentSortLabel = SORT_OPTIONS.find(opt => opt.value === currentSortValue)?.label ?? "Default order";

  const buttonLabel = triggerLabel ?? FILTER_OPTIONS.find(f => f.value === activeFilter)?.label ?? "Filter";
  const popoverClassName =
    popoverAlign === "start"
      ? `${mobileStyles.filterPop} ${mobileStyles.filterPopStart}`
      : mobileStyles.filterPop;

  const isActive = 
    query.trim().length > 0 || 
    activeFilter !== "all" || 
    currentSortValue !== "default";

  const handleSortOptionClick = useCallback((option: typeof SORT_OPTIONS[0]) => {
    onSortChange(option.field, option.order);
    setSortDropdownOpen(false);
  }, [onSortChange]);

  const handleSortKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!sortDropdownOpen) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setSortDropdownOpen(true);
        setActiveSortIndex(SORT_OPTIONS.findIndex(opt => opt.value === currentSortValue));
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveSortIndex((prev) => Math.min(prev + 1, SORT_OPTIONS.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveSortIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        handleSortOptionClick(SORT_OPTIONS[activeSortIndex]);
        break;
      case "Escape":
        event.preventDefault();
        setSortDropdownOpen(false);
        break;
    }
  }, [sortDropdownOpen, activeSortIndex, currentSortValue, handleSortOptionClick]);

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!sortDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setSortDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [sortDropdownOpen]);

  return (
    <div className={mobileStyles.recentsWrap} ref={filtersRef}>
      <button
        type="button"
        className={`${mobileStyles.recents} ${isActive ? mobileStyles.recentsActive : ""}`}
        aria-expanded={filtersOpen}
        aria-haspopup="menu"
        aria-controls={filtersId}
        onClick={toggleFilters}
      >
        {buttonLabel} <ChevronDown size={14} aria-hidden />
      </button>
      {filtersOpen && (
        <div className={popoverClassName} role="menu" id={filtersId}>
          <div className={mobileStyles.filterSection}>
            {/* Quick Filter Buttons */}
            <span className={desktopStyles.filterLabel}>
              <Filter size={14} aria-hidden /> Quick filters
            </span>
            <div className={mobileStyles.scopeBtns} role="group" aria-label="Filter tasks">
              {FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`${mobileStyles.scopeBtn} ${
                    activeFilter === option.value ? mobileStyles.scopeBtnActive : ""
                  }`}
                  onClick={() => onFilterChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className={desktopStyles.filterField}>
              <Search size={16} aria-hidden className={desktopStyles.filterFieldIcon} />
              <input
                className={desktopStyles.filterInput}
                placeholder="Search tasks..."
                value={query}
                onChange={handleQueryChange}
                aria-label="Search tasks"
              />
            </div>

            {/* Sort Dropdown - Matches ProjectsFilterMenu */}
            <div className={desktopStyles.statusDropdown} ref={sortDropdownRef}>
              <button
                type="button"
                className={desktopStyles.statusTrigger}
                aria-haspopup="listbox"
                aria-expanded={sortDropdownOpen}
                aria-controls="sort-options-list"
                aria-activedescendant={sortDropdownOpen ? `sort-option-${activeSortIndex}` : undefined}
                onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
                onKeyDown={handleSortKeyDown}
              >
                <span className={desktopStyles.triggerLabel}>
                  <ArrowUpDown
                    size={16}
                    aria-hidden
                    className={desktopStyles.triggerLabelIcon}
                  />
                  <span className={desktopStyles.triggerLabelText}>{currentSortLabel}</span>
                </span>
                <ChevronDown size={14} aria-hidden className={desktopStyles.triggerChevron} />
              </button>
              {sortDropdownOpen && (
                <ul className={desktopStyles.statusOptions} role="listbox" id="sort-options-list">
                  {SORT_OPTIONS.map((option, index) => {
                    const isSelected = option.value === currentSortValue;
                    const isActiveOption = index === activeSortIndex;
                    return (
                      <li 
                        key={option.value} 
                        role="option" 
                        id={`sort-option-${index}`}
                        aria-selected={isSelected}
                      >
                        <button
                          type="button"
                          className={`${desktopStyles.statusOptionButton} ${
                            isSelected ? desktopStyles.statusOptionSelected : ""
                          } ${isActiveOption ? desktopStyles.statusOptionActive : ""}`}
                          onClick={() => handleSortOptionClick(option)}
                        >
                          {option.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
