import React from "react";
import { Eye, EyeOff, FileText, LayoutDashboard, Paintbrush } from "lucide-react";
import classNames from "classnames";
import styles from "./LayerTree.module.css";
import type { LayerGroupKey, SheetPageState } from "@/dashboard/project/features/editor/types/sheet";

const GROUP_META: Record<LayerGroupKey, { label: string; icon: React.ReactElement }> = {
  brief: { label: "Brief", icon: <FileText size={16} aria-hidden="true" /> },
  canvas: { label: "Canvas", icon: <Paintbrush size={16} aria-hidden="true" /> },
  moodboard: { label: "Moodboard", icon: <LayoutDashboard size={16} aria-hidden="true" /> },
};

interface LayerTreeProps {
  page: SheetPageState | undefined;
  activeLayer: LayerGroupKey;
  onSelectLayer: (layer: LayerGroupKey) => void;
  onToggleVisibility: (layer: LayerGroupKey) => void;
  onChangeOpacity: (layer: LayerGroupKey, value: number) => void;
  disabled?: boolean;
}

const LayerTree: React.FC<LayerTreeProps> = ({
  page,
  activeLayer,
  onSelectLayer,
  onToggleVisibility,
  onChangeOpacity,
  disabled,
}) => {
  if (!page) {
    return (
      <aside className={styles.layerTree}>
        <span className={styles.header}>Layers</span>
        <p>No page selected.</p>
      </aside>
    );
  }

  return (
    <aside className={styles.layerTree} aria-label="Layer controls">
      <span className={styles.header}>Layers</span>
      <div className={styles.groupList}>
        {(Object.keys(page.groupStates) as LayerGroupKey[]).map((layerKey) => {
          const state = page.groupStates[layerKey];
          const { label, icon } = GROUP_META[layerKey];
          const visible = state.visible;
          return (
            <div
              key={layerKey}
              className={classNames(styles.groupItem, {
                [styles.active]: activeLayer === layerKey,
              })}
            >
              <div className={styles.groupHeader}>
                <button
                  type="button"
                  className={styles.groupLabel}
                  onClick={() => onSelectLayer(layerKey)}
                  disabled={disabled}
                >
                  {icon}
                  <span>{label}</span>
                </button>
                <button
                  type="button"
                  className={styles.visibilityToggle}
                  onClick={() => onToggleVisibility(layerKey)}
                  disabled={disabled}
                >
                  {visible ? <Eye size={16} /> : <EyeOff size={16} />}
                  <span>{visible ? "Visible" : "Hidden"}</span>
                </button>
              </div>
              <div className={styles.slider}>
                <label htmlFor={`${page.id}-${layerKey}-opacity`}>Opacity</label>
                <input
                  id={`${page.id}-${layerKey}-opacity`}
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(state.opacity * 100)}
                  onChange={(event) =>
                    onChangeOpacity(layerKey, Number(event.target.value) / 100)
                  }
                  disabled={disabled}
                />
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};

export default LayerTree;
