import React from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import classNames from "classnames";
import styles from "./LayerTree.module.css";
import type { LayerGroupKey, SheetPageState } from "@/dashboard/project/features/editor/types/sheet";

const GROUP_META: Record<LayerGroupKey, { label: string }> = {
  brief: { label: "Brief" },
  canvas: { label: "Canvas" },
  moodboard: { label: "Moodboard" },
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
      <section className={styles.layerTree} aria-label="Layer controls">
        <header className={styles.header}>Layers</header>
        <p className={styles.empty}>No page selected.</p>
      </section>
    );
  }

  return (
    <section className={styles.layerTree} aria-label="Layer controls">
      <header className={styles.header}>Layers</header>
      <ul className={styles.list}>
        {(Object.keys(page.groupStates) as LayerGroupKey[]).map((layerKey) => {
          const state = page.groupStates[layerKey];
          const { label } = GROUP_META[layerKey];
          const visible = state.visible;
          const active = activeLayer === layerKey;

          return (
            <li key={layerKey}>
              <button
                type="button"
                className={classNames(styles.layerRow, {
                  [styles.layerRowActive]: active,
                })}
                onClick={() => onSelectLayer(layerKey)}
                disabled={disabled}
              >
                <span className={styles.layerLabel}>{label}</span>
                <span className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleVisibility(layerKey);
                    }}
                    disabled={disabled}
                    aria-label={visible ? `Hide ${label}` : `Show ${label}`}
                  >
                    {visible ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <button
                    type="button"
                    className={classNames(styles.iconButton, styles.iconButtonDisabled)}
                    disabled
                    aria-label="Lock layer (coming soon)"
                  >
                    <Lock size={16} />
                  </button>
                </span>
              </button>
              <div
                className={classNames(styles.opacityRow, {
                  [styles.opacityRowVisible]: active || visible,
                })}
              >
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
                <span className={styles.opacityValue}>
                  {Math.round(state.opacity * 100)}%
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default LayerTree;
