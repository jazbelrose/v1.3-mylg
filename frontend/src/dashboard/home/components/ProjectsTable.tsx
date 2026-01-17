import {
  useCallback,
  useEffect,
  useState,
  type FC,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
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
import AvatarStack from "@/shared/ui/AvatarStack";
import AssignedPopover, { type AssignedPopoverAnchor } from "./AssignedPopover";
import { notifyAction } from "@/shared/ui/ToastNotifications";

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
  allUsers: UserLite[];
  onUpdateProjectTeam: (projectId: string, userIds: string[]) => Promise<void> | void;
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
  allUsers,
  onUpdateProjectTeam,
}) => {
  const [teamOverrides, setTeamOverrides] = useState<Record<string, string[]>>({});
  const [assignedPopover, setAssignedPopover] = useState<{ projectId: string; anchor: AssignedPopoverAnchor } | null>(null);

  const extractTeamIds = useCallback((project: ProjectWithMeta): string[] => {
    const raw = (project as { team?: unknown }).team;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((member) => {
        if (typeof member === "string") return member.trim();
        if (member && typeof member === "object" && "userId" in (member as Record<string, unknown>)) {
          return String((member as Record<string, unknown>).userId || "").trim();
        }
        return "";
      })
      .filter(Boolean);
  }, []);

  const getDisplayedTeamIds = useCallback(
    (project: ProjectWithMeta): string[] => {
      const override = teamOverrides[project.projectId];
      if (Array.isArray(override)) return override;
      return extractTeamIds(project);
    },
    [extractTeamIds, teamOverrides],
  );

  useEffect(() => {
    setTeamOverrides((prev) => {
      const entries = Object.entries(prev);
      if (!entries.length) return prev;

      let changed = false;
      const next: Record<string, string[]> = { ...prev };

      for (const [projectId, overrideIds] of entries) {
        const project = projects.find((p) => p.projectId === projectId);
        if (!project) {
          delete next[projectId];
          changed = true;
          continue;
        }

        const actual = extractTeamIds(project).slice().sort();
        const desired = (overrideIds || []).slice().sort();
        const equal = actual.length === desired.length && actual.every((id, idx) => id === desired[idx]);
        if (equal) {
          delete next[projectId];
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [extractTeamIds, projects]);
  const handleRowKeyDown = (
    event: ReactKeyboardEvent<HTMLTableRowElement>,
    projectId: string
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenProject(projectId);
    }
  };

  const resolveMembers = useCallback(
    (project: ProjectWithMeta) => {
      const ids = getDisplayedTeamIds(project);
      return ids
        .map((userId) => {
          const u = usersById.get(userId) || ({} as UserLite);
          return {
            userId,
            firstName: String(u.firstName || ""),
            lastName: String(u.lastName || ""),
            thumbnail: (u.thumbnail as string) || (u.thumbnailUrl as string) || undefined,
          };
        })
        .filter((m) => Boolean(m.userId));
    },
    [getDisplayedTeamIds, usersById],
  );

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
              <th scope="col">Assigned</th>
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
              const members = resolveMembers(project);
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
                    <div
                      className={desktopStyles.owner}
                      role="button"
                      tabIndex={0}
                      style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                      onClick={(event) => {
                        event.stopPropagation();
                        const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                        setAssignedPopover({ projectId: id, anchor: { x: rect.left + rect.width / 2, y: rect.bottom } });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                          setAssignedPopover({ projectId: id, anchor: { x: rect.left + rect.width / 2, y: rect.bottom } });
                        }
                      }}
                      aria-label="Edit assigned"
                    >
                      {members.length ? (
                        <AvatarStack members={members} size={24} />
                      ) : (
                        <span style={{ color: "rgba(255,255,255,0.65)" }}>Assign</span>
                      )}
                      <span style={{ color: "rgba(255,255,255,0.75)" }} aria-hidden>
                        +
                      </span>
                    </div>
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

      <AssignedPopover
        open={Boolean(assignedPopover)}
        anchor={assignedPopover?.anchor ?? null}
        title="Assigned"
        users={Array.isArray(allUsers) ? allUsers : []}
        selectedUserIds={(() => {
          const projectId = assignedPopover?.projectId;
          if (!projectId) return new Set<string>();
          const project = projects.find((p) => p.projectId === projectId);
          if (!project) return new Set<string>();
          return new Set(getDisplayedTeamIds(project));
        })()}
        onToggleUser={(userId) => {
          const projectId = assignedPopover?.projectId;
          if (!projectId) return;
          const project = projects.find((p) => p.projectId === projectId);
          if (!project) return;

          const prevIds = getDisplayedTeamIds(project);
          const nextSet = new Set(prevIds);
          if (nextSet.has(userId)) nextSet.delete(userId);
          else nextSet.add(userId);
          const nextIds = Array.from(nextSet);

          setTeamOverrides((prev) => ({ ...prev, [projectId]: nextIds }));
          void onUpdateProjectTeam(projectId, nextIds);

          notifyAction("info", "Updated assigned", "Undo", () => {
            setTeamOverrides((prev) => ({ ...prev, [projectId]: prevIds }));
            void onUpdateProjectTeam(projectId, prevIds);
          });
        }}
        onClose={() => setAssignedPopover(null)}
      />
    </div>
  );
};

export default ProjectsTable;












