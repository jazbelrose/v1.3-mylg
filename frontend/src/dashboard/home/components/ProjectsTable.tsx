import type {
  FC,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";

import desktopStyles from "./ProjectsPanelDesktop.module.css";
import mobileStyles from "@/dashboard/home/components/projects-panel.module.css";
import SVGThumbnail from "@/dashboard/home/components/SvgThumbnail";
import Squircle from "@/shared/ui/Squircle";
import { getFileUrl } from "@/shared/utils/api";
import { Pin, PinOff } from "lucide-react";
import type { UserLite } from "@/app/contexts/DataProvider";
import type { ProjectWithMeta } from "../utils/types";
import { formatShortDate } from "../utils/utils";

type ProjectsTableProps = {
  projects: ProjectWithMeta[];
  isLoading: boolean;
  projectsError: boolean;
  onOpenProject: (projectId: string) => void;
  onImageError: (projectId: string) => void;
  imgError: Record<string, boolean>;
  usersById: Map<string, UserLite>;
  draggedProjectId: string | null;
  dragOverProjectId: string | null;
  onPinToggle: (project: ProjectWithMeta) => void;
  onRowDragStart: (projectId: string) => (event: ReactDragEvent<HTMLTableRowElement>) => void;
  onRowDragOver: (projectId: string) => (event: ReactDragEvent<HTMLTableRowElement>) => void;
  onRowDragLeave: (projectId: string) => () => void;
  onRowDrop: (project: ProjectWithMeta) => (event: ReactDragEvent<HTMLTableRowElement>) => void;
  onRowDragEnd: () => void;
  onTableDragOver: (event: ReactDragEvent<HTMLTableSectionElement>) => void;
  onTableDrop: (event: ReactDragEvent<HTMLTableSectionElement>) => void;
};

const getOwnerName = (project: ProjectWithMeta, usersById: Map<string, UserLite>): string => {
  // Prefer ownerId if set, otherwise fall back to first team member
  const ownerId = (project as { ownerId?: string }).ownerId;
  const team = Array.isArray(project.team) ? project.team : [];
  
  let targetUserId: string | undefined;
  if (ownerId) {
    targetUserId = ownerId;
  } else if (team.length > 0) {
    targetUserId = team[0]?.userId;
  }
  
  if (!targetUserId) return "—";
  
  const user = usersById.get(targetUserId);
  const teamMember = team.find(m => m.userId === targetUserId);
  
  const first = user?.firstName ?? teamMember?.firstName ?? "";
  const last = user?.lastName ?? teamMember?.lastName ?? "";
  const full = `${first} ${last}`.trim();
  if (full) return full;
  return user?.email || user?.username || teamMember?.email || targetUserId || "—";
};

const ProjectsTable: FC<ProjectsTableProps> = ({
  projects,
  isLoading,
  projectsError,
  onOpenProject,
  onImageError,
  imgError,
  usersById,
  draggedProjectId,
  dragOverProjectId,
  onPinToggle,
  onRowDragStart,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
  onRowDragEnd,
  onTableDragOver,
  onTableDrop,
}) => {
  const handleRowKeyDown = (
    event: ReactKeyboardEvent<HTMLTableRowElement>,
    projectId: string
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenProject(projectId);
    }
  };

  const errorText = projectsError ? "Failed to load projects." : undefined;

  if (errorText) {
    return <div className={desktopStyles.errorState}>{errorText}</div>;
  }

  const skeletonRows = Array.from({ length: 5 });

  return (
    <div className={desktopStyles.tableWrap}>
      {isLoading ? (
        <div className={desktopStyles.tableSkeleton} aria-hidden>
          <div className={desktopStyles.skeletonHead}>
            <div className={desktopStyles.skeletonHeadCol} />
            <div className={desktopStyles.skeletonHeadCol} />
            <div className={desktopStyles.skeletonHeadCol} />
            <div className={desktopStyles.skeletonHeadCol} />
            <div className={desktopStyles.skeletonHeadCol} />
            <div className={desktopStyles.skeletonHeadCol} />
          </div>
          {skeletonRows.map((_, index) => (
            <div className={desktopStyles.skeletonRow} key={index}>
              <div className={desktopStyles.skeletonProject}>
                <div className={desktopStyles.skeletonThumb} />
                <div className={desktopStyles.skeletonLine} />
              </div>
              <div className={desktopStyles.skeletonBadge} />
              <div className={desktopStyles.skeletonLineShort} />
              <div className={desktopStyles.skeletonLine} />
              <div className={desktopStyles.skeletonPill} />
              <div className={desktopStyles.skeletonPin} />
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className={desktopStyles.emptyState}>No projects match filters.</div>
      ) : (
        <table className={desktopStyles.table} aria-label="Projects table">
          <thead>
            <tr>
              <th scope="col">Project</th>
              <th scope="col">Status</th>
              <th scope="col">Deadline</th>
              <th scope="col">Owner</th>
              <th scope="col">Unread</th>
              <th scope="col">Pin</th>
            </tr>
          </thead>
          <tbody onDragOver={onTableDragOver} onDrop={onTableDrop}>
            {projects.map((project) => {
              const id = project.projectId;
              const title = (project.title || "Untitled project").trim();
              const thumb =
                Array.isArray(project.thumbnails) && project.thumbnails[0]
                  ? project.thumbnails[0]
                  : undefined;
              const deadline = formatShortDate(project.finishline);
              const status = project.status ? String(project.status) : "-";
              const unread = Number.isFinite(project.unreadCount as number)
                ? Number(project.unreadCount)
                : Number((project as { unreadCount?: number }).unreadCount ?? 0);
              const owner = getOwnerName(project, usersById);
              const isPinned = Boolean(project.pinned);
              const rowClasses = [
                draggedProjectId === id ? desktopStyles.rowDragging : "",
                dragOverProjectId === id ? desktopStyles.rowDragOver : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <tr
                  key={id}
                  className={rowClasses}
                  tabIndex={0}
                  draggable={isPinned}
                  onDragStart={isPinned ? onRowDragStart(id) : undefined}
                  onDragOver={isPinned ? onRowDragOver(id) : undefined}
                  onDragLeave={isPinned ? onRowDragLeave(id) : undefined}
                  onDrop={isPinned ? onRowDrop(project) : undefined}
                  onDragEnd={isPinned ? onRowDragEnd : undefined}
                  onClick={() => onOpenProject(id)}
                  onKeyDown={(event) => handleRowKeyDown(event, id)}
                  aria-label={`Open project ${title}`}
                >
                  <td>
                    <div className={desktopStyles.projectCell}>
                      <Squircle
                        as="span"
                        className={desktopStyles.thumb}
                        aria-hidden
                        radius={12}
                      >
                        {thumb && !imgError[id] ? (
                          <img
                            className={`${mobileStyles.thumb} ${mobileStyles.thumbSquircle}`}
                            src={getFileUrl(thumb)}
                            alt=""
                            onError={() => onImageError(id)}
                            draggable={false}
                          />
                        ) : (
                          <SVGThumbnail
                            initial={title.charAt(0).toUpperCase() || "#"}
                            className={`${mobileStyles.thumb} ${mobileStyles.thumbSquircle}`}
                          />
                        )}
                      </Squircle>
                      <span className={desktopStyles.projectName}>{title}</span>
                    </div>
                  </td>
                  <td>
                    <span className={desktopStyles.statusBadge}>{status}</span>
                  </td>
                  <td>
                    <span className={desktopStyles.deadline}>{deadline ?? "-"}</span>
                  </td>
                  <td>
                    <span className={desktopStyles.owner}>{owner}</span>
                  </td>
                  <td>
                    <span className={desktopStyles.unreadPill}>{unread}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={[
                        desktopStyles.pinButton,
                        isPinned ? desktopStyles.pinButtonActive : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      aria-pressed={isPinned}
                      aria-label={isPinned ? "Unpin project" : "Pin project"}
                      onClick={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        onPinToggle(project);
                      }}
                    >
                      {isPinned ? <PinOff size={16} /> : <Pin size={16} />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ProjectsTable;












