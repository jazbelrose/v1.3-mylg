import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import ProjectPageLayout from "@/dashboard/project/components/Shared/ProjectPageLayout";
import ProjectHeader from "@/dashboard/project/components/Shared/ProjectHeader";
import QuickLinksComponent from "@/dashboard/project/components/Shared/QuickLinksComponent";
import type { QuickLinksRef } from "@/dashboard/project/components/Shared/QuickLinksComponent";
import FileManagerComponent from "@/dashboard/project/components/FileManager/FileManager";
import PreviewDrawer from "@/dashboard/project/features/editor/components/PreviewDrawer";
import LexicalEditor from "@/dashboard/project/features/editor/components/Brief/LexicalEditor";
import { useData } from "@/app/contexts/useData";
import { Project } from "@/app/contexts/DataProvider";
import { useSocket } from "@/app/contexts/useSocket";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import { notify } from "@/shared/ui/ToastNotifications";
import { useProjectPalette } from "@/dashboard/project/hooks/useProjectPalette";
import { resolveProjectCoverUrl } from "@/dashboard/project/utils/theme";
import { useBriefPersistence } from "../hooks/useBriefPersistence";

const EditorPage: React.FC = () => {
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

  const [activeProject, setActiveProject] = useState<Project | null>(initialActiveProject);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const quickLinksRef = useRef<QuickLinksRef>(null);
  const coverImage = useMemo(() => resolveProjectCoverUrl(activeProject), [activeProject]);
  const projectPalette = useProjectPalette(coverImage, { color: activeProject?.color });
  const [briefContent, setBriefContent] = useState<string>("");

  const handleBriefChange = useCallback((json: string) => {
    setBriefContent(json);
  }, []);

  // NEW: autosave hook
  const {
    saveNow: saveBriefNow,
    isSaving: isBriefSaving,
    hasPendingChanges: hasBriefPendingChanges,
    error: briefSaveError,
  } = useBriefPersistence({
    projectId: activeProject?.projectId,
    content: briefContent,
    enabled: !!activeProject?.projectId,
    initialServerContent: activeProject?.description ?? "",
    debounceMs: 2000,
  });

  useEffect(() => {
    setActiveProject(initialActiveProject);
  }, [initialActiveProject]);

  useEffect(() => {
    setBriefContent(activeProject?.description || "");
  }, [activeProject?.description]);

  useEffect(() => {
    if (!projectId) return;
    if (!initialActiveProject || initialActiveProject.projectId !== projectId) {
      fetchProjectDetails(projectId);
    }
  }, [projectId, initialActiveProject, fetchProjectDetails]);

  useEffect(() => {
    if (!projectId) return;
    const title = activeProject?.title ?? initialActiveProject?.title;
    if (!title) return;

    const currentPath = location.pathname.split(/[?#]/)[0];
    if (!currentPath.includes('/editor')) return;

    const canonicalPath = getProjectDashboardPath(projectId, title, '/editor');
    if (currentPath === canonicalPath) return;

    navigate(canonicalPath, { replace: true });
  }, [
    projectId,
    activeProject?.title,
    initialActiveProject?.title,
    location.pathname,
    navigate,
  ]);

  const lastFetchedId = useRef<string | null>(null);
  useEffect(() => {
    if (activeProject?.projectId && lastFetchedId.current !== activeProject.projectId) {
      lastFetchedId.current = activeProject.projectId;
      fetchProjectDetails(activeProject.projectId);
    }
  }, [activeProject?.projectId, fetchProjectDetails]);

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

  const parseStatusToNumber = (statusString: string | number | undefined | null): number => {
    if (statusString === undefined || statusString === null) return 0;
    const str = typeof statusString === "string" ? statusString : String(statusString);
    const num = parseFloat(str.replace("%", ""));
    return Number.isNaN(num) ? 0 : num;
  };

  const handleActiveProjectChange = (updatedProject: Project) => {
    setActiveProject(updatedProject);
  };

  const handleProjectDeleted = (deletedProjectId: string) => {
    setProjects((prev: Project[]) => prev.filter((p) => p.projectId !== deletedProjectId));
    setSelectedProjects((prev: string[]) => prev.filter((id) => id !== deletedProjectId));
    navigate("/dashboard/projects/allprojects");
  };

  const handleBack = () => {
    if (!projectId) {
      navigate('/dashboard/projects/allprojects');
      return;
    }

    const title = activeProject?.title ?? initialActiveProject?.title;
    navigate(getProjectDashboardPath(projectId, title));
  };

  const handleSave = useCallback(() => {
    if (!activeProject?.projectId) {
      notify("error", "No active project to save");
      return;
    }

    void (async () => {
      const didSave = await saveBriefNow();
      if (didSave) {
        notify("success", "Saved. Nice.");
      } else {
        notify("info", "Brief already saved");
      }
    })().catch(() => {
      notify(
        "error",
        "Can't reach the server—your edits are safe; we'll retry."
      );
    });
  }, [activeProject?.projectId, saveBriefNow]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleSave]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasBriefPendingChanges) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasBriefPendingChanges]);

  useEffect(() => {
    // @ts-expect-error: custom globals for unsaved changes tracking
    window.hasUnsavedChanges = () => hasBriefPendingChanges;
    // @ts-expect-error: custom globals for unsaved changes tracking
    window.unsavedChanges = hasBriefPendingChanges;
    return () => {
      // @ts-expect-error: custom globals for unsaved changes tracking
      delete window.hasUnsavedChanges;
      // @ts-expect-error: custom globals for unsaved changes tracking
      delete window.unsavedChanges;
    };
  }, [hasBriefPendingChanges]);

  return (
    <ProjectPageLayout
      projectId={projectId}
      theme={projectPalette}
      header={
        <ProjectHeader
          activeProject={activeProject}
          parseStatusToNumber={parseStatusToNumber}
          userId={userId}
          onProjectDeleted={handleProjectDeleted}
          showWelcomeScreen={handleBack}
          onActiveProjectChange={handleActiveProjectChange}
          onOpenFiles={() => setFilesOpen(true)}
          onOpenQuickLinks={() => quickLinksRef.current?.openModal()}
        />
      }
    >
      <div className="designer-outer-container">
        <div className="designer-scroll-container">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              className="editor-content-wrapper"
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -100, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <QuickLinksComponent ref={quickLinksRef} hideTrigger />
              <FileManagerComponent
                isOpen={filesOpen}
                onRequestClose={() => setFilesOpen(false)}
                showTrigger={false}
                folder="uploads"
              />
              <div className="main-view-container">
                <motion.div
                  className="editor-mode-panel"
                  key="brief"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <div
                    className="dashboard-layout editor-mode-layout"
                    style={{ paddingBottom: "5px" }}
                  >
                    {activeProject?.description !== undefined ? (
                      <LexicalEditor
                        key={activeProject?.projectId ?? "default-project"}
                        docId={`${activeProject?.projectId ?? "default-project"}::brief`}
                        initialContent={activeProject?.description ?? null}
                        onChange={handleBriefChange}
                        registerToolbar={() => {}}
                        onPreview={() => setPreviewOpen(true)}
                        onSave={handleSave}
                      />
                    ) : (
                      <div>Loading...</div>
                    )}
                  </div>
                </motion.div>
              </div>
              <PreviewDrawer
                open={previewOpen}
                onClose={() => setPreviewOpen(false)}
                url={activeProject?.previewUrl as string}
                onExportGallery={() => console.log("Export to Gallery")}
                onExportPDF={() => console.log("Export to PDF")}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </ProjectPageLayout>
  );
};

export default EditorPage;











