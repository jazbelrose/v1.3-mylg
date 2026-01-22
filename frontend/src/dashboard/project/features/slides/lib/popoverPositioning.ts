/**
 * popoverPositioning.ts - Viewport-aware popover positioning utilities
 * 
 * Calculates optimal popover position to avoid clipping at viewport edges,
 * with support for flip and shift strategies.
 */

export interface PopoverPosition {
  x: number;
  y: number;
  placement: 'left' | 'right' | 'top' | 'bottom';
  arrowOffset?: number; // Arrow offset from center if shifted
}

export interface PositionOptions {
  /** Anchor point in screen coordinates */
  anchorX: number;
  anchorY: number;
  /** Popover dimensions */
  popoverWidth: number;
  popoverHeight: number;
  /** Viewport bounds (defaults to window) */
  viewportRect?: DOMRect;
  /** Preferred placement */
  preferredPlacement?: 'left' | 'right' | 'top' | 'bottom';
  /** Gap between anchor and popover */
  offset?: number;
  /** Minimum distance from viewport edge */
  margin?: number;
}

/**
 * Calculate optimal popover position with automatic flip and shift
 */
export function calculatePopoverPosition(options: PositionOptions): PopoverPosition {
  const {
    anchorX,
    anchorY,
    popoverWidth,
    popoverHeight,
    viewportRect,
    preferredPlacement = 'right',
    offset = 12,
    margin = 8,
  } = options;

  // Get viewport bounds
  const viewport = viewportRect ?? {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
    width: window.innerWidth,
    height: window.innerHeight,
  };

  // Available space in each direction
  const spaceRight = viewport.right - anchorX - margin;
  const spaceLeft = anchorX - viewport.left - margin;
  const spaceBottom = viewport.bottom - anchorY - margin;
  const spaceTop = anchorY - viewport.top - margin;

  // Determine horizontal placement (prefer right, flip if needed)
  let placement: 'left' | 'right' | 'top' | 'bottom' = preferredPlacement;
  let x: number;
  let y: number;

  if (preferredPlacement === 'right' || preferredPlacement === 'left') {
    // Horizontal placement
    const needsWidth = popoverWidth + offset;
    
    if (preferredPlacement === 'right' && spaceRight >= needsWidth) {
      placement = 'right';
      x = anchorX + offset;
    } else if (preferredPlacement === 'left' && spaceLeft >= needsWidth) {
      placement = 'left';
      x = anchorX - offset - popoverWidth;
    } else if (spaceRight >= needsWidth) {
      placement = 'right';
      x = anchorX + offset;
    } else if (spaceLeft >= needsWidth) {
      placement = 'left';
      x = anchorX - offset - popoverWidth;
    } else {
      // Not enough space on either side, use whichever has more
      if (spaceRight >= spaceLeft) {
        placement = 'right';
        x = Math.min(anchorX + offset, viewport.right - popoverWidth - margin);
      } else {
        placement = 'left';
        x = Math.max(viewport.left + margin, anchorX - offset - popoverWidth);
      }
    }

    // Vertical centering with shift
    y = anchorY - popoverHeight / 2;
    
    // Shift vertically if clipped
    if (y < viewport.top + margin) {
      y = viewport.top + margin;
    } else if (y + popoverHeight > viewport.bottom - margin) {
      y = viewport.bottom - margin - popoverHeight;
    }
  } else {
    // Vertical placement
    const needsHeight = popoverHeight + offset;
    
    if (preferredPlacement === 'bottom' && spaceBottom >= needsHeight) {
      placement = 'bottom';
      y = anchorY + offset;
    } else if (preferredPlacement === 'top' && spaceTop >= needsHeight) {
      placement = 'top';
      y = anchorY - offset - popoverHeight;
    } else if (spaceBottom >= needsHeight) {
      placement = 'bottom';
      y = anchorY + offset;
    } else if (spaceTop >= needsHeight) {
      placement = 'top';
      y = anchorY - offset - popoverHeight;
    } else {
      // Not enough space on either side
      if (spaceBottom >= spaceTop) {
        placement = 'bottom';
        y = Math.min(anchorY + offset, viewport.bottom - popoverHeight - margin);
      } else {
        placement = 'top';
        y = Math.max(viewport.top + margin, anchorY - offset - popoverHeight);
      }
    }

    // Horizontal centering with shift
    x = anchorX - popoverWidth / 2;
    
    // Shift horizontally if clipped
    if (x < viewport.left + margin) {
      x = viewport.left + margin;
    } else if (x + popoverWidth > viewport.right - margin) {
      x = viewport.right - margin - popoverWidth;
    }
  }

  // Calculate arrow offset if we shifted
  let arrowOffset: number | undefined;
  if (placement === 'right' || placement === 'left') {
    const idealY = anchorY - popoverHeight / 2;
    if (y !== idealY) {
      arrowOffset = anchorY - y - popoverHeight / 2;
    }
  } else {
    const idealX = anchorX - popoverWidth / 2;
    if (x !== idealX) {
      arrowOffset = anchorX - x - popoverWidth / 2;
    }
  }

  return { x, y, placement, arrowOffset };
}

/**
 * Clamp a value within the viewport bounds
 */
export function clampToViewport(
  x: number,
  y: number,
  width: number,
  height: number,
  margin = 8,
  viewportRect?: DOMRect
): { x: number; y: number } {
  const viewport = viewportRect ?? {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  };

  return {
    x: Math.max(viewport.left + margin, Math.min(x, viewport.right - width - margin)),
    y: Math.max(viewport.top + margin, Math.min(y, viewport.bottom - height - margin)),
  };
}
