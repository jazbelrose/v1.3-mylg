import React from "react";
import type { ComponentProps } from "react";
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
  const activePage = pages.find((page) => page.id === activePageId);

  const handleToggleVisibility = (layer: LayerGroupKey) => {
    if (!activePage) return;
    onToggleLayerVisibility(activePage.id, layer);
  };

  const handleOpacityChange = (layer: LayerGroupKey, value: number) => {
    if (!activePage) return;
    onChangeLayerOpacity(activePage.id, layer, value);
  };

  return (
    <div className={styles.sheetEditor}>
      <div className={styles.toolbarWrapper}>
        <UnifiedToolbar {...toolbarProps} />
      </div>
      <div className={styles.sheetBody}>
        <PageRail
          pages={pages}
          activePageId={activePageId}
          onSelect={onSelectPage}
          onAdd={onAddPage}
          onDuplicate={onDuplicatePage}
          onMove={onMovePage}
        />
        <FabricStage
          page={activePage}
          activeLayer={activeLayer}
          layerNodes={layerNodes}
        />
        <div className={styles.layerAndInspector}>
          <LayerTree
            page={activePage}
            activeLayer={activeLayer}
            onSelectLayer={onSelectLayer}
            onToggleVisibility={handleToggleVisibility}
            onChangeOpacity={handleOpacityChange}
            disabled={!activePage}
          />
          <Inspector page={activePage} activeLayer={activeLayer} />
        </div>
      </div>
    </div>
  );
};

export default SheetEditor;
