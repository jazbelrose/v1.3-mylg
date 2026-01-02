/**
 * useEditTracking - Track meaningful slide edits for Activity batching
 * 
 * This hook collects local edits and flushes them to the backend for batching.
 * Only meaningful changes are tracked (not cursor moves, presence, etc.)
 */

import { useCallback, useRef, useEffect } from 'react';
import { useSocket } from '@/app/contexts/useSocket';
import { useUser } from '@/app/contexts/useUser';

// ============================================================================
// CONFIGURATION (must match backend)
// ============================================================================

const BATCH_CONFIG = {
  /** Don't flush until user is idle for this duration (client-side debounce) */
  IDLE_THRESHOLD_MS: 90_000, // 90 seconds
  
  /** Maximum changes to buffer locally before forcing flush */
  MAX_CHANGES_PER_BATCH: 100,
  
  /** Minimum interval between flushes */
  MIN_FLUSH_INTERVAL_MS: 5_000, // 5 seconds
};

// ============================================================================
// TYPES
// ============================================================================

export type ChangeType = 'text' | 'image' | 'layout' | 'style' | 'delete' | 'create' | 'reorder' | 'move';

export interface ActivityChange {
  slideId?: string;
  slideNumber?: number;
  changeType: ChangeType;
  timestamp?: string;
}

// ============================================================================
// HOOK
// ============================================================================

export function useEditTracking(
  projectId: string,
  deckId?: string,
  deckName?: string
) {
  const { ws } = useSocket();
  const { user } = useUser();
  
  const pendingChangesRef = useRef<ActivityChange[]>([]);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastFlushRef = useRef<number>(0);
  const isMountedRef = useRef(true);

  /**
   * Flush pending changes to the backend
   */
  const flushChanges = useCallback(() => {
    if (pendingChangesRef.current.length === 0) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const now = Date.now();
    const timeSinceLastFlush = now - lastFlushRef.current;
    
    // Don't flush too frequently
    if (timeSinceLastFlush < BATCH_CONFIG.MIN_FLUSH_INTERVAL_MS && 
        pendingChangesRef.current.length < BATCH_CONFIG.MAX_CHANGES_PER_BATCH) {
      return;
    }

    const changes = [...pendingChangesRef.current];
    pendingChangesRef.current = [];
    lastFlushRef.current = now;

    try {
      ws.send(JSON.stringify({
        action: 'trackSlideEdit',
        projectId,
        deckId,
        deckName,
        userName: user?.firstName || user?.email || 'Someone',
        userAvatar: user?.profilePicture,
        changes,
      }));
      
      console.log('[useEditTracking] Flushed', changes.length, 'changes');
    } catch (err) {
      console.error('[useEditTracking] Failed to flush changes:', err);
      // Put changes back if flush failed
      pendingChangesRef.current = [...changes, ...pendingChangesRef.current];
    }
  }, [ws, projectId, deckId, deckName, user]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Flush any pending changes on unmount
      flushChanges();
    };
  }, [flushChanges]);

  /**
   * Track a meaningful change
   */
  const trackChange = useCallback((
    changeType: ChangeType,
    slideId?: string,
    slideNumber?: number
  ) => {
    // Clear existing idle timer
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    // Track change locally
    pendingChangesRef.current.push({
      slideId,
      slideNumber,
      changeType,
      timestamp: new Date().toISOString(),
    });

    // Force flush if we hit the limit
    if (pendingChangesRef.current.length >= BATCH_CONFIG.MAX_CHANGES_PER_BATCH) {
      flushChanges();
      return;
    }

    // Set idle timer to flush after quiet period
    idleTimerRef.current = setTimeout(() => {
      flushChanges();
    }, BATCH_CONFIG.IDLE_THRESHOLD_MS);
  }, [flushChanges]);

  /**
   * Force flush all pending changes (e.g., on save, navigation away)
   */
  const forceFlush = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    flushChanges();
  }, [flushChanges]);

  return {
    trackChange,
    forceFlush,
    pendingCount: pendingChangesRef.current.length,
  };
}

// ============================================================================
// HELPER UTILITIES
// ============================================================================

/**
 * Determine if a Lexical update is meaningful (content change vs metadata)
 */
export function isMeaningfulUpdate(prevStateHash: string, newStateHash: string): boolean {
  // Same hash = no change = not meaningful
  if (prevStateHash === newStateHash) return false;
  return true;
}

/**
 * Infer change type from Lexical node type or operation
 */
export function inferChangeType(nodeType: string, operation: string): ChangeType {
  switch (nodeType) {
    case 'image':
    case 'picture-frame':
      return 'image';
    case 'layout-container':
      return 'layout';
    default:
      if (operation === 'delete' || operation === 'remove') return 'delete';
      if (operation === 'create' || operation === 'insert') return 'create';
      return 'text';
  }
}
