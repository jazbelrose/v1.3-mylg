/**
 * CommandPanel - Silicon Valley-style unified Events & Tasks panel
 * 
 * Features:
 * - Segmented filter chips: Today · Next 7 · Next 30 · All + Me · Team · All
 * - Unified timeline feed with day dividers
 * - Hover quick actions with one primary action per row
 * - Single-click row opens Popover (Calendar parity)
 * - Double-click opens QuickCreate/Edit Task modal
 * - Auto-scroll to "Today" after data loads
 * - Compact/Comfortable density toggle
 * - Status as signal (thin severity strip/dot)
 * - Keyboard shortcuts (Enter, D, E, S)
 */

import React, { useMemo, useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  MoreHorizontal,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Edit3,
  Trash2,
  Copy,
  Send,
  Plus,
  Search,
  X,
  Pencil,
  CheckSquare,
  Square,
  ListTodo,
  Users,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ProjectAvatar } from '@/shared/ui';
import styles from './CommandPanel.module.css';

// ============================================================================
// TYPES
// ============================================================================

export type TimeFilter = 'today' | 'next7' | 'next30' | 'all';
export type AssigneeFilter = 'me' | 'team' | 'all';
export type TimelineItemType = 'timeblock' | 'focus_block' | 'multi_user_stack';

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
  assigneeId?: string | null;
  assigneeIds?: string[];
  assigneeTokens?: string[];
  isOverdue?: boolean;
  isDueSoon?: boolean;
  // Calendar semantics (used for Focus Blocks)
  kind?: string;
  startAt?: string | null;
  endAt?: string | null;
  plannedMinutes?: number;
  order?: number;
  focusBlockId?: string;
  focusChildTaskIds?: string[];
  focusChecklist?: Array<{ taskId: string; title: string }>;

  // List-only rendering hints
  itemType?: TimelineItemType;
  nestLevel?: number;
  ownerUserId?: string;
  containerAssigneeIds?: string[];
  groupDate?: string;
  sortTime?: number;
  focusGroup?: {
    isGroup: true;
    itemType?: TimelineItemType;
    ownerUserId?: string;
    assigneeIds?: string[];
    expanded: boolean;
    doneCount: number;
    totalCount: number;
    preview: Array<{ id: string; title: string; icon: 'checked' | 'unchecked' }>;
    assignees: Array<{ userId: string; firstName?: string; lastName?: string; thumbnail?: string | null }>;
  };
  focusChildOf?: string;
  source?: unknown;
}

export type TimelineItem = TimelineEvent | TimelineTask;

export interface CommandPanelProps {
  events: TimelineEvent[];
  tasks: TimelineTask[];
  teamMembers?: Array<{ userId: string; firstName?: string; lastName?: string; thumbnail?: string | null }>;
  currentUserId?: string;
  currentUserEmail?: string;
  isUserLoading?: boolean;
  onToggleTask?: (id: string) => void;
  onEditItem?: (item: TimelineItem) => void;
  onQuickEditTask?: (task: TimelineTask) => void;
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

function normalizeKind(kind: string | undefined): string {
  return typeof kind === 'string' ? kind.trim().toLowerCase() : '';
}

function parseAssigneeToken(token: string): { userId: string; firstName?: string; lastName?: string } | null {
  const raw = token.trim();
  if (!raw) return null;
  if (!raw.includes('__')) return null;
  const parts = raw.split('__').map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const userId = parts[parts.length - 1];
  const namePart = parts.slice(0, -1).join('__').trim();
  const nameBits = namePart.split(/\s+/).filter(Boolean);
  const firstName = nameBits[0];
  const lastName = nameBits.length > 1 ? nameBits.slice(1).join(' ') : undefined;
  return { userId, firstName, lastName };
}

function normalizeAssigneeId(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parts = trimmed.split('__').map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : undefined;
}

function uniqueBy<T>(items: T[], key: (item: T) => string | undefined): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function getTaskAssigneeMembers(
  task: TimelineTask,
  teamLookup?: Map<string, { userId: string; firstName?: string; lastName?: string; thumbnail?: string | null }>
): Array<{ userId: string; firstName?: string; lastName?: string; thumbnail?: string | null }> {
  const enrich = (m: { userId: string; firstName?: string; lastName?: string; thumbnail?: string | null }) => {
    const fromTeam = teamLookup?.get(m.userId);
    if (!fromTeam) return m;
    return {
      userId: m.userId,
      firstName: fromTeam.firstName || m.firstName,
      lastName: fromTeam.lastName || m.lastName,
      thumbnail: typeof fromTeam.thumbnail !== 'undefined' ? fromTeam.thumbnail : m.thumbnail,
    };
  };

  const fromTokens = (task.assigneeTokens ?? [])
    .map(parseAssigneeToken)
    .filter(Boolean)
    .map((p) => ({
      userId: (p as { userId: string }).userId,
      firstName: (p as { firstName?: string }).firstName,
      lastName: (p as { lastName?: string }).lastName,
      thumbnail: null,
    }));

  const fromIds = (task.assigneeIds ?? [])
    .map((raw) => {
      if (typeof raw !== 'string') return null;
      const token = parseAssigneeToken(raw);
      if (token) {
        return { userId: token.userId, firstName: token.firstName ?? '', lastName: token.lastName ?? '', thumbnail: null };
      }
      const normalized = normalizeAssigneeId(raw);
      return normalized ? { userId: normalized, firstName: '', lastName: '', thumbnail: null } : null;
    })
    .filter(Boolean) as Array<{ userId: string; firstName?: string; lastName?: string; thumbnail?: string | null }>;

  const fromSingle = (() => {
    const raw = task.assigneeId;
    if (!raw) return [];
    const token = parseAssigneeToken(raw);
    if (token) {
      return [{ userId: token.userId, firstName: token.firstName ?? '', lastName: token.lastName ?? '', thumbnail: null }];
    }
    const normalized = normalizeAssigneeId(raw);
    return normalized ? [{ userId: normalized, firstName: '', lastName: '', thumbnail: null }] : [];
  })();

  const base = uniqueBy([...fromTokens, ...fromIds, ...fromSingle], (m) => m.userId).map(enrich);
  if (base.length > 0) return base;

  const fromAssignedTo = typeof task.assignedTo === 'string' && task.assignedTo.trim()
    ? (() => {
        const clean = task.assignedTo.trim();
        const parts = clean.split(/\s+/).filter(Boolean);
        const firstName = parts[0] ?? '';
        const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
        return [{ userId: `name:${clean.toLowerCase()}`, firstName, lastName, thumbnail: null }];
      })()
    : [];

  return uniqueBy(fromAssignedTo, (m) => m.userId);
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
    const task = item as TimelineTask;

    // Child rows inherit the container's time semantics; don't repeat time/due pills.
    if (task.focusChildOf) return '';

    const kind = normalizeKind(task.kind);
    if (kind === 'focus_block' && (task.startAt || task.endAt)) {
      const startLabel = task.startAt ? formatTime(task.startAt) : undefined;
      const endLabel = task.endAt ? formatTime(task.endAt) : undefined;
      if (startLabel && endLabel) return `${startLabel} – ${endLabel}`;
      if (startLabel) return startLabel;
      if (endLabel) return endLabel;
    }

    const date = parseDate(task.dueDate);
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
  const task = item as TimelineTask;
  return parseDate(task.groupDate ?? task.dueDate);
}

function getSortTime(item: TimelineItem): number {
  if (item.type === 'task') {
    const sortTime = (item as TimelineTask).sortTime;
    if (typeof sortTime === 'number') return sortTime;
  }
  const d = getItemDate(item);
  return d ? d.getTime() : Number.MAX_SAFE_INTEGER;
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

function getMemberDisplayName(member?: { userId: string; firstName?: string; lastName?: string } | null): string {
  if (!member) return '';
  const name = [member.firstName, member.lastName].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (member.userId.startsWith('name:')) return member.userId.slice('name:'.length);
  return member.userId;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface FilterChipProps {
  label: string;
  active: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}

function FilterChip({ label, active, disabled, title, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      className={`${styles.filterChip} ${active ? styles.filterChipActive : ''} ${disabled ? styles.filterChipDisabled : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
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
  teamLookup?: Map<string, { userId: string; firstName?: string; lastName?: string; thumbnail?: string | null }>;
  isHovered: boolean;
  isSelected: boolean;
  popoverOpen: boolean;
  onPopoverOpenChange: (open: boolean) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
  onDoubleClick: () => void;
  onPrimaryAction: () => void;
  onEditAction: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onEllipsisClick: (e: React.MouseEvent) => void;
}

function AvatarCoinStack({
  members,
  maxVisible = 4,
}: {
  members: Array<{ userId: string; firstName?: string; lastName?: string; thumbnail?: string | null }>;
  maxVisible?: number;
}) {
  const uniqueMembers = useMemo(() => uniqueBy(members, (m) => m.userId), [members]);
  const visible = uniqueMembers.slice(0, maxVisible);
  const extra = Math.max(0, uniqueMembers.length - visible.length);

  if (visible.length === 0) return null;

  return (
    <span className={styles.avatarCoinStack} aria-hidden>
      {visible.map((m, index) => (
        <span
          key={m.userId}
          className={styles.avatarCoinWrapper}
          style={{
            zIndex: visible.length - index,
            marginLeft: index > 0 ? '-8px' : 0,
          }}
        >
          <ProjectAvatar
            className={styles.avatarCoin}
            thumb={m.thumbnail ?? undefined}
            name={getMemberDisplayName(m)}
            shape="circle"
            radius={9}
          />
        </span>
      ))}
      {extra > 0 ? (
        <span className={styles.avatarCoinBadge} aria-hidden>
          +{extra}
        </span>
      ) : null}
    </span>
  );
}

function TimelineRow({
  item,
  teamLookup,
  isHovered,
  isSelected,
  popoverOpen,
  onPopoverOpenChange,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onDoubleClick,
  onPrimaryAction,
  onEditAction,
  onContextMenu,
  onEllipsisClick,
}: TimelineRowProps) {
  const isTask = item.type === 'task';
  const severity = isTask ? getStatusSeverity(item as TimelineTask) : 'normal';
  const isDone = severity === 'done';
  const task = isTask ? (item as TimelineTask) : undefined;
  const assignee = isTask ? task?.assignedTo : undefined;
  const kind = isTask ? normalizeKind(task?.kind) : '';
  const isContainerRow = Boolean(task?.focusGroup?.isGroup);
  const isChildRow = Boolean(task?.focusChildOf);
  const isExpanded = Boolean(task?.focusGroup?.expanded);
  const canExpand = isContainerRow && (task?.focusGroup?.totalCount ?? 0) > 0;

  const rowItemType: TimelineItemType = useMemo(() => {
    if (!isTask || !task) return 'timeblock';
    if (task.itemType) return task.itemType;
    if (task.focusGroup?.itemType) return task.focusGroup.itemType;
    if (isContainerRow) return 'focus_block';
    return 'timeblock';
  }, [isTask, task, isContainerRow]);

  const nestLevel = useMemo(() => {
    if (!isTask || !task) return 0;
    if (typeof task.nestLevel === 'number') return task.nestLevel;
    return task.focusChildOf ? 1 : 0;
  }, [isTask, task]);

  const indentPx = nestLevel > 0 ? nestLevel * 16 : 0;

  const taskAssigneeMembers = useMemo(() => {
    if (!isTask || !task) return [];
    return getTaskAssigneeMembers(task, teamLookup);
  }, [isTask, task, teamLookup]);

  const ownerMember = useMemo(() => {
    if (!isTask || !task) return null;
    const ownerId = task.ownerUserId ?? task.focusGroup?.ownerUserId;
    if (ownerId && task.focusGroup?.assignees?.length) {
      const m = task.focusGroup.assignees.find((a) => a.userId === ownerId);
      if (m) return m;
    }
    if (ownerId) {
      const fromTeam = teamLookup?.get(ownerId);
      if (fromTeam) return fromTeam;
    }
    const candidates = task.focusGroup?.assignees?.length ? task.focusGroup.assignees : taskAssigneeMembers;
    return candidates[0] ?? null;
  }, [isTask, task, teamLookup, taskAssigneeMembers]);

  const singleAssigneeMember = useMemo(() => {
    if (!isTask || !task) return null;
    return taskAssigneeMembers[0] ?? null;
  }, [isTask, task, taskAssigneeMembers]);

  const leadingIcon = useMemo(() => {
    if (!isTask) return <Clock size={12} className={styles.typeIcon} aria-hidden />;
    if (isContainerRow && rowItemType === 'multi_user_stack') return <Users size={12} className={styles.typeIcon} aria-hidden />;
    if (isContainerRow && rowItemType === 'focus_block') return <ListTodo size={12} className={styles.typeIcon} aria-hidden />;
    if (isDone) return <CheckSquare size={12} className={styles.typeIcon} aria-hidden />;
    return <Square size={12} className={styles.typeIcon} aria-hidden />;
  }, [isTask, isContainerRow, rowItemType, isDone]);
  const ellipsisRef = useRef<HTMLButtonElement>(null);
  
  return (
    <>
      <div
        className={`${styles.timelineRow} ${isHovered ? styles.timelineRowHovered : ''} ${isSelected ? styles.timelineRowSelected : ''} ${isDone ? styles.timelineRowDone : ''} ${isChildRow ? styles.timelineRowChild : ''}`}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={(e) => {
          e.preventDefault();
          onClick();
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDoubleClick();
        }}
        onContextMenu={onContextMenu}
        role="button"
        tabIndex={-1}
        data-item-id={item.id}
        >
          {/* Status bar */}
          <div className={`${styles.severityStrip} ${styles[`severity${severity.charAt(0).toUpperCase() + severity.slice(1).replace('-', '')}`]}`} />

          {/* Type icon */}
          <div className={styles.colIcon} aria-hidden>
            <span className={styles.leadingIcon}>{leadingIcon}</span>
          </div>

          {/* Time/due */}
          <div className={styles.colTime}>
            <span className={styles.timePill}>{formatTimePill(item)}</span>
          </div>

          {/* Chevron (reserved column) */}
          <div className={styles.colChevron} aria-hidden={!canExpand}>
            <button
              type="button"
              className={`${styles.expandButton} ${!canExpand ? styles.expandButtonHidden : ''}`}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
              tabIndex={canExpand ? 0 : -1}
              onClick={(e) => {
                if (!canExpand) return;
                e.preventDefault();
                e.stopPropagation();
                onPopoverOpenChange(false);
                const customEvent = new CustomEvent('commandpanel-toggle-focusblock', { detail: { id: item.id } });
                window.dispatchEvent(customEvent);
              }}
            >
              {isExpanded ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
            </button>
          </div>

          {/* Title + preview (indent only inside this cell) */}
          <div className={styles.colTitle}>
            <div className={styles.titleIndent} style={indentPx ? { paddingLeft: indentPx } : undefined}>
              <div className={styles.rowTitleLine}>
                <span
                  className={`${styles.rowTitle} ${isContainerRow ? styles.rowTitleStrong : ''}`}
                  title={item.title}
                >
                  {item.title || 'Untitled'}
                </span>
                {isContainerRow && task?.focusGroup ? (
                  <span className={styles.focusCount} title="Progress">
                    {task.focusGroup.doneCount}/{task.focusGroup.totalCount}
                  </span>
                ) : null}
              </div>

              {isContainerRow && task?.focusGroup?.preview?.length ? (
                <div className={styles.focusPreview}>
                  {task.focusGroup.preview.slice(0, 3).map((p) => (
                    <span key={p.id} className={styles.focusPreviewItem} title={p.title}>
                      <span className={styles.focusPreviewIcon} aria-hidden>
                        {p.icon === 'checked' ? <CheckSquare size={10} /> : <Square size={10} />}
                      </span>
                      <span className={styles.focusPreviewText}>{p.title}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* Right meta (fixed slots): avatars + actions */}
          <div className={styles.colMeta}>
            <div className={styles.avatarSlot}>
              {isTask && rowItemType === 'multi_user_stack' && task?.focusGroup?.assignees?.length ? (
                <AvatarCoinStack members={task.focusGroup.assignees} />
              ) : isTask && isContainerRow && rowItemType === 'focus_block' && ownerMember ? (
                <ProjectAvatar
                  className={styles.singleAvatar}
                  thumb={ownerMember.thumbnail ?? undefined}
                  name={getMemberDisplayName(ownerMember)}
                  shape="circle"
                  radius={10}
                />
              ) : isTask && !isContainerRow && singleAssigneeMember ? (
                <ProjectAvatar
                  className={styles.singleAvatar}
                  thumb={singleAssigneeMember.thumbnail ?? undefined}
                  name={getMemberDisplayName(singleAssigneeMember)}
                  shape="circle"
                  radius={10}
                />
              ) : assignee ? (
                <span className={styles.assigneeBadge} title={assignee}>
                  {getInitials(assignee)}
                </span>
              ) : null}
            </div>

            <div className={styles.actionsSlot}>
              <button
                type="button"
                className={`${styles.primaryAction} ${!(isHovered || isSelected) ? styles.actionHidden : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onPrimaryAction();
                }}
                title={isTask ? 'Mark done' : 'Open'}
              >
                {isTask ? <Check size={12} /> : <Edit3 size={12} />}
                <span>{isTask ? 'Done' : 'Open'}</span>
              </button>

              <Popover open={popoverOpen} onOpenChange={onPopoverOpenChange}>
                <PopoverTrigger asChild>
                  <button
                    ref={ellipsisRef}
                    type="button"
                    className={`${styles.overflowButton} ${!(isHovered || isSelected) ? styles.actionHidden : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEllipsisClick(e);
                    }}
                    title="More actions"
                  >
                    <MoreHorizontal size={12} />
                  </button>
                </PopoverTrigger>
                <PopoverContent className={styles.rowPopover} align="end" onClick={(e) => e.stopPropagation()}>
                  {isTask && (
                    <button
                      type="button"
                      className={styles.popoverAction}
                      onClick={() => {
                        onPopoverOpenChange(false);
                        onPrimaryAction();
                      }}
                    >
                      <CheckSquare size={12} aria-hidden />
                      <span>{isDone ? 'Mark incomplete' : 'Mark done'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.popoverAction}
                    onClick={() => {
                      onPopoverOpenChange(false);
                      onEditAction();
                    }}
                  >
                    <Pencil size={12} aria-hidden />
                    <span>Open {isTask ? 'task' : 'event'}</span>
                  </button>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </>
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
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  
  // Adjust position to keep menu in viewport
  useLayoutEffect(() => {
    if (!menuRef.current) {
      setAdjustedPosition(position);
      return;
    }
    
    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 8;
    
    let x = position.x;
    let y = position.y;
    
    // Adjust horizontal position if menu goes off-screen
    if (x + rect.width > viewportWidth - padding) {
      x = Math.max(padding, viewportWidth - rect.width - padding);
    }
    
    // Adjust vertical position if menu goes off-screen
    if (y + rect.height > viewportHeight - padding) {
      y = Math.max(padding, viewportHeight - rect.height - padding);
    }
    
    setAdjustedPosition({ x, y });
  }, [position]);
  
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
  
  const menuContent = (
    <div
      ref={menuRef}
      className={styles.contextMenu}
      style={{ top: adjustedPosition.y, left: adjustedPosition.x, position: 'fixed' }}
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
  
  // Render in portal to document.body to avoid clipping
  return createPortal(menuContent, document.body);
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CommandPanel({
  events,
  tasks,
  teamMembers,
  currentUserId,
  currentUserEmail,
  isUserLoading = false,
  onToggleTask,
  onEditItem,
  onQuickEditTask,
  onDeleteItem,
  onDuplicateItem,
  onSubmitForReview,
  onCreateTask,
  onCreateEvent,
  onViewCalendar,
}: CommandPanelProps) {
  const teamLookup = useMemo(() => {
    const map = new Map<string, { userId: string; firstName?: string; lastName?: string; thumbnail?: string | null }>();
    for (const member of teamMembers ?? []) {
      const id = typeof member?.userId === 'string' ? member.userId.trim() : '';
      if (!id) continue;
      
      map.set(id, member);
    }
    return map;
  }, [teamMembers]);

  // Filters - default to All/All
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  
  // Selection, hover, popover state
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePopoverId, setActivePopoverId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    item: TimelineItem;
    position: { x: number; y: number };
  } | null>(null);

  // Focus Block expansion (group rows)
  const [expandedFocusBlockIds, setExpandedFocusBlockIds] = useState<Set<string>>(() => new Set());
  
  // Refs for auto-scroll to Today or nearest upcoming
  const contentRef = useRef<HTMLDivElement>(null);
  const dayGroupRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const didInitialAutoScrollRef = useRef(false);
  
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  
  const todayKey = useMemo(() => getDateKey(today), [today]);

  // Listen for per-row expand/collapse events dispatched from TimelineRow.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      const id = detail?.id;
      if (!id) return;
      setExpandedFocusBlockIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };
    window.addEventListener('commandpanel-toggle-focusblock', handler as EventListener);
    return () => window.removeEventListener('commandpanel-toggle-focusblock', handler as EventListener);
  }, []);

  const displayTasks = useMemo(() => {
    const normalized = tasks.map((t) => ({
      ...t,
      type: 'task' as const,
      itemType: 'timeblock' as const,
      nestLevel: 0,
    }));
    const byFocusId = new Map<string, TimelineTask[]>();
    normalized.forEach((t) => {
      const focusId = t.focusBlockId;
      if (!focusId) return;
      const bucket = byFocusId.get(focusId) ?? [];
      bucket.push(t);
      byFocusId.set(focusId, bucket);
    });

    const scheduledGroupIds = new Set<string>();
    const groupItems = new Map<string, TimelineTask>();

    const isScheduledFocusBlock = (task: TimelineTask) => {
      const kind = normalizeKind(task.kind);
      return kind === 'focus_block' && Boolean(task.startAt || task.endAt);
    };

    for (const t of normalized) {
      if (!isScheduledFocusBlock(t)) continue;
      scheduledGroupIds.add(t.id);

      const children = byFocusId.get(t.id) ?? [];
      const sortedChildren = [...children].sort((a, b) => {
        const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
        const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return (a.title || '').localeCompare(b.title || '');
      });

      const childDone = (child: TimelineTask) => {
        const s = typeof child.status === 'string' ? child.status.trim().toLowerCase() : '';
        return Boolean(child.done || s === 'done' || s === 'completed' || s === 'archived');
      };
      const doneCount = sortedChildren.filter(childDone).length;
      const totalCount = sortedChildren.length || (Array.isArray(t.focusChecklist) ? t.focusChecklist.length : 0);

      const preview = sortedChildren.slice(0, 3).map((c) => {
        const icon: 'checked' | 'unchecked' = childDone(c) ? 'checked' : 'unchecked';
        return { id: c.id, title: c.title || 'Untitled', icon };
      });

      const assignees = uniqueBy(
        [
          ...getTaskAssigneeMembers(t, teamLookup),
          ...sortedChildren.flatMap((child) => getTaskAssigneeMembers(child, teamLookup)),
        ],
        (m) => m.userId
      );
      const containerAssigneeIds = assignees.map((a) => a.userId).filter(Boolean);
      const isMultiUserStack = containerAssigneeIds.length > 1;
      const itemType: TimelineItemType = isMultiUserStack ? 'multi_user_stack' : 'focus_block';
      const ownerUserId = !isMultiUserStack ? containerAssigneeIds[0] : undefined;

      const expanded = expandedFocusBlockIds.has(t.id);
      const groupDate = t.dueDate ?? (t.startAt ?? undefined);
      const groupDateObj = parseDate(groupDate);
      const baseSort = groupDateObj ? groupDateObj.getTime() : undefined;

      const groupItem: TimelineTask = {
        ...t,
        groupDate,
        sortTime: typeof baseSort === 'number' ? baseSort : undefined,
        itemType,
        ownerUserId,
        containerAssigneeIds,
        focusGroup: {
          isGroup: true,
          itemType,
          ownerUserId,
          assigneeIds: containerAssigneeIds,
          expanded,
          doneCount,
          totalCount,
          preview,
          assignees,
        },
      };
      groupItems.set(t.id, groupItem);
    }

    const out: TimelineTask[] = [];

    for (const t of normalized) {
      // Suppress children of scheduled focus blocks (they only appear under group when expanded)
      if (t.focusBlockId && scheduledGroupIds.has(t.focusBlockId)) {
        continue;
      }

      // Replace scheduled focus block containers with their group-row variant
      if (scheduledGroupIds.has(t.id)) {
        const groupItem = groupItems.get(t.id);
        if (!groupItem) continue;
        out.push(groupItem);

        if (groupItem.focusGroup?.expanded) {
          const children = (byFocusId.get(t.id) ?? []).sort((a, b) => {
            const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
            const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
            if (orderA !== orderB) return orderA - orderB;
            return (a.title || '').localeCompare(b.title || '');
          });

          const parentSort = typeof groupItem.sortTime === 'number' ? groupItem.sortTime : undefined;
          children.forEach((c, idx) => {
            out.push({
              ...c,
              focusChildOf: groupItem.id,
              itemType: 'timeblock',
              nestLevel: 1,
              groupDate: groupItem.groupDate ?? groupItem.dueDate,
              sortTime: typeof parentSort === 'number' ? parentSort + (idx + 1) / 1000 : undefined,
            });
          });
        }
        continue;
      }

      // Flatten unscheduled focus blocks (don't show container rows)
      if (normalizeKind(t.kind) === 'focus_block' && !isScheduledFocusBlock(t)) {
        continue;
      }

      out.push(t);
    }

    return out;
  }, [tasks, expandedFocusBlockIds, teamLookup]);
  
  // Combine and filter items
  const filteredItems = useMemo(() => {
    const allItems: TimelineItem[] = [
      ...events.map(e => ({ ...e, type: 'event' as const })),
      ...displayTasks.map(t => ({ ...t, type: 'task' as const })),
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
      
      // Assignee filter (only applies to tasks, requires currentUserId)
      if (item.type === 'task' && assigneeFilter !== 'all' && currentUserId) {
        const task = item as TimelineTask;
        
        // Check if current user matches any assignee identifier:
        // - Direct userId match in assigneeId or assigneeIds
        // - Email match in assigneeTokens
        // - Token format "name__userId" match in assigneeTokens
        const matchesUserInTokens = (tokens?: string[]) => {
          if (!tokens?.length) return false;
          const normalizedEmail = currentUserEmail?.toLowerCase().trim();
          return tokens.some(token => {
            const t = token.toLowerCase().trim();
            // Direct userId match
            if (t === currentUserId.toLowerCase()) return true;
            // Email match
            if (normalizedEmail && t === normalizedEmail) return true;
            // Token format "name__userId" or "__userId"
            if (t.includes('__')) {
              const parts = t.split('__');
              const lastPart = parts[parts.length - 1]?.trim();
              if (lastPart === currentUserId.toLowerCase()) return true;
              if (normalizedEmail && lastPart === normalizedEmail) return true;
            }
            return false;
          });
        };
        
        const isMyTask = task.assigneeId === currentUserId || 
                         (task.assigneeIds?.includes(currentUserId) ?? false) ||
                         matchesUserInTokens(task.assigneeTokens) ||
                         (!task.assigneeId && !task.assignedTo && !task.assigneeIds?.length && !task.assigneeTokens?.length);
        
        if (assigneeFilter === 'me' && !isMyTask) return false;
        if (assigneeFilter === 'team' && isMyTask) return false;
      }
      
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        if (item.title.toLowerCase().includes(query)) return true;
        if (item.type === 'task') {
          const task = item as TimelineTask;
          const preview = task.focusGroup?.preview ?? [];
          if (preview.some(p => p.title.toLowerCase().includes(query))) return true;
        }
        return false;
      }
      
      return true;
    });
  }, [events, displayTasks, timeFilter, assigneeFilter, searchQuery, today, currentUserId, currentUserEmail]);
  
  // Group by day
  const groupedItems = useMemo(() => {
    // Sort by date
    const sorted = [...filteredItems].sort((a, b) => {
      return getSortTime(a) - getSortTime(b);
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
  
  // Auto-scroll to "Today" or nearest upcoming - runs once on initial data load (instant, no visible jump)
  useLayoutEffect(() => {
    // Only run once per mount
    if (didInitialAutoScrollRef.current) return;
    if (!contentRef.current || groupedItems.length === 0) return;
    
    const refs = dayGroupRefs.current;
    
    // First try to find Today
    let targetRef = refs.get(todayKey);
    
    // If no Today, find nearest upcoming date
    if (!targetRef) {
      const sortedKeys = Array.from(refs.keys()).sort();
      for (const key of sortedKeys) {
        if (key >= todayKey && key !== 'no-date') {
          targetRef = refs.get(key);
          break;
        }
      }
    }
    
    if (targetRef && contentRef.current) {
      // Use instant scroll (scrollTop) so first paint is already positioned
      const containerTop = contentRef.current.getBoundingClientRect().top;
      const targetTop = targetRef.getBoundingClientRect().top;
      const scrollOffset = targetTop - containerTop;
      contentRef.current.scrollTop = scrollOffset;
      didInitialAutoScrollRef.current = true;
    }
  }, [groupedItems, todayKey]);
  
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
  
  // Context menu Edit => open QuickCreateTaskModal for tasks, or onEditItem for events
  const handleEdit = useCallback(() => {
    if (contextMenu) {
      const item = contextMenu.item;
      if (item.type === 'task' && onQuickEditTask) {
        onQuickEditTask(item as TimelineTask);
      } else {
        onEditItem?.(item);
      }
      handleCloseContextMenu();
    }
  }, [contextMenu, onQuickEditTask, onEditItem, handleCloseContextMenu]);
  
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
  
  // Flattened list of all visible item IDs for keyboard navigation
  const allItemIds = useMemo(() => {
    return groupedItems.flatMap(([, group]) => group.items.map(item => item.id));
  }, [groupedItems]);
  
  // Find item by ID for keyboard actions
  const findItemById = useCallback((id: string): TimelineItem | undefined => {
    for (const [, group] of groupedItems) {
      const found = group.items.find(item => item.id === id);
      if (found) return found;
    }
    return undefined;
  }, [groupedItems]);
  
  // Keyboard navigation handler for the panel
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Skip if focus is in an input/textarea/contenteditable
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return;
    }
    
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const currentIndex = selectedId ? allItemIds.indexOf(selectedId) : -1;
      let newIndex: number;
      
      if (e.key === 'ArrowDown') {
        newIndex = currentIndex < allItemIds.length - 1 ? currentIndex + 1 : currentIndex;
        if (currentIndex === -1 && allItemIds.length > 0) newIndex = 0;
      } else {
        newIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
        if (currentIndex === -1 && allItemIds.length > 0) newIndex = allItemIds.length - 1;
      }
      
      if (newIndex >= 0 && newIndex < allItemIds.length) {
        const newId = allItemIds[newIndex];
        setSelectedId(newId);
        // Scroll selected row into view
        const rowEl = contentRef.current?.querySelector(`[data-item-id="${newId}"]`);
        rowEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    } else if (e.key === 'e' || e.key === 'E') {
      // E = Edit selected item
      if (selectedId) {
        e.preventDefault();
        const item = findItemById(selectedId);
        if (item) {
          if (item.type === 'task' && onQuickEditTask) {
            onQuickEditTask(item as TimelineTask);
          } else {
            onEditItem?.(item);
          }
        }
      }
    } else if (e.key === 'd' || e.key === 'D') {
      // D = Mark Done (toggle) for selected task
      if (selectedId) {
        const item = findItemById(selectedId);
        if (item && item.type === 'task') {
          e.preventDefault();
          onToggleTask?.(item.id);
        }
      }
    } else if (e.key === 'Escape') {
      // Escape = deselect
      setSelectedId(null);
      setActivePopoverId(null);
    }
  }, [selectedId, allItemIds, findItemById, onQuickEditTask, onEditItem, onToggleTask]);
  
  return (
    <div className={styles.commandPanel} tabIndex={0} onKeyDown={handleKeyDown}>
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
            {(Object.keys(ASSIGNEE_FILTER_LABELS) as AssigneeFilter[]).map(filter => {
              const isMeFilter = filter === 'me';
              const isLoading = isMeFilter && isUserLoading;
              const isDisabled = isMeFilter && (isUserLoading || !currentUserId);
              
              let chipLabel = ASSIGNEE_FILTER_LABELS[filter];
              let chipTitle: string | undefined;
              
              if (isMeFilter) {
                if (isLoading) {
                  chipLabel = 'Loading…';
                  chipTitle = 'Loading user…';
                } else if (!currentUserId) {
                  chipTitle = 'Sign in to filter by your tasks';
                }
              }
              
              return (
                <FilterChip
                  key={filter}
                  label={chipLabel}
                  active={assigneeFilter === filter}
                  disabled={isDisabled}
                  title={chipTitle}
                  onClick={() => !isDisabled && setAssigneeFilter(filter)}
                />
              );
            })}
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
      <div className={`${styles.content} ${groupedItems.length === 0 ? styles.contentEmpty : ''}`} ref={contentRef}>
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
          groupedItems.map(([key, group]) => {
            return (
              <div
                key={key}
                className={styles.dayGroup}
                ref={(el) => {
                  if (el) {
                    dayGroupRefs.current.set(key, el);
                  } else {
                    dayGroupRefs.current.delete(key);
                  }
                }}
              >
                <DayDivider label={group.label} />
                <div className={styles.dayItems}>
                  {group.items.map(item => (
                    <TimelineRow
                      key={item.id}
                      item={item}
                      teamLookup={teamLookup}
                      isHovered={hoveredId === item.id}
                      isSelected={selectedId === item.id}
                      popoverOpen={activePopoverId === item.id}
                      onPopoverOpenChange={(open) => setActivePopoverId(open ? item.id : null)}
                      onMouseEnter={() => setHoveredId(item.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => setSelectedId(item.id)}
                      onEllipsisClick={(e) => {
                        e.stopPropagation();
                        setActivePopoverId(item.id);
                      }}
                      onDoubleClick={() => {
                        if (item.type === 'task' && onQuickEditTask) {
                          onQuickEditTask(item as TimelineTask);
                        } else {
                          onEditItem?.(item);
                        }
                      }}
                      onPrimaryAction={() => handlePrimaryAction(item)}
                      onEditAction={() => {
                        setSelectedId(item.id);
                        // For tasks, prefer QuickEditTask modal; for events use onEditItem
                        if (item.type === 'task' && onQuickEditTask) {
                          onQuickEditTask(item as TimelineTask);
                        } else {
                          onEditItem?.(item);
                        }
                      }}
                      onContextMenu={(e) => handleContextMenu(e, item)}
                    />
                  ))}
                </div>
              </div>
            );
          })
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
