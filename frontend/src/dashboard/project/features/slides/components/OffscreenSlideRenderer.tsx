// OffscreenSlideRenderer.tsx - Hidden component for rendering slides offscreen for PDF export
import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { createPortal } from "react-dom";
import { toPng } from "html-to-image";
import { Slide } from "@/app/contexts/DataProvider";
import SlideReadOnlyRenderer from "./SlideReadOnlyRenderer";
import { getFileUrl } from "@/shared/utils/api";

const NATIVE_SLIDE_WIDTH = 1920;
const NATIVE_SLIDE_HEIGHT = 1080;

export interface SlideImageData {
  slideId: string;
  title: string;
  imageDataUrl: string;
}

export interface OffscreenSlideRendererRef {
  captureAllSlides: (
    slides: Slide[],
    onProgress?: (current: number, total: number) => void
  ) => Promise<SlideImageData[]>;
}

// No props needed - this is a hidden utility component
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface OffscreenSlideRendererProps {}

/**
 * Wait for all images in a DOM tree to load
 */
async function waitForImagesToLoad(root: HTMLElement, timeoutMs = 5000): Promise<void> {
  const images = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
  const bgImageElements = Array.from(root.querySelectorAll('[style*="background-image"]')) as HTMLElement[];

  const imagePromises: Promise<void>[] = [];

  images.forEach((img) => {
    if (!img.src) return;
    imagePromises.push(
      new Promise<void>((resolve) => {
        if (img.complete && img.naturalWidth > 0) {
          resolve();
          return;
        }
        const onDone = () => {
          img.removeEventListener('load', onDone);
          img.removeEventListener('error', onDone);
          resolve();
        };
        img.addEventListener('load', onDone);
        img.addEventListener('error', onDone);
      })
    );
  });

  bgImageElements.forEach((el) => {
    const style = window.getComputedStyle(el);
    const bgImage = style.backgroundImage;
    if (bgImage && bgImage !== 'none') {
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

  await Promise.race([
    Promise.all(imagePromises),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/**
 * Hide scrollbars and UI elements for clean export
 */
function hideScrollbarsForExport(root: HTMLElement): void {
  const textboxes = root.querySelectorAll<HTMLElement>('.editor-textbox');
  textboxes.forEach((el) => {
    el.style.overflow = 'hidden';
    el.scrollTop = 0;
    el.scrollLeft = 0;
  });

  const handles = root.querySelectorAll<HTMLElement>(
    '.textbox-resize-handle, .textbox-move-handle, .textbox-rotate-handle, .textbox-rotate-handle-line'
  );
  handles.forEach((el) => {
    el.style.display = 'none';
  });
}

/**
 * Offscreen Slide Renderer Component
 * Renders slides in an invisible container for high-quality PDF export capture
 */
const OffscreenSlideRenderer = forwardRef<OffscreenSlideRendererRef, OffscreenSlideRendererProps>(
  (_, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [currentSlide, setCurrentSlide] = useState<Slide | null>(null);
    const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
    const resolveRenderRef = useRef<(() => void) | null>(null);

    // Create the offscreen container on mount
    useEffect(() => {
      const container = document.createElement('div');
      container.id = 'offscreen-slide-renderer';
      container.style.cssText = `
        position: fixed;
        left: -10000px;
        top: 0;
        width: ${NATIVE_SLIDE_WIDTH}px;
        height: ${NATIVE_SLIDE_HEIGHT}px;
        overflow: hidden;
        pointer-events: none;
        z-index: -1;
        visibility: hidden;
      `;
      document.body.appendChild(container);
      setPortalContainer(container);

      return () => {
        container.remove();
      };
    }, []);

    // When currentSlide changes and render is complete, resolve the promise
    useEffect(() => {
      if (currentSlide && resolveRenderRef.current) {
        // Wait for React to render and images to load
        const timer = setTimeout(async () => {
          if (containerRef.current) {
            await waitForImagesToLoad(containerRef.current, 3000);
          }
          // Wait a bit more for any animations
          await new Promise(resolve => setTimeout(resolve, 100));
          resolveRenderRef.current?.();
          resolveRenderRef.current = null;
        }, 200);

        return () => clearTimeout(timer);
      }
    }, [currentSlide]);

    /**
     * Render a slide and wait for it to be ready
     */
    const renderSlideAndWait = useCallback((slide: Slide): Promise<void> => {
      return new Promise((resolve) => {
        resolveRenderRef.current = resolve;
        setCurrentSlide(slide);
      });
    }, []);

    /**
     * Capture the currently rendered slide as PNG
     */
    const captureCurrentSlide = useCallback(async (backgroundColor: string): Promise<string | null> => {
      if (!containerRef.current) return null;

      try {
        // Wait for fonts
        if (document.fonts?.ready) {
          await document.fonts.ready;
        }

        // Hide scrollbars
        hideScrollbarsForExport(containerRef.current);

        const dataUrl = await toPng(containerRef.current, {
          width: NATIVE_SLIDE_WIDTH,
          height: NATIVE_SLIDE_HEIGHT,
          canvasWidth: NATIVE_SLIDE_WIDTH,
          canvasHeight: NATIVE_SLIDE_HEIGHT,
          backgroundColor,
          cacheBust: true,
          pixelRatio: 2, // 2x resolution for good quality without being too large
          quality: 1.0,
          skipAutoScale: true,
        });

        return dataUrl;
      } catch (error) {
        console.error('[OffscreenSlideRenderer] Capture failed:', error);
        return null;
      }
    }, []);

    /**
     * Capture all slides sequentially
     */
    const captureAllSlides = useCallback(async (
      slides: Slide[],
      onProgress?: (current: number, total: number) => void
    ): Promise<SlideImageData[]> => {
      const results: SlideImageData[] = [];

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        onProgress?.(i + 1, slides.length);

        // Render the slide
        await renderSlideAndWait(slide);

        // Capture it
        const backgroundColor = slide.backgroundColor || '#101112';
        const imageDataUrl = await captureCurrentSlide(backgroundColor);

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

      // Clear the current slide
      setCurrentSlide(null);

      return results;
    }, [renderSlideAndWait, captureCurrentSlide]);

    // Expose the capture method via ref
    useImperativeHandle(ref, () => ({
      captureAllSlides,
    }), [captureAllSlides]);

    // Render the offscreen container via portal
    if (!portalContainer || !currentSlide) {
      return null;
    }

    const backgroundColor = currentSlide.backgroundColor || '#101112';
    const backgroundImage = currentSlide.backgroundImage 
      ? `url(${getFileUrl(currentSlide.backgroundImage)})`
      : undefined;

    return createPortal(
      <div
        ref={containerRef}
        data-slide-id={currentSlide.id}
        style={{
          width: NATIVE_SLIDE_WIDTH,
          height: NATIVE_SLIDE_HEIGHT,
          backgroundColor,
          backgroundImage,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <SlideReadOnlyRenderer
          content={currentSlide.content}
          contentPadding="96px 120px"
        />
      </div>,
      portalContainer
    );
  }
);

OffscreenSlideRenderer.displayName = 'OffscreenSlideRenderer';

export default OffscreenSlideRenderer;
