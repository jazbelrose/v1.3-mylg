/**
 * CommandPanel - Silicon Valley-style unified Events & Tasks panel
 * 
 * Features:
 * - Segmented filter chips: Today · Next 7 · Next 30 · All + Me · Team
 * - Unified timeline feed with day dividers
 * - Hover quick actions with one primary action per row
 * - Compact/Comfortable density toggle
 * - Status as signal (thin severity strip/dot)
 * - Keyboard shortcuts (Enter, D, E, S)
 */

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  MoreHorizontal,
  ListTodo,
  Check,
  Edit3,
  Trash2,
  Copy,
  Send,
  Plus,
  Search,
  X,
} from 'lucide-react';
import styles from './CommandPanel.module.css';

// ============================================================================
// TYPES
// ============================================================================

export type TimeFilter = 'today' | 'next7' | 'next30' | 'all';
export type AssigneeFilter = 'me' | 'team' | 'all';

export interface TimelineEvent {
  id: string;
  type: 'event';
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  source?: unknown;
}

export interface TimelineTask {
  id: string;
  type: 'task';
  title: string;
  dueDate?: string;
  status?: string;
  done?: boolean;
  assignedTo?: string;
  assigneeId?: string;
  isOverdue?: boolean;
  isDueSoon?: boolean;
  source?: unknown;
}

export type TimelineItem = TimelineEvent | TimelineTask;

export interface CommandPanelProps {
  events: TimelineEvent[];
  tasks: TimelineTask[];
  currentUserId?: string;
  onToggleTask?: (id: string) => void;
  onEditItem?: (item: TimelineItem) => void;
  onDeleteItem?: (item: TimelineItem) => void;
  onDuplicateItem?: (item: TimelineItem) => void;
  onSubmitForReview?: (item: TimelineTask) => void;
  onCreateTask?: () => void;
  onCreateEvent?: () => void;
  onViewCalendar?: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TIME_FILTER_LABELS: Record<TimeFilter, string> = {
  today: 'Today',
  next7: 'Next 7',
  next30: 'Next 30',
  all: 'All',
};

const ASSIGNEE_FILTER_LABELS: Record<AssigneeFilter, string> = {
  me: 'Me',
  team: 'Team',
  all: 'All',
};

// ============================================================================
// HELPERS
// ============================================================================

function getDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function getDayLabel(date: Date, today: Date): string {
  const todayKey = getDateKey(today);
  const dateKey = getDateKey(date);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = getDateKey(tomorrow);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getDateKey(yesterday);
  
  if (dateKey === todayKey) return 'Today';
  if (dateKey === tomorrowKey) return 'Tomorrow';
  if (dateKey === yesterdayKey) return 'Yesterday';
  
  // Show weekday for next 7 days
  const diffDays = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 0 && diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }
  
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTimePill(item: TimelineItem): string {
  if (item.type === 'event') {
    if (item.allDay) return 'All day';
    if (item.startTime && item.endTime) {
      return `${formatTime(item.startTime)} – ${formatTime(item.endTime)}`;
    }
    if (item.startTime) return formatTime(item.startTime);
    return 'All day';
  } else {
    const date = parseDate(item.dueDate);
    if (!date) return 'No due date';
    return `Due ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
}

function formatTime(timeStr: string): string {
  try {
    const date = new Date(timeStr);
    if (isNaN(date.getTime())) {
      // Try parsing as time only (HH:MM)
      const [hours, minutes] = timeStr.split(':').map(Number);
      if (!isNaN(hours) && !isNaN(minutes)) {
        const period = hours >= 12 ? 'PM' : 'AM';
        const h = hours % 12 || 12;
        return `${h}:${minutes.toString().padStart(2, '0')} ${period}`;
      }
      return timeStr;
    }
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return timeStr;
  }
}

function getItemDate(item: TimelineItem): Date | null {
  if (item.type === 'event') {
    return parseDate(item.date);
  }
  return parseDate(item.dueDate);
}

function getStatusSeverity(item: TimelineTask): 'overdue' | 'due-soon' | 'normal' | 'done' {
  if (item.done || item.status?.toLowerCase() === 'done' || item.status?.toLowerCase() === 'completed') {
    return 'done';
  }
  if (item.isOverdue) return 'overdue';
  if (item.isDueSoon) return 'due-soon';
  
  const dueDate = parseDate(item.dueDate);
  if (!dueDate) return 'normal';
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  
  if (dueDateOnly < today) return 'overdue';
  
  const threeDaysFromNow = new Date(today);
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  
  if (dueDateOnly <= threeDaysFromNow) return 'due-soon';
  
  return 'normal';
}

function getInitials(name?: string): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function FilterChip({ label, active, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      className={`${styles.filterChip} ${active ? styles.filterChipActive : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

interface DayDividerProps {
  label: string;
}

function DayDivider({ label }: DayDividerProps) {
  return (
    <div className={styles.dayDivider}>
      <span className={styles.dayDividerLabel}>{label}</span>
      <div className={styles.dayDividerLine} />
    </div>
  );
}

interface TimelineRowProps {
  item: TimelineItem;
  isHovered: boolean;
  isSelected: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
  onPrimaryAction: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function TimelineRow({
  item,
  isHovered,
  isSelected,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onPrimaryAction,
  onContextMenu,
}: TimelineRowProps) {
  const isTask = item.type === 'task';
  const severity = isTask ? getStatusSeverity(item as TimelineTask) : 'normal';
  const isDone = severity === 'done';
  const assignee = isTask ? (item as TimelineTask).assignedTo : undefined;
  
  return (
    <div
      className={`${styles.timelineRow} ${isHovered ? styles.timelineRowHovered : ''} ${isSelected ? styles.timelineRowSelected : ''} ${isDone ? styles.timelineRowDone : ''}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      onContextMenu={onContextMenu}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick();
        if (e.key === 'd' || e.key === 'D') onPrimaryAction();
      }}
    >
      {/* Severity strip */}
      <div className={`${styles.severityStrip} ${styles[`severity${severity.charAt(0).toUpperCase() + severity.slice(1).replace('-', '')}`]}`} />
      
      {/* Time pill + icon */}
      <div className={styles.rowLeft}>
        <span className={styles.timePill}>{formatTimePill(item)}</span>
        {isTask ? (
          <ListTodo size={14} className={styles.typeIcon} />
        ) : (
          <CalendarIcon size={14} className={styles.typeIcon} />
        )}
      </div>
      
      {/* Title */}
      <div className={styles.rowCenter}>
        <span className={styles.rowTitle} title={item.title}>
          {item.title || 'Untitled'}
        </span>
      </div>
      
      {/* Right: assignee + primary action + overflow */}
      <div className={styles.rowRight}>
        {assignee && (
          <span className={styles.assigneeBadge} title={assignee}>
            {getInitials(assignee)}
          </span>
        )}
        
        {/* Primary action (visible on hover) */}
        {isHovered && (
          <button
            type="button"
            className={styles.primaryAction}
            onClick={(e) => {
              e.stopPropagation();
              onPrimaryAction();
            }}
            title={isTask ? 'Mark done' : 'Open'}
          >
            {isTask ? <Check size={14} /> : <Edit3 size={14} />}
            <span>{isTask ? 'Done' : 'Open'}</span>
          </button>
        )}
        
        {/* Overflow menu trigger */}
        {isHovered && (
          <button
            type="button"
            className={styles.overflowButton}
            onClick={(e) => {
              e.stopPropagation();
              onContextMenu(e);
            }}
            title="More actions"
          >
            <MoreHorizontal size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

interface ContextMenuProps {
  item: TimelineItem;
  position: { x: number; y: number };
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSubmitForReview?: () => void;
  onMarkDone?: () => void;
}

function ContextMenu({
  item,
  position,
  onClose,
  onEdit,
  onDelete,
  onDuplicate,
  onSubmitForReview,
  onMarkDone,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const isTask = item.type === 'task';
  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);
  
  return (
    <div
      ref={menuRef}
      className={styles.contextMenu}
      style={{ top: position.y, left: position.x }}
    >
      <button type="button" className={styles.contextMenuItem} onClick={onEdit}>
        <Edit3 size={14} />
        <span>Edit</span>
        <span className={styles.shortcut}>E</span>
      </button>
      {isTask && onMarkDone && (
        <button type="button" className={styles.contextMenuItem} onClick={onMarkDone}>
          <CheckCircle2 size={14} />
          <span>Mark done</span>
          <span className={styles.shortcut}>D</span>
        </button>
      )}
      {isTask && onSubmitForReview && (
        <button type="button" className={styles.contextMenuItem} onClick={onSubmitForReview}>
          <Send size={14} />
          <span>Submit for review</span>
        </button>
      )}
      <button type="button" className={styles.contextMenuItem} onClick={onDuplicate}>
        <Copy size={14} />
        <span>Duplicate</span>
      </button>
      <div className={styles.contextMenuDivider} />
      <button type="button" className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`} onClick={onDelete}>
        <Trash2 size={14} />
        <span>Delete</span>
      </button>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CommandPanel({
  events,
  tasks,
  currentUserId,
  onToggleTask,
  onEditItem,
  onDeleteItem,
  onDuplicateItem,
  onSubmitForReview,
  onCreateTask,
  onCreateEvent,
  onViewCalendar,
}: CommandPanelProps) {
  // Filters
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('next7');
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('me');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  
  // Selection & hover state
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    item: TimelineItem;
    position: { x: number; y: number };
  } | null>(null);
  
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  
  // Combine and filter items
  const filteredItems = useMemo(() => {
    const allItems: TimelineItem[] = [
      ...events.map(e => ({ ...e, type: 'event' as const })),
      ...tasks.map(t => ({ ...t, type: 'task' as const })),
    ];
    
    return allItems.filter(item => {
      // Time filter
      const itemDate = getItemDate(item);
      if (!itemDate && timeFilter !== 'all') {
        // Items without dates only show in 'all'
        return false;
      }
      
      if (itemDate) {
        const itemDateOnly = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
        
        if (timeFilter === 'today') {
          if (getDateKey(itemDateOnly) !== getDateKey(today)) return false;
        } else if (timeFilter === 'next7') {
          const endDate = new Date(today);
          endDate.setDate(endDate.getDate() + 7);
          if (itemDateOnly < today || itemDateOnly > endDate) return false;
        } else if (timeFilter === 'next30') {
          const endDate = new Date(today);
          endDate.setDate(endDate.getDate() + 30);
          if (itemDateOnly < today || itemDateOnly > endDate) return false;
        }
      }
      
      // Assignee filter (only applies to tasks)
      if (item.type === 'task' && assigneeFilter !== 'all') {
        const task = item as TimelineTask;
        const isMyTask = task.assigneeId === currentUserId || 
                         (!task.assigneeId && !task.assignedTo);
        
        if (assigneeFilter === 'me' && !isMyTask) return false;
        if (assigneeFilter === 'team' && isMyTask) return false;
      }
      
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        if (!item.title.toLowerCase().includes(query)) return false;
      }
      
      return true;
    });
  }, [events, tasks, timeFilter, assigneeFilter, searchQuery, today, currentUserId]);
  
  // Group by day
  const groupedItems = useMemo(() => {
    // Sort by date
    const sorted = [...filteredItems].sort((a, b) => {
      const dateA = getItemDate(a);
      const dateB = getItemDate(b);
      
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      
      return dateA.getTime() - dateB.getTime();
    });
    
    // Group by day
    const groups: Map<string, { label: string; items: TimelineItem[] }> = new Map();
    
    for (const item of sorted) {
      const itemDate = getItemDate(item);
      const key = itemDate ? getDateKey(itemDate) : 'no-date';
      const label = itemDate ? getDayLabel(itemDate, today) : 'No date';
      
      if (!groups.has(key)) {
        groups.set(key, { label, items: [] });
      }
      groups.get(key)!.items.push(item);
    }
    
    return Array.from(groups.entries());
  }, [filteredItems, today]);
  
  // Counts
  const taskCount = filteredItems.filter(i => i.type === 'task').length;
  const eventCount = filteredItems.filter(i => i.type === 'event').length;
  
  // Handlers
  const handlePrimaryAction = useCallback((item: TimelineItem) => {
    if (item.type === 'task') {
      onToggleTask?.(item.id);
    } else {
      onEditItem?.(item);
    }
  }, [onToggleTask, onEditItem]);
  
  const handleContextMenu = useCallback((e: React.MouseEvent, item: TimelineItem) => {
    e.preventDefault();
    setContextMenu({
      item,
      position: { x: e.clientX, y: e.clientY },
    });
  }, []);
  
  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);
  
  const handleEdit = useCallback(() => {
    if (contextMenu) {
      onEditItem?.(contextMenu.item);
      handleCloseContextMenu();
    }
  }, [contextMenu, onEditItem, handleCloseContextMenu]);
  
  const handleDelete = useCallback(() => {
    if (contextMenu) {
      onDeleteItem?.(contextMenu.item);
      handleCloseContextMenu();
    }
  }, [contextMenu, onDeleteItem, handleCloseContextMenu]);
  
  const handleDuplicate = useCallback(() => {
    if (contextMenu) {
      onDuplicateItem?.(contextMenu.item);
      handleCloseContextMenu();
    }
  }, [contextMenu, onDuplicateItem, handleCloseContextMenu]);
  
  const handleSubmitForReview = useCallback(() => {
    if (contextMenu && contextMenu.item.type === 'task') {
      onSubmitForReview?.(contextMenu.item as TimelineTask);
      handleCloseContextMenu();
    }
  }, [contextMenu, onSubmitForReview, handleCloseContextMenu]);
  
  const handleMarkDone = useCallback(() => {
    if (contextMenu && contextMenu.item.type === 'task') {
      onToggleTask?.(contextMenu.item.id);
      handleCloseContextMenu();
    }
  }, [contextMenu, onToggleTask, handleCloseContextMenu]);
  
  return (
    <div className={styles.commandPanel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h3 className={styles.title}>Events & Tasks</h3>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.searchToggle}
              onClick={() => setShowSearch(!showSearch)}
              title="Search (⌘K)"
            >
              <Search size={14} />
            </button>
            {onViewCalendar && (
              <button
                type="button"
                className={styles.calendarLink}
                onClick={onViewCalendar}
              >
                Calendar
              </button>
            )}
          </div>
        </div>
        
        {/* Search input */}
        {showSearch && (
          <div className={styles.searchWrapper}>
            <Search size={14} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search tasks & events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                className={styles.searchClear}
                onClick={() => setSearchQuery('')}
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}
        
        {/* Filter chips */}
        <div className={styles.filterRow}>
          <div className={styles.filterGroup}>
            {(Object.keys(TIME_FILTER_LABELS) as TimeFilter[]).map(filter => (
              <FilterChip
                key={filter}
                label={TIME_FILTER_LABELS[filter]}
                active={timeFilter === filter}
                onClick={() => setTimeFilter(filter)}
              />
            ))}
          </div>
          <div className={styles.filterDivider} />
          <div className={styles.filterGroup}>
            {(Object.keys(ASSIGNEE_FILTER_LABELS) as AssigneeFilter[]).map(filter => (
              <FilterChip
                key={filter}
                label={ASSIGNEE_FILTER_LABELS[filter]}
                active={assigneeFilter === filter}
                onClick={() => setAssigneeFilter(filter)}
              />
            ))}
          </div>
        </div>
        
        {/* Counts */}
        <div className={styles.counts}>
          <span>{taskCount} {taskCount === 1 ? 'task' : 'tasks'}</span>
          <span className={styles.countDot}>·</span>
          <span>{eventCount} {eventCount === 1 ? 'event' : 'events'}</span>
        </div>
      </div>
      
      {/* Content */}
      <div className={styles.content}>
        {groupedItems.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <CalendarIcon size={24} />
            </div>
            <div className={styles.emptyText}>No items to show</div>
            <div className={styles.emptyActions}>
              {onCreateTask && (
                <button type="button" className={styles.emptyAction} onClick={onCreateTask}>
                  <Plus size={14} />
                  <span>Create task</span>
                </button>
              )}
              {onCreateEvent && (
                <button type="button" className={styles.emptyAction} onClick={onCreateEvent}>
                  <Plus size={14} />
                  <span>Schedule event</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          groupedItems.map(([key, group]) => (
            <div key={key} className={styles.dayGroup}>
              <DayDivider label={group.label} />
              <div className={styles.dayItems}>
                {group.items.map(item => (
                  <TimelineRow
                    key={item.id}
                    item={item}
                    isHovered={hoveredId === item.id}
                    isSelected={selectedId === item.id}
                    onMouseEnter={() => setHoveredId(item.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => {
                      setSelectedId(item.id);
                      onEditItem?.(item);
                    }}
                    onPrimaryAction={() => handlePrimaryAction(item)}
                    onContextMenu={(e) => handleContextMenu(e, item)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      
      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          item={contextMenu.item}
          position={contextMenu.position}
          onClose={handleCloseContextMenu}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onSubmitForReview={contextMenu.item.type === 'task' ? handleSubmitForReview : undefined}
          onMarkDone={contextMenu.item.type === 'task' ? handleMarkDone : undefined}
        />
      )}
    </div>
  );
}

export default CommandPanel;
