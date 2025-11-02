import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import classNames from "classnames";
import PageRail from "./PageRail";
import FabricStage from "./FabricStage";
import { STAGE_BASE_HEIGHT, STAGE_BASE_WIDTH } from "./stageDimensions";
import LayerTree from "./LayerTree";
import Inspector from "./Inspector";
import UnifiedToolbar from "../UnifiedToolbar";
import {
  DEFAULT_MODE_DEFINITIONS,
  type EditorMode,
  type ModeDefinition,
} from "../toolbarModes";
import SidebarTabs, {
  type SidebarTabKey,
} from "./SidebarTabs";
import styles from "./SheetEditor.module.css";
import type {
  LayerGroupKey,
  SheetPageState,
} from "@/dashboard/project/features/editor/types/sheet";

type LayerRenderer = (
  page: SheetPageState,
  options: { isActive: boolean }
) => React.ReactNode;

interface SheetEditorProps {
  pages: SheetPageState[];
  activePageId: string;
  activeLayer: LayerGroupKey;
  onSelectPage: (pageId: string) => void;
  onAddPage: () => void;
  onDuplicatePage: (pageId: string) => void;
  onMovePage: (pageId: string, direction: "up" | "down") => void;
  onSelectLayer: (layer: LayerGroupKey) => void;
  onToggleLayerVisibility: (pageId: string, layer: LayerGroupKey) => void;
  onChangeLayerOpacity: (pageId: string, layer: LayerGroupKey, value: number) => void;
  layerNodes: Record<LayerGroupKey, LayerRenderer>;
  toolbarProps: ComponentProps<typeof UnifiedToolbar>;
}

const SheetEditor: React.FC<SheetEditorProps> = ({
  pages,
  activePageId,
  activeLayer,
  onSelectPage,
  onAddPage,
  onDuplicatePage,
  onMovePage,
  onSelectLayer,
  onToggleLayerVisibility,
  onChangeLayerOpacity,
  layerNodes,
  toolbarProps,
}) => {
  const [pageRailCollapsed, setPageRailCollapsed] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTabKey>("properties");
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const focusEntryRailState = useRef(pageRailCollapsed);
  const wasFocusMode = useRef(false);

  const modes: ModeDefinition[] = useMemo(
    () => toolbarProps.modes ?? DEFAULT_MODE_DEFINITIONS,
    [toolbarProps.modes]
  );
  const initialMode: EditorMode = useMemo(
    () => toolbarProps.initialMode ?? modes[0]?.key ?? "canvas",
    [modes, toolbarProps.initialMode]
  );
  const [activeMode, setActiveMode] = useState<EditorMode>(initialMode);

  useEffect(() => {
    setActiveMode(initialMode);
  }, [initialMode]);

  const handleModeChange = useCallback(
    (mode: EditorMode) => {
      setActiveMode(mode);
      toolbarProps.onModeChange?.(mode);
    },
    [toolbarProps]
  );

  const activePage = pages.find((page) => page.id === activePageId);

  const handleToggleVisibility = useCallback(
    (layer: LayerGroupKey) => {
      if (!activePage) return;
      onToggleLayerVisibility(activePage.id, layer);
    },
    [activePage, onToggleLayerVisibility]
  );

  const handleOpacityChange = useCallback(
    (layer: LayerGroupKey, value: number) => {
      if (!activePage) return;
      onChangeLayerOpacity(activePage.id, layer, value);
    },
    [activePage, onChangeLayerOpacity]
  );

  const handleToggleFocusMode = useCallback(() => {
    setIsFocusMode((previous) => !previous);
  }, []);

  const handleTogglePageRail = useCallback(() => {
    setPageRailCollapsed((previous) => !previous);
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((previous) => Math.min(Number((previous + 0.1).toFixed(2)), 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((previous) => Math.max(Number((previous - 0.1).toFixed(2)), 0.2));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(1);
  }, []);

  const handleZoomToFit = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const { clientWidth, clientHeight } = viewport;
    const widthScale = (clientWidth - 80) / STAGE_BASE_WIDTH;
    const heightScale = (clientHeight - 80) / STAGE_BASE_HEIGHT;
    const nextZoom = Math.min(widthScale, heightScale, 3);
    if (!Number.isFinite(nextZoom) || nextZoom <= 0) return;
    setZoom(Number(nextZoom.toFixed(2)));
  }, []);

  useEffect(() => {
    handleZoomToFit();
  }, [handleZoomToFit, activePageId, pageRailCollapsed, isFocusMode]);

  useEffect(() => {
    const handleResize = () => handleZoomToFit();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleZoomToFit]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) {
        return;
      }
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "b") {
        event.preventDefault();
        handleTogglePageRail();
      }
      if (!event.metaKey && !event.ctrlKey && key === "f") {
        event.preventDefault();
        handleToggleFocusMode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleToggleFocusMode, handleTogglePageRail]);

  useEffect(() => {
    if (isFocusMode && !wasFocusMode.current) {
      focusEntryRailState.current = pageRailCollapsed;
      setPageRailCollapsed(true);
      setActiveSidebarTab("properties");
    }

    if (!isFocusMode && wasFocusMode.current) {
      setPageRailCollapsed(focusEntryRailState.current);
    }

    wasFocusMode.current = isFocusMode;
  }, [isFocusMode, pageRailCollapsed]);

  const sidebarPanels = useMemo(
    () => ({
      properties: <Inspector page={activePage} activeLayer={activeLayer} />,
      layers: (
        <LayerTree
          page={activePage}
          activeLayer={activeLayer}
          onSelectLayer={onSelectLayer}
          onToggleVisibility={handleToggleVisibility}
          onChangeOpacity={handleOpacityChange}
          disabled={!activePage}
        />
      ),
      assets: (
        <div className={styles.assetsPlaceholder}>
          <h4>Assets</h4>
          <p>Drop brand images or colours here to reuse them across pages.</p>
          <button type="button" onClick={toolbarProps.onAddImage}>
            Upload asset
          </button>
        </div>
      ),
    }),
    [
      activeLayer,
      activePage,
      handleOpacityChange,
      handleToggleVisibility,
      onSelectLayer,
      toolbarProps.onAddImage,
    ]
  );

  const shellClassName = classNames(styles.sheetEditor, {
    [styles.pageRailCollapsed]: pageRailCollapsed,
    [styles.focusMode]: isFocusMode,
  });

  const stageSummary = activePage
    ? `${modes.find((mode) => mode.key === activeMode)?.label ?? "Canvas"} · ${activePage.name}`
    : "Select a page";

  return (
    <div className={shellClassName}>
      <div className={styles.stageToolbar}>
        <UnifiedToolbar
          {...toolbarProps}
          activeMode={activeMode}
          isFocusMode={isFocusMode}
          onToggleFocusMode={handleToggleFocusMode}
          zoom={zoom}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onZoomToFit={handleZoomToFit}
          onResetZoom={handleZoomReset}
        />
      </div>
      <div className={styles.modeTabs} role="tablist" aria-label="Editor mode">
        {modes.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => handleModeChange(key)}
            className={classNames(styles.modeTab, {
              [styles.modeTabActive]: activeMode === key,
            })}
            role="tab"
            aria-selected={activeMode === key}
          >
            {Icon ? <Icon size={16} aria-hidden="true" /> : null}
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className={styles.editorBody}>
        <aside
          className={classNames(styles.pageRail, {
            [styles.hiddenPanel]: isFocusMode,
          })}
        >
          <PageRail
            pages={pages}
            activePageId={activePageId}
            onSelect={onSelectPage}
            onAdd={onAddPage}
            onDuplicate={onDuplicatePage}
            onMove={onMovePage}
            collapsed={pageRailCollapsed}
            onToggleCollapse={handleTogglePageRail}
          />
        </aside>
        <main className={styles.stageColumn}>
          <header className={styles.stageHeader}>{stageSummary}</header>
          <div className={styles.stageViewport} ref={viewportRef}>
            <FabricStage
              pages={pages}
              activePageId={activePageId}
              activeLayer={activeLayer}
              layerNodes={layerNodes}
              zoom={zoom}
              onSelectPage={onSelectPage}
            />
            <div className={styles.zoomControls} aria-label="Zoom controls">
              <button type="button" onClick={handleZoomOut} aria-label="Zoom out">
                –
              </button>
              <span>{`${Math.round(zoom * 100)}%`}</span>
              <button type="button" onClick={handleZoomIn} aria-label="Zoom in">
                +
              </button>
              <div className={styles.zoomDivider} aria-hidden="true" />
              <button type="button" onClick={handleZoomToFit}>
                Fit
              </button>
              <button type="button" onClick={handleZoomReset}>
                100%
              </button>
            </div>
          </div>
        </main>
        <aside className={classNames(styles.sidebar, {
          [styles.hiddenPanel]: isFocusMode,
        })}
        >
          <SidebarTabs
            activeTab={activeSidebarTab}
            onChange={setActiveSidebarTab}
            panels={sidebarPanels}
          />
        </aside>
      </div>
    </div>
  );
};

export default SheetEditor;
