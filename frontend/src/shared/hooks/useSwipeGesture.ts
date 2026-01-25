/**
 * useSwipeGesture - Swipe detection for touch devices
 * =============================================================================
 * Generalized from ActionSheet swipe-to-dismiss pattern.
 * Returns handlers to attach to a touch-enabled element.
 * =============================================================================
 */
import { useRef, useCallback, useMemo } from "react";

export type SwipeDirection = "up" | "down" | "left" | "right";

export interface SwipeGestureOptions {
  /** Direction(s) to detect. Default: ['down'] */
  direction?: SwipeDirection | SwipeDirection[];
  /** Minimum distance in px to trigger swipe. Default: 100 */
  threshold?: number;
  /** Callback when swipe is detected */
  onSwipe: (direction: SwipeDirection, distance: number) => void;
  /** Optional callback during swipe (for animations) */
  onSwipeMove?: (direction: SwipeDirection, distance: number) => void;
  /** Optional callback when swipe is cancelled (didn't meet threshold) */
  onSwipeCancel?: () => void;
  /** Whether to prevent default touch behavior. Default: false */
  preventDefault?: boolean;
}

export interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

const DEFAULT_THRESHOLD = 100;

/**
 * Hook that returns touch event handlers for swipe detection.
 */
export function useSwipeGesture(options: SwipeGestureOptions): SwipeHandlers {
  const {
    direction = "down",
    threshold = DEFAULT_THRESHOLD,
    onSwipe,
    onSwipeMove,
    onSwipeCancel,
    preventDefault = false,
  } = options;

  const directions = useMemo(
    () => (Array.isArray(direction) ? direction : [direction]),
    [direction]
  );

  const startPos = useRef<{ x: number; y: number } | null>(null);
  const currentDir = useRef<SwipeDirection | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      startPos.current = { x: touch.clientX, y: touch.clientY };
      currentDir.current = null;
    },
    []
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startPos.current) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - startPos.current.x;
      const deltaY = touch.clientY - startPos.current.y;

      // Determine primary direction
      let detectedDir: SwipeDirection | null = null;
      let distance = 0;

      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        // Vertical swipe
        if (deltaY > 0 && directions.includes("down")) {
          detectedDir = "down";
          distance = deltaY;
        } else if (deltaY < 0 && directions.includes("up")) {
          detectedDir = "up";
          distance = Math.abs(deltaY);
        }
      } else {
        // Horizontal swipe
        if (deltaX > 0 && directions.includes("right")) {
          detectedDir = "right";
          distance = deltaX;
        } else if (deltaX < 0 && directions.includes("left")) {
          detectedDir = "left";
          distance = Math.abs(deltaX);
        }
      }

      if (detectedDir) {
        currentDir.current = detectedDir;
        if (preventDefault) {
          e.preventDefault();
        }
        onSwipeMove?.(detectedDir, distance);
      }
    },
    [directions, onSwipeMove, preventDefault]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!startPos.current) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - startPos.current.x;
      const deltaY = touch.clientY - startPos.current.y;

      let distance = 0;
      let detectedDir: SwipeDirection | null = null;

      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        if (deltaY > threshold && directions.includes("down")) {
          detectedDir = "down";
          distance = deltaY;
        } else if (deltaY < -threshold && directions.includes("up")) {
          detectedDir = "up";
          distance = Math.abs(deltaY);
        }
      } else {
        if (deltaX > threshold && directions.includes("right")) {
          detectedDir = "right";
          distance = deltaX;
        } else if (deltaX < -threshold && directions.includes("left")) {
          detectedDir = "left";
          distance = Math.abs(deltaX);
        }
      }

      if (detectedDir) {
        onSwipe(detectedDir, distance);
      } else if (currentDir.current) {
        // Swipe started but didn't meet threshold
        onSwipeCancel?.();
      }

      startPos.current = null;
      currentDir.current = null;
    },
    [directions, threshold, onSwipe, onSwipeCancel]
  );

  return useMemo(
    () => ({
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    }),
    [handleTouchStart, handleTouchMove, handleTouchEnd]
  );
}

export default useSwipeGesture;
