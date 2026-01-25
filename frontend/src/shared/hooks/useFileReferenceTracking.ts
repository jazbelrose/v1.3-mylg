/**
 * useFileReferenceTracking
 * 
 * Hook for tracking file references when files are used in containers
 * (slides, tasks, invoices, messages, etc.)
 * 
 * This integrates with the File Lifecycle system to maintain
 * reference counts for orphan detection and prevent accidental deletion.
 * 
 * Usage:
 *   const { trackFileUsage, removeFileUsage } = useFileReferenceTracking();
 *   
 *   // When adding an image to a slide:
 *   await trackFileUsage(imageUrl, 'slide', slideId, 'background');
 *   
 *   // When removing an image from a slide:
 *   await removeFileUsage(imageUrl, 'slide', slideId);
 */

import { useCallback } from 'react';
import { addFileRef, registerExistingFile } from '@/shared/api/fileLifecycleApi';
import type { ContainerType, UsageType } from '@/shared/types/fileLifecycle';

// Feature flags (same as useFileLifecycleIntegration)
const FILE_LIFECYCLE_ENABLED = import.meta.env.VITE_FILE_LIFECYCLE_ENABLED !== 'false';
const FILE_LIFECYCLE_WRITE = import.meta.env.VITE_FILE_LIFECYCLE_WRITE === 'true';

/**
 * Parse CDN or S3 URL to extract storage key
 */
function extractStorageKey(url: string): string | null {
  try {
    const urlObj = new URL(url);
    // CDN URL: https://cdn.mylg.app/public/projects/{id}/...
    // S3 URL: https://bucket.s3.amazonaws.com/public/projects/{id}/...
    const path = urlObj.pathname;
    if (path.startsWith('/public/')) {
      return path.slice(1); // Remove leading slash
    }
    return null;
  } catch {
    // Not a valid URL, maybe it's already a storage key
    if (url.startsWith('public/')) {
      return url;
    }
    return null;
  }
}

/**
 * Parse storage key to extract scope info
 */
function parseStorageKey(storageKey: string): {
  scope: 'project' | 'org';
  scopeId: string;
} | null {
  // Format: public/projects/{projectId}/...
  const projectMatch = storageKey.match(/public\/projects\/([^/]+)\//);
  if (projectMatch) {
    return { scope: 'project', scopeId: projectMatch[1] };
  }

  // Format: public/orgs/{orgId}/...
  const orgMatch = storageKey.match(/public\/orgs\/([^/]+)\//);
  if (orgMatch) {
    return { scope: 'org', scopeId: orgMatch[1] };
  }

  return null;
}

/**
 * Get filename from storage key
 */
function getFilename(storageKey: string): string {
  const parts = storageKey.split('/');
  return parts[parts.length - 1] || 'unknown';
}

/**
 * Get MIME type from filename
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
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

export interface UseFileReferenceTrackingResult {
  /**
   * Track that a file is being used in a container
   * Creates File record if needed, then adds a reference
   */
  trackFileUsage: (
    fileUrl: string,
    containerType: ContainerType,
    containerId: string,
    usageType?: UsageType
  ) => Promise<string | null>;

  /**
   * Remove a file reference from a container
   */
  removeFileUsage: (
    fileUrl: string,
    containerType: ContainerType,
    containerId: string
  ) => Promise<void>;

  /**
   * Check if reference tracking is enabled
   */
  isEnabled: boolean;
}

export function useFileReferenceTracking(): UseFileReferenceTrackingResult {
  /**
   * Track file usage in a container
   */
  const trackFileUsage = useCallback(async (
    fileUrl: string,
    containerType: ContainerType,
    containerId: string,
    usageType?: UsageType
  ): Promise<string | null> => {
    if (!FILE_LIFECYCLE_ENABLED || !FILE_LIFECYCLE_WRITE) {
      if (import.meta.env.DEV) {
        console.log('[FileRefTracking] Disabled, skipping:', { fileUrl, containerType, containerId });
      }
      return null;
    }

    try {
      const storageKey = extractStorageKey(fileUrl);
      if (!storageKey) {
        console.warn('[FileRefTracking] Could not extract storage key from URL:', fileUrl);
        return null;
      }

      const scopeInfo = parseStorageKey(storageKey);
      if (!scopeInfo) {
        console.warn('[FileRefTracking] Could not parse scope from storage key:', storageKey);
        return null;
      }

      const filename = getFilename(storageKey);
      const mimeType = getMimeType(filename);

      // Register file if it doesn't exist
      const createResult = await registerExistingFile(scopeInfo.scope, scopeInfo.scopeId, {
        storageKey,
        filename,
        mimeType,
        size: 0, // Unknown from URL
      });

      // Add reference
      const fileScope = `${scopeInfo.scope}#${scopeInfo.scopeId}`;
      await addFileRef(fileScope, createResult.fileId, {
        containerType,
        containerId,
        usageType,
      });

      if (import.meta.env.DEV) {
        console.log('[FileRefTracking] Added reference:', {
          fileId: createResult.fileId,
          containerType,
          containerId,
        });
      }

      return createResult.fileId;
    } catch (error) {
      // Don't fail the operation if reference tracking fails
      console.error('[FileRefTracking] Failed to track file usage:', error);
      return null;
    }
  }, []);

  /**
   * Remove file reference from a container
   */
  const removeFileUsage = useCallback(async (
    fileUrl: string,
    containerType: ContainerType,
    containerId: string
  ): Promise<void> => {
    if (!FILE_LIFECYCLE_ENABLED || !FILE_LIFECYCLE_WRITE) {
      return;
    }

    try {
      const storageKey = extractStorageKey(fileUrl);
      if (!storageKey) return;

      const scopeInfo = parseStorageKey(storageKey);
      if (!scopeInfo) return;

      // We need the fileId to remove the ref, but we don't have it
      // For now, we'll need to look it up or skip
      // This would require an API to lookup file by storage key
      console.log('[FileRefTracking] removeFileUsage not fully implemented yet', {
        storageKey,
        containerType,
        containerId,
      });
    } catch (error) {
      console.error('[FileRefTracking] Failed to remove file reference:', error);
    }
  }, []);

  return {
    trackFileUsage,
    removeFileUsage,
    isEnabled: FILE_LIFECYCLE_ENABLED && FILE_LIFECYCLE_WRITE,
  };
}

export default useFileReferenceTracking;
