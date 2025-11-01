import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import classNames from "classnames";
import { PanelLeftClose, PanelRight, PanelsTopLeft } from "lucide-react";
import styles from "./SheetEditor.module.css";
import PageRail from "./PageRail";
import FabricStage from "./FabricStage";
import LayerTree from "./LayerTree";
import Inspector from "./Inspector";
import UnifiedToolbar from "../UnifiedToolbar";
import type {
  LayerGroupKey,
  SheetPageState,
} from "@/dashboard/project/features/editor/types/sheet";

const MODE_TABS: Array<{ key: LayerGroupKey; label: string }> = [
  { key: "brief", label: "Brief" },
  { key: "canvas", label: "Canvas" },
  { key: "moodboard", label: "Moodboard" },
];

type SidebarTabKey = "properties" | "layers" | "assets";

const SIDEBAR_TABS: Array<{ key: SidebarTabKey; label: string }> = [
  { key: "properties", label: "Properties" },
  { key: "layers", label: "Layers" },
  { key: "assets", label: "Assets" },
];

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;

const BASE_STAGE_WIDTH = 1280;
const BASE_STAGE_HEIGHT = BASE_STAGE_WIDTH / (16 / 9);

const isEditingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const editable = target.getAttribute("contenteditable");
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    editable === "" ||
    editable === "true"
  );
};

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
  onChangeLayerOpacity: (
    pageId: string,
    layer: LayerGroupKey,
    value: number,
  ) => void;
  layerNodes: Record<LayerGroupKey, React.ReactNode>;
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
  const [isPageRailCollapsed, setPageRailCollapsed] = useState(false);
  const [isFocusMode, setFocusMode] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTabKey>(
    "properties",
  );
  const [zoom, setZoom] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);
  const [fitActive, setFitActive] = useState(true);
  const stageViewportRef = useRef<HTMLDivElement | null>(null);

  const activePage = pages.find((page) => page.id === activePageId);

  const { onModeChange, ...toolbarRest } = toolbarProps;

  const availableModes = useMemo(() => MODE_TABS, []);

  useEffect(() => {
    const node = stageViewportRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = node;
      if (clientWidth === 0 || clientHeight === 0) return;
      const nextFit = Math.min(
        clientWidth / BASE_STAGE_WIDTH,
        clientHeight / BASE_STAGE_HEIGHT,
        MAX_ZOOM,
      );
      setFitZoom(Math.max(nextFit, MIN_ZOOM));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (fitActive) {
      setZoom(fitZoom);
    }
  }, [fitActive, fitZoom]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditingTarget(event.target)) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setPageRailCollapsed((prev) => !prev);
        return;
      }

      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        setFocusMode((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleToggleVisibility = (layer: LayerGroupKey) => {
    if (!activePage) return;
    onToggleLayerVisibility(activePage.id, layer);
  };

  const handleOpacityChange = (layer: LayerGroupKey, value: number) => {
    if (!activePage) return;
    onChangeLayerOpacity(activePage.id, layer, value);
  };

  const handleModeSelect = (mode: LayerGroupKey) => {
    if (mode === activeLayer) return;
    onModeChange?.(mode);
    onSelectLayer(mode);
  };

  const handleZoomIn = () => {
    setFitActive(false);
    setZoom((prev) => Math.min(Math.round((prev + 0.1) * 100) / 100, MAX_ZOOM));
  };

  const handleZoomOut = () => {
    setFitActive(false);
    setZoom((prev) => Math.max(Math.round((prev - 0.1) * 100) / 100, MIN_ZOOM));
  };

  const handleFitZoom = () => {
    setFitActive(true);
  };

  const handleResetZoom = () => {
    setFitActive(false);
    setZoom(1);
  };

  const pageRailWidth = isFocusMode || isPageRailCollapsed ? 0 : 240;
  const sidebarWidth = isFocusMode ? 0 : 320;

  const gridTemplateColumns = `${pageRailWidth}px 1fr ${sidebarWidth}px`;

  return (
    <div className={styles.sheetEditor}>
      <div className={styles.toolbarWrapper}>
        <UnifiedToolbar
          {...toolbarRest}
          mode={activeLayer}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFit={handleFitZoom}
          onResetZoom={handleResetZoom}
          onToggleFocusMode={() => setFocusMode((prev) => !prev)}
          isFocusMode={isFocusMode}
          zoom={zoom}
        />
      </div>
      <div className={styles.sheetBody} style={{ gridTemplateColumns }}>
        <aside
          className={classNames(styles.pageColumn, {
            [styles.hiddenColumn]: pageRailWidth === 0,
          })}
          aria-hidden={pageRailWidth === 0}
        >
          {pageRailWidth === 0 ? (
            <div className={styles.collapsedRail}>Pages hidden</div>
          ) : (
            <PageRail
              pages={pages}
              activePageId={activePageId}
              onSelect={onSelectPage}
              onAdd={onAddPage}
              onDuplicate={onDuplicatePage}
              onMove={onMovePage}
            />
          )}
        </aside>
        <main className={styles.stageColumn}>
          <div className={styles.stageChrome}>
            <div className={styles.stageMeta}>
              <button
                type="button"
                className={styles.railToggle}
                onClick={() => setPageRailCollapsed((prev) => !prev)}
                aria-pressed={!isPageRailCollapsed}
                title={isPageRailCollapsed ? "Show page thumbnails" : "Hide page thumbnails"}
              >
                {isPageRailCollapsed ? (
                  <PanelsTopLeft size={16} aria-hidden="true" />
                ) : (
                  <PanelLeftClose size={16} aria-hidden="true" />
                )}
                <span>Pages</span>
              </button>
              <div className={styles.pageDetails}>
                <h2>{activePage ? activePage.name : "No page selected"}</h2>
                <span>
                  {activePage
                    ? activePage.isSuperSheet
                      ? "All layers"
                      : "Single page"
                    : "Select a page"}
                </span>
              </div>
            </div>
            <div className={styles.modeTabs} role="tablist" aria-label="Layer modes">
              {availableModes.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  className={classNames(styles.modeTab, {
                    [styles.modeTabActive]: key === activeLayer,
                  })}
                  aria-selected={key === activeLayer}
                  onClick={() => handleModeSelect(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.stageViewport} ref={stageViewportRef}>
            <FabricStage
              page={activePage}
              activeLayer={activeLayer}
              layerNodes={layerNodes}
              zoom={zoom}
              baseWidth={BASE_STAGE_WIDTH}
              baseHeight={BASE_STAGE_HEIGHT}
            />
            <div className={styles.zoomHud}>
              <span>{`${Math.round(zoom * 100)}%`}</span>
              <div className={styles.zoomButtons}>
                <button type="button" onClick={handleFitZoom} title="Fit to screen">
                  Fit
                </button>
                <button type="button" onClick={handleResetZoom} title="Reset zoom">
                  100%
                </button>
              </div>
            </div>
          </div>
        </main>
        <aside
          className={classNames(styles.sidebarColumn, {
            [styles.hiddenColumn]: sidebarWidth === 0,
          })}
          aria-hidden={sidebarWidth === 0}
        >
          {sidebarWidth === 0 ? (
            <div className={styles.collapsedSidebar}>Sidebar hidden</div>
          ) : (
            <div className={styles.sidebarTabs}>
              <div role="tablist" className={styles.sidebarTabList} aria-label="Inspector tabs">
                {SIDEBAR_TABS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={activeSidebarTab === key}
                    className={classNames(styles.sidebarTabButton, {
                      [styles.sidebarTabActive]: activeSidebarTab === key,
                    })}
                    onClick={() => setActiveSidebarTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className={styles.sidebarPanel}>
                {activeSidebarTab === "properties" && (
                  <Inspector page={activePage} activeLayer={activeLayer} />
                )}
                {activeSidebarTab === "layers" && (
                  <LayerTree
                    page={activePage}
                    activeLayer={activeLayer}
                    onSelectLayer={onSelectLayer}
                    onToggleVisibility={handleToggleVisibility}
                    onChangeOpacity={handleOpacityChange}
                    disabled={!activePage}
                  />
                )}
                {activeSidebarTab === "assets" && (
                  <div className={styles.assetsPlaceholder}>
                    <PanelRight size={16} aria-hidden="true" />
                    <p>Drop brand assets here to reuse across slides.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default SheetEditor;
