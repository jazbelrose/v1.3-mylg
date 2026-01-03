/**
 * OverviewEventsAndTasks - Unified command panel for Events & Tasks
 * 
 * Silicon Valley-style design with:
 * - Segmented filter chips (Today/Next 7/Next 30/All + Me/Team)
 * - Unified timeline feed with day dividers
 * - Hover quick actions + primary action per row
 */

import React, { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@/app/contexts/useUser';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
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
  assigneeId?: string;
  assigneeIds?: string[];
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
  onEditEvent?: (event: TimelineEvent) => void;
  onEditTask?: (task: TimelineTask) => void;
  onQuickEditTask?: (task: TimelineTask) => void;
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
  onQuickEditTask,
  onOpenMap,
}: OverviewEventsAndTasksProps) {
  const navigate = useNavigate();
  const { userId } = useUser();
  
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
      const dueDate = t.dueDate || t.due;
      const dueDateObj = dueDate ? new Date(dueDate) : null;
      const dueDateOnly = dueDateObj 
        ? new Date(dueDateObj.getFullYear(), dueDateObj.getMonth(), dueDateObj.getDate())
        : null;
      
      const isOverdue = dueDateOnly ? dueDateOnly < today && !t.done : false;
      const isDueSoon = dueDateOnly && !isOverdue ? dueDateOnly <= threeDaysFromNow : false;
      
      // Format assignedTo
      let assignedTo: string | undefined;
      if (typeof t.assignedTo === 'string') {
        assignedTo = t.assignedTo;
      } else if (Array.isArray(t.assignedTo) && t.assignedTo.length > 0) {
        assignedTo = t.assignedTo[0].name || t.assignedTo[0].email;
      }
      
      return {
        id: t.id || t.taskId || '',
        type: 'task' as const,
        title: t.title || 'Untitled task',
        dueDate,
        status: t.status,
        done: t.done ?? false,
        assignedTo,
        assigneeId: t.assigneeId,
        assigneeIds: t.assigneeIds,
        isOverdue,
        isDueSoon,
        source: t.source ?? t,
      };
    });
  }, [tasks]);
  
  const handleToggleTask = useCallback((id: string) => {
    onToggleTask?.(id);
  }, [onToggleTask]);
  
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

  return (
    <div className={styles.overviewEventsCard}>
      <CommandPanel
        events={timelineEvents}
        tasks={timelineTasks}
        currentUserId={userId}
        onToggleTask={handleToggleTask}
        onEditItem={handleEditItem}
        onQuickEditTask={onQuickEditTask}
        onViewCalendar={handleViewCalendar}
        onCreateTask={handleCreateTask}
        onCreateEvent={handleCreateEvent}
      />
    </div>
  );
}

export default OverviewEventsAndTasks;
