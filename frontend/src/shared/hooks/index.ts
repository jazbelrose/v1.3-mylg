/**
 * Shared Hooks - Barrel Export
 * =============================================================================
 * Central export point for all shared hooks.
 * =============================================================================
 */

// Responsive breakpoints
export {
  BREAKPOINTS,
  MEDIA_QUERIES,
  useMediaQuery,
  useIsMobile,
  useIsTablet,
  useIsDesktop,
  useIsTouchDevice,
  useBreakpoint,
  useBreakpoints,
  useIsPhone,
  type BreakpointKey,
} from "./useBreakpoints";

// Scroll lock
export { useScrollLock, type ScrollLockOptions } from "./useScrollLock";

// Swipe gesture
export {
  useSwipeGesture,
  type SwipeDirection,
  type SwipeGestureOptions,
  type SwipeHandlers,
} from "./useSwipeGesture";

// Nav collapsed state
export { useNavCollapsed } from "./useNavCollapsed";

// Long press gesture
export {
  useLongPress,
  type UseLongPressOptions,
  type UseLongPressReturn,
} from "./useLongPress";

// File reference tracking
export { useFileReferenceTracking } from "./useFileReferenceTracking";
