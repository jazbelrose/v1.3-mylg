import React, { useMemo } from "react";
import classNames from "classnames";
import styles from "./FabricStage.module.css";
import type { LayerGroupKey, SheetPageState } from "@/dashboard/project/features/editor/types/sheet";

interface FabricStageProps {
  page: SheetPageState | undefined;
  activeLayer: LayerGroupKey;
  layerNodes: Record<LayerGroupKey, React.ReactNode>;
}

const ORDER: LayerGroupKey[] = ["canvas", "brief", "moodboard"];
const WIDESCREEN_ASPECT_RATIO = 16 / 9;

const FabricStage: React.FC<FabricStageProps> = ({ page, activeLayer, layerNodes }) => {
  const layerEntries = useMemo(() => {
    if (!page) return [] as Array<[LayerGroupKey, { visible: boolean; opacity: number }]>;
    return ORDER.map((key) => [key, page.groupStates[key]]) as Array<[
      LayerGroupKey,
      { visible: boolean; opacity: number }
    ]>;
  }, [page]);

  const nothingVisible = useMemo(
    () =>
      !page ||
      layerEntries.every(([, state]) => !state?.visible || state.opacity <= 0),
    [layerEntries, page]
  );

  return (
    <section className={styles.stageContainer} aria-label="Sheet stage">
      <div className={styles.stageTopBar}>
        <span>{page ? page.name : "Select a page"}</span>
        <span>{page?.isSuperSheet ? "One-sheet overlay" : "Page layout"}</span>
      </div>
      <div className={styles.canvasWrapper}>
        {nothingVisible ? (
          <div className={styles.placeholder}>Enable a layer from the Layer Tree to start editing.</div>
        ) : (
          layerEntries.map(([key, state]) => {
            const node = layerNodes[key];
            if (!state?.visible || !node) return null;
            return (
              <div
                key={key}
                className={classNames(styles.layer, {
                  [styles.active]: activeLayer === key,
                })}
                style={{ opacity: state.opacity }}
              >
                <div className={styles.layerSurface} style={{ aspectRatio: WIDESCREEN_ASPECT_RATIO }}>
                  <div className={styles.layerContent}>{node}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};

export default FabricStage;
