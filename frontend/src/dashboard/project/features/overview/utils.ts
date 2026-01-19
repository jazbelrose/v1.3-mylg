// Overview HUD Utility Functions

import type {
  BudgetHealth,
  ScheduleHealth,
  DeliverablesHealth,
  RisksHealth,
  TimelineItem,
  TimelineDay,
  RecentUpdate,
} from './types';
import type { BudgetStats } from '@/dashboard/project/features/budget/context/types';

// ============================================================================
// DATE UTILITIES
// ============================================================================

export function formatDayLabel(date: Date, today: Date): string {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((dateStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  
  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatTimeRange(startTime: string | null, endTime: string | null): string {
  if (!startTime) return 'All-day';
  if (!endTime) return startTime;
  return `${startTime} – ${endTime}`;
}

export function parseTimeString(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return null;
  }
}

export function getNext7Days(today: Date = new Date()): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

export function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

// ============================================================================
// BUDGET HEALTH
// ============================================================================

export function computeBudgetHealth(stats: BudgetStats | null): BudgetHealth {
  if (!stats || (!stats.budgetedCost && !stats.actualCost && !stats.ballpark)) {
    return {
      approved: 0,
      actual: 0,
      variance: 0,
      variancePercent: 0,
      status: 'not-started',
      hasData: false,
    };
  }

  const approved = stats.budgetedCost || stats.ballpark || 0;
  const actual = stats.actualCost || 0;
  const variance = approved - actual;
  const variancePercent = approved > 0 ? (variance / approved) * 100 : 0;

  let status: BudgetHealth['status'] = 'on-track';
  if (actual > approved && approved > 0) {
    status = 'over-budget';
  } else if (actual < approved * 0.5 && actual > 0) {
    status = 'under-budget';
  }

  return {
    approved,
    actual,
    variance,
    variancePercent,
    status,
    hasData: true,
  };
}

// ============================================================================
// SCHEDULE HEALTH
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
}

export function computeScheduleHealth(
  events: CalendarEvent[],
  tasks: TaskItem[],
  today: Date = new Date()
): ScheduleHealth {
  const futureEvents = events.filter(e => {
    const eventDate = e.date ? new Date(e.date) : null;
    return eventDate && eventDate >= today;
  }).sort((a, b) => {
    const dateA = new Date(a.date || 0);
    const dateB = new Date(b.date || 0);
    return dateA.getTime() - dateB.getTime();
  });

  const nextEvent = futureEvents[0];
  let daysToNextMilestone: number | null = null;
  let nextMilestoneLabel: string | null = null;

  if (nextEvent?.date) {
    const eventDate = new Date(nextEvent.date);
    daysToNextMilestone = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    nextMilestoneLabel = nextEvent.title || nextEvent.description || 'Upcoming event';
  }

  // Find next scheduled item (event or task)
  const allItems = [
    ...futureEvents.map(e => ({
      date: e.date,
      label: e.title || e.description || 'Event',
    })),
    ...tasks.filter(t => t.dueDate && new Date(t.dueDate) >= today).map(t => ({
      date: t.dueDate,
      label: t.title || 'Task',
    })),
  ].sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime());

  const nextScheduledItem = allItems[0]?.label || null;

  // Count conflicts - overlapping scheduled time windows (future items only)
  const futureTasks = tasks.filter(t => {
    const when = t.startAt || t.dueDate;
    if (!when) return false;
    const d = new Date(when);
    return !isNaN(d.getTime()) && d >= today;
  });

  const conflictCount = detectConflicts(futureEvents, futureTasks).length;

  let status: ScheduleHealth['status'] = 'on-track';
  if (conflictCount > 0) {
    status = 'conflict';
  } else if (futureEvents.length === 0 && tasks.length === 0) {
    status = 'no-events';
  }

  return {
    daysToNextMilestone,
    nextMilestoneLabel,
    nextScheduledItem,
    conflictCount,
    status,
  };
}

// ============================================================================
// CONFLICT DETECTION
// ============================================================================

interface TimeSlot {
  id: string;
  start: Date;
  end: Date;
  isFlexible: boolean;
  title: string;
}

export function detectConflicts(
  events: CalendarEvent[],
  tasks: TaskItem[]
): Array<{ item1: string; item2: string; severity: 'hard' | 'soft' }> {
  const slots: TimeSlot[] = [];

  // Convert events to time slots
  events.forEach(e => {
    if (!e.date) return;
    const baseDate = new Date(e.date);
    const start = e.startAt ? new Date(e.startAt) : baseDate;
    const end = e.endAt ? new Date(e.endAt) : new Date(start.getTime() + 60 * 60 * 1000);
    slots.push({
      id: e.id || e.eventId || '',
      start,
      end,
      isFlexible: false, // Events are fixed
      title: e.title || e.description || 'Event',
    });
  });

  // Convert tasks to time slots
  tasks.forEach(t => {
    if (!t.startAt && !t.dueDate) return;
    const start = t.startAt ? new Date(t.startAt) : new Date(t.dueDate!);
    const end = t.endAt ? new Date(t.endAt) : new Date(start.getTime() + 60 * 60 * 1000);
    slots.push({
      id: t.id || t.taskId || '',
      start,
      end,
      isFlexible: true, // Tasks can be moved
      title: t.title || 'Task',
    });
  });

  const conflicts: Array<{ item1: string; item2: string; severity: 'hard' | 'soft' }> = [];

  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];

      // Check for overlap
      if (a.start < b.end && b.start < a.end) {
        const overlapMs = Math.min(a.end.getTime(), b.end.getTime()) - 
                          Math.max(a.start.getTime(), b.start.getTime());
        const overlapMins = overlapMs / 60000;

        // Hard conflict: both fixed OR overlap > 30 min
        const severity = (!a.isFlexible && !b.isFlexible) || overlapMins > 30 ? 'hard' : 'soft';
        conflicts.push({ item1: a.id, item2: b.id, severity });
      }
    }
  }

  return conflicts;
}

// ============================================================================
// DELIVERABLES HEALTH
// ============================================================================

interface DeckVersion {
  versionId?: string;
  title?: string;
  name?: string;
  version?: string;
  isDefault?: boolean;
  isClientDefault?: boolean;
  exportedAt?: string;
  createdAt?: string;
  approvalState?: string;
}

export function computeDeliverablesHealth(deckVersions: DeckVersion[]): DeliverablesHealth {
  if (!deckVersions || deckVersions.length === 0) {
    return {
      latestDeckName: null,
      latestDeckVersion: null,
      lastExportTime: null,
      approvalState: null,
      hasDecks: false,
    };
  }

  // Find the default or most recent deck
  const defaultDeck =
    deckVersions.find(d => d.isClientDefault) ||
    deckVersions.find(d => d.isDefault) ||
    deckVersions[0];
  
  return {
    latestDeckName: defaultDeck.title || defaultDeck.name || 'Untitled Deck',
    latestDeckVersion: defaultDeck.version || 'v1',
    lastExportTime: defaultDeck.exportedAt || defaultDeck.createdAt || null,
    approvalState: (defaultDeck.approvalState as 'approved' | 'pending' | 'none') || null,
    hasDecks: true,
  };
}

// ============================================================================
// RISKS HEALTH
// ============================================================================

export function computeRisksHealth(tasks: TaskItem[], today: Date = new Date()): RisksHealth {
  let openRisksCount = 0;
  let waitingOnClientCount = 0;
  let overdueCount = 0;

  tasks.forEach(task => {
    const status = task.status?.toLowerCase() || '';
    
    // Count overdue
    if (task.dueDate && new Date(task.dueDate) < today && status !== 'done') {
      overdueCount++;
    }

    // Count waiting on client (customize based on your status values)
    if (status === 'in_review' || status === 'needs_changes') {
      waitingOnClientCount++;
    }

    // Count open risks (todo or in_progress with blockers - simplified)
    if (status === 'todo' || status === 'in_progress') {
      openRisksCount++;
    }
  });

  let riskStatus: RisksHealth['status'] = 'clear';
  if (overdueCount > 0) {
    riskStatus = 'urgent';
  } else if (waitingOnClientCount > 0 || openRisksCount > 3) {
    riskStatus = 'attention';
  }

  return {
    openRisksCount,
    waitingOnClientCount,
    overdueCount,
    status: riskStatus,
  };
}

// ============================================================================
// TIMELINE GROUPING
// ============================================================================

export function groupTimelineByDay(
  items: TimelineItem[],
  today: Date = new Date()
): TimelineDay[] {
  const dayMap = new Map<string, TimelineItem[]>();

  items.forEach(item => {
    const dateKey = item.date.toISOString().split('T')[0];
    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, []);
    }
    dayMap.get(dateKey)!.push(item);
  });

  // Sort items within each day
  dayMap.forEach((dayItems) => {
    dayItems.sort((a, b) => {
      // All-day first
      if (a.isAllDay && !b.isAllDay) return -1;
      if (!a.isAllDay && b.isAllDay) return 1;
      // Then by start time
      if (a.startTime && b.startTime) {
        return a.startTime.localeCompare(b.startTime);
      }
      return 0;
    });
  });

  // Convert to array and sort by date
  return Array.from(dayMap.entries())
    .map(([dateKey, dayItems]) => ({
      date: new Date(dateKey),
      label: formatDayLabel(new Date(dateKey), today),
      items: dayItems,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ============================================================================
// FORMAT HELPERS
// ============================================================================

export function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

export function formatVariance(value: number, isPercent = false): string {
  const sign = value >= 0 ? '+' : '';
  if (isPercent) {
    return `${sign}${value.toFixed(1)}%`;
  }
  return `${sign}${formatCurrency(Math.abs(value))}`;
}

export function getActivityIcon(type: RecentUpdate['type']): string {
  const icons: Record<string, string> = {
    budget: '💰',
    slide: '📊',
    file: '📎',
    task: '✅',
    comment: '💬',
    gallery: '🖼️',
    project: '📁',
  };
  return icons[type] || '📋';
}
