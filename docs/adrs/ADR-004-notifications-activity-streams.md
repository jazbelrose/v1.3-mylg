# ADR-004: Notifications & Activity Streams

**Status:** Proposed  
**Date:** 2026-01-02  
**Authors:** MYLG Team  
**Deciders:** Engineering

---

## Context

The current notification system emits events too broadly—autosave ticks, Yjs sync updates, presence changes, and editor open/close all generate notifications that flood users. This creates "phantom" notifications (nothing meaningful happened) and buries truly important events.

## Decision

Implement **two distinct streams**:

| Stream | Purpose | Volume | Delivery |
|--------|---------|--------|----------|
| **Notifications** | Action/attention required | Rare | Badge, push, inbox, WS |
| **Activity** | Audit trail / FYI | High | Activity tab/panel, searchable |

**One-sentence rule for users:**  
> "We only notify you when something needs attention (mentions, review requests, publishing, sharing, failures). Regular edits appear in Activity and are summarized."

---

## 1. Event Classification

### 1.1 Notification-Worthy Events (Slides)

These are **semantic, intentional actions** that require user attention:

| Event Type | Trigger | Payload Example |
|------------|---------|-----------------|
| `mention` | User @mentioned in comment/note | `{ type: 'mention', mentionedUserId, slideId, commentId, excerpt }` |
| `share` | Deck/slide shared or permissions changed | `{ type: 'share', targetUserId, deckId, permission, sharedBy }` |
| `review_request` | Explicit "Request Review" action | `{ type: 'review_request', reviewerId, deckId, requestedBy }` |
| `publish` | Deck version published / sent to client | `{ type: 'publish', deckId, versionId, publishedBy }` |
| `comment_resolved` | Comment resolved or reopened | `{ type: 'comment_resolved', slideId, commentId, resolvedBy, action: 'resolved' \| 'reopened' }` |
| `failure` | Export/publish/sync failure | `{ type: 'failure', deckId, failureType, message }` |
| `slide_to_task` | Slide converted to task | `{ type: 'slide_to_task', slideId, taskId, createdBy }` |

### 1.2 Activity-Only Events (Never Notify)

These are **mechanical, high-frequency changes**:

| Event | Why NOT Notify |
|-------|----------------|
| Autosave | System-triggered, no semantic meaning |
| Typing/dragging/nudging | Too granular |
| Cursor presence / editor open | FYI only |
| Yjs sync updates | Infrastructure |
| Empty/no-op updates | Nothing changed |
| Background sync | Infrastructure |

---

## 2. Event Types & Payloads

### 2.1 Notification Event Schema

```typescript
interface NotificationEvent {
  // Identity
  notificationId: string;           // UUID
  userId: string;                   // Recipient
  
  // Classification  
  type: NotificationType;           // See enum below
  category: 'slides' | 'budget' | 'messages' | 'project' | 'system';
  
  // Content
  title: string;                    // "Jaz mentioned you in MB2 Tahoe Slides"
  body?: string;                    // Optional excerpt
  
  // Context
  projectId: string;
  slideId?: string;
  deckId?: string;
  commentId?: string;
  
  // Actor
  senderId: string;                 // Who triggered it
  senderName: string;
  
  // State
  createdAt: string;                // ISO timestamp
  readAt?: string;                  // ISO timestamp
  
  // Deep link
  actionUrl?: string;               // e.g., "/project/abc/slides?slide=xyz"
}

type NotificationType =
  | 'mention'
  | 'share'
  | 'review_request'
  | 'review_complete'
  | 'publish'
  | 'comment_resolved'
  | 'comment_reopened'
  | 'failure'
  | 'slide_to_task'
  | 'project_invite'
  | 'task_assigned'
  | 'message';
```

### 2.2 Activity Event Schema

```typescript
interface ActivityEvent {
  // Identity
  activityId: string;               // UUID
  projectId: string;
  
  // Classification
  type: ActivityType;
  category: 'slides' | 'budget' | 'files' | 'tasks' | 'project';
  
  // Content (supports batching)
  summary: string;                  // "Updated Slides: Slide 3 text, Slide 7 image"
  changes?: ActivityChange[];       // Detailed breakdown
  
  // Actor
  userId: string;
  userName: string;
  
  // Timing
  createdAt: string;
  periodStart?: string;             // For batched events
  periodEnd?: string;
  
  // Grouping
  batchId?: string;                 // Groups related changes
  changeCount?: number;
}

interface ActivityChange {
  slideId?: string;
  slideNumber?: number;
  changeType: 'text' | 'image' | 'layout' | 'style' | 'delete' | 'create' | 'reorder';
  description?: string;
}

type ActivityType =
  | 'slide_edit'
  | 'slide_create'
  | 'slide_delete'
  | 'slide_reorder'
  | 'deck_create'
  | 'deck_rename'
  | 'budget_update'
  | 'file_upload'
  | 'file_delete'
  | 'task_update'
  | 'project_settings';
```

---

## 3. Throttling & Batching Rules

### 3.1 Edit Batching (Slides)

```typescript
const EDIT_BATCH_CONFIG = {
  // Don't emit until user is idle for this duration
  idleThresholdMs: 90_000,          // 90 seconds
  
  // Maximum time between batch emissions per deck
  maxBatchIntervalMs: 30 * 60_000,  // 30 minutes
  
  // Minimum changes before emitting (unless idle threshold hit)
  minChangesForEarlyEmit: 10,
  
  // Maximum changes to track before forcing emit
  maxChangesPerBatch: 100,
};
```

### 3.2 Batching Flow

```
User edits slide 3 text      → Track change, reset idle timer
User edits slide 3 text      → Track change, reset idle timer
User edits slide 7 image     → Track change, reset idle timer
...
[90s of no edits]            → EMIT: "Jaz edited MB2 Tahoe Slides · 12 changes · 3 slides"
                             → Clear batch, reset timers
```

### 3.3 Deduplication Rules

1. **Never notify the actor** — if `senderId === recipientUserId`, skip
2. **Collapse mentions** — multiple mentions in same comment = 1 notification
3. **Collapse share events** — multiple permission changes in < 1 min = 1 notification
4. **Idempotent processing** — use `notificationId` to prevent duplicates

---

## 4. Phantom Notification Prevention

### 4.1 Dirty State Detection

Only emit activity when there's a **meaningful change**:

```typescript
// In Yjs sync or autosave handler
function shouldEmitActivity(prevStateHash: string, newStateHash: string): boolean {
  // Same hash = no change = no emit
  if (prevStateHash === newStateHash) return false;
  
  // Check if this is just metadata (cursor, presence, selection)
  if (isMetadataOnlyChange(prevStateHash, newStateHash)) return false;
  
  return true;
}

// Hash computation should exclude transient state
function computeContentHash(doc: Y.Doc): string {
  const content = doc.getMap('slides').toJSON();
  // Exclude: cursors, selections, presence, timestamps
  delete content._cursors;
  delete content._presence;
  delete content._meta;
  return sha256(JSON.stringify(content));
}
```

### 4.2 Events That MUST NOT Trigger Notifications

```typescript
const IGNORED_FOR_NOTIFICATIONS = new Set([
  'editor_open',
  'editor_close',
  'presence_join',
  'presence_leave',
  'cursor_move',
  'selection_change',
  'autosave_tick',
  'yjs_sync',
  'heartbeat',
  'idle_timeout',
]);
```

---

## 5. Backend Implementation

### 5.1 DynamoDB Tables

**Notifications Table** (existing, enhanced):
```yaml
TableName: Notifications
KeySchema:
  - AttributeName: userId      # PK
    KeyType: HASH
  - AttributeName: notificationId  # SK (format: "N#<timestamp>#<uuid>")
    KeyType: RANGE
GSI:
  - projectId-index  # Query notifications by project
```

**Activity Table** (new):
```yaml
TableName: ProjectActivity
KeySchema:
  - AttributeName: projectId   # PK
    KeyType: HASH
  - AttributeName: activityId  # SK (format: "A#<timestamp>#<uuid>")
    KeyType: RANGE
Attributes:
  - userId: S
  - type: S
  - category: S
  - summary: S
  - changes: L  # List of change objects
  - createdAt: S
  - batchId: S
GSI:
  - userId-index  # Query user's activity across projects
TTL:
  - AttributeName: expiresAt   # Auto-delete after 90 days
```

### 5.2 Lambda: ActivityBatcher

Runs on schedule (every 5 minutes) or triggered by idle detection:

```typescript
// backend/websocket/activityBatcher.mjs
export const handler = async (event) => {
  // 1. Scan pending edit batches from Redis/DynamoDB
  const pendingBatches = await getPendingBatches();
  
  for (const batch of pendingBatches) {
    const { projectId, userId, changes, lastEditAt } = batch;
    
    // 2. Check if idle threshold met
    const idleDuration = Date.now() - new Date(lastEditAt).getTime();
    if (idleDuration < EDIT_BATCH_CONFIG.idleThresholdMs) continue;
    
    // 3. Skip if no meaningful changes
    if (changes.length === 0) continue;
    
    // 4. Build summary
    const summary = buildActivitySummary(changes);
    
    // 5. Write to Activity table
    await writeActivityEvent({
      projectId,
      userId,
      type: 'slide_edit',
      category: 'slides',
      summary,
      changes,
      changeCount: changes.length,
    });
    
    // 6. Broadcast to project Activity panel
    await broadcastActivity(projectId, { action: 'activityUpdate', ... });
    
    // 7. Clear batch
    await clearBatch(batch.batchId);
  }
};

function buildActivitySummary(changes: ActivityChange[]): string {
  const slideNumbers = [...new Set(changes.map(c => c.slideNumber))].sort();
  const changeTypes = [...new Set(changes.map(c => c.changeType))];
  
  return `Updated Slides: ${slideNumbers.map(n => `Slide ${n}`).join(', ')} ` +
         `(${changeTypes.join(', ')})`;
}
```

### 5.3 WebSocket Actions

**New actions in `default.mjs`:**

```typescript
// Track edit for batching (called from frontend on meaningful change)
case 'trackSlideEdit':
  return await handleTrackSlideEdit(payload, userId);

// Fetch project activity
case 'fetchProjectActivity':
  return await handleFetchProjectActivity(event, payload);

// Create notification (from explicit user action)
case 'createNotification':
  return await handleCreateNotification(payload, userId);
```

---

## 6. Frontend Implementation

### 6.1 Activity Panel Component

```typescript
// src/dashboard/project/features/activity/ActivityPanel.tsx
interface ActivityPanelProps {
  projectId: string;
}

export function ActivityPanel({ projectId }: ActivityPanelProps) {
  const { activities, loading } = useProjectActivity(projectId);
  
  return (
    <div className={styles.activityPanel}>
      <h3>Activity</h3>
      <div className={styles.activityList}>
        {activities.map(activity => (
          <ActivityItem key={activity.activityId} activity={activity} />
        ))}
      </div>
    </div>
  );
}
```

### 6.2 Edit Tracking Hook

```typescript
// src/dashboard/project/features/slides/hooks/useEditTracking.ts
export function useEditTracking(slideId: string, projectId: string) {
  const { ws } = useSocket();
  const lastHashRef = useRef<string>('');
  const pendingChangesRef = useRef<ActivityChange[]>([]);
  const idleTimerRef = useRef<NodeJS.Timeout>();
  
  const trackChange = useCallback((changeType: ActivityChange['changeType']) => {
    // Reset idle timer
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    
    // Track change locally
    pendingChangesRef.current.push({
      slideId,
      changeType,
      timestamp: new Date().toISOString(),
    });
    
    // Set idle timer to flush
    idleTimerRef.current = setTimeout(() => {
      flushChanges();
    }, EDIT_BATCH_CONFIG.idleThresholdMs);
  }, [slideId]);
  
  const flushChanges = useCallback(() => {
    if (pendingChangesRef.current.length === 0) return;
    
    ws?.send(JSON.stringify({
      action: 'trackSlideEdit',
      projectId,
      changes: pendingChangesRef.current,
    }));
    
    pendingChangesRef.current = [];
  }, [ws, projectId]);
  
  return { trackChange, flushChanges };
}
```

### 6.3 Notification Type Guards

```typescript
// src/shared/utils/notificationUtils.ts
export function isNotifiable(eventType: string): boolean {
  return NOTIFICATION_TYPES.has(eventType);
}

export function isActivityOnly(eventType: string): boolean {
  return ACTIVITY_TYPES.has(eventType) && !NOTIFICATION_TYPES.has(eventType);
}

const NOTIFICATION_TYPES = new Set([
  'mention',
  'share',
  'review_request',
  'publish',
  'comment_resolved',
  'comment_reopened',
  'failure',
  'slide_to_task',
  'project_invite',
  'task_assigned',
]);

const ACTIVITY_TYPES = new Set([
  'slide_edit',
  'slide_create',
  'slide_delete',
  'slide_reorder',
  'deck_create',
  'budget_update',
  'file_upload',
  ...NOTIFICATION_TYPES,  // All notifications also appear in activity
]);
```

---

## 7. Per-Project Preferences

### 7.1 Schema

```typescript
interface ProjectNotificationPreferences {
  projectId: string;
  userId: string;
  
  // Notification toggles (default: all true)
  mentions: boolean;
  reviewRequests: boolean;
  publishing: boolean;
  sharing: boolean;
  failures: boolean;
  
  // Activity is always recorded (no toggle)
}
```

### 7.2 Default Preferences

```typescript
const DEFAULT_NOTIFICATION_PREFS: Omit<ProjectNotificationPreferences, 'projectId' | 'userId'> = {
  mentions: true,
  reviewRequests: true,
  publishing: true,
  sharing: true,
  failures: true,
};
```

---

## 8. Migration & Rollout

### Phase 1: Add Activity Table
1. Deploy `ProjectActivity` DynamoDB table
2. Add `trackSlideEdit` action to WebSocket handler
3. Deploy ActivityBatcher Lambda (disabled)

### Phase 2: Frontend Activity Panel
1. Add Activity tab to project view
2. Wire up `useProjectActivity` hook
3. Add edit tracking to Slides editor

### Phase 3: Filter Notifications
1. Update notification creation to check `isNotifiable()`
2. Remove autosave/presence/sync events from notification paths
3. Test thoroughly with real-time collaboration

### Phase 4: Enable Batching
1. Enable ActivityBatcher Lambda
2. Add batching UI ("Jaz edited... · 12 changes")
3. Monitor for missed events

---

## 9. Testing Checklist

- [ ] Autosave does NOT create notification
- [ ] Cursor movement does NOT create notification
- [ ] Yjs sync does NOT create notification
- [ ] @mention DOES create notification (to mentioned user only)
- [ ] Self-edits do NOT create notification to self
- [ ] Activity panel shows all edits with timestamps
- [ ] Batched edits summarize correctly
- [ ] 90s idle triggers batch emission
- [ ] Preferences are respected per-project

---

## Consequences

### Positive
- Users only see meaningful notifications
- No more "phantom" notifications from sync/autosave
- Rich audit trail preserved in Activity
- Lower notification fatigue = higher engagement with real notifications

### Negative
- Additional DynamoDB table and Lambda
- Slight delay (90s) before collaborators see edit activity
- Increased complexity in tracking what's "meaningful"

### Neutral
- Existing `Notifications` table schema unchanged
- WebSocket infrastructure reused

---

## References

- [ADR-001: CORS](./ADR-001.md)
- [ADR-002: DM IDs](./ADR-002.md)
- [SLIDES_ARCHITECTURE.txt](../../SLIDES_ARCHITECTURE.txt)
- [copilot-instructions.md](../../.github/copilot-instructions.md)
