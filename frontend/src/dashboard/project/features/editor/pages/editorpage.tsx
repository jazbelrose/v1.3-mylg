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
import { useData } from "@/app/contexts/useData";
import type { Project } from "@/app/contexts/DataProvider";
import { useSocket } from "@/app/contexts/useSocket";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import { notify } from "@/shared/ui/ToastNotifications";
import { useProjectPalette } from "@/dashboard/project/hooks/useProjectPalette";
import { resolveProjectCoverUrl } from "@/dashboard/project/utils/theme";
import useDeckRealtime from "@/dashboard/project/features/editor/hooks/useDeckRealtime";

const CANVAS_LAYER: LayerGroupKey = "canvas";
const DEFAULT_LAYER_STATE: LayerGroupState = { visible: true, opacity: 1 };

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
  const designerRef = useRef<DesignerRef>(null);

  const coverImage = useMemo(() => resolveProjectCoverUrl(activeProject), [activeProject]);
  const projectPalette = useProjectPalette(coverImage, { color: activeProject?.color });

  const {
    deck,
    pages: deckPages,
    activePageId,
    selectPage,
    addPage,
    duplicatePage,
    movePage,
    renamePage,
    updatePageCanvas,
    requestExport,
    isReady: deckReady,
    exportStatus,
  } = useDeckRealtime({ projectId, userId });

  const [layerState, setLayerState] = useState<Record<string, LayerGroupState>>({});

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
    if (!currentPath.includes("/editor")) return;

    const canonicalPath = getProjectDashboardPath(projectId, title, "/editor");
    if (currentPath === canonicalPath) return;

    navigate(canonicalPath, { replace: true });
  }, [projectId, activeProject?.title, initialActiveProject?.title, location.pathname, navigate]);

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

  useEffect(() => {
    setLayerState((prev) => {
      const next: Record<string, LayerGroupState> = {};
      let changed = false;
      deckPages.forEach((page) => {
        const existing = prev[page.id];
        if (existing) {
          next[page.id] = existing;
        } else {
          next[page.id] = DEFAULT_LAYER_STATE;
          changed = true;
        }
      });
      if (Object.keys(prev).length !== deckPages.length) {
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [deckPages]);

  useEffect(() => {
    if (!activePageId && deckPages[0]) {
      selectPage(deckPages[0].id);
    }
  }, [activePageId, deckPages, selectPage]);

  useEffect(() => {
    if (!exportStatus) return;
    if (exportStatus.action === "deck.export.ready") {
      const message = exportStatus.url
        ? `Deck export ready. Download from ${exportStatus.url}`
        : "Deck export is ready.";
      notify("success", message);
    } else if (exportStatus.action === "deck.export.ack") {
      notify("info", "Deck export queued.");
    }
  }, [exportStatus]);

  const activeSheetPageId = activePageId ?? deckPages[0]?.id ?? "";
  const activeDeckPage = useMemo(
    () => deckPages.find((page) => page.id === activeSheetPageId) ?? null,
    [deckPages, activeSheetPageId]
  );

  const sheetPages = useMemo<SheetPageState[]>(
    () =>
      deckPages.map((page) => ({
        id: page.id,
        name: page.name,
        groupStates: {
          [CANVAS_LAYER]: layerState[page.id] ?? DEFAULT_LAYER_STATE,
        } as Record<LayerGroupKey, LayerGroupState>,
      })),
    [deckPages, layerState]
  );

  const handleSelectPage = useCallback(
    (pageId: string) => {
      selectPage(pageId);
    },
    [selectPage]
  );

  const handleAddPage = useCallback(() => {
    addPage();
  }, [addPage]);

  const handleDuplicatePage = useCallback(
    (pageId: string) => {
      duplicatePage(pageId);
    },
    [duplicatePage]
  );

  const handleMovePage = useCallback(
    (pageId: string, direction: "up" | "down") => {
      movePage(pageId, direction);
    },
    [movePage]
  );

  const handleSelectLayer = useCallback(() => {
    // Single-layer canvas; nothing to change beyond ensuring selection
  }, []);

  const handleToggleLayerVisibility = useCallback(
    (pageId: string, layer: LayerGroupKey) => {
      if (layer !== CANVAS_LAYER) return;
      setLayerState((prev) => {
        const current = prev[pageId] ?? DEFAULT_LAYER_STATE;
        return {
          ...prev,
          [pageId]: { ...current, visible: !current.visible },
        };
      });
    },
    []
  );

  const handleChangeLayerOpacity = useCallback(
    (pageId: string, layer: LayerGroupKey, value: number) => {
      if (layer !== CANVAS_LAYER) return;
      const nextOpacity = Math.min(1, Math.max(0, value));
      setLayerState((prev) => {
        const current = prev[pageId] ?? DEFAULT_LAYER_STATE;
        return {
          ...prev,
          [pageId]: { ...current, opacity: nextOpacity },
        };
      });
    },
    []
  );

  const layerNodes = useMemo(
    () => ({
      canvas: (
        <DesignerComponent
          key={activeDeckPage?.id ?? "canvas"}
          ref={designerRef}
          documentId={activeDeckPage?.id}
          documentJson={activeDeckPage?.canvasJson ?? null}
          documentVersion={deck.version}
          onDocumentChange={(json) => {
            if (activeDeckPage) {
              updatePageCanvas(activeDeckPage.id, json);
            }
          }}
          onSave={(json) => {
            if (activeDeckPage) {
              updatePageCanvas(activeDeckPage.id, json);
            }
          }}
        />
      ),
    }),
    [activeDeckPage, deck.version, updatePageCanvas]
  );

  const toolbarProps = useMemo(
    () => ({
      initialMode: CANVAS_LAYER,
      onModeChange: () => undefined,
      onPreview: () => setPreviewOpen(true),
      onSelectTool: () => designerRef.current?.changeMode("select"),
      onFreeDraw: () => designerRef.current?.changeMode("brush"),
      onAddRectangle: () => designerRef.current?.changeMode("rect"),
      onAddText: () => designerRef.current?.addText(),
      onAddImage: () => designerRef.current?.triggerImageUpload(),
      onColorChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        designerRef.current?.handleColorChange(event.target.value),
      onUndo: () => designerRef.current?.handleUndo(),
      onRedo: () => designerRef.current?.handleRedo(),
      onCopy: () => designerRef.current?.handleCopy(),
      onPaste: () => designerRef.current?.handlePaste(),
      onDelete: () => designerRef.current?.handleDelete(),
      onClearCanvas: () => designerRef.current?.handleClear(),
      onSave: () => designerRef.current?.handleSave(),
    }),
    []
  );

  const parseStatusToNumber = (statusString: string | number | undefined | null): number => {
    if (statusString === undefined || statusString === null) return 0;
    const str = typeof statusString === "string" ? statusString : String(statusString);
    const num = Number.parseFloat(str.replace("%", ""));
    return Number.isNaN(num) ? 0 : num;
  };

  const handleProjectDeleted = (deletedProjectId: string) => {
    setProjects((prev) => prev.filter((project) => project.projectId !== deletedProjectId));
    setSelectedProjects((prev) => prev.filter((id) => id !== deletedProjectId));
    navigate("/dashboard/projects/allprojects");
  };

  const handleBack = () => {
    if (!projectId) {
      navigate("/dashboard/projects/allprojects");
      return;
    }
    const title = activeProject?.title ?? initialActiveProject?.title;
    navigate(getProjectDashboardPath(projectId, title));
  };

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
          onActiveProjectChange={setActiveProject}
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
            activePageId={activeSheetPageId}
            activeLayer={CANVAS_LAYER}
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
            url={activeProject?.previewUrl as string}
            onExportGallery={() => requestExport("site", activeDeckPage?.id)}
            onExportPDF={() => requestExport("pdf", activeDeckPage?.id)}
          />
          {!deckReady && (
            <div className="px-6 py-4 text-sm text-muted-foreground">Connecting to deck workspace…</div>
          )}
        </div>
      </div>
    </ProjectPageLayout>
  );
};

export default EditorPage;
