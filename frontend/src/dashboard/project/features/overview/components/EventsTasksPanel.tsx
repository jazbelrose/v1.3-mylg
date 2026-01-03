/**
 * EventsTasksPanel - Apple-level Events & Tasks panel for Overview
 * 
 * Features:
 * - Sticky header with "Events & Tasks" + "Open Map" button
 * - Search + filter pill row (Views presets + Refiners)
 * - Grouped list with sticky headers (Overdue / Due Soon / Later)
 * - Clean row design: title, meta line, status pill, avatar
 * - Keyboard shortcuts (Cmd+K for search)
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  MapPin,
  ChevronDown,
  Check,
  X,
  Calendar,
  CheckSquare,
  AlertTriangle,
  Clock,
  User2,
} from 'lucide-react';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import styles from '../OverviewHud.module.css';

// ============================================================================
// TYPES
// ============================================================================

export type ViewPreset = 'next7' | 'today' | 'overdue' | 'open' | 'conflicts' | 'completed';

export interface RefinerState {
  types: ('event' | 'task')[];
  assignee: ('me' | 'unassigned' | 'client' | 'team')[];
  status: ('open' | 'due-soon' | 'overdue' | 'completed')[];
  sort: 'due' | 'priority' | 'updated';
}

interface CalendarEvent {
  id?: string;
  eventId?: string;
  date?: string;
  startAt?: string | null;
  endAt?: string | null;
  description?: string;
  title?: string;
  allDay?: boolean;
  location?: string;
}

interface TaskItem {
  id?: string;
  taskId?: string;
  title?: string;
  dueDate?: string;
  startAt?: string | null;
  endAt?: string | null;
  status?: string;
  priority?: string;
  assignedTo?: string | { name?: string; email?: string; avatar?: string }[];
  address?: string;
  updatedAt?: string;
}

interface UnifiedItem {
  id: string;
  type: 'event' | 'task';
  title: string;
  date: Date;
  meta: string; // Due date + assignee OR event location
  status?: string;
  statusLabel?: string;
  statusCategory?: 'neutral' | 'warning' | 'critical' | 'success';
  assignee?: { name: string; initials: string; avatar?: string };
  hasConflict?: boolean;
  isOverdue?: boolean;
  isDueSoon?: boolean;
  isCompleted?: boolean;
  sourceId: string;
  source: CalendarEvent | TaskItem;
}

interface GroupedItems {
  overdue: UnifiedItem[];
  dueSoon: UnifiedItem[];
  later: UnifiedItem[];
}

interface EventsTasksPanelProps {
  projectId: string;
  projectTitle?: string;
  events: CalendarEvent[];
  tasks: TaskItem[];
  currentUserId?: string;
  onItemClick?: (item: UnifiedItem) => void;
  onOpenMap?: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const VIEW_PRESETS: { value: ViewPreset; label: string; short: string }[] = [
  { value: 'next7', label: 'Next 7 Days', short: '7 Days' },
  { value: 'today', label: 'Today', short: 'Today' },
  { value: 'overdue', label: 'Overdue', short: 'Overdue' },
  { value: 'open', label: 'All Open', short: 'Open' },
  { value: 'conflicts', label: 'Conflicts', short: 'Conflicts' },
  { value: 'completed', label: 'Completed', short: 'Done' },
];

const DEFAULT_REFINERS: RefinerState = {
  types: ['event', 'task'],
  assignee: [],
  status: ['open', 'due-soon', 'overdue'],
  sort: 'due',
};

// ============================================================================
// HELPERS
// ============================================================================

function formatInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function parseAssignee(assignedTo?: string | { name?: string; email?: string; avatar?: string }[]): { name: string; initials: string; avatar?: string } | undefined {
  if (!assignedTo) return undefined;
  
  if (typeof assignedTo === 'string') {
    return { name: assignedTo, initials: formatInitials(assignedTo) };
  }
  
  if (Array.isArray(assignedTo) && assignedTo.length > 0) {
    const first = assignedTo[0];
    const name = first.name || first.email || 'Unknown';
    return { name, initials: formatInitials(name), avatar: first.avatar };
  }
  
  return undefined;
}

function formatDateMeta(date: Date, today: Date): string {
  const diffMs = date.getTime() - today.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    return absDays === 1 ? 'Yesterday' : `${absDays} days ago`;
  }
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function normalizeItems(
  events: CalendarEvent[],
  tasks: TaskItem[],
  today: Date
): UnifiedItem[] {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const items: UnifiedItem[] = [];

  // Normalize events
  events.forEach(e => {
    if (!e.date) return;
    const date = new Date(e.date);
    const timeStr = e.allDay || !e.startAt ? 'All day' : e.startAt;
    const meta = e.location ? `${timeStr} · ${e.location}` : timeStr;

    items.push({
      id: `event-${e.id || e.eventId}`,
      type: 'event',
      title: e.title || e.description || 'Event',
      date,
      meta,
      statusLabel: formatDateMeta(date, today),
      statusCategory: 'neutral',
      sourceId: e.id || e.eventId || '',
      source: e,
    });
  });

  // Normalize tasks
  tasks.forEach(t => {
    if (!t.dueDate) return;
    const date = new Date(t.dueDate);
    const diffDays = Math.floor((date.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
    
    const isOverdue = diffDays < 0;
    const isDueSoon = diffDays >= 0 && diffDays <= 2;
    const status = t.status?.toLowerCase() || '';
    const isCompleted = status === 'done' || status === 'completed' || status === 'complete' || status === 'archived';
    
    const assignee = parseAssignee(t.assignedTo);
    const meta = assignee ? `Due ${formatDateMeta(date, today)} · ${assignee.name}` : `Due ${formatDateMeta(date, today)}`;

    let statusLabel = formatDateMeta(date, today);
    let statusCategory: UnifiedItem['statusCategory'] = 'neutral';
    
    if (isCompleted) {
      statusLabel = 'Done';
      statusCategory = 'success';
    } else if (isOverdue) {
      statusLabel = 'Overdue';
      statusCategory = 'critical';
    } else if (isDueSoon) {
      statusLabel = diffDays === 0 ? 'Due Today' : 'Due Soon';
      statusCategory = 'warning';
    }

    items.push({
      id: `task-${t.id || t.taskId}`,
      type: 'task',
      title: t.title || 'Untitled task',
      date,
      meta,
      status: t.status,
      statusLabel,
      statusCategory,
      assignee,
      isOverdue,
      isDueSoon,
      isCompleted,
      sourceId: t.id || t.taskId || '',
      source: t,
    });
  });

  return items;
}

function groupItems(items: UnifiedItem[]): GroupedItems {
  const overdue: UnifiedItem[] = [];
  const dueSoon: UnifiedItem[] = [];
  const later: UnifiedItem[] = [];

  items.forEach(item => {
    if (item.isCompleted) {
      later.push(item); // Completed goes to later
    } else if (item.isOverdue) {
      overdue.push(item);
    } else if (item.isDueSoon) {
      dueSoon.push(item);
    } else {
      later.push(item);
    }
  });

  // Sort each group by date
  const sortByDate = (a: UnifiedItem, b: UnifiedItem) => a.date.getTime() - b.date.getTime();
  overdue.sort(sortByDate);
  dueSoon.sort(sortByDate);
  later.sort(sortByDate);

  return { overdue, dueSoon, later };
}

function applyViewPreset(
  items: UnifiedItem[],
  preset: ViewPreset,
  today: Date
): UnifiedItem[] {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const next7 = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  switch (preset) {
    case 'today':
      return items.filter(i => {
        const iDate = new Date(i.date.getFullYear(), i.date.getMonth(), i.date.getDate());
        return iDate.getTime() === todayStart.getTime();
      });
    case 'next7':
      return items.filter(i => i.date >= todayStart && i.date <= next7);
    case 'overdue':
      return items.filter(i => i.isOverdue && !i.isCompleted);
    case 'open':
      return items.filter(i => !i.isCompleted);
    case 'conflicts':
      return items.filter(i => i.hasConflict);
    case 'completed':
      return items.filter(i => i.isCompleted);
    default:
      return items;
  }
}

function applyRefiners(items: UnifiedItem[], refiners: RefinerState): UnifiedItem[] {
  let filtered = items;

  // Filter by type
  if (refiners.types.length > 0 && refiners.types.length < 2) {
    filtered = filtered.filter(i => refiners.types.includes(i.type));
  }

  // Filter by status
  if (refiners.status.length > 0 && refiners.status.length < 4) {
    filtered = filtered.filter(i => {
      if (i.isCompleted && refiners.status.includes('completed')) return true;
      if (i.isOverdue && refiners.status.includes('overdue')) return true;
      if (i.isDueSoon && refiners.status.includes('due-soon')) return true;
      if (!i.isCompleted && !i.isOverdue && !i.isDueSoon && refiners.status.includes('open')) return true;
      return false;
    });
  }

  // Sort
  if (refiners.sort === 'updated') {
    filtered = [...filtered].sort((a, b) => {
      const aTask = a.source as TaskItem;
      const bTask = b.source as TaskItem;
      const aUpdated = aTask.updatedAt ? new Date(aTask.updatedAt).getTime() : 0;
      const bUpdated = bTask.updatedAt ? new Date(bTask.updatedAt).getTime() : 0;
      return bUpdated - aUpdated;
    });
  }

  return filtered;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface ItemRowProps {
  item: UnifiedItem;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

function ItemRow({ item, onClick, onDoubleClick }: ItemRowProps) {
  const statusClass = item.statusCategory === 'critical'
    ? styles.etItemStatusCritical
    : item.statusCategory === 'warning'
      ? styles.etItemStatusWarning
      : item.statusCategory === 'success'
        ? styles.etItemStatusSuccess
        : styles.etItemStatusNeutral;

  return (
    <div
      className={`${styles.etItemRow} ${item.isCompleted ? styles.etItemCompleted : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDoubleClick?.();
      }}
    >
      <div className={styles.etItemContent}>
        <div className={styles.etItemTitle}>{item.title}</div>
        <div className={styles.etItemMeta}>
          {item.type === 'event' ? (
            <Calendar size={11} />
          ) : (
            <CheckSquare size={11} />
          )}
          <span>{item.meta}</span>
        </div>
      </div>
      
      <div className={styles.etItemRight}>
        <span className={`${styles.etItemStatus} ${statusClass}`}>
          {item.statusLabel}
        </span>
        {item.assignee && (
          <div className={styles.etItemAvatar} title={item.assignee.name}>
            {item.assignee.avatar ? (
              <img src={item.assignee.avatar} alt="" />
            ) : (
              <span>{item.assignee.initials}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface GroupHeaderProps {
  label: string;
  count: number;
  isSticky?: boolean;
}

function GroupHeader({ label, count }: GroupHeaderProps) {
  return (
    <div className={styles.etGroupHeader}>
      <span className={styles.etGroupLabel}>{label}</span>
      <span className={styles.etGroupCount}>{count}</span>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function EventsTasksPanel({
  projectId,
  projectTitle,
  events,
  tasks,
  onItemClick,
  onOpenMap,
}: EventsTasksPanelProps) {
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewPreset, setViewPreset] = useState<ViewPreset>('next7');
  const [refiners, setRefiners] = useState<RefinerState>(DEFAULT_REFINERS);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  
  const today = useMemo(() => new Date(), []);

  // Normalize all items
  const allItems = useMemo(
    () => normalizeItems(events, tasks, today),
    [events, tasks, today]
  );

  // Apply view preset
  const presetFiltered = useMemo(
    () => applyViewPreset(allItems, viewPreset, today),
    [allItems, viewPreset, today]
  );

  // Apply refiners
  const refinedItems = useMemo(
    () => applyRefiners(presetFiltered, refiners),
    [presetFiltered, refiners]
  );

  // Apply search
  const searchedItems = useMemo(() => {
    if (!searchQuery.trim()) return refinedItems;
    const q = searchQuery.toLowerCase();
    return refinedItems.filter(
      i => i.title.toLowerCase().includes(q) || i.meta.toLowerCase().includes(q)
    );
  }, [refinedItems, searchQuery]);

  // Group items
  const grouped = useMemo(() => groupItems(searchedItems), [searchedItems]);

  // Keyboard shortcut (Cmd+K or Ctrl+K for search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleOpenMap = useCallback(() => {
    if (onOpenMap) {
      onOpenMap();
    } else {
      navigate(getProjectDashboardPath(projectId, projectTitle, '/tasks'));
    }
  }, [onOpenMap, navigate, projectId, projectTitle]);

  const handleItemClick = useCallback((item: UnifiedItem) => {
    setSelectedItemId(item.id);
  }, []);

  const handleItemDoubleClick = useCallback((item: UnifiedItem) => {
    if (onItemClick) {
      onItemClick(item);
    } else {
      const path = item.type === 'event' ? '/calendar' : '/tasks';
      navigate(getProjectDashboardPath(projectId, projectTitle, path));
    }
  }, [onItemClick, navigate, projectId, projectTitle]);

  const handleResetFilters = useCallback(() => {
    setRefiners(DEFAULT_REFINERS);
    setViewPreset('next7');
    setSearchQuery('');
  }, []);

  const currentPreset = VIEW_PRESETS.find(p => p.value === viewPreset);
  const currentPresetShort = currentPreset?.short || 'Filter';
  const hasActiveFilters = viewPreset !== 'next7' || searchQuery.length > 0;

  const totalCount = grouped.overdue.length + grouped.dueSoon.length + grouped.later.length;

  return (
    <div className={styles.etPanel}>
      {/* Sticky Header */}
      <div className={styles.etHeader}>
        <div className={styles.etHeaderRow}>
          <h3 className={styles.etTitle}>Events &amp; Tasks</h3>
          <button
            type="button"
            className={styles.etMapButton}
            onClick={handleOpenMap}
          >
            <MapPin size={14} />
            <span>Open Map</span>
          </button>
        </div>

        {/* Filter Row */}
        <div className={styles.etFilterRow}>
          <div className={styles.etSearchBox}>
            <Search size={14} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.etSearchInput}
            />
            {searchQuery && (
              <button
                type="button"
                className={styles.etSearchClear}
                onClick={() => setSearchQuery('')}
              >
                <X size={12} />
              </button>
            )}
          </div>

          <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`${styles.etFilterPill} ${hasActiveFilters ? styles.etFilterActive : ''}`}
              >
                <span className={styles.etViewLabel}>View</span>
                <span className={styles.etViewValue}>{currentPresetShort}</span>
                <ChevronDown size={12} />
              </button>
            </PopoverTrigger>
            <PopoverContent className={styles.etFilterPopover} align="start">
              <div className={styles.etFilterHeader}>
                <span className={styles.etFilterTitle}>Views</span>
                <button
                  type="button"
                  className={styles.etFilterReset}
                  onClick={handleResetFilters}
                  disabled={!hasActiveFilters}
                >
                  Reset
                </button>
              </div>

              {/* View Presets */}
              <div className={styles.etFilterSection}>
                {VIEW_PRESETS.map(preset => (
                  <button
                    key={preset.value}
                    type="button"
                    className={`${styles.etFilterOption} ${viewPreset === preset.value ? styles.active : ''}`}
                    onClick={() => {
                      setViewPreset(preset.value);
                      setIsFilterOpen(false);
                    }}
                  >
                    {viewPreset === preset.value && <Check size={12} />}
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>

              {/* Refiners */}
              <div className={styles.etFilterDivider} />
              <div className={styles.etFilterHeader}>
                <span className={styles.etFilterTitle}>Type</span>
              </div>
              <div className={styles.etFilterSection}>
                <button
                  type="button"
                  className={`${styles.etFilterChip} ${refiners.types.includes('event') ? styles.active : ''}`}
                  onClick={() => setRefiners(r => ({
                    ...r,
                    types: r.types.includes('event')
                      ? r.types.filter(t => t !== 'event')
                      : [...r.types, 'event']
                  }))}
                >
                  <Calendar size={12} />
                  Events
                </button>
                <button
                  type="button"
                  className={`${styles.etFilterChip} ${refiners.types.includes('task') ? styles.active : ''}`}
                  onClick={() => setRefiners(r => ({
                    ...r,
                    types: r.types.includes('task')
                      ? r.types.filter(t => t !== 'task')
                      : [...r.types, 'task']
                  }))}
                >
                  <CheckSquare size={12} />
                  Tasks
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Scrollable List */}
      <div className={styles.etBody}>
        {totalCount === 0 ? (
          <div className={styles.etEmpty}>
            <div className={styles.etEmptyIcon}>📅</div>
            <div className={styles.etEmptyText}>
              {searchQuery
                ? 'No matches found'
                : 'No events or tasks in this view'}
            </div>
          </div>
        ) : (
          <>
            {/* Overdue Group */}
            {grouped.overdue.length > 0 && (
              <div className={styles.etGroup}>
                <GroupHeader label="Overdue" count={grouped.overdue.length} />
                {grouped.overdue.map(item => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    onClick={() => handleItemClick(item)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                  />
                ))}
              </div>
            )}

            {/* Due Soon Group */}
            {grouped.dueSoon.length > 0 && (
              <div className={styles.etGroup}>
                <GroupHeader label="Due Soon" count={grouped.dueSoon.length} />
                {grouped.dueSoon.map(item => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    onClick={() => handleItemClick(item)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                  />
                ))}
              </div>
            )}

            {/* Later Group */}
            {grouped.later.length > 0 && (
              <div className={styles.etGroup}>
                <GroupHeader label="Later" count={grouped.later.length} />
                {grouped.later.map(item => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    onClick={() => handleItemClick(item)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default EventsTasksPanel;
