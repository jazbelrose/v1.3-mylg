// hooks/useThumbnailQueue.ts - React hook for thumbnail job queue integration
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ThumbnailJobQueue,
  ThumbnailJobStatus,
  ThumbnailJobPriority,
  createThumbnailQueue,
} from '../lib/thumbnailJobQueue';
import { isUiThumbsEnabled } from '../lib/featureFlags';

export interface UseThumbnailQueueOptions {
  projectId: string | undefined;
  onThumbnailGenerated?: (slideId: string, thumbnailUrl: string) => void;
  maxConcurrency?: number;
}

export interface UseThumbnailQueueResult {
  /**
   * Enqueue a single slide for thumbnail generation
   */
  enqueue: (params: {
    slideId: string;
    content: string;
    backgroundColor?: string;
    backgroundImage?: string;
    priority?: ThumbnailJobPriority;
  }) => void;

  /**
   * Enqueue multiple slides at once (for import/Magic Layout)
   */
  enqueueAll: (
    slides: Array<{
      id: string;
      content?: string;
      backgroundColor?: string;
      backgroundImage?: string;
    }>,
    priority?: ThumbnailJobPriority
  ) => void;

  /**
   * Get status for a specific slide
   */
  getStatus: (slideId: string) => ThumbnailJobStatus | null;

  /**
   * Status map for all slides (reactive)
   */
  statusMap: Map<string, ThumbnailJobStatus>;

  /**
   * Number of pending/generating jobs
   */
  pendingCount: number;

  /**
   * Whether the queue is actively processing
   */
  isActive: boolean;

  /**
   * Mark a slide as already having a thumbnail
   */
  markComplete: (slideId: string) => void;

  /**
   * Retry a failed job
   */
  retry: (slideId: string) => void;

  /**
   * Cancel a pending job
   */
  cancel: (slideId: string) => void;
}

/**
 * Hook for integrating ThumbnailJobQueue with React components
 * 
 * Provides:
 * - Automatic queue management tied to projectId
 * - Reactive status updates for UI indicators
 * - Callbacks when thumbnails are generated
 */
export function useThumbnailQueue(options: UseThumbnailQueueOptions): UseThumbnailQueueResult {
  const { projectId, onThumbnailGenerated, maxConcurrency = 3 } = options;
  
  const [statusMap, setStatusMap] = useState<Map<string, ThumbnailJobStatus>>(new Map());
  const [pendingCount, setPendingCount] = useState(0);
  
  const queueRef = useRef<ThumbnailJobQueue | null>(null);
  const onThumbnailGeneratedRef = useRef(onThumbnailGenerated);
  
  // Keep callback ref updated
  useEffect(() => {
    onThumbnailGeneratedRef.current = onThumbnailGenerated;
  }, [onThumbnailGenerated]);

  // Create queue instance
  useEffect(() => {
    if (!projectId || isUiThumbsEnabled()) {
      queueRef.current = null;
      return;
    }

    const queue = createThumbnailQueue({
      maxConcurrency,
      onThumbnailGenerated: (slideId, url) => {
        onThumbnailGeneratedRef.current?.(slideId, url);
      },
      onStatusChange: (slideId, status) => {
        setStatusMap((prev) => {
          const next = new Map(prev);
          next.set(slideId, status);
          return next;
        });
      },
    });

    queueRef.current = queue;

    // Cleanup on unmount or projectId change
    return () => {
      queue.clearPending();
      queueRef.current = null;
    };
  }, [projectId, maxConcurrency]);

  // Update pending count when statusMap changes
  useEffect(() => {
    let count = 0;
    for (const status of statusMap.values()) {
      if (status === 'pending' || status === 'generating') {
        count++;
      }
    }
    setPendingCount(count);
  }, [statusMap]);

  const enqueue = useCallback(
    (params: {
      slideId: string;
      content: string;
      backgroundColor?: string;
      backgroundImage?: string;
      priority?: ThumbnailJobPriority;
    }) => {
      if (!projectId || !queueRef.current) {
        return;
      }

      queueRef.current.enqueue({
        ...params,
        projectId,
      });
    },
    [projectId]
  );

  const enqueueAll = useCallback(
    (
      slides: Array<{
        id: string;
        content?: string;
        backgroundColor?: string;
        backgroundImage?: string;
      }>,
      priority: ThumbnailJobPriority = 'high'
    ) => {
      if (!projectId || !queueRef.current) {
        return;
      }

      queueRef.current.enqueueAll(slides, projectId, priority);
    },
    [projectId]
  );

  const getStatus = useCallback((slideId: string): ThumbnailJobStatus | null => {
    return queueRef.current?.getStatus(slideId) ?? statusMap.get(slideId) ?? null;
  }, [statusMap]);

  const markComplete = useCallback((slideId: string) => {
    queueRef.current?.markComplete(slideId);
  }, []);

  const retry = useCallback((slideId: string) => {
    queueRef.current?.retry(slideId);
  }, []);

  const cancel = useCallback((slideId: string) => {
    queueRef.current?.cancel(slideId);
  }, []);

  const isActive = useMemo(() => pendingCount > 0, [pendingCount]);

  return {
    enqueue,
    enqueueAll,
    getStatus,
    statusMap,
    pendingCount,
    isActive,
    markComplete,
    retry,
    cancel,
  };
}
