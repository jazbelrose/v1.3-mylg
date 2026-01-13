# MYLG Capability Audit — Quick Summary

**Full Audit:** See `CAPABILITY_AUDIT_AND_MARKETING_REFACTOR.md` (1,988 lines)

---

## What MYLG Actually Is

**Real-time collaborative production management platform** for creative teams (events, agencies, content production).

**Core Differentiators:**
1. Real-time slide collaboration (Yjs + Lexical, like Google Slides)
2. Dual messaging (project threads + DMs, WebSocket)
3. Smart notifications (no spam from autosave/presence)
4. AI Spellbooks (paste scope → get budget/tasks)
5. Advanced calendar (focus blocks, overlap stacks, drag-drop)
6. Budget with revisions + task linking + invoice export
7. HQ Ledger (org-level finance across all projects)
8. CDN file delivery (signed URLs for secure content)
9. Multi-role permissions (org isolation, role-based deck versions)
10. Task review workflows (formal approval process)

---

## Product Capabilities (60+ Features Documented)

### Shipped Features
- ✅ Multi-slide editor with real-time collaboration
- ✅ Deck versioning (full UI: dropdown, modal, version management)
- ✅ Slide PDF export (quality presets, progress indicator)
- ✅ Calendar with time blocks, focus blocks, overlap stacks
- ✅ Budget Spellbook (AI-assisted generation)
- ✅ Task Spellbook + Conjure Plan (overview button → spellbook in plan mode)
- ✅ Project threads + DMs (reactions, edits, files)
- ✅ HQ Ledger (transaction import, categorization, recurring detection)
- ✅ File management (S3 + CloudFront CDN)
- ✅ PDF-to-slide galleries
- ✅ Task review workflows
- ✅ Smart notifications + activity streams (ADR-004)
- ✅ Budget revisions + work panel (task-budget linking)
- ✅ Role-based access control + org multi-tenancy

### Partial (80% Done — Quick Wins)
- 🟡 Activity panel frontend (backend complete, UI not wired)
- 🟡 Magic Layout auto-scheduling (Conjure Plan UI done, time inference in progress)
- 🟡 Slide backgrounds (data model ready, UI not exposed)
- 🟡 Gallery file upload (gallery CRUD exists, upload flow incomplete)

### Planned
- 🔵 Magic Layout full auto-scheduling (time inference)
- 🔵 Mobile native apps (PWA first)
- 🔵 LLM-powered Spellbooks (Bedrock integration)
- 🔵 Slack/Google Cal integrations
- 🔵 Public API
- 🔵 Time tracking (hours logged per task)
- 🔵 Email/push notifications

---

## Marketing Gaps

### Missing from Current Marketing
- Real-time slide collaboration (Yjs)
- Calendar advanced features (focus blocks, stacks)
- HQ Ledger (org-level finance)
- AI Spellbooks (budget/task generation)
- Deck versioning with role-based access
- Smart notifications vs activity distinction
- Direct messaging (separate from project threads)

### Recommended Position

**Old (vague):**  
"MYLG is a design-first production instrument..."

**New (specific):**  
"Real-Time Production Management—From Planning to Payment"

**Subheadline:**  
"Collaborate on budgets, schedules, and deliverables in one workspace. No more tool-switching. No more version chaos."

---

## Architecture

**Frontend:** React 18, Vite, TypeScript, Yjs, Lexical, WebSocket  
**Backend:** AWS Serverless (14 services), Lambda, DynamoDB, S3, CloudFront, Cognito  
**Real-Time:** WebSocket API + Yjs CRDT  
**Security:** JWT auth, role-based access, signed URLs, org isolation

**Evidence:**
- 609 TypeScript files
- 7,165 lines in main backend routers
- 14 backend services (auth, projects, hq, websocket, orgs, messages, user, cal, s3, thumbnails, create-gallery, shared-layer, dynamodb, infra)

---

## Next Steps

1. **Implement Marketing Content**
   - Use copy from Section 5 of audit
   - Deploy content JSON
   - Update homepage/landing
   - **Capture screenshots for newly shipped features:** Deck Versioning UI, PDF Export flow, Conjure Plan button

2. **Capture Screenshots/GIFs**
   - Priority 1: Multi-user slides, Budget Spellbook, Calendar stacks, Messages, HQ Ledger, **Deck Versioning dropdown, PDF Export, Conjure Plan** (8 items)
   - Priority 2: Task review, Gallery, Focus block popover, Work panel (4 items)
   - Priority 3: Magic Layout, Notifications, Stack rename, CDN, Org switcher (5 items)

3. **Ship Quick Wins** (4 remaining, down from 6)
   - Activity panel frontend (2-3 days)
   - Magic Layout auto-scheduling (3-5 days)
   - Gallery upload (1-2 days)
   - Slide backgrounds (2-3 days)

4. **Roadmap Transparency**
   - Label features: Shipped / In Beta / Coming Soon / Planned
   - Highlight newly shipped: Deck Versioning, PDF Export, Conjure Plan
   - No vaporware claims

5. **Launch with Credibility**
   - Every claim backed by evidence
   - Screenshots show real product (including new features)
   - Demo flows work end-to-end

---

## Key Files

- `CAPABILITY_AUDIT_AND_MARKETING_REFACTOR.md` — Full audit (1,988 lines)
- `SLIDES_IMPLEMENTATION.md` — Slides feature doc (343 lines)
- `docs/CALENDAR_FOCUS_BLOCKS.md` — Calendar architecture (70 lines)
- `docs/adrs/ADR-004-notifications-activity-streams.md` — Notifications spec (565 lines)
- `docs/CODEX_HANDOFF_SPELLBOOK_MAGIC.md` — Spellbook architecture
- `backend/projects/router.mjs` — Projects API (2,923 lines)
- `backend/hq/router.mjs` — HQ Ledger API (2,784 lines)
- `backend/websocket/default.mjs` — WebSocket handler (1,458 lines)

---

**Audit Date:** January 13, 2026  
**Status:** ✅ Complete
