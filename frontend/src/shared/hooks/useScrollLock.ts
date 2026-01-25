/**
 * useScrollLock - Prevents body scroll when a modal/drawer is open
 * =============================================================================
 * Extracted from NavigationDrawer pattern. Handles:
 * - body & html overflow: hidden
 * - touchAction: none for iOS
 * - Restores original values on cleanup
 * =============================================================================
 */
import { useEffect, useRef } from "react";

export interface ScrollLockOptions {
  /** Whether the lock is active */
  enabled: boolean;
  /** Optional element to lock scroll on (defaults to document.body) */
  element?: HTMLElement | null;
}

/**
 * Lock body scroll when enabled is true.
 * Automatically restores original scroll behavior on cleanup.
 */
export function useScrollLock(options: ScrollLockOptions): void;
export function useScrollLock(enabled: boolean): void;
export function useScrollLock(
  optionsOrEnabled: ScrollLockOptions | boolean
): void {
  const enabled =
    typeof optionsOrEnabled === "boolean"
      ? optionsOrEnabled
      : optionsOrEnabled.enabled;

  const originalStylesRef = useRef<{
    bodyOverflow: string;
    htmlOverflow: string;
    bodyTouchAction: string;
    htmlTouchAction: string;
    bodyPosition: string;
    bodyTop: string;
    bodyLeft: string;
    bodyRight: string;
    scrollY: number;
  } | null>(null);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") {
      return;
    }

    const { body, documentElement } = document;
    const scrollY = window.scrollY;

    // Store original values
    originalStylesRef.current = {
      bodyOverflow: body.style.overflow,
      htmlOverflow: documentElement.style.overflow,
      bodyTouchAction: body.style.touchAction,
      htmlTouchAction: documentElement.style.touchAction,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      scrollY,
    };

    // Apply lock styles
    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";
    body.style.touchAction = "none";
    documentElement.style.touchAction = "none";

    // iOS Safari fix: position fixed to prevent background scroll
    // This also prevents the bounce effect
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";

    return () => {
      if (!originalStylesRef.current) return;

      const orig = originalStylesRef.current;

      // Restore original styles
      body.style.overflow = orig.bodyOverflow;
      documentElement.style.overflow = orig.htmlOverflow;
      body.style.touchAction = orig.bodyTouchAction;
      documentElement.style.touchAction = orig.htmlTouchAction;
      body.style.position = orig.bodyPosition;
      body.style.top = orig.bodyTop;
      body.style.left = orig.bodyLeft;
      body.style.right = orig.bodyRight;

      // Restore scroll position
      window.scrollTo(0, orig.scrollY);
    };
  }, [enabled]);
}

export default useScrollLock;
