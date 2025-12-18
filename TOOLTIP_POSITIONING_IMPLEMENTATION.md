# Week Grid Timeline Tooltip Positioning - Implementation Complete

## Summary

Fixed the week grid timeline tooltip hover behavior to prevent overlaps, direction issues, and hover deadlock. Implemented a comprehensive, direction-aware, viewport-bounded tooltip system following all UX best practices.

## Changes Made

### 1. **Enhanced Positioning Utility** ([positioning.ts](frontend/src/shared/utils/positioning.ts))

- **Top-first bias**: Prefers `top` placement unless space is < 140px (MIN_SPACE_THRESHOLD)
- **Flip priority**: top → bottom → right → left (based on available space)
- **Space-based direction choice**: Calculates available space in all directions and chooses the best fit
- **Viewport clamping**: Ensures tooltips never overflow viewport edges (12px padding)
- **Mobile detection utility**: `isTouchDevice()` detects coarse pointers and no-hover devices

### 2. **Smart Tooltip Portal Component** ([TimelineTooltipPortal.tsx](frontend/src/dashboard/project/features/calendar/components/TimelineTooltipPortal.tsx))

- **Portal rendering**: Uses `createPortal` to render at `document.body` level, avoiding z-index conflicts
- **Hover bridge**: Supports `onTooltipHover` callback to track tooltip hover state
- **Mobile disabled**: Automatically hidden on touch devices (hover: none, pointer: coarse)
- **Scroll/resize handling**: Tier 1 strategy - dismisses on scroll/resize to prevent floating tooltips
- **Escape key support**: Closes tooltip on Escape key press
- **Accessibility**: Includes `role="tooltip"` and `aria-live="polite"`
- **Pointer-safe**: `pointer-events: auto` allows users to move cursor to tooltip without closing

### 3. **Hover Bridge Pattern** (WeekGrid.tsx & DayGrid.tsx)

- **Dual hover tracking**: Tracks both anchor hover and tooltip hover via refs
  - `isAnchorHoverRef`: Tracks if mouse is over the timeline entry
  - `isTooltipHoverRef`: Tracks if mouse is over the tooltip
- **Close only when both false**: Tooltip closes only after 150ms delay when BOTH anchor and tooltip are not hovered
- **Prevents hover trap**: Users can now move cursor from entry → tooltip without it disappearing
- **150ms delays**: 
  - Show delay: 150ms after hover enter (prevents flicker on quick movements)
  - Close delay: 150ms after both hover exits (allows smooth transition)

### 4. **CSS Updates** ([calendar-preview.css](frontend/src/dashboard/project/features/calendar/calendar-preview.css))

- **Portal-specific styling**: `.week-grid__timeline-entry-tooltip--portal`
- **Fixed positioning**: Position calculated by JS, applied via inline styles
- **z-index: 1000**: Ensures tooltip is above all calendar content
- **pointer-events: auto**: Enables hover bridge interaction

## UX Decisions Implemented

### ✅ Positioning Preferences
- **Top-first bias** with intelligent flipping
- Only flips when space < MIN_SPACE_THRESHOLD (140px)
- Chooses direction with most available space to avoid dense content

### ✅ Hover Safety (Main Issue)
- **150ms show delay** prevents flicker
- **Hover bridge** allows moving from anchor → tooltip
- **Dual tracking** ensures tooltip stays open when either is hovered
- **No more hover deadlock** - users can now reach the tooltip

### ✅ Scroll/Resize Handling (Tier 1)
- Dismisses tooltip on scroll (capture phase for all containers)
- Dismisses on window resize
- Prevents "floating tooltip" issue without performance overhead

### ✅ Mobile Behavior
- Detects touch devices via media query: `(hover: none), (pointer: coarse)`
- Completely disables hover tooltips on mobile
- Mobile users access info via tap or other UI patterns

### ✅ Portal Layering & Z-Index
- Single z-layer constant: `z-index: 1000`
- Portaled at `document.body` level
- Consistent above all calendar content

### ✅ Performance
- Position calculated only on:
  - Initial hover enter
  - ResizeObserver triggers (for dynamic content)
- No recalculation on every mousemove
- Refs used for hover tracking (no re-renders)

### ✅ Accessibility
- `role="tooltip"` on tooltip element
- `aria-live="polite"` for dynamic updates
- Escape key closes tooltip
- Future: can add `aria-describedby` to anchors (optional enhancement)

## Testing Checklist

- [x] Tooltip positions correctly at top of viewport entries
- [x] Tooltip flips to bottom when near top edge
- [x] Tooltip doesn't overflow viewport on any edge
- [x] User can move cursor from entry → tooltip without closing
- [x] Tooltip closes after 150ms when leaving both anchor and tooltip
- [x] Tooltip dismisses on scroll
- [x] Tooltip dismisses on window resize
- [x] Tooltip hidden on touch devices
- [x] Escape key closes tooltip
- [x] No TypeScript errors in changed files
- [x] Z-index layering correct (above all calendar content)

## Files Changed

1. `frontend/src/shared/utils/positioning.ts` - Enhanced positioning logic
2. `frontend/src/dashboard/project/features/calendar/components/TimelineTooltipPortal.tsx` - Portal component with all UX features
3. `frontend/src/dashboard/project/features/calendar/components/WeekGrid.tsx` - Hover bridge pattern
4. `frontend/src/dashboard/project/features/calendar/components/DayGrid.tsx` - Hover bridge pattern
5. `frontend/src/dashboard/project/features/calendar/calendar-preview.css` - Portal styling

## Edge Cases Handled

1. **Top row entries**: Tooltip flips to bottom automatically
2. **Right edge entries**: Tooltip clamped to viewport with 12px padding
3. **Rapid mouse movements**: 150ms show delay prevents flicker
4. **Moving to tooltip**: Hover bridge keeps it open
5. **Scroll while hovering**: Tooltip dismisses cleanly
6. **Mobile/touch**: Completely disabled to avoid sticky tooltips
7. **Narrow viewports**: Responsive width: `max(180px, min(240px, 60vw))`

## Future Enhancements (Optional)

1. **Tier 2 scroll handling**: Reposition on scroll instead of dismiss (more complex)
2. **aria-describedby**: Add to anchor elements for screen reader linkage
3. **Quadrant heuristic**: Auto-detect which half of viewport anchor is in
4. **Tap-to-show on mobile**: Replace hover with tap interaction + close button
5. **Animation**: Add enter/exit animations (currently uses opacity fade)

---

**Implementation Status**: ✅ Complete & Type-Safe

All UX decisions from the specification have been implemented following the copilot instructions and codebase patterns.
