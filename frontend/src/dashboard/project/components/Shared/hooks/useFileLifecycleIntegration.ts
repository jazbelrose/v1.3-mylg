/**
 * useFileLifecycleIntegration
 * 
 * Hook that integrates the legacy File Manager with the new File Lifecycle system.
 * This provides a migration path where files deleted through the File Manager
 * also get tracked in the Files table for proper lifecycle management.
 * 
 * Feature flags:
 * - VITE_FILE_LIFECYCLE_ENABLED: Enable file lifecycle tracking (default: true)
 * - VITE_FILE_LIFECYCLE_WRITE: Write to Files table on operations (default: false for safety)
 */

import { useCallback } from 'react';
import {
  deleteFileByStorageKey,
  registerExistingFile,
  addFileRef,
} from '@/shared/api/fileLifecycleApi';
import type { ContainerType, UsageType } from '@/shared/types/fileLifecycle';

// Feature flags
const FILE_LIFECYCLE_ENABLED = import.meta.env.VITE_FILE_LIFECYCLE_ENABLED !== 'false';
const FILE_LIFECYCLE_WRITE = import.meta.env.VITE_FILE_LIFECYCLE_WRITE === 'true';

/**
 * Parse S3 key to extract file info
 */
function parseS3Key(s3Key: string): {
  scope: 'project' | 'org';
  scopeId: string;
  filename: string;
  folder: string;
} | null {
  // Format: public/projects/{projectId}/{folder}/{filename}
  // or: public/orgs/{orgId}/uploads/{filename}
  const projectMatch = s3Key.match(/public\/projects\/([^/]+)\/([^/]+)\/(.+)$/);
  if (projectMatch) {
    return {
      scope: 'project',
      scopeId: projectMatch[1],
      folder: projectMatch[2],
      filename: projectMatch[3],
    };
  }

  const orgMatch = s3Key.match(/public\/orgs\/([^/]+)\/([^/]+)\/(.+)$/);
  if (orgMatch) {
    return {
      scope: 'org',
      scopeId: orgMatch[1],
      folder: orgMatch[2],
      filename: orgMatch[3],
    };
  }

  return null;
}

/**
 * Get MIME type from filename extension
 */
function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip',
    txt: 'text/plain',
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

export function useFileLifecycleIntegration() {
  /**
   * Track a file deletion in the Files table
   * This is called AFTER the legacy delete succeeds
   */
  const trackFileDeletion = useCallback(async (
    s3Keys: string[]
  ): Promise<void> => {
    if (!FILE_LIFECYCLE_ENABLED || !FILE_LIFECYCLE_WRITE) {
      if (import.meta.env.DEV) {
        console.log('[FileLifecycle] Tracking disabled:', { keys: s3Keys, enabled: FILE_LIFECYCLE_ENABLED, write: FILE_LIFECYCLE_WRITE });
      }
      return;
    }

    for (const s3Key of s3Keys) {
      try {
        // Use the new deleteByStorageKey endpoint
        // This looks up the file by storage key and soft-deletes it
        await deleteFileByStorageKey(s3Key, { force: true });
        
        if (import.meta.env.DEV) {
          console.log('[FileLifecycle] Tracked deletion:', { s3Key });
        }
      } catch (error) {
        // Don't fail the overall delete operation if tracking fails
        console.error('[FileLifecycle] Failed to track deletion:', s3Key, error);
      }
    }
  }, []);

  /**
   * Register a file that's being used in a container
   * Creates a File record if it doesn't exist, then adds a reference
   */
  const registerFileUsage = useCallback(async (
    s3Key: string,
    containerType: ContainerType,
    containerId: string,
    usageType?: UsageType
  ): Promise<string | null> => {
    if (!FILE_LIFECYCLE_ENABLED || !FILE_LIFECYCLE_WRITE) {
      return null;
    }

    try {
      const parsed = parseS3Key(s3Key);
      if (!parsed) {
        console.warn('[FileLifecycle] Could not parse S3 key:', s3Key);
        return null;
      }

      const scopeId = parsed.scopeId;
      const scope = parsed.scope;
      const mimeType = getMimeType(parsed.filename);

      // Register existing file via the new endpoint
      const createResult = await registerExistingFile(scope, scopeId, {
        storageKey: s3Key,
        filename: parsed.filename,
        mimeType,
        size: 0, // We don't know the size from the URL
      });

      // Add reference
      const fileScope = `${scope}#${scopeId}`;
      await addFileRef(fileScope, createResult.fileId, {
        containerType,
        containerId,
        usageType,
      });

      return createResult.fileId;
    } catch (error) {
      console.error('[FileLifecycle] Failed to register file usage:', error);
      return null;
    }
  }, []);

  /**
   * Check if file lifecycle integration is active
   */
  const isEnabled = FILE_LIFECYCLE_ENABLED && FILE_LIFECYCLE_WRITE;

  return {
    trackFileDeletion,
    registerFileUsage,
    isEnabled,
    // Expose flags for debugging
    flags: {
      enabled: FILE_LIFECYCLE_ENABLED,
      write: FILE_LIFECYCLE_WRITE,
    },
  };
}
