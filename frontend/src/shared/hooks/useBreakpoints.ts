/**
 * useBreakpoints - Responsive detection hooks
 * =============================================================================
 * Single source of truth for JS breakpoint logic.
 * Values MUST match CSS tokens in design-tokens/breakpoints.css exactly.
 *
 * Convention:
 *   - max-width uses (breakpoint - 1) to avoid collision at exact value
 *   - min-width uses exact breakpoint value
 * =============================================================================
 */
import { useState, useEffect, useMemo } from "react";

/**
 * Breakpoint values in pixels.
 * Keep in sync with --breakpoint-* CSS custom properties.
 */
export const BREAKPOINTS = {
  xs: 480,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1200,
  "2xl": 1600,
} as const;

export type BreakpointKey = keyof typeof BREAKPOINTS;

/**
 * Pre-built media query strings for consistency.
 * Use these instead of building queries manually.
 */
export const MEDIA_QUERIES = {
  // Max-width (below breakpoint) - subtract 1 to avoid collision
  belowXs: `(max-width: ${BREAKPOINTS.xs - 1}px)`,
  belowSm: `(max-width: ${BREAKPOINTS.sm - 1}px)`,
  belowMd: `(max-width: ${BREAKPOINTS.md - 1}px)`,
  belowLg: `(max-width: ${BREAKPOINTS.lg - 1}px)`,
  belowXl: `(max-width: ${BREAKPOINTS.xl - 1}px)`,
  below2xl: `(max-width: ${BREAKPOINTS["2xl"] - 1}px)`,

  // Min-width (at or above breakpoint)
  aboveXs: `(min-width: ${BREAKPOINTS.xs}px)`,
  aboveSm: `(min-width: ${BREAKPOINTS.sm}px)`,
  aboveMd: `(min-width: ${BREAKPOINTS.md}px)`,
  aboveLg: `(min-width: ${BREAKPOINTS.lg}px)`,
  aboveXl: `(min-width: ${BREAKPOINTS.xl}px)`,
  above2xl: `(min-width: ${BREAKPOINTS["2xl"]}px)`,

  // Range queries
  xsOnly: `(max-width: ${BREAKPOINTS.xs - 1}px)`,
  smOnly: `(min-width: ${BREAKPOINTS.xs}px) and (max-width: ${BREAKPOINTS.sm - 1}px)`,
  mdOnly: `(min-width: ${BREAKPOINTS.sm}px) and (max-width: ${BREAKPOINTS.md - 1}px)`,
  lgOnly: `(min-width: ${BREAKPOINTS.md}px) and (max-width: ${BREAKPOINTS.lg - 1}px)`,
  xlOnly: `(min-width: ${BREAKPOINTS.lg}px) and (max-width: ${BREAKPOINTS.xl - 1}px)`,

  // Semantic aliases (phone/tablet/desktop)
  phone: `(max-width: ${BREAKPOINTS.sm - 1}px)`,          // ≤639px
  tablet: `(min-width: ${BREAKPOINTS.sm}px) and (max-width: ${BREAKPOINTS.lg - 1}px)`, // 640-1023px
  desktop: `(min-width: ${BREAKPOINTS.lg}px)`,            // ≥1024px

  // Touch-friendly detection
  touch: "(hover: none) and (pointer: coarse)",
  mouse: "(hover: hover) and (pointer: fine)",
} as const;

/**
 * Generic media query hook.
 * Safely handles SSR (returns false on server).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/**
 * Phone breakpoint (≤639px).
 * Use for single-column layouts, bottom sheets, simplified UI.
 */
export function useIsMobile(): boolean {
  return useMediaQuery(MEDIA_QUERIES.phone);
}

/**
 * Tablet breakpoint (640px - 1023px).
 * Use for 2-column layouts, side panels, touch-optimized UI.
 */
export function useIsTablet(): boolean {
  return useMediaQuery(MEDIA_QUERIES.tablet);
}

/**
 * Desktop breakpoint (≥1024px).
 * Use for full navigation drawer, multi-column layouts.
 */
export function useIsDesktop(): boolean {
  return useMediaQuery(MEDIA_QUERIES.desktop);
}

/**
 * Touch device detection (hover: none + pointer: coarse).
 * Use for touch-specific UI like long-press, swipe gestures.
 */
export function useIsTouchDevice(): boolean {
  return useMediaQuery(MEDIA_QUERIES.touch);
}

/**
 * Returns current breakpoint tier.
 * Useful for switch statements or conditional rendering.
 */
export function useBreakpoint(): BreakpointKey | "base" {
  const isAbove2xl = useMediaQuery(MEDIA_QUERIES.above2xl);
  const isAboveXl = useMediaQuery(MEDIA_QUERIES.aboveXl);
  const isAboveLg = useMediaQuery(MEDIA_QUERIES.aboveLg);
  const isAboveMd = useMediaQuery(MEDIA_QUERIES.aboveMd);
  const isAboveSm = useMediaQuery(MEDIA_QUERIES.aboveSm);
  const isAboveXs = useMediaQuery(MEDIA_QUERIES.aboveXs);

  if (isAbove2xl) return "2xl";
  if (isAboveXl) return "xl";
  if (isAboveLg) return "lg";
  if (isAboveMd) return "md";
  if (isAboveSm) return "sm";
  if (isAboveXs) return "xs";
  return "base";
}

/**
 * Returns all breakpoint states at once.
 * More efficient than calling multiple individual hooks.
 */
export function useBreakpoints() {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isDesktop = useIsDesktop();
  const isTouchDevice = useIsTouchDevice();
  const breakpoint = useBreakpoint();

  return useMemo(
    () => ({
      isMobile,
      isTablet,
      isDesktop,
      isTouchDevice,
      breakpoint,
      // Convenience booleans
      isMobileOrTablet: isMobile || isTablet,
      isTabletOrDesktop: isTablet || isDesktop,
    }),
    [isMobile, isTablet, isDesktop, isTouchDevice, breakpoint]
  );
}

// Legacy aliases for backward compatibility
export { useIsMobile as useIsPhone };

export default useMediaQuery;
