import React, { useMemo } from "react";
import classNames from "classnames";
import styles from "./FabricStage.module.css";
import { STAGE_ASPECT_RATIO, STAGE_BASE_WIDTH } from "./stageDimensions";
import type { LayerGroupKey, SheetPageState } from "@/dashboard/project/features/editor/types/sheet";

type LayerRenderer = (
  page: SheetPageState,
  options: { isActive: boolean }
) => React.ReactNode;

interface FabricStageProps {
  pages: SheetPageState[];
  activePageId: string;
  activeLayer: LayerGroupKey;
  layerNodes: Record<LayerGroupKey, LayerRenderer>;
  zoom: number;
  onSelectPage?: (pageId: string) => void;
}

const ORDER: LayerGroupKey[] = ["canvas"];

const FabricStage: React.FC<FabricStageProps> = ({
  pages,
  activePageId,
  activeLayer,
  layerNodes,
  zoom,
  onSelectPage,
}) => {
  const pageEntries = useMemo(
    () =>
      pages.map((page) => ({
        page,
        layers: ORDER.map((key) => [key, page.groupStates[key]]) as Array<[
          LayerGroupKey,
          { visible: boolean; opacity: number }
        ]>,
      })),
    [pages]
  );

  if (pageEntries.length === 0) {
    return (
      <section className={styles.stageContainer}>
        <div className={styles.viewport}>
          <div className={styles.placeholder}>Add a page to start designing.</div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.stageContainer}>
      <div className={styles.viewport}>
        <div className={styles.deck}>
          {pageEntries.map(({ page, layers }, index) => {
            const nothingVisible = layers.every(
              ([, state]) => !state?.visible || state.opacity <= 0
            );
            const isActive = page.id === activePageId;
            const handleSelect = () => onSelectPage?.(page.id);
            const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleSelect();
              }
            };

            return (
              <article
                key={page.id}
                className={classNames(styles.surfaceWrapper, {
                  [styles.activePage]: isActive,
                })}
                data-active={isActive ? "true" : "false"}
                tabIndex={0}
                role="button"
                aria-current={isActive ? "page" : undefined}
                aria-label={`${page.name} page`}
                onClick={handleSelect}
                onKeyDown={handleKeyDown}
              >
                <div
                  className={styles.surface}
                  style={{ transform: `scale(${zoom})` }}
                >
                  <div
                    className={styles.surfaceFrame}
                    style={{
                      width: STAGE_BASE_WIDTH,
                      aspectRatio: STAGE_ASPECT_RATIO,
                    }}
                  >
                    <div className={styles.surfaceBackdrop} />
                    {nothingVisible ? (
                      <div className={styles.surfaceEmpty}>
                        Enable a layer to start editing.
                      </div>
                    ) : (
                      layers.map(([key, state]) => {
                        const renderLayer = layerNodes[key];
                        if (!state?.visible || !renderLayer) return null;
                        const node = renderLayer(page, { isActive });
                        if (!node) return null;
                        return (
                          <div
                            key={key}
                            className={classNames(styles.layer, {
                              [styles.active]: activeLayer === key && isActive,
                            })}
                            style={{ opacity: state.opacity }}
                          >
                            <div
                              className={styles.layerContent}
                              data-active={isActive ? "true" : "false"}
                            >
                              {node}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
                <footer className={styles.pageMeta} aria-hidden="true">
                  <span className={styles.pageIndex}>{index + 1}</span>
                  <span className={styles.pageName}>{page.name}</span>
                </footer>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FabricStage;
