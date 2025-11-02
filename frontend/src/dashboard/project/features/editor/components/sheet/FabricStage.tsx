import React, { useEffect, useMemo, useRef } from "react";
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

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const wheelDeltaRef = useRef(0);
  const scrollCooldownRef = useRef<number | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      if (!onSelectPage || pages.length <= 1) {
        return;
      }

      const currentIndex = pages.findIndex((page) => page.id === activePageId);
      if (currentIndex === -1) {
        return;
      }

      if (scrollCooldownRef.current !== null) {
        return;
      }

      const primaryDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX)
        ? event.deltaY
        : event.deltaX;
      if (primaryDelta === 0) {
        return;
      }

      event.preventDefault();
      wheelDeltaRef.current += primaryDelta;

      const threshold = 60;
      if (wheelDeltaRef.current > threshold && currentIndex < pages.length - 1) {
        onSelectPage(pages[currentIndex + 1].id);
      } else if (wheelDeltaRef.current < -threshold && currentIndex > 0) {
        onSelectPage(pages[currentIndex - 1].id);
      } else {
        return;
      }

      wheelDeltaRef.current = 0;
      scrollCooldownRef.current = window.setTimeout(() => {
        scrollCooldownRef.current = null;
      }, 350);
    };

    const options: AddEventListenerOptions = { passive: false };
    viewport.addEventListener("wheel", handleWheel, options);

    return () => {
      viewport.removeEventListener("wheel", handleWheel, options);
      if (scrollCooldownRef.current !== null) {
        window.clearTimeout(scrollCooldownRef.current);
        scrollCooldownRef.current = null;
      }
      wheelDeltaRef.current = 0;
    };
  }, [activePageId, onSelectPage, pages]);

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
      <div className={styles.viewport} ref={viewportRef}>
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
                tabIndex={isActive ? 0 : -1}
                role="button"
                aria-current={isActive ? "page" : undefined}
                aria-hidden={isActive ? undefined : "true"}
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
