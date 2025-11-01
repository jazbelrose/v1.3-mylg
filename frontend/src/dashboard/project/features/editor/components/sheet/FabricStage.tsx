import React, { useMemo } from "react";
import classNames from "classnames";
import styles from "./FabricStage.module.css";
import { STAGE_ASPECT_RATIO, STAGE_BASE_WIDTH } from "./stageDimensions";
import type { LayerGroupKey, SheetPageState } from "@/dashboard/project/features/editor/types/sheet";

interface FabricStageProps {
  page: SheetPageState | undefined;
  activeLayer: LayerGroupKey;
  layerNodes: Record<LayerGroupKey, React.ReactNode>;
  zoom: number;
}

const ORDER: LayerGroupKey[] = ["canvas", "brief"];

const FabricStage: React.FC<FabricStageProps> = ({ page, activeLayer, layerNodes, zoom }) => {
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

  if (!page) {
    return (
      <section className={styles.stageContainer}>
        <div className={styles.viewport}>
          <div className={styles.placeholder}>Select a page to start designing.</div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.stageContainer}>
      <div className={styles.viewport}>
        <div
          className={styles.surface}
          style={{ transform: `scale(${zoom})` }}
        >
          <div
            className={styles.surfaceFrame}
            style={{ width: STAGE_BASE_WIDTH, aspectRatio: STAGE_ASPECT_RATIO }}
          >
            <div className={styles.surfaceBackdrop} />
            {nothingVisible ? (
              <div className={styles.surfaceEmpty}>Enable a layer to start editing.</div>
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
                    <div className={styles.layerContent}>{node}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default FabricStage;
