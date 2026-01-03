// Overview HUD Types

export interface HealthMetric {
  label: string;
  value: string | number;
  status: 'healthy' | 'warning' | 'critical' | 'neutral';
  subtext?: string;
}

export interface BudgetHealth {
  approved: number;
  actual: number;
  variance: number;
  variancePercent: number;
  status: 'on-track' | 'over-budget' | 'under-budget' | 'not-started';
  hasData: boolean;
}

export interface ScheduleHealth {
  daysToNextMilestone: number | null;
  nextMilestoneLabel: string | null;
  nextScheduledItem: string | null;
  conflictCount: number;
  status: 'on-track' | 'at-risk' | 'conflict' | 'no-events';
}

export interface DeliverablesHealth {
  latestDeckName: string | null;
  latestDeckVersion: string | null;
  lastExportTime: string | null;
  approvalState: 'approved' | 'pending' | 'none' | null;
  hasDecks: boolean;
}

export interface RisksHealth {
  openRisksCount: number;
  waitingOnClientCount: number;
  overdueCount: number;
  status: 'clear' | 'attention' | 'urgent';
}

export interface TimelineItem {
  id: string;
  type: 'event' | 'task';
  title: string;
  date: Date;
  startTime: string | null;  // "HH:mm" or null for all-day
  endTime: string | null;    // "HH:mm" or null for all-day
  isAllDay: boolean;
  status?: string;
  assignee?: string;
  assigneeId?: string;
  dueLabel?: 'overdue' | 'due-today' | 'due-soon' | null;
  hasConflict?: boolean;
  conflictSeverity?: 'hard' | 'soft';
  conflictingItems?: string[];
  sourceId: string;  // original taskId or eventId
  address?: string;
  tags?: string[];
}

export interface TimelineDay {
  date: Date;
  label: string;  // "Today", "Tomorrow", "Wed Jan 3", etc.
  items: TimelineItem[];
}

export interface RecentUpdate {
  id: string;
  type: 'budget' | 'slide' | 'file' | 'task' | 'comment' | 'gallery' | 'project';
  summary: string;
  timestamp: string;
  userId?: string;
  userName?: string;
  userAvatar?: string;
  linkPath?: string;
  icon: string;
}

export interface AssetPreview {
  type: 'deck' | 'gallery' | 'file';
  id: string;
  name: string;
  thumbnail?: string;
  version?: string;
  count?: number;
  lastUpdated?: string;
}

export type TimelineFilter = 'all' | 'events' | 'tasks';
