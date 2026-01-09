// OffscreenSlideRenderer.tsx - Hidden component for rendering slides offscreen for PDF export
import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { createPortal } from "react-dom";
import { toJpeg, toPng } from "html-to-image";
import { Slide } from "@/app/contexts/DataProvider";
import SlideReadOnlyRenderer from "./SlideReadOnlyRenderer";
import { getFileUrl } from "@/shared/utils/api";

const NATIVE_SLIDE_WIDTH = 1920;
const NATIVE_SLIDE_HEIGHT = 1080;

async function waitForAnimationFrames(count = 2): Promise<void> {
  for (let i = 0; i < count; i++) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

async function waitForSlideIdOnContainer(
  containerRef: React.RefObject<HTMLElement | null>,
  expectedSlideId: string,
  timeoutMs = 1500
): Promise<void> {
  const start = performance.now();

  await new Promise<void>((resolve, reject) => {
    const tick = () => {
      const el = containerRef.current;
      if (el?.dataset?.slideId === expectedSlideId) {
        resolve();
        return;
      }

      if (performance.now() - start > timeoutMs) {
        reject(new Error(`[OffscreenSlideRenderer] Timed out waiting for DOM to reflect slideId=${expectedSlideId}`));
        return;
      }

      requestAnimationFrame(tick);
    };

    tick();
  });
}

async function waitForOffscreenPortalContainer(timeoutMs = 1500): Promise<HTMLDivElement> {
  const start = performance.now();

  return await new Promise<HTMLDivElement>((resolve, reject) => {
    const tick = () => {
      const el = document.getElementById("offscreen-slide-renderer") as HTMLDivElement | null;
      if (el) {
        resolve(el);
        return;
      }

      if (performance.now() - start > timeoutMs) {
        reject(new Error("[OffscreenSlideRenderer] Timed out waiting for offscreen portal container"));
        return;
      }

      requestAnimationFrame(tick);
    };

    tick();
  });
}

export interface SlideImageData {
  slideId: string;
  title: string;
  imageDataUrl: string;
}

export interface OffscreenSlideCaptureOptions {
  imageFormat?: "png" | "jpeg";
  pixelRatio?: number;
  /**
   * Only applies when `imageFormat` is `"jpeg"`.
   * Range: 0..1
   */
  jpegQuality?: number;
}

export interface OffscreenSlideRendererRef {
  captureAllSlides: (
    slides: Slide[],
    onProgress?: (current: number, total: number) => void,
    options?: OffscreenSlideCaptureOptions
  ) => Promise<SlideImageData[]>;
}

// No props needed - this is a hidden utility component
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface OffscreenSlideRendererProps {}

/**
 * Wait for all images in a DOM tree to load
 */
async function waitForImagesToLoad(root: HTMLElement, timeoutMs = 5000): Promise<void> {
  // Ensure background images on the root element itself are preloaded
  const rootStyle = window.getComputedStyle(root);
  const rootBgImage = rootStyle.backgroundImage;

  const images = Array.from(root.querySelectorAll("img")) as HTMLImageElement[];
  const bgImageElements = Array.from(root.querySelectorAll('[style*="background-image"]')) as HTMLElement[];

  const imagePromises: Promise<void>[] = [];

  if (rootBgImage && rootBgImage !== "none") {
    const urlMatch = rootBgImage.match(/url\(["']?([^"')]+)["']?\)/);
    if (urlMatch && urlMatch[1]) {
      imagePromises.push(
        new Promise<void>((resolve) => {
          const preloadImg = new Image();
          preloadImg.onload = () => resolve();
          preloadImg.onerror = () => resolve();
          preloadImg.src = urlMatch[1];
          if (preloadImg.complete) resolve();
        })
      );
    }
  }

  images.forEach((img) => {
    if (!img.src) return;
    imagePromises.push(
      new Promise<void>((resolve) => {
        if (img.complete && img.naturalWidth > 0) {
          resolve();
          return;
        }
        const onDone = () => {
          img.removeEventListener("load", onDone);
          img.removeEventListener("error", onDone);
          resolve();
        };
        img.addEventListener("load", onDone);
        img.addEventListener("error", onDone);
      })
    );
  });

  bgImageElements.forEach((el) => {
    const style = window.getComputedStyle(el);
    const bgImage = style.backgroundImage;
    if (bgImage && bgImage !== "none") {
      const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
      if (urlMatch && urlMatch[1]) {
        imagePromises.push(
          new Promise<void>((resolve) => {
            const preloadImg = new Image();
            preloadImg.onload = () => resolve();
            preloadImg.onerror = () => resolve();
            preloadImg.src = urlMatch[1];
            if (preloadImg.complete) resolve();
          })
        );
      }
    }
  });

  if (imagePromises.length === 0) return;

  await Promise.race([Promise.all(imagePromises), new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
}

/**
 * Hide scrollbars and UI elements for clean export
 */
function hideScrollbarsForExport(root: HTMLElement): void {
  const textboxes = root.querySelectorAll<HTMLElement>(".editor-textbox");
  textboxes.forEach((el) => {
    el.style.overflow = "hidden";
    el.scrollTop = 0;
    el.scrollLeft = 0;
  });

  const handles = root.querySelectorAll<HTMLElement>(
    ".textbox-resize-handle, .textbox-move-handle, .textbox-rotate-handle, .textbox-rotate-handle-line"
  );
  handles.forEach((el) => {
    el.style.display = "none";
  });
}

/**
 * Offscreen Slide Renderer Component
 * Renders slides in an invisible container for high-quality PDF export capture
 */
const OffscreenSlideRenderer = forwardRef<OffscreenSlideRendererRef, OffscreenSlideRendererProps>((_, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [currentSlide, setCurrentSlide] = useState<Slide | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const resolveRenderRef = useRef<(() => void) | null>(null);
  const rejectRenderRef = useRef<((error: Error) => void) | null>(null);
  const expectedSlideIdRef = useRef<string | null>(null);
  const renderTimeoutRef = useRef<number | null>(null);

  // Create the offscreen container on mount
  useEffect(() => {
    const container = document.createElement("div");
    container.id = "offscreen-slide-renderer";
    container.style.cssText = `
      position: fixed;
      left: -10000px;
      top: 0;
      width: ${NATIVE_SLIDE_WIDTH}px;
      height: ${NATIVE_SLIDE_HEIGHT}px;
      overflow: hidden;
      pointer-events: none;
      z-index: -1;
      visibility: visible;
    `;
    document.body.appendChild(container);
    setPortalContainer(container);

    return () => {
      container.remove();
    };
  }, []);

  const ensurePortalContainerReady = useCallback(async (): Promise<void> => {
    if (portalContainer) return;
    const el = await waitForOffscreenPortalContainer();
    setPortalContainer(el);
  }, [portalContainer]);

  const resolvePendingRender = useCallback(async () => {
    const resolve = resolveRenderRef.current;
    const reject = rejectRenderRef.current;
    const expectedSlideId = expectedSlideIdRef.current;

    if (!resolve || !expectedSlideId) return;

    if (renderTimeoutRef.current) {
      window.clearTimeout(renderTimeoutRef.current);
      renderTimeoutRef.current = null;
    }

    // Deterministic barrier: never capture until the offscreen container is actually
    // showing the expected slide. Prevents "same (first) slide" capture regressions.
    try {
      await waitForSlideIdOnContainer(containerRef, expectedSlideId);
    } catch (error) {
      resolveRenderRef.current = null;
      rejectRenderRef.current = null;
      reject?.(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    // Let layout/paint commit before capture (avoid long sleeps).
    await waitForAnimationFrames(2);

    if (containerRef.current) {
      await waitForImagesToLoad(containerRef.current, 3000);
    }

    resolveRenderRef.current = null;
    rejectRenderRef.current = null;
    resolve();
  }, []);

  const handleSlideRendered = useCallback(
    (slideId?: string) => {
      if (!slideId) return;
      if (!expectedSlideIdRef.current) return;
      if (slideId !== expectedSlideIdRef.current) return;
      void resolvePendingRender();
    },
    [resolvePendingRender]
  );

  const renderSlideAndWait = useCallback(
    (slide: Slide): Promise<void> => {
      return new Promise((resolve, reject) => {
        expectedSlideIdRef.current = slide.id;
        resolveRenderRef.current = resolve;
        rejectRenderRef.current = reject;

        void (async () => {
          try {
            await ensurePortalContainerReady();
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
            return;
          }

          setCurrentSlide(slide);

          if (renderTimeoutRef.current) {
            window.clearTimeout(renderTimeoutRef.current);
          }

          // Fallback: if `onRendered` never fires, still avoid capturing stale DOM.
          // We only proceed once the DOM reflects the expected slideId.
          renderTimeoutRef.current = window.setTimeout(() => {
            if (resolveRenderRef.current) {
              console.warn(
                "[OffscreenSlideRenderer] Timed out waiting for slide render callback; using DOM barrier"
              );
              void resolvePendingRender();
            }
          }, 2000);
        })();
      });
    },
    [resolvePendingRender, ensurePortalContainerReady]
  );

  const captureCurrentSlide = useCallback(
    async (backgroundColor: string, options?: OffscreenSlideCaptureOptions): Promise<string | null> => {
      if (!containerRef.current) return null;

      try {
        if (document.fonts?.ready) {
          await document.fonts.ready;
        }

        // Safety: never capture if the container is not currently reflecting the expected slide.
        const expectedSlideId = expectedSlideIdRef.current;
        if (expectedSlideId && containerRef.current.dataset.slideId !== expectedSlideId) {
          console.warn(
            `[OffscreenSlideRenderer] Skipping capture due to slideId mismatch (expected=${expectedSlideId}, actual=${containerRef.current.dataset.slideId})`
          );
          return null;
        }

        hideScrollbarsForExport(containerRef.current);

        const imageFormat = options?.imageFormat ?? "png";
        const pixelRatio = options?.pixelRatio ?? 2;

        const baseOptions = {
          width: NATIVE_SLIDE_WIDTH,
          height: NATIVE_SLIDE_HEIGHT,
          canvasWidth: NATIVE_SLIDE_WIDTH,
          canvasHeight: NATIVE_SLIDE_HEIGHT,
          backgroundColor,
          cacheBust: true,
          pixelRatio,
          skipAutoScale: true,
        };

        const captureWithFontsOption = async (skipFonts: boolean): Promise<string> => {
          // Default to rendering fonts when possible. If CSP/font loading causes html-to-image to throw,
          // we retry once with `skipFonts: true` to still produce an export.
          return imageFormat === "jpeg"
            ? await toJpeg(containerRef.current!, {
                ...baseOptions,
                skipFonts,
                quality: typeof options?.jpegQuality === "number" ? options.jpegQuality : 0.9,
              })
            : await toPng(containerRef.current!, {
                ...baseOptions,
                skipFonts,
                quality: 1.0,
              });
        };

        try {
          return await captureWithFontsOption(false);
        } catch (error) {
          console.warn("[OffscreenSlideRenderer] Capture failed with fonts; retrying with skipFonts:true", error);
          return await captureWithFontsOption(true);
        }
      } catch (error) {
        console.error("[OffscreenSlideRenderer] Capture failed:", error);
        return null;
      }
    },
    []
  );

  const captureAllSlides = useCallback(
    async (
      slides: Slide[],
      onProgress?: (current: number, total: number) => void,
      options?: OffscreenSlideCaptureOptions
    ): Promise<SlideImageData[]> => {
      const results: SlideImageData[] = [];

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        onProgress?.(i + 1, slides.length);

        try {
          await renderSlideAndWait(slide);
        } catch (error) {
          console.warn(`[OffscreenSlideRenderer] Failed waiting for slide ${i + 1} render`, error);
          continue;
        }

        const backgroundColor = slide.backgroundColor || "#101112";
        const imageDataUrl = await captureCurrentSlide(backgroundColor, options);

        if (imageDataUrl) {
          results.push({
            slideId: slide.id,
            title: slide.title || `Slide ${i + 1}`,
            imageDataUrl,
          });
        } else {
          console.warn(`[OffscreenSlideRenderer] Failed to capture slide ${i + 1}`);
        }
      }

      setCurrentSlide(null);
      expectedSlideIdRef.current = null;

      return results;
    },
    [renderSlideAndWait, captureCurrentSlide]
  );

  useImperativeHandle(
    ref,
    () => ({
      captureAllSlides,
    }),
    [captureAllSlides]
  );

  if (!portalContainer || !currentSlide) {
    return null;
  }

  const backgroundColor = currentSlide.backgroundColor || "#101112";
  const backgroundImage = currentSlide.backgroundImage ? `url(${getFileUrl(currentSlide.backgroundImage)})` : undefined;

  return createPortal(
    <div
      key={currentSlide.id}
      ref={containerRef}
      data-slide-id={currentSlide.id}
      style={{
        width: NATIVE_SLIDE_WIDTH,
        height: NATIVE_SLIDE_HEIGHT,
        backgroundColor,
        backgroundImage,
        backgroundSize: "cover",
        backgroundPosition: "center",
        position: "relative",
        overflow: "hidden",
        visibility: "visible",
      }}
    >
      <SlideReadOnlyRenderer
        slideId={currentSlide.id}
        content={currentSlide.content}
        contentPadding="96px 120px"
        onRendered={handleSlideRendered}
      />
    </div>,
    portalContainer
  );
});

OffscreenSlideRenderer.displayName = "OffscreenSlideRenderer";

export default OffscreenSlideRenderer;

