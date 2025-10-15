import type { ChangeEvent, FC, RefObject } from "react";

import { CalendarDays, ChevronDown, Search } from "lucide-react";

import desktopStyles from "./ProjectsPanelDesktop.module.css";
import mobileStyles from "@/dashboard/home/components/projects-panel.module.css";
import type { DropdownHelpers, DropdownOption } from "./hooks/useDropdown";
import type { SortOption } from "./hooks/useProjectFilters";

type ProjectsFilterMenuProps = {
  filtersOpen: boolean;
  filtersRef: RefObject<HTMLDivElement>;
  filtersId: string;
  scope: "recents" | "all";
  onScopeChange: (scope: "recents" | "all") => void;
  query: string;
  onQueryChange: (value: string) => void;
  toggleFilters: () => void;
  statusOptions: DropdownOption<string>[];
  statusTriggerLabel: string;
  statusDropdown: DropdownHelpers<string>;
  showStatusDropdown: boolean;
  sortOptions: DropdownOption<SortOption>[];
  sortTriggerLabel: string;
  sortDropdown: DropdownHelpers<SortOption>;
  triggerLabel?: string;
  showScopeSelector?: boolean;
  popoverAlign?: "start" | "end";
};

export const ProjectsFilterMenu: FC<ProjectsFilterMenuProps> = ({
  filtersOpen,
  filtersRef,
  filtersId,
  scope,
  onScopeChange,
  query,
  onQueryChange,
  toggleFilters,
  statusOptions,
  statusTriggerLabel,
  statusDropdown,
  showStatusDropdown,
  sortOptions,
  sortTriggerLabel,
  sortDropdown,
  triggerLabel,
  showScopeSelector = true,
  popoverAlign = "end",
}) => {
  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    onQueryChange(event.target.value);
  };

  const buttonLabel = triggerLabel ?? (scope === "recents" ? "Recents" : "All projects");
  const popoverClassName =
    popoverAlign === "start"
      ? `${mobileStyles.filterPop} ${mobileStyles.filterPopStart}`
      : mobileStyles.filterPop;

  return (
    <div className={mobileStyles.recentsWrap} ref={filtersRef}>
      <button
        type="button"
        className={mobileStyles.recents}
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
            {showScopeSelector && (
              <div className={mobileStyles.scopeBtns} role="group" aria-label="Scope">
                <button
                  type="button"
                  className={`${mobileStyles.scopeBtn} ${
                    scope === "recents" ? mobileStyles.scopeBtnActive : ""
                  }`}
                  onClick={() => onScopeChange("recents")}
                >
                  Recents
                </button>
                <button
                  type="button"
                  className={`${mobileStyles.scopeBtn} ${
                    scope === "all" ? mobileStyles.scopeBtnActive : ""
                  }`}
                  onClick={() => onScopeChange("all")}
                >
                  All projects
                </button>
              </div>
            )}

            <div className={desktopStyles.filterField}>
              <Search size={16} aria-hidden className={desktopStyles.filterFieldIcon} />
              <input
                className={desktopStyles.filterInput}
                placeholder="Filter by title..."
                value={query}
                onChange={handleQueryChange}
                aria-label="Filter projects by title"
              />
            </div>

            {showStatusDropdown && (
              <div className={desktopStyles.statusDropdown} ref={statusDropdown.dropdownRef}>
                <button
                  type="button"
                  className={desktopStyles.statusTrigger}
                  aria-haspopup="listbox"
                  aria-expanded={statusDropdown.isOpen}
                  aria-controls={statusDropdown.listId}
                  aria-activedescendant={statusDropdown.activeOptionId}
                  onClick={statusDropdown.toggle}
                  onKeyDown={statusDropdown.handleTriggerKeyDown}
                >
                  <span className={desktopStyles.triggerLabel}>
                    <span className={desktopStyles.triggerLabelText}>{statusTriggerLabel}</span>
                  </span>
                  <ChevronDown size={14} aria-hidden className={desktopStyles.triggerChevron} />
                </button>
                {statusDropdown.isOpen && (
                  <ul className={desktopStyles.statusOptions} role="listbox" id={statusDropdown.listId}>
                    {statusOptions.map((option, index) => {
                      const { id, isSelected, isActive } = statusDropdown.getOptionRenderState(
                        option,
                        index
                      );
                      const buttonProps = statusDropdown.getOptionButtonProps(option, index);
                      return (
                        <li key={`${option.value || "all"}-${index}`} role="option" id={id} aria-selected={isSelected}>
                          <button
                            {...buttonProps}
                            className={`${desktopStyles.statusOptionButton} ${
                              isSelected ? desktopStyles.statusOptionSelected : ""
                            } ${isActive ? desktopStyles.statusOptionActive : ""}`}
                          >
                            {option.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            <div className={desktopStyles.statusDropdown} ref={sortDropdown.dropdownRef}>
              <button
                type="button"
                className={desktopStyles.statusTrigger}
                aria-haspopup="listbox"
                aria-expanded={sortDropdown.isOpen}
                aria-controls={sortDropdown.listId}
                aria-activedescendant={sortDropdown.activeOptionId}
                onClick={sortDropdown.toggle}
                onKeyDown={sortDropdown.handleTriggerKeyDown}
              >
                <span className={desktopStyles.triggerLabel}>
                  <CalendarDays
                    size={16}
                    aria-hidden
                    className={desktopStyles.triggerLabelIcon}
                  />
                  <span className={desktopStyles.triggerLabelText}>{sortTriggerLabel}</span>
                </span>
                <ChevronDown size={14} aria-hidden className={desktopStyles.triggerChevron} />
              </button>
              {sortDropdown.isOpen && (
                <ul className={desktopStyles.statusOptions} role="listbox" id={sortDropdown.listId}>
                  {sortOptions.map((option, index) => {
                    const { id, isSelected, isActive } = sortDropdown.getOptionRenderState(
                      option,
                      index
                    );
                    const buttonProps = sortDropdown.getOptionButtonProps(option, index);
                    return (
                      <li key={`${option.value}-${index}`} role="option" id={id} aria-selected={isSelected}>
                        <button
                          {...buttonProps}
                          className={`${desktopStyles.statusOptionButton} ${
                            isSelected ? desktopStyles.statusOptionSelected : ""
                          } ${isActive ? desktopStyles.statusOptionActive : ""}`}
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












