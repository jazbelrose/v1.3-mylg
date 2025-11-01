import React, { useMemo } from "react";
import classNames from "classnames";
import styles from "./FabricStage.module.css";
import type {
  LayerGroupKey,
  SheetPageState,
} from "@/dashboard/project/features/editor/types/sheet";

interface FabricStageProps {
  page: SheetPageState | undefined;
  activeLayer: LayerGroupKey;
  layerNodes: Record<LayerGroupKey, React.ReactNode>;
  zoom: number;
  baseWidth: number;
  baseHeight: number;
}

const ORDER: LayerGroupKey[] = ["canvas", "brief", "moodboard"];

const FabricStage: React.FC<FabricStageProps> = ({
  page,
  activeLayer,
  layerNodes,
  zoom,
  baseWidth,
  baseHeight,
}) => {
  const layerEntries = useMemo(() => {
    if (!page) {
      return [] as Array<[
        LayerGroupKey,
        { visible: boolean; opacity: number },
      ]>;
    }
    return ORDER.map((key) => [key, page.groupStates[key]]) as Array<[
      LayerGroupKey,
      { visible: boolean; opacity: number },
    ]>;
  }, [page]);

  const nothingVisible = useMemo(
    () =>
      !page ||
      layerEntries.every(([, state]) => !state?.visible || state.opacity <= 0),
    [layerEntries, page],
  );

  return (
    <section className={styles.stageContainer} aria-label="Sheet stage">
      <div className={styles.viewport}>
        {nothingVisible ? (
          <div className={styles.placeholder}>
            Enable a layer from the sidebar to start editing this slide.
          </div>
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
                <div
                  className={styles.layerFrame}
                  style={{
                    width: baseWidth * zoom,
                    height: baseHeight * zoom,
                  }}
                >
                  <div
                    className={styles.layerSurface}
                    style={{
                      width: baseWidth,
                      height: baseHeight,
                      transform: `scale(${zoom})`,
                    }}
                  >
                    <div className={styles.layerContent}>{node}</div>
                  </div>
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
