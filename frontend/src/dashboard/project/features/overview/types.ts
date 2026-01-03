/**
 * Overview Feature Types
 */

export interface HealthTileData {
  label: string;
  value: string | number;
  subValue?: string;
  status: 'healthy' | 'warning' | 'critical' | 'neutral';
  cta: {
    label: string;
    path: string;
  };
}

export interface TimelineItem {
  id: string;
  type: 'event' | 'task';
  title: string;
  date: Date;
  startTime?: string; // "HH:mm" or null for all-day
  endTime?: string;
  isAllDay?: boolean;
  status?: string;
  assignee?: {
    id: string;
    name: string;
    avatar?: string;
  };
  hasConflict?: boolean;
  conflictSeverity?: 'hard' | 'soft';
  conflictingItems?: TimelineItem[];
  isDueToday?: boolean;
  isOverdue?: boolean;
  projectId?: string;
  projectTitle?: string;
  taskId?: string;
  eventId?: string;
}

export interface DayGroup {
  date: Date;
  label: string; // "Today", "Tomorrow", "Wed Jan 3"
  items: TimelineItem[];
}

export interface ActivityItem {
  id: string;
  type: string;
  summary: string;
  timestamp: string;
  user?: {
    name: string;
    avatar?: string;
  };
  link?: string;
}

export interface AssetSummary {
  decks: {
    count: number;
    latest?: {
      name: string;
      version?: number;
      lastModified?: string;
      thumbnailUrl?: string;
    };
  };
  galleries: {
    count: number;
    thumbnails: string[];
  };
  files: {
    count: number;
    lastUploadedAt?: string;
  };
}

export type TimelineFilter = 'all' | 'events' | 'tasks';
