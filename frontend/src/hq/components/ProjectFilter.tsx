import React from "react";
import { Search, X, Link2, Link2Off, Clock, ChevronDown } from "lucide-react";
import ProjectAvatar from "@/shared/ui/ProjectAvatar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { Project } from "@/shared/utils/api";
import styles from "./ProjectFilter.module.css";

export type ProjectFilterValue =
  | { type: "all" }
  | { type: "linked" }
  | { type: "unlinked" }
  | { type: "project"; projectId: string };

export interface ProjectFilterProps {
  value: ProjectFilterValue;
  onChange: (value: ProjectFilterValue) => void;
  projects: Project[];
  /** Recent project IDs (most recently used) */
  recentProjectIds?: string[];
  className?: string;
}

const MAX_RECENT = 5;
const MAX_NAME_DISPLAY = 18;

function truncateName(name: string, max = MAX_NAME_DISPLAY): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + "…";
}

/**
 * ProjectFilter - Searchable project filter dropdown for HQ transactions.
 * Supports: All, Linked only, Unlinked only, specific project selection.
 */
export const ProjectFilter: React.FC<ProjectFilterProps> = ({
  value,
  onChange,
  projects,
  recentProjectIds = [],
  className,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement>(null);

  // Build project map for quick lookup
  const projectsMap = React.useMemo(() => {
    const map = new Map<string, Project>();
    projects.forEach((p) => map.set(p.projectId, p));
    return map;
  }, [projects]);

  // Filter projects by search
  const filteredProjects = React.useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter(
      (p) => p.title?.toLowerCase().includes(q) || p.projectId.toLowerCase().includes(q)
    );
  }, [projects, search]);

  // Get recent projects
  const recentProjects = React.useMemo(() => {
    return recentProjectIds
      .slice(0, MAX_RECENT)
      .map((id) => projectsMap.get(id))
      .filter((p): p is Project => Boolean(p));
  }, [recentProjectIds, projectsMap]);

  // Get display text for current value
  const getDisplayText = (): { label: string; project?: Project } => {
    switch (value.type) {
      case "all":
        return { label: "All projects" };
      case "linked":
        return { label: "Linked only" };
      case "unlinked":
        return { label: "Unlinked only" };
      case "project": {
        const project = projectsMap.get(value.projectId);
        return { label: project?.title || value.projectId.slice(0, 8), project };
      }
    }
  };

  const display = getDisplayText();
  const hasSelection = value.type === "project";

  const handleSelect = (newValue: ProjectFilterValue) => {
    onChange(newValue);
    setIsOpen(false);
    setSearch("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange({ type: "all" });
  };

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={[
            styles.trigger,
            hasSelection ? styles.triggerSelected : "",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label="Filter by project"
        >
          {display.project ? (
            <>
              <ProjectAvatar
                thumb={display.project.thumbnails?.[0]}
                name={display.project.title || ""}
                className={styles.triggerAvatar}
              />
              <span className={styles.triggerName}>{truncateName(display.label)}</span>
            </>
          ) : (
            <>
              <span className={styles.triggerLabel}>Project</span>
              <span className={styles.triggerValue}>{display.label}</span>
            </>
          )}
          {hasSelection ? (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={handleClear}
              aria-label="Clear project filter"
            >
              <X size={12} />
            </button>
          ) : (
            <ChevronDown size={14} className={styles.chevron} />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent className={styles.content} align="start">
        {/* Search input */}
        <div className={styles.searchBox}>
          <Search size={14} className={styles.searchIcon} />
          <input
            ref={searchRef}
            type="text"
            className={styles.searchInput}
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => {
                setSearch("");
                searchRef.current?.focus();
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className={styles.body}>
          {/* Quick options */}
          {!search && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Quick filters</div>
              <button
                type="button"
                className={[
                  styles.option,
                  value.type === "all" ? styles.optionSelected : "",
                ].join(" ")}
                onClick={() => handleSelect({ type: "all" })}
              >
                <span className={styles.optionLabel}>All projects</span>
              </button>
              <button
                type="button"
                className={[
                  styles.option,
                  value.type === "linked" ? styles.optionSelected : "",
                ].join(" ")}
                onClick={() => handleSelect({ type: "linked" })}
              >
                <Link2 size={14} className={styles.optionIcon} />
                <span className={styles.optionLabel}>Linked only</span>
              </button>
              <button
                type="button"
                className={[
                  styles.option,
                  value.type === "unlinked" ? styles.optionSelected : "",
                ].join(" ")}
                onClick={() => handleSelect({ type: "unlinked" })}
              >
                <Link2Off size={14} className={styles.optionIcon} />
                <span className={styles.optionLabel}>Unlinked only</span>
              </button>
            </div>
          )}

          {/* Recent projects */}
          {!search && recentProjects.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                <Clock size={12} className={styles.sectionIcon} />
                Recent
              </div>
              {recentProjects.map((project) => (
                <button
                  key={project.projectId}
                  type="button"
                  className={[
                    styles.option,
                    styles.optionProject,
                    value.type === "project" && value.projectId === project.projectId
                      ? styles.optionSelected
                      : "",
                  ].join(" ")}
                  onClick={() =>
                    handleSelect({ type: "project", projectId: project.projectId })
                  }
                >
                  <ProjectAvatar
                    thumb={project.thumbnails?.[0]}
                    name={project.title || ""}
                    className={styles.optionAvatar}
                  />
                  <span className={styles.optionLabel}>
                    {truncateName(project.title || project.projectId, 24)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* All projects / search results */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>
              {search ? `Results (${filteredProjects.length})` : "All projects"}
            </div>
            <div className={styles.projectList}>
              {filteredProjects.length === 0 ? (
                <div className={styles.emptyState}>No projects found</div>
              ) : (
                filteredProjects.map((project) => (
                  <button
                    key={project.projectId}
                    type="button"
                    className={[
                      styles.option,
                      styles.optionProject,
                      value.type === "project" && value.projectId === project.projectId
                        ? styles.optionSelected
                        : "",
                    ].join(" ")}
                    onClick={() =>
                      handleSelect({ type: "project", projectId: project.projectId })
                    }
                  >
                    <ProjectAvatar
                      thumb={project.thumbnails?.[0]}
                      name={project.title || ""}
                      className={styles.optionAvatar}
                    />
                    <span className={styles.optionLabel}>
                      {truncateName(project.title || project.projectId, 28)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ProjectFilter;
