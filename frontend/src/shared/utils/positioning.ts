/**
 * Positioning utility for tooltips and popovers
 * Provides viewport-aware, direction-aware positioning with boundary detection
 * 
 * Strategy: Top-first bias with smart flipping based on available space
 * - Prefers 'top' placement unless space is clearly insufficient (< MIN_SPACE_THRESHOLD)
 * - Flip priority: top → bottom → right → left
 * - Chooses direction with most free space to avoid covering dense content
 */

export const POPPER_GAP = 8;
export const VIEWPORT_PADDING = 16;
export const MIN_SPACE_THRESHOLD = 140; // Minimum viable space for a direction (px)

export type TooltipPosition = {
  top: number;
  left: number;
  placement: "top" | "bottom" | "left" | "right";
};

export type PositionPreference = "top" | "bottom" | "left" | "right" | "auto";

export interface CalculateTooltipPositionOptions {
  anchorRect: DOMRect;
  tooltipRect: DOMRect;
  preference?: PositionPreference;
  gap?: number;
  viewportPadding?: number;
}

/**
 * Calculate smart tooltip position with viewport boundary detection
 * Automatically flips direction when space is insufficient
 */
export function calculateTooltipPosition({
  anchorRect,
  tooltipRect,
  preference = "top",
  gap = POPPER_GAP,
  viewportPadding = VIEWPORT_PADDING,
}: CalculateTooltipPositionOptions): TooltipPosition {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  };

  // Calculate available space in each direction
  const spaceAbove = anchorRect.top - viewportPadding;
  const spaceBelow = viewport.height - anchorRect.bottom - viewportPadding;
  const spaceLeft = anchorRect.left - viewportPadding;
  const spaceRight = viewport.width - anchorRect.right - viewportPadding;

  let placement: TooltipPosition["placement"];
  let top: number;
  let left: number;

  // Determine optimal placement
  if (preference === "auto") {
    // Choose direction with most space
    const maxSpace = Math.max(spaceAbove, spaceBelow, spaceLeft, spaceRight);
    if (maxSpace === spaceAbove) preference = "top";
    else if (maxSpace === spaceBelow) preference = "bottom";
    else if (maxSpace === spaceLeft) preference = "left";
    else preference = "right";
  }

  // Try preferred direction first, flip if insufficient space
  // Top-first bias: prefer 'top' unless space is clearly worse
  if (preference === "top" || preference === "bottom") {
    // Vertical positioning
    if (preference === "top" && spaceAbove >= Math.max(tooltipRect.height + gap, MIN_SPACE_THRESHOLD)) {
      // Show above (preferred)
      placement = "top";
      top = anchorRect.top - tooltipRect.height - gap;
    } else if (preference === "bottom" && spaceBelow >= Math.max(tooltipRect.height + gap, MIN_SPACE_THRESHOLD)) {
      // Show below (preferred)
      placement = "bottom";
      top = anchorRect.bottom + gap;
    } else if (spaceBelow >= Math.max(tooltipRect.height + gap, MIN_SPACE_THRESHOLD)) {
      // Flip to below if good space available
      placement = "bottom";
      top = anchorRect.bottom + gap;
    } else if (spaceAbove >= tooltipRect.height + gap) {
      // Flip to above even with less space
      placement = "top";
      top = anchorRect.top - tooltipRect.height - gap;
    } else {
      // Not enough space either direction, clamp to viewport
      placement = preference;
      if (preference === "top") {
        top = Math.max(viewportPadding, anchorRect.top - tooltipRect.height - gap);
      } else {
        top = Math.min(
          viewport.height - tooltipRect.height - viewportPadding,
          anchorRect.bottom + gap,
        );
      }
    }

    // Center horizontally relative to anchor
    left = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;

    // Clamp horizontally to viewport
    if (left + tooltipRect.width > viewport.width - viewportPadding) {
      left = viewport.width - tooltipRect.width - viewportPadding;
    }
    if (left < viewportPadding) {
      left = viewportPadding;
    }
  } else {
    // Horizontal positioning
    if (preference === "left" && spaceLeft >= tooltipRect.width + gap) {
      // Show left
      placement = "left";
      left = anchorRect.left - tooltipRect.width - gap;
    } else if (preference === "right" && spaceRight >= tooltipRect.width + gap) {
      // Show right
      placement = "right";
      left = anchorRect.right + gap;
    } else if (spaceRight >= tooltipRect.width + gap) {
      // Flip to right if space available
      placement = "right";
      left = anchorRect.right + gap;
    } else if (spaceLeft >= tooltipRect.width + gap) {
      // Flip to left if space available
      placement = "left";
      left = anchorRect.left - tooltipRect.width - gap;
    } else {
      // Not enough space either direction, clamp to viewport
      placement = preference;
      if (preference === "left") {
        left = Math.max(viewportPadding, anchorRect.left - tooltipRect.width - gap);
      } else {
        left = Math.min(
          viewport.width - tooltipRect.width - viewportPadding,
          anchorRect.right + gap,
        );
      }
    }

    // Center vertically relative to anchor
    top = anchorRect.top + anchorRect.height / 2 - tooltipRect.height / 2;

    // Clamp vertically to viewport
    if (top + tooltipRect.height > viewport.height - viewportPadding) {
      top = viewport.height - tooltipRect.height - viewportPadding;
    }
    if (top < viewportPadding) {
      top = viewportPadding;
    }
  }

  return { top, left, placement };
}

/**
 * Detect if device has coarse pointer (touch) or no hover capability
 * Used to disable hover tooltips on mobile devices
 */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: none), (pointer: coarse)").matches;
}
