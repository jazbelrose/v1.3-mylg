import React, { useEffect, useState } from "react";
import type { ComponentProps } from "react";
import classNames from "classnames";
import styles from "./SheetEditor.module.css";
import PageRail from "./PageRail";
import FabricStage from "./FabricStage";
import LayerTree from "./LayerTree";
import Inspector from "./Inspector";
import UnifiedToolbar from "../UnifiedToolbar";
import SidebarTabs, { SidebarTabKey } from "./SidebarTabs";
import type {
  LayerGroupKey,
  SheetPageState,
} from "@/dashboard/project/features/editor/types/sheet";

const MODE_LABELS: Record<LayerGroupKey, string> = {
  brief: "Brief",
  canvas: "Canvas",
  moodboard: "Moodboard",
};

type ToolbarConfig = Omit<
  ComponentProps<typeof UnifiedToolbar>,
  "isFocusMode" | "onToggleFocusMode"
> & {
  zoomLabel?: string;
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
  onChangeLayerOpacity: (pageId: string, layer: LayerGroupKey, value: number) => void;
  layerNodes: Record<LayerGroupKey, React.ReactNode>;
  toolbarProps: ToolbarConfig;
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
  const [activeTab, setActiveTab] = useState<SidebarTabKey>("properties");
  const [focusMode, setFocusMode] = useState(false);

  const activePage = pages.find((page) => page.id === activePageId);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setPageRailCollapsed((prev) => !prev);
        return;
      }
      if (
        event.key.toLowerCase() === "f" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        setFocusMode((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (!focusMode) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFocusMode(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [focusMode]);

  const handleToggleFocus = () => setFocusMode((prev) => !prev);

  const handleToggleVisibility = (layer: LayerGroupKey) => {
    if (!activePage) return;
    onToggleLayerVisibility(activePage.id, layer);
  };

  const handleOpacityChange = (layer: LayerGroupKey, value: number) => {
    if (!activePage) return;
    onChangeLayerOpacity(activePage.id, layer, value);
  };

  const sidebarTabs = [
    {
      id: "properties" as SidebarTabKey,
      label: "Properties",
      content: <Inspector page={activePage} activeLayer={activeLayer} />,
    },
    {
      id: "layers" as SidebarTabKey,
      label: "Layers",
      content: (
        <LayerTree
          page={activePage}
          activeLayer={activeLayer}
          onSelectLayer={onSelectLayer}
          onToggleVisibility={handleToggleVisibility}
          onChangeOpacity={handleOpacityChange}
          disabled={!activePage}
        />
      ),
    },
    {
      id: "assets" as SidebarTabKey,
      label: "Assets",
      content: (
        <div className={styles.placeholderPanel}>
          <p>Drop brand assets here. Coming soon.</p>
        </div>
      ),
    },
  ];

  const stageMeta = activePage
    ? `${activePage.name}${activePage.isSuperSheet ? " · One sheet" : ""}`
    : "Select a page";

  return (
    <div className={classNames(styles.shell, { [styles.focusMode]: focusMode })}>
      <div className={styles.modeTabsRow} role="tablist" aria-label="Layer modes">
        {(Object.keys(MODE_LABELS) as LayerGroupKey[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeLayer === key}
            className={classNames(styles.modeTab, {
              [styles.modeTabActive]: activeLayer === key,
            })}
            onClick={() => onSelectLayer(key)}
          >
            {MODE_LABELS[key]}
          </button>
        ))}
      </div>

      <div
        className={classNames(styles.body, {
          [styles.bodyCollapsedRail]: pageRailCollapsed,
        })}
      >
        <aside
          className={classNames(styles.pageRail, {
            [styles.pageRailCollapsed]: pageRailCollapsed,
          })}
        >
          <PageRail
            pages={pages}
            activePageId={activePageId}
            onSelect={onSelectPage}
            onAdd={onAddPage}
            onDuplicate={onDuplicatePage}
            onMove={onMovePage}
            collapsed={pageRailCollapsed || focusMode}
            onToggleCollapse={() => setPageRailCollapsed((prev) => !prev)}
          />
        </aside>

        <main className={styles.stageArea}>
          <div className={styles.stageHeader}>
            <span className={styles.stageMeta}>{stageMeta}</span>
          </div>
          <div className={styles.stageViewport}>
            <div className={styles.toolbarFloating}>
              <UnifiedToolbar
                {...toolbarProps}
                zoomLabel={toolbarProps.zoomLabel}
                isFocusMode={focusMode}
                onToggleFocusMode={handleToggleFocus}
              />
            </div>
            <FabricStage
              page={activePage}
              activeLayer={activeLayer}
              layerNodes={layerNodes}
            />
            <div className={styles.zoomControls}>
              <button
                type="button"
                onClick={toolbarProps.onZoomFit}
                disabled={!toolbarProps.onZoomFit}
              >
                Fit
              </button>
              <button
                type="button"
                onClick={toolbarProps.onZoomReset}
                disabled={!toolbarProps.onZoomReset}
              >
                {toolbarProps.zoomLabel ?? "100%"}
              </button>
              <div className={styles.zoomStepper}>
                <button
                  type="button"
                  onClick={toolbarProps.onZoomOut}
                  disabled={!toolbarProps.onZoomOut}
                  aria-label="Zoom out"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={toolbarProps.onZoomIn}
                  disabled={!toolbarProps.onZoomIn}
                  aria-label="Zoom in"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </main>

        <aside
          className={classNames(styles.sidebar, {
            [styles.sidebarHidden]: focusMode,
          })}
        >
          <SidebarTabs
            activeTab={activeTab}
            onChange={setActiveTab}
            tabs={sidebarTabs}
          />
        </aside>
      </div>
    </div>
  );
};

export default SheetEditor;
