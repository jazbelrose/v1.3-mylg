/**
 * Files Data Access Layer
 * Manages canonical File records and FileRefs
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { S3Client, DeleteObjectsCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { ulid } from "ulid";

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

const FILES_TABLE = process.env.FILES_TABLE || "Files";
const FILE_REFS_TABLE = process.env.FILE_REFS_TABLE || "FileRefs";
const S3_BUCKET = process.env.FILE_BUCKET || process.env.S3_BUCKET || "mylg-files-v12";
const CDN_URL = process.env.FILE_CDN || "";

// Soft delete retention period (30 days)
const SOFT_DELETE_RETENTION_DAYS = 30;

// ============================================================================
// FILE RECORD OPERATIONS
// ============================================================================

/**
 * Create a new file record (before S3 upload)
 * @param {Object} params
 * @param {string} params.scope - "project#<id>" or "org#<id>"
 * @param {string} params.filename
 * @param {string} params.mimeType
 * @param {number} params.size
 * @param {string} params.createdBy
 * @param {string} [params.projectId]
 * @param {string} [params.orgId]
 * @returns {Promise<{fileId, storageKey, uploadUrl, file}>}
 */
export const createFileRecord = async ({
  scope,
  filename,
  mimeType,
  size,
  createdBy,
  projectId,
  orgId,
}) => {
  const fileId = ulid();
  const now = new Date().toISOString();
  
  // Build storage key based on scope
  const prefix = projectId
    ? `public/projects/${projectId}/uploads/`
    : `public/orgs/${orgId}/uploads/`;
  
  // Sanitize filename and add unique suffix
  const sanitized = sanitizeFilename(filename);
  const ext = getExtension(sanitized);
  const baseName = sanitized.replace(ext, "");
  const storageKey = `${prefix}${baseName}_${fileId.slice(-8)}${ext}`;

  const file = {
    PK: scope,
    fileId,
    storageKey,
    bucket: S3_BUCKET,
    filename,
    mimeType,
    size,
    status: "UPLOADING",
    createdAt: now,
    createdBy,
    updatedAt: now,
    ...(projectId && { projectId }),
    ...(orgId && { orgId }),
  };

  await dynamoDb.send(
    new PutCommand({
      TableName: FILES_TABLE,
      Item: file,
      ConditionExpression: "attribute_not_exists(fileId)",
    })
  );

  // Generate presigned upload URL
  const uploadUrl = await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: storageKey,
      ContentType: mimeType,
    }),
    { expiresIn: 3600 }
  );

  return { fileId, storageKey, uploadUrl, file };
};

/**
 * Get a file record by ID
 */
export const getFile = async (scope, fileId) => {
  const result = await dynamoDb.send(
    new GetCommand({
      TableName: FILES_TABLE,
      Key: { PK: scope, fileId },
    })
  );
  return result.Item || null;
};

/**
 * Get file by storage key (S3 key lookup)
 */
export const getFileByStorageKey = async (storageKey) => {
  const result = await dynamoDb.send(
    new QueryCommand({
      TableName: FILES_TABLE,
      IndexName: "storageKey-index",
      KeyConditionExpression: "storageKey = :key",
      ExpressionAttributeValues: { ":key": storageKey },
      Limit: 1,
    })
  );
  return result.Items?.[0] || null;
};

/**
 * List files in a scope (project or org)
 */
export const listFiles = async (scope, options = {}) => {
  const { limit = 100, lastKey, includeDeleted = false } = options;

  let filterExpression = undefined;
  let expressionAttributeValues = { ":pk": scope };

  if (!includeDeleted) {
    filterExpression = "#status <> :deleted";
    expressionAttributeValues[":deleted"] = "DELETED";
  }

  const result = await dynamoDb.send(
    new QueryCommand({
      TableName: FILES_TABLE,
      KeyConditionExpression: "PK = :pk",
      FilterExpression: filterExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: filterExpression ? { "#status": "status" } : undefined,
      Limit: limit,
      ExclusiveStartKey: lastKey,
      ScanIndexForward: false,
    })
  );

  return {
    files: result.Items || [],
    lastKey: result.LastEvaluatedKey,
  };
};

/**
 * Update file status (UPLOADING → READY, READY → DELETED, etc.)
 */
export const updateFileStatus = async (scope, fileId, status, userId) => {
  const now = new Date().toISOString();
  const updateExpr = ["#status = :status", "updatedAt = :now"];
  const exprValues = { ":status": status, ":now": now };
  const exprNames = { "#status": "status" };

  if (status === "DELETED") {
    updateExpr.push("deletedAt = :deletedAt", "deletedBy = :deletedBy", "hardDeleteAt = :ttl");
    exprValues[":deletedAt"] = now;
    exprValues[":deletedBy"] = userId;
    // TTL: 30 days from now in Unix seconds
    exprValues[":ttl"] = Math.floor(Date.now() / 1000) + SOFT_DELETE_RETENTION_DAYS * 24 * 60 * 60;
  }

  if (status === "READY") {
    // Remove TTL if restoring
    updateExpr.push("deletedAt = :null", "deletedBy = :null");
    exprValues[":null"] = null;
  }

  const result = await dynamoDb.send(
    new UpdateCommand({
      TableName: FILES_TABLE,
      Key: { PK: scope, fileId },
      UpdateExpression: `SET ${updateExpr.join(", ")} REMOVE ${status === "READY" ? "hardDeleteAt" : ""}`.replace(
        / REMOVE $/,
        ""
      ),
      ExpressionAttributeValues: exprValues,
      ExpressionAttributeNames: exprNames,
      ReturnValues: "ALL_NEW",
    })
  );

  return result.Attributes;
};

/**
 * Update file metadata (rename)
 */
export const updateFileMetadata = async (scope, fileId, updates) => {
  const now = new Date().toISOString();
  const updateParts = ["updatedAt = :now"];
  const exprValues = { ":now": now };
  const exprNames = {};

  if (updates.filename) {
    updateParts.push("filename = :filename");
    exprValues[":filename"] = updates.filename;
  }

  if (updates.thumbnailKey) {
    updateParts.push("thumbnailKey = :thumbKey");
    exprValues[":thumbKey"] = updates.thumbnailKey;
  }

  if (updates.embedKey) {
    updateParts.push("embedKey = :embedKey");
    exprValues[":embedKey"] = updates.embedKey;
  }

  const result = await dynamoDb.send(
    new UpdateCommand({
      TableName: FILES_TABLE,
      Key: { PK: scope, fileId },
      UpdateExpression: `SET ${updateParts.join(", ")}`,
      ExpressionAttributeValues: exprValues,
      ExpressionAttributeNames: Object.keys(exprNames).length ? exprNames : undefined,
      ReturnValues: "ALL_NEW",
    })
  );

  return result.Attributes;
};

/**
 * Soft delete a file
 */
export const softDeleteFile = async (scope, fileId, userId) => {
  return updateFileStatus(scope, fileId, "DELETED", userId);
};

/**
 * Restore a soft-deleted file
 */
export const restoreFile = async (scope, fileId, userId) => {
  return updateFileStatus(scope, fileId, "READY", userId);
};

/**
 * Hard delete (after TTL or explicit purge)
 */
export const hardDeleteFile = async (scope, fileId) => {
  // Get file to find S3 keys
  const file = await getFile(scope, fileId);
  if (!file) return null;

  // Delete S3 objects
  const keysToDelete = [file.storageKey, file.thumbnailKey, file.embedKey].filter(Boolean);
  if (keysToDelete.length > 0) {
    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: S3_BUCKET,
        Delete: { Objects: keysToDelete.map((Key) => ({ Key })) },
      })
    );
  }

  // Delete all refs
  await deleteAllRefsForFile(fileId);

  // Delete file record
  await dynamoDb.send(
    new DeleteCommand({
      TableName: FILES_TABLE,
      Key: { PK: scope, fileId },
    })
  );

  return file;
};

// ============================================================================
// FILE REF OPERATIONS
// ============================================================================

/**
 * Create a file reference
 */
export const createFileRef = async ({
  fileId,
  containerType,
  containerId,
  usageType,
  filename,
  mimeType,
  thumbnailUrl,
  createdBy,
}) => {
  const now = new Date().toISOString();

  const ref = {
    PK: `file#${fileId}`,
    SK: `${containerType}#${containerId}`,
    GSI1PK: `${containerType}#${containerId}`,
    GSI1SK: `file#${fileId}`,
    containerType,
    containerId,
    fileId,
    usageType: usageType || "attachment",
    filename,
    mimeType,
    thumbnailUrl,
    createdAt: now,
    createdBy,
  };

  await dynamoDb.send(
    new PutCommand({
      TableName: FILE_REFS_TABLE,
      Item: ref,
    })
  );

  return ref;
};

/**
 * Get all refs for a file
 */
export const getRefsForFile = async (fileId) => {
  const result = await dynamoDb.send(
    new QueryCommand({
      TableName: FILE_REFS_TABLE,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `file#${fileId}` },
    })
  );
  return result.Items || [];
};

/**
 * Get ref count for a file
 */
export const getRefCount = async (fileId) => {
  const result = await dynamoDb.send(
    new QueryCommand({
      TableName: FILE_REFS_TABLE,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `file#${fileId}` },
      Select: "COUNT",
    })
  );
  return result.Count || 0;
};

/**
 * Get files for a container (slide, message, task, etc.)
 */
export const getFilesForContainer = async (containerType, containerId) => {
  const result = await dynamoDb.send(
    new QueryCommand({
      TableName: FILE_REFS_TABLE,
      IndexName: "container-index",
      KeyConditionExpression: "GSI1PK = :gsi1pk",
      ExpressionAttributeValues: { ":gsi1pk": `${containerType}#${containerId}` },
    })
  );
  return result.Items || [];
};

/**
 * Remove a specific ref
 */
export const removeFileRef = async (fileId, containerType, containerId) => {
  await dynamoDb.send(
    new DeleteCommand({
      TableName: FILE_REFS_TABLE,
      Key: {
        PK: `file#${fileId}`,
        SK: `${containerType}#${containerId}`,
      },
    })
  );
};

/**
 * Delete all refs for a file (used in hard delete)
 */
export const deleteAllRefsForFile = async (fileId) => {
  const refs = await getRefsForFile(fileId);
  if (refs.length === 0) return;

  // Batch delete in chunks of 25
  const chunks = [];
  for (let i = 0; i < refs.length; i += 25) {
    chunks.push(refs.slice(i, i + 25));
  }

  for (const chunk of chunks) {
    await dynamoDb.send(
      new BatchWriteCommand({
        RequestItems: {
          [FILE_REFS_TABLE]: chunk.map((ref) => ({
            DeleteRequest: { Key: { PK: ref.PK, SK: ref.SK } },
          })),
        },
      })
    );
  }
};

/**
 * Delete all refs for a container (when container is deleted)
 */
export const deleteAllRefsForContainer = async (containerType, containerId) => {
  const refs = await getFilesForContainer(containerType, containerId);
  if (refs.length === 0) return;

  for (const ref of refs) {
    await removeFileRef(ref.fileId, containerType, containerId);
  }

  return refs;
};

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Build CDN URL from storage key
 */
export const buildFileUrl = (storageKey, type = "original") => {
  const baseUrl = CDN_URL || `https://${S3_BUCKET}.s3.amazonaws.com`;

  switch (type) {
    case "thumbnail":
      return `${baseUrl}/${getThumbnailKey(storageKey)}`;
    case "embed":
      return `${baseUrl}/${getEmbedKey(storageKey)}`;
    default:
      return `${baseUrl}/${storageKey}`;
  }
};

/**
 * Get thumbnail key from original key
 */
export const getThumbnailKey = (storageKey) => {
  // uploads/file.jpg → uploads_thumbnails/file.webp
  return storageKey
    .replace("/uploads/", "/uploads_thumbnails/")
    .replace(/\.[^.]+$/, ".webp");
};

/**
 * Get embed rendition key from original key
 */
export const getEmbedKey = (storageKey) => {
  // uploads/file.jpg → uploads_embed/file.jpg
  return storageKey.replace("/uploads/", "/uploads_embed/");
};

/**
 * Sanitize filename for S3 key
 */
const sanitizeFilename = (filename) => {
  return filename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
    .replace(/[^a-zA-Z0-9._-]/g, "_") // Replace special chars
    .replace(/_+/g, "_") // Collapse multiple underscores
    .substring(0, 200); // Limit length
};

/**
 * Get file extension
 */
const getExtension = (filename) => {
  const match = filename.match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : "";
};

/**
 * Check if S3 object exists
 */
export const s3ObjectExists = async (key) => {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      })
    );
    return true;
  } catch (err) {
    if (err.name === "NotFound") return false;
    throw err;
  }
};

// ============================================================================
// CONTAINER TYPE CONSTANTS
// ============================================================================

export const CONTAINER_TYPES = {
  SLIDE: "slide",
  MESSAGE: "message",
  TASK: "task",
  BUDGET: "budget",
  ORG: "org",
  LEXICAL: "lexical",
  GALLERY: "gallery",
  PROJECT: "project",
  USER: "user",
};

export const USAGE_TYPES = {
  ATTACHMENT: "attachment",
  BACKGROUND: "background",
  ELEMENT: "element",
  LOGO: "logo",
  THUMBNAIL: "thumbnail",
  INVOICE: "invoice",
  AVATAR: "avatar",
  PAGE: "page",
};

export const FILE_STATUS = {
  UPLOADING: "UPLOADING",
  READY: "READY",
  FAILED: "FAILED",
  DELETED: "DELETED",
};
