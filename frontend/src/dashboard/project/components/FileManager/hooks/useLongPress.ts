/**
 * useLongPress - Hook for detecting long-press gestures on touch devices
 * 
 * Features:
 * - Configurable delay (default 500ms for iOS-like feel)
 * - Cancels on move (prevents accidental triggers during scroll)
 * - Works with both touch and mouse (for testing)
 * - Returns event handlers to spread on target element
 */

import { useCallback, useRef } from 'react';

export interface UseLongPressOptions {
  /** Delay in ms before triggering (default: 500) */
  delay?: number;
  /** Movement threshold in pixels to cancel (default: 10) */
  moveThreshold?: number;
  /** Called when long-press triggers */
  onLongPress: (e: React.TouchEvent | React.MouseEvent) => void;
  /** Called on regular tap/click (optional) */
  onClick?: (e: React.TouchEvent | React.MouseEvent) => void;
  /** Disable long-press behavior */
  disabled?: boolean;
}

export interface LongPressHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseUp?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
}

export function useLongPress({
  delay = 500,
  moveThreshold = 10,
  onLongPress,
  onClick,
  disabled = false,
}: UseLongPressOptions): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;

      const touch = e.touches[0];
      startPosRef.current = { x: touch.clientX, y: touch.clientY };
      longPressTriggeredRef.current = false;

      timerRef.current = setTimeout(() => {
        longPressTriggeredRef.current = true;
        onLongPress(e);
      }, delay);
    },
    [delay, disabled, onLongPress]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startPosRef.current || disabled) return;

      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - startPosRef.current.x);
      const dy = Math.abs(touch.clientY - startPosRef.current.y);

      if (dx > moveThreshold || dy > moveThreshold) {
        clearTimer();
        startPosRef.current = null;
      }
    },
    [clearTimer, moveThreshold, disabled]
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      clearTimer();
      startPosRef.current = null;

      // If long-press didn't trigger, treat as tap
      if (!longPressTriggeredRef.current && onClick) {
        onClick(e);
      }
    },
    [clearTimer, onClick]
  );

  // Mouse handlers for desktop testing (optional)
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || e.button !== 0) return; // Only left click

      startPosRef.current = { x: e.clientX, y: e.clientY };
      longPressTriggeredRef.current = false;

      timerRef.current = setTimeout(() => {
        longPressTriggeredRef.current = true;
        onLongPress(e);
      }, delay);
    },
    [delay, disabled, onLongPress]
  );

  const onMouseUp = useCallback(
    (e: React.MouseEvent) => {
      clearTimer();
      startPosRef.current = null;
    },
    [clearTimer]
  );

  const onMouseLeave = useCallback(() => {
    clearTimer();
    startPosRef.current = null;
  }, [clearTimer]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onMouseDown,
    onMouseUp,
    onMouseLeave,
  };
}

export default useLongPress;
