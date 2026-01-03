/**
 * useOverviewData - Aggregate data for the Overview HUD
 * 
 * This hook gathers data from various sources (budget, events, tasks, etc.)
 * and provides it in a unified format for the OverviewHud component.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useData } from '@/app/contexts/useData';
import { useBudget } from '@/dashboard/project/features/budget/context/BudgetContext';
import { useProjectActivity, type ActivityEvent } from '@/dashboard/project/features/activity/hooks/useProjectActivity';
import { list } from 'aws-amplify/storage';
import {
  fetchTasks,
  fetchEvents,
  apiFetch,
  deckVersionsUrl,
  GET_PROJECT_MESSAGES_URL,
  getFileUrl,
  normalizeFileUrl,
} from '@/shared/utils/api';
import type { BudgetStats } from '@/dashboard/project/features/budget/context/types';

// ============================================================================
// TYPES
// ============================================================================

interface CalendarEvent {
  id?: string;
  eventId?: string;
  date?: string;
  startAt?: string | null;
  endAt?: string | null;
  description?: string;
  title?: string;
  allDay?: boolean;
}

interface TaskItem {
  id?: string;
  taskId?: string;
  title?: string;
  dueDate?: string;
  startAt?: string | null;
  endAt?: string | null;
  status?: string;
  assignedTo?: string | { name?: string; email?: string }[];
  address?: string;
}

interface DeckVersion {
  versionId?: string;
  title?: string;
  name?: string;
  version?: string;
  isDefault?: boolean;
  isClientDefault?: boolean;
  thumbnail?: string;
  exportedAt?: string;
  createdAt?: string;
  slideCount?: number;
}

interface Gallery {
  galleryId?: string;
  title?: string;
  slug?: string;
  thumbnail?: string;
  imageCount?: number;
  images?: Array<{ thumbnailUrl?: string; url?: string }>;
}

interface OverviewData {
  projectId: string;
  projectTitle: string | undefined;
  projectColor: string | undefined;
  startDate: string | undefined;
  endDate: string | undefined;
  coverImage: string | undefined;
  address: string | undefined;
  location: { lat: number; lng: number } | undefined;
  budgetStats: BudgetStats | null;
  events: CalendarEvent[];
  tasks: TaskItem[];
  deckVersions: DeckVersion[];
  galleries: Gallery[];
  activities: ActivityEvent[];
  recentMessages: Array<{
    messageId: string;
    text: string;
    timestamp: string;
    senderId?: string;
    senderName?: string;
    senderAvatar?: string;
  }>;
  recentFiles: Array<{
    fileId: string;
    fileName: string;
    fileType?: string;
    thumbnailUrl?: string;
    uploadedAt: string;
    uploadedBy?: string;
  }>;
  recentLinks: Array<{
    linkId: string;
    url: string;
    title?: string;
    sharedAt: string;
    sharedBy?: string;
  }>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// ============================================================================
// HOOK
// ============================================================================

export function useOverviewData(projectId: string | undefined): OverviewData {
  const { activeProject, projectMessages, deletedMessageIds } = useData();
  
  // Budget data from context
  const { getClientStats, loading: budgetLoading } = useBudget();
  
  // Activity data
  const { 
    activities, 
    loading: activityLoading 
  } = useProjectActivity(projectId);

  // Local state for fetched data
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [deckVersions, setDeckVersions] = useState<DeckVersion[]>([]);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [fetchedMessages, setFetchedMessages] = useState<unknown[]>([]);
  const [recentFiles, setRecentFiles] = useState<OverviewData['recentFiles']>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get budget stats
  const budgetStats = useMemo(() => {
    try {
      return getClientStats();
    } catch {
      return null;
    }
  }, [getClientStats]);

  const recentLinks = useMemo<OverviewData['recentLinks']>(() => {
    const links = Array.isArray(activeProject?.quickLinks) ? activeProject?.quickLinks : [];
    const now = new Date().toISOString();
    return links
      .slice(0, 10)
      .map((l: unknown) => {
        const link = l as { id?: string; title?: string; name?: string; url?: string };
        const url = link.url || '';
        return {
          linkId: link.id || url || `${Math.random()}`,
          url,
          title: link.title || link.name,
          sharedAt: now,
        };
      })
      .filter((l) => Boolean(l.url));
  }, [activeProject?.quickLinks]);

  const recentMessages = useMemo<OverviewData['recentMessages']>(() => {
    const local = projectId ? projectMessages?.[projectId] : undefined;
    const source = Array.isArray(local) && local.length > 0 ? local : fetchedMessages;

    const items = (source as Array<{
      messageId?: string;
      optimisticId?: string;
      text?: string;
      body?: string;
      content?: string;
      timestamp?: string;
      username?: string;
      userName?: string;
      senderName?: string;
      senderId?: string;
      senderAvatar?: string;
      userAvatar?: string;
    }>)
      .filter((m) => {
        const id = m.messageId || m.optimisticId;
        if (!id) return false;
        return !(deletedMessageIds && deletedMessageIds.has(id));
      })
      .map((m) => {
        const id = m.messageId || m.optimisticId || '';
        const text = m.text || m.body || m.content || '';
        const timestamp = m.timestamp || '';
        return {
          messageId: id,
          text,
          timestamp,
          senderId: m.senderId,
          senderName: m.senderName || m.userName || m.username,
          senderAvatar: m.senderAvatar || m.userAvatar,
        };
      })
      .filter((m) => Boolean(m.timestamp && m.text))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return items.slice(0, 10);
  }, [projectId, projectMessages, fetchedMessages, deletedMessageIds]);

  // Extract events from active project or fetch them
  useEffect(() => {
    if (!projectId) return;

    // Use timeline events from active project if available
    if (activeProject?.timelineEvents && Array.isArray(activeProject.timelineEvents)) {
      setEvents(activeProject.timelineEvents.map(e => ({
        id: e.id || e.eventId,
        eventId: e.eventId,
        date: e.date,
        startAt: e.startAt,
        endAt: e.endAt,
        description: e.description,
        title: e.title || e.payload?.title || e.description,
        allDay: e.allDay ?? !e.startAt,
      })));
    } else {
      // Fetch events
      fetchEvents(projectId)
        .then(evts => {
          setEvents(evts.map(e => ({
            id: e.id || e.eventId,
            eventId: e.eventId,
            date: e.date,
            startAt: e.startAt,
            endAt: e.endAt,
            description: e.description,
            title: e.title || (e.payload as { title?: string })?.title || e.description,
            allDay: e.allDay ?? !e.startAt,
          })));
        })
        .catch(() => {
          // Silently fail - we'll show empty state
        });
    }
  }, [projectId, activeProject?.timelineEvents]);

  // Fetch tasks
  useEffect(() => {
    if (!projectId) return;

    setLoading(true);
    fetchTasks(projectId)
      .then(taskList => {
        setTasks(taskList.map(t => ({
          id: t.taskId,
          taskId: t.taskId,
          title: t.title,
          dueDate: t.dueDate,
          startAt: t.startAt,
          endAt: t.endAt,
          status: t.status,
          assignedTo: t.assigneeTokens?.join(', ') || t.assigneeId,
          address: t.address,
        })));
      })
      .catch(err => {
        setError('Failed to load tasks');
        console.error('useOverviewData: Failed to fetch tasks', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [projectId]);

  // Fetch deck versions
  useEffect(() => {
    if (!projectId) return;

    apiFetch<{ versions?: DeckVersion[] } | DeckVersion[]>(deckVersionsUrl(projectId))
      .then(data => {
        const versions = Array.isArray(data) ? data : (data.versions || []);
        setDeckVersions(versions);
      })
      .catch(() => {
        // No decks - that's fine
        setDeckVersions([]);
      });
  }, [projectId]);

  // Fetch recent project messages (used to seed the Activity panel)
  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;

    apiFetch<unknown>(`${GET_PROJECT_MESSAGES_URL}?projectId=${encodeURIComponent(projectId)}`)
      .then((data) => {
        if (cancelled) return;
        const anyData = data as { items?: unknown[]; Items?: unknown[] } | unknown[];
        const items = Array.isArray(anyData) ? anyData : anyData.items || anyData.Items || [];
        setFetchedMessages(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        if (!cancelled) setFetchedMessages([]);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Fetch recent files by listing project storage prefixes (uploads + editor + chat uploads)
  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;

    const isImage = (name: string) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);

    (async () => {
      try {
        const prefixes = ['uploads/', 'lexical/', 'chat_uploads/'].map((dir) => `projects/${projectId}/${dir}`);
        const results = await Promise.all(prefixes.map((prefix) => list({ prefix, options: { accessLevel: 'guest' } })));

        const files = results
          .flatMap((r: { items?: unknown[] }) => r.items || [])
          .filter((item) => {
            const key = (item as { key?: string }).key;
            return Boolean(key && !key.endsWith('/'));
          })
          .map((item) => {
            const key = (item as { key: string }).key;
            const name = key.split('/').pop() || key;
            const fullKey = key.startsWith('public/') ? key : `public/${key}`;
            const url = normalizeFileUrl(getFileUrl(fullKey));
            const lastModifiedRaw = (item as { lastModified?: string | Date }).lastModified;
            const uploadedAt = lastModifiedRaw ? new Date(lastModifiedRaw).toISOString() : new Date().toISOString();

            return {
              fileId: key,
              fileName: name,
              fileType: isImage(name) ? 'image' : undefined,
              thumbnailUrl: isImage(name) ? url : undefined,
              uploadedAt,
            };
          })
          .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
          .slice(0, 8);

        if (!cancelled) setRecentFiles(files);
      } catch {
        if (!cancelled) setRecentFiles([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Get galleries from active project
  useEffect(() => {
    if (!projectId) return;

    // Galleries are typically stored on the project or fetched separately
    // For now, use an empty array - you may need to fetch from API
    const proj = activeProject as unknown as { galleries?: Gallery[] } | null;
    if (proj && Array.isArray(proj.galleries)) {
      setGalleries(proj.galleries);
    } else {
      setGalleries([]);
    }
  }, [projectId, activeProject]);

  // Refresh function
  const refresh = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    try {
      const [taskList, eventList, versionData] = await Promise.all([
        fetchTasks(projectId).catch(() => []),
        fetchEvents(projectId).catch(() => []),
        apiFetch<{ versions?: DeckVersion[] } | DeckVersion[]>(deckVersionsUrl(projectId)).catch(() => []),
      ]);

      setTasks(taskList.map(t => ({
        id: t.taskId,
        taskId: t.taskId,
        title: t.title,
        dueDate: t.dueDate,
        startAt: t.startAt,
        endAt: t.endAt,
        status: t.status,
        assignedTo: t.assigneeTokens?.join(', ') || t.assigneeId,
        address: t.address,
      })));

      setEvents(eventList.map(e => ({
        id: e.id || e.eventId,
        eventId: e.eventId,
        date: e.date,
        startAt: e.startAt,
        endAt: e.endAt,
        description: e.description,
        title: e.title || (e.payload as { title?: string })?.title || e.description,
        allDay: e.allDay ?? !e.startAt,
      })));

      const versions = Array.isArray(versionData) ? versionData : ((versionData as { versions?: DeckVersion[] }).versions || []);
      setDeckVersions(versions);
    } catch (err) {
      setError('Failed to refresh data');
      console.error('useOverviewData: refresh failed', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  return {
    projectId: projectId || '',
    projectTitle: activeProject?.title,
    projectColor: (activeProject as unknown as { color?: string })?.color,
    startDate: (activeProject as unknown as { startDate?: string })?.startDate,
    endDate: (activeProject as unknown as { endDate?: string; dueDate?: string })?.endDate ||
             (activeProject as unknown as { dueDate?: string })?.dueDate,
    coverImage: (activeProject as unknown as { coverImage?: string; cover?: string })?.coverImage ||
                (activeProject as unknown as { cover?: string })?.cover,
    address: activeProject?.address as string | undefined,
    location: (activeProject as unknown as { location?: { lat: number; lng: number } })?.location,
    budgetStats,
    events,
    tasks,
    deckVersions,
    galleries,
    activities,
    recentMessages,
    recentFiles,
    recentLinks,
    loading: loading || budgetLoading || activityLoading,
    error,
    refresh,
  };
}

export default useOverviewData;
