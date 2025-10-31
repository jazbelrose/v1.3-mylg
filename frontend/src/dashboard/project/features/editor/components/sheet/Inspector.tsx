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
    <aside className={styles.inspector} aria-label="Inspector panel">
      <span className={styles.header}>Inspector</span>
      {!page ? (
        <div className={styles.section}>
          <label>Status</label>
          <span>Select a page to inspect details.</span>
        </div>
      ) : (
        <>
          <div className={styles.section}>
            <label>Active Layer</label>
            <span>{LABELS[activeLayer]}</span>
          </div>
          <div className={styles.section}>
            <label>Page</label>
            <span>{page.name}</span>
          </div>
          <div className={styles.section}>
            <label>Super Sheet</label>
            <span>{page.isSuperSheet ? "Enabled" : "No"}</span>
          </div>
        </>
      )}
    </aside>
  );
};

export default Inspector;
