import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";

import { motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";

import { useData } from "@/app/contexts/useData";
import type { UserLite } from "@/app/contexts/DataProvider";
import {
  parseProjectStatusToNumber,
  useProjectKpis,
  type ProjectLike,
} from "@/dashboard/home/hooks/useProjectKpis";
import { MICRO_WOBBLE_SCALE, SPRING_FAST } from "@/shared/ui/motionTokens";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";

import desktopStyles from "./ProjectsPanelDesktop.module.css";
import mobileStyles from "@/dashboard/home/components/projects-panel.module.css";
import { ProjectsIconsStrip } from "./ProjectsIconsStrip";
import ProjectsTable from "./ProjectsTable";
import { ProjectsFilterMenu } from "./ProjectsFilterMenu";
import { useProjectFilters } from "./hooks/useProjectFilters";
import type { ProjectWithMeta } from "../utils/types";
import {
  readPinnedOrder,
  reconcilePinnedOrder,
  writePinnedOrder,
} from "@/dashboard/home/utils/pinnedOrder";
import { arraysEqual, moveIdBeforeTarget } from "@/dashboard/home/utils/reorder";

import "@/dashboard/home/components/week-widget.css";

const DEFAULT_DESKTOP_ROWS = 6;

export type ProjectsPanelDesktopProps = {
  onOpenProject?: (projectId: string) => void;
  hideHeader?: boolean;
  externalProjectFilter?: (project: ProjectWithMeta) => boolean;
  variant?: "card" | "embedded";
};

const ProjectsPanelDesktop: React.FC<ProjectsPanelDesktopProps> = ({
  onOpenProject,
  hideHeader = false,
  externalProjectFilter,
  variant = "card",
}) => {
  const reduceMotion = useReducedMotion();
  const {
    projects = [],
    isLoading,
    projectsError,
    fetchProjects,
    allUsers,
    updateProjectFields,
    userData,
    setUserData,
    updateUserProfile,
  } = useData() as {
    projects: ProjectLike[];
    isLoading: boolean;
    projectsError: boolean;
    fetchProjects: () => Promise<void> | void;
    allUsers: UserLite[];
    updateProjectFields: (projectId: string, fields: Record<string, unknown>) => Promise<void>;
    userData: UserLite | null;
    setUserData: React.Dispatch<React.SetStateAction<UserLite | null>>;
    updateUserProfile: (profile: Record<string, unknown>) => Promise<unknown>;
  };
  const navigate = useNavigate();

  const [imgError, setImgError] = useState<Record<string, boolean>>({});
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [pinnedOrder, setPinnedOrder] = useState<string[]>(() => {
    const fromProfile = (userData as unknown as { pinnedProjectOrder?: unknown } | null)?.pinnedProjectOrder;
    if (Array.isArray(fromProfile)) {
      return fromProfile.filter((id): id is string => typeof id === "string");
    }
    return readPinnedOrder();
  });
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && projects.length === 0 && !projectsError) {
      fetchProjects();
    }
  }, [isLoading, projects.length, projectsError, fetchProjects]);

  useEffect(() => {
    writePinnedOrder(pinnedOrder);
  }, [pinnedOrder]);

  const persistPinnedProjectOrder = useCallback(
    (nextOrder: string[]) => {
      if (!userData?.userId) return;
      setUserData((prev) => (prev ? ({ ...prev, pinnedProjectOrder: nextOrder } as UserLite) : prev));
      void updateUserProfile({ ...(userData as Record<string, unknown>), pinnedProjectOrder: nextOrder }).catch(
        (err: unknown) => {
          console.error("Failed to persist pinned project order", err);
        },
      );
    },
    [setUserData, updateUserProfile, userData],
  );

  // Prefer server-stored pinned order when available (cross-device), falling back to localStorage.
  useEffect(() => {
    const fromProfile = (userData as unknown as { pinnedProjectOrder?: unknown } | null)?.pinnedProjectOrder;
    if (!Array.isArray(fromProfile)) return;

    const profileOrder = fromProfile.filter((id): id is string => typeof id === "string");
    if (!profileOrder.length) return;

    const pinnedIds = (projects as ProjectWithMeta[])
      .filter((project) => project.pinned)
      .map((project) => project.projectId);

    const next = reconcilePinnedOrder(profileOrder, pinnedIds);
    setPinnedOrder((prev) => (arraysEqual(prev, next) ? prev : next));
  }, [projects, userData]);

  useEffect(() => {
    const pinnedIds = (projects as ProjectWithMeta[])
      .filter((project) => project.pinned)
      .map((project) => project.projectId);
    setPinnedOrder((prev) => {
      const next = reconcilePinnedOrder(prev, pinnedIds);
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [projects]);

  const handleImageError = useCallback((projectId: string) => {
    setImgError((prev) => {
      if (prev[projectId]) return prev;
      return { ...prev, [projectId]: true };
    });
  }, []);

  const handleOpen = useCallback(
    (projectId: string) => {
      if (onOpenProject) {
        onOpenProject(projectId);
        return;
      }

      const project = (projects as ProjectLike[]).find(
        (entry) => entry.projectId === projectId
      );
      if (project) {
        navigate(getProjectDashboardPath(projectId, project.title));
        return;
      }

      navigate("/dashboard/projects/allprojects");
    },
    [onOpenProject, navigate, projects]
  );

  const toggleProjectPin = useCallback(
    (project: ProjectWithMeta) => {
      const nextPinned = !project.pinned;
      setPinnedOrder((prev) => {
        const next = nextPinned
          ? [project.projectId, ...prev.filter((id) => id !== project.projectId)]
          : prev.filter((id) => id !== project.projectId);
        persistPinnedProjectOrder(next);
        return next;
      });
      void updateProjectFields(project.projectId, { pinned: nextPinned }).catch((err) => {
        console.error("Failed to update pinned state", err);
      });
    },
    [persistPinnedProjectOrder, updateProjectFields],
  );

  const handleRowDragStart = useCallback(
    (projectId: string) => (event: ReactDragEvent<HTMLTableRowElement>) => {
      if (!projectId) return;
      event.stopPropagation();
      event.dataTransfer?.setData("text/plain", projectId);
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      setDraggedProjectId(projectId);
    },
    [],
  );

  const handleRowDragOver = useCallback(
    (projectId: string) => (event: ReactDragEvent<HTMLTableRowElement>) => {
      if (!projectId || projectId === draggedProjectId) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      setDragOverProjectId(projectId);
    },
    [draggedProjectId],
  );

  const handleRowDragLeave = useCallback(
    (projectId: string) => () => {
      if (dragOverProjectId === projectId) {
        setDragOverProjectId(null);
      }
    },
    [dragOverProjectId],
  );

  const handleRowDrop = useCallback(
    (project: ProjectWithMeta) => (event: ReactDragEvent<HTMLTableRowElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!draggedProjectId || project.projectId === draggedProjectId || !project.pinned) {
        return;
      }
      setPinnedOrder((prev) => {
        const next = moveIdBeforeTarget(prev, draggedProjectId, project.projectId);
        persistPinnedProjectOrder(next);
        return next;
      });
      setDragOverProjectId(null);
    },
    [draggedProjectId, persistPinnedProjectOrder],
  );

  const handleRowDragEnd = useCallback(() => {
    setDraggedProjectId(null);
    setDragOverProjectId(null);
  }, []);

  const handleTableDragOver = useCallback(
    (event: ReactDragEvent<HTMLTableSectionElement>) => {
      if (!draggedProjectId) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    },
    [draggedProjectId],
  );

  const handleTableDrop = useCallback(
    (event: ReactDragEvent<HTMLTableSectionElement>) => {
      event.preventDefault();
      if (!draggedProjectId) return;
      if (event.currentTarget === event.target) {
        setPinnedOrder((prev) => {
          const next = moveIdBeforeTarget(prev, draggedProjectId);
          persistPinnedProjectOrder(next);
          return next;
        });
        setDragOverProjectId(null);
      }
    },
    [draggedProjectId, persistPinnedProjectOrder],
  );

  const {
    filtersOpen,
    filtersRef,
    filtersId,
    toggleFilters,
    scope,
    setScope,
    query,
    setQuery,
    statusOptions,
    statusTriggerLabel,
    statusDropdown,
    showStatusDropdown,
    setStatusFilter,
    sortOptions,
    sortTriggerLabel,
    sortDropdown,
    filteredProjects,
  } = useProjectFilters({
    projects: projects as ProjectLike[],
    recentsLimit: DEFAULT_DESKTOP_ROWS,
    defaultScope: "all",
  });

  const kpis = useProjectKpis(projects as ProjectLike[]);

  const nextDueProject = useMemo(() => {
    const today = new Date();
    return (projects as ProjectLike[])
      .filter((project) => {
        if (!project.finishline) return false;
        const deadline = new Date(project.finishline);
        return !Number.isNaN(deadline.getTime()) && deadline > today;
      })
      .sort((a, b) => {
        const aDate = new Date(a.finishline || 0).getTime();
        const bDate = new Date(b.finishline || 0).getTime();
        return aDate - bDate;
      })[0] ?? null;
  }, [projects]);

  const filteredProjectsToDisplay = useMemo(() => {
    if (!showPendingOnly) return filteredProjects;

    return (filteredProjects as ProjectWithMeta[]).filter((project) =>
      parseProjectStatusToNumber(project.status) < 100
    );
  }, [filteredProjects, showPendingOnly]);

  const orderedProjectsToDisplay = useMemo(() => {
    const pinnedSet = new Set(pinnedOrder);
    const orderedPinned = pinnedOrder
      .map((id) =>
        (filteredProjectsToDisplay as ProjectWithMeta[]).find(
          (project) => project.projectId === id && project.pinned,
        ),
      )
      .filter((project): project is ProjectWithMeta => Boolean(project));
    const extras = (filteredProjectsToDisplay as ProjectWithMeta[]).filter(
      (project) => project.pinned && !pinnedSet.has(project.projectId),
    );
    const rest = (filteredProjectsToDisplay as ProjectWithMeta[]).filter(
      (project) => !project.pinned,
    );
    return [...orderedPinned, ...extras, ...rest];
  }, [filteredProjectsToDisplay, pinnedOrder]);

  const externalFilteredProjects = useMemo(() => {
    if (!externalProjectFilter) return orderedProjectsToDisplay;
    return orderedProjectsToDisplay.filter((project) => externalProjectFilter(project));
  }, [externalProjectFilter, orderedProjectsToDisplay]);

  const handleNavigateToAllProjects = useCallback(() => {
    setShowPendingOnly(false);
    setScope("all");
    setQuery("");
    setStatusFilter("");
    navigate("/dashboard/projects/allprojects");
  }, [navigate, setQuery, setScope, setStatusFilter]);

  const handleTogglePendingFilter = useCallback(() => {
    setScope("all");
    setQuery("");
    setStatusFilter("");
    setShowPendingOnly((prev) => !prev);
  }, [setQuery, setScope, setStatusFilter]);

  const handleOpenNextProject = useCallback(() => {
    if (!nextDueProject?.projectId) return;
    handleOpen(nextDueProject.projectId);
  }, [handleOpen, nextDueProject]);

  const usersById = useMemo(() => {
    const map = new Map<string, UserLite>();
    (Array.isArray(allUsers) ? allUsers : []).forEach((user: UserLite) => {
      if (user?.userId) map.set(user.userId, user);
    });
    return map;
  }, [allUsers]);

  return (
    <section
      aria-label="Projects overview"
      className={`${variant === "embedded" ? desktopStyles.embedded : desktopStyles.card} week-widget week-widget--desktop`}
    >
      {!hideHeader ? (
        <header className={desktopStyles.header}>
          <div className={desktopStyles.headerTop}>
            <div className={mobileStyles.titleWrap}>
              <h3 className={mobileStyles.title}>Projects</h3>
              <ProjectsIconsStrip
                projects={projects as ProjectLike[]}
                imgError={imgError}
                onImageError={handleImageError}
                onOpenProject={handleOpen}
              />
            </div>
          </div>

          <ProjectsFilterMenu
            filtersOpen={filtersOpen}
            filtersRef={filtersRef}
            filtersId={filtersId}
            scope={scope}
            onScopeChange={setScope}
            query={query}
            onQueryChange={setQuery}
            toggleFilters={toggleFilters}
            statusOptions={statusOptions}
            statusTriggerLabel={statusTriggerLabel}
            statusDropdown={statusDropdown}
            showStatusDropdown={showStatusDropdown}
            sortOptions={sortOptions}
            sortTriggerLabel={sortTriggerLabel}
            sortDropdown={sortDropdown}
          />

          <div className={mobileStyles.kpis}>
            <motion.button
              type="button"
              className={mobileStyles.chip}
              whileHover={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
              whileFocus={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
              transition={reduceMotion ? undefined : SPRING_FAST}
              onClick={handleNavigateToAllProjects}
            >
              {kpis.totalProjects} Projects
            </motion.button>
            <span className={mobileStyles.dot} />
            <motion.button
              type="button"
              className={`${mobileStyles.chip} ${
                showPendingOnly ? mobileStyles.chipActive : ""
              }`}
              aria-pressed={showPendingOnly}
              whileHover={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
              whileFocus={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
              transition={reduceMotion ? undefined : SPRING_FAST}
              onClick={handleTogglePendingFilter}
            >
              {kpis.pendingProjects} Pending
            </motion.button>
            <span className={mobileStyles.dot} />
            <motion.button
              type="button"
              className={`${mobileStyles.chip} ${mobileStyles.chipNext}`}
              whileHover={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
              whileFocus={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
              transition={reduceMotion ? undefined : SPRING_FAST}
              onClick={handleOpenNextProject}
              disabled={!nextDueProject}
            >
              {kpis.nextProject
                ? `Next: ${kpis.nextProject.title} ${kpis.nextProject.date}`
                : "No upcoming projects"}
            </motion.button>
          </div>
        </header>
      ) : null}

      <div className={desktopStyles.content}>
        <ProjectsTable
          projects={externalFilteredProjects}
          isLoading={isLoading}
          projectsError={projectsError}
          onOpenProject={handleOpen}
          onImageError={handleImageError}
          imgError={imgError}
          usersById={usersById}
          draggedProjectId={draggedProjectId}
          dragOverProjectId={dragOverProjectId}
          onPinToggle={toggleProjectPin}
          onRowDragStart={handleRowDragStart}
          onRowDragOver={handleRowDragOver}
          onRowDragLeave={handleRowDragLeave}
          onRowDrop={handleRowDrop}
          onRowDragEnd={handleRowDragEnd}
          onTableDragOver={handleTableDragOver}
          onTableDrop={handleTableDrop}
          allUsers={allUsers}
          onUpdateProjectTeam={(projectId, userIds) =>
            updateProjectFields(projectId, {
              team: userIds.map((userId) => ({ userId })),
            })
          }
        />
      </div>

     
    </section>
  );
};

export default ProjectsPanelDesktop;









