import { useCallback, useEffect, useMemo, useState } from "react";

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

import "@/dashboard/home/components/week-widget.css";

const DEFAULT_DESKTOP_ROWS = 6;

export type ProjectsPanelDesktopProps = {
  onOpenProject?: (projectId: string) => void;
};

const ProjectsPanelDesktop: React.FC<ProjectsPanelDesktopProps> = ({ onOpenProject }) => {
  const reduceMotion = useReducedMotion();
  const { projects = [], isLoading, projectsError, fetchProjects, allUsers } = useData() as {
    projects: ProjectLike[];
    isLoading: boolean;
    projectsError: boolean;
    fetchProjects: () => Promise<void> | void;
    allUsers: UserLite[];
  };
  const navigate = useNavigate();

  const [imgError, setImgError] = useState<Record<string, boolean>>({});
  const [showPendingOnly, setShowPendingOnly] = useState(false);

  useEffect(() => {
    if (!isLoading && projects.length === 0 && !projectsError) {
      fetchProjects();
    }
  }, [isLoading, projects.length, projectsError, fetchProjects]);

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
      className={`${desktopStyles.card} week-widget week-widget--desktop`}
    >
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

      <div className={desktopStyles.content}>
        <ProjectsTable
          projects={filteredProjectsToDisplay as ProjectWithMeta[]}
          isLoading={isLoading}
          projectsError={projectsError}
          onOpenProject={handleOpen}
          onImageError={handleImageError}
          imgError={imgError}
          usersById={usersById}
        />
      </div>

     
    </section>
  );
};

export default ProjectsPanelDesktop;












