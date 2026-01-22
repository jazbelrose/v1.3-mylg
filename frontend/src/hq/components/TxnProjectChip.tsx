import React from "react";
import { Link2Off, ExternalLink } from "lucide-react";
import ProjectAvatar from "@/shared/ui/ProjectAvatar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { HqTransactionAllocation } from "@/hq/types";
import type { Project } from "@/shared/utils/api";
import styles from "./TxnProjectChip.module.css";

export interface TxnProjectChipProps {
  allocations: HqTransactionAllocation[];
  /** Map of projectId → Project for hydration */
  projectsMap: Map<string, Project>;
  /** Show "Unlinked" chip when no allocations */
  showUnlinked?: boolean;
  /** Callback when "Open project" clicked */
  onOpenProject?: (projectId: string) => void;
  /** Callback when "View allocations" clicked */
  onViewAllocations?: () => void;
  /** Callback when "Unlink" clicked */
  onUnlink?: (projectId: string) => void;
  /** Whether unlink action is available */
  canUnlink?: boolean;
  className?: string;
}

const MAX_VISIBLE_AVATARS = 3;
const MAX_NAME_LENGTH = 20;

function truncateName(name: string, max = MAX_NAME_LENGTH): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + "…";
}

/**
 * TxnProjectChip - displays project(s) linked to a transaction.
 * - Single project: avatar + name
 * - Multiple projects: stacked avatars + "+N"
 * - No allocations: "Unlinked" chip with broken chain icon
 */
export const TxnProjectChip: React.FC<TxnProjectChipProps> = ({
  allocations,
  projectsMap,
  showUnlinked = true,
  onOpenProject,
  onViewAllocations,
  onUnlink,
  canUnlink = false,
  className,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  // Get unique project IDs from allocations
  const uniqueProjectIds = React.useMemo(() => {
    const ids = new Set<string>();
    allocations.forEach((a) => ids.add(a.projectId));
    return Array.from(ids);
  }, [allocations]);

  // No allocations → show "Unlinked" chip
  if (uniqueProjectIds.length === 0) {
    if (!showUnlinked) return null;
    return (
      <div className={[styles.chip, styles.chipUnlinked, className].filter(Boolean).join(" ")}>
        <Link2Off size={12} className={styles.unlinkIcon} />
        <span className={styles.unlinkLabel}>Unlinked</span>
      </div>
    );
  }

  // Get project details
  const projects = uniqueProjectIds
    .map((id) => projectsMap.get(id))
    .filter((p): p is Project => Boolean(p));

  // Single project case
  if (uniqueProjectIds.length === 1) {
    const project = projects[0];
    const projectId = uniqueProjectIds[0];
    const name = project?.title || projectId.slice(0, 8);

    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={[styles.chip, styles.chipLinked, className].filter(Boolean).join(" ")}
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen((prev) => !prev);
            }}
          >
            <ProjectAvatar
              thumb={project?.thumbnails?.[0]}
              name={name}
              className={styles.avatar}
            />
            <span className={styles.name}>{truncateName(name)}</span>
            <ExternalLink size={10} className={styles.externalIcon} />
          </button>
        </PopoverTrigger>
        <PopoverContent className={styles.popover} align="start">
          <div className={styles.popoverHeader}>
            <ProjectAvatar
              thumb={project?.thumbnails?.[0]}
              name={name}
              className={styles.popoverAvatar}
            />
            <span className={styles.popoverName}>{name}</span>
          </div>
          <div className={styles.popoverActions}>
            {onOpenProject && (
              <button
                type="button"
                className={styles.popoverAction}
                onClick={() => {
                  onOpenProject(projectId);
                  setIsOpen(false);
                }}
              >
                <ExternalLink size={14} />
                <span>Open project</span>
              </button>
            )}
            {onViewAllocations && (
              <button
                type="button"
                className={styles.popoverAction}
                onClick={() => {
                  onViewAllocations();
                  setIsOpen(false);
                }}
              >
                <span>View allocations</span>
              </button>
            )}
            {canUnlink && onUnlink && (
              <button
                type="button"
                className={[styles.popoverAction, styles.popoverActionDanger].join(" ")}
                onClick={() => {
                  onUnlink(projectId);
                  setIsOpen(false);
                }}
              >
                <Link2Off size={14} />
                <span>Unlink</span>
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  // Multiple projects case - stacked avatars
  const visibleProjects = projects.slice(0, MAX_VISIBLE_AVATARS);
  const moreCount = uniqueProjectIds.length - MAX_VISIBLE_AVATARS;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={[styles.chip, styles.chipMultiple, className].filter(Boolean).join(" ")}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
        >
          <div className={styles.avatarStack}>
            {visibleProjects.map((project, i) => (
              <ProjectAvatar
                key={project?.projectId || i}
                thumb={project?.thumbnails?.[0]}
                name={project?.title || ""}
                className={styles.stackedAvatar}
              />
            ))}
          </div>
          {moreCount > 0 && <span className={styles.moreCount}>+{moreCount}</span>}
          <span className={styles.multiLabel}>{uniqueProjectIds.length} projects</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className={styles.popover} align="start">
        <div className={styles.popoverTitle}>Linked to {uniqueProjectIds.length} projects</div>
        <div className={styles.popoverList}>
          {uniqueProjectIds.map((projectId) => {
            const project = projectsMap.get(projectId);
            const name = project?.title || projectId.slice(0, 8);
            return (
              <div key={projectId} className={styles.popoverListItem}>
                <ProjectAvatar
                  thumb={project?.thumbnails?.[0]}
                  name={name}
                  className={styles.popoverListAvatar}
                />
                <span className={styles.popoverListName}>{truncateName(name, 24)}</span>
                {onOpenProject && (
                  <button
                    type="button"
                    className={styles.popoverListAction}
                    onClick={() => {
                      onOpenProject(projectId);
                      setIsOpen(false);
                    }}
                    aria-label={`Open ${name}`}
                  >
                    <ExternalLink size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className={styles.popoverFooter}>
          {onViewAllocations && (
            <button
              type="button"
              className={styles.popoverAction}
              onClick={() => {
                onViewAllocations();
                setIsOpen(false);
              }}
            >
              View all allocations
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TxnProjectChip;
