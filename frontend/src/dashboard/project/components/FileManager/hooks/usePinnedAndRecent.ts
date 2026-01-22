/**
 * usePinnedAndRecent - Manage pinned files and track recently accessed files
 * 
 * Features:
 * - Pin/unpin files for quick access
 * - Track recently accessed files (files that were opened/previewed)
 * - Persisted to localStorage per project
 * - Maximum of 10 recent files, 20 pinned files
 */

import { useCallback, useEffect, useState } from 'react';

const MAX_RECENT_FILES = 10;
const MAX_PINNED_FILES = 20;

export interface PinnedRecentFile {
  url: string;
  fileName: string;
  accessedAt: number; // timestamp
  folderKey?: string;
}

interface PinnedRecentState {
  pinnedFiles: PinnedRecentFile[];
  recentFiles: PinnedRecentFile[];
}

function getStorageKey(projectId: string): string {
  return `fileManager:pinnedRecent:${projectId}`;
}

function loadFromStorage(projectId: string): PinnedRecentState {
  if (typeof window === 'undefined') {
    return { pinnedFiles: [], recentFiles: [] };
  }
  
  try {
    const stored = localStorage.getItem(getStorageKey(projectId));
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        pinnedFiles: Array.isArray(parsed.pinnedFiles) ? parsed.pinnedFiles : [],
        recentFiles: Array.isArray(parsed.recentFiles) ? parsed.recentFiles : [],
      };
    }
  } catch (err) {
    console.warn('[usePinnedAndRecent] Failed to load from localStorage:', err);
  }
  
  return { pinnedFiles: [], recentFiles: [] };
}

function saveToStorage(projectId: string, state: PinnedRecentState): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(getStorageKey(projectId), JSON.stringify(state));
  } catch (err) {
    console.warn('[usePinnedAndRecent] Failed to save to localStorage:', err);
  }
}

export function usePinnedAndRecent(projectId: string | undefined) {
  const [pinnedFiles, setPinnedFiles] = useState<PinnedRecentFile[]>([]);
  const [recentFiles, setRecentFiles] = useState<PinnedRecentFile[]>([]);
  
  // Load from storage on mount or when projectId changes
  useEffect(() => {
    if (!projectId) {
      setPinnedFiles([]);
      setRecentFiles([]);
      return;
    }
    
    const state = loadFromStorage(projectId);
    setPinnedFiles(state.pinnedFiles);
    setRecentFiles(state.recentFiles);
  }, [projectId]);
  
  // Save to storage whenever state changes
  useEffect(() => {
    if (!projectId) return;
    saveToStorage(projectId, { pinnedFiles, recentFiles });
  }, [projectId, pinnedFiles, recentFiles]);
  
  /**
   * Check if a file is pinned
   */
  const isPinned = useCallback((url: string): boolean => {
    return pinnedFiles.some(f => f.url === url);
  }, [pinnedFiles]);
  
  /**
   * Pin a file
   */
  const pinFile = useCallback((file: { url: string; fileName: string; folderKey?: string }) => {
    setPinnedFiles(prev => {
      // Don't add if already pinned
      if (prev.some(f => f.url === file.url)) return prev;
      
      const newPinned: PinnedRecentFile = {
        url: file.url,
        fileName: file.fileName,
        folderKey: file.folderKey,
        accessedAt: Date.now(),
      };
      
      // Add to front, limit to max
      return [newPinned, ...prev].slice(0, MAX_PINNED_FILES);
    });
  }, []);
  
  /**
   * Unpin a file
   */
  const unpinFile = useCallback((url: string) => {
    setPinnedFiles(prev => prev.filter(f => f.url !== url));
  }, []);
  
  /**
   * Toggle pin state for a file
   */
  const togglePin = useCallback((file: { url: string; fileName: string; folderKey?: string }) => {
    if (isPinned(file.url)) {
      unpinFile(file.url);
    } else {
      pinFile(file);
    }
  }, [isPinned, pinFile, unpinFile]);
  
  /**
   * Track a file as recently accessed
   */
  const trackRecent = useCallback((file: { url: string; fileName: string; folderKey?: string }) => {
    setRecentFiles(prev => {
      // Remove if already in list (will re-add at front)
      const filtered = prev.filter(f => f.url !== file.url);
      
      const newRecent: PinnedRecentFile = {
        url: file.url,
        fileName: file.fileName,
        folderKey: file.folderKey,
        accessedAt: Date.now(),
      };
      
      // Add to front, limit to max
      return [newRecent, ...filtered].slice(0, MAX_RECENT_FILES);
    });
  }, []);
  
  /**
   * Clear all recent files
   */
  const clearRecent = useCallback(() => {
    setRecentFiles([]);
  }, []);
  
  return {
    pinnedFiles,
    recentFiles,
    isPinned,
    pinFile,
    unpinFile,
    togglePin,
    trackRecent,
    clearRecent,
  };
}

export type UsePinnedAndRecentReturn = ReturnType<typeof usePinnedAndRecent>;
