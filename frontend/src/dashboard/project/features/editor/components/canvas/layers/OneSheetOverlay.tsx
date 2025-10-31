import React from "react";
import classNames from "classnames";
import { useLayerStage } from "./LayerStageContext";
import styles from "../designer-component.module.css";

interface OneSheetOverlayProps {
  open: boolean;
  onClose: () => void;
}

const OneSheetOverlay: React.FC<OneSheetOverlayProps> = ({ open, onClose }) => {
  const { groups, layers, setGroupOpacity, setGroupVisibility } = useLayerStage();

  if (!open) return null;

  const layerLookup = new Map(layers.map((layer) => [layer.id, layer]));

  return (
    <div className={styles.oneSheetBackdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.oneSheetPanel}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.oneSheetHeader}>
          <h3>One-Sheet</h3>
          <button type="button" className={styles.button} onClick={onClose}>
            Close
          </button>
        </header>
        <p className={styles.oneSheetDescription}>
          Blend layers from the brief, canvas, and moodboard without leaving the stage. Adjust
          visibility and opacity to preview a combined layout.
        </p>
        <div className={styles.oneSheetGroups}>
          {groups.map((group) => {
            const groupLayers = group.layerIds
              .map((id) => layerLookup.get(id))
              .filter((layer): layer is NonNullable<typeof layer> => Boolean(layer));

            return (
              <section key={group.id} className={styles.oneSheetGroup}>
                <div className={styles.oneSheetGroupHeader}>
                  <h4>{group.name}</h4>
                  <div className={styles.oneSheetGroupControls}>
                    <button
                      type="button"
                      className={styles.button}
                      onClick={() => setGroupVisibility(group.id, !group.visible)}
                    >
                      {group.visible ? "Hide" : "Show"}
                    </button>
                    <label className={styles.opacityLabel}>
                      <span>Opacity</span>
                      <input
                        className={styles.opacitySlider}
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={group.opacity}
                        onChange={(event) =>
                          setGroupOpacity(group.id, Number(event.target.value))
                        }
                      />
                    </label>
                  </div>
                </div>
                {groupLayers.length === 0 ? (
                  <p className={styles.oneSheetEmpty}>No layers in this group yet.</p>
                ) : (
                  <ul className={styles.oneSheetLayerList}>
                    {groupLayers.map((layer) => (
                      <li
                        key={layer.id}
                        className={classNames(styles.oneSheetLayerItem, {
                          [styles.layerItemSelected]: layer.visible,
                        })}
                      >
                        <span className={styles.oneSheetLayerName}>{layer.name}</span>
                        <span className={styles.oneSheetLayerMeta}>
                          {layer.type} · {Math.round(layer.opacity * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default OneSheetOverlay;

