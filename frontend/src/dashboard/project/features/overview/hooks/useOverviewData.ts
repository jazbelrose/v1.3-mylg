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
import { fetchTasks, fetchEvents, apiFetch, deckVersionsUrl } from '@/shared/utils/api';
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
  version?: string;
  isDefault?: boolean;
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
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// ============================================================================
// HOOK
// ============================================================================

export function useOverviewData(projectId: string | undefined): OverviewData {
  const { activeProject } = useData();
  
  // Budget data from context
  const { getStats, loading: budgetLoading } = useBudget();
  
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get budget stats
  const budgetStats = useMemo(() => {
    try {
      return getStats();
    } catch {
      return null;
    }
  }, [getStats]);

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
    loading: loading || budgetLoading || activityLoading,
    error,
    refresh,
  };
}

export default useOverviewData;
