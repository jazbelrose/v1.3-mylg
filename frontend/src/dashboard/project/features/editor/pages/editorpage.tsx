import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import ProjectPageLayout from "@/dashboard/project/components/Shared/ProjectPageLayout";
import ProjectHeader from "@/dashboard/project/components/Shared/ProjectHeader";
import DesignerComponent, { DesignerRef } from "@/dashboard/project/features/editor/components/canvas/designercomponent";
import QuickLinksComponent from "@/dashboard/project/components/Shared/QuickLinksComponent";
import type { QuickLinksRef } from "@/dashboard/project/components/Shared/QuickLinksComponent";
import FileManagerComponent from "@/dashboard/project/components/FileManager/FileManager";
import PreviewDrawer from "@/dashboard/project/features/editor/components/PreviewDrawer";
import SheetEditor from "@/dashboard/project/features/editor/components/sheet/SheetEditor";
import type {
  LayerGroupKey,
  LayerGroupState,
  SheetPageState,
} from "@/dashboard/project/features/editor/types/sheet";
import { useDeckRealtime } from "@/dashboard/project/features/editor/hooks/useDeckRealtime";
import { upsertDeckPage } from "@/dashboard/project/features/editor/api/deckPages";
import { useData } from "@/app/contexts/useData";
import { Project } from "@/app/contexts/DataProvider";
import { useSocket } from "@/app/contexts/useSocket";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import { notify } from "@/shared/ui/ToastNotifications";
import { useProjectPalette } from "@/dashboard/project/hooks/useProjectPalette";
import { resolveProjectCoverUrl } from "@/dashboard/project/utils/theme";

const DEFAULT_GROUP_STATE: Record<LayerGroupKey, LayerGroupState> = {
  canvas: { visible: true, opacity: 1 },
};

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
  const designerRef = useRef<DesignerRef>(null);

  const {
    pages: deckPages,
    activePageId,
    setActivePageId,
    createPage,
    duplicatePage,
    syncCanvas,
    exportPage,
    refresh: refreshDeckPages,
    loading: deckLoading,
  } = useDeckRealtime({ projectId: activeProject?.projectId });

  const activeLayer: LayerGroupKey = "canvas";
  const [pageGroupStates, setPageGroupStates] = useState<Record<string, LayerGroupState>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSavingCanvas, setIsSavingCanvas] = useState(false);
  const resolvedProjectId =
    activeProject?.projectId ?? initialActiveProject?.projectId ?? projectId ?? null;

  useEffect(() => {
    setPageGroupStates((prev) => {
      const next = { ...prev };
      deckPages.forEach((page) => {
        if (!next[page.pageId]) {
          next[page.pageId] = { ...DEFAULT_GROUP_STATE.canvas };
        }
      });
      Object.keys(next).forEach((pageId) => {
        if (!deckPages.some((page) => page.pageId === pageId)) {
          delete next[pageId];
        }
      });
      return next;
    });
  }, [deckPages]);

  const sheetPages = useMemo<SheetPageState[]>(
    () =>
      deckPages.map((page) => ({
        id: page.pageId,
        name: page.name,
        groupStates: {
          canvas: {
            ...(pageGroupStates[page.pageId] ?? DEFAULT_GROUP_STATE.canvas),
          },
        },
      })),
    [deckPages, pageGroupStates]
  );

  const activeDeckPage = useMemo(
    () => deckPages.find((page) => page.pageId === activePageId) ?? null,
    [deckPages, activePageId]
  );

  useEffect(() => {
    setHasUnsavedChanges(false);
  }, [activeDeckPage?.pageId, activeDeckPage?.revision]);

  useEffect(() => {
    setActiveProject(initialActiveProject);
  }, [initialActiveProject]);

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

  const handleSelectTool = useCallback(() => {
    designerRef.current?.changeMode("select");
  }, []);
  const handleBrushTool = useCallback(() => {
    designerRef.current?.changeMode("brush");
  }, []);
  const handleRectTool = useCallback(() => {
    designerRef.current?.changeMode("rect");
  }, []);
  const handleTextTool = useCallback(() => {
    designerRef.current?.addText();
  }, []);
  const handleImageTool = useCallback(() => {
    designerRef.current?.triggerImageUpload();
  }, []);
  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      designerRef.current?.handleColorChange(e.target.value),
    []
  );
  const handleUndo = useCallback(() => {
    designerRef.current?.handleUndo();
  }, []);
  const handleRedo = useCallback(() => {
    designerRef.current?.handleRedo();
  }, []);
  const handleCopy = useCallback(() => {
    designerRef.current?.handleCopy();
  }, []);
  const handlePaste = useCallback(() => {
    designerRef.current?.handlePaste();
  }, []);
  const handleDelete = useCallback(() => {
    designerRef.current?.handleDelete();
  }, []);
  const handleClearCanvas = useCallback(() => {
    designerRef.current?.handleClear();
  }, []);
  const handleSave = useCallback(() => {
    designerRef.current?.handleSave();
  }, []);

  const handleSelectPage = useCallback(
    (pageId: string) => {
      if (!pageId || pageId === activePageId) return;
      setActivePageId(pageId);
    },
    [activePageId, setActivePageId]
  );

  const handleAddPage = useCallback(async () => {
    const created = await createPage(`Page ${deckPages.length + 1}`);
    if (created) {
      setPageGroupStates((prev) => ({
        ...prev,
        [created.pageId]: prev[created.pageId] ?? { ...DEFAULT_GROUP_STATE.canvas },
      }));
      setActivePageId(created.pageId);
    }
  }, [createPage, deckPages.length, setActivePageId]);

  const handleDuplicatePage = useCallback(
    async (pageId: string) => {
      const duplicate = await duplicatePage(pageId);
      if (duplicate) {
        setPageGroupStates((prev) => ({
          ...prev,
          [duplicate.pageId]: prev[pageId] ?? { ...DEFAULT_GROUP_STATE.canvas },
        }));
        setActivePageId(duplicate.pageId);
      }
    },
    [duplicatePage, setActivePageId]
  );

  const handleMovePage = useCallback(
    (pageId: string, direction: "up" | "down") => {
      void pageId;
      void direction;
      notify("info", "Reordering pages will be available soon.");
    },
    []
  );

  const handleSelectLayer = useCallback((layer: LayerGroupKey) => {
    void layer;
    /* Canvas is the only layer in this release */
  }, []);

  const handleToggleLayerVisibility = useCallback(
    (pageId: string, layer: LayerGroupKey) => {
      if (layer !== "canvas") return;
      setPageGroupStates((prev) => {
        const next = { ...prev };
        const current = next[pageId] ?? { ...DEFAULT_GROUP_STATE.canvas };
        next[pageId] = { ...current, visible: !current.visible };
        return next;
      });
    },
    []
  );

  const handleChangeLayerOpacity = useCallback(
    (pageId: string, layer: LayerGroupKey, value: number) => {
      if (layer !== "canvas") return;
      setPageGroupStates((prev) => {
        const next = { ...prev };
        const current = next[pageId] ?? { ...DEFAULT_GROUP_STATE.canvas };
        next[pageId] = {
          ...current,
          opacity: Math.min(1, Math.max(0, value)),
        };
        return next;
      });
    },
    []
  );

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
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    window.hasUnsavedChanges = () => hasUnsavedChanges;
    window.unsavedChanges = hasUnsavedChanges;
    return () => {
      delete window.hasUnsavedChanges;
      delete window.unsavedChanges;
    };
  }, [hasUnsavedChanges]);

  const handleCanvasChange = useCallback(
    (canvasJson: string) => {
      if (!activeDeckPage) return;
      setHasUnsavedChanges(true);
      syncCanvas(activeDeckPage.pageId, canvasJson);
    },
    [activeDeckPage, syncCanvas]
  );

  const handleCanvasSave = useCallback(
    async (canvasJson: string) => {
      if (!activeDeckPage || !resolvedProjectId) {
        throw new Error("Select a page before saving.");
      }
      setIsSavingCanvas(true);
      try {
        syncCanvas(activeDeckPage.pageId, canvasJson);
        await upsertDeckPage(resolvedProjectId, activeDeckPage.pageId, { canvasJson });
        await refreshDeckPages();
        setHasUnsavedChanges(false);
      } catch (err) {
        throw err instanceof Error ? err : new Error(String(err));
      } finally {
        setIsSavingCanvas(false);
      }
    },
    [activeDeckPage, resolvedProjectId, syncCanvas, refreshDeckPages]
  );

  const layerNodes = useMemo(
    () => ({
      canvas: (
        <DesignerComponent
          ref={designerRef}
          documentJson={activeDeckPage?.canvasJson ?? ""}
          documentVersion={activeDeckPage?.revision ?? 0}
          onDocumentChange={handleCanvasChange}
          onSave={handleCanvasSave}
          isSaving={isSavingCanvas}
          readOnly={!activeDeckPage || deckLoading}
        />
      ),
    }),
    [
      activeDeckPage,
      deckLoading,
      handleCanvasChange,
      handleCanvasSave,
      isSavingCanvas,
    ]
  );

  const toolbarProps = useMemo(
    () => ({
      initialMode: activeLayer,
      onPreview: () => setPreviewOpen(true),
      onSelectTool: handleSelectTool,
      onFreeDraw: handleBrushTool,
      onAddRectangle: handleRectTool,
      onAddText: handleTextTool,
      onAddImage: handleImageTool,
      onColorChange: handleColorChange,
      onUndo: handleUndo,
      onRedo: handleRedo,
      onCopy: handleCopy,
      onPaste: handlePaste,
      onDelete: handleDelete,
      onClearCanvas: handleClearCanvas,
      onSave: handleSave,
    }),
    [
      activeLayer,
      handleBrushTool,
      handleClearCanvas,
      handleColorChange,
      handleCopy,
      handleDelete,
      handleImageTool,
      handlePaste,
      handleRectTool,
      handleRedo,
      handleSave,
      handleSelectTool,
      handleTextTool,
      handleUndo,
      setPreviewOpen,
    ]
  );

  const buildDownloadLink = useCallback((dataUri: string, filename: string) => {
    if (typeof document === "undefined") return;
    const link = document.createElement("a");
    link.href = dataUri;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const safeFilename = useCallback((name: string, extension: string) => {
    const base = name.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
    return `${base || "deck-page"}.${extension}`;
  }, []);

  const handleExportPDF = useCallback(async () => {
    if (!activeDeckPage) {
      notify("error", "Select a page to export.");
      return;
    }
    const result = await exportPage(activeDeckPage.pageId);
    if (!result) return;
    if (result.pdfDataUri) {
      const filename =
        result.suggestedFilenames?.pdf ?? safeFilename(activeDeckPage.name, "pdf");
      buildDownloadLink(result.pdfDataUri, filename);
      notify("success", "PDF export ready.");
    } else {
      notify("info", "No PDF export available yet.");
    }
  }, [activeDeckPage, buildDownloadLink, exportPage, safeFilename]);

  const handleExportGallery = useCallback(async () => {
    if (!activeDeckPage) {
      notify("error", "Select a page to export.");
      return;
    }
    const result = await exportPage(activeDeckPage.pageId);
    if (!result) return;
    if (result.siteDataUri) {
      const filename =
        result.suggestedFilenames?.site ?? safeFilename(activeDeckPage.name, "html");
      buildDownloadLink(result.siteDataUri, filename);
      notify("success", "Site export ready.");
    } else {
      notify("info", "No site export available yet.");
    }
  }, [activeDeckPage, buildDownloadLink, exportPage, safeFilename]);

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
          <QuickLinksComponent ref={quickLinksRef} hideTrigger />
          <FileManagerComponent
            isOpen={filesOpen}
            onRequestClose={() => setFilesOpen(false)}
            showTrigger={false}
            folder="uploads"
          />
          <SheetEditor
            pages={sheetPages}
            activePageId={activePageId}
            activeLayer={activeLayer}
            onSelectPage={handleSelectPage}
            onAddPage={handleAddPage}
            onDuplicatePage={handleDuplicatePage}
            onMovePage={handleMovePage}
            onSelectLayer={handleSelectLayer}
            onToggleLayerVisibility={handleToggleLayerVisibility}
            onChangeLayerOpacity={handleChangeLayerOpacity}
            layerNodes={layerNodes}
            toolbarProps={toolbarProps}
          />
          <PreviewDrawer
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            url={activeProject?.previewUrl ?? ""}
            onExportGallery={handleExportGallery}
            onExportPDF={handleExportPDF}
          />
        </div>
      </div>
    </ProjectPageLayout>
  );
};

export default EditorPage;









