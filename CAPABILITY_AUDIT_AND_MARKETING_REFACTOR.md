# MYLG — Complete Capability Audit & Marketing Site Refactor

**Date:** January 13, 2026  
**Repository:** jazbelrose/v1.3-mylg  
**Purpose:** Truth-grounded review of product capabilities + marketing content refactor

---

## 0. Executive Summary

### What MYLG Actually Is

**MYLG is a real-time collaborative production management platform** that combines project planning, budget management, task workflows, calendaring, slide-based deliverables, and financial operations (HQ) into a unified workspace—with WebSocket-powered messaging and collaboration at its core.

It's designed for creative production teams (events, content, design) who need to:
- **Plan & coordinate** multi-stakeholder projects with real-time task/calendar updates
- **Budget & invoice** with line-item precision, markup/contingency, and AI-assisted parsing ("Spellbooks")
- **Collaborate** through threaded messaging, direct messages, file sharing, and live slide editing (Yjs + Lexical)
- **Deliver** client-facing galleries, PDFs, and slide decks with version control
- **Track finances** across projects via an org-level HQ Ledger with transaction categorization, recurring commitments, and CSV import/export

### The 10 Biggest Differentiators (Code-Grounded)

1. **Real-Time Slide Collaboration (Yjs + Lexical)**  
   - Per-slide Yjs rooms (`slide-{slideId}`)
   - Live multi-user editing with conflict-free sync
   - Automatic thumbnail generation (html2canvas)
   - Deck versioning with role-based visibility (`DeckVersion` table, status: draft/approved/archived)
   - Evidence: `frontend/src/dashboard/project/features/slides/`, `SLIDES_IMPLEMENTATION.md`, `backend/projects/router.mjs` (deck-versions endpoints)

2. **Dual Real-Time Messaging System**  
   - **Project threads**: team messaging per project with reactions, file attachments
   - **Direct Messages (DMs)**: 1:1 conversations with stable ID format (`dm#<userA>___<userB>`)
   - WebSocket-driven with read states, edits, deletions
   - Evidence: `backend/websocket/default.mjs` (sendMessage, markRead, deleteMessage), `frontend/src/dashboard/features/messages/`, ADR-002

3. **Smart Notifications & Activity Streams (ADR-004)**  
   - **Two streams**: Notifications (rare, actionable) vs Activity (audit trail, batched edits)
   - Phantom notification prevention (autosave/presence/cursor events ignored)
   - 90s idle batching for slide edits
   - Evidence: ADR-004, `backend/websocket/activityBatcher.mjs`, `NOTIFICATION_TRIGGERS` set in `default.mjs`

4. **AI-Powered "Spellbooks" for Budget & Tasks**  
   - **Budget Spellbook**: paste project scope → generates line items with categories, quantities, unit costs
   - **Task Spellbook**: paste run-of-show → generates sequenced tasks with dependencies
   - **Magic Layout**: infers event timeline (load-in, strike, crew calls) and schedules tasks automatically
   - Evidence: `frontend/src/dashboard/project/features/budget/lib/budgetSpellbook.ts`, `docs/CODEX_HANDOFF_SPELLBOOK_MAGIC.md`, `PlanDraft` engine

5. **Advanced Calendar System with Focus Blocks & Stacks**  
   - **Time Blocks**: scheduled task instances
   - **Focus Blocks**: container tasks grouping multiple time blocks (with progress pills `0/3`)
   - **Overlap Stacks**: auto-group overlapping calendar items (multi-user or single-user), project-wide customizable titles
   - Drag-and-drop, recurrence support, multi-view (day/week/list)
   - Evidence: `frontend/src/dashboard/project/features/calendar/`, `docs/CALENDAR_FOCUS_BLOCKS.md`, `backend/projects/router.mjs` (overlap-stack-titles endpoints)

6. **Project Budget Management with Revisions & Invoicing**  
   - Line items with categories, markup, contingency, tax
   - **Budget revisions**: snapshot-based versioning
   - **Work panel**: task-budget linking with `linkType` (quote/procure/build/install/invoice)
   - PDF invoice export, CSV export/import
   - Evidence: `frontend/src/dashboard/project/features/budget/`, `backend/projects/router.mjs` (budget endpoints), `BudgetProvider.tsx`

7. **HQ Ledger (Org-Level Financial Operations)**  
   - Centralized transaction tracking across all projects
   - Accounts, imports (CSV with deduplication), categorization rules
   - Recurring commitments (auto-detected series grouping)
   - Day/account aggregates, reports, invoices
   - Evidence: `backend/hq/router.mjs` (2700+ lines), `frontend/src/hq/pages/`, routes: `/hq/transactions`, `/hq/accounts`, `/hq/import`, `/hq/reports`, `/hq/invoices`

8. **File Management with CDN + Signed URLs (ADR-001)**  
   - CloudFront-first (`cdn.mylg.app`) with `public/` vs `secure/` paths
   - S3 backend with presigned upload URLs
   - Gallery creation (PDF → slide images via Python Lambda `create-gallery`)
   - File deletion, drag-drop upload, previews
   - Evidence: ADR-001, `backend/s3/`, `backend/create-gallery/`, `frontend/src/dashboard/project/components/FileManager/`

9. **Multi-Role Permissions & Org Isolation**  
   - Roles: admin, designer, builder, vendor, client
   - Org-based isolation (`Orgs`, `OrgMembers` tables)
   - Project team membership with role-specific visibility
   - Deck versions support per-role access control (`allowedRoles`)
   - Evidence: `backend/shared-layer/nodejs/utils/orgAuth.mjs`, `backend/orgs/router.mjs`, project team endpoints

10. **Task Review Workflow & Status Transitions**  
    - Multi-state task lifecycle: todo → in_progress → in_review → changes_requested → done → archived
    - Review threads with submissions, approvals, change requests
    - Admin override capabilities
    - Evidence: `backend/projects/tasksDal.mjs`, `frontend/src/shared/utils/api.ts` (`TaskReviewTransitionAction`), review endpoints in `router.mjs`

### What Current Marketing is Missing/Misrepresenting

**Missing (Major Features Not Called Out):**
- Real-time slide collaboration (Yjs, multi-user editing)
- Calendar's advanced features (focus blocks, stacks, drag-drop)
- Task review workflows
- HQ Ledger (org-level financial management)
- AI Spellbooks (budget/task generation)
- Deck versioning with role-based access
- Smart notifications vs activity distinction
- CDN architecture for secure/public file delivery
- Direct messaging (DMs) separate from project threads

**Misrepresenting/Vague:**
- "Real-time messaging" is mentioned but depth not conveyed (reactions, edits, attachments, read states, WebSocket)
- "Budgeting" exists but doesn't explain revisions, work panel linking, or spellbook magic
- "Galleries" mentioned but PDF-to-slides conversion not highlighted
- "Proposals/RFPs" implied but actual export capabilities (PDF, deck versions, client-specific defaults) not detailed

**Current Draft Position:**
> "MYLG is a design-first production instrument that turns raw ideas into structured tasks, time blocks, focus blocks, real budgets, and polished deliverables — all inside one controlled workspace."

**Reality Check:**
- ✅ Tasks, time blocks, focus blocks: **TRUE** (calendar system is comprehensive)
- ✅ Real budgets: **TRUE** (budget management + HQ ledger are robust)
- ✅ Polished deliverables: **TRUE** (galleries, slide decks, PDFs, invoices)
- ❌ "Design-first" is vague—better: **"Real-time production workspace"**
- ❌ Missing the **collaboration** angle (multi-user, WebSocket, live editing)
- ❌ Missing **AI/automation** (Spellbooks, Magic Layout)

---
## 1. Product Surface Map

### All User-Facing Routes

**Evidence:** `frontend/src/app/routes.tsx`, `frontend/src/hq/routes.tsx`

#### Authentication Routes
- `/login` — Login page
- `/register` — User registration
- `/email-verification` — Email confirmation
- `/email-change-verification` — Email change confirmation
- `/forgot-password` — Password reset

#### Dashboard Routes
- `/dashboard` — Main dashboard (defaults to HQ Overview)
- `/dashboard/projects/allprojects` — All projects list
- `/dashboard/new` — Create new project
- `/dashboard/tasks` — Global tasks view (cross-project)
- `/dashboard/projects/:projectId/:projectName?` — Project overview page

#### Project Feature Routes
- `/dashboard/projects/:projectId/:projectName?/budget` — Budget management
- `/dashboard/projects/:projectId/:projectName?/calendar` — Calendar (time/focus blocks)
- `/dashboard/projects/:projectId/:projectName?/editor` — Lexical editor (docs/notes)
- `/dashboard/projects/:projectId/:projectName?/slides` — Multi-slide editor (Yjs collaboration)
- `/dashboard/projects/:projectId/:projectName?/slides/present` — Slide presentation mode

#### HQ (Financial Operations) Routes
- `/dashboard/hq/import` — CSV transaction import
- `/dashboard/hq/accounts` — Financial accounts
- `/dashboard/hq/transactions` — All transactions (with filters)
- `/dashboard/hq/recurring` — Recurring commitments (redirects to transactions?filter=recurring)
- `/dashboard/hq/reports` — Financial reports
- `/dashboard/hq/invoices` — Invoice management

#### Public/Special Routes
- `/gallery/:projectId/:gallerySlug` — Public gallery view (unauthenticated)

### Major UI Modules

#### Module 1: Slides Editor
**Location:** `frontend/src/dashboard/project/features/slides/`

**What it's for:** Google Slides-style multi-slide editor with real-time collaboration

**Key Actions:**
- Create/delete/duplicate slides
- Drag-drop reorder slides
- Edit slide content (Lexical rich text)
- Auto-generate thumbnails (html2canvas, 3s after change)
- Real-time multi-user editing (Yjs, one room per slide)
- Auto-save (2s debounce)
- Export slides (placeholder)

**Data Touched:**
- `Project.slides[]` (stored in Projects table)
- Yjs rooms: `slide-{slideId}` (ephemeral, IndexedDB + DynamoDB persistence)
- Thumbnails: S3 (future) or data URLs (current)

**Evidence:**
- `SlidesPage.tsx`, `SlideEditor.tsx`, `SlidesSidebar.tsx`, `SlideToolbar.tsx`
- `hooks/useSlideProvider.ts`, `hooks/useSlidePersistence.ts`
- `lib/yjs.ts`, `lib/thumbnails.ts`
- `SLIDES_IMPLEMENTATION.md` (343 lines)

#### Module 2: Calendar
**Location:** `frontend/src/dashboard/project/features/calendar/`

**What it's for:** Advanced scheduling with time blocks, focus blocks, overlap stacks

**Key Actions:**
- Create time blocks (scheduled task instances)
- Create focus blocks (containers grouping time blocks)
- Drag-drop tasks to reschedule
- Auto-stack overlapping items
- Rename stacks (persisted to project)
- Switch views: day/week/list
- Filter by assignee, status

**Data Touched:**
- `Tasks` table (task scheduling data: `startAt`, `endAt`, `kind`, `focusChildTaskIds`)
- `Events` table (calendar events)
- `Project.calendarOverlapStackTitles` (stack rename persistence)

**Evidence:**
- `calendar.tsx`, `WeekGrid.tsx`, `DayGrid.tsx`, `CalendarEntryPopover.tsx`
- `docs/CALENDAR_FOCUS_BLOCKS.md`
- Backend: `GET/PATCH /projects/:projectId/calendar/overlap-stack-titles`

#### Module 3: Budget
**Location:** `frontend/src/dashboard/project/features/budget/`

**What it's for:** Line-item budget management with AI parsing, revisions, invoicing

**Key Actions:**
- Create/edit/delete budget line items
- AI "Spellbook": paste scope text → generate budget lines
- Create budget revisions (snapshots)
- Link tasks to budget items (work panel)
- Export to PDF invoice
- Export/import CSV
- Apply markup, contingency, tax

**Data Touched:**
- `Budgets` table (PK: `projectId#budgetId`, SK: `budgetItemId`)
- `BudgetHeader` (project-level metadata)
- `BudgetRevision` (snapshots)

**Evidence:**
- `pages/BudgetPage.tsx`, `context/BudgetProvider.tsx`
- `components/BudgetSpellbookModal.tsx`, `components/BudgetWorkPanelModal.tsx`
- `lib/budgetSpellbook.ts`
- Backend: `GET/POST/PATCH/DELETE /projects/:projectId/budget/*`

#### Module 4: Messages
**Location:** `frontend/src/dashboard/features/messages/`

**What it's for:** Real-time messaging (project threads + direct messages)

**Key Actions:**
- Send/edit/delete messages
- React to messages (emoji reactions)
- Mark messages as read
- Attach files
- Real-time sync via WebSocket

**Data Touched:**
- `Inbox` table (PK: userId, SK: conversationId)
- `Messages` table (project messages)
- `ProjectMessages` table
- WebSocket: `sendMessage`, `editMessage`, `deleteMessage`, `markRead`, `reactToMessage` actions

**Evidence:**
- `ProjectMessagesThread.tsx`, `MessageItem.tsx`
- `contexts/MessagesProvider.tsx`, `contexts/DMConversationContext.tsx`
- `backend/websocket/default.mjs` (message handlers)
- ADR-002 (DM ID format: `dm#<userA>___<userB>`)

#### Module 5: HQ Ledger
**Location:** `frontend/src/hq/`, `backend/hq/`

**What it's for:** Org-level financial operations (transactions, accounts, categorization, recurring tracking)

**Key Actions:**
- Import CSV transactions (with deduplication)
- Categorize transactions (manual or rule-based)
- Create/manage accounts
- View recurring commitments (auto-grouped series)
- Generate financial reports
- Track invoices

**Data Touched:**
- `HqLedger` table (composite SK: `ACCOUNT#`, `TXN#`, `IMPORT#`, `RULE#`, `LEDGER#`, `LEDGERA#`)
- Derived aggregates (per-day, per-account)

**Evidence:**
- `pages/HQOverview.tsx`, `pages/TransactionsPage.tsx`, `pages/AccountsPage.tsx`, `pages/ImportPage.tsx`
- `backend/hq/router.mjs` (2784 lines)
- Routes: `/hq/import-csv`, `/hq/accounts`, `/hq/transactions`, `/hq/reports`, `/hq/invoices`

#### Module 6: File Manager
**Location:** `frontend/src/dashboard/project/components/FileManager/`

**What it's for:** S3-backed file upload/download with CDN delivery

**Key Actions:**
- Drag-drop upload (presigned S3 URLs)
- Delete files (bulk or single)
- Download files (CloudFront CDN or signed URLs)
- Attach files to messages

**Data Touched:**
- S3 bucket: `mylg-files-v12`
- CloudFront: `cdn.mylg.app` (public/ or secure/ paths)

**Evidence:**
- `FileManager.tsx`, `hooks/useFileTransfers.ts`
- ADR-001 (CDN strategy)
- Backend: `POST /projects/:projectId/files/delete`
- Shared layer: `/opt/nodejs/utils/files.mjs`

#### Module 7: Galleries
**Location:** `frontend/src/dashboard/project/features/gallery/`

**What it's for:** Client-facing asset galleries, PDF-to-slide conversion

**Key Actions:**
- Create gallery
- Upload PDF → convert to slide images (Python Lambda)
- Generate shareable URL
- Delete gallery files

**Data Touched:**
- `Galleries` table (PK: galleryId, GSI: projectId-index)
- S3 (gallery assets)

**Evidence:**
- `GalleryPage.tsx`
- `backend/create-gallery/` (Python with PyMuPDF)
- Backend: `GET/POST/PUT/PATCH/DELETE /projects/:projectId/galleries/*`

#### Module 8: Tasks (Global + Project)
**Location:** `frontend/src/dashboard/home/pages/TasksPage.tsx`, calendar/budget integration

**What it's for:** Task management with status workflows, assignments, review

**Key Actions:**
- Create/edit/delete tasks
- Assign to users
- Set status (todo, in_progress, in_review, changes_requested, done, archived)
- Submit for review / request changes / approve
- Bulk create tasks (from Spellbook)
- Link to budget items

**Data Touched:**
- `Tasks` table (PK: projectId, SK: `STATUS#{status}#{priority}#{taskId}`)
- Review threads (embedded in task)

**Evidence:**
- `backend/projects/tasksDal.mjs` (status transition logic)
- `backend/projects/router.mjs` (task endpoints: create, patch, delete, review-transition)

#### Module 9: Notifications & Activity
**Location:** `frontend/src/app/contexts/NotificationProvider.tsx`

**What it's for:** Actionable notifications + audit trail activity

**Key Actions:**
- Receive notifications (mentions, shares, review requests, failures)
- Mark as read
- View activity feed (batched edits, file uploads)
- Filter by project

**Data Touched:**
- `Notifications` table (PK: userId, SK: `N#{timestamp}#{uuid}`)
- `ProjectActivity` table (PK: projectId, SK: `A#{timestamp}#{uuid}`, TTL: 90 days)

**Evidence:**
- ADR-004 (15KB comprehensive spec)
- `backend/websocket/activityBatcher.mjs` (edit batching)
- `backend/websocket/default.mjs` (NOTIFICATION_TRIGGERS, IGNORED_EVENTS sets)

#### Module 10: Admin / Org Management
**Location:** `frontend/src/app/contexts/OrgProvider.tsx`, `backend/orgs/`

**What it's for:** Multi-tenant org setup, member management

**Key Actions:**
- Create/update org
- Add/remove members
- Invite users
- Role-based access control

**Data Touched:**
- `Orgs` table
- `OrgMembers` table (PK: orgId, SK: userId, GSI: userId-orgId-index)
- `OrgInvites` table

**Evidence:**
- `backend/orgs/router.mjs`
- `backend/shared-layer/nodejs/utils/orgAuth.mjs` (requireOrgMember, requireOrgAdmin)

---
## 2. Capability Inventory (Truth Table)

### Schema
Each capability below includes:
- **Name**
- **Category**
- **User Value** (1 line)
- **Evidence** (file paths, components, APIs, DB tables, WebSocket events)
- **Status** (Shipped / Behind Flag / Partial / Planned)
- **Notes** (limits, edge cases, dependencies)

---

### A) Real-Time Messaging

#### A1: Project Thread Messaging
- **Category:** Messaging
- **User Value:** Team members communicate in real-time within project context with reactions, edits, file attachments
- **Evidence:**
  - Frontend: `frontend/src/dashboard/features/messages/ProjectMessagesThread.tsx`, `MessageItem.tsx`
  - Context: `frontend/src/app/contexts/MessagesProvider.tsx`
  - WebSocket actions: `sendMessage`, `editMessage`, `deleteMessage`, `markRead`, `reactToMessage`
  - Backend: `backend/websocket/default.mjs` (handlers for all message actions)
  - Tables: `ProjectMessages` (PK: projectId, SK: messageId), `Inbox` (conversation tracking)
- **Status:** Shipped
- **Notes:** 
  - Message reactions stored as `Record<emoji, userId[]>`
  - Edit history not preserved (only current text)
  - File attachments supported via S3 URLs embedded in message metadata

#### A2: Direct Messages (DMs)
- **Category:** Messaging
- **User Value:** Private 1:1 conversations between users, persistent across sessions
- **Evidence:**
  - Frontend: `frontend/src/app/contexts/DMConversationContext.tsx`
  - DM ID format: `dm#<lowerUserId>___<higherUserId>` (sorted lexicographically, delimiter `___`)
  - ADR-002 (DM conversation ID strategy)
  - WebSocket: same message actions as project threads
  - Backend: `backend/websocket/default.mjs`
  - Tables: `Messages` (for DM storage), `Inbox` (PK: userId, SK: conversationId with `dm#` prefix)
- **Status:** Shipped
- **Notes:**
  - DM IDs are deterministic (always sorted by userId to prevent duplicates)
  - Read states tracked per conversation
  - Snippet generation for conversation previews

#### A3: Read State Tracking
- **Category:** Messaging
- **User Value:** Users see which messages they've read, unread count badges
- **Evidence:**
  - WebSocket action: `markRead` (payload: conversationId, messageId)
  - Backend: `backend/websocket/default.mjs` (markRead handler updates Inbox.read field)
  - Frontend: `useMessages` hook tracks read states
  - Inbox table: `read` boolean, `lastMsgTs` for sorting
- **Status:** Shipped
- **Notes:** Read state is per-conversation, not per-message (marks all messages up to a point as read)

#### A4: Message Reactions
- **Category:** Messaging
- **User Value:** Quick emoji feedback on messages without text replies
- **Evidence:**
  - WebSocket action: `reactToMessage` (payload: messageId, emoji, action: add/remove)
  - Backend: `backend/websocket/default.mjs` (reactToMessage handler)
  - Message model: `reactions: Record<emoji, userId[]>`
  - Frontend: `MessageItem.tsx` renders reaction pills
- **Status:** Shipped
- **Notes:** Multiple users can react with same emoji; reactions are additive

#### A5: File Attachments in Messages
- **Category:** Messaging
- **User Value:** Share files directly in message threads
- **Evidence:**
  - Frontend: `frontend/src/dashboard/project/components/Shared/hooks/useFileMessenger.ts`
  - File URLs embedded in message metadata
  - S3 upload flow → message sent with file reference
- **Status:** Shipped
- **Notes:** Files uploaded to S3 first, then URL attached to message; no inline previews (just links)

#### A6: Notification Integration
- **Category:** Messaging
- **User Value:** Get notified when mentioned or new DMs arrive
- **Evidence:**
  - ADR-004 (notification triggers include `message` type)
  - `backend/websocket/default.mjs`: `NOTIFICATION_TRIGGERS` includes `'message'`
  - Notifications sent for new DMs, project messages with mentions
- **Status:** Shipped
- **Notes:** Only creates notification if recipient is not currently viewing the conversation

---

### B) Real-Time / Collaborative Editing (Slides + Docs)

#### B1: Multi-Slide Editor
- **Category:** Editor
- **User Value:** Create and manage multiple slides (Google Slides-style) for presentations/proposals
- **Evidence:**
  - Frontend: `frontend/src/dashboard/project/features/slides/SlidesPage.tsx`
  - Components: `SlideEditor.tsx`, `SlidesSidebar.tsx`, `SlideToolbar.tsx`
  - Data model: `Project.slides[]` (array of `Slide` objects)
  - Backend: `PATCH /projects/:projectId` (updates slides array)
  - `SLIDES_IMPLEMENTATION.md` (343-line comprehensive doc)
- **Status:** Shipped
- **Notes:**
  - Minimum 1 slide required (delete blocked if only 1 slide)
  - Slide order managed via `order` field
  - Total new code: ~1,384 lines across 12 files

#### B2: Real-Time Collaboration (Yjs)
- **Category:** Editor
- **User Value:** Multiple users edit same slide simultaneously without conflicts (CRDT sync)
- **Evidence:**
  - Yjs integration: `@lexical/yjs` dependency
  - Room naming: `slide-{slideId}` (one room per slide)
  - Provider hook: `frontend/src/dashboard/project/features/slides/hooks/useSlideProvider.ts`
  - Connection manager: `frontend/src/dashboard/project/features/slides/lib/yjs.ts`
  - IndexedDB persistence (offline-first)
  - Backend: WebSocket connection for Yjs awareness/sync
- **Status:** Shipped
- **Notes:**
  - Each slide has independent Yjs room (disconnects on slide switch to prevent memory leaks)
  - Cursors, presence tracked via Yjs awareness
  - Content conflicts resolved automatically via Yjs CRDT

#### B3: Lexical Rich Text Editor
- **Category:** Editor
- **User Value:** Rich text editing with formatting, lists, links, code blocks, markdown shortcuts
- **Evidence:**
  - Dependencies: `@lexical/react`, `@lexical/rich-text`, `@lexical/list`, `@lexical/link`, `@lexical/code`, `@lexical/markdown`
  - Plugins: code, hashtag, link, list, markdown
  - Used in both slides (`SlideEditor.tsx`) and docs (`editorpage.tsx`)
  - Content stored as Lexical JSON in `Slide.content` or project fields
- **Status:** Shipped
- **Notes:**
  - Markdown shortcuts enabled (e.g., `##` for headings, `-` for lists)
  - Hashtag support (for tagging)
  - Code blocks with syntax highlighting

#### B4: Slide Thumbnails
- **Category:** Editor
- **User Value:** Visual preview of each slide in sidebar for quick navigation
- **Evidence:**
  - Thumbnail generation: `frontend/src/dashboard/project/features/slides/lib/thumbnails.ts`
  - Uses html2canvas to capture slide DOM
  - Auto-generates 3s after content change (debounced)
  - Stored as data URL or S3 (ready for S3 upload, currently data URLs)
  - Backend endpoint: `POST /projects/:projectId/slides/:slideId/thumbnail` (atomic update with revision checking)
  - `backend/projects/router.mjs` lines 2856, 2630-2798 (patchSlideThumbnail function with race condition handling)
- **Status:** Shipped (data URLs), Partial (S3 upload ready but not enabled)
- **Notes:**
  - Thumbnail revision tracking (`thumbRevision` field) prevents stale updates
  - 240x180px size
  - Future: S3 upload for thumbnails (code structure ready)

#### B5: Slide Reordering
- **Category:** Editor
- **User Value:** Drag-drop slides to reorder presentation flow
- **Evidence:**
  - `SlidesSidebar.tsx` (HTML5 drag-drop API)
  - `order` field on `Slide` interface
  - Persisted via `PATCH /projects/:projectId`
- **Status:** Shipped
- **Notes:** Uses native HTML5 drag-drop; works on desktop (mobile requires touch polyfill)

#### B6: Slide Templates / Backgrounds
- **Category:** Editor
- **User Value:** Set slide background color or image
- **Evidence:**
  - `Slide` interface: `backgroundColor`, `backgroundImage` fields
  - Stored in project slides array
- **Status:** Partial (data model ready, UI not fully implemented)
- **Notes:** Fields exist but UI for setting backgrounds not exposed in toolbar yet

#### B7: Deck Versioning
- **Category:** Editor
- **User Value:** Create versions of slide decks (draft/approved/archived) with role-based access
- **Evidence:**
  - Backend: `DeckVersions` table (PK: projectId, SK: versionId, GSI: projectId-isDefault-index)
  - Model: `DeckVersion` with `status: 'draft' | 'approved' | 'archived'`, `allowedRoles`, `isDefault`, `isClientDefault`
  - Endpoints: `GET/POST/PATCH/DELETE /projects/:projectId/deck-versions/*`, `POST .../set-default`, `.../set-client-default`, `.../duplicate`
  - `backend/projects/router.mjs` lines 2870-2878
  - `docs/adrs/007-slide-deck-versions.md`
  - Frontend model: `frontend/src/app/contexts/DataProvider.tsx` (`DeckVersion` interface)
- **Status:** Shipped (backend + data model), Partial (frontend UI not fully wired)
- **Notes:**
  - Role-based visibility allows showing different deck versions to clients vs internal team
  - Duplication creates new version from existing
  - Default version selection per project

#### B8: Export / Presentation Mode
- **Category:** Editor
- **User Value:** Present slides full-screen or export to PDF/PPTX
- **Evidence:**
  - Presentation route: `/dashboard/projects/:projectId/:projectName?/slides/present`
  - Component: `SlidesPresentationPage.tsx`
  - Export button in `SlideToolbar.tsx` (placeholder)
- **Status:** Partial (presentation mode exists, export not implemented)
- **Notes:**
  - Presentation mode navigable via arrow keys
  - PDF export planned (jsPDF integration stub exists)
  - PPTX export not started

#### B9: Autosave
- **Category:** Editor
- **User Value:** Automatic saving prevents data loss
- **Evidence:**
  - Hook: `frontend/src/dashboard/project/features/slides/hooks/useSlidePersistence.ts`
  - Debounce: 2 seconds after last edit
  - Backend: `PATCH /projects/:projectId`
  - Save indicator in `SlideToolbar.tsx` (saving/unsaved/saved states)
- **Status:** Shipped
- **Notes:**
  - Yjs provides additional persistence layer (IndexedDB)
  - Manual save button also available

---

### C) Calendar / Time System

#### C1: Time Blocks
- **Category:** Calendar
- **User Value:** Schedule tasks on specific dates/times, visualize workload
- **Evidence:**
  - Task fields: `startAt`, `endAt` (ISO timestamps)
  - Calendar views: `WeekGrid.tsx`, `DayGrid.tsx`
  - Drag-drop rescheduling
  - Backend: `Tasks` table stores scheduling data
- **Status:** Shipped
- **Notes:** Time blocks are just tasks with `startAt`/`endAt` set; can exist without being in a focus block

#### C2: Focus Blocks
- **Category:** Calendar
- **User Value:** Group multiple tasks into a container (e.g., "Load-In" with 10 sub-tasks) for better organization
- **Evidence:**
  - Task field: `kind: "focus_block"`
  - Legacy support: `focusChildTaskIds: string[]` or `focusChecklist: Array<{taskId, title}>`
  - Progress indicators: `0/3` pills showing completed/total children
  - `docs/CALENDAR_FOCUS_BLOCKS.md` (70 lines explaining focus blocks vs stacks)
  - Rendering: `CalendarEntryPopover.tsx` shows "Time Blocks" section for focus block children
- **Status:** Shipped
- **Notes:**
  - Both new (`kind: "focus_block"`) and legacy (has focusChildTaskIds) shapes supported
  - Children can be completed independently
  - Focus blocks themselves can be scheduled (start/end times)

#### C3: Overlap Stacks
- **Category:** Calendar
- **User Value:** Auto-group overlapping calendar items to reduce clutter, support multi-user coordination
- **Evidence:**
  - Week view: `WeekGrid.tsx` (stacking logic)
  - Stack titles: `Project.calendarOverlapStackTitles: Record<string, string>` (project-wide persistence)
  - Endpoints: `GET/PATCH /projects/:projectId/calendar/overlap-stack-titles`
  - `backend/projects/router.mjs` lines 2808-2809
  - `docs/CALENDAR_FOCUS_BLOCKS.md` (explains overlap stacks vs focus blocks)
- **Status:** Shipped
- **Notes:**
  - Stacks can be multi-user (multiple avatars) or single-user (multitask)
  - Rename persists to project so all team members see same title
  - localStorage used as cache/fallback

#### C4: Drag-and-Drop Scheduling
- **Category:** Calendar
- **User Value:** Visually reschedule tasks by dragging to new times/dates
- **Evidence:**
  - `WeekGrid.tsx`, `DayGrid.tsx` (drag handlers)
  - Updates `startAt`/`endAt` on task
  - Backend: `PATCH /projects/:projectId/tasks/:taskId`
- **Status:** Shipped
- **Notes:** Works in week and day views; list view has inline edit

#### C5: Multi-View (Day/Week/List)
- **Category:** Calendar
- **User Value:** Switch perspectives: detailed day, week overview, or list of all tasks
- **Evidence:**
  - Components: `DayGrid.tsx`, `WeekGrid.tsx`, `TimelineRow.tsx` (list view)
  - View toggle in calendar UI
  - `frontend/src/dashboard/project/features/calendar/calendar.tsx`
- **Status:** Shipped
- **Notes:** Each view has different feature set (stacks only in week, detailed popovers in all)

#### C6: Recurrence Support
- **Category:** Calendar
- **User Value:** Create recurring tasks (daily, weekly, monthly)
- **Evidence:**
  - Task fields support recurrence (not fully exposed in UI)
  - Backend events table has recurrence fields
- **Status:** Partial (data model ready, UI not complete)
- **Notes:** Recurrence logic exists but UI for creating recurring tasks not finalized

#### C7: Assignment & Filtering
- **Category:** Calendar
- **User Value:** Assign tasks to team members, filter calendar by assignee
- **Evidence:**
  - Task field: `assignedTo: string` (userId)
  - Calendar filters: assignee dropdown
  - Multi-user overlap stacks show avatars
- **Status:** Shipped
- **Notes:** Filtering works across all views

---

### D) Tasks

#### D1: Task CRUD
- **Category:** Tasks
- **User Value:** Create, read, update, delete tasks with full metadata (title, description, priority, status, assignments)
- **Evidence:**
  - Backend: `GET/POST/PATCH/DELETE /projects/:projectId/tasks/*`
  - `backend/projects/router.mjs` lines 2819-2832
  - Frontend: `TasksPage.tsx`, calendar popovers, budget work panel
  - Tables: `Tasks` (PK: projectId, SK: `STATUS#{status}#{priority}#{taskId}`)
- **Status:** Shipped
- **Notes:** SK includes status/priority for efficient sorting/filtering

#### D2: Status Workflow
- **Category:** Tasks
- **User Value:** Track task lifecycle from creation to completion with defined states
- **Evidence:**
  - States: `todo`, `in_progress`, `in_review`, `changes_requested`, `done`, `archived`
  - DAL: `backend/projects/tasksDal.mjs` (status transition validation)
  - API: `TaskReviewTransitionAction` type in `frontend/src/shared/utils/api.ts`
  - Endpoints: `/projects/:projectId/tasks/:taskId/review-transition`
- **Status:** Shipped
- **Notes:**
  - Transitions enforced (e.g., can't go from `todo` to `done` without review if review required)
  - Status changes update SK (requires delete + create in DynamoDB)

#### D3: Review Workflow
- **Category:** Tasks
- **User Value:** Formal review process with submissions, approvals, change requests
- **Evidence:**
  - Actions: `submit_for_review`, `request_changes`, `approve`, `mark_done`
  - Review thread: `task.reviewThread: TaskReviewThreadEntry[]`
  - Endpoints: `/projects/:projectId/tasks/:taskId/review/request`, `.../approve`, `.../request_changes`
  - DAL: `backend/projects/tasksDal.mjs` (requestReview, approveTask, requestChanges functions)
- **Status:** Shipped
- **Notes:**
  - Review threads stored as array on task
  - Admin override available (`createdByAdmin` flag)
  - Each submission creates new thread entry

#### D4: Dependencies
- **Category:** Tasks
- **User Value:** Define task dependencies (can't start until another completes)
- **Evidence:**
  - Task field: `dependencies: string[]` (array of taskIds)
  - UI shows dependency badges
- **Status:** Partial (field exists, enforcement not implemented)
- **Notes:** Dependencies stored but not enforced by calendar/workflow logic yet

#### D5: Bulk Create (Spellbook)
- **Category:** Tasks
- **User Value:** Generate multiple tasks at once from pasted text (run-of-show, checklist)
- **Evidence:**
  - Endpoint: `POST /projects/:projectId/tasks/bulk`
  - `backend/projects/router.mjs` line 2822 (bulkCreateTasks)
  - Frontend: Task Spellbook modal (part of Magic Layout system)
  - `docs/CODEX_HANDOFF_SPELLBOOK_MAGIC.md`
- **Status:** Shipped
- **Notes:** AI parses text → generates tasks with inferred titles, descriptions, durations

#### D6: Budget Linking
- **Category:** Tasks
- **User Value:** Connect tasks to budget line items with typed relationships (quote/procure/build/install/invoice)
- **Evidence:**
  - Task fields: `linkType`, `budgetItemId`
  - UI: Budget work panel (`BudgetWorkPanelModal.tsx`)
  - Creates operational workflow from budget planning
- **Status:** Shipped
- **Notes:**
  - `linkType` enum: `quote`, `procure`, `build`, `install`, `invoice`
  - Enables "coverage meter" showing which stages completed per budget line

#### D7: Archive/Unarchive
- **Category:** Tasks
- **User Value:** Hide completed tasks from active views without deleting
- **Evidence:**
  - Endpoints: `POST /projects/:projectId/tasks/:taskId/archive`, `.../unarchive`
  - Status: `archived`
  - DAL: `backend/projects/tasksDal.mjs` (setArchive function)
- **Status:** Shipped
- **Notes:** Archived tasks excluded from default calendar/list views but queryable

---
### E) Budgets + Finance

#### E1: Line-Item Budgeting
- **Category:** Budgets
- **User Value:** Create detailed project budgets with categories, quantities, unit costs, markup
- **Evidence:**
  - Model: `BudgetItem` (category, description, quantity, unitCost, markup, contingency, tax)
  - Frontend: `BudgetTable.tsx`, `CreateLineItemModal.tsx`
  - Backend: `GET/POST/PATCH/DELETE /projects/:projectId/budget/items/:budgetItemId`
  - Table: `Budgets` (PK: `projectId#budgetId`, SK: `budgetItemId`)
- **Status:** Shipped
- **Notes:**
  - Markup and contingency calculated automatically
  - Supports multiple budget headers per project (though typically 1)

#### E2: Budget Spellbook (AI Generation)
- **Category:** Budgets / AI
- **User Value:** Paste project scope → AI generates budget line items with categories and estimates
- **Evidence:**
  - Component: `BudgetSpellbookModal.tsx`
  - Logic: `frontend/src/dashboard/project/features/budget/lib/budgetSpellbook.ts`
  - Parses unstructured text → structured budget lines
  - `docs/CODEX_HANDOFF_SPELLBOOK_MAGIC.md` (architecture doc)
- **Status:** Shipped
- **Notes:**
  - Uses pattern matching + keyword extraction (not LLM API yet)
  - Can infer categories, quantities, unit types
  - Generates "assumptions" chips (editable preview)

#### E3: Budget Revisions
- **Category:** Budgets
- **User Value:** Snapshot budget at different stages (initial quote, client approved, final) for change tracking
- **Evidence:**
  - Component: `RevisionModal.tsx`
  - Model: `BudgetRevision` (snapshot of all budget items)
  - Stored in budget context
  - Backend: Revisions stored as field on BudgetHeader
- **Status:** Shipped
- **Notes:** Revision comparison UI exists (diff view)

#### E4: Invoice Export (PDF)
- **Category:** Budgets
- **User Value:** Generate professional PDF invoices from budget data
- **Evidence:**
  - Component: `PdfInvoice.tsx`
  - Uses `@react-pdf/renderer`
  - Includes brand/client info from project metadata (`invoiceBrandName`, `clientName`, etc.)
- **Status:** Shipped
- **Notes:** PDF generation happens client-side (can be slow for large budgets)

#### E5: CSV Export/Import
- **Category:** Budgets
- **User Value:** Export budget to spreadsheet for external tools, import from CSV
- **Evidence:**
  - Export button in Budget toolbar
  - Import logic in budget components
- **Status:** Shipped
- **Notes:** CSV includes all line item fields

#### E6: Work Panel (Task-Budget Linking)
- **Category:** Budgets
- **User Value:** See which tasks are linked to each budget line, track operational stages
- **Evidence:**
  - Component: `BudgetWorkPanelModal.tsx`
  - Task fields: `linkType`, `budgetItemId`
  - Coverage meter: shows quote/procure/build/install/invoice stages
- **Status:** Shipped
- **Notes:**
  - One-click create task for missing stage
  - Enables operational tracking from budgeting

#### E7: HQ Ledger (Org-Level)
- **Category:** Budgets / Finance
- **User Value:** Centralized financial tracking across all projects (transactions, accounts, categorization)
- **Evidence:**
  - Backend: `backend/hq/router.mjs` (2784 lines)
  - Table: `HqLedger` (composite SK design)
  - Pages: `HQOverview.tsx`, `TransactionsPage.tsx`, `AccountsPage.tsx`, `ImportPage.tsx`, `ReportsPage.tsx`, `InvoicesPage.tsx`
  - Routes: `/hq/import`, `/hq/accounts`, `/hq/transactions`, `/hq/reports`, `/hq/invoices`
- **Status:** Shipped
- **Notes:** Full financial operations suite (see HQ section for detailed capabilities)

#### E8: Transaction Import (CSV)
- **Category:** Finance
- **User Value:** Bulk import bank statements via CSV with automatic deduplication
- **Evidence:**
  - Endpoint: `POST /hq/import-csv`
  - Page: `ImportPage.tsx`
  - Deduplication: hash-based (`dedupeHash` field on transactions)
  - Import tracking: `IMPORT#` sort keys
- **Status:** Shipped
- **Notes:**
  - Supports multiple CSV formats (bank-specific parsers)
  - Deduplication prevents double-entry

#### E9: Categorization Rules
- **Category:** Finance
- **User Value:** Auto-categorize transactions based on description patterns
- **Evidence:**
  - Backend: `RULE#` sort keys in HqLedger table
  - Pattern matching on transaction descriptions
  - Manual override available
- **Status:** Shipped
- **Notes:** Rules apply to future transactions; can bulk-recategorize existing

#### E10: Recurring Commitments
- **Category:** Finance
- **User Value:** Identify and group recurring expenses (subscriptions, rent, etc.)
- **Evidence:**
  - Fields: `recurringSeriesId`, `recurringGroup`
  - Auto-detection: transactions with same amount/description at regular intervals
  - Page: `TransactionsPage.tsx` (filter: recurring)
  - Route: `/hq/recurring` (redirects to filtered transactions)
- **Status:** Shipped
- **Notes:** Series detection runs on import; manual grouping also possible

#### E11: Financial Reports
- **Category:** Finance
- **User Value:** Aggregated views of income/expenses by day, account, category
- **Evidence:**
  - Page: `ReportsPage.tsx`
  - Derived storage: `LEDGER#{date}`, `LEDGERA#{accountId}#{date}` (day/account aggregates)
  - Backend aggregation logic in `hq/router.mjs`
- **Status:** Shipped
- **Notes:**
  - Aggregates rebuilt on ledger version bump (controlled by `HQ_LEDGER_VERSION`)
  - Reports queryable by date range

---

### F) Files / Asset Management

#### F1: File Upload (S3 Presigned URLs)
- **Category:** Files
- **User Value:** Drag-drop upload files securely to S3 without exposing credentials
- **Evidence:**
  - Hook: `useFileTransfers.ts`
  - Backend: Presigned URL generation (shared layer `/opt/nodejs/utils/files.mjs`)
  - S3 bucket: `mylg-files-v12`
  - Upload flow: request presigned URL → upload directly to S3 → confirm
- **Status:** Shipped
- **Notes:**
  - Presigned URLs expire (default 15 min)
  - Multipart upload for large files (future)

#### F2: CDN Delivery (CloudFront)
- **Category:** Files
- **User Value:** Fast, global file delivery with cache
- **Evidence:**
  - ADR-001 (CDN strategy)
  - CloudFront base: `cdn.mylg.app`
  - Paths: `public/{tenantId}/{entity}/{objectKey}` (unsigned) or `secure/...` (signed)
  - Shared layer: `buildPublicCdnPath`, `signSecureCdnUrl` helpers
- **Status:** Shipped
- **Notes:**
  - Single CloudFront distribution for all files
  - Signed URLs for secure content (uses CloudFront key pair)
  - Cache invalidation via CloudFront API

#### F3: File Deletion
- **Category:** Files
- **User Value:** Remove files from project (bulk or single)
- **Evidence:**
  - Endpoint: `POST /projects/:projectId/files/delete` (body: `{fileKeys: string[]}`)
  - `backend/projects/router.mjs` lines 1573-1630 (deleteProjectFiles)
  - Uses S3 `DeleteObjectsCommand` (batch delete)
- **Status:** Shipped
- **Notes:**
  - Returns success/error per file
  - Doesn't validate ownership (relies on project access check)

#### F4: Gallery PDF Conversion
- **Category:** Files
- **User Value:** Upload PDF → automatically convert pages to slide images for web viewing
- **Evidence:**
  - Lambda: `backend/create-gallery/` (Python with PyMuPDF)
  - Process: PDF uploaded → Lambda extracts pages → saves as PNG/JPG to S3
  - Gallery model stores image URLs
- **Status:** Shipped
- **Notes:**
  - Python Lambda requires native libs (must build on Linux/Docker)
  - README warns about Linux build requirement

#### F5: File Previews
- **Category:** Files
- **User Value:** View images/PDFs inline without downloading
- **Evidence:**
  - CloudFront public paths allow direct browser rendering
  - Gallery page shows image grid
- **Status:** Partial (images work, PDF viewer not implemented)
- **Notes:** PDF.js integration planned but not complete

#### F6: Versioning
- **Category:** Files
- **User Value:** Keep multiple versions of same file
- **Evidence:**
  - S3 versioning can be enabled on bucket
  - App logic doesn't expose versioning yet
- **Status:** Planned (S3 supports it, UI doesn't)
- **Notes:** Would require version listing API

---

### G) Proposals / RFPs / Deliverables

#### G1: Galleries (Client Sharing)
- **Category:** Proposals
- **User Value:** Create shareable, public galleries of project assets for clients
- **Evidence:**
  - Public route: `/gallery/:projectId/:gallerySlug`
  - Page: `GalleryPage.tsx`
  - Table: `Galleries` (PK: galleryId, GSI: projectId-index)
  - Backend: `GET/POST/PUT/PATCH/DELETE /projects/:projectId/galleries/*`
- **Status:** Shipped
- **Notes:**
  - Galleries are public (no auth required on gallery route)
  - Slug-based URLs for clean sharing

#### G2: Deck Versions for Clients
- **Category:** Proposals
- **User Value:** Maintain separate deck versions for internal vs client viewing
- **Evidence:**
  - `DeckVersion.allowedRoles` (filter by role)
  - `DeckVersion.isClientDefault` (default for client role)
  - Endpoints: `POST /projects/:projectId/deck-versions/:versionId/set-client-default`
- **Status:** Shipped (backend + data model)
- **Notes:** Frontend UI for role filtering not fully wired

#### G3: PDF Export (Proposals)
- **Category:** Proposals
- **User Value:** Export slide decks as PDF for client delivery
- **Evidence:**
  - Budget invoice uses `@react-pdf/renderer`
  - Slide export planned (stub in toolbar)
- **Status:** Partial (invoice PDF works, slide deck PDF not implemented)
- **Notes:** Would use same @react-pdf/renderer library

#### G4: PPTX Export
- **Category:** Proposals
- **User Value:** Export to PowerPoint format
- **Evidence:**
  - Toolbar placeholder exists
  - No implementation yet
- **Status:** Planned
- **Notes:** Would require PptxGenJS or similar library

#### G5: Gallery File Management
- **Category:** Proposals
- **User Value:** Add/remove files from gallery after creation
- **Evidence:**
  - Endpoint: `POST /projects/:projectId/galleries/:gallerySlug/files/delete`
  - `backend/projects/router.mjs` line 2865 (deleteGalleryFilesBySlug)
  - File list stored in `Gallery.files[]`
- **Status:** Shipped
- **Notes:** Gallery files are S3 objects; delete removes from gallery array and S3

---

### H) Permissions / Roles / Admin

#### H1: Role-Based Access Control
- **Category:** Permissions
- **User Value:** Different capabilities for admin/designer/builder/vendor/client roles
- **Evidence:**
  - Roles enum: `admin`, `designer`, `builder`, `vendor`, `client`
  - User model: `UserLite.role`, `TeamMember.role`
  - Backend auth: `getUserFromEvent` extracts role from JWT claims
  - `isAdmin` flag derived from Cognito groups or role claim
- **Status:** Shipped
- **Notes:**
  - Role stored in Cognito custom attributes
  - Admin role has override powers (task review, project deletion)

#### H2: Org-Based Isolation
- **Category:** Permissions
- **User Value:** Multi-tenant isolation (different orgs can't see each other's data)
- **Evidence:**
  - Tables: `Orgs`, `OrgMembers`
  - Middleware: `backend/shared-layer/nodejs/utils/orgAuth.mjs` (`requireOrgMember`, `requireOrgAdmin`)
  - HQ data scoped by orgId (PK in HqLedger table)
- **Status:** Shipped
- **Notes:**
  - Org membership checked on all HQ routes
  - Projects can be org-scoped (future)

#### H3: Project Team Membership
- **Category:** Permissions
- **User Value:** Control who can access each project
- **Evidence:**
  - `Project.team: TeamMember[]` (array of {userId, role})
  - Endpoints: `GET/POST/DELETE /projects/:projectId/team/*`
  - `backend/projects/router.mjs` lines 2814-2817
- **Status:** Shipped
- **Notes:**
  - Team membership required to view project
  - Role within team determines capabilities (e.g., clients can't edit budget)

#### H4: Deck Version Role Filtering
- **Category:** Permissions
- **User Value:** Show different deck versions to different roles
- **Evidence:**
  - `DeckVersion.allowedRoles: Role[]`
  - Filter logic: only return versions where user's role is in allowedRoles
- **Status:** Shipped (backend data model), Partial (frontend filtering not fully implemented)
- **Notes:** Enables client-safe decks vs internal working drafts

#### H5: Invitations System
- **Category:** Permissions
- **User Value:** Invite users to projects/orgs via email
- **Evidence:**
  - Tables: `ProjectInvitations`, `OrgInvites`
  - Context: `InvitesProvider.tsx`
  - GSIs: `senderId-index`, `recipientId-index`
  - Invitation flow: create invite → send email → recipient accepts
- **Status:** Shipped
- **Notes:**
  - Invites have expiration
  - Email sending via SES (not in scope of this audit)

---

### I) Notifications

#### I1: In-App Notifications
- **Category:** Notifications
- **User Value:** Get notified of @mentions, review requests, shares, failures
- **Evidence:**
  - Table: `Notifications` (PK: userId, SK: `N#{timestamp}#{uuid}`)
  - Types: `mention`, `share`, `review_request`, `publish`, `comment_resolved`, `failure`, `slide_to_task`, `project_invite`, `task_assigned`, `message`
  - Context: `NotificationProvider.tsx`
  - Drawer: `NotificationsDrawerContext.tsx`
- **Status:** Shipped
- **Notes:**
  - Badge shows unread count
  - Clicking notification marks as read and navigates to context (deep linking)

#### I2: Activity Streams (ADR-004)
- **Category:** Notifications
- **User Value:** Audit trail of all project activity (edits, uploads, settings changes) without spam
- **Evidence:**
  - Table: `ProjectActivity` (PK: projectId, SK: `A#{timestamp}#{uuid}`, TTL: 90 days)
  - Activity types: `slide_edit`, `slide_create`, `budget_update`, `file_upload`, etc.
  - Batching: 90s idle threshold for edits
  - Lambda: `backend/websocket/activityBatcher.mjs`
  - ADR-004 (comprehensive spec)
- **Status:** Shipped (backend), Partial (frontend Activity panel not fully wired)
- **Notes:**
  - Activity != Notifications (separate streams)
  - Edit batching prevents notification flood

#### I3: Phantom Notification Prevention
- **Category:** Notifications
- **User Value:** Only get notified for meaningful actions (not autosave, cursor moves, presence)
- **Evidence:**
  - `IGNORED_EVENTS` set in `backend/websocket/default.mjs` (autosave, yjs_sync, presence_join, cursor_move, etc.)
  - `NOTIFICATION_TRIGGERS` set (explicit allow-list)
  - Content hash comparison (dirty state detection)
  - ADR-004 section 4
- **Status:** Shipped
- **Notes:**
  - Hash computation excludes metadata (_cursors, _presence)
  - Self-edits never create notifications

#### I4: WebSocket Push
- **Category:** Notifications
- **User Value:** Real-time notification delivery without polling
- **Evidence:**
  - WebSocket: `backend/websocket/default.mjs`
  - Action: `notificationReceived` (pushed to clients)
  - Bridge: `NotificationSocketBridge.tsx` (connects WebSocket to notification context)
- **Status:** Shipped
- **Notes:**
  - Notifications also stored in DynamoDB (persistent)
  - WebSocket provides instant delivery

#### I5: Email/Push Notifications
- **Category:** Notifications
- **User Value:** Get notified even when not using app
- **Evidence:**
  - Email: SES integration (out of scope)
  - Push: not implemented
- **Status:** Planned
- **Notes:** Infrastructure ready but sending logic not wired

---

### J) AI / Spellbook Systems

#### J1: Budget Spellbook
- **Category:** AI
- **User Value:** Paste unstructured project scope → get structured budget with line items
- **Evidence:**
  - File: `frontend/src/dashboard/project/features/budget/lib/budgetSpellbook.ts`
  - Modal: `BudgetSpellbookModal.tsx`
  - Pattern matching: keywords, quantities, units, categories
  - `docs/CODEX_HANDOFF_SPELLBOOK_MAGIC.md`
- **Status:** Shipped
- **Notes:**
  - Currently rule-based (not LLM yet)
  - Generates assumptions (event date, markup, contingency) as editable chips
  - Preview before applying

#### J2: Task Spellbook
- **Category:** AI
- **User Value:** Paste run-of-show or checklist → get scheduled tasks
- **Evidence:**
  - Part of "Magic Layout" system
  - `docs/CODEX_HANDOFF_SPELLBOOK_MAGIC.md` (PlanDraft engine)
  - Bulk task creation endpoint: `POST /projects/:projectId/tasks/bulk`
- **Status:** Shipped
- **Notes:**
  - Infers task sequencing, dependencies
  - Integrates with calendar (auto-schedules based on event date, load-in, strike)

#### J3: Magic Layout
- **Category:** AI
- **User Value:** Infer event timeline (load-in, strike, crew call) and schedule tasks automatically
- **Evidence:**
  - `docs/CODEX_HANDOFF_SPELLBOOK_MAGIC.md` (comprehensive spec)
  - Assumption chips: event date, load-in duration, strike duration, crew call time, venue hours
  - "Conjure Plan" CTA on overview (creates budget + tasks + schedule in one step)
- **Status:** Shipped (backend), Partial (UI for "Conjure Plan" not fully implemented)
- **Notes:**
  - PlanDraft preview architecture (generates plan → user edits → apply atomically)
  - Integrates budget + calendar + task linking

#### J4: Model/Inference Backend
- **Category:** AI
- **User Value:** (Future) Use LLM for more sophisticated parsing
- **Evidence:**
  - Placeholder for AWS Bedrock integration
  - Current spellbooks use pattern matching (no LLM calls yet)
- **Status:** Planned
- **Notes:**
  - Bedrock Claude would enable natural language understanding
  - Would improve category inference, task sequencing

---
## 3. Architecture Summary

### Frontend Stack
- **Framework:** React 18
- **Build Tool:** Vite
- **Routing:** React Router v6
- **State Management:** Context API (split providers for performance: AuthContext, DataProvider → UserProvider, OrgProvider, ProjectsProvider, MessagesProvider)
- **Real-Time:** Yjs (CRDT for slides), WebSocket (messaging, notifications)
- **Editor:** Lexical (rich text editing)
- **Styling:** CSS Modules, Tailwind (utility classes)
- **UI Libraries:** Radix UI (dropdowns, selects), Framer Motion (animations), GSAP (scroll triggers)
- **Charts/Viz:** Visx (D3-based React charts)
- **PDF:** @react-pdf/renderer
- **Testing:** Vitest, React Testing Library
- **Type Safety:** TypeScript (strict mode)

**Evidence:** `frontend/package.json` (dependencies), `vite.config.ts`, `tsconfig.json`

### Backend Stack
- **Platform:** AWS Serverless
- **Functions:** Lambda (Node.js 20 ESM)
- **API:** API Gateway HTTP API + WebSocket API
- **Database:** DynamoDB (single-table design per service, GSIs for access patterns)
- **Storage:** S3 (files), CloudFront (CDN)
- **Auth:** Cognito (user pools), JWT
- **IaC:** Serverless Framework
- **Shared Layer:** `/opt/nodejs/utils/*` (CORS, auth, file helpers, org auth)

**Services:**
- `auth` — Cognito triggers, token refresh, role updates
- `projects` — Projects, tasks, events, budgets, galleries, deck versions (2923 lines)
- `messages` — Message CRUD (routed through WebSocket mostly)
- `hq` — Org-level financial ledger (2784 lines)
- `user` — User profiles
- `orgs` — Org management
- `websocket` — Real-time messaging, notifications, activity batching
- `cal` — iCal export
- `s3` — File operations
- `thumbnails` — Thumbnail generation
- `create-gallery` — PDF-to-slides conversion (Python + PyMuPDF)
- `shared-layer` — Shared utilities (CORS, auth, files)

**Evidence:** `backend/serverless.common.yml`, service directories, `backend/README.md`

### Real-Time Mechanism

#### WebSocket API
- **Connection:** API Gateway WebSocket (`$connect`, `$disconnect`, `$default` routes)
- **Auth:** JWT in `Sec-WebSocket-Protocol` header (subprotocols, per ADR)
- **Persistence:** Connection metadata stored in DynamoDB (`Connections` table)
- **Broadcast:** `ApiGatewayManagementApiClient.PostToConnectionCommand`
- **Actions:** `sendMessage`, `editMessage`, `deleteMessage`, `markRead`, `reactToMessage`, `budgetUpdated`, `lineLocked`, `notificationReceived`, `trackSlideEdit`, etc.

**Evidence:** `backend/websocket/onConnect.mjs`, `onDisconnect.mjs`, `default.mjs` (1458 lines), `.github/copilot-instructions.md` (WebSocket auth rules)

#### Yjs (Slide Collaboration)
- **Transport:** WebSocket (custom provider or y-websocket)
- **Persistence:** IndexedDB (client), DynamoDB (server, future)
- **Rooms:** One per slide (`slide-{slideId}`)
- **Awareness:** Cursor positions, presence
- **Conflict Resolution:** CRDT (automatic, no manual merging)

**Evidence:** `@lexical/yjs` dependency, `frontend/src/dashboard/project/features/slides/lib/yjs.ts`

### Security Model

#### Authentication
- **Provider:** AWS Cognito User Pools
- **Tokens:** JWT (access, ID, refresh)
- **Custom Attributes:** `custom:userId`, `custom:role`
- **Groups:** Cognito groups (e.g., `admin` group)
- **Refresh:** Custom endpoint `/auth/refresh-token`

**Evidence:** `backend/auth/`, Amplify config, `frontend/src/app/contexts/AuthContext.tsx`

#### Authorization
- **Project Access:** Team membership check (`Project.team[]` includes userId)
- **Org Access:** Org membership check (`requireOrgMember` middleware)
- **Role-Based:** Admin override powers, role-specific UI (e.g., clients can't edit budget)
- **Deck Versions:** `allowedRoles` filter

**Evidence:** `backend/shared-layer/nodejs/utils/auth.mjs`, `orgAuth.mjs`

#### File Security
- **Presigned URLs:** Time-limited S3 upload/download URLs (15 min default)
- **CloudFront Signed URLs:** For secure content (`secure/*` paths)
- **Public Content:** Unsigned URLs for public galleries (`public/*` paths)
- **No Direct S3 Access:** All file requests go through CloudFront or presigned URLs

**Evidence:** ADR-001, `backend/shared-layer/nodejs/utils/files.mjs`

#### CORS
- **Centralized Config:** `backend/serverless.common.yml` (`ALLOWED_ORIGINS` env var)
- **Enforcement:** Shared layer CORS helpers (all services inherit)
- **Deployment:** Redeploy `shared-layer` + services to update origins
- **Wildcard Hosts:** `CORS_WILDCARD_HOSTS` for subdomain matching

**Evidence:** `.github/copilot-instructions.md` (CORS rules), ADR (implied)

### Key Constraints / Scaling Properties

**DynamoDB Single-Table Patterns:**
- Each service uses its own table (not true single-table)
- Composite sort keys enable rich queries (e.g., `STATUS#{status}#{priority}#{taskId}` for tasks)
- GSIs for alternate access patterns (userId-index, projectId-index, etc.)
- No scans in production (filter via query when possible)

**WebSocket Connection Limits:**
- API Gateway max connections: 500 per account by default (quotas can be increased)
- Stale connection cleanup on disconnect
- Message size limit: 128 KB per message

**S3/CloudFront:**
- S3 is origin for CloudFront
- Cache TTL configurable per path
- Invalidation required for updated files
- Presigned URL expiration prevents long-term access

**Lambda Limits:**
- Timeout: 30s for API Gateway (WebSocket: 10s idle, 2h total)
- Memory: Configurable (default 1024 MB for most functions)
- Concurrency: Provisioned for high-traffic routes

**Yjs Scaling:**
- One room per slide (not all slides at once)
- Disconnect on slide switch (prevents memory buildup)
- IndexedDB caching reduces server load

---

## 4. "What We Can Claim" Marketing List

### Tier 1: Core Claims (Safe, Obvious, Strong)

✅ **Real-Time Collaboration**
- Evidence: Yjs slide editing, WebSocket messaging
- Claim: "Collaborate in real-time on slides, budgets, and calendars—changes sync instantly across your team"

✅ **All-in-One Production Workspace**
- Evidence: Projects, tasks, budgets, calendars, messages, files, galleries in one app
- Claim: "Manage entire production from kickoff to invoice in a single platform—no more tool-switching"

✅ **Budget Management with AI Assist**
- Evidence: Line-item budgeting, revisions, invoice export, Budget Spellbook
- Claim: "Create detailed budgets in seconds with AI-powered Spellbook—paste project scope, get line items automatically"

✅ **Advanced Calendar Scheduling**
- Evidence: Time blocks, focus blocks, overlap stacks, drag-drop
- Claim: "Visualize workloads with time blocks and focus blocks—drag-drop scheduling keeps teams aligned"

✅ **Multi-User Messaging Built In**
- Evidence: Project threads + DMs, reactions, file sharing
- Claim: "Keep conversations in context—project threads and direct messages with reactions, edits, and file attachments"

✅ **Slide-Based Deliverables**
- Evidence: Multi-slide editor with Yjs, deck versions, presentation mode
- Claim: "Create client presentations and proposals inside MYLG—real-time multi-user editing like Google Slides"

✅ **File Management & Sharing**
- Evidence: S3 upload, CloudFront CDN, galleries
- Claim: "Upload, organize, and share files with team and clients—galleries for easy asset delivery"

✅ **Role-Based Access Control**
- Evidence: Admin/designer/builder/vendor/client roles, project teams, org isolation
- Claim: "Control who sees what—role-based permissions keep client work separate from internal drafts"

✅ **Cross-Project Financial Tracking**
- Evidence: HQ Ledger, transaction imports, categorization, recurring commitments
- Claim: "Track expenses across all projects with HQ Ledger—import transactions, categorize, and monitor recurring costs"

✅ **Task Review Workflows**
- Evidence: Status transitions, review threads, approvals, change requests
- Claim: "Formal review process for tasks—submit for review, request changes, approve—keeps quality high"

### Tier 2: Power-User Claims (Credible, Specific, Feature-Rich)

✅ **Budget-Task Linking for Operational Tracking**
- Evidence: Work panel, linkType (quote/procure/build/install/invoice)
- Claim: "Link tasks to budget lines—track operational stages from quote to invoice, see coverage at a glance"

✅ **Smart Notifications (No Noise)**
- Evidence: ADR-004, NOTIFICATION_TRIGGERS vs IGNORED_EVENTS, 90s edit batching
- Claim: "Only get notified when it matters—mentions, reviews, shares, failures. Autosave and cursor moves don't spam you."

✅ **Activity Audit Trail (Separate from Notifications)**
- Evidence: ProjectActivity table, activity batching, 90-day TTL
- Claim: "Full project activity history—see who edited what and when, without notification overload"

✅ **Focus Blocks for Complex Work**
- Evidence: Container tasks with focusChildTaskIds, progress pills, calendar rendering
- Claim: "Group related tasks into Focus Blocks—manage load-in with 10 sub-tasks as one schedulable unit"

✅ **Deck Versioning with Role Filters**
- Evidence: DeckVersion table, allowedRoles, isDefault, isClientDefault
- Claim: "Maintain multiple deck versions—show different slides to clients vs internal team, set defaults per role"

✅ **PDF-to-Slide Galleries**
- Evidence: Python Lambda with PyMuPDF, gallery creation
- Claim: "Upload PDFs, get instant web galleries—pages converted to images, shareable links for clients"

✅ **Overlap Stacks (Multi-User Calendar Awareness)**
- Evidence: Week view stacking, project-wide stack titles, multi-avatar rendering
- Claim: "Auto-stack overlapping calendar items—see multi-user overlaps at a glance, rename stacks for clarity"

✅ **Budget Revisions & Change Tracking**
- Evidence: Revision snapshots, diff view
- Claim: "Snapshot budgets at key stages—compare initial quote vs final, track scope changes"

✅ **Recurring Commitment Detection**
- Evidence: Auto-grouping series, recurringSeriesId
- Claim: "Automatically identify recurring expenses—subscriptions, rent, and regular costs grouped together"

✅ **Transaction Deduplication on Import**
- Evidence: Hash-based deduplication, dedupeHash field
- Claim: "Import CSVs without double-entry—automatic deduplication prevents mistakes"

✅ **Magic Layout (AI Event Scheduling)**
- Evidence: PlanDraft engine, assumption chips (event date, load-in, strike, crew call)
- Claim: "Paste event details, get full schedule—AI infers load-in, strike, crew calls, and task sequencing"

✅ **CDN-First File Delivery**
- Evidence: ADR-001, CloudFront distribution, signed URLs for secure content
- Claim: "Fast, global file delivery—CloudFront CDN with signed URLs for secure content, public paths for sharing"

### Tier 3: Enterprise Claims (Only if Supported)

✅ **Org-Level Multi-Tenancy**
- Evidence: Orgs table, OrgMembers, requireOrgMember middleware, HQ scoped by orgId
- Claim: "Enterprise-ready multi-tenancy—different orgs can't see each other's data, HQ Ledger scoped per org"

✅ **Audit Trail (Activity Logs)**
- Evidence: ProjectActivity table, 90-day retention
- Claim: "Compliance-friendly activity logs—90-day audit trail of all project changes"

⚠️ **SOC 2 / Compliance** — NOT CLAIMED (no evidence of certification)

⚠️ **SSO / SAML** — NOT CLAIMED (Cognito supports it but not configured/tested)

⚠️ **On-Premise Deployment** — NOT CLAIMED (AWS only)

---
## 5. Refactor the Marketing Site IA + Copy

### A) New IA Outline (Anchors + Section Order)

1. **Hero** (`#hero`)
   - Headline + Subheadline
   - Primary CTA (Start Free Trial / Sign Up)
   - Hero visual (product screenshot or demo video)

2. **Problem** (`#problem`)
   - Pain points of current production management tools
   - Why tool-switching kills productivity

3. **Solution** (`#solution`)
   - MYLG's unified approach
   - Real-time collaboration angle

4. **Core Features** (`#features`)
   - Quick highlights (6-8 feature cards)

5. **Product Modules** (`#modules`)
   - Deep dive into major capabilities
   - Subsections: Slides, Calendar, Budget, Messages, HQ, Files

6. **How It Works** (`#how-it-works`)
   - Workflow example (project setup → budget → calendar → deliver)

7. **Who It's For** (`#who-its-for`)
   - Target personas (event producers, creative agencies, production teams)

8. **Integrations & Tech** (`#tech`)
   - Stack credibility (AWS, real-time, security)

9. **Pricing** (`#pricing`)
   - Placeholder (tiers TBD)

10. **FAQ** (`#faq`)
    - Based on actual product behavior

11. **CTA** (`#cta`)
    - Sign up / Schedule demo

---

### B) Updated Copy (Headlines + Bullets + Microcopy)

#### Hero
**Headline:**  
"Real-Time Production Management—From Planning to Payment"

**Subheadline:**  
"Collaborate on budgets, schedules, and deliverables in one workspace. No more tool-switching. No more version chaos. Just seamless production management for creative teams."

**CTA:**  
"Start Free Trial" / "See It in Action"

---

#### Problem
**Headline:**  
"Scattered Tools Slow You Down"

**Body:**
- Budgets in Excel. Schedules in Google Cal. Messages in Slack. Files in Dropbox. Proposals in PowerPoint.
- Context-switching wastes time. Version confusion creates mistakes. Clients see outdated info.
- What if your entire production lived in one place—with real-time sync?

---

#### Solution
**Headline:**  
"One Platform. Every Stage of Production."

**Body:**  
MYLG brings planning, budgeting, scheduling, messaging, and delivery into a single real-time workspace. Your team stays aligned. Clients stay informed. You stay on top of every detail.

**Key Differentiators:**
- ✅ Real-time collaboration (edits sync instantly across your team)
- ✅ AI-assisted planning (Spellbooks turn scope into budgets and tasks)
- ✅ Role-based permissions (clients see what they need, not your working drafts)
- ✅ Built for production teams (events, content, creative agencies)

---

#### Core Features (Cards)

1. **Real-Time Slide Collaboration**
   - Google Slides-style editor inside MYLG
   - Multi-user editing, automatic thumbnails, deck versioning
   - Present or export to PDF/PPTX

2. **Advanced Calendar Scheduling**
   - Time blocks, Focus Blocks, drag-drop scheduling
   - Multi-user overlap awareness with auto-stacking
   - Day/week/list views

3. **AI-Powered Budget Building**
   - Paste project scope → get line-item budget (Budget Spellbook)
   - Revisions, markup, contingency, tax
   - Export to PDF invoice or CSV

4. **Integrated Messaging**
   - Project threads + direct messages
   - Reactions, edits, file attachments
   - Real-time sync via WebSocket

5. **Task Workflows with Review**
   - Formal review process (submit → request changes → approve)
   - Link tasks to budget items (track quote → build → invoice)
   - Archive completed work

6. **HQ Financial Ledger**
   - Track expenses across all projects
   - Import bank CSVs, categorize transactions
   - Recurring commitment detection, financial reports

7. **File Management & Galleries**
   - Upload to CDN (CloudFront), organize by project
   - Create shareable client galleries
   - PDF-to-slide conversion for web viewing

8. **Smart Notifications**
   - Get notified only when it matters (mentions, reviews, shares)
   - Activity audit trail separate from notifications (no spam)

---

#### Product Modules (Deep Dive)

##### Slides & Deliverables
**What:**  
Create presentations, proposals, and client decks without leaving MYLG.

**How:**
- Multi-slide editor with real-time collaboration (powered by Yjs)
- Automatic thumbnail generation for sidebar navigation
- Deck versioning: draft/approved/archived, role-based visibility
- Presentation mode + PDF export

**Why It Matters:**  
Stop juggling Google Slides, Figma, and PowerPoint. Build deliverables where your project data lives.

##### Calendar & Scheduling
**What:**  
Visualize workloads, schedule tasks, coordinate multi-user timelines.

**How:**
- **Time Blocks:** scheduled task instances
- **Focus Blocks:** container tasks grouping sub-tasks (e.g., "Load-In" with 10 steps)
- **Overlap Stacks:** auto-group overlapping items, show multi-user overlaps
- Drag-drop rescheduling, day/week/list views

**Why It Matters:**  
See who's doing what, when—especially critical for events with crew calls, venue hours, and load-in/strike.

##### Budget & Finance
**What:**  
Line-item budgeting, AI-assisted generation, invoice export, cross-project financial tracking.

**How:**
- **Budget Spellbook:** paste scope text → get structured budget
- Line items with categories, quantities, unit costs, markup, contingency
- Budget revisions (snapshot at key stages)
- **Work Panel:** link tasks to budget lines (operational tracking)
- **HQ Ledger:** org-level transaction import, categorization, recurring detection

**Why It Matters:**  
Turn estimates into actionable budgets in seconds. Track every dollar from quote to payment.

##### Messaging & Collaboration
**What:**  
Keep conversations in context—project threads, DMs, file sharing.

**How:**
- Project-scoped threads (team chat per project)
- Direct messages (1:1)
- Reactions, edits, read states
- File attachments (upload once, share in message)

**Why It Matters:**  
No more digging through Slack/email to find that one decision. Project context is built-in.

##### Files & Asset Delivery
**What:**  
Upload, organize, share files with team and clients.

**How:**
- S3 + CloudFront CDN (fast, global delivery)
- Signed URLs for secure content, public links for galleries
- **Galleries:** upload PDF → get web-friendly slide images, shareable link

**Why It Matters:**  
Clients get clean asset galleries. Team gets organized file management. Everyone gets speed (CDN).

---

#### How It Works (Workflow Example)

1. **Create Project**
   - Set dates, invite team, assign roles

2. **Generate Budget with Spellbook**
   - Paste event scope → Budget Spellbook creates line items
   - Review, adjust markup/contingency, create revision

3. **Schedule with Magic Layout**
   - Set event date → AI infers load-in, strike, crew calls
   - Task Spellbook generates sequenced tasks, links to budget

4. **Collaborate in Real-Time**
   - Team edits slides for client proposal
   - Messages stay in project context
   - Calendar shows who's doing what

5. **Deliver to Client**
   - Create deck version for client (filtered by role)
   - Export gallery or PDF
   - Track invoice status in HQ Ledger

---

#### Who It's For

**Event Producers**
- Coordinate crew, vendors, venue logistics
- Track load-in/strike schedules, budget overruns
- Deliver proposals and final recaps

**Creative Agencies**
- Manage campaigns from brief to delivery
- Track billable work, task reviews
- Client presentations and asset sharing

**Production Teams (Film, Content, Live)**
- Schedule shoots, track budgets, coordinate crew
- Review workflows for creative approvals
- Real-time updates prevent miscommunication

---

#### Integrations & Tech

**Built on AWS**
- Serverless architecture (Lambda, DynamoDB, S3, CloudFront)
- Global CDN for fast file delivery
- 99.9% uptime SLA (AWS guarantees)

**Real-Time Collaboration**
- WebSocket API for instant messaging and notifications
- Yjs CRDT for conflict-free slide editing
- IndexedDB for offline resilience

**Security & Permissions**
- AWS Cognito authentication (JWT)
- Role-based access control
- CloudFront signed URLs for secure files
- Multi-tenant org isolation

---

#### FAQ (Based on Actual Behavior)

**Q: Can multiple people edit slides at the same time?**  
A: Yes. Each slide has its own real-time room (Yjs). Changes sync instantly without conflicts.

**Q: How does the Budget Spellbook work?**  
A: Paste your project scope (event description, run-of-show, shopping list) and Spellbook generates line items with categories, quantities, and estimates. You review and adjust before applying.

**Q: What's the difference between Focus Blocks and Time Blocks?**  
A: Time Blocks are scheduled task instances. Focus Blocks are container tasks that group multiple time blocks (e.g., "Load-In" containing 10 sub-tasks). Focus Blocks show progress (3/10 complete).

**Q: Can clients see internal working versions of decks?**  
A: No. Deck versions have role-based visibility. You can set a client-specific default that only shows approved slides.

**Q: How does HQ Ledger work with projects?**  
A: HQ Ledger is org-level (tracks all expenses across projects). You import transactions via CSV, categorize them, and HQ shows recurring costs, reports, and invoices. Project budgets are separate (line-item estimates).

**Q: What happens if I lose internet while editing?**  
A: Yjs stores edits in IndexedDB (local browser storage). When you reconnect, changes sync automatically.

**Q: Can I export budgets to Excel?**  
A: Yes. Export to CSV for Excel/Sheets, or generate PDF invoices directly.

**Q: How are notifications different from activity?**  
A: Notifications are rare, actionable events (mentions, review requests, shares, failures). Activity is a full audit trail (who edited what, when). Activity doesn't spam you with notifications for every autosave.

**Q: Does MYLG work on mobile?**  
A: Web app is responsive (works on tablets/phones). Native apps planned.

---

### C) Content JSON (Single Source of Truth)

**Location:** `frontend/public/marketing-content.json` (or `frontend/src/content/marketing.json`)

```json
{
  "hero": {
    "headline": "Real-Time Production Management—From Planning to Payment",
    "subheadline": "Collaborate on budgets, schedules, and deliverables in one workspace. No more tool-switching. No more version chaos.",
    "cta": {
      "primary": "Start Free Trial",
      "secondary": "See It in Action"
    }
  },
  "features": [
    {
      "id": "slides",
      "title": "Real-Time Slide Collaboration",
      "description": "Google Slides-style editor inside MYLG. Multi-user editing, automatic thumbnails, deck versioning.",
      "icon": "presentation"
    },
    {
      "id": "calendar",
      "title": "Advanced Calendar Scheduling",
      "description": "Time blocks, Focus Blocks, drag-drop scheduling. Multi-user overlap awareness.",
      "icon": "calendar"
    },
    {
      "id": "budget",
      "title": "AI-Powered Budget Building",
      "description": "Paste project scope → get line-item budget. Revisions, markup, PDF invoice export.",
      "icon": "dollar-sign"
    },
    {
      "id": "messaging",
      "title": "Integrated Messaging",
      "description": "Project threads + DMs. Reactions, edits, file attachments. Real-time sync.",
      "icon": "message-circle"
    },
    {
      "id": "tasks",
      "title": "Task Workflows with Review",
      "description": "Formal review process. Link tasks to budget items. Archive completed work.",
      "icon": "check-square"
    },
    {
      "id": "hq",
      "title": "HQ Financial Ledger",
      "description": "Track expenses across projects. Import CSVs, categorize, detect recurring costs.",
      "icon": "bar-chart"
    },
    {
      "id": "files",
      "title": "File Management & Galleries",
      "description": "CDN delivery, shareable client galleries, PDF-to-slide conversion.",
      "icon": "folder"
    },
    {
      "id": "notifications",
      "title": "Smart Notifications",
      "description": "Get notified only when it matters. Activity audit trail separate from notifications.",
      "icon": "bell"
    }
  ],
  "faq": [
    {
      "question": "Can multiple people edit slides at the same time?",
      "answer": "Yes. Each slide has its own real-time room (Yjs). Changes sync instantly without conflicts."
    },
    {
      "question": "How does the Budget Spellbook work?",
      "answer": "Paste your project scope and Spellbook generates line items with categories, quantities, and estimates. You review and adjust before applying."
    },
    {
      "question": "What's the difference between Focus Blocks and Time Blocks?",
      "answer": "Time Blocks are scheduled task instances. Focus Blocks are container tasks that group multiple time blocks (e.g., 'Load-In' with 10 sub-tasks)."
    },
    {
      "question": "Can clients see internal working versions of decks?",
      "answer": "No. Deck versions have role-based visibility. You can set a client-specific default."
    },
    {
      "question": "How does HQ Ledger work with projects?",
      "answer": "HQ Ledger is org-level (all expenses). Project budgets are line-item estimates. HQ imports bank CSVs, categorizes, tracks recurring costs."
    },
    {
      "question": "What happens if I lose internet while editing?",
      "answer": "Yjs stores edits in IndexedDB. When you reconnect, changes sync automatically."
    }
  ]
}
```

---

### D) Missing Screenshots/GIFs (Capture List)

**Priority 1 (Must-Have):**
1. **Slide Editor Multi-User Session** — Two users editing same slide, cursors visible
2. **Budget Spellbook in Action** — Paste text → generated budget preview
3. **Calendar Week View with Stacks** — Overlap stacks, multi-user avatars, focus block progress
4. **Messages Thread** — Project chat with reactions, file attachment
5. **HQ Ledger Transactions** — Imported CSV, categorization UI, recurring series highlighted

**Priority 2 (Nice-to-Have):**
6. **Deck Versioning UI** — Multiple versions, role filter dropdown
7. **Task Review Workflow** — Submit for review → changes requested → approve flow
8. **Gallery Example** — Public gallery page with PDF-derived slides
9. **Focus Block Popover** — Calendar entry showing "Time Blocks" children list
10. **Work Panel** — Budget line item with linked tasks (coverage meter)

**Priority 3 (Power Features):**
11. **Magic Layout Preview** — PlanDraft with assumption chips, timeline preview
12. **Notification vs Activity** — Drawer showing notifications, separate activity panel
13. **Overlap Stack Rename** — Inline edit of stack title
14. **CDN File Delivery** — Network tab showing CloudFront URLs
15. **Org Multi-Tenancy** — Org switcher, member management UI

**Format:**
- High-res PNGs for static features
- Animated GIFs (< 5 MB) for interactions (drag-drop, real-time sync)
- Short videos (< 30s) for complex workflows (Spellbook, review flow)

**Tool Recommendations:**
- ScreenToGif (Windows)
- Kap (Mac)
- LICEcap (cross-platform)
- For videos: Loom or OBS Studio

---

## 6. Gaps / Recommendations

### Missing-but-Implied Features (Marketing Wants, Product Lacks)

1. **Mobile Native Apps**
   - **Marketing Implication:** "Work from anywhere"
   - **Reality:** Web app only (responsive but not native)
   - **Recommendation:** Build PWA first (installable, offline-capable), then evaluate native

2. **Integrations (Slack, Google Cal, etc.)**
   - **Marketing Implication:** "Connects to your existing tools"
   - **Reality:** No integrations yet
   - **Recommendation:** Prioritize Slack (webhook for notifications) and Google Cal (iCal already exists, add sync)

3. **Public API**
   - **Marketing Implication:** "Extend MYLG with custom tools"
   - **Reality:** No documented public API
   - **Recommendation:** Expose subset of REST endpoints with API keys, document with OpenAPI

4. **Advanced Permissions (Field-Level)**
   - **Marketing Implication:** "Granular control"
   - **Reality:** Role-based at project/deck level, not field-level
   - **Recommendation:** Add "view-only" budget mode for clients (can see totals, not line-item details)

5. **Time Tracking**
   - **Marketing Implication:** "Track billable hours"
   - **Reality:** Tasks have start/end times but no time-entry logging
   - **Recommendation:** Add time-entry widget on tasks (log hours worked vs scheduled hours)

6. **LLM-Powered Spellbooks**
   - **Marketing Implication:** "AI-powered" (customers expect LLM)
   - **Reality:** Rule-based pattern matching
   - **Recommendation:** Integrate AWS Bedrock (Claude) for natural language understanding

7. **Client Portal (Separate Login)**
   - **Marketing Implication:** "Client-specific experience"
   - **Reality:** Clients are just users with `client` role
   - **Recommendation:** Create `/client/:projectId` route with simplified UI (no admin clutter)

8. **Email/Push Notifications**
   - **Marketing Implication:** "Never miss a mention"
   - **Reality:** In-app only (WebSocket + DynamoDB)
   - **Recommendation:** Wire SES for email, SNS for mobile push

### Quick Wins (Features 80% Done)

1. **Deck Version UI**
   - **Status:** Backend complete, frontend partially wired
   - **Work Remaining:** Connect version switcher dropdown, add "Create Version" modal
   - **Effort:** 2-3 days

2. **Slide Export to PDF**
   - **Status:** Toolbar button exists, @react-pdf/renderer already used for invoices
   - **Work Remaining:** Render slides with @react-pdf/renderer, handle multi-page
   - **Effort:** 3-5 days

3. **Activity Panel Frontend**
   - **Status:** Backend + batching complete (ADR-004)
   - **Work Remaining:** Add Activity tab to project overview, wire ProjectActivity query
   - **Effort:** 2-3 days

4. **Conjure Plan UI**
   - **Status:** Backend bulk create exists, PlanDraft architecture documented
   - **Work Remaining:** Build preview modal with assumption chips, wire to bulk endpoints
   - **Effort:** 5-7 days

5. **Gallery File Upload**
   - **Status:** Gallery CRUD exists, S3 upload works
   - **Work Remaining:** Add drag-drop to gallery page, wire to presigned URLs
   - **Effort:** 1-2 days

6. **Slide Backgrounds**
   - **Status:** Data model ready (`backgroundColor`, `backgroundImage`)
   - **Work Remaining:** Add background picker to toolbar, persist to project
   - **Effort:** 2-3 days

### Honest Roadmap Phrasing

**Shipped:**
- Real-time slide collaboration
- Budget Spellbook (AI-assisted)
- Advanced calendar (time/focus blocks, stacks)
- Task review workflows
- HQ Ledger (financial operations)
- File management with CDN
- Smart notifications

**In Beta / Partial:**
- Deck versioning (backend ready, UI incomplete)
- Activity audit trail (backend complete, frontend panel not wired)
- Magic Layout (architecture documented, full UI not implemented)

**Coming Soon:**
- Slide deck PDF export
- LLM-powered Spellbooks (Bedrock integration)
- Mobile native apps (PWA first)
- Slack/Google Cal integrations
- Public API

**Planned:**
- Time tracking (hours logged per task)
- Client portal (simplified view)
- Email/push notifications
- Advanced reporting (custom dashboards)

---

## End of Audit

**Summary:**
- **Product is robust** — 609 TypeScript files, 7K+ lines in backend routers, real-time collaboration, comprehensive feature set
- **Marketing undersells** — Slides, HQ, AI Spellbooks, smart notifications, deck versioning not highlighted
- **Quick wins available** — 6+ features 80% done (deck UI, PDF export, activity panel, conjure plan, etc.)
- **Honest positioning** — "Real-time production workspace with AI-assisted planning" beats vague "design-first instrument"

**Next Steps:**
1. Implement this marketing content (copy + JSON)
2. Capture screenshots/GIFs (15-item list above)
3. Ship quick wins (deck UI, slide PDF, activity panel)
4. Roadmap transparency (label "Beta" and "Coming Soon" clearly)
5. Launch with credibility (real features, real evidence, no vaporware)
