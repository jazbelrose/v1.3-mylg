import React from "react";
import styles from "./Inspector.module.css";
import type { LayerGroupKey, SheetPageState } from "@/dashboard/project/features/editor/types/sheet";

interface InspectorProps {
  page: SheetPageState | undefined;
  activeLayer: LayerGroupKey;
}

const LABELS: Record<LayerGroupKey, string> = {
  brief: "Brief",
  canvas: "Canvas",
  moodboard: "Moodboard",
};

const Inspector: React.FC<InspectorProps> = ({ page, activeLayer }) => {
  return (
    <aside className={styles.inspector} aria-label="Properties panel">
      <span className={styles.header}>Properties</span>
      {!page ? (
        <div className={styles.section}>
          <label>Selection</label>
          <span>Select a page or layer to see its settings.</span>
        </div>
      ) : (
        <>
          <div className={styles.section}>
            <label>Active Layer</label>
            <span>{LABELS[activeLayer]}</span>
          </div>
          <div className={styles.section}>
            <label>Page name</label>
            <span>{page.name}</span>
          </div>
          <div className={styles.section}>
            <label>Layout type</label>
            <span>{page.isSuperSheet ? "One-sheet overlay" : "Page layout"}</span>
          </div>
        </>
      )}
    </aside>
  );
};

export default Inspector;
