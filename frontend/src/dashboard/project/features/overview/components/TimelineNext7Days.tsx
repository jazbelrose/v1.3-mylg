/**
 * TimelineNext7Days - Unified events + tasks timeline for Overview HUD
 * 
 * Replaces the full month calendar and full tasks panel.
 * Shows merged events and tasks for the next 7 days with conflict detection.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, AlertTriangle, User2 } from 'lucide-react';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
import {
  formatTimeRange,
  parseTimeString,
  getNext7Days,
  isSameDay,
  groupTimelineByDay,
  detectConflicts,
} from '../utils';
import type { TimelineItem, TimelineFilter } from '../types';
import styles from '../OverviewHud.module.css';

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

interface TimelineNext7DaysProps {
  projectId: string;
  projectTitle?: string;
  events: CalendarEvent[];
  tasks: TaskItem[];
  onItemClick?: (item: TimelineItem) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeEventsToTimeline(events: CalendarEvent[], today: Date): TimelineItem[] {
  const next7Days = getNext7Days(today);
  const endDate = next7Days[next7Days.length - 1];

  return events
    .filter(e => {
      if (!e.date) return false;
      const eventDate = new Date(e.date);
      return eventDate >= today && eventDate <= endDate;
    })
    .map(e => {
      const eventDate = new Date(e.date!);
      const startTime = parseTimeString(e.startAt);
      const endTime = parseTimeString(e.endAt);
      
      return {
        id: `event-${e.id || e.eventId}`,
        type: 'event' as const,
        title: e.title || e.description || 'Event',
        date: eventDate,
        startTime,
        endTime,
        isAllDay: e.allDay ?? (!e.startAt),
        sourceId: e.id || e.eventId || '',
      };
    });
}

function normalizeTasksToTimeline(tasks: TaskItem[], today: Date): TimelineItem[] {
  const next7Days = getNext7Days(today);
  const endDate = next7Days[next7Days.length - 1];
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return tasks
    .filter(t => {
      if (!t.dueDate) return false;
      const dueDate = new Date(t.dueDate);
      return dueDate <= endDate;
    })
    .map(t => {
      const dueDate = new Date(t.dueDate!);
      const startTime = parseTimeString(t.startAt);
      const endTime = parseTimeString(t.endAt);

      // Compute due label
      let dueLabel: TimelineItem['dueLabel'] = null;
      if (dueDate < todayStart) {
        dueLabel = 'overdue';
      } else if (isSameDay(dueDate, today)) {
        dueLabel = 'due-today';
      } else {
        const diffDays = Math.ceil((dueDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 2) {
          dueLabel = 'due-soon';
        }
      }

      // Format assignee
      let assignee: string | undefined;
      if (t.assignedTo) {
        if (typeof t.assignedTo === 'string') {
          assignee = t.assignedTo;
        } else if (Array.isArray(t.assignedTo) && t.assignedTo.length > 0) {
          assignee = t.assignedTo[0].name || t.assignedTo[0].email;
        }
      }

      return {
        id: `task-${t.id || t.taskId}`,
        type: 'task' as const,
        title: t.title || 'Task',
        date: dueDate,
        startTime,
        endTime,
        isAllDay: !t.startAt,
        status: t.status,
        assignee,
        dueLabel,
        sourceId: t.id || t.taskId || '',
        address: t.address,
      };
    });
}

function applyConflicts(
  items: TimelineItem[],
  events: CalendarEvent[],
  tasks: TaskItem[]
): TimelineItem[] {
  const conflicts = detectConflicts(events, tasks);
  const conflictMap = new Map<string, { severity: 'hard' | 'soft'; conflicting: string[] }>();

  conflicts.forEach(c => {
    // Item 1
    if (!conflictMap.has(c.item1)) {
      conflictMap.set(c.item1, { severity: c.severity, conflicting: [] });
    }
    const entry1 = conflictMap.get(c.item1)!;
    entry1.conflicting.push(c.item2);
    if (c.severity === 'hard') entry1.severity = 'hard';

    // Item 2
    if (!conflictMap.has(c.item2)) {
      conflictMap.set(c.item2, { severity: c.severity, conflicting: [] });
    }
    const entry2 = conflictMap.get(c.item2)!;
    entry2.conflicting.push(c.item1);
    if (c.severity === 'hard') entry2.severity = 'hard';
  });

  return items.map(item => {
    const conflict = conflictMap.get(item.sourceId);
    if (conflict) {
      return {
        ...item,
        hasConflict: true,
        conflictSeverity: conflict.severity,
        conflictingItems: conflict.conflicting,
      };
    }
    return item;
  });
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface TimelineItemRowProps {
  item: TimelineItem;
  onClick?: () => void;
}

function TimelineItemRow({ item, onClick }: TimelineItemRowProps) {
  const timeLabel = formatTimeRange(item.startTime, item.endTime);
  
  const conflictClass = item.hasConflict
    ? item.conflictSeverity === 'hard'
      ? `${styles.hasConflict} ${styles.hard}`
      : styles.hasConflict
    : '';

  return (
    <div
      className={`${styles.timelineItem} ${conflictClass}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className={styles.timelineItemTime}>{timeLabel}</div>
      
      <div className={styles.timelineItemContent}>
        <div className={styles.timelineItemRow}>
          <span className={styles.timelineItemTitle}>{item.title}</span>
          <span className={`${styles.timelineItemChip} ${styles[item.type]}`}>
            {item.type}
          </span>
        </div>
        
        <div className={styles.timelineItemMeta}>
          {item.type === 'task' && item.assignee && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <User2 size={12} />
              {item.assignee}
            </span>
          )}
          
          {item.dueLabel === 'overdue' && (
            <span className={`${styles.timelineItemBadge} ${styles.overdue}`}>
              Overdue
            </span>
          )}
          
          {item.dueLabel === 'due-today' && (
            <span className={`${styles.timelineItemBadge} ${styles.dueToday}`}>
              Due Today
            </span>
          )}
          
          {item.hasConflict && (
            <span className={`${styles.timelineItemBadge} ${styles.conflict}`}>
              <AlertTriangle size={10} />
              Conflict
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TimelineNext7Days({
  projectId,
  projectTitle,
  events,
  tasks,
  onItemClick,
}: TimelineNext7DaysProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const today = useMemo(() => new Date(), []);

  // Normalize and merge items
  const allItems = useMemo(() => {
    const eventItems = normalizeEventsToTimeline(events, today);
    const taskItems = normalizeTasksToTimeline(tasks, today);
    const merged = [...eventItems, ...taskItems];
    return applyConflicts(merged, events, tasks);
  }, [events, tasks, today]);

  // Apply filter
  const filteredItems = useMemo(() => {
    if (filter === 'all') return allItems;
    return allItems.filter(item => item.type === (filter === 'events' ? 'event' : 'task'));
  }, [allItems, filter]);

  // Group by day
  const groupedDays = useMemo(
    () => groupTimelineByDay(filteredItems, today),
    [filteredItems, today]
  );

  const handleOpenCalendar = useCallback(() => {
    navigate(getProjectDashboardPath(projectId, projectTitle, '/calendar'));
  }, [navigate, projectId, projectTitle]);

  const handleItemClick = useCallback((item: TimelineItem) => {
    if (onItemClick) {
      onItemClick(item);
    } else {
      // Default: navigate to calendar or tasks page
      const path = item.type === 'event' ? '/calendar' : '/tasks';
      navigate(getProjectDashboardPath(projectId, projectTitle, path));
    }
  }, [onItemClick, navigate, projectId, projectTitle]);

  return (
    <div className={styles.timelineCard}>
      <div className={styles.timelineHeader}>
        <span className={styles.timelineTitle}>Next 7 Days</span>
        
        <div className={styles.timelineFilters}>
          {(['all', 'events', 'tasks'] as TimelineFilter[]).map(f => (
            <button
              key={f}
              className={`${styles.timelineFilterBtn} ${filter === f ? styles.active : ''}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.timelineBody}>
        {groupedDays.length === 0 ? (
          <div className={styles.timelineEmpty}>
            <div className={styles.timelineEmptyIcon}>📅</div>
            <div className={styles.timelineEmptyText}>
              {filter === 'all'
                ? 'No events or tasks in the next 7 days'
                : `No ${filter} in the next 7 days`}
            </div>
          </div>
        ) : (
          groupedDays.map(day => (
            <div key={day.date.toISOString()} className={styles.timelineDayGroup}>
              <div
                className={`${styles.timelineDayHeader} ${
                  day.label === 'Today' ? styles.today : ''
                }`}
              >
                {day.label}
              </div>
              {day.items.map(item => (
                <TimelineItemRow
                  key={item.id}
                  item={item}
                  onClick={() => handleItemClick(item)}
                />
              ))}
            </div>
          ))
        )}
      </div>

      <div className={styles.timelineFooter}>
        <span className={styles.healthTileCta} onClick={handleOpenCalendar}>
          Open Calendar <ChevronRight size={12} />
        </span>
      </div>
    </div>
  );
}

export default TimelineNext7Days;
