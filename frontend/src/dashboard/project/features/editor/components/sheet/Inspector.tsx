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
    <section className={styles.inspector} aria-label="Properties">
      {!page ? (
        <p className={styles.empty}>Select a page to see contextual properties.</p>
      ) : (
        <ul className={styles.propertyList}>
          <li>
            <span className={styles.label}>Active layer</span>
            <span className={styles.value}>{LABELS[activeLayer]}</span>
          </li>
          <li>
            <span className={styles.label}>Page</span>
            <span className={styles.value}>{page.name}</span>
          </li>
          <li>
            <span className={styles.label}>Super sheet</span>
            <span className={styles.value}>{page.isSuperSheet ? "Enabled" : "Off"}</span>
          </li>
        </ul>
      )}
    </section>
  );
};

export default Inspector;
