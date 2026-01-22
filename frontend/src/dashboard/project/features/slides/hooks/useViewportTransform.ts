/**
 * useViewportTransform.ts - Hook to track viewport transform for comment overlays
 * 
 * Converts slide coordinates to screen coordinates by tracking the canvas
 * element's position in the viewport, accounting for zoom, scroll, and pan.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

export interface ViewportTransform {
  /** Canvas element's bounding rect in viewport coordinates */
  canvasRect: DOMRect | null;
  /** Current zoom level (1 = 100%) */
  zoom: number;
  /** Whether the transform is ready (canvas has been measured) */
  ready: boolean;
}

export interface SlideToScreenCoords {
  /** Convert slide-space X (0-100%) to screen pixels */
  slideXToScreen: (percentX: number) => number;
  /** Convert slide-space Y (0-100%) to screen pixels */
  slideYToScreen: (percentY: number) => number;
  /** Convert screen pixels to slide-space X (0-100%) */
  screenXToSlide: (screenX: number) => number;
  /** Convert screen pixels to slide-space Y (0-100%) */
  screenYToSlide: (screenY: number) => number;
}

export interface UseViewportTransformResult extends ViewportTransform, SlideToScreenCoords {
  /** Update the canvas rect (call after scroll, resize, zoom) */
  updateTransform: () => void;
}

/**
 * Hook to track viewport transform for converting between slide and screen coordinates
 * @param canvasRef - Ref to the canvas element (the zoomed slide container)
 * @param zoom - Current zoom level (1 = 100%)
 * @param slideWidth - Natural slide width in pixels
 * @param slideHeight - Natural slide height in pixels
 */
export function useViewportTransform(
  canvasRef: React.RefObject<HTMLElement | null>,
  zoom: number,
  _slideWidth?: number,
  _slideHeight?: number
): UseViewportTransformResult {
  // slideWidth/slideHeight reserved for future use (e.g., coordinate validation)
  void _slideWidth; void _slideHeight;
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const rafRef = useRef<number | null>(null);

  const updateTransform = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      if (canvasRef.current) {
        setCanvasRect(canvasRef.current.getBoundingClientRect());
      }
    });
  }, [canvasRef]);

  // Update on mount and when zoom changes
  useEffect(() => {
    updateTransform();
  }, [updateTransform, zoom]);

  // Listen for scroll, resize, and other events that may affect position
  useEffect(() => {
    const handleUpdate = () => updateTransform();

    window.addEventListener('scroll', handleUpdate, true); // Capture phase for nested scrolls
    window.addEventListener('resize', handleUpdate);

    // Use ResizeObserver for container size changes
    let resizeObserver: ResizeObserver | null = null;
    if (canvasRef.current) {
      resizeObserver = new ResizeObserver(handleUpdate);
      resizeObserver.observe(canvasRef.current);
      
      // Also observe parent for layout changes
      const parent = canvasRef.current.parentElement;
      if (parent) {
        resizeObserver.observe(parent);
      }
    }

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
      resizeObserver?.disconnect();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [canvasRef, updateTransform]);

  // Coordinate conversion functions
  const converters = useMemo<SlideToScreenCoords>(() => {
    const slideXToScreen = (percentX: number): number => {
      if (!canvasRect) return 0;
      // The canvas rect already reflects the scaled size
      // So we just map percentage to the visible rect
      return canvasRect.left + (percentX / 100) * canvasRect.width;
    };

    const slideYToScreen = (percentY: number): number => {
      if (!canvasRect) return 0;
      return canvasRect.top + (percentY / 100) * canvasRect.height;
    };

    const screenXToSlide = (screenX: number): number => {
      if (!canvasRect || canvasRect.width === 0) return 0;
      return ((screenX - canvasRect.left) / canvasRect.width) * 100;
    };

    const screenYToSlide = (screenY: number): number => {
      if (!canvasRect || canvasRect.height === 0) return 0;
      return ((screenY - canvasRect.top) / canvasRect.height) * 100;
    };

    return { slideXToScreen, slideYToScreen, screenXToSlide, screenYToSlide };
  }, [canvasRect]);

  return {
    canvasRect,
    zoom,
    ready: canvasRect !== null,
    updateTransform,
    ...converters,
  };
}

export default useViewportTransform;
