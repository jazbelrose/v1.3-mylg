# ADR: File Lifecycle & Real-time Multi-User Sync

**Status**: Sprint 1 Deployed (dev)  
**Date**: 2026-01-24  
**Authors**: Engineering  
**Scope**: Backend (DynamoDB, Lambda, WebSocket) + Frontend (File Manager, all file consumers)

---

## Deployment Status

### Sprint 1 - Foundation (✅ COMPLETE - 2026-01-24)
- ✅ Files table created in DynamoDB (us-west-2)
- ✅ FileRefs table created in DynamoDB (us-west-2)
- ✅ TTL enabled on Files table (hardDeleteAt attribute)
- ✅ shared-layer deployed with websocket.mjs and response.mjs utilities (v26)
- ✅ files service deployed to dev stage
- ✅ Frontend types and API client created
- ✅ React Context created (FileLifecycleContext)

### Files Service Endpoints
```
Base URL: https://ury7hxwq77.execute-api.us-west-2.amazonaws.com

GET    /projects/{projectId}/files       - List project files
POST   /projects/{projectId}/files       - Create/upload file
GET    /orgs/{orgId}/files               - List org files  
POST   /orgs/{orgId}/files               - Create/upload org file
GET    /files/{scope}/{fileId}           - Get single file
PATCH  /files/{scope}/{fileId}           - Update file (rename)
DELETE /files/{scope}/{fileId}           - Soft delete file
POST   /files/{scope}/{fileId}/restore   - Restore deleted file
POST   /files/{scope}/{fileId}/confirm   - Confirm upload complete
GET    /files/{scope}/{fileId}/refs      - Get file references
POST   /files/{scope}/{fileId}/refs      - Add reference
DELETE /files/{scope}/{fileId}/refs/{type}/{id} - Remove reference
```

### Pending
- [ ] Wire up WebSocket events in websocket/default.mjs
- [ ] Integrate File Manager UI with new API
- [ ] Run backfill script for existing files
- [ ] Enable DynamoDB stream trigger for hard delete cleanup

---

## Context

Files are currently stored directly in S3 with no canonical metadata table. Different containers (Slides, Chat, Tasks, Budget, Orgs) embed file URLs inline. This causes:

1. **Orphaned files** — deleting a container doesn't clean up S3; deleting in File Manager can break references
2. **No real-time sync** — File Manager changes aren't broadcast; multi-user sessions see stale data
3. **No reference tracking** — can't answer "which entities use this file?"
4. **Inconsistent deletion semantics** — "remove from chat" vs "delete everywhere" are conflated

---

## Decision

Implement a **canonical Files table** with **reference tables** for each container, plus **WebSocket events** for real-time sync.

---

## 1. DynamoDB Schema

### 1.1 Files Table (NEW)

```yaml
Files:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: Files
    BillingMode: PAY_PER_REQUEST
    KeySchema:
      - AttributeName: PK          # scope: "project#<projectId>" or "org#<orgId>"
        KeyType: HASH
      - AttributeName: fileId
        KeyType: RANGE
    AttributeDefinitions:
      - AttributeName: PK
        AttributeType: S
      - AttributeName: fileId
        AttributeType: S
      - AttributeName: storageKey    # S3 key (for lookup by key)
        AttributeType: S
      - AttributeName: status        # UPLOADING | READY | FAILED | DELETED
        AttributeType: S
    GlobalSecondaryIndexes:
      - IndexName: storageKey-index
        KeySchema:
          - AttributeName: storageKey
            KeyType: HASH
        Projection:
          ProjectionType: ALL
      - IndexName: status-index
        KeySchema:
          - AttributeName: PK
            KeyType: HASH
          - AttributeName: status
            KeyType: RANGE
        Projection:
          ProjectionType: KEYS_ONLY
    TimeToLiveSpecification:
      AttributeName: hardDeleteAt
      Enabled: true
    SSESpecification:
      SSEEnabled: true
    DeletionProtectionEnabled: true
```

#### File Record Shape

```typescript
interface FileRecord {
  // Keys
  PK: string;                     // "project#<projectId>" | "org#<orgId>"
  fileId: string;                 // ulid or uuid
  
  // Storage
  storageKey: string;             // S3 key (e.g., "public/projects/abc/uploads/file.pdf")
  bucket: string;                 // "mylg-files-v12"
  
  // Metadata
  filename: string;               // Original filename
  mimeType: string;               // "application/pdf"
  size: number;                   // Bytes
  checksum?: string;              // MD5/SHA256 (optional)
  
  // Renditions (auto-populated by image-thumbnails Lambda)
  thumbnailKey?: string;          // "public/.../uploads_thumbnails/file.webp"
  embedKey?: string;              // "public/.../uploads_embed/file.jpg"
  
  // Lifecycle
  status: 'UPLOADING' | 'READY' | 'FAILED' | 'DELETED';
  
  // Audit
  createdAt: string;              // ISO 8601
  createdBy: string;              // userId
  updatedAt?: string;
  deletedAt?: string;
  deletedBy?: string;
  
  // TTL for hard delete (set to deletedAt + 30 days)
  hardDeleteAt?: number;          // Unix epoch seconds
  
  // Denormalized scope IDs for queries
  projectId?: string;
  orgId?: string;
}
```

### 1.2 FileRefs Table (NEW)

Single table for all container references using composite keys.

```yaml
FileRefs:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: FileRefs
    BillingMode: PAY_PER_REQUEST
    KeySchema:
      - AttributeName: PK          # "file#<fileId>"
        KeyType: HASH
      - AttributeName: SK          # "<containerType>#<containerId>"
        KeyType: RANGE
    AttributeDefinitions:
      - AttributeName: PK
        AttributeType: S
      - AttributeName: SK
        AttributeType: S
      - AttributeName: GSI1PK      # "<containerType>#<containerId>"
        AttributeType: S
      - AttributeName: GSI1SK      # "file#<fileId>"
        AttributeType: S
    GlobalSecondaryIndexes:
      - IndexName: container-index
        KeySchema:
          - AttributeName: GSI1PK
            KeyType: HASH
          - AttributeName: GSI1SK
            KeyType: RANGE
        Projection:
          ProjectionType: ALL
    SSESpecification:
      SSEEnabled: true
    DeletionProtectionEnabled: true
```

#### FileRef Record Shape

```typescript
interface FileRefRecord {
  // Keys
  PK: string;                     // "file#<fileId>"
  SK: string;                     // "slide#<slideId>" | "message#<messageId>" | "task#<taskId>" | etc.
  
  // Inverted index for "get files for container"
  GSI1PK: string;                 // "slide#<slideId>" | "message#<messageId>" | etc.
  GSI1SK: string;                 // "file#<fileId>"
  
  // Metadata
  containerType: 'slide' | 'message' | 'task' | 'budget' | 'org' | 'lexical' | 'gallery';
  containerId: string;
  
  // Usage context
  usageType?: string;             // "background" | "element" | "attachment" | "logo" | "invoice"
  position?: number;              // Order/page number if applicable
  
  // Denormalized file info (for fast reads without join)
  fileId: string;
  filename: string;
  mimeType: string;
  thumbnailUrl?: string;
  
  // Audit
  createdAt: string;
  createdBy: string;
}
```

---

## 2. Key Patterns & Access Patterns

### Files Table

| Access Pattern | Key Condition |
|----------------|---------------|
| List files in project | `PK = "project#<projectId>"` |
| List files in org | `PK = "org#<orgId>"` |
| Get file by ID | `PK = "<scope>", fileId = "<fileId>"` |
| Find file by S3 key | GSI `storageKey = "<key>"` |
| List deleted files (for cleanup) | GSI `PK = "<scope>", status = "DELETED"` |

### FileRefs Table

| Access Pattern | Key Condition |
|----------------|---------------|
| Get all refs for a file | `PK = "file#<fileId>"` |
| Get ref count for file | `PK = "file#<fileId>"` (count) |
| Get files for a slide | GSI `GSI1PK = "slide#<slideId>"` |
| Get files for a message | GSI `GSI1PK = "message#<messageId>"` |
| Get files for a task | GSI `GSI1PK = "task#<taskId>"` |

---

## 3. WebSocket Events

### 3.1 Event Types

Add to `default.mjs` action handler:

```javascript
// File lifecycle events
case "fileCreated":
case "fileUpdated":
case "fileDeleted":
case "fileRestored":
case "fileRefAdded":
case "fileRefRemoved":
  return await forwardFileEvent(payload);
```

### 3.2 Event Payloads

```typescript
// FILE_CREATED - Emitted when upload starts (UPLOADING) and when complete (READY)
interface FileCreatedEvent {
  action: "fileCreated";
  projectId?: string;
  orgId?: string;
  conversationId: string;         // "project#<id>" or "org#<id>" for room targeting
  file: {
    fileId: string;
    filename: string;
    mimeType: string;
    size: number;
    status: 'UPLOADING' | 'READY';
    storageKey: string;
    thumbnailUrl?: string;
    createdBy: string;
    createdAt: string;
  };
}

// FILE_UPDATED - Name change, status change, renditions ready
interface FileUpdatedEvent {
  action: "fileUpdated";
  projectId?: string;
  orgId?: string;
  conversationId: string;
  fileId: string;
  changes: Partial<{
    filename: string;
    status: 'READY' | 'FAILED';
    thumbnailUrl: string;
    embedUrl: string;
  }>;
  updatedBy: string;
}

// FILE_DELETED - Soft delete
interface FileDeletedEvent {
  action: "fileDeleted";
  projectId?: string;
  orgId?: string;
  conversationId: string;
  fileId: string;
  deletedBy: string;
  deletedAt: string;
  refCount: number;               // How many references existed
}

// FILE_RESTORED - Undo soft delete
interface FileRestoredEvent {
  action: "fileRestored";
  projectId?: string;
  orgId?: string;
  conversationId: string;
  fileId: string;
  restoredBy: string;
}

// FILE_REF_ADDED - File attached to a container
interface FileRefAddedEvent {
  action: "fileRefAdded";
  projectId?: string;
  orgId?: string;
  conversationId: string;
  fileId: string;
  containerType: string;
  containerId: string;
  usageType?: string;
  addedBy: string;
}

// FILE_REF_REMOVED - File detached from a container (NOT deleted)
interface FileRefRemovedEvent {
  action: "fileRefRemoved";
  projectId?: string;
  orgId?: string;
  conversationId: string;
  fileId: string;
  containerType: string;
  containerId: string;
  removedBy: string;
}
```

### 3.3 Broadcasting Logic

```javascript
const forwardFileEvent = async (payload) => {
  const { projectId, orgId } = payload;
  
  if (projectId) {
    // Broadcast to project room
    await broadcastToConversation(`project#${projectId}`, payload);
  } else if (orgId) {
    // Broadcast to all org members
    await broadcastToOrgMembers(orgId, payload);
  }
  
  return { statusCode: 200, body: "File event broadcast" };
};
```

---

## 4. File Lifecycle State Machine

```
                    ┌──────────────┐
        upload      │              │
       starts ──────►  UPLOADING   │
                    │              │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            │            ▼
        ┌──────────┐       │      ┌──────────┐
        │          │       │      │          │
        │  FAILED  │       │      │   READY  │◄──── rename, update
        │          │       │      │          │
        └────┬─────┘       │      └────┬─────┘
             │             │           │
             │  retry      │           │ soft delete
             └─────────────┘           ▼
                                ┌──────────┐
                                │          │
                                │ DELETED  │──── TTL (30d) ───► HARD DELETE
                                │          │         │               │
                                └────┬─────┘         │               │
                                     │               │               ▼
                                     │ restore       │          S3 object
                                     └───────────────┘          removed
```

---

## 5. API Endpoints

### 5.1 Files Service Routes

Add to `backend/projects/router.mjs` (or create `backend/files/` service):

```javascript
// List files in scope
GET /projects/{projectId}/files
GET /orgs/{orgId}/files

// Get single file
GET /files/{fileId}

// Create file record (called before S3 upload)
POST /projects/{projectId}/files
POST /orgs/{orgId}/files
Body: { filename, mimeType, size }
Response: { fileId, uploadUrl (presigned), storageKey }

// Update file (rename)
PATCH /files/{fileId}
Body: { filename }

// Soft delete file
DELETE /files/{fileId}
Query: ?force=true (to bypass refCount warning)

// Restore deleted file
POST /files/{fileId}/restore

// Get file references
GET /files/{fileId}/refs
Response: { refs: [{ containerType, containerId, usageType }...], count }

// Add reference (when attaching to container)
POST /files/{fileId}/refs
Body: { containerType, containerId, usageType? }

// Remove reference (when detaching from container)
DELETE /files/{fileId}/refs/{containerType}/{containerId}
```

---

## 6. Migration Strategy

### Phase 1: Create Tables (Non-Breaking)

1. Deploy `Files` and `FileRefs` tables
2. Deploy file service endpoints
3. No changes to existing behavior

### Phase 2: Dual-Write (Gradual)

For each ingestion point, add writes to Files/FileRefs:

```javascript
// Example: Chat upload
const uploadChatAttachment = async (projectId, messageId, file) => {
  // 1. Create File record
  const fileRecord = await createFileRecord({
    scope: `project#${projectId}`,
    filename: file.name,
    mimeType: file.type,
    size: file.size,
    status: 'UPLOADING',
    createdBy: userId,
  });
  
  // 2. Get presigned URL, upload to S3
  const uploadUrl = await getPresignedUrl(fileRecord.storageKey);
  await uploadToS3(uploadUrl, file);
  
  // 3. Update status to READY
  await updateFileStatus(fileRecord.fileId, 'READY');
  
  // 4. Create FileRef
  await createFileRef({
    fileId: fileRecord.fileId,
    containerType: 'message',
    containerId: messageId,
    usageType: 'attachment',
  });
  
  // 5. Emit events
  await emitFileCreated(projectId, fileRecord);
  await emitFileRefAdded(projectId, fileRecord.fileId, 'message', messageId);
  
  // 6. Return fileId for message record (replaces inline URL)
  return fileRecord.fileId;
};
```

### Phase 3: Backfill Existing Files

Run migration script to:

1. Scan S3 for all existing files
2. Create `File` records for each
3. Scan containers (Slides, Messages, Tasks, etc.) for file URLs
4. Create `FileRef` records for each reference

```javascript
// backend/scripts/backfill-files.mjs
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const backfillProjectFiles = async (projectId) => {
  // List S3 objects under project prefix
  const prefix = `public/projects/${projectId}/`;
  const objects = await listS3Objects(prefix);
  
  for (const obj of objects) {
    // Create File record
    const fileId = generateFileId();
    await createFileRecord({
      PK: `project#${projectId}`,
      fileId,
      storageKey: obj.Key,
      filename: extractFilename(obj.Key),
      mimeType: guessMimeType(obj.Key),
      size: obj.Size,
      status: 'READY',
      createdAt: obj.LastModified.toISOString(),
      createdBy: 'system-migration',
    });
    
    // Find and create refs by scanning containers
    await backfillRefsForFile(projectId, obj.Key, fileId);
  }
};
```

### Phase 4: Switch Reads

Update frontend to:

1. Fetch file list from `/projects/{projectId}/files` instead of S3 list
2. Resolve `fileId` → URL via File record
3. Handle `status: 'DELETED'` gracefully

### Phase 5: Deprecate Inline URLs

1. Update all containers to store `fileId` instead of URL
2. Remove direct S3 listing from File Manager
3. Remove inline URL storage from Messages, Tasks, etc.

---

## 7. Frontend Changes

### 7.1 File Manager Store Updates

```typescript
// src/dashboard/project/features/files/hooks/useFileStore.ts

interface FileStoreState {
  files: Map<string, FileRecord>;
  loading: boolean;
  error: string | null;
}

// Subscribe to WebSocket events
useEffect(() => {
  const handlers = {
    fileCreated: (event) => {
      setFiles(prev => new Map(prev).set(event.file.fileId, event.file));
    },
    fileUpdated: (event) => {
      setFiles(prev => {
        const updated = new Map(prev);
        const existing = updated.get(event.fileId);
        if (existing) {
          updated.set(event.fileId, { ...existing, ...event.changes });
        }
        return updated;
      });
    },
    fileDeleted: (event) => {
      setFiles(prev => {
        const updated = new Map(prev);
        const existing = updated.get(event.fileId);
        if (existing) {
          updated.set(event.fileId, { ...existing, status: 'DELETED', deletedAt: event.deletedAt });
        }
        return updated;
      });
    },
    fileRestored: (event) => {
      setFiles(prev => {
        const updated = new Map(prev);
        const existing = updated.get(event.fileId);
        if (existing) {
          updated.set(event.fileId, { ...existing, status: 'READY', deletedAt: undefined });
        }
        return updated;
      });
    },
  };
  
  wsClient.on('fileCreated', handlers.fileCreated);
  wsClient.on('fileUpdated', handlers.fileUpdated);
  wsClient.on('fileDeleted', handlers.fileDeleted);
  wsClient.on('fileRestored', handlers.fileRestored);
  
  return () => {
    wsClient.off('fileCreated', handlers.fileCreated);
    // ... cleanup
  };
}, []);
```

### 7.2 Deleted File Placeholder

```tsx
// src/shared/components/DeletedFilePlaceholder.tsx

export const DeletedFilePlaceholder: React.FC<{ fileId: string; context: string }> = ({
  fileId,
  context,
}) => {
  return (
    <div className="flex items-center gap-2 p-2 bg-gray-100 rounded text-gray-500">
      <FileX className="w-4 h-4" />
      <span className="text-sm">
        {context === 'slide' && 'Image was deleted'}
        {context === 'chat' && 'Attachment removed'}
        {context === 'task' && 'File no longer available'}
      </span>
    </div>
  );
};
```

### 7.3 Delete Confirmation with Ref Count

```tsx
// src/dashboard/project/features/files/components/DeleteFileDialog.tsx

export const DeleteFileDialog: React.FC<{ fileId: string; onConfirm: () => void }> = ({
  fileId,
  onConfirm,
}) => {
  const { data: refs } = useQuery(['fileRefs', fileId], () => fetchFileRefs(fileId));
  
  const usageText = useMemo(() => {
    if (!refs?.length) return null;
    
    const grouped = refs.reduce((acc, ref) => {
      acc[ref.containerType] = (acc[ref.containerType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(grouped)
      .map(([type, count]) => `${type} (${count})`)
      .join(', ');
  }, [refs]);
  
  return (
    <Dialog>
      <DialogHeader>Delete File</DialogHeader>
      <DialogContent>
        {usageText && (
          <Alert variant="warning">
            This file is used in: {usageText}
          </Alert>
        )}
        <p>Are you sure you want to delete this file? It can be restored within 30 days.</p>
      </DialogContent>
      <DialogFooter>
        <Button variant="destructive" onClick={onConfirm}>Delete</Button>
      </DialogFooter>
    </Dialog>
  );
};
```

---

## 8. Background Reconciliation Job

### 8.1 Orphan Detection Lambda

```javascript
// backend/scripts/file-reconciliation.mjs (scheduled via EventBridge)

export const handler = async () => {
  const report = {
    orphanedS3Objects: [],
    missingS3Objects: [],
    orphanedRefs: [],
    cleanedFailedUploads: 0,
  };
  
  // 1. Find S3 objects without File records
  for await (const obj of listAllS3Objects()) {
    const fileRecord = await findFileByStorageKey(obj.Key);
    if (!fileRecord) {
      report.orphanedS3Objects.push(obj.Key);
    }
  }
  
  // 2. Find File records where S3 object is missing
  for await (const file of scanAllFiles()) {
    if (file.status === 'READY') {
      const exists = await s3ObjectExists(file.storageKey);
      if (!exists) {
        report.missingS3Objects.push(file.fileId);
        await updateFileStatus(file.fileId, 'FAILED');
      }
    }
  }
  
  // 3. Find FileRefs pointing to non-existent Files
  for await (const ref of scanAllFileRefs()) {
    const file = await getFile(ref.fileId);
    if (!file || file.status === 'DELETED') {
      report.orphanedRefs.push({ fileId: ref.fileId, ref: ref.SK });
    }
  }
  
  // 4. Clean up FAILED uploads older than 7 days
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for await (const file of scanFilesByStatus('FAILED')) {
    if (new Date(file.createdAt).getTime() < cutoff) {
      await hardDeleteFile(file.fileId);
      report.cleanedFailedUploads++;
    }
  }
  
  // 5. Report to CloudWatch / SNS
  console.log('Reconciliation report:', JSON.stringify(report, null, 2));
  
  return report;
};
```

### 8.2 Hard Delete Cleanup Lambda

```javascript
// backend/scripts/file-hard-delete.mjs (triggered by DynamoDB TTL stream)

export const handler = async (event) => {
  for (const record of event.Records) {
    if (record.eventName === 'REMOVE' && record.dynamodb.OldImage) {
      const file = unmarshall(record.dynamodb.OldImage);
      
      // Delete S3 objects
      await deleteS3Objects([
        file.storageKey,
        file.thumbnailKey,
        file.embedKey,
      ].filter(Boolean));
      
      // Delete all FileRefs
      await deleteAllRefsForFile(file.fileId);
      
      console.log(`Hard deleted file: ${file.fileId}`);
    }
  }
};
```

---

## 9. Ingestion Point Checklist

| Ingestion Point | Current Behavior | Required Changes |
|-----------------|------------------|------------------|
| **File Manager upload** | S3 direct, list by prefix | Create File record, emit `fileCreated` |
| **Chat attachment** | Inline `attachment.url` | Create File + FileRef, store `fileId` |
| **Slide import (PDF)** | `create-gallery` Lambda → S3 | Lambda creates File records per page |
| **Slide background** | Inline `backgroundImage` | Create File + FileRef, store `fileId` |
| **Task attachment** | `attachments[]` URLs | Create File + FileRef, store `fileId` |
| **Org logo** | `branding.logoUrl` | Create File + FileRef, store `fileId` |
| **Budget invoice** | `invoicePdfKey` | Create File + FileRef, store `fileId` |
| **Lexical editor** | Inline image URLs | Create File + FileRef, embed `fileId` |
| **Project thumbnail** | `thumbnailKey` | Create File + FileRef |
| **User avatar** | `UserProfiles.avatar` | Create File record |

---

## 10. Implementation Order

### Sprint 1: Foundation

- [ ] Deploy `Files` table
- [ ] Deploy `FileRefs` table  
- [ ] Implement file service CRUD endpoints
- [ ] Add WebSocket event handlers for file events

### Sprint 2: File Manager Integration

- [ ] Update File Manager to use Files table for listing
- [ ] Implement delete with soft-delete semantics
- [ ] Add WebSocket subscriptions for real-time sync
- [ ] Show ref count / usage info on files

### Sprint 3: Container Integration (Slides, Chat)

- [ ] Update chat upload to create File + FileRef
- [ ] Update slide import to create File records
- [ ] Handle deleted files in UI (placeholders)
- [ ] Emit events on ref add/remove

### Sprint 4: Remaining Containers

- [ ] Tasks attachments
- [ ] Budget invoices
- [ ] Org logos
- [ ] Lexical editor images

### Sprint 5: Migration & Cleanup

- [ ] Run backfill script for existing files
- [ ] Deploy reconciliation Lambda (scheduled)
- [ ] Deploy hard-delete cleanup Lambda
- [ ] Remove deprecated inline URL patterns

---

## 11. Testing Checklist

- [ ] Multi-user: User A uploads → User B sees immediately
- [ ] Multi-user: User A deletes → User B sees placeholder
- [ ] Delete in File Manager → Chat shows "Attachment removed"
- [ ] Remove from chat → File still exists in File Manager
- [ ] Delete file used in 3 slides → All 3 show placeholder
- [ ] Restore deleted file → All containers show file again
- [ ] Upload fails → Status shows FAILED, no broken refs
- [ ] Orphan reconciliation finds missing S3 objects
- [ ] TTL cleanup removes old DELETED files

---

## Related ADRs

- [CORS_CENTRALIZATION.md](./CORS_CENTRALIZATION.md)
- [DM_CONVERSATION_IDS.md](./DM_CONVERSATION_IDS.md)
- [CDN_STRATEGY.md](./CDN_STRATEGY.md)

---

## Appendix: Container Type Constants

```typescript
export const CONTAINER_TYPES = {
  SLIDE: 'slide',
  MESSAGE: 'message', 
  TASK: 'task',
  BUDGET: 'budget',
  ORG: 'org',
  LEXICAL: 'lexical',
  GALLERY: 'gallery',
  PROJECT: 'project',  // for project thumbnails
  USER: 'user',        // for avatars
} as const;

export const USAGE_TYPES = {
  ATTACHMENT: 'attachment',
  BACKGROUND: 'background',
  ELEMENT: 'element',
  LOGO: 'logo',
  THUMBNAIL: 'thumbnail',
  INVOICE: 'invoice',
  AVATAR: 'avatar',
  PAGE: 'page',        // PDF import pages
} as const;
```
