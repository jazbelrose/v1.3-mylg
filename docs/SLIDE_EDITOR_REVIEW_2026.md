# Slide Editor Full Review + Improvements
**Product + Engineering Audit | January 2026**

---

## 🔍 FINDINGS (End-to-End Flow Analysis)

### Core Architecture Issues
1. **No actual "Slide Editor" exists** – The system has a Project Editor with 3 tabs (Brief, Canvas, Moodboard), not a slide-based presentation tool. "Slides" referenced in the issue likely means Canvas/Brief pages or project views.

2. **Thumbnail generation is manual, not automated** – Users must crop/upload thumbnails via ThumbnailModal. No auto-generation from Canvas/Brief content on create/import.

3. **"Visited slide" bug is architectural** – Thumbnails stored as S3 keys in `project.thumbnails[]` array. No render-triggered regeneration exists; thumbnails only update on manual user upload.

4. **Import flow is file-based, not slide-based** – FileManager handles uploads (images, PDFs, files). No slide import or multi-slide deck creation exists.

5. **Real-time sync fragmented across editors** – Yjs powers Brief (Lexical) collaboration, but Canvas (Fabric.js) uses manual `canvasJson` PATCH saves. No unified sync strategy.

6. **Missing export/share flows** – PreviewDrawer mentions "Export to Gallery" and "Export to PDF", but implementations incomplete or missing in codebase.

7. **WebSocket infrastructure is dual-purpose** – Separate Yjs WebSocket (port 1234) for editor sync vs. project-level WebSocket for notifications/messages. No unified messaging layer.

8. **File lifecycle lacks garbage collection** – `useFileMessenger` cleans message references but no automated S3 cleanup for orphaned thumbnails/files when projects deleted.

9. **State management is hybrid** – React Context for project data + IndexedDB (Yjs) + S3 (files/thumbnails). No single source of truth for render state.

10. **Annotation/Comment system is primitive** – AnnotationPlugin shows popup button for text selection with `window.prompt()` for comments. No persistence, threading, or pinned coordinates.

11. **Canvas has no thumbnail auto-generation** – Fabric.js canvas can export to image via `.toDataURL()`, but feature not implemented. Manual upload flow only.

12. **Multi-user concurrency weak in Canvas** – Canvas saves entire `canvasJson` via PATCH. Race conditions possible if two users edit simultaneously (last write wins).

13. **No skeleton loading or progressive rendering** – Editor loads entire project state before render. No incremental/lazy loading of Brief content or Canvas layers.

14. **Undo/Redo exists in Canvas only** – `designercomponent.tsx` has undo/redo history stack, but Brief (Lexical) uses Lexical's native history. No cross-editor unified undo.

15. **Missing Magic Layout implementation** – LayoutPlugin mentioned in plugin list (`LayoutContainerNode`, `LayoutItemNode`), but no visible UI controls or auto-layout engine. Likely incomplete feature.

---

## 🛠️ FIXES (Prioritized with Complexity)

### **P0 – Critical (User-Blocking)**

1. **Implement automated thumbnail generation from Canvas** (Complexity: **M**)
   - On Canvas save, auto-generate thumbnail via `canvas.toDataURL('image/jpeg', 0.8)`
   - Upload to S3 as `project-thumbnails/{projectId}/canvas-thumb-{timestamp}.jpg`
   - Update `project.thumbnails[]` array with new key

2. **Add skeleton loaders for Editor page** (Complexity: **S**)
   - Show skeleton for Brief content while Yjs syncs (`provider.whenSynced`)
   - Canvas loading state while `canvasJson` fetches from backend
   - FileManager skeleton during S3 list operations

3. **Fix thumbnail refresh on project update** (Complexity: **M**)
   - Subscribe to WebSocket project update events
   - Re-fetch thumbnail URLs when `project.thumbnails` changes remotely
   - Clear stale object URLs and reload from S3

4. **Prevent concurrent Canvas edit conflicts** (Complexity: **L**)
   - Add optimistic locking with `version` field on project
   - Backend rejects PATCH if client version doesn't match DB version
   - Show conflict modal allowing user to reload or force-save

5. **Complete Export to PDF implementation** (Complexity: **L**)
   - Use `html2pdf.js` or `jsPDF` to render Brief content
   - Export Canvas as image and embed in PDF
   - Combine multi-page output with cover page from thumbnail

### **P1 – High Priority (UX Degradation)**

6. **Unify thumbnail system across editors** (Complexity: **M**)
   - Auto-generate thumbnails for Brief (first 200 chars + image preview)
   - Canvas thumbnail on save (as in P0 #1)
   - Moodboard thumbnail from first uploaded image
   - Show thumbnails in ProjectHeader with fallback to placeholder

7. **Add progressive rendering for large Brief documents** (Complexity: **M**)
   - Implement virtual scrolling for Lexical editor
   - Lazy-load images below viewport
   - Defer plugin initialization until first interaction

8. **Improve FileManager UX** (Complexity: **S**)
   - Add file kind icons (PDF, image, document)
   - Hover preview for images
   - Batch delete with confirmation modal
   - Progress bars for multi-file uploads (already exists in `useFileTransfers`)

9. **Fix Canvas undo/redo persistence** (Complexity: **M**)
   - Save undo stack to IndexedDB on each action
   - Restore stack on editor reload (currently lost on refresh)
   - Limit stack to 50 actions to prevent memory bloat

10. **Implement real-time Canvas sync via Yjs** (Complexity: **L**)
    - Replace `canvasJson` PATCH with Yjs CRDT for Fabric.js objects
    - Use `y-indexeddb` for offline persistence
    - Show live cursors/selections from collaborators

11. **Add "Export to Gallery" implementation** (Complexity: **M**)
    - Gallery API exists (`GALLERIES_TABLE`), populate with Canvas/Brief snapshots
    - Generate preview images for gallery items
    - Link from PreviewDrawer to Gallery page

12. **Enhance WebSocket diagnostics** (Complexity: **S**)
    - WebSocketDiagnostic already exists, add metrics dashboard
    - Show Yjs sync lag, message queue depth, connection health
    - Auto-reconnect with exponential backoff (may already exist)

### **P2 – Nice to Have (Polish)**

13. **Add text block snapping/spacing guides in Canvas** (Complexity: **M**)
    - Fabric.js has built-in snapping via `canvas.on('object:moving')` events
    - Add visual guides at 8px/16px/24px intervals
    - Align-to-grid toggle in toolbar

14. **Improve Lexical FloatingToolbar UX** (Complexity: **S**)
    - Toolbar already exists, add keyboard shortcuts (Ctrl+B, Ctrl+I)
    - Show tooltip hints on hover
    - Add color picker (ColorPlugin exists but may need UI)

15. **Add file reference tracking** (Complexity: **M**)
    - Scan Brief `description` JSON for embedded image URLs
    - Track references in project metadata
    - Prevent file deletion if referenced (already partial in `useFileMessenger`)

16. **Implement drag-and-drop reordering in FileManager** (Complexity: **S**)
    - Use `react-beautiful-dnd` or HTML5 drag API
    - Update folder order in project custom fields

17. **Add project-level settings vs plan-level settings** (Complexity: **M**)
    - ProjectHeader shows project-specific settings (name, thumbnail, team)
    - Add plan-level settings for workspace defaults (theme, file storage limits)
    - Store plan settings in separate `Plans` table (if not exists)

18. **Optimize S3 file serving with CloudFront CDN** (Complexity: **M**)
    - Current: Direct S3 access via signed URLs
    - Add CloudFront distribution for `project-thumbnails/` prefix
    - Enable browser caching with `Cache-Control` headers

19. **Add missing asset fallback UI** (Complexity: **S**)
    - Detect broken image URLs in Brief/Canvas
    - Show placeholder with "Asset missing" icon
    - Provide "Re-upload" button to replace

20. **Garbage collect orphaned S3 files** (Complexity: **M**)
    - Lambda runs nightly, scans `project-thumbnails/` bucket
    - Cross-reference with DynamoDB `Projects` table
    - Delete files where `projectId` doesn't exist in DB

---

## 💬 COMMENTS MODE SPECIFICATION

### Feature Overview
Google Slides-style comment system with stickers/post-its pinned to slide coordinates. Supports threaded discussions, resolved state, and optional @mentions.

### Implementation Plan

1. **Add Mode Toggle to UnifiedToolbar** (Complexity: **S**)
   - Three modes: **View** (default) | **Edit** (current behavior) | **Comment**
   - Comment mode disables editing, enables comment placement
   - Persist mode preference in localStorage per project

2. **Create Comment Data Model** (Complexity: **S**)
   ```typescript
   interface SlideComment {
     commentId: string;          // UUID
     projectId: string;
     editorTab: 'brief' | 'canvas' | 'moodboard';
     position: { x: number; y: number };  // Absolute px coordinates
     anchorType: 'point' | 'range';       // Point for Canvas, range for Brief text
     anchorData: any;                     // Brief: Lexical selection; Canvas: object ID
     thread: CommentThread[];
     isResolved: boolean;
     createdAt: string;
     updatedAt: string;
   }

   interface CommentThread {
     id: string;
     userId: string;
     text: string;
     mentions: string[];         // userIds mentioned via @username
     createdAt: string;
   }
   ```

3. **Implement Comment Overlay Component** (Complexity: **M**)
   - Render comment pins as absolutely positioned divs over editor
   - Pin colors: unresolved (yellow), resolved (green), active (blue)
   - Click pin to open thread popover
   - Pins scale with zoom level (Canvas zoom, Brief font size changes)

4. **Anchoring Rules** (Complexity: **M**)
   - **Brief (Lexical)**: Anchor to Lexical node key + offset (survives text edits)
   - **Canvas (Fabric.js)**: Anchor to object ID or canvas coordinates (if background)
   - **Moodboard**: Anchor to image file key or canvas position
   - Re-calculate pin positions on window resize, zoom, or content reflow

5. **Threading and Mentions** (Complexity: **M**)
   - Reply input at bottom of popover
   - @mention autocomplete using team members from `project.team[]`
   - Notify mentioned users via WebSocket + email (if enabled)
   - Resolve button (checkmark icon) marks thread as resolved

6. **Real-Time Sync via WebSocket** (Complexity: **L**)
   - New comments broadcast to all connected users
   - Show "New comment" toast notification with link to comment
   - Optimistic UI: Add comment immediately, rollback on server error

7. **Export Behavior** (Complexity: **S**)
   - PDF export: Option to "Include comments" (renders pins + threads as sidebar)
   - Gallery export: Comments excluded by default
   - JSON export: Include comments in metadata for re-import

8. **Storage** (Complexity: **S**)
   - Store in DynamoDB `ProjectComments` table (PK: `projectId`, SK: `commentId`)
   - GSI on `userId` for "My comments" view
   - Purge resolved comments older than 90 days (background job)

---

## 🖼️ THUMBNAIL GENERATION FIX PLAN

### Root Cause Analysis
Current system requires **manual user action** (ThumbnailModal crop/upload) to create thumbnails. No automated generation on project create/import or Canvas render. Thumbnails stored as S3 keys in `project.thumbnails[]`, not tied to content state.

### Required Behavior
- **On project create**: Generate placeholder thumbnail from project initials/color
- **On Canvas render**: Auto-capture Canvas as JPEG, upload to S3, update `thumbnails[]`
- **On Brief update**: Generate preview from first heading + image (if exists)
- **On import**: Extract first page thumbnail from PDF or use first uploaded image

### Fix Strategy

1. **Add server-side thumbnail generation Lambda** (Complexity: **L**)
   - Trigger: S3 `ObjectCreated` event on `project-files/{projectId}/` prefix
   - For PDFs: Use `pdf-thumbnail` library to extract first page
   - For images: Resize to 400x300 with sharp/Pillow
   - Upload thumbnail to `project-thumbnails/{projectId}/auto-{timestamp}.jpg`
   - Update DynamoDB `Projects.thumbnails[]` via atomic append

2. **Client-side Canvas auto-thumbnail** (Complexity: **M**)
   - Hook into Canvas save action (`designercomponent.tsx` PATCH)
   - After successful save, call `canvas.toDataURL('image/jpeg', 0.8)`
   - Upload blob to S3 via Amplify Storage
   - Debounce to max 1 thumbnail per 30 seconds (prevent spam on rapid edits)

3. **Brief content thumbnail generation** (Complexity: **M**)
   - On Brief save, serialize Lexical editor state to HTML
   - Render HTML to Canvas element (hidden) with `html2canvas`
   - Crop to 800x600, upload as JPEG
   - Alternative: Extract first 200 chars + first image as composite

4. **Thumbnail job queue for imports** (Complexity: **L**)
   - When user imports multi-file ZIP or PDF deck, enqueue jobs to SQS
   - Worker Lambda processes queue: extract thumbnails, upload, update DB
   - Show progress bar in FileManager during batch import
   - Failure handling: Retry 3x, fallback to generic placeholder

5. **Eager pre-generation on project create** (Complexity: **S**)
   - Backend `POST /projects` creates placeholder SVG thumbnail
   - SVG contains project initials on colored background (deterministic from projectId hash)
   - Embed as data URI in `thumbnails[]` to avoid S3 round-trip

6. **Thumbnail refresh pipeline** (Complexity: **M**)
   - Add `lastRenderedAt` timestamp to project
   - Cron job scans for projects where `updatedAt > lastRenderedAt + 24h`
   - Re-generate thumbnails for stale projects (Canvas, Brief)
   - Headless browser (Puppeteer) renders Brief HTML for screenshot

7. **Cache invalidation on thumbnail update** (Complexity: **S**)
   - Frontend uses `resolveProjectCoverUrl(project)` to get thumbnail URL
   - Add `?v={updatedAt}` query param to bust browser cache
   - Subscribe to WebSocket events for `thumbnails` field changes

8. **Migration: Backfill existing projects** (Complexity: **M**)
   - One-time script scans all projects without `thumbnails[]`
   - Generate placeholder SVG or extract from Canvas/Brief if populated
   - Update DB in batches of 100 to avoid rate limits

---

## 📊 SUMMARY

**Immediate Actions (P0)**:
1. Implement Canvas auto-thumbnails on save
2. Add skeleton loaders for all editors
3. Fix concurrent edit conflicts with versioning

**Next Quarter (P1)**:
4. Build Comments Mode feature (3-week sprint)
5. Migrate Canvas to Yjs for real-time sync
6. Complete PDF export implementation

**Future Enhancements (P2)**:
7. Server-side thumbnail generation pipeline
8. Advanced Canvas snapping/guides
9. S3 file garbage collection

**Magic Layout Status**: Feature appears incomplete (plugin nodes exist but no UI). Requires separate scoping document.

---

**Document Version**: 1.0  
**Author**: Engineering Review Team  
**Date**: January 22, 2026
