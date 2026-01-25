import { useCallback, useRef, TouchEvent, MouseEvent } from "react";

export interface UseLongPressOptions {
  /** Delay in ms before long press is triggered. Default: 500 */
  delay?: number;
  /** Callback on long press */
  onLongPress: () => void;
  /** Callback on regular click/tap (if not a long press) */
  onClick?: () => void;
  /** Whether long press is disabled */
  disabled?: boolean;
}

export interface UseLongPressReturn {
  onMouseDown: (e: MouseEvent) => void;
  onMouseUp: (e: MouseEvent) => void;
  onMouseLeave: (e: MouseEvent) => void;
  onTouchStart: (e: TouchEvent) => void;
  onTouchEnd: (e: TouchEvent) => void;
  onTouchCancel: (e: TouchEvent) => void;
}

/**
 * Hook for detecting long press gestures.
 * Returns event handlers to spread onto the target element.
 */
export function useLongPress({
  delay = 500,
  onLongPress,
  onClick,
  disabled = false,
}: UseLongPressOptions): UseLongPressReturn {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (disabled) return;

      // Get start position
      if ("touches" in e && e.touches.length > 0) {
        startPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if ("clientX" in e) {
        startPosRef.current = { x: e.clientX, y: e.clientY };
      }

      isLongPressRef.current = false;
      clear();

      timerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        onLongPress();
      }, delay);
    },
    [delay, disabled, onLongPress, clear]
  );

  const end = useCallback(
    (e: MouseEvent | TouchEvent) => {
      const wasLongPress = isLongPressRef.current;
      clear();

      // If it wasn't a long press, trigger onClick
      if (!wasLongPress && onClick && !disabled) {
        onClick();
      }

      startPosRef.current = null;
    },
    [clear, onClick, disabled]
  );

  const cancel = useCallback(() => {
    clear();
    startPosRef.current = null;
  }, [clear]);

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!startPosRef.current) return;

      // Cancel if moved too far (prevents scroll triggering long press)
      const touch = e.touches[0];
      if (touch) {
        const dx = Math.abs(touch.clientX - startPosRef.current.x);
        const dy = Math.abs(touch.clientY - startPosRef.current.y);
        if (dx > 10 || dy > 10) {
          cancel();
        }
      }
    },
    [cancel]
  );

  return {
    onMouseDown: start as (e: MouseEvent) => void,
    onMouseUp: end as (e: MouseEvent) => void,
    onMouseLeave: cancel as (e: MouseEvent) => void,
    onTouchStart: start as (e: TouchEvent) => void,
    onTouchEnd: end as (e: TouchEvent) => void,
    onTouchCancel: cancel as (e: TouchEvent) => void,
  };
}

export default useLongPress;
