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
};

const Inspector: React.FC<InspectorProps> = ({ page, activeLayer }) => {
  if (!page) {
    return (
      <section className={styles.inspector} aria-label="Properties">
        <header className={styles.header}>Properties</header>
        <div className={styles.emptyState}>
          <h4>No page selected</h4>
          <p>Select a page to see its properties and contextual controls.</p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.inspector} aria-label="Properties">
      <header className={styles.header}>Properties</header>
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Selection</span>
        <div className={styles.row}>
          <span className={styles.label}>Layer</span>
          <span className={styles.value}>{LABELS[activeLayer]}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Visibility</span>
          <span className={styles.value}>
            {page.groupStates[activeLayer].visible ? "Visible" : "Hidden"}
          </span>
        </div>
      </div>
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Page</span>
        <div className={styles.row}>
          <span className={styles.label}>Name</span>
          <span className={styles.value}>{page.name}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Layout</span>
          <span className={styles.value}>
            {page.isSuperSheet ? "Across all layers" : "Custom"}
          </span>
        </div>
      </div>
    </section>
  );
};

export default Inspector;
