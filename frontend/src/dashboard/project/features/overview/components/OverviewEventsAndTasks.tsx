/**
 * OverviewEventsAndTasks - Wrapper for EventsAndTasks in Overview context
 * 
 * Adapts the calendar's EventsAndTasks component for use in the Overview page.
 * Shows 4-6 items max, default filter: Upcoming · Open
 */

import React, { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import EventsAndTasks from '@/dashboard/project/features/calendar/components/EventsAndTasks';
import '@/dashboard/project/features/calendar/calendar-preview.css';
import type { CalendarEvent, CalendarTask } from '@/dashboard/project/features/calendar/utils';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
import styles from '../OverviewHud.module.css';

// ============================================================================
// TYPES
// ============================================================================

interface RawEvent {
  id?: string;
  eventId?: string;
  date?: string;
  startAt?: string | null;
  endAt?: string | null;
  description?: string;
  title?: string;
  allDay?: boolean;
}

interface RawTask {
  id?: string;
  taskId?: string;
  title?: string;
  dueDate?: string;
  due?: string;
  startAt?: string | null;
  endAt?: string | null;
  status?: string;
  assignedTo?: string | { name?: string; email?: string }[];
  address?: string;
  done?: boolean;
  source?: unknown;
}

interface OverviewEventsAndTasksProps {
  projectId: string;
  projectTitle?: string;
  events: RawEvent[];
  tasks: RawTask[];
  onToggleTask?: (id: string) => void;
  onEditEvent?: (event: CalendarEvent) => void;
  onEditTask?: (task: CalendarTask) => void;
  onOpenMap?: () => void;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function OverviewEventsAndTasks({
  projectId,
  projectTitle,
  events,
  tasks,
  onToggleTask,
  onEditEvent,
  onEditTask,
  onOpenMap,
}: OverviewEventsAndTasksProps) {
  const navigate = useNavigate();
  
  // Convert raw events to CalendarEvent format
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    return events
      .map(e => ({
        id: e.id || e.eventId || '',
        date: e.date || '',
        start: e.startAt ?? undefined,
        end: e.endAt ?? undefined,
        title: e.title || e.description || 'Event',
        allDay: e.allDay ?? !e.startAt,
        category: 'Work' as const,
        tags: [],
        guests: [],
        source: e as unknown as CalendarEvent['source'],
      }));
  }, [events]);
  
  // Convert raw tasks to CalendarTask format
  const calendarTasks: CalendarTask[] = useMemo(() => {
    return tasks
      .map(t => ({
        id: t.id || t.taskId || '',
        title: t.title || 'Untitled task',
        due: t.dueDate || t.due || '',
        status: (t.status as CalendarTask['status']) ?? undefined,
        done: t.done ?? false,
        assignedTo: typeof t.assignedTo === 'string' ? t.assignedTo : undefined,
        source: (t.source ?? t) as CalendarTask['source'],
      }));
  }, [tasks]);
  
  const handleToggleTask = useCallback((id: string) => {
    onToggleTask?.(id);
  }, [onToggleTask]);
  
  const handleEditEvent = useCallback((event: CalendarEvent) => {
    if (onEditEvent) {
      onEditEvent(event);
    } else {
      // Navigate to calendar with event selected
      navigate(getProjectDashboardPath(projectId, projectTitle, '/calendar'));
    }
  }, [navigate, projectId, projectTitle, onEditEvent]);
  
  const handleEditTask = useCallback((task: CalendarTask) => {
    if (onEditTask) {
      onEditTask(task);
    } else {
      // Navigate to tasks
      navigate(getProjectDashboardPath(projectId, projectTitle, '/tasks'));
    }
  }, [navigate, projectId, projectTitle, onEditTask]);
  
  const handleOpenTasksOverview = useCallback(() => {
    if (onOpenMap) {
      onOpenMap();
      return;
    }

    navigate(getProjectDashboardPath(projectId, projectTitle, '/tasks'));
  }, [navigate, onOpenMap, projectId, projectTitle]);

  // Calculate conflict count for header chip
  const conflictCount = useMemo(() => {
    // Simple conflict detection: tasks with blocked status or overdue
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let count = 0;
    for (const task of tasks) {
      const status = task.status?.toLowerCase() || '';
      if (status === 'blocked' || status === 'at-risk') {
        count++;
      } else if (task.dueDate || task.due) {
        const dueDate = new Date(task.dueDate || task.due || '');
        if (dueDate < today && !task.done) {
          count++;
        }
      }
    }
    return count;
  }, [tasks]);

  return (
    <div className={styles.overviewEventsCard}>
      {conflictCount > 0 && (
        <div className={styles.eventsConflictChip}>
          {conflictCount} {conflictCount === 1 ? 'conflict' : 'conflicts'}
        </div>
      )}
      <EventsAndTasks
        events={calendarEvents}
        tasks={calendarTasks}
        onToggleTask={handleToggleTask}
        onEditEvent={handleEditEvent}
        onEditTask={handleEditTask}
        onOpenTasksOverview={handleOpenTasksOverview}
        eventFilter="upcoming"
        taskFilter="open"
        hideMapPill
        hideFilterControls={false}
      />
    </div>
  );
}

export default OverviewEventsAndTasks;
