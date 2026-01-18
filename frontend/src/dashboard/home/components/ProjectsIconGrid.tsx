import { useCallback, type FC, type KeyboardEvent as ReactKeyboardEvent, type DragEvent as ReactDragEvent } from "react";
import { Pin } from "lucide-react";
import Squircle from "@/shared/ui/Squircle";
import { getFileUrl } from "@/shared/utils/api";
import { getColor } from "@/shared/utils/colorUtils";
import type { ProjectWithMeta } from "../utils/types";
import styles from "./ProjectsIconGrid.module.css";

export type IconSize = "S" | "M" | "L";

type ProjectsIconGridProps = {
  projects: ProjectWithMeta[];
  isLoading: boolean;
  projectsError: boolean;
  onOpenProject: (projectId: string) => void;
  onImageError: (projectId: string) => void;
  imgError: Record<string, boolean>;
  onPinToggle: (project: ProjectWithMeta) => void;
  size: IconSize;
  // Drag-and-drop for pinned reordering
  draggedProjectId?: string | null;
  dragOverProjectId?: string | null;
  onTileDragStart?: (projectId: string) => (event: ReactDragEvent<HTMLDivElement>) => void;
  onTileDragOver?: (projectId: string) => (event: ReactDragEvent<HTMLDivElement>) => void;
  onTileDragLeave?: (projectId: string) => () => void;
  onTileDrop?: (project: ProjectWithMeta) => (event: ReactDragEvent<HTMLDivElement>) => void;
  onTileDragEnd?: () => void;
};

const ProjectsIconGrid: FC<ProjectsIconGridProps> = ({
  projects,
  isLoading,
  projectsError,
  onOpenProject,
  onImageError,
  imgError,
  onPinToggle,
  size,
  draggedProjectId,
  dragOverProjectId,
  onTileDragStart,
  onTileDragOver,
  onTileDragLeave,
  onTileDrop,
  onTileDragEnd,
}) => {
  const sizeClass = size === "S" ? styles.gridS : size === "L" ? styles.gridL : styles.gridM;
  const isDragEnabled = Boolean(onTileDragStart && onTileDrop);

  const handleTileKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>, projectId: string) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpenProject(projectId);
      }
    },
    [onOpenProject],
  );

  const handlePinClick = useCallback(
    (event: React.MouseEvent, project: ProjectWithMeta) => {
      event.stopPropagation();
      onPinToggle(project);
    },
    [onPinToggle],
  );

  const getInitials = useCallback((title: string) => {
    const words = title.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return title.slice(0, 2).toUpperCase();
  }, []);

  const getStatusLabel = useCallback((status: unknown): string | null => {
    if (status == null) return null;
    const num = typeof status === "number" ? status : parseInt(String(status), 10);
    if (!Number.isNaN(num) && num >= 0 && num <= 100) {
      return `${num}%`;
    }
    return null;
  }, []);

  const getDueLabel = useCallback((finishline: string | undefined): string | null => {
    if (!finishline) return null;
    const d = new Date(finishline);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, { month: "short", day: "numeric" });
  }, []);

  const errorText = projectsError ? "Failed to load projects." : undefined;

  if (errorText) {
    return (
      <div className={`${styles.grid} ${sizeClass}`}>
        <div className={styles.empty}>
          <span>{errorText}</span>
        </div>
      </div>
    );
  }

  if (isLoading && projects.length === 0) {
    return (
      <div className={`${styles.grid} ${sizeClass}`}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={styles.skeleton} />
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className={`${styles.grid} ${sizeClass}`}>
        <div className={styles.empty}>
          <span>No projects match filters</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.grid} ${sizeClass}`} role="grid" aria-label="Projects grid">
      {projects.map((project) => {
        const thumb = Array.isArray(project.thumbnails) && project.thumbnails[0] ? project.thumbnails[0] : undefined;
        const hasError = imgError[project.projectId];
        const showImage = thumb && !hasError;
        const projectColor = (project as unknown as { color?: string }).color || getColor(project.projectId);
        const unreadCount = project.unreadCount ?? 0;
        const statusLabel = getStatusLabel(project.status);
        const dueLabel = getDueLabel(project.finishline);

        // Determine meta content (pick 1-2)
        const metaParts: string[] = [];
        if (statusLabel) metaParts.push(statusLabel);
        if (dueLabel && metaParts.length < 2) metaParts.push(dueLabel);

        // Drag state for this tile
        const isDragging = draggedProjectId === project.projectId;
        const isDragOver = dragOverProjectId === project.projectId && draggedProjectId !== project.projectId;
        const canDrag = isDragEnabled && project.pinned;

        return (
          <div
            key={project.projectId}
            className={[
              styles.tile,
              project.pinned ? styles.tilePinned : "",
              isDragging ? styles.tileDragging : "",
              isDragOver ? styles.tileDragOver : "",
            ].filter(Boolean).join(" ")}
            role="gridcell"
            tabIndex={0}
            draggable={canDrag}
            onClick={() => onOpenProject(project.projectId)}
            onKeyDown={(e) => handleTileKeyDown(e, project.projectId)}
            onDragStart={canDrag && onTileDragStart ? onTileDragStart(project.projectId) : undefined}
            onDragOver={canDrag && onTileDragOver ? onTileDragOver(project.projectId) : undefined}
            onDragLeave={canDrag && onTileDragLeave ? onTileDragLeave(project.projectId) : undefined}
            onDrop={canDrag && onTileDrop ? onTileDrop(project) : undefined}
            onDragEnd={canDrag ? onTileDragEnd : undefined}
            title={project.title}
          >
            {/* Pin indicator (always visible when pinned) */}
            {project.pinned && (
              <div className={styles.pinIndicator} aria-label="Pinned">
                <Pin size={12} />
              </div>
            )}

            {/* Hover actions */}
            <div className={styles.hoverActions}>
              <button
                type="button"
                className={[styles.actionBtn, project.pinned ? styles.actionBtnActive : ""].filter(Boolean).join(" ")}
                onClick={(e) => handlePinClick(e, project)}
                aria-label={project.pinned ? "Unpin project" : "Pin project"}
                title={project.pinned ? "Unpin" : "Pin"}
              >
                <Pin size={12} />
              </button>
            </div>

            {/* Icon */}
            <div className={styles.iconWrap}>
              {showImage ? (
                <Squircle
                  as="span"
                  className={styles.icon}
                  radius={14}
                  style={{ overflow: "hidden", display: "block" }}
                >
                  <img
                    src={getFileUrl(thumb)}
                    alt={project.title}
                    className={styles.icon}
                    loading="lazy"
                    onError={() => onImageError(project.projectId)}
                    draggable={false}
                  />
                </Squircle>
              ) : (
                <div
                  className={styles.iconFallback}
                  style={{ background: `linear-gradient(135deg, ${projectColor}22, ${projectColor}11)` }}
                >
                  {getInitials(project.title)}
                </div>
              )}

              {/* Unread badge */}
              {unreadCount > 0 && (
                <span className={styles.unreadBadge} aria-label={`${unreadCount} unread`}>
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>

            {/* Label */}
            <div className={styles.labelWrap}>
              <span className={styles.name}>{project.title}</span>
              {metaParts.length > 0 && (
                <span className={`${styles.meta} ${size === "S" ? styles.metaHidden : ""}`}>
                  {metaParts.join(" • ")}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ProjectsIconGrid;
