/**
 * useProjectActivity - Fetch and subscribe to project activity events
 * 
 * This hook manages the Activity panel data, fetching historical activity
 * and subscribing to real-time updates via WebSocket.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '@/app/contexts/useSocket';

// ============================================================================
// TYPES
// ============================================================================

export interface ActivityChange {
  slideId?: string;
  slideNumber?: number;
  deckId?: string;
  changeType: 'text' | 'image' | 'layout' | 'style' | 'delete' | 'create' | 'reorder' | 'move';
  description?: string;
  timestamp?: string;
}

export interface ActivityEvent {
  activityId: string;
  projectId: string;
  type: ActivityType;
  category: 'slides' | 'budget' | 'files' | 'tasks' | 'project' | 'messages';
  summary: string;
  changes?: ActivityChange[];
  userId: string;
  userName: string;
  userAvatar?: string;
  createdAt: string;
  periodStart?: string;
  periodEnd?: string;
  batchId?: string;
  changeCount?: number;
}

export type ActivityType =
  | 'slide_edit'
  | 'slide_create'
  | 'slide_delete'
  | 'slide_reorder'
  | 'slide_duplicate'
  | 'deck_create'
  | 'deck_rename'
  | 'deck_publish'
  | 'budget_update'
  | 'budget_revision'
  | 'file_upload'
  | 'file_delete'
  | 'file_rename'
  | 'task_create'
  | 'task_update'
  | 'task_complete'
  | 'project_settings'
  | 'comment_add'
  | 'comment_resolve';

// ============================================================================
// HOOK
// ============================================================================

export function useProjectActivity(projectId: string | undefined) {
  const { ws } = useSocket();
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);

  /**
   * Fetch activity history from backend
   */
  const fetchActivity = useCallback(() => {
    if (!projectId || !ws || ws.readyState !== WebSocket.OPEN) return;

    setLoading(true);
    setError(null);

    try {
      ws.send(JSON.stringify({
        action: 'fetchProjectActivity',
        projectId,
        limit: 50,
      }));
    } catch (err) {
      console.error('[useProjectActivity] Failed to fetch:', err);
      setError('Failed to fetch activity');
      setLoading(false);
    }
  }, [projectId, ws]);

  // Fetch on mount and project change
  useEffect(() => {
    if (!projectId) {
      setActivities([]);
      hasFetchedRef.current = false;
      return;
    }

    if (!hasFetchedRef.current && ws?.readyState === WebSocket.OPEN) {
      fetchActivity();
      hasFetchedRef.current = true;
    }
  }, [projectId, ws?.readyState, fetchActivity]);

  // Reset on project change
  useEffect(() => {
    hasFetchedRef.current = false;
    setActivities([]);
  }, [projectId]);

  // Listen for activity updates
  useEffect(() => {
    if (!ws || !projectId) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        // Handle batch response
        if (data.action === 'activityBatch' && data.projectId === projectId) {
          setActivities(data.items || []);
          setLoading(false);
        }

        // Handle real-time activity update
        if (data.action === 'activityUpdate' && data.projectId === projectId) {
          setActivities(prev => {
            // Check for duplicates
            const exists = prev.some(a => a.activityId === data.activityId);
            if (exists) return prev;
            
            // Add new activity at the beginning
            return [data, ...prev].slice(0, 100); // Keep latest 100
          });
        }
      } catch (err) {
        // Ignore non-JSON messages
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws, projectId]);

  /**
   * Format relative time (e.g., "4m ago", "2h ago")
   */
  const formatRelativeTime = useCallback((isoDate: string): string => {
    const now = Date.now();
    const then = new Date(isoDate).getTime();
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return new Date(isoDate).toLocaleDateString();
  }, []);

  return {
    activities,
    loading,
    error,
    fetchActivity,
    formatRelativeTime,
  };
}
