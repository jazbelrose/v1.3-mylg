# Task Details Panel Implementation

## Summary
Replaced stacked "Create/Edit task" modals with a right-side details panel (Google Maps-style) that opens next to the task list over the map on desktop. Mobile view still uses the modal approach.

## Changes Made

### 1. GlobalTaskDrawer.tsx
**New State Variables:**
- `detailsPanelOpen`: Boolean to control panel visibility on desktop
- `detailsTask`: Stores the task data for the details panel

**Updated Functions:**
- `handleTaskEdit()`: Now checks if desktop and opens panel instead of modal
- `handleOpenQuickCreate()`: Opens panel on desktop, modal on mobile
- `handleCloseDetailsPanel()`: Closes the details panel
- `handleDetailsSaved()`: Refreshes tasks and closes panel after save

**UI Changes:**
- Added conditional rendering of details panel on desktop (inside motion.div)
- Panel slides in from right with spring animation
- Modal only renders on mobile (!isDesktop condition)
- Added `withDetailsPanel` class when panel is open to adjust drawer width

### 2. QuickCreateTaskModal.tsx
**New Prop:**
- `embedMode?: boolean`: When true, renders without portal/overlay for embedding in panel

**Updated Rendering:**
- Conditional rendering: embed mode returns content directly, modal mode uses createPortal
- Grab handle only shown when not in embed mode
- Added close button in header when in embed mode (X icon)
- No overlay click handling in embed mode

### 3. QuickCreateTaskModal.module.css
**New Styles:**
- `.embedModal`: Full-height panel styling without overlay
- `.embedCloseButton`: Close button for panel header
- Updated `.createHeader` to flex-row with justify-between for close button

### 4. TasksComponentMobile.module.css
**New Desktop Styles (min-width: 1024px):**
- `.detailsPanel`: Right-side panel (42vw width, slides from right)
  - Position: absolute, right: 0
  - Background: rgba(7, 8, 10, 0.98)
  - Border-left with shadow
  - Full height with overflow-y

- `.withDetailsPanel`: Adjusts drawer width when panel is open
  - Reduces drawer to 30vw
  - Updates --drawer-width CSS variable

## User Experience

### Desktop (≥1024px):
1. Click "Edit task" button → Details panel slides in from right
2. Click "New task" button → Empty form in details panel
3. Panel sits alongside task list, over the map
4. Close button (X) in panel header
5. Task list drawer shrinks to make room

### Mobile (<1024px):
- Original modal behavior preserved
- Bottom sheet with drag handle
- Full overlay with backdrop

## Architecture Benefits
1. **Better UX**: See task list while editing (like Google Maps)
2. **Context preservation**: Map and list remain visible
3. **Responsive**: Mobile keeps familiar modal pattern
4. **Reusable**: QuickCreateTaskModal works in both modes
5. **Smooth animations**: Spring physics for natural feel

## Testing Checklist
- [ ] Desktop: Click "Edit task" opens panel from right
- [ ] Desktop: Click "New task" opens empty panel
- [ ] Desktop: Close button (X) closes panel
- [ ] Desktop: Save task closes panel and refreshes list
- [ ] Desktop: Delete task closes panel and refreshes list
- [ ] Desktop: Panel slides smoothly with spring animation
- [ ] Desktop: Task list drawer width adjusts when panel opens
- [ ] Mobile: Edit opens modal (not panel)
- [ ] Mobile: Original drag/swipe behavior works
- [ ] Mobile: Modal backdrop closes modal
