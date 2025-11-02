import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import ProjectPageLayout from "@/dashboard/project/components/Shared/ProjectPageLayout";
import ProjectHeader from "@/dashboard/project/components/Shared/ProjectHeader";
import FabricRealtimeCanvas, {
  type RealtimeDesignerHandle,
} from "@/dashboard/project/features/editor/components/FabricRealtimeCanvas";
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
import { Project } from "@/app/contexts/DataProvider";
import { useSocket } from "@/app/contexts/useSocket";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import { notify } from "@/shared/ui/ToastNotifications";
import { DECK_EXPORT_URL, apiFetch } from "@/shared/utils/api";
import { useProjectPalette } from "@/dashboard/project/hooks/useProjectPalette";
import { resolveProjectCoverUrl } from "@/dashboard/project/utils/theme";

const LAYER_KEYS: LayerGroupKey[] = ["canvas"];

const generateId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

const createGroupStates = (
  overrides?: Partial<Record<LayerGroupKey, Partial<LayerGroupState>>>
): Record<LayerGroupKey, LayerGroupState> => {
  const base: Record<LayerGroupKey, LayerGroupState> = {
    canvas: { visible: true, opacity: 1 },
  };
  if (!overrides) return base;
  return {
    canvas: { ...base.canvas, ...overrides.canvas },
  };
};

const cloneGroupStates = (
  states: Record<LayerGroupKey, LayerGroupState>
): Record<LayerGroupKey, LayerGroupState> => {
  return {
    canvas: { ...states.canvas },
  };
};

const createPageState = (
  name: string,
  overrides?: Partial<Record<LayerGroupKey, Partial<LayerGroupState>>>
): SheetPageState => ({
  id: generateId("page"),
  name,
  groupStates: createGroupStates(overrides),
});

const createSuperSheetState = (): SheetPageState => ({
  id: "super-sheet",
  name: "One Sheet",
  isSuperSheet: true,
  groupStates: createGroupStates({}),
});

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
  const designerRef = useRef<RealtimeDesignerHandle | null>(null);
  const initialPageIdRef = useRef<string | null>(null);
  const [pages, setPages] = useState<SheetPageState[]>(() => {
    const firstPage = createPageState("Page 1");
    const superSheet = createSuperSheetState();
    initialPageIdRef.current = firstPage.id;
    return [firstPage, superSheet];
  });
  const [activePageId, setActivePageId] = useState<string>(
    () => initialPageIdRef.current ?? ""
  );
  const [activeLayer, setActiveLayer] = useState<LayerGroupKey>("canvas");

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
      if (pageId === activePageId) return;
      setActivePageId(pageId);
    },
    [activePageId]
  );

  const handleAddPage = useCallback(() => {
    const regular = pages.filter((page) => !page.isSuperSheet);
    const newPage = createPageState(`Page ${regular.length + 1}`);
    const superSheet = pages.find((page) => page.isSuperSheet);
    const nextRegular = [...regular, newPage];
    const nextPages = superSheet ? [...nextRegular, superSheet] : nextRegular;
    setPages(nextPages);
    setActivePageId(newPage.id);
  }, [pages]);

  const handleDuplicatePage = useCallback(
    (pageId: string) => {
      const target = pages.find(
        (page) => page.id === pageId && !page.isSuperSheet
      );
      if (!target) return;
      const duplicate: SheetPageState = {
        ...target,
        id: generateId("page"),
        name: `${target.name} Copy`,
        groupStates: cloneGroupStates(target.groupStates),
      };
      const regular = pages.filter((page) => !page.isSuperSheet);
      const index = regular.findIndex((page) => page.id === pageId);
      const superSheet = pages.find((page) => page.isSuperSheet);
      const nextRegular = [...regular];
      nextRegular.splice(index + 1, 0, duplicate);
      const nextPages = superSheet ? [...nextRegular, superSheet] : nextRegular;
      setPages(nextPages);
      setActivePageId(duplicate.id);
    },
    [pages]
  );

  const handleMovePage = useCallback(
    (pageId: string, direction: "up" | "down") => {
      const regular = pages.filter((page) => !page.isSuperSheet);
      const index = regular.findIndex((page) => page.id === pageId);
      if (index === -1) return;
      const nextIndex =
        direction === "up"
          ? Math.max(0, index - 1)
          : Math.min(regular.length - 1, index + 1);
      if (nextIndex === index) return;
      const reordered = [...regular];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(nextIndex, 0, moved);
      const superSheet = pages.find((page) => page.isSuperSheet);
      const nextPages = superSheet ? [...reordered, superSheet] : reordered;
      setPages(nextPages);
    },
    [pages]
  );

  const handleSelectLayer = useCallback(
    (layer: LayerGroupKey) => {
      if (layer === activeLayer) return;
      setActiveLayer(layer);
    },
    [activeLayer]
  );

  const handleToggleLayerVisibility = useCallback(
    (pageId: string, layer: LayerGroupKey) => {
      setPages((prev) =>
        prev.map((page) => {
          if (page.id !== pageId) return page;
          const current = page.groupStates[layer];
          return {
            ...page,
            groupStates: {
              ...page.groupStates,
              [layer]: { ...current, visible: !current.visible },
            },
          };
        })
      );
    },
    []
  );

  const handleChangeLayerOpacity = useCallback(
    (pageId: string, layer: LayerGroupKey, value: number) => {
      setPages((prev) =>
        prev.map((page) => {
          if (page.id !== pageId) return page;
          return {
            ...page,
            groupStates: {
              ...page.groupStates,
              [layer]: {
                ...page.groupStates[layer],
                opacity: Math.min(1, Math.max(0, value)),
              },
            },
          };
        })
      );
    },
    []
  );

  const handleToolbarModeChange = useCallback(
    (mode: string) => {
      if (!LAYER_KEYS.includes(mode as LayerGroupKey)) return;
      const layer = mode as LayerGroupKey;
      if (layer === activeLayer) return;
      setActiveLayer(layer);
    },
    [activeLayer]
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
  const activePage = useMemo(
    () => pages.find((page) => page.id === activePageId) ?? null,
    [pages, activePageId]
  );

  const layerRenderers = useMemo(
    () => ({
      canvas: ({ page, isActive }: { page: SheetPageState; isActive: boolean }) => (
        <FabricRealtimeCanvas
          ref={(instance) => {
            if (isActive) {
              designerRef.current = instance;
            }
            if (!instance && designerRef.current && page.id === activePageId) {
              designerRef.current = null;
            }
          }}
          projectId={activeProject?.projectId}
          pageId={page.id}
          pageName={page.name}
        />
      ),
    }),
    [activePageId, activeProject?.projectId]
  );

  const exportDeck = useCallback(
    async (format: "pdf" | "site") => {
      if (!activeProject?.projectId || !activePage?.id) {
        notify("error", "Select a project page before exporting.");
        return null;
      }
      const state = designerRef.current?.getCanvasJson();
      try {
        const response = await apiFetch<{
          pdf?: string;
          site?: string;
        }>(DECK_EXPORT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: activeProject.projectId,
            pageId: activePage.id,
            format,
            state: state ?? undefined,
          }),
        });
        return response;
      } catch (error) {
        console.error("Deck export failed", error);
        notify("error", "Export failed. Please try again.");
        return null;
      }
    },
    [activePage?.id, activeProject?.projectId]
  );

  const handleExportPdf = useCallback(async () => {
    const result = await exportDeck("pdf");
    const pdf = result?.pdf;
    if (pdf) {
      window.open(pdf, "_blank", "noopener");
      notify("success", "PDF export ready in a new tab.");
    }
  }, [exportDeck]);

  const handleExportSite = useCallback(async () => {
    const result = await exportDeck("site");
    const site = result?.site;
    if (site) {
      window.open(site, "_blank", "noopener");
      notify("success", "Live site export opened in a new tab.");
    }
  }, [exportDeck]);

  const toolbarProps = useMemo(
    () => ({
      initialMode: activeLayer,
      onModeChange: handleToolbarModeChange,
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
      handleToolbarModeChange,
      handleTextTool,
      handleUndo,
      setPreviewOpen,
    ]
  );

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
            pages={pages}
            activePageId={activePageId}
            activeLayer={activeLayer}
            onSelectPage={handleSelectPage}
            onAddPage={handleAddPage}
            onDuplicatePage={handleDuplicatePage}
            onMovePage={handleMovePage}
            onSelectLayer={handleSelectLayer}
            onToggleLayerVisibility={handleToggleLayerVisibility}
            onChangeLayerOpacity={handleChangeLayerOpacity}
            layerRenderers={layerRenderers}
            toolbarProps={toolbarProps}
          />
          <PreviewDrawer
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            url={activeProject?.previewUrl as string}
            onExportSite={handleExportSite}
            onExportPDF={handleExportPdf}
          />
        </div>
      </div>
    </ProjectPageLayout>
  );
};

export default EditorPage;









