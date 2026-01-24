/**
 * File Lifecycle API Client
 * Frontend API for canonical file management
 */

import { FILES_SERVICE_URL } from '@/shared/utils/api';

/**
 * Base URL for the Files service
 * Uses the dedicated files service endpoint
 */
const FILES_API_BASE = FILES_SERVICE_URL;

import type {
  FileRecord,
  CreateFileResponse,
  GetFileResponse,
  GetRefsResponse,
  DeleteFileResponse,
  ListFilesResponse,
  ContainerType,
  UsageType,
  UploadOptions,
  FileUploadResult,
} from '@/shared/types/fileLifecycle';

const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

// ============================================================================
// LIST FILES
// ============================================================================

export async function listProjectFiles(
  projectId: string,
  options?: { limit?: number; cursor?: string; includeDeleted?: boolean }
): Promise<ListFilesResponse> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.cursor) params.set('cursor', options.cursor);
  if (options?.includeDeleted) params.set('includeDeleted', 'true');

  const url = `${FILES_API_BASE}/projects/${projectId}/files${params.toString() ? `?${params}` : ''}`;
  const res = await fetch(url, { headers: getAuthHeaders() });

  if (!res.ok) {
    throw new Error(`Failed to list files: ${res.statusText}`);
  }

  return res.json();
}

export async function listOrgFiles(
  orgId: string,
  options?: { limit?: number; cursor?: string; includeDeleted?: boolean }
): Promise<ListFilesResponse> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.cursor) params.set('cursor', options.cursor);
  if (options?.includeDeleted) params.set('includeDeleted', 'true');

  const url = `${FILES_API_BASE}/orgs/${orgId}/files${params.toString() ? `?${params}` : ''}`;
  const res = await fetch(url, { headers: getAuthHeaders() });

  if (!res.ok) {
    throw new Error(`Failed to list org files: ${res.statusText}`);
  }

  return res.json();
}

// ============================================================================
// CREATE / UPLOAD FILES
// ============================================================================

async function createFileRecord(
  scope: 'project' | 'org',
  scopeId: string,
  params: { filename: string; mimeType: string; size: number }
): Promise<CreateFileResponse> {
  const url =
    scope === 'project'
      ? `${FILES_API_BASE}/projects/${scopeId}/files`
      : `${FILES_API_BASE}/orgs/${scopeId}/files`;

  const res = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw new Error(`Failed to create file record: ${res.statusText}`);
  }

  return res.json();
}

async function confirmUpload(scope: string, fileId: string): Promise<FileRecord> {
  const url = `${FILES_API_BASE}/files/${encodeURIComponent(scope)}/${fileId}/confirm`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to confirm upload: ${res.statusText}`);
  }

  const data = await res.json();
  return data.file;
}

/**
 * Upload a file to a project
 * 1. Create file record (get presigned URL)
 * 2. Upload to S3
 * 3. Confirm upload
 */
export async function uploadProjectFile(
  projectId: string,
  options: UploadOptions
): Promise<FileUploadResult> {
  const { filename, mimeType, size, file, onProgress } = options;

  // 1. Create file record
  const { fileId, storageKey, uploadUrl } = await createFileRecord('project', projectId, {
    filename,
    mimeType,
    size,
  });

  // 2. Upload to S3 with progress
  await uploadToS3(uploadUrl, file, mimeType, onProgress);

  // 3. Confirm upload complete
  const scope = `project#${projectId}`;
  const confirmed = await confirmUpload(scope, fileId);

  return {
    fileId,
    storageKey,
    url: confirmed.url || '',
    thumbnailUrl: confirmed.thumbnailUrl,
  };
}

/**
 * Upload a file to an org
 */
export async function uploadOrgFile(
  orgId: string,
  options: UploadOptions
): Promise<FileUploadResult> {
  const { filename, mimeType, size, file, onProgress } = options;

  const { fileId, storageKey, uploadUrl } = await createFileRecord('org', orgId, {
    filename,
    mimeType,
    size,
  });

  await uploadToS3(uploadUrl, file, mimeType, onProgress);

  const scope = `org#${orgId}`;
  const confirmed = await confirmUpload(scope, fileId);

  return {
    fileId,
    storageKey,
    url: confirmed.url || '',
    thumbnailUrl: confirmed.thumbnailUrl,
  };
}

async function uploadToS3(
  uploadUrl: string,
  file: File,
  mimeType: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress((e.loaded / e.total) * 100);
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed: ${xhr.statusText}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed'));
    });

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', mimeType);
    xhr.send(file);
  });
}

// ============================================================================
// GET / UPDATE / DELETE FILES
// ============================================================================

export async function getFile(scope: string, fileId: string): Promise<GetFileResponse> {
  const url = `${FILES_API_BASE}/files/${encodeURIComponent(scope)}/${fileId}`;
  const res = await fetch(url, { headers: getAuthHeaders() });

  if (!res.ok) {
    throw new Error(`Failed to get file: ${res.statusText}`);
  }

  return res.json();
}

export async function renameFile(
  scope: string,
  fileId: string,
  filename: string
): Promise<FileRecord> {
  const url = `${FILES_API_BASE}/files/${encodeURIComponent(scope)}/${fileId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ filename }),
  });

  if (!res.ok) {
    throw new Error(`Failed to rename file: ${res.statusText}`);
  }

  const data = await res.json();
  return data.file;
}

export interface DeleteFileOptions {
  force?: boolean;
}

export interface DeleteFileResult {
  success: boolean;
  refCount?: number;
  requiresForce?: boolean;
  message?: string;
}

export async function deleteFile(
  scope: string,
  fileId: string,
  options?: DeleteFileOptions
): Promise<DeleteFileResult> {
  const params = options?.force ? '?force=true' : '';
  const url = `${FILES_API_BASE}/files/${encodeURIComponent(scope)}/${fileId}${params}`;

  const res = await fetch(url, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (res.status === 409) {
    const data = await res.json();
    return {
      success: false,
      refCount: data.refCount,
      requiresForce: true,
      message: data.message,
    };
  }

  if (!res.ok) {
    throw new Error(`Failed to delete file: ${res.statusText}`);
  }

  const data: DeleteFileResponse = await res.json();
  return {
    success: true,
    refCount: data.refCount,
  };
}

export async function restoreFile(scope: string, fileId: string): Promise<FileRecord> {
  const url = `${FILES_API_BASE}/files/${encodeURIComponent(scope)}/${fileId}/restore`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to restore file: ${res.statusText}`);
  }

  const data = await res.json();
  return data.file;
}

// ============================================================================
// FILE REFERENCES
// ============================================================================

export async function getFileRefs(fileId: string): Promise<GetRefsResponse> {
  // We need the scope but refs endpoint might work without it
  // For now, assume fileId is globally unique
  const url = `${FILES_API_BASE}/files/_/${fileId}/refs`;
  const res = await fetch(url, { headers: getAuthHeaders() });

  if (!res.ok) {
    throw new Error(`Failed to get file refs: ${res.statusText}`);
  }

  return res.json();
}

export async function addFileRef(
  scope: string,
  fileId: string,
  params: {
    containerType: ContainerType;
    containerId: string;
    usageType?: UsageType;
  }
): Promise<void> {
  const url = `${FILES_API_BASE}/files/${encodeURIComponent(scope)}/${fileId}/refs`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw new Error(`Failed to add file ref: ${res.statusText}`);
  }
}

export async function removeFileRef(
  scope: string,
  fileId: string,
  containerType: ContainerType,
  containerId: string
): Promise<void> {
  const url = `${FILES_API_BASE}/files/${encodeURIComponent(scope)}/${fileId}/refs/${containerType}/${containerId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to remove file ref: ${res.statusText}`);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Build scope string from projectId or orgId
 */
export function buildScope(projectId?: string, orgId?: string): string {
  if (projectId) return `project#${projectId}`;
  if (orgId) return `org#${orgId}`;
  throw new Error('Either projectId or orgId is required');
}

/**
 * Parse scope string to get type and ID
 */
export function parseScope(scope: string): { type: 'project' | 'org'; id: string } {
  if (scope.startsWith('project#')) {
    return { type: 'project', id: scope.replace('project#', '') };
  }
  if (scope.startsWith('org#')) {
    return { type: 'org', id: scope.replace('org#', '') };
  }
  throw new Error(`Invalid scope: ${scope}`);
}
