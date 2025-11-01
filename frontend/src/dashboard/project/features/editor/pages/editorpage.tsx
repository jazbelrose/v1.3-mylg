import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import ProjectPageLayout from "@/dashboard/project/components/Shared/ProjectPageLayout";
import ProjectHeader from "@/dashboard/project/components/Shared/ProjectHeader";
import QuickLinksComponent from "@/dashboard/project/components/Shared/QuickLinksComponent";
import type { QuickLinksRef } from "@/dashboard/project/components/Shared/QuickLinksComponent";
import FileManagerComponent from "@/dashboard/project/components/FileManager/FileManager";
import PreviewDrawer from "@/dashboard/project/features/editor/components/PreviewDrawer";
import DeckCanvasWorkspace from "@/dashboard/project/features/editor/components/DeckCanvasWorkspace";
import { useData } from "@/app/contexts/useData";
import { useSocket } from "@/app/contexts/useSocket";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import { useProjectPalette } from "@/dashboard/project/hooks/useProjectPalette";
import { resolveProjectCoverUrl } from "@/dashboard/project/utils/theme";
import type { Project } from "@/app/contexts/DataProvider";

import "@/dashboard/home/styles/components/editor-page.css";

const parseStatusToNumber = (status: string | number | undefined | null): number => {
  if (status === undefined || status === null) return 0;
  if (typeof status === "number") return status;
  const normalized = String(status).replace(/%/g, "").toLowerCase();
  const presets: Record<string, number> = {
    new: 0,
    planning: 20,
    design: 40,
    "in progress": 60,
    install: 80,
    complete: 100,
    completed: 100,
  };
  if (normalized in presets) return presets[normalized];
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const EditorPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    activeProject,
    setActiveProject,
    setProjects,
    setSelectedProjects,
    fetchProjectDetails,
    userId,
  } = useData();
  const { ws } = useSocket();

  const quickLinksRef = useRef<QuickLinksRef>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const resolvedProjectId = projectId ?? activeProject?.projectId ?? null;
  const coverImage = useMemo(() => resolveProjectCoverUrl(activeProject), [activeProject]);
  const projectPalette = useProjectPalette(coverImage, { color: activeProject?.color });

  useEffect(() => {
    if (!resolvedProjectId) return;
    void fetchProjectDetails(resolvedProjectId);
  }, [fetchProjectDetails, resolvedProjectId]);

  useEffect(() => {
    if (!ws || !resolvedProjectId) return;

    const payload = JSON.stringify({
      action: "setActiveConversation",
      conversationId: `project#${resolvedProjectId}`,
    });

    const sendWhenReady = () => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        } else {
          const handleOpen = () => {
            ws.send(payload);
            ws.removeEventListener("open", handleOpen);
          };
          ws.addEventListener("open", handleOpen);
        }
      } catch (error) {
        console.error("Failed to set active conversation", error);
      }
    };

    sendWhenReady();

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            action: "setActiveConversation",
            conversationId: null,
          })
        );
      }
    };
  }, [ws, resolvedProjectId]);

  useEffect(() => {
    if (!resolvedProjectId) return;
    const title = activeProject?.title;
    if (!title) return;

    const canonicalPath = getProjectDashboardPath(resolvedProjectId, title, "/editor");
    const currentPath = location.pathname.split(/[?#]/)[0];
    if (currentPath !== canonicalPath) {
      navigate(canonicalPath, { replace: true });
    }
  }, [resolvedProjectId, activeProject?.title, location.pathname, navigate]);

  const handleActiveProjectChange = useCallback(
    (project: Project) => {
      setActiveProject(project);
    },
    [setActiveProject]
  );

  const handleProjectDeleted = useCallback(
    (deletedProjectId: string) => {
      setProjects((prev) => prev.filter((p) => p.projectId !== deletedProjectId));
      setSelectedProjects((prev) => prev.filter((id) => id !== deletedProjectId));
      if (activeProject?.projectId === deletedProjectId) {
        setActiveProject(null);
        navigate("/dashboard/projects/allprojects");
      }
    },
    [activeProject?.projectId, navigate, setActiveProject, setProjects, setSelectedProjects]
  );

  const showWelcomeScreen = useCallback(() => {
    if (!resolvedProjectId) {
      navigate("/dashboard/projects/allprojects");
      return;
    }
    const title = activeProject?.title ?? "";
    navigate(getProjectDashboardPath(resolvedProjectId, title));
  }, [resolvedProjectId, activeProject?.title, navigate]);

  const header = (
    <ProjectHeader
      activeProject={activeProject}
      userId={userId ?? "anonymous"}
      parseStatusToNumber={parseStatusToNumber}
      onProjectDeleted={handleProjectDeleted}
      showWelcomeScreen={showWelcomeScreen}
      onActiveProjectChange={handleActiveProjectChange}
      onOpenFiles={() => setFilesOpen(true)}
      onOpenQuickLinks={() => quickLinksRef.current?.openModal()}
    />
  );

  return (
    <ProjectPageLayout projectId={resolvedProjectId ?? undefined} theme={projectPalette} header={header}>
      <div className="designer-outer-container">
        <div className="designer-scroll-container">
          <QuickLinksComponent ref={quickLinksRef} hideTrigger />
          <FileManagerComponent
            isOpen={filesOpen}
            onRequestClose={() => setFilesOpen(false)}
            showTrigger={false}
            folder="uploads"
          />
          <DeckCanvasWorkspace projectId={resolvedProjectId ?? undefined} />
          <PreviewDrawer
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            url={activeProject?.previewUrl as string}
            onExportGallery={() => setPreviewOpen(false)}
            onExportPDF={() => setPreviewOpen(false)}
          />
        </div>
      </div>
    </ProjectPageLayout>
  );
};

export default EditorPage;
