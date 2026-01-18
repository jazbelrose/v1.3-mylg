/**
 * useFileListCache - Cache file lists with stale-while-revalidate
 * 
 * Features:
 * - Caches file lists by {projectId, folderKey}
 * - Returns cached data immediately on reopen
 * - Refreshes in background (stale-while-revalidate)
 * - TTL-based expiry (configurable, default 2 minutes)
 * - Preserves scroll position per folder
 */

import { useCallback, useRef } from 'react';
import type { FileItem } from '../../FileManager/FileManagerTypes';

interface CacheEntry {
  files: FileItem[];
  timestamp: number;
  scrollPosition: number;
}

const DEFAULT_TTL_MS = 2 * 60 * 1000; // 2 minutes

// Global cache (persists across hook instances)
const fileListCache = new Map<string, CacheEntry>();

function getCacheKey(projectId: string, folderKey: string): string {
  return `${projectId}::${folderKey}`;
}

export function useFileListCache(ttlMs: number = DEFAULT_TTL_MS) {
  const pendingRefreshes = useRef<Set<string>>(new Set());

  /**
   * Get cached file list if available and not expired
   */
  const getCached = useCallback((projectId: string, folderKey: string): CacheEntry | null => {
    const key = getCacheKey(projectId, folderKey);
    const entry = fileListCache.get(key);
    
    if (!entry) return null;
    
    return entry;
  }, []);

  /**
   * Check if cache is stale (beyond TTL but not deleted)
   */
  const isStale = useCallback((projectId: string, folderKey: string): boolean => {
    const key = getCacheKey(projectId, folderKey);
    const entry = fileListCache.get(key);
    
    if (!entry) return true;
    
    return Date.now() - entry.timestamp > ttlMs;
  }, [ttlMs]);

  /**
   * Update cache with new file list
   */
  const setCache = useCallback((projectId: string, folderKey: string, files: FileItem[], scrollPosition = 0) => {
    const key = getCacheKey(projectId, folderKey);
    fileListCache.set(key, {
      files,
      timestamp: Date.now(),
      scrollPosition,
    });
    pendingRefreshes.current.delete(key);
  }, []);

  /**
   * Update scroll position for a cached folder
   */
  const updateScrollPosition = useCallback((projectId: string, folderKey: string, scrollPosition: number) => {
    const key = getCacheKey(projectId, folderKey);
    const entry = fileListCache.get(key);
    
    if (entry) {
      fileListCache.set(key, {
        ...entry,
        scrollPosition,
      });
    }
  }, []);

  /**
   * Get scroll position for a folder
   */
  const getScrollPosition = useCallback((projectId: string, folderKey: string): number => {
    const key = getCacheKey(projectId, folderKey);
    return fileListCache.get(key)?.scrollPosition ?? 0;
  }, []);

  /**
   * Invalidate cache for a specific folder
   */
  const invalidate = useCallback((projectId: string, folderKey: string) => {
    const key = getCacheKey(projectId, folderKey);
    fileListCache.delete(key);
  }, []);

  /**
   * Invalidate all caches for a project
   */
  const invalidateProject = useCallback((projectId: string) => {
    const prefix = `${projectId}::`;
    for (const key of fileListCache.keys()) {
      if (key.startsWith(prefix)) {
        fileListCache.delete(key);
      }
    }
  }, []);

  /**
   * Mark that a background refresh is in progress
   */
  const markRefreshing = useCallback((projectId: string, folderKey: string) => {
    const key = getCacheKey(projectId, folderKey);
    pendingRefreshes.current.add(key);
  }, []);

  /**
   * Check if a background refresh is in progress
   */
  const isRefreshing = useCallback((projectId: string, folderKey: string): boolean => {
    const key = getCacheKey(projectId, folderKey);
    return pendingRefreshes.current.has(key);
  }, []);

  /**
   * Get cache stats for debugging
   */
  const getStats = useCallback(() => {
    const entries: Array<{ key: string; fileCount: number; age: number; isStale: boolean }> = [];
    const now = Date.now();
    
    for (const [key, entry] of fileListCache.entries()) {
      const age = now - entry.timestamp;
      entries.push({
        key,
        fileCount: entry.files.length,
        age,
        isStale: age > ttlMs,
      });
    }
    
    return {
      totalEntries: fileListCache.size,
      entries,
    };
  }, [ttlMs]);

  return {
    getCached,
    isStale,
    setCache,
    updateScrollPosition,
    getScrollPosition,
    invalidate,
    invalidateProject,
    markRefreshing,
    isRefreshing,
    getStats,
  };
}

// Export for testing/debugging
export { fileListCache };
