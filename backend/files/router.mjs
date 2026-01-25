/**
 * Files Service Router
 * Handles file lifecycle and reference management
 * 
 * Routes:
 *   GET    /projects/{projectId}/files       - List files in project
 *   GET    /orgs/{orgId}/files              - List files in org
 *   POST   /projects/{projectId}/files       - Create file (get upload URL)
 *   POST   /orgs/{orgId}/files              - Create file in org
 *   GET    /files/{scope}/{fileId}          - Get single file
 *   PATCH  /files/{scope}/{fileId}          - Update file (rename)
 *   DELETE /files/{scope}/{fileId}          - Soft delete file
 *   POST   /files/{scope}/{fileId}/restore  - Restore deleted file
 *   POST   /files/{scope}/{fileId}/confirm  - Confirm upload complete
 *   GET    /files/{scope}/{fileId}/refs     - Get file references
 *   POST   /files/{scope}/{fileId}/refs     - Add reference
 *   DELETE /files/{scope}/{fileId}/refs/{containerType}/{containerId} - Remove reference
 */

import {
  createResponse,
  parseBody,
  validateRequired,
  extractUserId,
} from "/opt/nodejs/utils/response.mjs";
import { sendToWebSocket } from "/opt/nodejs/utils/websocket.mjs";
import {
  createFileRecord,
  getFile,
  getFileByStorageKey,
  listFiles,
  updateFileStatus,
  updateFileMetadata,
  softDeleteFile,
  restoreFile,
  getRefsForFile,
  getRefCount,
  createFileRef,
  removeFileRef,
  getFilesForContainer,
  buildFileUrl,
  FILE_STATUS,
} from "./filesDal.mjs";

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export const handler = async (event) => {
  console.log("📁 Files Router:", JSON.stringify(event, null, 2));

  const method = event.httpMethod || event.requestContext?.http?.method;
  const path = event.path || event.rawPath || "";
  const pathParams = event.pathParameters || {};
  const queryParams = event.queryStringParameters || {};

  try {
    const userId = extractUserId(event);
    if (!userId) {
      return createResponse(401, { error: "Unauthorized" });
    }

    // Route matching
    // Project files
    if (path.match(/\/projects\/[^/]+\/files$/) && method === "GET") {
      return await handleListProjectFiles(pathParams.projectId, queryParams);
    }
    if (path.match(/\/projects\/[^/]+\/files$/) && method === "POST") {
      return await handleCreateProjectFile(pathParams.projectId, event, userId);
    }

    // Org files
    if (path.match(/\/orgs\/[^/]+\/files$/) && method === "GET") {
      return await handleListOrgFiles(pathParams.orgId, queryParams);
    }
    if (path.match(/\/orgs\/[^/]+\/files$/) && method === "POST") {
      return await handleCreateOrgFile(pathParams.orgId, event, userId);
    }

    // Single file operations
    if (path.match(/\/files\/[^/]+\/[^/]+$/) && method === "GET") {
      return await handleGetFile(pathParams.scope, pathParams.fileId);
    }
    if (path.match(/\/files\/[^/]+\/[^/]+$/) && method === "PATCH") {
      return await handleUpdateFile(pathParams.scope, pathParams.fileId, event, userId);
    }
    if (path.match(/\/files\/[^/]+\/[^/]+$/) && method === "DELETE") {
      return await handleDeleteFile(pathParams.scope, pathParams.fileId, queryParams, userId);
    }

    // Restore
    if (path.match(/\/files\/[^/]+\/[^/]+\/restore$/) && method === "POST") {
      return await handleRestoreFile(pathParams.scope, pathParams.fileId, userId);
    }

    // Confirm upload
    if (path.match(/\/files\/[^/]+\/[^/]+\/confirm$/) && method === "POST") {
      return await handleConfirmUpload(pathParams.scope, pathParams.fileId, userId);
    }

    // Delete by storage key (legacy integration)
    if (path.match(/\/files\/by-key$/) && method === "DELETE") {
      return await handleDeleteByStorageKey(queryParams, userId);
    }

    // Register existing file (backfill)
    if (path.match(/\/projects\/[^/]+\/files\/register$/) && method === "POST") {
      return await handleRegisterExistingFile('project', pathParams.projectId, event, userId);
    }
    if (path.match(/\/orgs\/[^/]+\/files\/register$/) && method === "POST") {
      return await handleRegisterExistingFile('org', pathParams.orgId, event, userId);
    }

    // References
    if (path.match(/\/files\/[^/]+\/[^/]+\/refs$/) && method === "GET") {
      return await handleGetRefs(pathParams.fileId);
    }
    if (path.match(/\/files\/[^/]+\/[^/]+\/refs$/) && method === "POST") {
      return await handleAddRef(pathParams.scope, pathParams.fileId, event, userId);
    }
    if (path.match(/\/files\/[^/]+\/[^/]+\/refs\/[^/]+\/[^/]+$/) && method === "DELETE") {
      return await handleRemoveRef(
        pathParams.scope,
        pathParams.fileId,
        pathParams.containerType,
        pathParams.containerId,
        userId
      );
    }

    return createResponse(404, { error: "Not found" });
  } catch (err) {
    console.error("❌ Files router error:", err);
    return createResponse(500, { error: err.message || "Internal server error" });
  }
};

// ============================================================================
// LIST FILES
// ============================================================================

const handleListProjectFiles = async (projectId, query) => {
  if (!projectId) {
    return createResponse(400, { error: "Missing projectId" });
  }

  const scope = `project#${projectId}`;
  const { files, lastKey } = await listFiles(scope, {
    limit: query.limit ? parseInt(query.limit, 10) : 100,
    lastKey: query.cursor ? JSON.parse(decodeURIComponent(query.cursor)) : undefined,
    includeDeleted: query.includeDeleted === "true",
  });

  // Enrich with URLs
  const enriched = files.map((f) => ({
    ...f,
    url: buildFileUrl(f.storageKey),
    thumbnailUrl: f.thumbnailKey ? buildFileUrl(f.thumbnailKey) : undefined,
    embedUrl: f.embedKey ? buildFileUrl(f.embedKey) : undefined,
  }));

  return createResponse(200, {
    files: enriched,
    cursor: lastKey ? encodeURIComponent(JSON.stringify(lastKey)) : null,
  });
};

const handleListOrgFiles = async (orgId, query) => {
  if (!orgId) {
    return createResponse(400, { error: "Missing orgId" });
  }

  const scope = `org#${orgId}`;
  const { files, lastKey } = await listFiles(scope, {
    limit: query.limit ? parseInt(query.limit, 10) : 100,
    lastKey: query.cursor ? JSON.parse(decodeURIComponent(query.cursor)) : undefined,
    includeDeleted: query.includeDeleted === "true",
  });

  const enriched = files.map((f) => ({
    ...f,
    url: buildFileUrl(f.storageKey),
    thumbnailUrl: f.thumbnailKey ? buildFileUrl(f.thumbnailKey) : undefined,
  }));

  return createResponse(200, {
    files: enriched,
    cursor: lastKey ? encodeURIComponent(JSON.stringify(lastKey)) : null,
  });
};

// ============================================================================
// CREATE FILE
// ============================================================================

const handleCreateProjectFile = async (projectId, event, userId) => {
  if (!projectId) {
    return createResponse(400, { error: "Missing projectId" });
  }

  const body = parseBody(event);
  const validation = validateRequired(body, ["filename", "mimeType", "size"]);
  if (validation) return validation;

  const scope = `project#${projectId}`;
  const result = await createFileRecord({
    scope,
    filename: body.filename,
    mimeType: body.mimeType,
    size: body.size,
    createdBy: userId,
    projectId,
  });

  // Emit WebSocket event (UPLOADING status)
  await emitFileEvent("fileCreated", {
    projectId,
    conversationId: `project#${projectId}`,
    file: {
      fileId: result.fileId,
      filename: body.filename,
      mimeType: body.mimeType,
      size: body.size,
      status: FILE_STATUS.UPLOADING,
      storageKey: result.storageKey,
      createdBy: userId,
      createdAt: result.file.createdAt,
    },
  });

  return createResponse(201, {
    fileId: result.fileId,
    storageKey: result.storageKey,
    uploadUrl: result.uploadUrl,
  });
};

const handleCreateOrgFile = async (orgId, event, userId) => {
  if (!orgId) {
    return createResponse(400, { error: "Missing orgId" });
  }

  const body = parseBody(event);
  const validation = validateRequired(body, ["filename", "mimeType", "size"]);
  if (validation) return validation;

  const scope = `org#${orgId}`;
  const result = await createFileRecord({
    scope,
    filename: body.filename,
    mimeType: body.mimeType,
    size: body.size,
    createdBy: userId,
    orgId,
  });

  await emitFileEvent("fileCreated", {
    orgId,
    conversationId: `org#${orgId}`,
    file: {
      fileId: result.fileId,
      filename: body.filename,
      mimeType: body.mimeType,
      size: body.size,
      status: FILE_STATUS.UPLOADING,
      storageKey: result.storageKey,
      createdBy: userId,
      createdAt: result.file.createdAt,
    },
  });

  return createResponse(201, {
    fileId: result.fileId,
    storageKey: result.storageKey,
    uploadUrl: result.uploadUrl,
  });
};

// ============================================================================
// CONFIRM UPLOAD
// ============================================================================

const handleConfirmUpload = async (scope, fileId, userId) => {
  const file = await getFile(scope, fileId);
  if (!file) {
    return createResponse(404, { error: "File not found" });
  }

  if (file.status !== FILE_STATUS.UPLOADING) {
    return createResponse(400, { error: `Cannot confirm file in ${file.status} status` });
  }

  const updated = await updateFileStatus(scope, fileId, FILE_STATUS.READY, userId);

  const conversationId = file.projectId
    ? `project#${file.projectId}`
    : `org#${file.orgId}`;

  await emitFileEvent("fileUpdated", {
    projectId: file.projectId,
    orgId: file.orgId,
    conversationId,
    fileId,
    changes: {
      status: FILE_STATUS.READY,
    },
    updatedBy: userId,
  });

  return createResponse(200, {
    file: {
      ...updated,
      url: buildFileUrl(updated.storageKey),
      thumbnailUrl: updated.thumbnailKey ? buildFileUrl(updated.thumbnailKey) : undefined,
    },
  });
};

// ============================================================================
// GET FILE
// ============================================================================

const handleGetFile = async (scope, fileId) => {
  const file = await getFile(scope, fileId);
  if (!file) {
    return createResponse(404, { error: "File not found" });
  }

  const refCount = await getRefCount(fileId);

  return createResponse(200, {
    file: {
      ...file,
      url: buildFileUrl(file.storageKey),
      thumbnailUrl: file.thumbnailKey ? buildFileUrl(file.thumbnailKey) : undefined,
      embedUrl: file.embedKey ? buildFileUrl(file.embedKey) : undefined,
      refCount,
    },
  });
};

// ============================================================================
// UPDATE FILE
// ============================================================================

const handleUpdateFile = async (scope, fileId, event, userId) => {
  const file = await getFile(scope, fileId);
  if (!file) {
    return createResponse(404, { error: "File not found" });
  }

  if (file.status === FILE_STATUS.DELETED) {
    return createResponse(400, { error: "Cannot update deleted file" });
  }

  const body = parseBody(event);
  const updates = {};
  if (body.filename) updates.filename = body.filename;

  if (Object.keys(updates).length === 0) {
    return createResponse(400, { error: "No valid updates provided" });
  }

  const updated = await updateFileMetadata(scope, fileId, updates);

  const conversationId = file.projectId
    ? `project#${file.projectId}`
    : `org#${file.orgId}`;

  await emitFileEvent("fileUpdated", {
    projectId: file.projectId,
    orgId: file.orgId,
    conversationId,
    fileId,
    changes: updates,
    updatedBy: userId,
  });

  return createResponse(200, { file: updated });
};

// ============================================================================
// DELETE FILE (SOFT DELETE)
// ============================================================================

const handleDeleteFile = async (scope, fileId, query, userId) => {
  const file = await getFile(scope, fileId);
  if (!file) {
    return createResponse(404, { error: "File not found" });
  }

  if (file.status === FILE_STATUS.DELETED) {
    return createResponse(400, { error: "File already deleted" });
  }

  // Check ref count and warn unless force=true
  const refCount = await getRefCount(fileId);
  if (refCount > 0 && query.force !== "true") {
    return createResponse(409, {
      error: "File is in use",
      refCount,
      message: `This file is referenced in ${refCount} place(s). Add ?force=true to delete anyway.`,
    });
  }

  const deleted = await softDeleteFile(scope, fileId, userId);

  const conversationId = file.projectId
    ? `project#${file.projectId}`
    : `org#${file.orgId}`;

  await emitFileEvent("fileDeleted", {
    projectId: file.projectId,
    orgId: file.orgId,
    conversationId,
    fileId,
    deletedBy: userId,
    deletedAt: deleted.deletedAt,
    refCount,
  });

  return createResponse(200, {
    message: "File deleted",
    fileId,
    refCount,
    canRestore: true,
    restoreDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
};

// ============================================================================
// RESTORE FILE
// ============================================================================

const handleRestoreFile = async (scope, fileId, userId) => {
  const file = await getFile(scope, fileId);
  if (!file) {
    return createResponse(404, { error: "File not found" });
  }

  if (file.status !== FILE_STATUS.DELETED) {
    return createResponse(400, { error: "File is not deleted" });
  }

  const restored = await restoreFile(scope, fileId, userId);

  const conversationId = file.projectId
    ? `project#${file.projectId}`
    : `org#${file.orgId}`;

  await emitFileEvent("fileRestored", {
    projectId: file.projectId,
    orgId: file.orgId,
    conversationId,
    fileId,
    restoredBy: userId,
  });

  return createResponse(200, {
    message: "File restored",
    file: {
      ...restored,
      url: buildFileUrl(restored.storageKey),
    },
  });
};

// ============================================================================
// DELETE BY STORAGE KEY (LEGACY INTEGRATION)
// ============================================================================

const handleDeleteByStorageKey = async (query, userId) => {
  const { storageKey, force } = query;

  if (!storageKey) {
    return createResponse(400, { error: "Missing storageKey parameter" });
  }

  // Look up file by storage key
  const file = await getFileByStorageKey(storageKey);

  if (!file) {
    // File not in Files table - might be a legacy file not yet migrated
    // Return success to not block the deletion
    return createResponse(200, {
      message: "File not found in registry (legacy file)",
      fileId: null,
      refCount: 0,
    });
  }

  if (file.status === FILE_STATUS.DELETED) {
    return createResponse(200, {
      message: "File already deleted",
      fileId: file.fileId,
    });
  }

  // Check ref count and warn unless force=true
  const refCount = await getRefCount(file.fileId);
  if (refCount > 0 && force !== "true") {
    return createResponse(409, {
      error: "File is in use",
      refCount,
      message: `This file is referenced in ${refCount} place(s). Add ?force=true to delete anyway.`,
    });
  }

  const deleted = await softDeleteFile(file.scope, file.fileId, userId);

  const conversationId = file.projectId
    ? `project#${file.projectId}`
    : `org#${file.orgId}`;

  await emitFileEvent("fileDeleted", {
    projectId: file.projectId,
    orgId: file.orgId,
    conversationId,
    fileId: file.fileId,
    deletedBy: userId,
    deletedAt: deleted.deletedAt,
    refCount,
  });

  return createResponse(200, {
    message: "File deleted",
    fileId: file.fileId,
    refCount,
    canRestore: true,
    restoreDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
};

// ============================================================================
// REGISTER EXISTING FILE (BACKFILL MIGRATION)
// ============================================================================

const handleRegisterExistingFile = async (scopeType, scopeId, event, userId) => {
  if (!scopeId) {
    return createResponse(400, { error: `Missing ${scopeType}Id` });
  }

  const body = parseBody(event);
  const validation = validateRequired(body, ["storageKey", "filename", "mimeType"]);
  if (validation) return validation;

  const scope = `${scopeType}#${scopeId}`;

  // Check if file already exists by storage key
  const existing = await getFileByStorageKey(body.storageKey);
  if (existing) {
    return createResponse(200, {
      message: "File already registered",
      fileId: existing.fileId,
      storageKey: existing.storageKey,
      uploadUrl: null,
      alreadyExists: true,
    });
  }

  // Create file record directly in READY status (no upload needed)
  const result = await createFileRecord({
    scope,
    filename: body.filename,
    mimeType: body.mimeType,
    size: body.size || 0,
    createdBy: userId,
    ...(scopeType === 'project' ? { projectId: scopeId } : { orgId: scopeId }),
    storageKey: body.storageKey, // Use provided storage key
    status: FILE_STATUS.READY, // Already uploaded
  });

  return createResponse(201, {
    message: "File registered",
    fileId: result.fileId,
    storageKey: result.storageKey,
    uploadUrl: null,
    alreadyExists: false,
  });
};

// ============================================================================
// REFERENCES
// ============================================================================

const handleGetRefs = async (fileId) => {
  const refs = await getRefsForFile(fileId);

  // Group by container type
  const grouped = refs.reduce((acc, ref) => {
    acc[ref.containerType] = acc[ref.containerType] || [];
    acc[ref.containerType].push({
      containerId: ref.containerId,
      usageType: ref.usageType,
      createdAt: ref.createdAt,
    });
    return acc;
  }, {});

  return createResponse(200, {
    fileId,
    count: refs.length,
    refs,
    grouped,
  });
};

const handleAddRef = async (scope, fileId, event, userId) => {
  const file = await getFile(scope, fileId);
  if (!file) {
    return createResponse(404, { error: "File not found" });
  }

  if (file.status === FILE_STATUS.DELETED) {
    return createResponse(400, { error: "Cannot reference deleted file" });
  }

  const body = parseBody(event);
  const validation = validateRequired(body, ["containerType", "containerId"]);
  if (validation) return validation;

  const ref = await createFileRef({
    fileId,
    containerType: body.containerType,
    containerId: body.containerId,
    usageType: body.usageType,
    filename: file.filename,
    mimeType: file.mimeType,
    thumbnailUrl: file.thumbnailKey ? buildFileUrl(file.thumbnailKey) : undefined,
    createdBy: userId,
  });

  const conversationId = file.projectId
    ? `project#${file.projectId}`
    : `org#${file.orgId}`;

  await emitFileEvent("fileRefAdded", {
    projectId: file.projectId,
    orgId: file.orgId,
    conversationId,
    fileId,
    containerType: body.containerType,
    containerId: body.containerId,
    usageType: body.usageType,
    addedBy: userId,
  });

  return createResponse(201, { ref });
};

const handleRemoveRef = async (scope, fileId, containerType, containerId, userId) => {
  const file = await getFile(scope, fileId);
  if (!file) {
    return createResponse(404, { error: "File not found" });
  }

  await removeFileRef(fileId, containerType, containerId);

  const conversationId = file.projectId
    ? `project#${file.projectId}`
    : `org#${file.orgId}`;

  await emitFileEvent("fileRefRemoved", {
    projectId: file.projectId,
    orgId: file.orgId,
    conversationId,
    fileId,
    containerType,
    containerId,
    removedBy: userId,
  });

  return createResponse(200, { message: "Reference removed" });
};

// ============================================================================
// WEBSOCKET EVENT EMISSION
// ============================================================================

const emitFileEvent = async (action, payload) => {
  try {
    await sendToWebSocket({
      action,
      ...payload,
    });
  } catch (err) {
    // Log but don't fail the request
    console.error("⚠️ Failed to emit WebSocket event:", action, err);
  }
};
