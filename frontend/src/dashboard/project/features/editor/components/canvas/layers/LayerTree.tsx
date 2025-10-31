import React, { useEffect, useMemo, useState } from "react";
import classNames from "classnames";
import styles from "../designer-component.module.css";
import type { LayerEntity, LayerGroupState } from "./types";

interface LayerTreeProps {
  layers: LayerEntity[];
  groups: LayerGroupState[];
  selectedId: string | number | null;
  onSelectLayer: (layerId: string) => void;
  onRenameLayer: (layerId: string, name: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onToggleLock: (layerId: string) => void;
  onChangeOpacity: (layerId: string, opacity: number) => void;
  onGroupVisibility: (groupId: string, visible: boolean) => void;
  onGroupOpacity: (groupId: string, opacity: number) => void;
  onOpenOverlay?: () => void;
}

const LayerTree: React.FC<LayerTreeProps> = ({
  layers,
  groups,
  selectedId,
  onSelectLayer,
  onRenameLayer,
  onToggleVisibility,
  onToggleLock,
  onChangeOpacity,
  onGroupVisibility,
  onGroupOpacity,
  onOpenOverlay,
}) => {
  const layerLookup = useMemo(() => {
    const map = new Map<string, LayerEntity>();
    layers.forEach((layer) => {
      map.set(layer.id, layer);
    });
    return map;
  }, [layers]);

  const resolvedGroups = useMemo<LayerGroupState[]>(() => {
    if (groups.length > 0) return groups;
    return [
      {
        id: "canvas",
        name: "Canvas",
        opacity: 1,
        visible: true,
        layerIds: layers.map((layer) => layer.id),
      },
    ];
  }, [groups, layers]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    resolvedGroups.forEach((group) => {
      initial[group.id] = true;
    });
    return initial;
  });

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      resolvedGroups.forEach((group) => {
        if (!(group.id in next)) {
          next[group.id] = true;
        }
      });
      return next;
    });
  }, [resolvedGroups]);

  const handleGroupToggle = (groupId: string) => {
    setExpanded((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const normalizedSelectedId =
    typeof selectedId === "string" ? selectedId : selectedId !== null ? String(selectedId) : null;

  return (
    <div className={styles.layersPanel}>
      <div className={styles.layerPanelHeader}>
        <h4>Layers</h4>
        {onOpenOverlay && (
          <button
            type="button"
            className={styles.overlayButton}
            onClick={onOpenOverlay}
          >
            One-Sheet
          </button>
        )}
      </div>
      {resolvedGroups.map((group) => {
        const groupLayers = group.layerIds
          .map((id) => layerLookup.get(id))
          .filter((layer): layer is LayerEntity => Boolean(layer));

        if (groupLayers.length === 0 && group.layerIds.length > 0) {
          return null;
        }

        const isExpanded = expanded[group.id] ?? true;

        return (
          <div key={group.id} className={styles.layerGroup}>
            <button
              type="button"
              className={styles.layerGroupHeader}
              onClick={() => handleGroupToggle(group.id)}
            >
              <span className={styles.layerGroupName}>{group.name}</span>
              <span aria-hidden="true">{isExpanded ? "▾" : "▸"}</span>
            </button>
            <div className={styles.layerGroupControls}>
              <button
                type="button"
                className={styles.button}
                onClick={() => onGroupVisibility(group.id, !group.visible)}
                aria-label={group.visible ? `Hide ${group.name}` : `Show ${group.name}`}
              >
                {group.visible ? "👁️" : "🚫"}
              </button>
              <label className={styles.opacityLabel}>
                <span className="sr-only">{group.name} opacity</span>
                <input
                  className={styles.opacitySlider}
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={group.opacity}
                  onChange={(event) => onGroupOpacity(group.id, Number(event.target.value))}
                />
              </label>
            </div>
            {isExpanded && (
              <div>
                {groupLayers.map((layer) => {
                  const isSelected = normalizedSelectedId === layer.id;
                  return (
                    <div
                      key={layer.id}
                      className={classNames(styles.layerItem, {
                        [styles.layerItemSelected]: isSelected,
                      })}
                      onClick={() => onSelectLayer(layer.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          onSelectLayer(layer.id);
                        }
                      }}
                    >
                      <input
                        className={styles.layerNameInput}
                        value={layer.name}
                        onChange={(event) => onRenameLayer(layer.id, event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                      />
                      <button
                        type="button"
                        className={styles.button}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleVisibility(layer.id);
                        }}
                        aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                      >
                        {layer.visible ? "👁️" : "🚫"}
                      </button>
                      <button
                        type="button"
                        className={styles.button}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleLock(layer.id);
                        }}
                        aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                      >
                        {layer.locked ? "🔒" : "🔓"}
                      </button>
                      <label className={styles.opacityLabel}>
                        <span className="sr-only">{layer.name} opacity</span>
                        <input
                          className={styles.opacitySlider}
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={layer.opacity}
                          onChange={(event) => onChangeOpacity(layer.id, Number(event.target.value))}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default LayerTree;

