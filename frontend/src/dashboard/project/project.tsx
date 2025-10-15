import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import ProjectHeader from "@/dashboard/project/components/Shared/ProjectHeader";

import BudgetOverviewCard from "@/dashboard/project/features/budget/components/BudgetOverviewCard";

import GalleryComponent from "@/dashboard/project/components/Gallery/GalleryComponent";

import ProjectPageLayout from "@/dashboard/project/components/Shared/ProjectPageLayout";
import CalendarOverviewCard from "@/dashboard/project/components/Shared/calendar/CalendarOverviewCard";
import ProjectWeekWidget from "@/dashboard/project/components/Shared/calendar/ProjectWeekWidget";
import QuickLinksComponent from "@/dashboard/project/components/Shared/QuickLinksComponent";
import type { QuickLinksRef } from "@/dashboard/project/components/Shared/QuickLinksComponent";
import LocationComponent from "@/dashboard/project/components/Shared/LocationComponent";
import FileManagerComponent from "@/dashboard/project/components/FileManager/FileManager";
import TasksComponent from "@/dashboard/project/components/Tasks/TasksComponent";
import TasksComponentMobile from "@/dashboard/project/components/Tasks/TasksComponentMobile";
import { BudgetProvider } from "@/dashboard/project/features/budget/context/BudgetProvider";
import { useData } from "@/app/contexts/useData";
import { useSocket } from "@/app/contexts/useSocket";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { Project } from "@/app/contexts/DataProvider";
import { useProjectPalette } from "@/dashboard/project/hooks/useProjectPalette";
import { resolveProjectCoverUrl } from "@/dashboard/project/utils/theme";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import Spinner from "@/shared/ui/Spinner";

const MOBILE_LAYOUT_WIDTH = 640;
const TASKS_MOBILE_WIDTH = 768;

interface LocationState {
  flashDate?: string;
}

const SingleProject: React.FC = () => {
  const {
    activeProject,
    userId,
    fetchProjectDetails,
    setProjects,
    setSelectedProjects,
  } = useData();

  const navigate = useNavigate();
  const location = useLocation();
  const flashDate = (location.state as LocationState)?.flashDate;

  const { projectId } = useParams<{ projectId: string }>();
  const [filesOpen, setFilesOpen] = useState<boolean>(false);
  const quickLinksRef = useRef<QuickLinksRef>(null);
  const { ws } = useSocket();

  const [isMobileBudgetLayout, setIsMobileBudgetLayout] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= MOBILE_LAYOUT_WIDTH;
  });
  const [isMobileTasksLayout, setIsMobileTasksLayout] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= TASKS_MOBILE_WIDTH;
  });

  const projectNameFromPath = useMemo(() => {
    const segments = location.pathname.split("/").filter(Boolean);
    const projectsIdx = segments.indexOf("projects");
    if (projectsIdx === -1) return undefined;
    const rawSegment = segments[projectsIdx + 2];
    if (!rawSegment) return undefined;
    const cleanSegment = rawSegment.split(/[?#]/)[0] ?? "";
    try {
      return decodeURIComponent(cleanSegment);
    } catch {
      return cleanSegment;
    }
  }, [location.pathname]);

  // Stable helpers
  const noop = useCallback(() => {}, []);

  const parseStatusToNumber = useCallback((status: unknown): number => {
    if (status === undefined || status === null) return 0;
    const str = typeof status === "string" ? status : String(status);
    const num = parseFloat(str.replace("%", ""));
    return Number.isNaN(num) ? 0 : num;
  }, []);

  const resolvedActiveProject = useMemo(() => {
    if (!projectId) return null;
    return activeProject?.projectId === projectId ? activeProject : null;
  }, [projectId, activeProject]);

  const [isProjectLoading, setIsProjectLoading] = useState<boolean>(() =>
    Boolean(projectId && !resolvedActiveProject)
  );

  const latestRequestedProjectId = useRef<string | null>(null);

  const coverImage = useMemo(
    () => resolveProjectCoverUrl(resolvedActiveProject),
    [resolvedActiveProject]
  );
  const projectPalette = useProjectPalette(coverImage, {
    color: resolvedActiveProject?.color,
  });


  const showWelcome = useCallback(() => {
    navigate("/dashboard/projects");
  }, [navigate]);

  const openCalendarPage = useCallback(() => {
    if (!resolvedActiveProject) return;
    navigate(
      getProjectDashboardPath(
        resolvedActiveProject.projectId,
        resolvedActiveProject.title,
        "/calendar"
      )
    );
  }, [resolvedActiveProject, navigate]);

  const handleProjectDeleted = useCallback(
    (deletedProjectId: string) => {
      setProjects((prev) => prev.filter((p) => p.projectId !== deletedProjectId));
      setSelectedProjects((prev) => prev.filter((id: string) => id !== deletedProjectId));
      navigate("/dashboard/projects/allprojects");
    },
    [navigate, setProjects, setSelectedProjects]
  );

  const handleActiveProjectChange = useCallback(
    (updatedProject: Project) => {
      if (updatedProject?.projectId) {
        // If child edits metadata and wants to "promote" it to active, ensure details are fresh.
        fetchProjectDetails(updatedProject.projectId);
      }
    },
    [fetchProjectDetails]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      const width = window.innerWidth;
      setIsMobileBudgetLayout(width <= MOBILE_LAYOUT_WIDTH);
      setIsMobileTasksLayout(width <= TASKS_MOBILE_WIDTH);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Keep the active project in sync with the ID from the route and track loading state.
  useEffect(() => {
    if (!projectId) {
      latestRequestedProjectId.current = null;
      setIsProjectLoading(false);
      return;
    }

    if (resolvedActiveProject?.projectId === projectId) {
      latestRequestedProjectId.current = null;
      setIsProjectLoading(false);
      return;
    }

    latestRequestedProjectId.current = projectId;
    let isSubscribed = true;

    setIsProjectLoading(true);

    void fetchProjectDetails(projectId).then((success) => {
      if (!isSubscribed) return;
      if (success) {
        // Wait for the resolved project effect to clear the loading state.
        return;
      }

      if (latestRequestedProjectId.current === projectId) {
        latestRequestedProjectId.current = null;
        setIsProjectLoading(false);
      }
    });

    return () => {
      isSubscribed = false;
    };
  }, [
    projectId,
    resolvedActiveProject?.projectId,
    fetchProjectDetails,
  ]);

  useEffect(() => {
    if (!projectId) return;
    if (resolvedActiveProject?.projectId !== projectId) return;

    latestRequestedProjectId.current = null;
    setIsProjectLoading(false);
  }, [projectId, resolvedActiveProject?.projectId]);

  useEffect(() => {
    if (!projectId) return;
    if (resolvedActiveProject?.projectId !== projectId) return;

    const title = resolvedActiveProject?.title;
    if (!title) return;

    if (projectNameFromPath === title) return;

    const canonicalPath = getProjectDashboardPath(projectId, title);
    const currentPath = location.pathname.split(/[?#]/)[0];
    if (currentPath === canonicalPath) return;

    navigate(canonicalPath, { replace: true });
  }, [
    projectId,
    resolvedActiveProject?.projectId,
    resolvedActiveProject?.title,
    projectNameFromPath,
    navigate,
    location.pathname,
  ]);

  // Ensure team/details are loaded for the current project.
  useEffect(() => {
    if (!resolvedActiveProject?.projectId) return;
    const hasTeamArray = Array.isArray(resolvedActiveProject.team);
    const hasDescription = typeof resolvedActiveProject.description === "string";
    if (!hasTeamArray || !hasDescription) {
      fetchProjectDetails(resolvedActiveProject.projectId);
    }
  }, [
    resolvedActiveProject?.projectId,
    resolvedActiveProject?.team,
    resolvedActiveProject?.description,
    fetchProjectDetails,
  ]);

  // Subscribe this client to live updates for the active project's "conversation".
  useEffect(() => {
    if (!ws || !resolvedActiveProject?.projectId) return;

    const payload = JSON.stringify({
      action: "setActiveConversation",
      conversationId: `project#${resolvedActiveProject.projectId}`,
    });

    const onOpen = (): void => {
      try {
        ws.send(payload);
      } catch {
        /* no-op */
      }
    };

    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payload);
      } catch {
        /* no-op */
      }
    } else {
      ws.addEventListener("open", onOpen);
    }

    return () => {
      ws.removeEventListener("open", onOpen);
    };
  }, [ws, resolvedActiveProject?.projectId]);

  const calendarProject = resolvedActiveProject
    ? (resolvedActiveProject as {
        projectId: string;
        title?: string;
        color?: string;
        dateCreated?: string;
        productionStart?: string;
        finishline?: string;
        timelineEvents?: Array<{
          id: string;
          eventId?: string;
          date: string;
          description?: string;
          hours?: number | string;
          budgetItemId?: string | null;
          createdAt?: string;
          payload?: Record<string, unknown>;
        }>;
        address?: string;
        company?: string;
        clientName?: string;
        invoiceBrandName?: string;
        invoiceBrandAddress?: string;
        clientAddress?: string;
        invoiceBrandPhone?: string;
        clientPhone?: string;
        clientEmail?: string;
      })
    : null;

  const calendarOverviewCard = calendarProject ? (
    <CalendarOverviewCard
      project={calendarProject}
      initialFlashDate={flashDate}
      showEventList={false}
      onWrapperClick={openCalendarPage}
      onDateSelect={noop}
    />
  ) : null;

  const calendarWeekWidget = calendarProject ? (
    <ProjectWeekWidget
      project={calendarProject}
      initialFlashDate={flashDate}
      showEventList={false}
      onWrapperClick={openCalendarPage}
      onDateSelect={noop}
    />
  ) : null;

  const shouldShowLoader = Boolean(
    projectId &&
      (isProjectLoading || (!resolvedActiveProject && latestRequestedProjectId.current === projectId))
  );

  const shouldShowUnavailableState = Boolean(
    projectId && !shouldShowLoader && !resolvedActiveProject
  );

  const loader = (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        justifyContent: "center",
        minHeight: "40vh",
        padding: "2rem 0",
        width: "100%",
      }}
    >
      <Spinner />
    </div>
  );

  const unavailableState = (
    <div
      style={{
        alignItems: "center",
        color: "var(--text-muted, #6b7280)",
        display: "flex",
        fontSize: "1rem",
        justifyContent: "center",
        minHeight: "40vh",
        padding: "2rem",
        textAlign: "center",
        width: "100%",
      }}
    >
      We're having trouble loading this project right now.
    </div>
  );

  const projectContent = resolvedActiveProject ? (
    <BudgetProvider projectId={resolvedActiveProject.projectId}>
      <div className="overview-layout">
        <QuickLinksComponent ref={quickLinksRef} hideTrigger />

        {FileManagerComponent && (
          <FileManagerComponent
            {...{
              isOpen: filesOpen,
              onRequestClose: () => setFilesOpen(false),
              showTrigger: false,
              folder: "uploads",
            }}
          />
        )}

        <div
          className={`dashboard-layout budget-calendar-layout${
            isMobileBudgetLayout ? " budget-calendar-layout--stacked" : ""
          }`}
        >
          <div className="budget-column">
            <BudgetOverviewCard projectId={resolvedActiveProject.projectId} />
            {isMobileBudgetLayout && (
              <div className="budget-calendar-mobile-card">{calendarWeekWidget}</div>
            )}

            <GalleryComponent />
          </div>
          {!isMobileBudgetLayout && <div className="calendar-column">{calendarOverviewCard}</div>}
        </div>

        {/* <Timeline
          activeProject={resolvedActiveProject as Project & { status: string; milestoneTitles?: string[] }}
          parseStatusToNumber={parseStatusToNumber}
          onActiveProjectChange={handleActiveProjectChange}
        /> */}

        <div
          className={`dashboard-layout timeline-location-row${
            isMobileTasksLayout ? " timeline-location-row--tasks-only" : ""
          }`}
        >
          {!isMobileTasksLayout && (
            <div className="location-wrapper">
              <LocationComponent
                activeProject={resolvedActiveProject}
                onActiveProjectChange={handleActiveProjectChange}
              />
            </div>
          )}
          <div className="tasks-wrapper">
            {isMobileTasksLayout ? (
              <TasksComponentMobile
                projectId={resolvedActiveProject.projectId}
                projectName={resolvedActiveProject.title}
                projectColor={resolvedActiveProject.color as string | undefined}
                activeProject={resolvedActiveProject}
                onActiveProjectChange={handleActiveProjectChange}
              />
            ) : (
              <TasksComponent
                projectId={resolvedActiveProject.projectId}
                projectName={resolvedActiveProject.title}
                projectColor={resolvedActiveProject.color as string | undefined}
              />
            )}
          </div>
        </div>
      </div>
    </BudgetProvider>
  ) : null;

  // Render
  return (
    <ProjectPageLayout
      projectId={resolvedActiveProject?.projectId}
      theme={projectPalette}
      header={
        <ProjectHeader
          activeProject={resolvedActiveProject}
          parseStatusToNumber={parseStatusToNumber}
          userId={userId}
          onProjectDeleted={handleProjectDeleted}
          showWelcomeScreen={showWelcome}
          onActiveProjectChange={handleActiveProjectChange}
          onOpenFiles={() => setFilesOpen(true)}
          onOpenQuickLinks={() => quickLinksRef.current?.openModal()}
          title={resolvedActiveProject?.title}
        />
      }
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          className="column-2"
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -100, opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {shouldShowLoader
            ? loader
            : shouldShowUnavailableState
            ? unavailableState
            : projectContent}
        </motion.div>
      </AnimatePresence>
    </ProjectPageLayout>
  );
};

export default SingleProject;










