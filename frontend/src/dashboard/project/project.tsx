import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import ProjectHeader from "@/dashboard/project/components/Shared/ProjectHeader";

import { OverviewHud, useOverviewData } from "@/dashboard/project/features/overview";

import QuickLinksComponent from "@/dashboard/project/components/Shared/QuickLinksComponent";
import type { QuickLinksRef } from "@/dashboard/project/components/Shared/QuickLinksComponent";
import FileManagerComponent from "@/dashboard/project/components/FileManager/FileManager";
import { BudgetProvider } from "@/dashboard/project/features/budget/context/BudgetProvider";
import ProjectPageLayout from "@/dashboard/project/components/Shared/ProjectPageLayout";
import { useData } from "@/app/contexts/useData";
import { useSocket } from "@/app/contexts/useSocket";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { Project } from "@/app/contexts/DataProvider";
import { useProjectPalette } from "@/dashboard/project/hooks/useProjectPalette";
import { resolveProjectCoverUrl } from "@/dashboard/project/utils/theme";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import Spinner from "@/shared/ui/Spinner";
import CalendarTaskDrawer from "@/dashboard/project/features/calendar/components/CalendarTaskDrawer";
import type { 
  QuickCreateTaskModalTask,
  QuickCreateTaskModalEvent,
} from "@/dashboard/home/components/QuickCreateTaskModal";

interface LocationState {
  flashDate?: string;
}

// ============================================================================
// OverviewHudWrapper - Uses the hook inside BudgetProvider context
// ============================================================================

interface OverviewHudWrapperProps {
  projectId: string;
  projectTitle?: string;
  address?: string;
  filesOpen: boolean;
  setFilesOpen: (open: boolean) => void;
  quickLinksRef: React.RefObject<QuickLinksRef | null>;
}

const OverviewHudWrapper: React.FC<OverviewHudWrapperProps> = ({
  projectId,
  projectTitle,
  address,
  filesOpen,
  setFilesOpen,
  quickLinksRef,
}) => {
  const overviewData = useOverviewData(projectId);
  
  // Task drawer state for QuickCreateTaskModal
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [taskDrawerTask, setTaskDrawerTask] = useState<QuickCreateTaskModalTask | null>(null);
  
  // Handler for opening the task modal from Overview
  const handleQuickEditTask = useCallback((task: Record<string, unknown>) => {
    // Convert task to QuickCreateTaskModalTask format
    const modalTask: QuickCreateTaskModalTask = {
      taskId: (task.taskId as string) || (task.id as string) || '',
      projectId: projectId,
      projectName: projectTitle,
      title: (task.title as string) || '',
      description: task.description as string | undefined,
      status: (task.status as string) || 'todo',
      dueDate: task.dueDate as string | undefined,
      startAt: task.startAt as string | null | undefined,
      endAt: task.endAt as string | null | undefined,
      address: task.address as string | undefined,
      assigneeId: task.assigneeId as string | undefined,
      assigneeIds: task.assigneeIds as string[] | undefined,
      assigneeTokens: task.assigneeTokens as string[] | undefined,
    };
    setTaskDrawerTask(modalTask);
    setTaskDrawerOpen(true);
  }, [projectId, projectTitle]);
  
  const handleTaskDrawerClose = useCallback(() => {
    setTaskDrawerOpen(false);
    setTaskDrawerTask(null);
  }, []);
  
  const handleTaskCreated = useCallback((event: QuickCreateTaskModalEvent) => {
    // Refresh data after task creation
    overviewData.refresh?.();
    handleTaskDrawerClose();
    console.log('[OverviewHud] Task created:', event);
  }, [overviewData, handleTaskDrawerClose]);
  
  const handleTaskUpdated = useCallback(() => {
    // Refresh data after task update
    overviewData.refresh?.();
    handleTaskDrawerClose();
  }, [overviewData, handleTaskDrawerClose]);
  
  const handleTaskDeleted = useCallback(() => {
    // Refresh data after task deletion
    overviewData.refresh?.();
    handleTaskDrawerClose();
  }, [overviewData, handleTaskDrawerClose]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOpenFiles = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail;
      if (detail?.projectId && detail.projectId !== projectId) return;
      setFilesOpen(true);
    };

    window.addEventListener("project-open-files", handleOpenFiles);
    return () => {
      window.removeEventListener("project-open-files", handleOpenFiles);
    };
  }, [projectId, setFilesOpen]);
  
  // Project list for the modal (just the current project)
  const taskProjects = useMemo(() => [{
    id: projectId,
    name: projectTitle || 'Project',
  }], [projectId, projectTitle]);

  return (
    <div className="overview-layout overview-hud-layout">
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

      <OverviewHud
        projectId={projectId}
        projectTitle={projectTitle}
        projectColor={overviewData.projectColor}
        startDate={overviewData.startDate}
        endDate={overviewData.endDate}
        coverImage={overviewData.coverImage}
        address={address}
        location={overviewData.location}
        budgetStats={overviewData.budgetStats}
        events={overviewData.events}
        tasks={overviewData.tasks}
        deckVersions={overviewData.deckVersions}
        galleries={overviewData.galleries}
        activities={overviewData.activities}
        recentMessages={overviewData.recentMessages}
        recentFiles={overviewData.recentFiles}
        recentLinks={overviewData.recentLinks}
        onQuickEditTask={handleQuickEditTask}
        onRefresh={overviewData.refresh}
      />
      
      {/* Task Edit Drawer (QuickCreateTaskModal) */}
      <CalendarTaskDrawer
        open={taskDrawerOpen}
        task={taskDrawerTask}
        projects={taskProjects}
        activeProjectId={projectId}
        activeProjectName={projectTitle}
        onClose={handleTaskDrawerClose}
        onCreated={handleTaskCreated}
        onUpdated={handleTaskUpdated}
        onDeleted={handleTaskDeleted}
      />
    </div>
  );
};

// ============================================================================
// SingleProject - Main project overview page
// ============================================================================

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

  const { projectId } = useParams<{ projectId: string }>();
  const [filesOpen, setFilesOpen] = useState<boolean>(false);
  const quickLinksRef = useRef<QuickLinksRef>(null);
  const { ws } = useSocket();

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
      <OverviewHudWrapper 
        projectId={resolvedActiveProject.projectId}
        projectTitle={resolvedActiveProject.title}
        address={resolvedActiveProject.address as string | undefined}
        filesOpen={filesOpen}
        setFilesOpen={setFilesOpen}
        quickLinksRef={quickLinksRef}
      />
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










