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
import {
  createDeckPage,
  fetchDeckPages,
  reorderDeckPages,
} from "@/dashboard/project/features/editor/api/deckPages";
import { useData } from "@/app/contexts/useData";
import { Project } from "@/app/contexts/DataProvider";
import { useSocket } from "@/app/contexts/useSocket";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import { notify } from "@/shared/ui/ToastNotifications";
import { DECK_EXPORT_URL, apiFetch } from "@/shared/utils/api";
import { useProjectPalette } from "@/dashboard/project/hooks/useProjectPalette";
import { resolveProjectCoverUrl } from "@/dashboard/project/utils/theme";

const LAYER_KEYS: LayerGroupKey[] = ["canvas"];

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
  id: string,
  name: string,
  overrides?: Partial<Record<LayerGroupKey, Partial<LayerGroupState>>>,
  options?: { isSuperSheet?: boolean; isPersisted?: boolean }
): SheetPageState => ({
  id,
  name,
  isSuperSheet: options?.isSuperSheet,
  isPersisted: options?.isPersisted ?? !options?.isSuperSheet,
  groupStates: createGroupStates(overrides),
});

const createSuperSheetState = (): SheetPageState =>
  createPageState("super-sheet", "One Sheet", {}, {
    isSuperSheet: true,
    isPersisted: false,
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
  const [superSheet, setSuperSheet] = useState<SheetPageState>(() =>
    createSuperSheetState()
  );
  const [regularPages, setRegularPages] = useState<SheetPageState[]>([]);
  const regularPagesRef = useRef<SheetPageState[]>(regularPages);
  useEffect(() => {
    regularPagesRef.current = regularPages;
  }, [regularPages]);
  const pages = useMemo(
    () => [...regularPages, superSheet],
    [regularPages, superSheet]
  );
  const [activePageId, setActivePageId] = useState<string>(superSheet.id);
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
    let cancelled = false;
    const loadDeckPages = async () => {
      try {
        const metadata = await fetchDeckPages(projectId);
        let normalized = metadata.filter((page) => !page.isSuperSheet);
        if (!normalized.length) {
          const created = await createDeckPage({
            projectId,
            name: "Page 1",
            afterPageId: null,
          });
          normalized = [created];
        }
        if (cancelled) return;
        setRegularPages((previous) => {
          const previousMap = new Map(previous.map((page) => [page.id, page]));
          return normalized.map((meta, index) => {
            const existing = previousMap.get(meta.pageId);
            if (existing) {
              return {
                ...existing,
                name: meta.name ?? existing.name,
                isPersisted: true,
              };
            }
            return createPageState(
              meta.pageId,
              meta.name ?? `Page ${index + 1}`,
              undefined,
              { isPersisted: true }
            );
          });
        });
        initialPageIdRef.current = normalized[0]?.pageId ?? null;
        setActivePageId((previous) => {
          if (
            previous &&
            normalized.some((meta) => typeof meta.pageId === "string" && meta.pageId === previous)
          ) {
            return previous;
          }
          return normalized[0]?.pageId ?? superSheet.id;
        });
      } catch (error) {
        console.error("Failed to load deck pages", error);
        if (cancelled) return;
        if (regularPagesRef.current.length === 0) {
          const fallbackId = `local-${Date.now()}`;
          const fallbackPage = createPageState(
            fallbackId,
            "Page 1",
            undefined,
            { isPersisted: false }
          );
          setRegularPages([fallbackPage]);
          initialPageIdRef.current = fallbackId;
          setActivePageId(fallbackId);
        }
        notify(
          "error",
          "Unable to load deck pages. Changes will stay local until reconnected."
        );
      }
    };
    void loadDeckPages();
    return () => {
      cancelled = true;
    };
  }, [projectId, superSheet.id, fetchDeckPages, createDeckPage]);

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
    const regular = regularPagesRef.current;
    const defaultName = `Page ${regular.length + 1}`;
    const offlineFallback = () => {
      const fallbackId = `local-${Date.now()}`;
      const fallbackPage = createPageState(
        fallbackId,
        defaultName,
        undefined,
        { isPersisted: false }
      );
      setRegularPages((previous) => [...previous, fallbackPage]);
      if (!regular.length) {
        initialPageIdRef.current = fallbackId;
      }
      setActivePageId(fallbackPage.id);
    };
    if (!projectId) {
      offlineFallback();
      notify(
        "warning",
        "Working offline. New pages will sync once reconnected."
      );
      return;
    }
    const lastPageId = regular.length ? regular[regular.length - 1].id : null;
    void (async () => {
      try {
        const metadata = await createDeckPage({
          projectId,
          name: defaultName,
          afterPageId: lastPageId,
        });
        const newPage = createPageState(
          metadata.pageId,
          metadata.name ?? defaultName,
          undefined,
          { isPersisted: true }
        );
        setRegularPages((previous) => [...previous, newPage]);
        setActivePageId(newPage.id);
      } catch (error) {
        console.error("Failed to create deck page", error);
        offlineFallback();
        notify(
          "error",
          "Couldn't create a new page. Changes will sync once reconnected."
        );
      }
    })();
  }, [projectId]);

  const handleDuplicatePage = useCallback(
    (pageId: string) => {
      const regular = regularPagesRef.current;
      const target = regular.find((page) => page.id === pageId);
      if (!target) return;
      const baseName = `${target.name} Copy`;
      const offlineFallback = () => {
        const fallbackId = `local-${Date.now()}`;
        const duplicate: SheetPageState = {
          ...target,
          id: fallbackId,
          name: baseName,
          isPersisted: false,
          groupStates: cloneGroupStates(target.groupStates),
        };
        setRegularPages((previous) => {
          const next = [...previous];
          const index = next.findIndex((page) => page.id === pageId);
          if (index === -1) return previous;
          next.splice(index + 1, 0, duplicate);
          return next;
        });
        setActivePageId(duplicate.id);
      };
      if (!projectId) {
        offlineFallback();
        notify(
          "warning",
          "Working offline. Duplicated pages will sync once reconnected."
        );
        return;
      }
      const insertAfterId = pageId;
      void (async () => {
        try {
          const metadata = await createDeckPage({
            projectId,
            name: baseName,
            afterPageId: insertAfterId,
            sourcePageId: pageId,
          });
          const duplicate: SheetPageState = {
            ...target,
            id: metadata.pageId,
            name: metadata.name ?? baseName,
            isPersisted: true,
            groupStates: cloneGroupStates(target.groupStates),
          };
          setRegularPages((previous) => {
            const next = [...previous];
            const index = next.findIndex((page) => page.id === pageId);
            if (index === -1) return previous;
            next.splice(index + 1, 0, duplicate);
            return next;
          });
          setActivePageId(duplicate.id);
        } catch (error) {
          console.error("Failed to duplicate deck page", error);
          offlineFallback();
          notify(
            "error",
            "Couldn't duplicate the page. Changes will sync once reconnected."
          );
        }
      })();
    },
    [projectId]
  );

  const handleMovePage = useCallback(
    (pageId: string, direction: "up" | "down") => {
      const regular = regularPagesRef.current;
      const previous = [...regular];
      const index = previous.findIndex((page) => page.id === pageId);
      if (index === -1) return;
      const nextIndex =
        direction === "up"
          ? Math.max(0, index - 1)
          : Math.min(previous.length - 1, index + 1);
      if (nextIndex === index) return;
      const reordered = [...previous];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(nextIndex, 0, moved);
      setRegularPages(reordered);
      if (!projectId) return;
      void (async () => {
        try {
          await reorderDeckPages(
            projectId,
            reordered.map((page) => page.id)
          );
        } catch (error) {
          console.error("Failed to reorder deck pages", error);
          notify(
            "error",
            "Couldn't reorder pages. Restoring previous order."
          );
          setRegularPages(previous);
        }
      })();
    },
    [projectId]
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
      if (pageId === superSheet.id) {
        setSuperSheet((previous) => {
          const current = previous.groupStates[layer];
          return {
            ...previous,
            groupStates: {
              ...previous.groupStates,
              [layer]: { ...current, visible: !current.visible },
            },
          };
        });
        return;
      }
      setRegularPages((prev) =>
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
    [superSheet.id]
  );

  const handleChangeLayerOpacity = useCallback(
    (pageId: string, layer: LayerGroupKey, value: number) => {
      const normalized = Math.min(1, Math.max(0, value));
      if (pageId === superSheet.id) {
        setSuperSheet((previous) => ({
          ...previous,
          groupStates: {
            ...previous.groupStates,
            [layer]: {
              ...previous.groupStates[layer],
              opacity: normalized,
            },
          },
        }));
        return;
      }
      setRegularPages((prev) =>
        prev.map((page) => {
          if (page.id !== pageId) return page;
          return {
            ...page,
            groupStates: {
              ...page.groupStates,
              [layer]: {
                ...page.groupStates[layer],
                opacity: normalized,
              },
            },
          };
        })
      );
    },
    [superSheet.id]
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

  const layerNodes = useMemo(
    () => ({
      canvas: (
        page: SheetPageState,
        { isActive }: { isActive: boolean }
      ) => (
        <FabricRealtimeCanvas
          ref={(instance) => {
            if (isActive) {
              designerRef.current = instance;
            } else if (designerRef.current === instance) {
              designerRef.current = null;
            }
          }}
          projectId={activeProject?.projectId}
          pageId={page.id}
          pageName={page.name}
          isActive={isActive}
          joinEnabled={!page.isSuperSheet && page.isPersisted !== false}
        />
      ),
    }),
    [activeProject?.projectId, designerRef]
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
            layerNodes={layerNodes}
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









