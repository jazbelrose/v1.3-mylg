# MYLG! App - Copilot Instructions

## Project Overview & Principles

MYLG (Making You Look Good) is a serverless collaborative project management platform for designers, builders, and clients. The system combines structured project/budget management with real-time messaging and collaborative editing. Built on AWS Lambda, DynamoDB, API Gateway (HTTP v2 + WebSocket), S3, and CloudFront for the backend, with a React/TypeScript frontend using Amplify, Lexical, Yjs, and Fabric.js.

**Core Constraints:**
- **Performance:** Minimal re-renders via memoization, context boundaries, and request batching/debouncing
- **Security:** JWT via headers only (never query strings); signed URLs for private S3 assets; least-privilege IAM
- **Portability:** Domain-isolated services for independent deployment; shared layer for consistency
- **Collaboration:** CRDT-based real-time editing (Yjs) with IndexedDB + DynamoDB persistence

---

## High-Level Architecture

### Backend Services (Serverless Framework v3, Node 18.x)

```
backend/
├── serverless.common.yml         # Centralized env vars, CORS config, DynamoDB table names
├── shared-layer/                 # Lambda Layer (exported ARN) with CORS, file URL helpers
│   ├── nodejs/utils/cors.mjs     # Dynamic origin handling for all services
│   └── nodejs/utils/files.mjs    # S3/CloudFront URL helpers
├── auth/                         # Cognito triggers, token refresh, role management
├── projects/                     # Projects CRUD, budgets, tasks, events, galleries
├── messages/                     # Inbox, DM threads, notifications
├── user/                         # User profiles, invitations, notifications
├── websocket/                    # WebSocket API ($connect, $disconnect, $default)
├── create-gallery/               # Python Lambda for PDF thumbnail generation (PyMuPDF)
├── s3/                           # S3 bucket + CloudFront distribution stack
└── cal/                          # iCal feed generation for project calendars
```

**Deployment Order:**
1. `shared-layer` (exports ARN for others)
2. `s3` (optional, provisions FILE_BUCKET + CloudFront)
3. All other services (`auth`, `projects`, `messages`, `user`, `websocket`, `create-gallery`, `cal`) in any order

**Deployment Commands:**
```bash
cd backend
npm run deploy:dev    # Orchestrated deploy (if script exists)
# or manual per-service:
cd shared-layer && sls deploy --stage dev
cd ../projects && sls deploy --stage dev
```

### Frontend (React 18, TypeScript, Vite)

```
frontend/
├── src/
│   ├── app/                      # Root layout, routing, global providers
│   │   └── contexts/             # AuthContext, UserContext, ProjectsContext, MessagesContext, etc.
│   ├── dashboard/                # Authenticated dashboard shell
│   │   ├── features/             # Feature modules (GlobalSearch, Messages, etc.)
│   │   └── project/              # Project workspace
│   │       └── features/         # Editor (Lexical+Yjs), Budget, Calendar, Gallery
│   ├── shared/                   # Reusable UI, utils, hooks
│   │   └── utils/
│   │       ├── api.ts            # apiFetch, endpoint constants, retry/CORS logic
│   │       ├── websocketUtils.ts # DM conversation ID helpers, message normalization
│   │       └── messageUtils.ts   # Message deduplication, type definitions
│   └── config/realtime.ts        # Yjs WebSocket URL config (EC2 or proxy)
├── vite.config.ts                # Dev server, proxy for /yjs, CSP headers
└── vitest.config.ts              # Test config (jsdom, setupFiles)
```

**Build/Dev Commands:**
```bash
cd frontend
npm run dev           # Vite dev server on :5173 (HMR on LAN IP 192.168.1.200)
npm run build         # Production build
npm run typecheck     # TypeScript check
npm run test          # Vitest (unit tests)
npm run lint          # ESLint
```

---

## Backend Services

### 1. Auth Service

**Purpose:** Cognito triggers, JWT authorizer, token refresh, role management

**Serverless Config:** `backend/auth/serverless.yml`

**Functions:**
- `preTokenGeneration` (Cognito trigger): Injects `role` claim from UserProfiles table
- `cognitoAuthorizer`: Lambda authorizer for WebSocket $connect (validates JWT from `Sec-WebSocket-Protocol` header)
- `refreshToken`: `POST /auth/refresh-token` - Refresh Cognito access token
- `updateRoles`: `POST /auth/update-roles` - Update user roles in Cognito groups

**Data Models:**
- Reads `UserProfiles` table (PK: `userId`)

**Auth Model:**
- Cognito User Pool: `us-west-2_EmStQTtG1` (dev)
- Client ID: `6f5f1vsm5bejjaffihc3e0n95k`
- JWT issuer: `https://cognito-idp.us-west-2.amazonaws.com/us-west-2_EmStQTtG1`

**Local Dev:**
```bash
cd backend/auth
npm install
serverless offline
```

---

### 2. Projects Service

**Purpose:** Projects CRUD, budgets, tasks, events, galleries

**Serverless Config:** `backend/projects/serverless.yml`

**Handler:** `router.mjs` (single router for all routes)

**REST Routes:**
- `GET /projects` - List projects
- `POST /projects` - Create project
- `GET /projects/{id}` - Get project
- `PATCH /projects/{id}` - Update project
- `DELETE /projects/{id}` - Delete project
- `POST /projects/{projectId}/files/delete` - Delete project files
- `GET /projects/health` - Health check
- `GET|POST|PATCH|DELETE /budgets/{proxy+}` - Budget operations
- All routes require JWT authorization (jwtAuthorizer in API Gateway)

**Data Models:**
- **Projects** table (PK: `projectId`):
  - `title`, `description`, `status`, `team[]`, `timelineEvents[]`, `thumbnails[]`, `color`, `finishline`, `productionStart`, `clientName`, `clientAddress`, etc.
  - GSIs: `visibility-index`, `teamUserIds-index`
- **Budgets** table (PK: `projectId`, SK: `budgetItemId`):
  - Budget header items (SK: `header#{projectId}`)
  - Budget line items (SK: `line#{budgetItemId}`)
  - GSIs: `budgetId-index`, `budgetItemId-index`
- **Tasks** table (PK: `projectId`, SK: `taskId`)
- **Events** table (PK: `projectId`, SK: `eventId`)
  - Optional GSI: `projectId-startAt-index`
- **Galleries** table (PK: `galleryId`)
  - GSI: `projectId-index`
- **ProjectDirectory** table (listing index)

**Outbound Calls:**
- S3 (`mylg-files-v12`): PutObject, GetObject, DeleteObject for project assets
- API Gateway Management API: ManageConnections for real-time broadcasts

**Local Dev:**
```bash
cd backend/projects
npm install
serverless offline
```

---

### 3. Messages Service

**Purpose:** Inbox, DM threads, project messages, notifications

**Serverless Config:** `backend/messages/serverless.yml`

**Handler:** `router.mjs`

**REST Routes:**
- `GET /messages/inbox` - Get user's inbox entries
- `GET /messages/threads` - Get DM threads
- `GET /messages` - Get messages for conversation
- `POST /messages` - Send message (via REST, prefer WebSocket)
- `PATCH /messages/{id}` - Edit message
- `DELETE /messages/{id}` - Delete message
- `GET /messages/health` - Health check
- All routes require JWT

**Data Models:**
- **Inbox** table (PK: `userId`, SK: `conversationId`):
  - Tracks conversation membership, last read timestamp, unread count
- **Messages** table (PK: `conversationId`, SK: `timestamp#messageId`):
  - DM messages, reactions, edited flag
  - GSI: `messageId-index` for single-message lookups
- **ProjectMessages** table (PK: `projectId`, SK: `timestamp#messageId`):
  - Project-scoped threaded messages
- **Notifications** table (PK: `userId`, SK: `timestamp#uuid`):
  - User notifications (project invites, mentions, etc.)
  - GSI: `userId-index`

**Local Dev:**
```bash
cd backend/messages
serverless offline
```

---

### 4. User Service

**Purpose:** User profiles, invitations, team notifications

**Serverless Config:** `backend/user/serverless.yml`

**Handler:** `router.mjs`

**REST Routes:**
- `GET|POST|PUT|PATCH|DELETE /userProfiles` - User profile CRUD
- `GET|POST|PUT|PATCH|DELETE /userProfiles/{proxy+}` - User profile operations
- `GET|POST|PUT|PATCH|DELETE /userProfilesPending/{proxy+}` - Pending profiles
- `GET|POST|PUT|PATCH|DELETE /invites/{proxy+}` - Invitation CRUD
- `POST /sendProjectInvitation` - Send project invitation
- `POST /postProjectToUserId` - Post project to user
- `GET /user/health` - Health check

**Data Models:**
- **UserProfiles** table (PK: `userId`):
  - `username`, `email`, `role`, `avatar`, etc.
- **ProjectInvitations** (or CollabInvites) table (PK: `inviteId`):
  - `senderId`, `recipientId`, `projectId`, `status`
  - GSIs: `senderId-index`, `recipientId-index`

**Local Dev:**
```bash
cd backend/user
serverless offline
```

---

### 5. WebSocket Service

**Purpose:** Real-time communication ($connect, $disconnect, $default)

**Serverless Config:** `backend/websocket/serverless.yml`

**WebSocket URL:** `wss://hhgvsv3ey7.execute-api.us-west-2.amazonaws.com/dev`

**Routes & Handlers:**
- `$connect` → `onConnect.mjs`: Validates JWT from `Sec-WebSocket-Protocol` header, stores connection in `Connections` table, broadcasts presence snapshot
- `$disconnect` → `onDisconnect.mjs`: Cleans up connection, broadcasts presence change
- `$default` → `default.mjs`: Routes all WebSocket messages by `action` field

**WebSocket Actions (in `default.mjs`):**
- `sendMessage`: Send DM or project message, broadcast to recipients
- `markRead`: Mark conversation as read
- `deleteMessage`: Delete message, broadcast update
- `editMessage`: Edit message, broadcast update
- `toggleReaction`: Add/remove emoji reaction
- `timelineUpdate`, `timelineDelete`: Broadcast timeline changes
- `setActiveConversation`: Track active conversation for unread sync
- `timelineUpdated`: Persist timeline event to DynamoDB
- `projectUpdated`: Broadcast project metadata changes
- `budgetUpdated`: Broadcast budget changes (revision-aware)
- `lineLocked`, `lineUnlocked`: Budget line locking (optimistic + broadcast)
- `setActiveRevision`: Track active budget revision per user
- `clientRevisionUpdated`: Broadcast revision changes
- `userLocation`: Track user cursor position (for collaborative features)
- `fetchNotifications`: Fetch user notifications via WebSocket
- `presenceLookup`: Query online users

**Auth Model:**
- JWT passed via `Sec-WebSocket-Protocol` header (e.g., `Sec-WebSocket-Protocol: access_token, <token>`)
- Never use query strings for tokens (security vulnerability)
- `cognitoAuthorizer` Lambda (in `auth` service) validates JWT on $connect

**Data Models:**
- **Connections** table (PK: `connectionId`):
  - `userId`, `connectedAt`, `activeConversationId`, `activeBudgetRevision`
  - GSI: `userId-sessionId-index` for user lookups

**Broadcast Flow:**
1. Client sends action via WebSocket
2. `default.mjs` parses action, performs DB operations
3. Queries `Connections` table for relevant recipients
4. Uses `ApiGatewayManagementApiClient.PostToConnectionCommand` to send to each connectionId
5. Stale connections (410 error) are auto-deleted

**Local Dev:**
```bash
cd backend/websocket
serverless offline --websocket # (requires serverless-offline-websocket plugin)
```

---

### 6. Shared Layer

**Purpose:** Lambda Layer with CORS, file URL helpers, common utilities

**Serverless Config:** `backend/shared-layer/serverless.yml`

**Exports:** ARN via CloudFormation output `SharedUtilsLayerArn`

**Modules (mounted at `/opt/nodejs/utils/`):**

#### `cors.mjs`
- **Central CORS Configuration:** All backend services import CORS headers from here
- **Environment Variables (in `serverless.common.yml`):**
  - `ALLOWED_ORIGINS`: Comma-separated exact origins (e.g., `https://beta.mylg.studio,http://localhost:5173`)
  - `CORS_WILDCARD_HOSTS`: Comma-separated base domains for subdomain wildcards (e.g., `mylg.studio`)
  - `CORS_DEFAULT_ORIGIN`: Fallback origin
  - `CORS_ALLOW_CREDENTIALS`: `"true"` or `"false"`
- **Exports:**
  - `corsHeaders(origin)`: Returns CORS header object
  - `corsHeadersFromEvent(event)`: Extracts origin from event headers
  - `preflight(origin)`: Returns 204 response for OPTIONS
  - `json(statusCode, headers, body)`: Standard JSON response helper

**To Add New Origin:**
1. Update `ALLOWED_ORIGINS` in `backend/serverless.common.yml`
2. Redeploy: `cd shared-layer && sls deploy --stage dev`
3. Redeploy dependent services: `cd ../projects && sls deploy --stage dev`

#### `files.mjs`
- **S3/CloudFront URL Helpers:**
  - `getFileUrl(key)`: Converts S3 key to full URL (uses `FILE_CDN` or S3 direct)
  - `normalizeFileUrl(urlOrKey)`: Normalizes old URLs to current bucket/CDN

**Versioning Strategy:**
- Shared layer ARN is referenced by consumers via `${cf:shared-layer-${sls:stage}.SharedUtilsLayerArn}`
- When updating shared layer, redeploy all dependent services to pick up new version

---

### 7. Create-Gallery Service (Python Lambda)

**Purpose:** Generate PDF thumbnails using PyMuPDF

**Serverless Config:** `backend/create-gallery/serverless.yml`

**Handler:** `lambda_function.py` (Python 3.9)

**REST Routes:**
- `POST /projects/galleries/process` - Create gallery from PDF

**Data Models:**
- Writes to **Galleries** table
- Uploads thumbnails to S3 (`mylg-files-v12`)

**Build & Deploy:**
- Requires Linux environment (WSL, Docker, or CI) for PyMuPDF native deps
- See `backend/create-gallery/README.md` for detailed build steps
- Quick deploy (PowerShell): `.\scripts\deploy_cli.ps1 -FunctionName mylg-v12-create-gallery-dev -Region us-west-2`

**Notes:**
- Do NOT commit `.so` files to repo (use `.gitignore`)
- Prefer CI/CD (GitHub Actions) for production builds

---

### 8. S3 & CloudFront Service

**Purpose:** File storage bucket and CDN distribution

**Serverless Config:** `backend/s3/serverless.yml`

**Resources:**
- **S3 Bucket:** `mylg-files-v12` (configurable via `S3_BUCKET_NAME`)
  - CORS rules for `GET|PUT|POST|HEAD` from allowed origins
- **CloudFront Distribution:** Fronts S3 with OAI (Origin Access Identity)
  - Response headers policy for CORS (allows `*` origins for GET, credentials disabled)
  - Caching behavior: redirect to HTTPS, compress, TTL 600s
- **Outputs:**
  - `S3BucketName`, `S3BucketArn`, `CloudFrontDomain` (exported for other stacks)

**CDN File URL Strategy:**
- Presigned URLs for private uploads (generated by backend Lambdas)
- Public assets served via CloudFront distribution
- Backend helpers (`shared-layer/files.mjs`, frontend `api.ts`) normalize URLs to current bucket/CDN

---

### 9. Calendar Service

**Purpose:** iCal feed generation for project events/tasks

**Serverless Config:** `backend/cal/serverless.yml`

**Handler:** `src/cal/icsHandler.handler` (TypeScript, esbuild)

**REST Routes:**
- `GET /cal/{projectId}/{token}.ics` - Generate iCal feed for project

**Data Models:**
- Reads **Projects**, **Events**, **Tasks** tables
- Reads **ProjectCalendarTokens** table (PK: `projectId#token`) for access control

**Environment:**
- `DEFAULT_TIMEZONE`: `America/Los_Angeles` (configurable)

**Local Dev:**
```bash
cd backend/cal
npm install
serverless offline
```

---

## Frontend Architecture

### App Shell & Routing

**Entry Point:** `src/main.tsx` → `src/app/App.tsx`

**Layout Composition:**
- `App.tsx`: Wraps with `AuthContext`, `UserProvider`, `ProjectsProvider`, `MessagesProvider`, `NotificationProvider`
- React Router v7 for navigation
- Protected routes require auth (via `useAuth()` hook)

**Routing Example:**
```tsx
/dashboard               → Dashboard (project list, global search)
/dashboard/project/:id   → Project workspace (tabs: Brief, Slides, Budget, Calendar, etc.)
/dashboard/messages      → Messages inbox & DM threads
/hq                      → Team headquarters (admin)
```

---

### Context Providers (Split for Performance)

**Core Providers (in `src/app/contexts/`):**

#### `AuthContext` (`AuthContext.tsx`, `useAuth.ts`)
- **Scope:** Root (entire app)
- **Value Shape:** `{ user, signIn(), signOut(), isAuthenticated, loading }`
- **Memoization:** `useMemo()` for value object; deps: `[user, loading]`
- **Consumers:** All protected routes, NavBar, UserProfile

#### `UserContext` (`UserProvider.tsx`, `UserContext.ts`, `useUser.ts`)
- **Scope:** Root (after auth)
- **Value Shape:** `{ userProfile, updateProfile(), loading }`
- **Data Source:** Fetches from `/userProfiles/{userId}` on mount
- **Memoization:** `useMemo()` for value; deps: `[userProfile, loading]`
- **Consumers:** Avatar, profile settings, team displays

#### `ProjectsContext` (`ProjectsProvider.tsx`, `ProjectsContext.ts`, `useProjects.ts`)
- **Scope:** Root (dashboard and below)
- **Value Shape:** `{ projects[], loadProjects(), createProject(), updateProject(), deleteProject(), loading }`
- **Data Source:** Fetches from `/projects` on mount
- **Memoization:** `useMemo()` for value; deps: `[projects, loading]`
- **Consumers:** ProjectList, ProjectCard, ProjectHeader
- **Re-render Prevention:** Use `React.memo()` on ProjectCard with `areEqual` comparator

#### `MessagesContext` (`MessagesProvider.tsx`, `MessagesContextValue.ts`, `useMessages.ts`)
- **Scope:** Root (for global unread counts)
- **Value Shape:** `{ inbox[], unreadCount, sendMessage(), markRead(), loading }`
- **Data Source:** Fetches from `/messages/inbox` on mount, syncs via WebSocket
- **Memoization:** `useMemo()` for inbox slice; deps: `[inbox, selectedConversation]`
- **Consumers:** MessagesList, InboxBadge, NotificationBell

#### `DMConversationContext` (`DMConversationContextValue.ts`, `useDMConversation.ts`)
- **Scope:** Messages feature
- **Value Shape:** `{ activeDmConversationId, setActiveDmConversationId() }`
- **Purpose:** Track active DM conversation for unread sync (sent via WebSocket `setActiveConversation`)

#### `SocketContext` (`SocketContext.ts`, `useSocket.ts`)
- **Scope:** Root (global WebSocket connection)
- **Value Shape:** `{ ws, send(), connected, reconnect() }`
- **Connection Params:** `wss://<API_GW>/dev` with `Sec-WebSocket-Protocol: access_token, <JWT>`
- **Action Router:** Listens for WebSocket messages, dispatches by `action` field to relevant contexts
- **Disconnect Semantics:** Auto-reconnect on close (exponential backoff), clean up on unmount

#### `NotificationProvider` (`NotificationProvider.tsx`, `useNotifications.ts`)
- **Scope:** Root
- **Value Shape:** `{ notifications[], markAsRead(), fetchNotifications() }`
- **Data Source:** WebSocket action `fetchNotifications` or REST `/user/notifications`

#### `BudgetProvider` (`budget/context/BudgetProvider.tsx`, `BudgetContext.ts`)
- **Scope:** Budget feature (project-level)
- **Value Shape:** `{ budgetHeader, budgetItems[], updateItem(), lockLine(), unlockLine(), activeRevision, setActiveRevision() }`
- **Memoization:** `useMemo()` for derived state (subtotals, totals); deps: `[budgetItems, taxRate]`
- **WebSocket Integration:** Subscribes to `budgetUpdated`, `lineLocked`, `lineUnlocked` actions
- **Optimistic UI:** Lock/unlock line items immediately, revert on conflict

**Memoization Rules:**
- Always wrap context value objects in `useMemo()` with explicit deps
- Use `React.memo()` for list items (ProjectCard, MessageItem, BudgetRow)
- Avoid passing inline functions as props (use `useCallback()`)
- Context boundaries: Split contexts by feature area to limit re-render scope

---

### API Layer

#### `apiFetch` (in `shared/utils/api.ts`)

**Purpose:** Centralized HTTP client with retry, CORS, auth, and error handling

**Signature:**
```typescript
async function apiFetch<T>(
  url: string,
  options?: ApiFetchOptions
): Promise<T>
```

**Features:**
- **Auth:** Auto-injects `Authorization: Bearer <JWT>` from Amplify session
- **CORS:** Handles preflight, retries on CORS errors
- **Retry Logic:** Exponential backoff for 5xx errors (default 3 retries, 1s delay)
- **Rate Limiting:** Client-side rate limiter (100 req/min per endpoint)
- **CSRF Protection:** Adds CSRF token for mutating requests (if enabled)
- **Error Logging:** Logs to console, optionally calls `onNetworkError` callback

**Example:**
```typescript
const projects = await apiFetch<Project[]>(API_ENDPOINTS.PROJECTS_URL);
```

#### Endpoint Constants (in `api.ts`)

**Base Endpoints (dev stage):**
```typescript
const BASE_ENDPOINTS = {
  development: {
    AUTH_SERVICE_URL: 'https://ictxcba2wf.execute-api.us-west-2.amazonaws.com',
    PROJECTS_SERVICE_URL: 'https://bevnkraeqa.execute-api.us-west-2.amazonaws.com',
    USER_SERVICE_URL: 'https://gy8dq7w0a3.execute-api.us-west-2.amazonaws.com',
    MESSAGES_SERVICE_URL: 'https://uzcx04lrr9.execute-api.us-west-2.amazonaws.com',
    WEBSOCKET_URL: 'wss://hhgvsv3ey7.execute-api.us-west-2.amazonaws.com/dev',
    PROJECTS_URL: 'https://bevnkraeqa.execute-api.us-west-2.amazonaws.com/projects',
    BUDGETS_API_URL: 'https://bevnkraeqa.execute-api.us-west-2.amazonaws.com/budgets',
    // ... etc.
  }
};
```

**Override via Env Vars:**
- Prefix with `VITE_` in `.env` (e.g., `VITE_PROJECTS_URL`)
- Loaded via `import.meta.env` at build time

---

### WebSocket Client

**Connection Setup (in `SocketContext`):**
```typescript
const ws = new WebSocket(WEBSOCKET_URL, [
  'access_token',
  jwtToken // from Amplify session
]);
```

**Action Router Pattern:**
```typescript
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  switch (message.action) {
    case 'messageReceived':
      messagesContext.addMessage(message);
      break;
    case 'budgetUpdated':
      budgetContext.applyUpdate(message);
      break;
    case 'presenceChanged':
      presenceContext.updateStatus(message.userId, message.online);
      break;
    // ... etc.
  }
};
```

**Presence/Message Handling:**
- `presenceChanged`: Update user online status in context
- `messageReceived`: Optimistically add to local messages, dedupe by messageId
- `budgetUpdated`: Merge server state with local state, resolve conflicts by revision number

**Connect/Disconnect Rules:**
- Connect on auth success, reconnect on disconnect (exponential backoff, max 5 attempts)
- Send `setActiveConversation` action when user opens a DM thread (for unread sync)
- Send `setActiveRevision` action when user selects a budget revision (for collaborative locking)
- Clean up listeners on unmount to prevent memory leaks

---

### Realtime Editor (Lexical + Yjs + Fabric.js)

**Components (in `dashboard/project/features/editor/components/Brief/`):**

#### Yjs Collaboration
- **Room Format:** `project-{projectId}` (e.g., `project-abc123`)
- **Provider:** `WebsocketProvider` from `y-websocket` package
  - URL: `YJS_WS_URL` from `config/realtime.ts` (default: `ws://35.165.113.63:1234`)
  - Proxy path: `/yjs` in dev (Vite proxy, see `vite.config.ts`)
- **Provider Caching:** Single provider instance per room (stored in module-level Map)
  - **Disconnect Semantics:** Do NOT destroy provider on component unmount (to preserve connection for other users)
  - Only disconnect when last user leaves project (tracked by ref count)
- **Persistence Pipeline:**
  1. Yjs doc updates (in-memory CRDT)
  2. `y-indexeddb` persists to IndexedDB (offline support)
  3. Debounced save to DynamoDB (backend `POST /projects/{id}` with `briefContent` field)
  4. Thumbnail generation: On save, render Lexical state to canvas, upload to S3 as `project-thumbnails/{projectId}/thumbnail.png`

#### Lexical Integration (`LexicalEditor.tsx`)
- **Plugins:**
  - `YjsSyncPlugin.tsx`: Syncs Lexical editor state with Yjs doc (`doc.share.get('lexical')`)
  - `ImageLockPlugin.tsx`: Collaborative image locking (prevents concurrent edits)
  - `SpeechProvider.tsx`: Voice input (experimental)
- **Content Hydration:**
  1. On mount, check IndexedDB for cached state
  2. If cache miss, fetch `briefContent` from DynamoDB via `/projects/{id}`
  3. Parse JSON to Lexical editor state, apply to editor
  4. Yjs provider connects and merges remote changes (CRDT conflict-free)

#### Fabric.js Canvas (`SlideCanvas.tsx`)
- **Purpose:** Slide design tool (add images, shapes, text)
- **Persistence:** Canvas state saved as JSON to DynamoDB (`slides` field in Projects table)
- **Collaboration:** One-way sync (last-write-wins, no CRDT yet)

#### Autosave/Thumbnail Pipeline
- **Trigger:** Debounced editor update (5s after last change)
- **Flow:**
  1. Serialize Lexical state to JSON
  2. POST to `/projects/{id}` with `briefContent` field
  3. Backend Lambda updates DynamoDB
  4. Generate thumbnail: Render first paragraph to canvas, upload to S3
  5. Update `thumbnails[]` array in Projects table
- **Thumbnail URL:** `https://{CDN}/project-thumbnails/{projectId}/thumbnail.png`

**Performance Notes:**
- Yjs provider connection is heavyweight (WebSocket + CRDT overhead)
- Cache provider instance per room (module-level Map, keyed by roomName)
- Use `React.memo()` on editor plugins to prevent re-mounts
- Throttle Yjs updates to avoid excessive re-renders (100ms debounce)

---

### Feature Modules

#### Global Search (`dashboard/features/GlobalSearch`)
- **Purpose:** Unified search across projects and messages
- **Implementation:** Client-side fuzzy search (Fuse.js or manual filter)
- **Keyboard Nav:** Arrow keys to navigate results, Enter to select, Escape to close
- **Data Source:** Searches `projects[]` and `inbox[]` from contexts

#### Messages (`dashboard/features/messages/Messages.tsx`)
- **Inbox:** List of DM conversations with unread badges
- **Thread View:** Scrollable message list, input bar, file uploads
- **Optimistic UI:** Add message immediately to local state, replace with server version on ack
- **File Uploads:** `aws-amplify/storage` → S3 path: `chat_uploads/{sanitizedConversationId}/{fileName}`
- **Reactions:** Toggle emoji via WebSocket `toggleReaction` action

#### Budget (`dashboard/project/features/budget`)
- **State Machine:**
  1. Fetch budget header + items from `/budgets/{projectId}`
  2. Subscribe to WebSocket `budgetUpdated`, `lineLocked`, `lineUnlocked` actions
  3. Apply updates, merge conflicts by revision number
- **Line Locking:**
  - When user focuses input, send `lineLocked` action
  - When user blurs input, send `lineUnlocked` action
  - If another user has lock, show read-only UI with lock icon
- **Revision Tracking:** `activeRevision` state per user (sent via `setActiveRevision` action)
- **CSV Export:** `exceljs` library generates Excel file from budget items

#### Calendar (`dashboard/project/features/calendar`)
- **Integration:** React-Calendar component + custom event overlay
- **Data Source:** `timelineEvents[]` from ProjectsContext
- **iCal Feed:** `GET /cal/{projectId}/{token}.ics` for external calendar apps

#### Gallery (`dashboard/project/features/gallery`)
- **Upload:** PDF upload → `create-gallery` Lambda → S3 thumbnails
- **Display:** Grid of thumbnail images, lightbox on click

#### Slides (in `editor/components/Slides`)
- **Canvas:** Fabric.js for drag-drop design
- **Persistence:** Serialize to JSON, save to `slides` field in Projects table
- **Collaboration:** Last-write-wins (no CRDT yet)

---

## Identifier & Naming Conventions

### DM Conversation IDs
**Format:** `dm#{userId1}___{userId2}` (sorted alphabetically)

**Helpers (in `shared/utils/websocketUtils.ts`):**
```typescript
// Normalize DM conversation ID (sorts user IDs)
function normalizeDMConversationId(conversationId: string): string {
  if (!conversationId.startsWith('dm#')) return conversationId;
  const userIds = conversationId.replace('dm#', '').split('___');
  if (userIds.length !== 2) return conversationId;
  return `dm#${userIds.sort().join('___')}`;
}
```

**Example:**
- User A: `user123`, User B: `user456`
- Canonical ID: `dm#user123___user456` (always sorted, so both users use same ID)

### Project IDs
**Format:** UUID v4 (e.g., `abc12345-6789-...`)

### Budget Item IDs
**Format:** `line#{uuid}` (for line items), `header#{projectId}` (for header)

### File Keys (S3)
- **Project Thumbnails:** `public/project-thumbnails/{projectId}/thumbnail.png`
- **Chat Uploads:** `chat_uploads/{sanitizedConversationId}/{fileName}` (sanitize: replace `#` with `_`)
- **Gallery Thumbnails:** `galleries/{galleryId}/page-{n}.png`

### WebSocket Action Names
**Naming Convention:** camelCase verbs (e.g., `sendMessage`, `budgetUpdated`, `lineLocked`)

**Common Actions:**
- `sendMessage`, `markRead`, `deleteMessage`, `editMessage`, `toggleReaction`
- `timelineUpdate`, `timelineUpdated`, `projectUpdated`, `budgetUpdated`
- `lineLocked`, `lineUnlocked`, `setActiveRevision`, `clientRevisionUpdated`
- `userLocation`, `presenceChanged`, `presenceLookup`

---

## Security & Compliance

### JWT Handling
**Rules:**
- **Never pass JWT in query strings** (logged in server logs, browser history)
- **Use headers for REST APIs:** `Authorization: Bearer <token>`
- **Use `Sec-WebSocket-Protocol` for WebSocket:** `Sec-WebSocket-Protocol: access_token, <token>`
- **Token Refresh:** Use `/auth/refresh-token` before token expiry (Cognito access tokens expire in 1 hour)

### Signed URLs
- **Presigned S3 URLs:** Generated by backend Lambdas for private uploads (e.g., project files)
- **Expiry:** 15 minutes (configurable)
- **Example:** `GET /projects/{projectId}/files/{fileKey}/presign` → returns `{ url, expiresAt }`

### Least-Privilege IAM
- Each Lambda function has minimal IAM permissions (DynamoDB tables, S3 paths, API Gateway execution)
- No wildcard `*` permissions in production
- Use scoped ARNs (e.g., `arn:aws:dynamodb:us-west-2:123456789012:table/Projects`)

### CORS Policy
- **Single Source of Truth:** `backend/serverless.common.yml` (`ALLOWED_ORIGINS`)
- **Dynamic Origin Handling:** Shared layer CORS helper checks origin against whitelist, supports subdomains
- **Wildcard Hosts:** `CORS_WILDCARD_HOSTS` allows `*.mylg.studio` (any subdomain)
- **Credentials:** `CORS_ALLOW_CREDENTIALS=false` by default (safer for public APIs)

---

## Performance Guardrails

### Render Budget
- **Target:** <50ms TTI (Time to Interactive) for project list, <100ms for project workspace
- **Tools:** React DevTools Profiler, Lighthouse
- **Metrics:** Lighthouse Performance score >90

### Context Boundaries
- **Rule:** Split contexts by feature area (e.g., BudgetProvider only for budget feature)
- **Anti-pattern:** Global context with all app state (causes full-tree re-renders)
- **Solution:** Use React.memo() + context selectors (custom hooks that subscribe to slices)

### useMemo/useCallback Deps Policies
- **Always specify deps:** Never use empty `[]` unless truly static
- **Audit deps:** Use ESLint plugin `react-hooks/exhaustive-deps`
- **Avoid inline objects/arrays:** Extract to constants or useMemo()

### Request Batching/Debouncing
- **Debounce:** Text input (300ms), editor updates (5s)
- **Batch:** Fetch multiple projects in single request (use `?ids=a,b,c`)
- **Rate Limit:** apiFetch client-side rate limiter (100 req/min)

### WebSocket Message Throttling
- **Throttle:** High-frequency events (cursor position, scroll) to 100ms
- **Batch:** Send multiple updates in single WebSocket message (array of actions)

---

## Development Workflows

### Frontend

**Dev Server:**
```bash
cd frontend
npm run dev   # Vite on :5173, HMR on LAN IP 192.168.1.200
```

**Build:**
```bash
npm run build      # Production build → dist/
npm run preview    # Preview prod build locally
```

**Test:**
```bash
npm run test           # Vitest (unit tests)
npm run test:watch     # Watch mode
npm run test:ui        # Vitest UI
```

**Typecheck:**
```bash
npm run typecheck  # TypeScript compiler check (no emit)
```

**Lint:**
```bash
npm run lint  # ESLint (rules in eslint.config.js)
```

**Environment Variables:**
- Create `.env.local` (gitignored) for local overrides
- Prefix with `VITE_` (e.g., `VITE_API_BASE_URL`)
- Access via `import.meta.env.VITE_*`

---

### Backend

**Per-Service Dev:**
```bash
cd backend/<service>
npm install
serverless offline  # Local Lambda emulator on :3000
```

**Deploy:**
```bash
# Orchestrated (all services):
cd backend
npm run deploy:dev

# Per-service:
cd backend/<service>
sls deploy --stage dev
```

**Logs:**
```bash
cd backend/<service>
sls logs -f <functionName> --stage dev --tail
```

**Invoke:**
```bash
sls invoke -f <functionName> --stage dev --data '{"key":"value"}'
```

**Remove:**
```bash
cd backend
npm run remove:dev  # Removes all stacks
# or per-service:
cd backend/<service>
sls remove --stage dev
```

---

### Testing Conventions

#### Frontend Tests (Vitest)
**Config:** `vitest.config.ts`
- **Environment:** jsdom
- **Setup:** `src/test/setup.ts` (imports `@testing-library/jest-dom`)
- **Mocks:** `src/test/__mocks__/` (e.g., `recharts.ts` for chart library)

**Example Test:**
```typescript
// src/shared/utils/api.test.ts
import { describe, it, expect, vi } from 'vitest';
import { apiFetch } from './api';

describe('apiFetch', () => {
  it('should fetch data and parse JSON', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 1 }) } as Response)
    );
    const result = await apiFetch('/test');
    expect(result).toEqual({ id: 1 });
  });
});
```

**Run Tests:**
```bash
npm run test          # All tests
npm run test:watch    # Watch mode
npm run test:ui       # UI mode
```

---

#### Backend Tests (Node + tsx)
**Location:** `backend/tests/`

**Example Test:**
```typescript
// backend/tests/cal/ics.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('ICS Generation', () => {
  it('should generate valid iCal feed', () => {
    const ics = generateICS({ title: 'Event', startAt: '2025-01-01T00:00:00Z' });
    assert.ok(ics.includes('BEGIN:VCALENDAR'));
  });
});
```

**Run Tests:**
```bash
cd backend
npm test  # Runs tests via tsx
```

---

### E2E/Smoke Tests

**Frontend Smoke Scripts (in `frontend/scripts/`):**
- `smoke-presign.mjs`: Tests S3 presigned URL generation
- `e2e-presign-upload.mjs`: E2E test for file upload flow

**Backend Smoke:**
- Health checks on all services: `GET /projects/health`, `GET /messages/health`, etc.

---

### Python Lambda Build (create-gallery)

**Prerequisites:**
- WSL, Docker, or Linux CI runner
- Python 3.9

**Build Steps:**
```bash
cd backend/create-gallery
python3.9 -m venv venv
source venv/bin/activate
pip install --target=python -r requirements.txt
```

**Package:**
```bash
# WSL:
zip -r .serverless/createGalleryFunction.zip lambda_function.py requirements.txt python/

# PowerShell:
Remove-Item -Force .serverless\createGalleryFunction.zip -ErrorAction SilentlyContinue
Compress-Archive -Path lambda_function.py, requirements.txt, python\* -DestinationPath .serverless\createGalleryFunction.zip -Force
```

**Deploy:**
```bash
# Quick (code-only update):
.\scripts\deploy_cli.ps1 -FunctionName mylg-v12-create-gallery-dev -Region us-west-2

# Full stack:
cd backend/create-gallery
sls deploy --stage dev
```

---

## Cross-Cutting Concerns

### CORS
- **Central Config:** `backend/serverless.common.yml` (`ALLOWED_ORIGINS`)
- **Single Source:** `shared-layer/nodejs/utils/cors.mjs`
- **To Add Origin:** Update `ALLOWED_ORIGINS`, redeploy shared-layer + services

### Error Handling
- **Backend:** Lambdas return `{ statusCode, headers, body }` with CORS headers on all responses (including errors)
- **Frontend:** `apiFetch` throws on non-2xx, consumers catch and display toast notifications

### Retry/Debouncing
- **API Retries:** `apiFetch` retries 5xx errors (3 attempts, exponential backoff)
- **Debouncing:** Text inputs (300ms), editor autosave (5s), WebSocket cursor updates (100ms)

### Performance/Memoization Rules
- **Context Value:** Always wrap in `useMemo()` with explicit deps
- **List Items:** Use `React.memo()` with `areEqual` comparator
- **Callbacks:** Use `useCallback()` for functions passed as props
- **Avoid Inline:** Extract constants, objects, arrays outside component or into useMemo()

---

## Deployment Order & Dependencies

**Critical Path:**
1. **shared-layer** (exports ARN)
2. **s3** (optional, provisions S3 + CloudFront)
3. All other services in any order (auth, projects, messages, user, websocket, create-gallery, cal)

**Inter-Service Dependencies:**
- All services (except shared-layer, s3) depend on shared-layer ARN
- websocket service references `cognitoAuthorizer` Lambda ARN from auth service (for $connect route)
- projects service may call websocket API for real-time broadcasts (uses Management API, not direct Lambda invoke)

**Deployment Commands:**
```bash
# Manual orchestrated deploy (recommended):
cd backend/shared-layer && sls deploy --stage dev
cd ../s3 && sls deploy --stage dev
cd ../auth && sls deploy --stage dev
cd ../projects && sls deploy --stage dev
cd ../messages && sls deploy --stage dev
cd ../user && sls deploy --stage dev
cd ../websocket && sls deploy --stage dev
cd ../create-gallery && sls deploy --stage dev
cd ../cal && sls deploy --stage dev
```

**Remove Stacks:**
```bash
# Reverse order:
cd backend/cal && sls remove --stage dev
cd ../create-gallery && sls remove --stage dev
cd ../websocket && sls remove --stage dev
cd ../user && sls remove --stage dev
cd ../messages && sls remove --stage dev
cd ../projects && sls remove --stage dev
cd ../auth && sls remove --stage dev
cd ../s3 && sls remove --stage dev
cd ../shared-layer && sls remove --stage dev
```

---

## CI/CD

**GitHub Actions:** `.github/workflows/build-create-gallery.yml`
- Builds Python Lambda for create-gallery service
- Uploads artifact to S3 or Lambda

**Future:** Add workflows for frontend build, backend deploy, E2E tests

---

## Additional Documentation

- **Backend README:** `backend/README.md` (service overview, endpoints)
- **Frontend README:** `frontend/README.md` (app overview, features)
- **Lexical Editor Docs:** `frontend/LEXICAL_EDITOR_*.md` (architecture, diagrams, recommendations)
- **Budget WebSocket:** `frontend/docs/BUDGET_WEBSOCKET_SUMMARY.md`
- **Global Search:** `frontend/GLOBAL_SEARCH.md`
- **Design System:** `frontend/docs/DESIGN_SYSTEM_CHECKLIST.md`
- **ADRs:** `docs/adrs/ADR-*.md` (architectural decision records)

---

## Glossary

- **CRDT:** Conflict-free Replicated Data Type (Yjs)
- **GSI:** Global Secondary Index (DynamoDB)
- **JWT:** JSON Web Token (Cognito access token)
- **OAI:** Origin Access Identity (CloudFront → S3)
- **Presigned URL:** Time-limited S3 URL for private uploads
- **SK:** Sort Key (DynamoDB)
- **PK:** Partition Key (DynamoDB)
- **TTI:** Time to Interactive (performance metric)
- **HMR:** Hot Module Replacement (Vite dev server)

---

## Common Tasks

### Add a New Backend Endpoint
1. Edit `backend/<service>/router.mjs` (or create new handler)
2. Add route to `serverless.yml` (`functions.<name>.events.httpApi`)
3. Update IAM permissions if needed
4. Deploy: `sls deploy --stage dev`
5. Update frontend `API_ENDPOINTS` in `src/shared/utils/api.ts`

### Add a New WebSocket Action
1. Edit `backend/websocket/default.mjs`
2. Add case to switch statement in `handler()` function
3. Implement handler function (e.g., `handleNewAction()`)
4. Broadcast to connections via `PostToConnectionCommand`
5. Update frontend `SocketContext` to handle new action in `ws.onmessage`

### Add a New Context Provider
1. Create `src/app/contexts/<Name>Provider.tsx` and `<Name>Context.ts`
2. Define context value interface in `<Name>ContextValue.ts`
3. Wrap app in provider (in `App.tsx`)
4. Export custom hook `use<Name>()` from `use<Name>.ts`
5. Memoize value object in provider: `useMemo(() => ({ ... }), [deps])`

### Extend CORS Origins
1. Edit `backend/serverless.common.yml` → `ALLOWED_ORIGINS`
2. Redeploy shared-layer: `cd backend/shared-layer && sls deploy --stage dev`
3. Redeploy dependent services: `cd ../projects && sls deploy --stage dev`

### Update DynamoDB Schema
1. Edit table definition in `serverless.yml` (or use AWS console/CLI)
2. Deploy stack: `sls deploy --stage dev`
3. Migrate data if needed (write migration script in `backend/scripts/`)
4. Update frontend types in `src/shared/utils/api.ts`

### Debug WebSocket Connection Issues
1. Check JWT in browser DevTools → Network → WS → Headers → `Sec-WebSocket-Protocol`
2. Verify token is valid (not expired) using jwt.io
3. Check Lambda logs: `sls logs -f onConnect --stage dev --tail`
4. Common issues:
   - Missing `Sec-WebSocket-Protocol` header (401)
   - Expired JWT (403)
   - Missing `cognitoAuthorizer` Lambda (500)
   - CORS error on initial handshake (check origin)

---

## Migration Notes

### v1.1 → v1.2
- Consolidated services into domain-based routers (auth, projects, messages, user, websocket)
- Migrated from API Gateway v1 (REST) to v2 (HTTP API) for lower latency
- Introduced shared-layer for CORS consistency
- Split frontend contexts for performance (ProjectsProvider, MessagesProvider, etc.)

### v1.2 → v1.3 (Current)
- Added Yjs collaborative editing (Lexical + WebsocketProvider)
- Moved create-gallery to standalone Python Lambda service
- Added Budget line locking and revision tracking
- Improved WebSocket action router (revision-aware updates)
- Enhanced file URL helpers (CloudFront support)

---

## Troubleshooting

### "CORS Error" in Browser Console
1. Check `ALLOWED_ORIGINS` in `backend/serverless.common.yml`
2. Verify shared-layer deployed: `aws cloudformation describe-stacks --stack-name shared-layer-dev`
3. Redeploy shared-layer + affected service
4. Clear browser cache, hard refresh

### "401 Unauthorized" on API Request
1. Check JWT in `Authorization` header (DevTools → Network → Headers)
2. Verify token not expired (jwt.io)
3. Check Cognito issuer URL matches in `serverless.yml` (`jwtAuthorizer.issuerUrl`)
4. Ensure user has required role/group (use `/auth/update-roles` if needed)

### "WebSocket Connection Failed"
1. Check `Sec-WebSocket-Protocol` header in DevTools
2. Verify WebSocket URL correct (`wss://...`)
3. Check `cognitoAuthorizer` Lambda logs for auth errors
4. Ensure `onConnect` Lambda has permissions to read `Connections` table

### "Yjs Not Syncing"
1. Check Yjs server running: `curl ws://35.165.113.63:1234`
2. Verify `YJS_WS_URL` in `config/realtime.ts`
3. Check provider connection: `provider.wsconnected` in browser console
4. Ensure room name matches: `project-{projectId}`

### "Budget Conflicts Not Resolving"
1. Check `activeRevision` in BudgetProvider state
2. Verify `setActiveRevision` action sent on mount
3. Check WebSocket logs for `budgetUpdated` action with revision number
4. Ensure local state merged by revision (higher revision wins)

---

## Performance Optimization Checklist

- [ ] Use `React.memo()` for list items (ProjectCard, MessageItem, BudgetRow)
- [ ] Wrap context values in `useMemo()` with explicit deps
- [ ] Use `useCallback()` for functions passed as props
- [ ] Debounce text inputs (300ms) and editor updates (5s)
- [ ] Batch API requests (fetch multiple resources in single call)
- [ ] Enable code splitting (Vite `manualChunks`)
- [ ] Lazy load routes (`React.lazy()` + `Suspense`)
- [ ] Optimize images (WebP, lazy loading, responsive sizes)
- [ ] Enable Gzip/Brotli compression (CloudFront)
- [ ] Use CDN for static assets (CloudFront)
- [ ] Preload critical resources (`<link rel="preload">`)
- [ ] Minimize bundle size (audit with `npm run build` + Rollup Visualizer)
- [ ] Profile with React DevTools Profiler (identify expensive re-renders)
- [ ] Run Lighthouse audits (target >90 Performance score)

---

## Security Checklist

- [ ] Never pass JWT in query strings
- [ ] Use `Sec-WebSocket-Protocol` for WebSocket auth
- [ ] Enable CORS only for trusted origins
- [ ] Set `CORS_ALLOW_CREDENTIALS=false` unless needed
- [ ] Use presigned URLs for private S3 uploads (15-min expiry)
- [ ] Validate all user inputs on backend (sanitize SQL/NoSQL injection)
- [ ] Rate limit API endpoints (100 req/min client-side, API Gateway throttling)
- [ ] Audit IAM permissions (least-privilege principle)
- [ ] Enable AWS CloudTrail for audit logs
- [ ] Use HTTPS for all external connections (enforce in CSP)
- [ ] Set CSP headers (see `vite.config.ts`)
- [ ] Enable XSS protection (`X-Content-Type-Options: nosniff`)
- [ ] Use CSRF tokens for mutating requests (if cookie-based auth)
- [ ] Rotate Cognito client secrets regularly (or use client credentials flow)
- [ ] Monitor for security vulnerabilities (npm audit, Dependabot)

---

## Final Notes

This document is the **single source of truth** for MYLG architecture and development workflows. When adding new features or making changes:

1. **Update this document first** (before coding)
2. **Reference this document in PRs** (link to relevant sections)
3. **Keep this document in sync** with code changes (treat as living documentation)
4. **Review quarterly** for accuracy and completeness

For questions or clarifications, consult the team lead or post in the #engineering Slack channel.
