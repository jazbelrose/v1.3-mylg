# FileManager V2 Rollout - Overlay-Only Implementation

## Summary

FileManager V2 is now the **default and only** file manager experience. It renders as an **overlay** on top of whatever page the user is on (Budget, Slides, Editor, Calendar, Overview), preserving spatial context and returning exactly to where the user came from.

## Recent Updates (Overlay Rollout)

### 1. Overlay Pattern ✅
- Files now renders as an overlay using `backgroundLocation` pattern
- Background page stays visible behind dimmed/blurred backdrop
- Close returns to the exact origin page with preserved state

### 2. No Feature Flag ✅
- V2 is now the default (no flag checking)
- Legacy FileManager (V1) modal removed from all pages

### 3. Files Tab Removed ✅
- Folder icon remains the single entry point for Files
- Route `/project/:projectId/files` still exists for deep linking

### 4. Larger, Comfortable Sizing ✅
- Overlay: 94vw × 90vh, max-width 1700px
- Premium styling with backdrop blur and smooth animations

---

## Files Created

### FilesOverlay Component
- [frontend/src/dashboard/project/features/files/FilesOverlay.tsx](frontend/src/dashboard/project/features/files/FilesOverlay.tsx)
- [frontend/src/dashboard/project/features/files/files-overlay.module.css](frontend/src/dashboard/project/features/files/files-overlay.module.css)

### FolderPickerModal (Move functionality)
- [frontend/src/dashboard/project/components/FileManager/FolderPickerModal.tsx](frontend/src/dashboard/project/components/FileManager/FolderPickerModal.tsx)
- [frontend/src/dashboard/project/components/FileManager/folder-picker-modal.module.css](frontend/src/dashboard/project/components/FileManager/folder-picker-modal.module.css)

### Navigation Hook
- [frontend/src/dashboard/project/components/Shared/hooks/useFilesNavigation.ts](frontend/src/dashboard/project/components/Shared/hooks/useFilesNavigation.ts)

## Files Modified

### Routes
- [frontend/src/app/routes.tsx](frontend/src/app/routes.tsx) - Added `/project/:projectId/files` route

### Project Tabs
- [frontend/src/dashboard/project/components/Shared/useProjectTabs.tsx](frontend/src/dashboard/project/components/Shared/useProjectTabs.tsx) - Added "Files" tab (feature flag controlled)

### All Project Pages (V2 Navigation Support)
- [frontend/src/dashboard/project/project.tsx](frontend/src/dashboard/project/project.tsx) - Uses `useFilesNavigation` hook
- [frontend/src/dashboard/project/features/slides/SlidesPage.tsx](frontend/src/dashboard/project/features/slides/SlidesPage.tsx) - Uses `useFilesNavigation` hook
- [frontend/src/dashboard/project/features/editor/pages/editorpage.tsx](frontend/src/dashboard/project/features/editor/pages/editorpage.tsx) - Uses `useFilesNavigation` hook
- [frontend/src/dashboard/project/features/calendar/calendar.tsx](frontend/src/dashboard/project/features/calendar/calendar.tsx) - Uses `useFilesNavigation` hook
- [frontend/src/dashboard/project/features/budget/pages/BudgetPage.tsx](frontend/src/dashboard/project/features/budget/pages/BudgetPage.tsx) - Uses `useFilesNavigation` hook

*Note: All pages had legacy FileManagerComponent and `filesOpen` state removed.*

### FileManagerV2 Enhancements
- [frontend/src/dashboard/project/components/FileManager/FileManagerV2.tsx](frontend/src/dashboard/project/components/FileManager/FileManagerV2.tsx):
  - Added Move modal integration
  - Added Rename trigger from context menu
  - Imported FileGridView and FolderPickerModal
  
### FileListView (Inline Rename)
- [frontend/src/dashboard/project/components/FileManager/FileListView.tsx](frontend/src/dashboard/project/components/FileManager/FileListView.tsx):
  - Added `onRename` prop
  - Added `canRename` prop
  - Inline rename with F2 key and context menu
  - Enter to commit, Escape to cancel

### Index Exports
- [frontend/src/dashboard/project/components/FileManager/index.ts](frontend/src/dashboard/project/components/FileManager/index.ts) - Export FolderPickerModal

### CSS
- [frontend/src/dashboard/project/components/FileManager/file-manager-v2.module.css](frontend/src/dashboard/project/components/FileManager/file-manager-v2.module.css):
  - Added `.listRowEditing` style
  - Added `.listRenameInput` style

---

## How It Works

### Opening Files
1. User clicks folder icon → calls `openFiles()` from `useFilesNavigation`
2. Hook navigates to `/project/:id/files` with `{ state: { backgroundLocation: currentLocation } }`
3. Routes detects `/files` path and `backgroundLocation` state
4. Routes renders app using `backgroundLocation` (keeps current page visible)
5. Routes also renders `<FilesOverlayWrapper>` which mounts `<FilesOverlay>`
6. FilesOverlay creates portal to `document.body` with backdrop and FileManagerV2

### Closing Files
1. User clicks X, presses ESC, or clicks backdrop
2. FilesOverlay calls `handleClose()`
3. If `backgroundLocation` exists → navigate to that location
4. Fallback → navigate to project overview
5. Overlay unmounts, original page is revealed

### Deep Linking
- Direct navigation to `/project/:id/files` works (no backgroundLocation)
- Project overview is rendered as fallback background
- Close falls back to project overview

---

## Route

**Path:** `/dashboard/projects/:projectId/:projectName?/files`

**Component:** `FilesOverlay` → renders `FileManagerV2` as overlay

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `F2` | Start rename (when row focused) |
| `Enter` | Commit rename |
| `Escape` | Cancel rename / Clear selection |
| `Ctrl+A` / `Cmd+A` | Select all |
| `Shift+Click` | Range select |
| `Ctrl+Click` / `Cmd+Click` | Toggle selection |

---

## Overlay UX Details

### Visual
- Backdrop: `rgba(0, 0, 0, 0.7)` with `blur(8px)`
- Container: Premium shadow, 24px radius
- Animation: Fade in (0.2s backdrop) + scale/slide in (0.25s container)

### Sizing
```css
width: 94vw;
height: 90vh;
max-width: 1700px;
max-height: 1100px;
```

### Responsive
- < 1400px: 96vw × 92vh, 20px radius
- < 768px: 100vw × 100vh, no radius (full-screen)

---

## Testing Checklist

### Overlay Behavior
- [ ] Clicking folder icon opens V2 overlay (not navigating away)
- [ ] Background page visible behind dimmed backdrop
- [ ] X button returns to exact origin page
- [ ] ESC key closes overlay
- [ ] Backdrop click closes overlay
- [ ] Scroll position preserved on origin page

### From Different Pages
- [ ] Budget → Files → Back to Budget
- [ ] Slides → Files → Back to Slides
- [ ] Editor → Files → Back to Editor
- [ ] Calendar → Files → Back to Calendar
- [ ] Overview → Files → Back to Overview

### Deep Link
- [ ] Direct navigation to `/project/:id/files` works
- [ ] Close falls back to project overview

### FolderPickerModal
- [ ] Opens when selecting files and clicking "Move" in bulk actions
- [ ] Opens when right-clicking file → "Move"
- [ ] Shows folder tree
- [ ] Disables current folder in tree
- [ ] Shows preview of items being moved
- [ ] Cancel closes modal without action
- [ ] Move button triggers move operation

### Inline Rename
- [ ] F2 on focused row starts rename
- [ ] Context menu → Rename starts rename
- [ ] Input shows current filename
- [ ] Filename (without extension) is selected
- [ ] Enter commits rename
- [ ] Escape cancels rename
- [ ] Clicking outside commits rename

---

## Completed ✅

1. **Overlay-Only Pattern** ✅
   - FilesOverlay component with portal rendering
   - backgroundLocation pattern in routes
   - Backdrop blur and focus trap

2. **No Feature Flag** ✅
   - Removed flag checking from useFilesNavigation
   - V2 is the default and only file manager

3. **Legacy Modal Removed** ✅
   - Removed filesOpen state from all pages
   - Removed FileManagerComponent usage
   - Simplified useFilesNavigation API

4. **Larger Sizing** ✅
   - 94vw × 90vh overlay
   - Premium styling and animations

5. **All Pages Updated** ✅
   - project.tsx (Overview)
   - SlidesPage.tsx
   - EditorPage.tsx  
   - CalendarPage.tsx
   - BudgetPage.tsx

---

## Hook Usage (After Refactor)

```typescript
// Simple usage - no legacy modal callback needed
const { openFiles } = useFilesNavigation({
  projectId,
  projectTitle: activeProject?.title,
});

// Call openFiles() to open the overlay
<button onClick={openFiles}>Open Files</button>
```

---

## Deprecated Code (Safe to Remove)

- `frontend/src/dashboard/project/features/files/FilesPage.tsx` - Old full-page component
- `frontend/src/dashboard/project/features/files/files-page.module.css` - Old styles
- Feature flag functions in `featureFlags.ts` (if no other flags exist)
