/**
 * OverviewEventsAndTasks - Unified command panel for Events & Tasks
 * 
 * Silicon Valley-style design with:
 * - Segmented filter chips (Today/Next 7/Next 30/All + Me/Team)
 * - Unified timeline feed with day dividers
 * - Hover quick actions + primary action per row
 */

import React, { useMemo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@/app/contexts/useUser';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
import { 
  approveTask, 
  requestTaskChanges, 
  deleteTask, 
  deleteEvent,
  requestTaskReview,
} from '@/shared/utils/api';
import CommandPanel, {
  type TimelineEvent,
  type TimelineTask,
  type TimelineItem,
} from './CommandPanel';
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
  assigneeId?: string | null;
  assigneeIds?: string[];
  assigneeTokens?: string[];
  address?: string;
  done?: boolean;
  kind?: string;
  plannedMinutes?: number;
  order?: number;
  focusBlockId?: string;
  focusChildTaskIds?: string[];
  focusChecklist?: Array<{ taskId: string; title: string }>;
  source?: unknown;
}

interface OverviewEventsAndTasksProps {
  projectId: string;
  projectTitle?: string;
  events: RawEvent[];
  tasks: RawTask[];
  teamMembers?: Array<{ userId: string; firstName?: string; lastName?: string; thumbnail?: string | null }>;
  onToggleTask?: (id: string) => void;
  onEditEvent?: (event: TimelineEvent) => void;
  onEditTask?: (task: TimelineTask) => void;
  onQuickEditTask?: (task: TimelineTask) => void;
  onOpenMap?: () => void;
  /** Called after a task/event is deleted or updated to refresh data */
  onRefresh?: () => void;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function OverviewEventsAndTasks({
  projectId,
  projectTitle,
  events,
  tasks,
  teamMembers,
  onToggleTask,
  onEditEvent,
  onEditTask,
  onQuickEditTask,
  onOpenMap,
  onRefresh,
}: OverviewEventsAndTasksProps) {
  const navigate = useNavigate();
  const { userId, user } = useUser();
  const userEmail = user?.email;
  
  // Local state to track toggled tasks (optimistic UI)
  const [toggledTaskIds, setToggledTaskIds] = useState<Set<string>>(new Set());
  
  // Convert raw events to TimelineEvent format
  const timelineEvents: TimelineEvent[] = useMemo(() => {
    return events.map(e => ({
      id: e.id || e.eventId || '',
      type: 'event' as const,
      title: e.title || e.description || 'Event',
      date: e.date || '',
      startTime: e.startAt ?? undefined,
      endTime: e.endAt ?? undefined,
      allDay: e.allDay ?? !e.startAt,
      source: e,
    }));
  }, [events]);
  
  // Convert raw tasks to TimelineTask format
  const timelineTasks: TimelineTask[] = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    
    return tasks.map(t => {
      const taskId = t.id || t.taskId || '';
      const normalizedKind = typeof t.kind === 'string' ? t.kind.trim().toLowerCase() : undefined;
      const dueDate = t.dueDate || t.due || (normalizedKind === 'focus_block' ? (t.startAt ?? undefined) : undefined);
      const dueDateObj = dueDate ? new Date(dueDate) : null;
      const dueDateOnly = dueDateObj 
        ? new Date(dueDateObj.getFullYear(), dueDateObj.getMonth(), dueDateObj.getDate())
        : null;
      
      // Account for local toggle state
      const wasToggled = toggledTaskIds.has(taskId);
      const originalDone = t.done ?? (t.status?.toLowerCase() === 'done');
      const effectiveDone = wasToggled ? !originalDone : originalDone;
      const effectiveStatus = effectiveDone ? 'done' : (t.status || 'todo');
      
      const isOverdue = dueDateOnly ? dueDateOnly < today && !effectiveDone : false;
      const isDueSoon = dueDateOnly && !isOverdue ? dueDateOnly <= threeDaysFromNow : false;
      
      // Format assignedTo
      let assignedTo: string | undefined;
      if (typeof t.assignedTo === 'string') {
        assignedTo = t.assignedTo;
      } else if (Array.isArray(t.assignedTo) && t.assignedTo.length > 0) {
        assignedTo = t.assignedTo[0].name || t.assignedTo[0].email;
      }
      
      return {
        id: taskId,
        type: 'task' as const,
        title: t.title || 'Untitled task',
        dueDate,
        status: effectiveStatus,
        done: effectiveDone,
        assignedTo,
        assigneeId: t.assigneeId,
        assigneeIds: t.assigneeIds,
        assigneeTokens: t.assigneeTokens,
        kind: t.kind,
        startAt: t.startAt,
        endAt: t.endAt,
        plannedMinutes: t.plannedMinutes,
        order: t.order,
        focusBlockId: t.focusBlockId,
        focusChildTaskIds: t.focusChildTaskIds,
        focusChecklist: t.focusChecklist,
        isOverdue,
        isDueSoon,
        source: t.source ?? t,
      };
    });
  }, [tasks, toggledTaskIds]);
  
  const handleToggleTask = useCallback(async (id: string) => {
    // If parent provides toggle handler, use it
    if (onToggleTask) {
      onToggleTask(id);
      return;
    }
    
    // Otherwise, call API directly
    const task = tasks.find(t => (t.id || t.taskId) === id);
    if (!task) return;
    
    const taskId = task.taskId || task.id;
    if (!taskId) return;
    
    // Determine current done state (check local toggle state first)
    const wasToggled = toggledTaskIds.has(id);
    const originalDone = task.done ?? (task.status?.toLowerCase() === 'done');
    const currentDone = wasToggled ? !originalDone : originalDone;
    
    // Optimistic update
    setToggledTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    
    try {
      if (currentDone) {
        // Task is done, mark as needs changes (to reopen it)
        await requestTaskChanges(projectId, taskId, { note: 'Reopened from Overview' });
      } else {
        // Task is not done, mark as done
        await approveTask(projectId, taskId, { note: '' });
      }
    } catch (err) {
      console.error('Failed to toggle task:', err);
      // Revert optimistic update on error
      setToggledTaskIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    }
  }, [onToggleTask, tasks, projectId, toggledTaskIds]);
  
  const handleEditItem = useCallback((item: TimelineItem) => {
    if (item.type === 'event') {
      if (onEditEvent) {
        onEditEvent(item as TimelineEvent);
      } else {
        navigate(getProjectDashboardPath(projectId, projectTitle, '/calendar'));
      }
    } else {
      if (onEditTask) {
        onEditTask(item as TimelineTask);
      } else {
        navigate(getProjectDashboardPath(projectId, projectTitle, '/tasks'));
      }
    }
  }, [navigate, projectId, projectTitle, onEditEvent, onEditTask]);
  
  const handleViewCalendar = useCallback(() => {
    if (onOpenMap) {
      onOpenMap();
      return;
    }
    navigate(getProjectDashboardPath(projectId, projectTitle, '/calendar'));
  }, [navigate, onOpenMap, projectId, projectTitle]);
  
  const handleCreateTask = useCallback(() => {
    navigate(getProjectDashboardPath(projectId, projectTitle, '/tasks'));
  }, [navigate, projectId, projectTitle]);
  
  const handleCreateEvent = useCallback(() => {
    navigate(getProjectDashboardPath(projectId, projectTitle, '/calendar'));
  }, [navigate, projectId, projectTitle]);
  
  const handleDeleteItem = useCallback(async (item: TimelineItem) => {
    try {
      if (item.type === 'task') {
        const task = tasks.find(t => (t.id || t.taskId) === item.id);
        const taskId = task?.taskId || task?.id;
        if (!taskId) {
          console.error('Cannot delete task: no taskId found');
          return;
        }
        await deleteTask({ projectId, taskId });
      } else {
        const event = events.find(e => (e.id || e.eventId) === item.id);
        const eventId = event?.eventId || event?.id;
        if (!eventId) {
          console.error('Cannot delete event: no eventId found');
          return;
        }
        await deleteEvent(projectId, eventId);
      }
      // Refresh data after deletion
      onRefresh?.();
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  }, [projectId, tasks, events, onRefresh]);
  
  const handleDuplicateItem = useCallback((item: TimelineItem) => {
    // Navigate to the appropriate page to create a duplicate
    // This could be enhanced to open the create modal with pre-filled data
    if (item.type === 'task') {
      navigate(getProjectDashboardPath(projectId, projectTitle, '/tasks'));
    } else {
      navigate(getProjectDashboardPath(projectId, projectTitle, '/calendar'));
    }
  }, [navigate, projectId, projectTitle]);
  
  const handleSubmitForReview = useCallback(async (task: TimelineTask) => {
    try {
      const rawTask = tasks.find(t => (t.id || t.taskId) === task.id);
      const taskId = rawTask?.taskId || rawTask?.id;
      if (!taskId) {
        console.error('Cannot submit task for review: no taskId found');
        return;
      }
      await requestTaskReview(projectId, taskId, { note: 'Submitted from Overview' });
      // Refresh data after submission
      onRefresh?.();
    } catch (err) {
      console.error('Failed to submit task for review:', err);
    }
  }, [projectId, tasks, onRefresh]);

  return (
    <div className={styles.overviewEventsCard}>
      <CommandPanel
        events={timelineEvents}
        tasks={timelineTasks}
        teamMembers={teamMembers}
        currentUserId={userId}
        currentUserEmail={userEmail}
        onToggleTask={handleToggleTask}
        onEditItem={handleEditItem}
        onQuickEditTask={onQuickEditTask}
        onDeleteItem={handleDeleteItem}
        onDuplicateItem={handleDuplicateItem}
        onSubmitForReview={handleSubmitForReview}
        onViewCalendar={handleViewCalendar}
        onCreateTask={handleCreateTask}
        onCreateEvent={handleCreateEvent}
      />
    </div>
  );
}

export default OverviewEventsAndTasks;
