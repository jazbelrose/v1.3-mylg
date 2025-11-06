# MYLG — Copilot Instructions (Concise)

> Purpose: keep Copilot focused, fast, and correct. This file trims to the highest‑signal facts and workflows only.

## What Copilot Is (and isn’t) Asked To Do
- **Prioritize facts from this repo** (code over memory). If unsure, **read** before suggesting.
- Respond in this format for non‑trivial requests: **Plan → Changes → Diffs → Tests** (and **Follow‑ups** if needed).
- Prefer **small, composable PRs**. Don’t sprawl.
- When code spans multiple files, produce **path‑scoped diffs** and note any **migration** steps.

## High‑Signal Architecture Map (use these terms)
**Stack**: React 18 + TypeScript + Vite (frontend); AWS Serverless (Lambda, API Gateway, DynamoDB, S3, Cognito); WebSocket + **Yjs** for real‑time.

**Backend services** (domain‑isolated, Serverless Framework):  
`shared-layer/` (deploy **first**), `auth/`, `projects/`, `messages/`, `user/`, `websocket/`.

**Frontend** (path aliases with `@/`):  
`src/app/contexts/*` (split providers), `src/dashboard/project/features/*` (Slides, Budget, etc.), shared utils under `src/shared/utils/*`.

## Non‑Negotiables (Guardrails)
1. **CORS is centralized** via shared layer. To change origins, edit `backend/serverless.common.yml` → redeploy `shared-layer` → redeploy affected services. Never per‑service ad‑hoc CORS.
2. **WebSocket auth**: JWT must be passed via the **Sec-WebSocket-Protocol** header (subprotocols). **Never** in query strings.
3. **DM conversation IDs**: `dm#<lowerUserId>___<higherUserId>` (sorted lexicographically, delimiter `___`). Do not invent alternatives.
4. **File URLs**: always CloudFront‑first (`cdn.mylg.app`), with `public/` vs `secure/` (signed) paths. Avoid raw S3 URLs in clients.
5. **Context performance**: use **split providers** and `useMemo` to prevent render cascades.
6. **Yjs rooms**: one room per collaborative entity; **disconnect on switch**; cache providers; persist via IndexedDB + DynamoDB.

## What To Read First (when in doubt)
- **Frontend**: `src/shared/utils/api.ts` (endpoints); `src/app/contexts/*` (split providers); Slides feature under `src/dashboard/project/features/slides/*` (Yjs, thumbnails, feature flags).
- **Backend**: `backend/shared-layer/nodejs/utils/*` (CORS/files helpers); each service’s `serverless.yml` & handlers; `websocket/*` ($connect/$disconnect/$default).
- **ADRs**: `docs/adrs/` (CORS, DM IDs, CDN strategy).

## Minimal Runbook
**Frontend**
```bash
cd frontend
npm run dev        # Vite
npm run typecheck  # TS
npm test           # Vitest
npm run build
```
**Backend**
```bash
cd backend
npm run deploy:dev          # orchestrated deploy (shared-layer first)
cd backend/<service> && serverless offline
```

## Coding Rules (shortlist)
**TypeScript/React**
- Functional components, hooks only; respect hooks rules.
- Path alias imports (`@/...`) preferred.
- Keep components single‑responsibility; colocate tests: `*.test.ts(x)` nearby.
- Avoid context bloat; memoize values; derive state, don’t duplicate.
- For cross‑feature UI, export from feature `index.ts` and keep surface areas small.

**Lambda/Node**
- ES modules; small handlers; reuse shared‑layer helpers (CORS, responses, files).
- Validate inputs; structured errors; no secrets in code.

## WebSocket Message Routing
- Client routes incoming `msg.action` to handlers; backend `$default` dispatches actions.
- Ensure auth on `$connect`; include `sessionId` subprotocol if required.

## Slides & Collaboration (hot paths)
- **Rooms**: `slide-{slideId}`; provider cache; disconnect on slide change.
- **Thumbnails**: use local/UI cache when flagged; avoid unnecessary S3 writes when UI‑only mode is enabled.
- **Feature flags**: localStorage/env‑gated (e.g., `slidesMode`, `VITE_USE_UI_THUMBS`).

## Budget Feature (boundary notes)
- Dedicated provider/context under `features/budget/`.
- All mutations require a **BudgetHeader** (create it before items/revisions).

## Answer Style for Copilot
When asked for a fix or feature, reply like this:
1) **Plan** — bullet steps with file paths.  
2) **Changes** — what each file will do (one line each).  
3) **Diffs** — unified diffs per file (minimal but complete).  
4) **Tests** — unit/behavior checks.  
5) **Follow‑ups** — migrations, env, deploy order if any.

## Common Pitfalls (and the fix)
- **CORS 403/blocked** → Update `ALLOWED_ORIGINS` in `serverless.common.yml`; redeploy `shared-layer`, then services.
- **Duplicate DMs** → Ensure ID builder sorts users and uses `___` delimiter.
- **WebSocket auth fails** → Token not in `Sec-WebSocket-Protocol`; never use query strings.
- **Slides autosave churn** → Respect dirty‑thumbnail flag and batched persistence.
- **Python Lambda (e.g., create‑gallery)** → Build on Linux (WSL/Docker) for native deps (PyMuPDF).

## Helpful Commands
```bash
# Frontend
npm run lint && npm run typecheck && npm test

# Backend single service deploy
cd backend/projects && serverless deploy --stage dev
```

## Contribution Checklist (pre‑PR)
- Linted + typechecked + tests green.
- No per‑service CORS hacks.
- WebSocket auth via subprotocol confirmed.
- Re‑used shared utilities; updated ADRs if architecture changed.
- Small, well‑named commits; PR description follows **Plan → Changes → Diffs → Tests**.
