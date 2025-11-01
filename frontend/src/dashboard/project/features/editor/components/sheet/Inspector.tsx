import React from "react";
import styles from "./Inspector.module.css";
import type {
  LayerGroupKey,
  SheetPageState,
} from "@/dashboard/project/features/editor/types/sheet";

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
    <section className={styles.inspector} aria-label="Properties panel">
      <header className={styles.header}>Properties</header>
      {!page ? (
        <div className={styles.section}>
          <span className={styles.emptyState}>Select a page to see its details.</span>
        </div>
      ) : (
        <div className={styles.sectionGrid}>
          <div className={styles.property}>
            <label>Page</label>
            <span>{page.name}</span>
          </div>
          <div className={styles.property}>
            <label>Layer</label>
            <span>{LABELS[activeLayer]}</span>
          </div>
          <div className={styles.property}>
            <label>Type</label>
            <span>{page.isSuperSheet ? "Master" : "Standard"}</span>
          </div>
        </div>
      )}
    </section>
  );
};

export default Inspector;
