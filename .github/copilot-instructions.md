# MYLG! App - Copilot Instructions

## Project Overview
MYLG! (Making You Look Good) is a collaborative project management platform for designers, builders, and clients. Full-stack serverless architecture with React/TypeScript frontend and AWS Lambda backend.

## Critical Architecture Patterns

### 1. Serverless Multi-Service Backend
**Location**: `backend/`  
**Pattern**: Each domain is an isolated Serverless Framework service

```
shared-layer/     → Lambda Layer with CORS helpers (deployed FIRST)
auth/            → Cognito triggers, JWT authorizer
projects/        → Projects domain (router pattern)
messages/        → Messaging domain
user/            → User profiles, invitations
websocket/       → Real-time communication ($connect, $disconnect, $default)
```

**Deployment order matters**: Always deploy `shared-layer` first, then other services can reference its exported ARN.

**Deploy commands**:
```bash
cd backend
npm run deploy:dev    # Orchestrates all services in correct order
```

**Per-service iteration**:
```bash
cd backend/projects
serverless deploy --stage dev
```

### 2. Centralized CORS Configuration (ADR-003)
**Critical**: CORS is managed centrally in `backend/serverless.common.yml` and consumed via shared layer

**To add new origin**:
1. Edit `ALLOWED_ORIGINS` in `backend/serverless.common.yml`
2. Redeploy: `cd backend/shared-layer && serverless deploy --stage dev`
3. Redeploy consuming services that need the update

**Helper location**: `/opt/nodejs/utils/cors.mjs` in Lambda Layer

### 3. Context Architecture - Split Providers (Performance Critical)
**Location**: `frontend/src/app/contexts/`

**Pattern**: DataProvider is now split into three providers to prevent performance issues:
- `UserProvider` → User data, authentication state
- `ProjectsProvider` → Projects list, active project, timeline events
- `MessagesProvider` → Inbox, project messages, DM threads

**Usage**:
```typescript
import { useUser } from '@/app/contexts/useUser';
import { useProjects } from '@/app/contexts/useProjects';
import { useMessages } from '@/app/contexts/useMessages';
// Or combined:
import { useData } from '@/app/contexts/useData';  // Returns merged value
```

**Critical**: Always wrap context values in `useMemo` with complete dependency arrays to prevent re-render cascades.

### 4. Real-time Collaboration with Yjs
**Location**: `frontend/src/dashboard/project/features/slides/`

**Pattern**: Each collaborative entity gets its own Yjs room
- Slide rooms: `slide-{slideId}`
- Editor rooms: Managed per-document
- IndexedDB persistence + DynamoDB permanent storage
- Auto-connect/disconnect on entity switch

**Key files**:
- `lib/yjs.ts` → Connection manager with provider caching
- `hooks/useSlideProvider.ts` → Per-entity Yjs hook pattern

### 5. WebSocket Authentication (Security Critical)
**Location**: `backend/websocket/onConnect.mjs`, `frontend/src/shared/utils/secureWebSocketAuth.ts`

**Pattern**: JWT passed via `Sec-WebSocket-Protocol` header
```typescript
// Frontend sends: [jwtToken, sessionId] as subprotocols
new WebSocket(url, [jwtToken, sessionId]);

// Backend validates JWT in onConnect before allowing connection
```

**Never** put JWTs in query strings - always use subprotocol method.

### 6. API Endpoint Management
**Location**: `frontend/src/shared/utils/api.ts`

**Pattern**: Centralized endpoint definitions with environment-specific logic
```typescript
const API_ENDPOINTS = {
  PROJECTS_BASE_URL: 'https://bevnkraeqa.execute-api.us-west-2.amazonaws.com',
  // ... more endpoints
};
```

**Helper functions**:
- `apiFetch()` → Unified API calls with auth, CORS, retry logic
- `fetchProjectsFromApi()` → Domain-specific fetch with error handling

### 7. DM Conversation ID Format (ADR-002)
**Pattern**: Deterministic conversation IDs for direct messages

```typescript
// Format: dm#<lowerUserId>___<higherUserId>
// Three underscores separate sorted user IDs
const conversationId = buildDmConversationId(userA, userB);
```

**Location**: `frontend/src/shared/utils/websocketUtils.ts`  
**Why**: Prevents duplicate DM threads, enables client-side ID generation

### 8. File URL Strategy (ADR-001)
**Pattern**: Single CloudFront CDN for all files

```
Public:    https://cdn.mylg.app/public/{tenantId}/{entity}/{key}
Secure:    https://cdn.mylg.app/secure/{tenantId}/{entity}/{key} (signed)
```

**Backend helpers**: `backend/shared-layer/nodejs/utils/files.mjs`
- `getFileUrl(key)` → CDN-first, falls back to S3
- `normalizeFileUrl(urlOrKey)` → Handles migration from old URLs

## Development Workflows

### Frontend Development
```bash
cd frontend
npm run dev          # Vite dev server on :5173
npm run test         # Vitest unit tests
npm run test:watch   # Watch mode
npm run build        # Production build
npm run typecheck    # TypeScript validation
```

**Test configuration**: `frontend/vitest.config.ts` uses jsdom environment with custom setup file

### Backend Development
```bash
cd backend/projects  # or any service
serverless offline   # Local API Gateway
```

**Testing backend changes**: Use smoke test scripts in `frontend/scripts/` for E2E validation

### Python Lambda (create-gallery)
**Critical**: Requires Linux-native build for PyMuPDF

**Build** (WSL/Docker required):
```bash
cd backend/create-gallery
# WSL:
python3.9 -m venv venv && source venv/bin/activate
pip install --target=python -r requirements.txt

# Or use helper:
./scripts/deploy.sh  # Builds in Docker, deploys, smoke tests
```

## Code Conventions

### Feature Structure Pattern
**Example**: `frontend/src/dashboard/project/features/slides/`
```
SlidesPage.tsx              # Main container
components/                 # UI components
  SlideEditor.tsx
  SlidesSidebar.tsx
  SlideToolbar.tsx
hooks/                      # Custom hooks
  useSlidePersistence.ts
  useSlideProvider.ts
lib/                        # Utilities
  yjs.ts
  thumbnails.ts
  featureFlags.ts
index.ts                    # Clean exports
README.md                   # Feature documentation
{feature}.test.tsx          # Tests co-located
```

### Budget Feature Pattern
**Location**: `frontend/src/dashboard/project/features/budget/`

**Context pattern**:
```typescript
// Each feature gets its own provider/context
export const BudgetProvider: React.FC<ProviderProps> = ({ projectId, children }) => {
  // Feature-specific state
  // WebSocket integration via useSocket()
  // Expose via context
};
```

**Hook usage**:
```typescript
const { budgetHeader, budgetItems, refresh } = useBudget();
```

### WebSocket Message Handling
**Location**: `frontend/src/app/contexts/SocketProvider.tsx`

**Pattern**: Action-based message routing
```typescript
socket.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  switch (msg.action) {
    case 'message':
      // Handle message
    case 'presence':
      // Handle presence
    // ...
  }
};
```

**Backend**: `backend/websocket/default.mjs` handles all WebSocket actions

## Testing Strategy

### Frontend Tests
**Location**: Co-located with source files (`.test.tsx`)

**Patterns**:
- Mock contexts at module level using `vi.hoisted()`
- Use Testing Library queries (`screen.getByRole`, etc.)
- Async state changes require `waitFor()`
- Always cleanup with `vi.useRealTimers()` in `afterEach`

**Example**: `frontend/src/app/contexts/DataProvider.test.tsx`

### Feature Flags
**Location**: `frontend/src/dashboard/project/features/slides/lib/featureFlags.ts`

**Pattern**: localStorage-based toggles for experimental features
```typescript
export const isSlidesMode = () => localStorage.getItem('slidesMode') === 'true';
export const enableSlidesMode = () => localStorage.setItem('slidesMode', 'true');
```

## Critical Files Reference

### Configuration
- `backend/serverless.common.yml` → All service env vars, DynamoDB tables, CORS
- `frontend/src/shared/utils/api.ts` → All API endpoints
- `frontend/vite.config.ts` → Build config, CSP headers

### Architecture Documentation
- `SLIDES_ARCHITECTURE.txt` → Multi-slide editor architecture
- `SLIDES_IMPLEMENTATION.md` → Slides feature implementation guide
- `docs/adrs/` → Architecture Decision Records (ADR-001, ADR-002, ADR-003)

### Core Utilities
- `backend/shared-layer/nodejs/utils/cors.mjs` → CORS resolution logic
- `frontend/src/shared/utils/secureWebSocketAuth.ts` → WebSocket auth
- `frontend/src/shared/utils/websocketUtils.ts` → DM conversation IDs
- `frontend/src/shared/utils/requestQueue.ts` → Debounced API updates

## Common Pitfalls

1. **CORS issues**: Don't add CORS headers per-service. Always edit `serverless.common.yml` and redeploy shared-layer first.

2. **Context re-renders**: Large context providers cause performance issues. Always memoize values and split by domain.

3. **WebSocket JWT in URL**: Never expose JWT in query strings. Use `Sec-WebSocket-Protocol` header.

4. **Python Lambda deployment**: Must build on Linux (WSL/Docker) for native dependencies like PyMuPDF.

5. **Yjs room cleanup**: Always disconnect from Yjs rooms when switching entities to prevent memory leaks.

6. **DM conversation IDs**: Use `buildDmConversationId()` - never construct manually or you'll create duplicate threads.

7. **Project hydration**: Some project fields (slides, customFolders) need detail fetch. Check `projectNeedsDetailHydration()` pattern in `ProjectsProvider.tsx`.

## Getting Help

- ADRs in `docs/adrs/` explain major architectural decisions
- Feature-specific READMEs in `frontend/src/dashboard/project/features/{feature}/README.md`
- Backend service docs in individual `backend/{service}/README.md`
- Migration scripts in `backend/scripts/` show data model evolution patterns
