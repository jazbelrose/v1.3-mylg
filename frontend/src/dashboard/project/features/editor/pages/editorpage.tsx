import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import ProjectPageLayout from "@/dashboard/project/components/Shared/ProjectPageLayout";
import ProjectHeader from "@/dashboard/project/components/Shared/ProjectHeader";
import DesignerComponent, { DesignerRef } from "@/dashboard/project/features/editor/components/canvas/designercomponent";
import QuickLinksComponent from "@/dashboard/project/components/Shared/QuickLinksComponent";
import type { QuickLinksRef } from "@/dashboard/project/components/Shared/QuickLinksComponent";
import FileManagerComponent from "@/dashboard/project/components/FileManager/FileManager";
import PreviewDrawer from "@/dashboard/project/features/editor/components/PreviewDrawer";
import UnifiedToolbar from "@/dashboard/project/features/editor/components/UnifiedToolbar";
import LexicalEditor from "@/dashboard/project/features/editor/components/Brief/LexicalEditor";
import MoodboardCanvas from "@/dashboard/project/features/moodboard/components/MoodboardCanvas";
import { useData } from "@/app/contexts/useData";
import { Project } from "@/app/contexts/DataProvider";
import { useSocket } from "@/app/contexts/useSocket";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import { notify } from "@/shared/ui/ToastNotifications";
import { useProjectPalette } from "@/dashboard/project/hooks/useProjectPalette";
import { resolveProjectCoverUrl } from "@/dashboard/project/utils/theme";

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
    updateProjectFields,
  } = useData();

  const { ws } = useSocket();

  const [activeProject, setActiveProject] = useState<Project | null>(initialActiveProject);
  const [activeTab, setActiveTab] = useState<"brief" | "canvas" | "moodboard">("brief");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [briefToolbarActions, setBriefToolbarActions] = useState<Record<string, unknown>>({});
  const quickLinksRef = useRef<QuickLinksRef>(null);
  const coverImage = useMemo(() => resolveProjectCoverUrl(activeProject), [activeProject]);
  const projectPalette = useProjectPalette(coverImage, { color: activeProject?.color });
  const designerRef = useRef<DesignerRef>(null);
  const [briefContent, setBriefContent] = useState<string>("");
  const [isBriefDirty, setIsBriefDirty] = useState(false);

  const handleBriefChange = useCallback((json: string) => {
    setBriefContent(json);
    setIsBriefDirty(true);
  }, []);

  const saveBrief = useCallback(
    async (showToast = true) => {
      if (!activeProject?.projectId) {
        if (showToast) notify("error", "No active project to save");
        return;
      }
      if (!isBriefDirty) {
        if (showToast) notify("info", "Brief already saved");
        return;
      }
      try {
        await updateProjectFields(activeProject.projectId, {
          description: briefContent,
        });
        setIsBriefDirty(false);
        if (showToast) notify("success", "Saved. Nice.");
      } catch (err) {
        const error = err as { message?: string };
        console.error("Failed to save brief:", error);
        if (showToast)
          notify("error", "Can’t reach the server—your edits are safe; we’ll retry.");
      }
    },
    [activeProject?.projectId, briefContent, isBriefDirty, updateProjectFields]
  );

  useEffect(() => {
    setActiveProject(initialActiveProject);
  }, [initialActiveProject]);

  useEffect(() => {
    setBriefContent(activeProject?.description || "");
    setIsBriefDirty(false);
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

  const handleSelectTool = () => designerRef.current?.changeMode("select");
  const handleBrushTool = () => designerRef.current?.changeMode("brush");
  const handleRectTool = () => designerRef.current?.changeMode("rect");
  const handleTextTool = () => designerRef.current?.addText();
  const handleImageTool = () => designerRef.current?.triggerImageUpload();
  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => designerRef.current?.handleColorChange(e.target.value);
  const handleUndo = () => designerRef.current?.handleUndo();
  const handleRedo = () => designerRef.current?.handleRedo();
  const handleCopy = () => designerRef.current?.handleCopy();
  const handlePaste = () => designerRef.current?.handlePaste();
  const handleDelete = () => designerRef.current?.handleDelete();
  const handleClearCanvas = () => designerRef.current?.handleClear();
  const handleSave = useCallback(() => {
    if (activeTab === "canvas") {
      designerRef.current?.handleSave();
    } else if (activeTab === "brief") {
      void saveBrief();
    }
  }, [activeTab, saveBrief]);

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
      if (!isBriefDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isBriefDirty]);

  useEffect(() => {
    window.hasUnsavedChanges = () => isBriefDirty;
    window.unsavedChanges = isBriefDirty;
    return () => {
      delete window.hasUnsavedChanges;
      delete window.unsavedChanges;
    };
  }, [isBriefDirty]);

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
          <UnifiedToolbar
            initialMode={activeTab}
            onModeChange={(mode) => {
              if (mode !== "brief" && activeTab === "brief" && isBriefDirty) {
                const confirmLeave = window.confirm(
                  "You have unsaved changes, continue?"
                );
                if (!confirmLeave) return;
              }
              setActiveTab(mode);
            }}
            onPreview={() => setPreviewOpen(true)}
            {...(activeTab === "brief" ? briefToolbarActions : {})}
            onSelectTool={handleSelectTool}
            onFreeDraw={handleBrushTool}
            onAddRectangle={handleRectTool}
            onAddText={handleTextTool}
            onAddImage={handleImageTool}
            onColorChange={handleColorChange}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onCopy={handleCopy}
            onPaste={handlePaste}
            onDelete={handleDelete}
            onClearCanvas={handleClearCanvas}
            onSave={handleSave}
          />
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
                <AnimatePresence mode="wait">
                  {activeTab === "brief" && (
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
                            initialContent={activeProject?.description ?? null}
                            onChange={handleBriefChange}
                            registerToolbar={setBriefToolbarActions}
                          />
                        ) : (
                          <div>Loading...</div>
                        )}
                      </div>
                    </motion.div>
                  )}
                  {activeTab === "canvas" && (
                    <motion.div
                      className="editor-mode-panel"
                      key="canvas"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div
                        className="dashboard-layout editor-mode-layout"
                        style={{ paddingBottom: "5px" }}
                      >
                        <div style={{ maxWidth: "1920px", width: "100%" }}>
                          <div
                            className="editor-container"
                            style={{ display: "flex", flexDirection: "column", overflow: "hidden", height: "800px" }}
                          >
                            <DesignerComponent ref={designerRef} />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                  {activeTab === "moodboard" && (
                    <motion.div
                      className="editor-mode-panel"
                      key="moodboard"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div
                        className="dashboard-layout editor-mode-layout"
                        style={{ paddingBottom: "5px" }}
                      >
                        <MoodboardCanvas
                          projectId={activeProject?.projectId}
                          userId={userId ?? undefined}
                          palette={projectPalette}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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











