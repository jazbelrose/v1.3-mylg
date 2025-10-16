import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useData } from "@/app/contexts/useData";
import { useSocket } from "@/app/contexts/SocketContext";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import type { Project } from "@/app/contexts/DataProvider";
import type { QuickLinksRef } from "@/dashboard/project/components";

export interface CalendarPageState {
  projectId?: string;
  activeProject: Project | null;
  initialActiveProject: Project | null;
  userId?: string;
  filesOpen: boolean;
  setFilesOpen: (value: boolean) => void;
  quickLinksRef: MutableRefObject<QuickLinksRef | null>;
  handleProjectDeleted: (deletedProjectId: string) => void;
  handleBack: () => void;
  setActiveProject: (project: Project | null) => void;
}

export function useCalendarPageState(): CalendarPageState {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    activeProject: initialActiveProject,
    fetchProjectDetails,
    setProjects,
    setSelectedProjects,
    userId,
  } = useData();

  const { ws } = useSocket();

  const [activeProject, setActiveProject] = useState<Project | null>(
    (initialActiveProject as Project) || null,
  );
  const [filesOpen, setFilesOpen] = useState(false);
  const quickLinksRef = useRef<QuickLinksRef | null>(null);

  useEffect(() => {
    setActiveProject((initialActiveProject as Project) || null);
  }, [initialActiveProject]);

  useEffect(() => {
    if (!projectId) return;
    if (
      !initialActiveProject ||
      (initialActiveProject as Project).projectId !== projectId
    ) {
      fetchProjectDetails(projectId);
    }
  }, [projectId, initialActiveProject, fetchProjectDetails]);

  useEffect(() => {
    if (!projectId) return;

    const title =
      (activeProject as Project | null)?.title ||
      (initialActiveProject as Project | null)?.title;
    if (!title) return;

    const currentPath = location.pathname.split(/[?#]/)[0];
    if (!currentPath.includes("/calendar")) return;

    const canonicalPath = getProjectDashboardPath(projectId, title, "/calendar");
    if (currentPath === canonicalPath) return;

    navigate(canonicalPath, { replace: true });
  }, [
    projectId,
    activeProject,
    initialActiveProject,
    location.pathname,
    navigate,
  ]);

  useEffect(() => {
    if (!ws || !activeProject?.projectId) return;

    const payload = JSON.stringify({
      action: "setActiveConversation",
      conversationId: `project#${activeProject.projectId}`,
    });

    const sendWhenReady = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      } else {
        const onOpen = () => {
          ws.send(payload);
          ws.removeEventListener("open", onOpen);
        };
        ws.addEventListener("open", onOpen);
      }
    };

    sendWhenReady();
  }, [ws, activeProject?.projectId]);

  const setFilesOpenHandler = (value: boolean) => {
    setFilesOpen(value);
  };

  const handleProjectDeleted = (deletedProjectId: string) => {
    setProjects((prev: Project[]) =>
      prev.filter((project) => project.projectId !== deletedProjectId),
    );
    setSelectedProjects((prev: string[]) =>
      prev.filter((id) => id !== deletedProjectId),
    );
    navigate("/dashboard/projects/allprojects");
  };

  const handleBack = () => {
    if (!projectId) {
      navigate("/dashboard/projects/allprojects");
      return;
    }

    const title =
      (activeProject as Project | null)?.title ||
      (initialActiveProject as Project | null)?.title;
    navigate(getProjectDashboardPath(projectId, title));
  };

  return {
    projectId,
    activeProject,
    initialActiveProject: (initialActiveProject as Project) || null,
    userId,
    filesOpen,
    setFilesOpen: setFilesOpenHandler,
    quickLinksRef,
    handleProjectDeleted,
    handleBack,
    setActiveProject,
  };
}
