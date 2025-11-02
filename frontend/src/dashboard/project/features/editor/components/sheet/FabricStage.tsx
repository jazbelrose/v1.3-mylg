import React from "react";
import classNames from "classnames";
import styles from "./FabricStage.module.css";
import { STAGE_ASPECT_RATIO, STAGE_BASE_WIDTH } from "./stageDimensions";
import type { LayerGroupKey, SheetPageState } from "@/dashboard/project/features/editor/types/sheet";

interface LayerRendererArgs {
  page: SheetPageState;
  isActive: boolean;
}

type LayerRendererMap = Record<LayerGroupKey, (args: LayerRendererArgs) => React.ReactNode>;

interface FabricStageProps {
  pages: SheetPageState[];
  activePageId: string;
  activeLayer: LayerGroupKey;
  layerRenderers: LayerRendererMap;
  zoom: number;
  onSelectPage?: (pageId: string) => void;
}

const ORDER: LayerGroupKey[] = ["canvas"];

const FabricStage: React.FC<FabricStageProps> = ({
  pages,
  activePageId,
  activeLayer,
  layerRenderers,
  zoom,
  onSelectPage,
}) => {
  if (pages.length === 0) {
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
        {pages.map((page, index) => {
          const layerEntries = ORDER.map((key) => [key, page.groupStates[key]]) as Array<[
            LayerGroupKey,
            { visible: boolean; opacity: number }
          ]>;
          const nothingVisible = layerEntries.every(
            ([, state]) => !state?.visible || state.opacity <= 0
          );
          const isActive = page.id === activePageId;

          return (
            <div
              key={page.id}
              className={classNames(styles.pageWrapper, {
                [styles.pageWrapperActive]: isActive,
              })}
              data-page-id={page.id}
            >
              <header className={styles.pageLabel}>
                <span className={styles.pageLabelIndex}>{index + 1}</span>
                <span className={styles.pageLabelName}>{page.name}</span>
              </header>
              <div
                className={styles.surface}
                style={{ transform: `scale(${zoom})` }}
              >
                <div
                  className={styles.surfaceFrame}
                  style={{ width: STAGE_BASE_WIDTH, aspectRatio: STAGE_ASPECT_RATIO }}
                >
                  <div className={styles.surfaceBackdrop} />
                  {!isActive && onSelectPage ? (
                    <button
                      type="button"
                      className={styles.surfaceOverlay}
                      onClick={() => onSelectPage(page.id)}
                      aria-label={`Activate ${page.name}`}
                    >
                      <span>Click to edit this page</span>
                    </button>
                  ) : null}
                  {nothingVisible ? (
                    <div className={styles.surfaceEmpty}>Enable a layer to start editing.</div>
                  ) : (
                    layerEntries.map(([key, state]) => {
                      const renderLayer = layerRenderers[key];
                      if (!state?.visible || !renderLayer) return null;
                      const node = renderLayer({ page, isActive });
                      if (!node) return null;
                      return (
                        <div
                          key={key}
                          className={classNames(styles.layer, {
                            [styles.active]: activeLayer === key && isActive,
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
          );
        })}
      </div>
    </section>
  );
};

export default FabricStage;
