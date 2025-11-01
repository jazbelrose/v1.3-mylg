import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentProps } from "react";
import styles from "./SheetEditor.module.css";
import PageRail from "./PageRail";
import FabricStage from "./FabricStage";
import SidebarTabs from "./SidebarTabs";
import SlidesToolbar from "../SlidesToolbar";
import type {
  LayerGroupKey,
  SheetPageState,
} from "@/dashboard/project/features/editor/types/sheet";

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
  toolbarProps: ComponentProps<typeof SlidesToolbar>;
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
  const activePage = pages.find((page) => page.id === activePageId);
  const [pageRailCollapsed, setPageRailCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  const handleToggleVisibility = (layer: LayerGroupKey) => {
    if (!activePage) return;
    onToggleLayerVisibility(activePage.id, layer);
  };

  const handleOpacityChange = (layer: LayerGroupKey, value: number) => {
    if (!activePage) return;
    onChangeLayerOpacity(activePage.id, layer, value);
  };

  const togglePageRail = useCallback(() => {
    setPageRailCollapsed((prev) => !prev);
  }, []);

  const toggleFocusMode = useCallback(() => {
    setFocusMode((prev) => !prev);
  }, []);

  const handleZoom = useCallback((delta: number) => {
    setZoomLevel((prev) => {
      const next = Math.min(4, Math.max(0.25, prev + delta));
      return Number(next.toFixed(2));
    });
  }, []);

  const handleFit = useCallback(() => {
    setZoomLevel(0.85);
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoomLevel(1);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName ?? "";
      const isInputContext = ["INPUT", "TEXTAREA"].includes(tagName) || target?.isContentEditable;
      if (isInputContext) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        togglePageRail();
      }

      if (!event.metaKey && !event.ctrlKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        toggleFocusMode();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleFocusMode, togglePageRail]);

  const gridTemplateColumns = useMemo(() => {
    if (focusMode) {
      return "1fr";
    }
    const left = pageRailCollapsed ? "56px" : "240px";
    const right = "320px";
    return `${left} 1fr ${right}`;
  }, [focusMode, pageRailCollapsed]);

  const showPageRail = !focusMode && !pageRailCollapsed;
  const showSidebar = !focusMode;

  return (
    <div className={styles.sheetEditor}>
      <div className={styles.toolbarWrapper}>
        <SlidesToolbar
          {...toolbarProps}
          onTogglePages={togglePageRail}
          onToggleFocus={toggleFocusMode}
          focusMode={focusMode}
          pagesCollapsed={pageRailCollapsed}
        />
      </div>
      <div className={styles.sheetBody} style={{ gridTemplateColumns }}>
        {showPageRail ? (
          <PageRail
            pages={pages}
            activePageId={activePageId}
            onSelect={onSelectPage}
            onAdd={onAddPage}
            onDuplicate={onDuplicatePage}
            onMove={onMovePage}
          />
        ) : (
          <div className={styles.revealHandle}>
            {!focusMode && (
              <button
                type="button"
                className={styles.revealButton}
                onClick={togglePageRail}
              >
                Show pages
              </button>
            )}
          </div>
        )}
        <div className={styles.stageZone}>
          <FabricStage
            page={activePage}
            activeLayer={activeLayer}
            layerNodes={layerNodes}
            zoomLevel={zoomLevel}
            onZoomIn={() => handleZoom(0.1)}
            onZoomOut={() => handleZoom(-0.1)}
            onFit={handleFit}
            onResetZoom={handleResetZoom}
          />
          <div className={styles.stageShortcuts}>
            <button type="button" onClick={toggleFocusMode}>
              {focusMode ? "Exit focus" : "Focus (F)"}
            </button>
            {!pageRailCollapsed && !focusMode && (
              <button type="button" onClick={togglePageRail}>
                Hide pages
              </button>
            )}
          </div>
        </div>
        {showSidebar ? (
          <SidebarTabs
            page={activePage}
            activeLayer={activeLayer}
            onSelectLayer={onSelectLayer}
            onToggleVisibility={handleToggleVisibility}
            onChangeOpacity={handleOpacityChange}
            disabled={!activePage}
          />
        ) : (
          <div />
        )}
      </div>
    </div>
  );
};

export default SheetEditor;
