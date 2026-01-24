# Files Service

Canonical file lifecycle management service for MYLG.

## Overview

This service implements a **first-class file entity system** where all files used across the application (slides, chat, tasks, invoices, etc.) reference a single canonical `File` record. This solves:

1. **Orphaned files** — No more files that can't be deleted or managed
2. **Referential integrity** — Know exactly where each file is used
3. **Real-time sync** — Multi-user file operations via WebSocket events
4. **Soft delete** — Files can be restored within 30 days

## Architecture

### Data Model

**Files Table** (`Files`)
- Stores canonical file metadata
- Key: `PK` (scope like `project#<id>`) + `fileId`
- Tracks: filename, mimeType, size, status, rendition keys, audit info
- TTL-based hard delete after 30 days for soft-deleted files

**FileRefs Table** (`FileRefs`)  
- Tracks where files are used (slides, messages, tasks, etc.)
- Key: `PK` (`file#<fileId>`) + `SK` (`<containerType>#<containerId>`)
- Inverted GSI for "get files for container" queries

### File Status Lifecycle

```
UPLOADING → READY → DELETED → (TTL) → Hard Delete
     ↓
   FAILED
```

### WebSocket Events

| Event | When |
|-------|------|
| `fileCreated` | New file upload started/completed |
| `fileUpdated` | File renamed or status changed |
| `fileDeleted` | File soft-deleted |
| `fileRestored` | Deleted file restored |
| `fileRefAdded` | File attached to a container |
| `fileRefRemoved` | File detached from a container |

## API Endpoints

### List Files

```
GET /projects/{projectId}/files
GET /orgs/{orgId}/files
```

Query params: `limit`, `cursor`, `includeDeleted`

### Create File (Upload)

```
POST /projects/{projectId}/files
POST /orgs/{orgId}/files

Body: { filename, mimeType, size }
Response: { fileId, storageKey, uploadUrl }
```

Flow:
1. Call this endpoint → get presigned upload URL
2. PUT file to `uploadUrl`
3. Call `/files/{scope}/{fileId}/confirm`

### Confirm Upload

```
POST /files/{scope}/{fileId}/confirm
```

### Get File

```
GET /files/{scope}/{fileId}
```

### Update File (Rename)

```
PATCH /files/{scope}/{fileId}
Body: { filename }
```

### Delete File (Soft Delete)

```
DELETE /files/{scope}/{fileId}
Query: ?force=true (to delete even if file has references)
```

Returns 409 if file has references and `force` not set.

### Restore File

```
POST /files/{scope}/{fileId}/restore
```

### Get File References

```
GET /files/{scope}/{fileId}/refs
```

### Add Reference

```
POST /files/{scope}/{fileId}/refs
Body: { containerType, containerId, usageType? }
```

### Remove Reference

```
DELETE /files/{scope}/{fileId}/refs/{containerType}/{containerId}
```

## Deployment

### Prerequisites

1. Deploy shared-layer first (includes new response.mjs and websocket.mjs)
2. Set environment variables in serverless.yml

### Deploy

```bash
cd backend/files
npm install
serverless deploy --stage dev
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `FILES_TABLE` | DynamoDB table for files (default: `Files`) |
| `FILE_REFS_TABLE` | DynamoDB table for refs (default: `FileRefs`) |
| `S3_BUCKET` | S3 bucket name |
| `FILE_CDN` | CDN URL prefix for file URLs |
| `WEBSOCKET_ENDPOINT` | WebSocket API Gateway endpoint |

## Migration

### Backfill Existing Files

Run the backfill script to create File records for existing S3 objects:

```bash
cd backend
node scripts/backfill-files.mjs --dry-run  # Preview
node scripts/backfill-files.mjs            # Execute
```

Options:
- `--dry-run` — Preview without writing
- `--project=<id>` — Only process specific project
- `--org=<id>` — Only process specific org

## Background Jobs

### Reconciliation (Daily)

- Finds File records where S3 object is missing → marks FAILED
- Finds FileRefs pointing to deleted files → reports orphans
- Cleans up FAILED uploads older than 7 days

### Hard Delete Cleanup (TTL Trigger)

- Triggered by DynamoDB Streams when TTL removes a DELETED file
- Deletes S3 objects (original, thumbnail, embed)
- Removes all FileRefs for the file

## Frontend Integration

### useFileStore

Zustand store with WebSocket sync:

```tsx
import { useFileStore } from '@/shared/stores/useFileStore';

// Set scope when entering project
useFileStore.getState().setScope(projectId);

// Fetch files
await useFileStore.getState().fetchFiles();

// Access files
const files = useFileStore(s => s.getReadyFiles());
```

### DeletedFilePlaceholder

Component for showing deleted file state:

```tsx
import { DeletedFilePlaceholder } from '@/shared/components/DeletedFilePlaceholder';

<DeletedFilePlaceholder 
  reason="deleted" 
  context="slide" 
  filename="presentation.pdf"
/>
```

### DeleteFileDialog

Confirmation dialog with reference count:

```tsx
import { DeleteFileDialog } from '@/shared/components/DeleteFileDialog';

<DeleteFileDialog
  fileId={file.fileId}
  filename={file.filename}
  isOpen={showDialog}
  onClose={() => setShowDialog(false)}
  onConfirm={async (force) => {
    await deleteFile(scope, file.fileId, { force });
  }}
/>
```

## Container Type Constants

```typescript
const CONTAINER_TYPES = {
  SLIDE: 'slide',
  MESSAGE: 'message',
  TASK: 'task',
  BUDGET: 'budget',
  ORG: 'org',
  LEXICAL: 'lexical',
  GALLERY: 'gallery',
  PROJECT: 'project',
  USER: 'user',
};

const USAGE_TYPES = {
  ATTACHMENT: 'attachment',
  BACKGROUND: 'background',
  ELEMENT: 'element',
  LOGO: 'logo',
  THUMBNAIL: 'thumbnail',
  INVOICE: 'invoice',
  AVATAR: 'avatar',
  PAGE: 'page',
};
```
