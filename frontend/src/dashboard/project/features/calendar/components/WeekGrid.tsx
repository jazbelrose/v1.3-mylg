import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckSquare, Clock, ListTodo, Plus, Users } from "lucide-react";
import ProjectAvatar from "@/shared/ui/ProjectAvatar";
import { CalendarGridCreateMenu } from "./CalendarGridCreateMenu";
import {
  CalendarEntryContextMenu,
  type ContextMenuPosition,
  type ContextMenuEntry,
  type ChildMenuState,
} from "./CalendarEntryContextMenu";
import { CalendarEntryPopover } from "./CalendarEntryPopover";
import {
  CalendarStackPopover,
  type StackPopoverKind,
  type StackPopoverChild,
} from "./CalendarStackPopover";

import type { CalendarEvent, CalendarTask } from "../utils";
import {
  addDays,
  addHoursToTime,
  fmtLocal,
  formatTimeLabel,
  isSameDay,
  safeDate,
  setTime,
  getProjectColor,
} from "../utils";
import { hexToRgba } from "@/shared/utils/colorUtils";
import type { TeamMember as ProjectTeamMember } from "@/dashboard/project/components/Shared/types";
import {
  MINUTES_IN_HOUR,
  assignTimelineColumns,
  buildEventAvatars,
  buildTaskAvatars,
  buildTeamMemberLookup,
  parseTimeToMinutes,
  parseAssigneeUserId,
  snapDateToHalfHour,
  type TimelineAvatar,
  type TimelineHourEntry,
} from "./timelineLayout";
import {
  CalendarEntryChanges,
  CalendarEntryType,
  formatTimeFromMinutes,
} from "./calendarInteractions";

export type WeekGridProps = {
  anchorDate: Date;
  events: CalendarEvent[];
  tasks: CalendarTask[];
  hideCompleted?: boolean;
  doneCountsByDay?: Map<string, number>;
  onEditEvent: (event: CalendarEvent) => void;
  onEditTask: (task: CalendarTask) => void;
  onRenameTaskTitle?: (task: CalendarTask, title: string) => void | Promise<void>;
  onCreateEvent: (date: Date, options?: { triggeredFromCalendar?: boolean }) => void;
  onCreateTask: (date: Date, startAt?: Date) => void;
  canCreateTasks: boolean;
  teamMembers?: ProjectTeamMember[];
  activeProjectId?: string | null;
  activeProjectColor?: string | null;
  selectedEntryKeys: Set<string>;
  onEntrySelect?: (type: CalendarEntryType, id: string, additive: boolean) => void;
  onClearSelection?: () => void;
  onReplaceSelection?: (next: Set<string>) => void;
  onRescheduleEntries?: (changes: CalendarEntryChanges[]) => void;
  // Context menu / popover actions
  onSubmitForReview?: (tasks: CalendarTask[]) => void;
  onMarkAsDone?: (tasks: CalendarTask[]) => void;
  onConvertToFocusBlock?: (tasks: CalendarTask[]) => void;
  onUngroupFocusBlock?: (focusBlock: CalendarTask) => void;
  onDuplicateEntries?: (entries: ContextMenuEntry[]) => void;
  onDeleteEntries?: (entries: ContextMenuEntry[]) => void;
  // Multi-user overlap stack title persistence
  overlapStackTitles?: Record<string, string>;
  onRenameOverlapStackTitle?: (key: string, title: string) => void | Promise<void>;
};

type WeekDayEvents = {
  allDay: CalendarEvent[];
};

type WeekDayTasks = {
  allDay: CalendarTask[];
};

const parseHour = (time?: string) => {
  if (!time) return undefined;
  const [h] = time.split(":").map(Number);
  if (Number.isNaN(h)) return undefined;
  return h;
};

const parseDateTimeCandidate = (value: unknown): Date | null => {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    const copy = new Date(value.getTime());
    return Number.isNaN(copy.getTime()) ? null : copy;
  }
  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split("-").map(Number);
      const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const buildLocalDateTime = (date: string, time: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [year, month, day] = date.split("-").map(Number);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return null;
  }
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
};

const minutesSinceMidnight = (date: Date) =>
  date.getHours() * MINUTES_IN_HOUR + date.getMinutes();

const formatHour12 = (hour: number): string => {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
};

const WEEK_TITLE_WORD_LIMIT = 3;
const WEEK_ROW_HEIGHT_PX = 72;
const SNAP_INTERVAL_MINUTES = 30;
const MIN_DURATION_MINUTES = SNAP_INTERVAL_MINUTES;
const RESIZE_HANDLE_THRESHOLD_PX = 10;
const MAX_MINUTES = 24 * MINUTES_IN_HOUR;

const minutesToPxWeek = (minutes: number) => (minutes / MINUTES_IN_HOUR) * WEEK_ROW_HEIGHT_PX;
const ENTRY_MIN_HEIGHT_PX = 24;
const ENTRY_RADIUS_PX = 12;

const clampMinutes = (value: number) => Math.max(0, Math.min(MAX_MINUTES, value));

const buildEntryParentId = (entryType: CalendarEntryType, entry: CalendarTask | CalendarEvent) => {
  return `entry:${entryType}:${String(entry.id)}`;
};

const buildStackParentId = (kind: StackPopoverKind, childEntryKeys: string[], titleKey?: string) => {
  const base = titleKey?.trim() || childEntryKeys.slice().sort().join("|") || "stack";
  return `stack:${kind}:${base}`;
};

const snapToInterval = (value: number) =>
  Math.round(value / SNAP_INTERVAL_MINUTES) * SNAP_INTERVAL_MINUTES;

const snapAndClampRange = (start: number, end: number): [number, number] => {
  let snappedStart = clampMinutes(snapToInterval(start));
  let snappedEnd = clampMinutes(snapToInterval(end));

  if (snappedEnd <= snappedStart) {
    snappedEnd = Math.min(MAX_MINUTES, snappedStart + SNAP_INTERVAL_MINUTES);
    if (snappedEnd <= snappedStart) {
      snappedStart = Math.max(0, MAX_MINUTES - SNAP_INTERVAL_MINUTES);
      snappedEnd = MAX_MINUTES;
    }
  }

  if (snappedEnd - snappedStart < MIN_DURATION_MINUTES) {
    snappedEnd = Math.min(MAX_MINUTES, snappedStart + MIN_DURATION_MINUTES);
    snappedStart = Math.max(0, snappedEnd - MIN_DURATION_MINUTES);
  }

  return [snappedStart, snappedEnd];
};

type InteractionMode = "drag" | "resizeTop" | "resizeBottom";

type InteractionTarget = {
  entry: WeekTimelineEntry;
  dayKey: string;
  dayIndex: number;
  startMinutes: number;
  endMinutes: number;
  initialTop?: number;
  initialHeight?: number;
};

type InteractionState = {
  mode: InteractionMode;
  startX: number;
  startY: number;
  targets: InteractionTarget[];
  duplicate: boolean;
  isCopyMode: boolean;
  startDayIndex: number;
  previewEntryKey?: string;
};

type TaskStackPayload = {
  kind: "taskStack";
  childEntryKeys: string[];
  childTaskIds: string[];
};

type OverlapStackPayload = {
  kind: "overlapStack";
  childEntryKeys: string[];
  childTaskIds: string[];
};

type WeekTimelinePayload = CalendarEvent | CalendarTask | TaskStackPayload | OverlapStackPayload;
type WeekTimelineEntry = TimelineHourEntry<WeekTimelinePayload>;

type WeekAssignedTimelineEntry = WeekTimelineEntry & { columnIndex: number; columnCount: number };

const TASK_STACK_WINDOW_MINUTES = 90;
const TASK_STACK_THRESHOLD = 3;
const TASK_STACK_MICRO_MAX_MINUTES = 45;

const LONG_PRESS_MS = 320;
const DRAG_THRESHOLD_PX = 6;

const buildAvatarStack = (
  avatars: TimelineAvatar[],
  avatarClassName: string,
  radius: number,
  keyPrefix: string,
) =>
  avatars.map((avatar) => (
    <ProjectAvatar
      key={`${keyPrefix}-${avatar.key}`}
      className={avatarClassName}
      thumb={avatar.thumb ?? undefined}
      name={avatar.name}
      shape="circle"
      radius={radius}
    />
  ));

const getWeekEntryPreview = (text: string): string => {
  const normalized = text?.trim() ?? "";
  if (!normalized) return "";
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= WEEK_TITLE_WORD_LIMIT) {
    return normalized;
  }
  return `${words.slice(0, WEEK_TITLE_WORD_LIMIT).join(" ")}…`;
};

function WeekGrid({
  anchorDate,
  events,
  tasks,
  hideCompleted,
  doneCountsByDay,
  onEditEvent,
  onEditTask,
  onRenameTaskTitle,
  onCreateEvent,
  onCreateTask,
  canCreateTasks,
  teamMembers,
  activeProjectId,
  activeProjectColor,
  selectedEntryKeys,
  onEntrySelect,
  onClearSelection,
  onReplaceSelection,
  onRescheduleEntries,
  onSubmitForReview,
  onMarkAsDone,
  onConvertToFocusBlock,
  onUngroupFocusBlock,
  onDuplicateEntries,
  onDeleteEntries,
  overlapStackTitles,
  onRenameOverlapStackTitle,
}: WeekGridProps) {
  const start = useMemo(() => addDays(anchorDate, -anchorDate.getDay()), [anchorDate]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []); // 24-hour day
  const dayIndexLookup = useMemo(() => {
    const map = new Map<string, number>();
    days.forEach((day, index) => {
      map.set(fmtLocal(day), index);
    });
    return map;
  }, [days]);
  
  const projectColor = useMemo(
    () => getProjectColor(activeProjectId, activeProjectColor),
    [activeProjectId, activeProjectColor]
  );

  const [quickAddKey, setQuickAddKey] = useState<string | null>(null);
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set());
  const [createMenu, setCreateMenu] = useState<null | { position: { x: number; y: number }; date: Date }>(
    null,
  );
  const [marqueeRect, setMarqueeRect] = useState<
    null | { left: number; top: number; width: number; height: number }
  >(null);
  const marqueeStateRef = useRef<
    | null
    | {
        pointerId: number;
        startX: number;
        startY: number;
        mode: "replace" | "add" | "subtract";
        initialSelection: Set<string>;
        didDrag: boolean;
      }
  >(null);
  const marqueeRafRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoveredEntry, setHoveredEntry] = useState<{
    id: string;
    anchorElement: HTMLElement;
    avatars: React.ReactNode;
    timeText: string;
    title: string;
  } | null>(null);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isAnchorHoverRef = useRef(false);
  const isTooltipHoverRef = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<InteractionState | null>(null);
  const [dragPreviewTransforms, setDragPreviewTransforms] = useState<
    Record<string, { translateX: number; translateY: number }>
  >({});
  const [resizePreviewTransforms, setResizePreviewTransforms] = useState<
    Record<string, { translateY: number; scaleY: number; initialHeight: number }>
  >({});
  const [isCopyMode, setIsCopyMode] = useState(false);
  const previewCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const rescheduleEntriesRef = useRef(onRescheduleEntries);
  const lastClickTimeRef = useRef(0);
  const lastClickedKeyRef = useRef<string | null>(null);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    position: ContextMenuPosition;
    entryType: CalendarEntryType;
    entry: CalendarTask | CalendarEvent;
    allowConvertToFocusBlock: boolean;
  } | null>(null);

  // Child action menu (opened from inside a parent popover)
  const [childMenu, setChildMenu] = useState<ChildMenuState>(null);

  // Popover state for single-click inspector
  const [popover, setPopover] = useState<{
    anchorElement: HTMLElement;
    entryType: CalendarEntryType;
    entry: CalendarTask | CalendarEvent;
    focusChildren?: CalendarTask[];
  } | null>(null);

  const [stackPopover, setStackPopover] = useState<{
    anchorElement: HTMLElement;
    kind: StackPopoverKind;
    parentId: string;
    baseTitle: string;
    titleKey?: string;
    count: number;
    childEntryKeys: string[];
    avatars: TimelineAvatar[];
  } | null>(null);

  // Use prop-based overlap stack titles (fetched from backend by parent)
  // Local state merges prop with any optimistic updates made during the session
  const [localOverlapTitleOverrides, setLocalOverlapTitleOverrides] = useState<Record<string, string>>({});

  const overlapStackTitleOverrides = useMemo(() => {
    return { ...(overlapStackTitles ?? {}), ...localOverlapTitleOverrides };
  }, [overlapStackTitles, localOverlapTitleOverrides]);

  // Reset local overrides when prop changes (e.g., project switch)
  useEffect(() => {
    setLocalOverlapTitleOverrides({});
  }, [overlapStackTitles]);

  useEffect(() => {
    rescheduleEntriesRef.current = onRescheduleEntries;
  }, [onRescheduleEntries]);

  useEffect(() => {
    setDragPreviewTransforms({});
    setResizePreviewTransforms({});
    gridRef.current?.classList.remove("is-interacting");
    if (previewCleanupTimerRef.current) {
      clearTimeout(previewCleanupTimerRef.current);
      previewCleanupTimerRef.current = null;
    }
  }, [events, tasks]);

  useEffect(() => {
    // Find the scrollable parent container
    const scrollToNoon = () => {
      const grid = gridRef.current;
      if (!grid) return;
      
      const scroller = grid.closest('.calendar-view__scroller') as HTMLElement | null;
      if (scroller) {
        // Scroll to 12 PM (hour 12), each hour row is 72px minimum
        const rowHeight = 72;
        scroller.scrollTop = 12 * rowHeight;
      }
    };
    
    // Use setTimeout to ensure DOM is fully rendered
    const timer = setTimeout(scrollToNoon, 0);
    return () => clearTimeout(timer);
  }, [anchorDate]);

  // Avoid orphan overlays when navigating weeks.
  useEffect(() => {
    setChildMenu(null);
    setPopover(null);
    setStackPopover(null);
    setContextMenu(null);
    setCreateMenu(null);
    setMarqueeRect(null);
    marqueeStateRef.current = null;
  }, [anchorDate]);

  const dayByKey = useMemo(() => {
    const map = new Map<string, Date>();
    days.forEach((day) => map.set(fmtLocal(day), day));
    return map;
  }, [days]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, WeekDayEvents>();
    days.forEach((day) => {
      map.set(fmtLocal(day), { allDay: [] });
    });
    events.forEach((event) => {
      const eventDate = safeDate(event.date);
      if (!eventDate) return;
      const eventKey = fmtLocal(eventDate);
      const bucket = map.get(eventKey);
      if (!bucket) return;
      const hour = parseHour(event.start);
      if (hour == null) {
        bucket.allDay.push(event);
      }
    });
    return map;
  }, [days, events]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, WeekDayTasks>();
    days.forEach((day) => {
      map.set(fmtLocal(day), { allDay: [] });
    });
    tasks.forEach((task) => {
      if (!task.due) return;
      // Normalize task.due to match map keys format
      const taskDate = safeDate(task.due);
      if (!taskDate) return;
      const dayKey = fmtLocal(taskDate);
      const bucket = map.get(dayKey);
      if (!bucket) return;

      if (task.kind === "intent") {
        bucket.allDay.push(task);
        return;
      }

      if (task.focusBlockId) {
        return;
      }

      const source = task.source as unknown as Record<string, unknown>;
      const hasStart =
        parseDateTimeCandidate(source.startAt) ??
        parseDateTimeCandidate((source as { start_at?: unknown }).start_at) ??
        (task.due && task.start ? buildLocalDateTime(task.due, task.start) : null);

      if (hasStart) {
        return;
      }

      bucket.allDay.push(task);
    });
    return map;
  }, [days, tasks]);

  const teamMemberLookup = useMemo(
    () => buildTeamMemberLookup(teamMembers ?? []),
    [teamMembers],
  );

  const calendarTaskById = useMemo(() => {
    const map = new Map<string, CalendarTask>();
    tasks.forEach((task) => {
      if (task.id) map.set(task.id, task);
      if (task.source?.taskId) map.set(task.source.taskId, task);
      const legacyId = (task.source as { id?: string } | undefined)?.id;
      if (legacyId) map.set(legacyId, task);
    });
    return map;
  }, [tasks]);

  const focusChildrenByFocusId = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();
    tasks.forEach((task) => {
      const focusId = task.focusBlockId;
      if (!focusId) return;
      map.set(focusId, [...(map.get(focusId) ?? []), task]);
    });
    return map;
  }, [tasks]);

  const { renderTimelineEntriesByDay, baseEntryLookup } = useMemo(() => {
    const dayKeys = new Set(days.map((day) => fmtLocal(day)));
    const entriesByDay = new Map<
      string,
      Array<WeekTimelineEntry>
    >();

    const buildAvatarsForTaskEntry = (task: CalendarTask): TimelineAvatar[] => {
      const direct = buildTaskAvatars(task, teamMemberLookup);
      if (direct.length > 0) return direct;

      // Focus Blocks often have no assignee set on the parent; derive from child time blocks.
      const isFocusBlock =
        task.kind === "focus_block" ||
        (task.focusChildTaskIds && task.focusChildTaskIds.length > 0) ||
        (task.focusChecklist && task.focusChecklist.length > 0);
      if (!isFocusBlock) return direct;

      const focusId = task.source?.taskId ?? task.id;
      const childIds = task.focusChildTaskIds ?? task.focusChecklist?.map((item) => item.taskId) ?? [];
      const childrenFromIds = childIds
        .map((id) => calendarTaskById.get(id))
        .filter((value): value is CalendarTask => Boolean(value));
      const childrenFromFocusId = focusId ? (focusChildrenByFocusId.get(focusId) ?? []) : [];
      const children = [...childrenFromIds, ...childrenFromFocusId];
      if (children.length === 0) return [];

      const seen = new Set<string>();
      const derived: TimelineAvatar[] = [];
      children.forEach((child) => {
        if (derived.length >= 3) return;
        buildTaskAvatars(child, teamMemberLookup).forEach((a) => {
          if (derived.length >= 3) return;
          if (seen.has(a.key)) return;
          seen.add(a.key);
          derived.push(a);
        });
      });

      return derived;
    };

    const addEntry = (
      dayKey: string,
      entry: WeekTimelineEntry,
    ) => {
      const bucket = entriesByDay.get(dayKey) ?? [];
      bucket.push(entry);
      entriesByDay.set(dayKey, bucket);
    };

    events.forEach((event) => {
      const eventDate = safeDate(event.date);
      if (!eventDate) return;
      const dayKey = fmtLocal(eventDate);
      if (!dayKeys.has(dayKey) || event.allDay) return;
      const startMinutes = parseTimeToMinutes(event.start);
      if (startMinutes == null) return;
      const fallbackEnd =
        event.end ?? (event.start ? addHoursToTime(event.start, 1) : undefined);
      const rawEndMinutes =
        parseTimeToMinutes(fallbackEnd) ?? startMinutes + MINUTES_IN_HOUR;
      const endMinutes = Math.max(
        startMinutes + 5,
        Math.min(rawEndMinutes, 24 * MINUTES_IN_HOUR),
      );

      const startLabel = formatTimeLabel(event.start) ?? event.start;
      const endLabel = fallbackEnd ? formatTimeLabel(fallbackEnd) ?? fallbackEnd : undefined;
      const timeLabel =
        startLabel && endLabel ? `${startLabel} - ${endLabel}` : startLabel ?? endLabel;

      const hour = Math.min(23, Math.max(0, Math.floor(startMinutes / MINUTES_IN_HOUR)));
      addEntry(dayKey, {
        id: `event-${event.id}`,
        type: "event",
        payload: event,
        title: event.title || "Untitled event",
        timeLabel,
        startMinutes,
        endMinutes,
        avatars: buildEventAvatars(event, teamMemberLookup),
        colorClass: undefined,
        projectColor,
        hour,
      });
    });

    tasks.forEach((task) => {
      if (task.kind === "intent") return;
      if (task.focusBlockId) return;
      const source = task.source as unknown as Record<string, unknown>;
      const rawStartDateTime =
        parseDateTimeCandidate(source.startAt) ??
        parseDateTimeCandidate((source as { start_at?: unknown }).start_at) ??
        (task.due && task.start ? buildLocalDateTime(task.due, task.start) : null);

      const fallbackEndTime =
        task.end ?? (task.start ? addHoursToTime(task.start, 1) : undefined);
      const rawEndDateTime =
        parseDateTimeCandidate(source.endAt) ??
        parseDateTimeCandidate((source as { end_at?: unknown }).end_at) ??
        // Quick-create stores the due date as the end datetime
        parseDateTimeCandidate(source.dueDate) ??
        parseDateTimeCandidate((source as { due_at?: unknown }).due_at) ??
        (task.due && fallbackEndTime ? buildLocalDateTime(task.due, fallbackEndTime) : null);

      const startDateTime = rawStartDateTime;
      if (!startDateTime) return;
      let endDateTime =
        rawEndDateTime ??
        new Date(startDateTime.getTime() + MINUTES_IN_HOUR * 60000);
      if (endDateTime.getTime() <= startDateTime.getTime()) {
        endDateTime = new Date(startDateTime.getTime() + MINUTES_IN_HOUR * 60000);
      }

      if (!isSameDay(startDateTime, endDateTime)) {
        const startDay = new Date(startDateTime.getTime());
        startDay.setHours(0, 0, 0, 0);
        const endDay = new Date(endDateTime.getTime());
        endDay.setHours(0, 0, 0, 0);

        for (
          let cursor = new Date(startDay.getTime());
          cursor.getTime() <= endDay.getTime();
          cursor = addDays(cursor, 1)
        ) {
          const dayKey = fmtLocal(cursor);
          if (!dayKeys.has(dayKey)) continue;

          const isFirst = isSameDay(cursor, startDay);
          const isLast = isSameDay(cursor, endDay);
          const startMinutes = isFirst ? minutesSinceMidnight(startDateTime) : 0;
          const rawEndMinutes = isLast ? minutesSinceMidnight(endDateTime) : MAX_MINUTES;

          if (isLast && rawEndMinutes === 0 && !isFirst) {
            continue;
          }

          const endMinutes = Math.max(
            startMinutes + 5,
            Math.min(rawEndMinutes, MAX_MINUTES),
          );

          const isComplete = Boolean(task.done || task.status === "archived");
          const hour = Math.min(23, Math.max(0, Math.floor(startMinutes / MINUTES_IN_HOUR)));

          const labelStartMinutes = startMinutes;
          const labelEndMinutes = Math.min(endMinutes, MAX_MINUTES - 1);
          const startLabel =
            formatTimeLabel(formatTimeFromMinutes(labelStartMinutes)) ??
            formatTimeFromMinutes(labelStartMinutes);
          const endLabel =
            formatTimeLabel(formatTimeFromMinutes(labelEndMinutes)) ??
            formatTimeFromMinutes(labelEndMinutes);
          const timeLabel =
            startMinutes === 0 && rawEndMinutes === MAX_MINUTES
              ? "All day"
              : `${startLabel} - ${endLabel}`;

          addEntry(dayKey, {
            id: `task-${task.id}-${dayKey}`,
            type: "task",
            payload: task,
            title: task.title || "Untitled task",
            timeLabel,
            startMinutes,
            endMinutes,
            avatars: buildAvatarsForTaskEntry(task),
            completed: isComplete,
            hour,
          });
        }
        return;
      }

      const dayKey = fmtLocal(startDateTime);
      if (!dayKeys.has(dayKey)) return;
      const startMinutes = minutesSinceMidnight(startDateTime);
      const rawEndMinutes = minutesSinceMidnight(endDateTime);
      const endMinutes = Math.max(
        startMinutes + 5,
        Math.min(rawEndMinutes, MAX_MINUTES),
      );

      const startLabel = formatTimeLabel(task.start) ?? task.start;
      const endLabel =
        fallbackEndTime ? formatTimeLabel(fallbackEndTime) ?? fallbackEndTime : undefined;
      const timeLabel =
        startLabel && endLabel ? `${startLabel} - ${endLabel}` : startLabel ?? endLabel;

      const hour = Math.min(23, Math.max(0, Math.floor(startMinutes / MINUTES_IN_HOUR)));
      const isComplete = Boolean(task.done || task.status === "archived");
      addEntry(dayKey, {
        id: `task-${task.id}-${dayKey}`,
        type: "task",
        payload: task,
        title: task.title || "Untitled task",
        timeLabel,
        startMinutes,
        endMinutes,
        avatars: buildAvatarsForTaskEntry(task),
        completed: isComplete,
        hour,
      });
    });

    // Build a lookup for all base entries (even if later folded)
    const baseEntryLookupMap = new Map<
      string,
      { entry: WeekTimelineEntry; dayKey: string }
    >();
    entriesByDay.forEach((dayEntries, dayKey) => {
      dayEntries.forEach((entry) => {
        if (entry.type === "taskStack" || entry.type === "overlapStack") {
          return;
        }
        baseEntryLookupMap.set(`${entry.type}:${entry.id}`, { entry, dayKey });
      });
    });

    const formatRangeLabel = (startMinutes: number, endMinutes: number) => {
      const startLabel =
        formatTimeLabel(formatTimeFromMinutes(startMinutes)) ??
        formatTimeFromMinutes(startMinutes);
      const endLabel =
        formatTimeLabel(formatTimeFromMinutes(endMinutes)) ??
        formatTimeFromMinutes(endMinutes);
      return `${startLabel}–${endLabel}`;
    };

    const buildOverlapGroupsForDay = (dayEntries: WeekTimelineEntry[]) => {
      const sorted = [...dayEntries]
        .filter((e) => e.type === "task" || e.type === "event")
        .sort((a, b) => {
          if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
          return a.endMinutes - b.endMinutes;
        });

      const groups: Array<{ keys: string[]; start: number; end: number; avatars: TimelineAvatar[] }> = [];
      let active: WeekTimelineEntry[] = [];
      let current: WeekTimelineEntry[] = [];

      const flush = () => {
        if (current.length < 2) {
          current = [];
          return;
        }
        const keys = current.map((e) => `${e.type}:${e.id}`);
        const start = Math.min(...current.map((e) => e.startMinutes));
        const end = Math.max(...current.map((e) => e.endMinutes));
        const seen = new Set<string>();
        const avatars: TimelineAvatar[] = [];
        current.forEach((e) => {
          e.avatars.forEach((a) => {
            if (avatars.length >= 3) return;
            if (seen.has(a.key)) return;
            seen.add(a.key);
            avatars.push(a);
          });
        });
        groups.push({ keys, start, end, avatars });
        current = [];
      };

      sorted.forEach((entry) => {
        active = active.filter((a) => a.endMinutes > entry.startMinutes);

        if (active.length === 0) {
          flush();
          current = [entry];
          active = [entry];
          return;
        }

        // We have overlap with at least one active entry
        active.forEach((a) => {
          if (!current.includes(a)) {
            current.push(a);
          }
        });
        current.push(entry);
        active.push(entry);
      });
      flush();

      return groups;
    };

    const buildTaskStacksForDay = (dayKey: string, dayEntries: WeekTimelineEntry[], suppressedByOverlap: Set<string>) => {
      const tasksOnly = dayEntries.filter((e) => e.type === "task") as Array<
        WeekTimelineEntry & { type: "task"; payload: CalendarTask }
      >;
      const byUser = new Map<string, typeof tasksOnly>();

      tasksOnly.forEach((entry) => {
        const entryKey = `${entry.type}:${entry.id}`;
        if (suppressedByOverlap.has(entryKey)) {
          return;
        }
        const task = entry.payload as CalendarTask;
        const duration = entry.endMinutes - entry.startMinutes;
        if (duration > TASK_STACK_MICRO_MAX_MINUTES) {
          return;
        }
        const userId =
          parseAssigneeUserId(task.assignedTo) ??
          (task.assigneeIds ? parseAssigneeUserId(task.assigneeIds[0]) : undefined);
        if (!userId) {
          return;
        }
        const bucket = byUser.get(userId) ?? [];
        bucket.push(entry);
        byUser.set(userId, bucket);
      });

      const tiles: WeekTimelineEntry[] = [];
      const suppressedByTaskStack = new Set<string>();

      byUser.forEach((bucket, userId) => {
        const sorted = [...bucket].sort((a, b) => a.startMinutes - b.startMinutes);
        let i = 0;
        while (i < sorted.length) {
          let j = i;
          while (
            j < sorted.length &&
            sorted[j].startMinutes - sorted[i].startMinutes <= TASK_STACK_WINDOW_MINUTES
          ) {
            j += 1;
          }
          const windowEntries = sorted.slice(i, j);
          if (windowEntries.length >= TASK_STACK_THRESHOLD) {
            const childKeys = windowEntries.map((e) => `${e.type}:${e.id}`);
            const childTaskIds = windowEntries.map((e) => (e.payload as CalendarTask).id);
            const start = Math.min(...windowEntries.map((e) => e.startMinutes));
            const end = Math.max(...windowEntries.map((e) => e.endMinutes));
            const hour = Math.min(23, Math.max(0, Math.floor(start / MINUTES_IN_HOUR)));

            const summary = getWeekEntryPreview(windowEntries[0]?.title ?? "Tasks");
            const tileId = `task-stack-${dayKey}-${userId}-${start}-${end}-${windowEntries.length}`;

            childKeys.forEach((k) => suppressedByTaskStack.add(k));

            tiles.push({
              id: tileId,
              type: "taskStack",
              payload: {
                kind: "taskStack",
                childEntryKeys: childKeys,
                childTaskIds,
              },
              title: summary,
              startMinutes: start,
              endMinutes: end,
              avatars: windowEntries[0]?.avatars?.slice(0, 1) ?? [],
              hour,
              projectColor,
            });
            i = j;
            continue;
          }
          i += 1;
        }
      });

      return { tiles, suppressedByTaskStack };
    };

    const overlapSuppressed = new Set<string>();
    const overlapTilesByDay = new Map<string, WeekTimelineEntry[]>();

    entriesByDay.forEach((dayEntries, dayKey) => {
      const groups = buildOverlapGroupsForDay(dayEntries);
      const tiles: WeekTimelineEntry[] = [];
      groups.forEach((group) => {
        group.keys.forEach((key) => overlapSuppressed.add(key));
        const hour = Math.min(23, Math.max(0, Math.floor(group.start / MINUTES_IN_HOUR)));
        const rangeLabel = formatRangeLabel(group.start, Math.min(group.end, MAX_MINUTES - 1));
        const title = "Multi-user overlap";
        const tileId = `overlap-stack-${dayKey}-${group.start}-${group.end}-${group.keys.length}`;
        tiles.push({
          id: tileId,
          type: "overlapStack",
          payload: {
            kind: "overlapStack",
            childEntryKeys: group.keys,
            childTaskIds: group.keys
              .map((key) => {
                const lookup = baseEntryLookupMap.get(key);
                if (!lookup) return null;
                if (lookup.entry.type !== "task") return null;
                return (lookup.entry.payload as CalendarTask).id;
              })
              .filter((id): id is string => Boolean(id)),
          },
          title,
          timeLabel: `${rangeLabel} · ${group.keys.length} items`,
          startMinutes: group.start,
          endMinutes: group.end,
          avatars: group.avatars,
          hour,
          projectColor,
        });
      });
      if (tiles.length) {
        overlapTilesByDay.set(dayKey, tiles);
      }
    });

    const taskSuppressed = new Set<string>();
    const taskTilesByDay = new Map<string, WeekTimelineEntry[]>();

    // DISABLED: Auto-grouping of adjacent tasks into taskStacks
    // Focus Blocks are created via Spellbook or via multi-select → right-click → Convert to Focus Block
    // The buildTaskStacksForDay function is no longer called.
    // entriesByDay.forEach((dayEntries, dayKey) => {
    //   const { tiles, suppressedByTaskStack } = buildTaskStacksForDay(dayKey, dayEntries, overlapSuppressed);
    //   if (tiles.length) {
    //     taskTilesByDay.set(dayKey, tiles);
    //   }
    //   suppressedByTaskStack.forEach((k) => taskSuppressed.add(k));
    // });

    // Render list per day with precedence: OverlapStack wins over TaskStack
    const renderEntriesByDay = new Map<string, WeekTimelineEntry[]>();
    entriesByDay.forEach((dayEntries, dayKey) => {
      const baseVisible = dayEntries.filter((entry) => {
        const key = `${entry.type}:${entry.id}`;
        if (overlapSuppressed.has(key)) return false;
        if (taskSuppressed.has(key)) return false;
        return true;
      });
      const overlapTiles = overlapTilesByDay.get(dayKey) ?? [];
      const taskTiles = taskTilesByDay.get(dayKey) ?? [];
      renderEntriesByDay.set(dayKey, [...overlapTiles, ...taskTiles, ...baseVisible]);
    });

    const layout = new Map<string, Map<number, WeekAssignedTimelineEntry[]>>();
    renderEntriesByDay.forEach((dayEntries, dayKey) => {
      if (!dayEntries.length) {
        return;
      }
      const arranged = assignTimelineColumns(dayEntries) as WeekAssignedTimelineEntry[];
      const layoutHour = new Map<number, WeekAssignedTimelineEntry[]>();
      arranged.forEach((entry) => {
        const bucket = layoutHour.get(entry.hour) ?? [];
        bucket.push(entry);
        layoutHour.set(entry.hour, bucket);
      });
      layout.set(dayKey, layoutHour);
    });

    return { renderTimelineEntriesByDay: layout, baseEntryLookup: baseEntryLookupMap };
  }, [days, events, tasks, teamMemberLookup]);

  const entryLookup = useMemo(() => baseEntryLookup, [baseEntryLookup]);

  const buildOverlapTitleKey = useCallback(
    (childEntryKeys: string[]) => {
      const stableIds = childEntryKeys
        .map((key) => {
          const lookup = entryLookup.get(key);
          if (!lookup) return null;
          const entry = lookup.entry;
          if (entry.type === "task") {
            const task = entry.payload as CalendarTask;
            return task.source?.taskId ?? task.id ?? null;
          }
          if (entry.type === "event") {
            const event = entry.payload as CalendarEvent;
            return event.id ?? null;
          }
          return null;
        })
        .filter((id): id is string => Boolean(id));

      // Fallback to raw keys if we couldn't resolve stable ids (should be rare).
      const basis = stableIds.length ? stableIds : childEntryKeys;
      return [...basis].sort().join("|");
    },
    [entryLookup],
  );

  useEffect(() => {
    const handlePointerUp = (event: PointerEvent) => {
      const state = interactionRef.current;
      if (!state) return;
      const grid = gridRef.current;
      const gridRect = grid?.getBoundingClientRect();
      const spacer = grid?.querySelector(".week-grid__spacer") as HTMLElement | null;
      const spacerWidth = spacer?.getBoundingClientRect().width ?? 0;
      const columnWidth =
        gridRect && days.length > 0 ? (gridRect.width - spacerWidth) / days.length : 0;
      let dropDayIndex = state.startDayIndex;
      if (columnWidth > 0 && gridRect) {
        const relativeX = event.clientX - (gridRect.left + spacerWidth);
        dropDayIndex = Math.floor(relativeX / columnWidth);
        dropDayIndex = Math.max(0, Math.min(days.length - 1, dropDayIndex));
      }
      const deltaDays = state.mode === "drag" ? dropDayIndex - state.startDayIndex : 0;
      const deltaY = event.clientY - state.startY;
      const deltaMinutes = Math.round(deltaY / (WEEK_ROW_HEIGHT_PX / MINUTES_IN_HOUR));

      const changes: CalendarEntryChanges[] = [];

      state.targets.forEach((target) => {
        let newDayIndex = target.dayIndex;
        let newStart = target.startMinutes;
        let newEnd = target.endMinutes;

        if (state.mode === "drag") {
          newDayIndex = Math.max(0, Math.min(days.length - 1, target.dayIndex + deltaDays));
          newStart = target.startMinutes + deltaMinutes;
          newEnd = target.endMinutes + deltaMinutes;
          const duration = target.endMinutes - target.startMinutes;
          if (newStart < 0) {
            newStart = 0;
            newEnd = Math.min(MAX_MINUTES, duration);
          }
          if (newEnd > MAX_MINUTES) {
            newEnd = MAX_MINUTES;
            newStart = Math.max(0, newEnd - duration);
          }
        } else if (state.mode === "resizeTop") {
          newStart = target.startMinutes + deltaMinutes;
          newStart = Math.max(0, Math.min(newStart, target.endMinutes - MIN_DURATION_MINUTES));
        } else if (state.mode === "resizeBottom") {
          newEnd = target.endMinutes + deltaMinutes;
          newEnd = Math.min(MAX_MINUTES, Math.max(newEnd, target.startMinutes + MIN_DURATION_MINUTES));
        }

        const [finalStart, finalEnd] = snapAndClampRange(newStart, newEnd);

        const hadChange =
          finalStart !== target.startMinutes ||
          finalEnd !== target.endMinutes ||
          newDayIndex !== target.dayIndex;
        if (!hadChange) {
          return;
        }

        const change: CalendarEntryChanges = {
          type: target.entry.type === "event" ? "event" : "task",
          entry: target.entry.payload as CalendarEvent | CalendarTask,
          date: fmtLocal(days[newDayIndex]),
          start: formatTimeFromMinutes(finalStart),
          end: formatTimeFromMinutes(finalEnd),
          duplicate: state.isCopyMode,
        };
        changes.push(change);
      });

      const wasDragging = isDraggingRef.current;
      interactionRef.current = null;
      setIsCopyMode(false);
      gridRef.current?.classList.remove("is-interacting");
      
      // Clear previews after a brief delay to allow visual feedback
      if (previewCleanupTimerRef.current) {
        clearTimeout(previewCleanupTimerRef.current);
      }
      previewCleanupTimerRef.current = setTimeout(() => {
        setDragPreviewTransforms({});
        setResizePreviewTransforms({});
        previewCleanupTimerRef.current = null;
      }, 50);
      
      if (wasDragging) {
        suppressClickRef.current = true;
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
      isDraggingRef.current = false;

      const onReschedule = rescheduleEntriesRef.current;
      if (changes.length && onReschedule) {
        onReschedule(changes);
      }
    };

    document.addEventListener("pointerup", handlePointerUp);
    return () => {
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [days]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const state = interactionRef.current;
      if (!state) return;
      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;
      const moved = Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2;
      if (moved) {
        isDraggingRef.current = true;
      }

      if (state.mode === "drag") {
        const transforms: Record<string, { translateX: number; translateY: number }> = {};
        if (state.previewEntryKey) {
          transforms[state.previewEntryKey] = { translateX: deltaX, translateY: deltaY };
        } else {
          state.targets.forEach((target) => {
            transforms[`${target.entry.type}:${target.entry.id}`] = {
              translateX: deltaX,
              translateY: deltaY,
            };
          });
        }
        setDragPreviewTransforms(transforms);
        setResizePreviewTransforms({});
      } else {
        setDragPreviewTransforms({});
        const resizeTransforms: Record<string, { translateY: number; scaleY: number; initialHeight: number }> = {};
        state.targets.forEach((target) => {
          const entryKey = `${target.entry.type}:${target.entry.id}`;
          const durationMinutes = target.endMinutes - target.startMinutes;
          const deltaMinutes = Math.round(deltaY / (WEEK_ROW_HEIGHT_PX / MINUTES_IN_HOUR));
          let newStart = target.startMinutes;
          let newEnd = target.endMinutes;
          
          if (state.mode === "resizeTop") {
            newStart = Math.max(0, Math.min(target.endMinutes - MIN_DURATION_MINUTES, target.startMinutes + deltaMinutes));
          } else if (state.mode === "resizeBottom") {
            newEnd = Math.min(MAX_MINUTES, Math.max(target.startMinutes + MIN_DURATION_MINUTES, target.endMinutes + deltaMinutes));
          }
          
          const initialHeight = target.initialHeight ?? minutesToPxWeek(durationMinutes);
          const newDuration = newEnd - newStart;
          const newHeight = minutesToPxWeek(newDuration);
          const scaleY = Math.max(ENTRY_MIN_HEIGHT_PX / initialHeight, newHeight / initialHeight);
          
          // Calculate translateY for resizeTop to move the element up/down as it resizes
          const translateY = state.mode === "resizeTop" 
            ? minutesToPxWeek(newStart - target.startMinutes)
            : 0;
          
          if (newDuration > 0) {
            resizeTransforms[entryKey] = {
              translateY,
              scaleY,
              initialHeight,
            };
          }
        });
        setResizePreviewTransforms(resizeTransforms);
      }
    };

    document.addEventListener("pointermove", handlePointerMove);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  // Track Ctrl/Cmd key for copy mode toggle during drag
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "Control" || event.key === "Meta" || event.key === "Alt") && interactionRef.current) {
        interactionRef.current.isCopyMode = true;
        setIsCopyMode(true);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if ((event.key === "Control" || event.key === "Meta" || event.key === "Alt") && interactionRef.current) {
        interactionRef.current.isCopyMode = false;
        setIsCopyMode(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const createTarget = useCallback(
    (entry: WeekTimelineEntry, dayKey: string): InteractionTarget => ({
      entry,
      dayKey,
      dayIndex: dayIndexLookup.get(dayKey) ?? 0,
      startMinutes: entry.startMinutes,
      endMinutes: entry.endMinutes,
    }),
    [dayIndexLookup],
  );

  const gatherTargets = useCallback(
    (entryKey: string, baseTarget: InteractionTarget) => {
      if (!selectedEntryKeys.has(entryKey)) {
        return [baseTarget];
      }
      const targets: InteractionTarget[] = [];
      selectedEntryKeys.forEach((key) => {
        const lookup = entryLookup.get(key);
        if (!lookup) return;
        targets.push(createTarget(lookup.entry, lookup.dayKey));
      });
      if (!targets.length) {
        return [baseTarget];
      }
      return targets;
    },
    [entryLookup, createTarget, selectedEntryKeys],
  );

  const handleEntryPointerDown = useCallback(
    (
      entry: WeekTimelineEntry,
      dayKey: string,
      pointerEvent: React.PointerEvent<HTMLElement>,
    ) => {
      if (pointerEvent.button !== 0) {
        return;
      }
      isDraggingRef.current = false;
      suppressClickRef.current = false;
      const entryKey = `${entry.type}:${entry.id}`;
      const isStack = entry.type === "taskStack" || entry.type === "overlapStack";
      const entryType: CalendarEntryType = entry.type === "event" ? "event" : "task";
      
      // Both Shift and Ctrl/Cmd toggle additive selection (consistent with desktop apps)
      const additive = Boolean(pointerEvent.shiftKey || pointerEvent.ctrlKey || pointerEvent.metaKey);
      
      // Close popover when starting a new interaction
      setPopover(null);
      setStackPopover(null);
      
      if (!isStack) {
        onEntrySelect?.(entryType, entry.id, additive);
      }
      
      // Suppress click when using modifier keys to prevent modal open
      if (additive) {
        suppressClickRef.current = true;
      }
      const baseTarget = createTarget(entry, dayKey);
      const targets = (() => {
        if (!isStack) {
          return gatherTargets(entryKey, baseTarget);
        }

        const payload = entry.payload as TaskStackPayload | OverlapStackPayload;
        const childTargets: InteractionTarget[] = [];
        payload.childEntryKeys.forEach((childKey) => {
          const lookup = entryLookup.get(childKey);
          if (!lookup) return;
          childTargets.push(createTarget(lookup.entry, lookup.dayKey));
        });
        return childTargets;
      })();
      if (!targets.length) {
        return;
      }
      const gridRect = gridRef.current?.getBoundingClientRect();
      targets.forEach((target) => {
        const element = document.querySelector(
          `[data-entry-key="${target.entry.type}:${target.entry.id}"]`,
        ) as HTMLElement | null;
        if (!element) return;
        const rectElement = element.getBoundingClientRect();
        target.initialTop = rectElement.top - (gridRect?.top ?? 0);
        target.initialHeight = rectElement.height;
      });

      const rect = pointerEvent.currentTarget.getBoundingClientRect();
      const relativeY = pointerEvent.clientY - rect.top;
      const mode: InteractionMode = isStack
        ? "drag"
        : relativeY <= RESIZE_HANDLE_THRESHOLD_PX
        ? "resizeTop"
        : relativeY >= rect.height - RESIZE_HANDLE_THRESHOLD_PX
        ? "resizeBottom"
        : "drag";

      // Copy mode during drag (Ctrl/Cmd/Alt). When copy-mode is on, we render a separate
      // moving preview so the original stays visible.
      const copyMode = Boolean(pointerEvent.ctrlKey || pointerEvent.metaKey || pointerEvent.altKey);
      interactionRef.current = {
        mode,
        startX: pointerEvent.clientX,
        startY: pointerEvent.clientY,
        targets,
        duplicate: additive,
        isCopyMode: copyMode,
        startDayIndex: baseTarget.dayIndex,
        previewEntryKey: isStack ? entryKey : undefined,
      };
      setIsCopyMode(copyMode);
      pointerEvent.preventDefault();
    },
    [createTarget, gatherTargets, onEntrySelect, entryLookup],
  );

  const handleEntryMouseEnter = useCallback(
    (
      event: React.MouseEvent<HTMLElement>,
      entry: WeekTimelineEntry,
    ) => {
      if (entry.type === "taskStack" || entry.type === "overlapStack") {
        return;
      }
      setCreateMenu(null);
      // Mark anchor as hovered
      isAnchorHoverRef.current = true;

      // Clear any pending hide timer
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }

      const anchorElement = event.currentTarget;
      const tooltipAvatars =
        entry.avatars.length > 0 ? (
          <div className="week-grid__timeline-tooltip-avatars" aria-hidden="true">
            {buildAvatarStack(entry.avatars, "week-grid__timeline-tooltip-avatar", 14, "tooltip")}
          </div>
        ) : null;
      const tooltipTimeText =
        entry.timeLabel ?? (entry.type === "event" ? "All day" : "Scheduled task");

      // Delay showing tooltip slightly to prevent flicker on quick mouse movement
      hoverTimerRef.current = setTimeout(() => {
        setHoveredEntry({
          id: entry.id,
          anchorElement,
          avatars: tooltipAvatars,
          timeText: tooltipTimeText,
          title: entry.title,
        });
      }, 150);
    },
    [],
  );

  const handleEntryMouseLeave = useCallback((event: React.MouseEvent<HTMLElement>) => {
    // Mark anchor as not hovered
    isAnchorHoverRef.current = false;

    // Clear any pending show timer
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }

    // Hover bridge: only close if BOTH anchor and tooltip are not hovered
    // This allows moving cursor from anchor to tooltip without closing
    hoverTimerRef.current = setTimeout(() => {
      if (!isAnchorHoverRef.current && !isTooltipHoverRef.current) {
        setHoveredEntry(null);
      }
    }, 150);
    event.currentTarget.style.cursor = "";
  }, []);

  const updateResizeCursor = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const relativeY = event.clientY - rect.top;
    const isTopHandle = relativeY <= RESIZE_HANDLE_THRESHOLD_PX;
    const isBottomHandle = relativeY >= rect.height - RESIZE_HANDLE_THRESHOLD_PX;
    if (isTopHandle || isBottomHandle) {
      if (element.style.cursor !== "ns-resize") {
        element.style.cursor = "ns-resize";
      }
    } else if (element.style.cursor === "ns-resize") {
      element.style.cursor = "";
    }
  }, []);

  const handleTooltipHover = useCallback((isHovering: boolean) => {
    // Track tooltip hover state for hover bridge
    isTooltipHoverRef.current = isHovering;

    // Clear any pending timers
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }

    // If we just left the tooltip, check if we should close
    if (!isHovering) {
      hoverTimerRef.current = setTimeout(() => {
        if (!isAnchorHoverRef.current && !isTooltipHoverRef.current) {
          setHoveredEntry(null);
        }
      }, 150);
    }
  }, []);

  const handleTooltipClose = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    isAnchorHoverRef.current = false;
    isTooltipHoverRef.current = false;
    setHoveredEntry(null);
  }, []);

  const handleContextMenu = useCallback(
    (
      event: React.MouseEvent<HTMLElement>,
      entry: WeekTimelineEntry,
    ) => {
      if (entry.type === "taskStack" || entry.type === "overlapStack") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setPopover(null); // Close popover when context menu opens
      setStackPopover(null);
      setChildMenu(null);

      const eligibleSelectedTasksCount = (() => {
        if (selectedEntryKeys.size < 2) return 0;
        const eligible: CalendarTask[] = [];
        selectedEntryKeys.forEach((key) => {
          const lookup = entryLookup.get(key);
          if (!lookup) return;
          if (lookup.entry.type !== "task") return;
          const task = lookup.entry.payload as CalendarTask;
          if (task.kind === "intent") return;
          if (task.kind === "focus_block") return;
          if (task.focusBlockId) return;
          eligible.push(task);
        });
        return eligible.length;
      })();

      setContextMenu({
        position: { x: event.clientX, y: event.clientY },
        entryType: entry.type === "event" ? "event" : "task",
        entry: entry.payload as CalendarTask | CalendarEvent,
        allowConvertToFocusBlock: eligibleSelectedTasksCount >= 2,
      });
    },
    [entryLookup, selectedEntryKeys],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleClosePopover = useCallback(() => {
    setChildMenu(null);
    setPopover(null);
  }, []);

  const handleCloseStackPopover = useCallback(() => {
    setChildMenu(null);
    setStackPopover(null);
  }, []);

  const handleOpenDetailsFromStackPopover = useCallback(
    (child: StackPopoverChild, anchor: HTMLElement) => {
      setContextMenu(null);
      setChildMenu(null);

      onEntrySelect?.(
        child.entryType === "event" ? "event" : "task",
        child.entry.id,
        false,
      );

      const focusChildren = (() => {
        if (child.entryType !== "task") return undefined;
        const task = child.entry as CalendarTask;
        // Detect Focus Blocks by kind OR by having child task references (legacy support)
        const isFocusBlock = task.kind === "focus_block" ||
          (task.focusChildTaskIds && task.focusChildTaskIds.length > 0) ||
          (task.focusChecklist && task.focusChecklist.length > 0);
        if (!isFocusBlock) return undefined;
        const focusId = task.source?.taskId ?? task.id;
        const childIds = task.focusChildTaskIds ?? task.focusChecklist?.map((item) => item.taskId) ?? [];
        const childrenFromIds = childIds
          .map((id) => calendarTaskById.get(id))
          .filter((value): value is CalendarTask => Boolean(value));
        const childrenFromFocusId = focusId ? (focusChildrenByFocusId.get(focusId) ?? []) : [];
        const children = Array.from(
          new Map(
            [...childrenFromIds, ...childrenFromFocusId].map((childTask) => [childTask.source?.taskId ?? childTask.id, childTask]),
          ).values(),
        ).sort((a, b) => (parseTimeToMinutes(a.start) ?? 0) - (parseTimeToMinutes(b.start) ?? 0));
        return children.length ? children : undefined;
      })();

      setPopover({
        anchorElement: anchor,
        entryType: child.entryType,
        entry: child.entry,
        focusChildren,
      });
    },
    [calendarTaskById, focusChildrenByFocusId, onEntrySelect],
  );

  const handleOpenContextMenuFromStackPopover = useCallback(
    (child: StackPopoverChild, event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const key = `${child.entryType}:${child.entry.id}`;
      const isAlreadySelected = selectedEntryKeys.has(key);
      if (!isAlreadySelected) {
        onEntrySelect?.(
          child.entryType === "event" ? "event" : "task",
          child.entry.id,
          Boolean(event.shiftKey),
        );
      }

      const eligibleSelectedTasksCount = (() => {
        if (selectedEntryKeys.size < 2) return 0;
        const eligible: CalendarTask[] = [];
        selectedEntryKeys.forEach((key) => {
          const lookup = entryLookup.get(key);
          if (!lookup) return;
          if (lookup.entry.type !== "task") return;
          const task = lookup.entry.payload as CalendarTask;
          if (task.kind === "intent") return;
          if (task.kind === "focus_block") return;
          if (task.focusBlockId) return;
          eligible.push(task);
        });
        return eligible.length;
      })();

      setContextMenu({
        position: { x: event.clientX, y: event.clientY },
        entryType: child.entryType,
        entry: child.entry,
        allowConvertToFocusBlock: eligibleSelectedTasksCount >= 2,
      });
    },
    [entryLookup, onEntrySelect, selectedEntryKeys],
  );

  const handleOpenContextMenuFromFocusChild = useCallback(
    (task: CalendarTask, event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const key = `task:${task.id}`;
      const isAlreadySelected = selectedEntryKeys.has(key);
      if (!isAlreadySelected) {
        onEntrySelect?.("task", task.id, Boolean(event.shiftKey));
      }

      const eligibleSelectedTasksCount = (() => {
        if (selectedEntryKeys.size < 2) return 0;
        const eligible: CalendarTask[] = [];
        selectedEntryKeys.forEach((selectedKey) => {
          const lookup = entryLookup.get(selectedKey);
          if (!lookup) return;
          if (lookup.entry.type !== "task") return;
          const selectedTask = lookup.entry.payload as CalendarTask;
          if (selectedTask.kind === "intent") return;
          if (selectedTask.kind === "focus_block") return;
          if (selectedTask.focusBlockId) return;
          eligible.push(selectedTask);
        });
        return eligible.length;
      })();

      setContextMenu({
        position: { x: event.clientX, y: event.clientY },
        entryType: "task",
        entry: task,
        allowConvertToFocusBlock: eligibleSelectedTasksCount >= 2,
      });
    },
    [entryLookup, onEntrySelect, selectedEntryKeys],
  );

  // Handle single click vs double click for entries
  const handleEntryClick = useCallback(
    (
      event: React.MouseEvent<HTMLElement>,
      entry: WeekTimelineEntry,
    ) => {
      if (suppressClickRef.current) {
        return;
      }

      if (entry.type === "taskStack" || entry.type === "overlapStack") {
        const payload = entry.payload as TaskStackPayload | OverlapStackPayload;

        const isFocusBlockTask = (task: CalendarTask) =>
          task.kind === "focus_block" ||
          (task.focusChildTaskIds && task.focusChildTaskIds.length > 0) ||
          (task.focusChecklist && task.focusChecklist.length > 0);

        const focusBlockChildTitle = payload.childEntryKeys
          .map((key) => entryLookup.get(key)?.entry)
          .find((childEntry) => {
            if (!childEntry) return false;
            if (childEntry.type !== "task") return false;
            return isFocusBlockTask(childEntry.payload as CalendarTask);
          })?.title;

        const firstChildTitle = payload.childEntryKeys
          .map((key) => entryLookup.get(key)?.entry)
          .filter((child): child is WeekTimelineEntry => Boolean(child))
          .sort((a, b) => a.startMinutes - b.startMinutes || a.title.localeCompare(b.title))[0]?.title;

        const overlapTitleKey =
          entry.type === "overlapStack" ? buildOverlapTitleKey(payload.childEntryKeys) : undefined;

        const defaultOverlapTitle = firstChildTitle ?? entry.title;
        const baseTitle =
          entry.type === "overlapStack"
            ? overlapStackTitleOverrides[overlapTitleKey ?? ""] ?? defaultOverlapTitle
            : `${focusBlockChildTitle ?? firstChildTitle ?? entry.title}`;
        const count = payload.childEntryKeys.length;
        setPopover(null);
        setContextMenu(null);
        setChildMenu(null);
        setStackPopover({
          anchorElement: event.currentTarget,
          kind: entry.type,
          parentId: buildStackParentId(entry.type, payload.childEntryKeys, overlapTitleKey),
          baseTitle,
          titleKey: overlapTitleKey,
          count,
          childEntryKeys: payload.childEntryKeys,
          avatars: entry.avatars,
        });
        return;
      }

      const entryKey = `${entry.type}:${entry.id}`;
      const now = Date.now();
      const isDoubleClick =
        lastClickedKeyRef.current === entryKey && now - lastClickTimeRef.current < 300;

      lastClickTimeRef.current = now;
      lastClickedKeyRef.current = entryKey;

      if (isDoubleClick) {
        // Double click → open edit modal
        setPopover(null);
        setStackPopover(null);
        setChildMenu(null);
        if (entry.type === "event") {
          onEditEvent(entry.payload as CalendarEvent);
        } else {
          onEditTask(entry.payload as CalendarTask);
        }
      } else {
        // Single click → show popover
        setStackPopover(null);
        setChildMenu(null);
        const focusChildren = (() => {
          if (entry.type !== "task") return undefined;
          const task = entry.payload as CalendarTask;
          // Detect Focus Blocks by kind OR by having child task references (legacy support)
          const isFocusBlock = task.kind === "focus_block" ||
            (task.focusChildTaskIds && task.focusChildTaskIds.length > 0) ||
            (task.focusChecklist && task.focusChecklist.length > 0);
          if (!isFocusBlock) return undefined;
          const focusId = task.source?.taskId ?? task.id;
          const childIds = task.focusChildTaskIds ?? task.focusChecklist?.map((item) => item.taskId) ?? [];
          const childrenFromIds = childIds
            .map((id) => calendarTaskById.get(id))
            .filter((value): value is CalendarTask => Boolean(value));
          const childrenFromFocusId = focusId ? (focusChildrenByFocusId.get(focusId) ?? []) : [];
          const children = Array.from(
            new Map(
              [...childrenFromIds, ...childrenFromFocusId].map((childTask) => [childTask.source?.taskId ?? childTask.id, childTask]),
            ).values(),
          ).sort((a, b) => (parseTimeToMinutes(a.start) ?? 0) - (parseTimeToMinutes(b.start) ?? 0));
          return children.length ? children : undefined;
        })();
        setPopover({
          anchorElement: event.currentTarget,
          entryType: entry.type === "event" ? "event" : "task",
          entry: entry.payload as CalendarTask | CalendarEvent,
          focusChildren,
        });
      }
    },
    [
      buildOverlapTitleKey,
      calendarTaskById,
      entryLookup,
      focusChildrenByFocusId,
      onEditEvent,
      onEditTask,
      overlapStackTitleOverrides,
    ],
  );

  // Handle keyboard events for selected entries
  const handleEntryKeyDown = useCallback(
    (
      keyboardEvent: React.KeyboardEvent<HTMLElement>,
      entry: WeekTimelineEntry,
    ) => {
      if (entry.type === "taskStack" || entry.type === "overlapStack") {
        if (keyboardEvent.key === "Escape") {
          setStackPopover(null);
          onClearSelection?.();
        }
        return;
      }
      if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
        keyboardEvent.preventDefault();
        // Enter/Space → open edit modal
        if (entry.type === "event") {
          onEditEvent(entry.payload as CalendarEvent);
        } else {
          onEditTask(entry.payload as CalendarTask);
        }
      } else if (keyboardEvent.key === "Escape") {
        // Escape → close popover and clear selection
        setPopover(null);
        setStackPopover(null);
        setChildMenu(null);
        onClearSelection?.();
      } else if (keyboardEvent.key === "Delete" || keyboardEvent.key === "Backspace") {
        // Delete key → delete when popover is open
        if (popover && onDeleteEntries) {
          keyboardEvent.preventDefault();
          const entries = getSelectedContextMenuEntries();
          if (entries.length > 0) {
            onDeleteEntries(entries);
          }
        }
      }
    },
    [onEditEvent, onEditTask, onClearSelection, popover, onDeleteEntries],
  );

  // Build selected entries for context menu / bulk actions
  const getSelectedContextMenuEntries = useCallback((): ContextMenuEntry[] => {
    const entries: ContextMenuEntry[] = [];
    selectedEntryKeys.forEach((key) => {
      const lookup = entryLookup.get(key);
      if (!lookup) return;
      entries.push({
        entryType: lookup.entry.type === "event" ? "event" : "task",
        entry: lookup.entry.payload as CalendarTask | CalendarEvent,
      });
    });
    return entries;
  }, [selectedEntryKeys, entryLookup]);

  // Handle click on empty grid to clear selection
  const handleGridClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      // Only clear if clicking directly on the grid (not on an entry)
      if ((event.target as HTMLElement).closest("[data-entry-key]")) {
        return;
      }
      setPopover(null);
      setStackPopover(null);
      setChildMenu(null);
      setContextMenu(null);
      setCreateMenu(null);
      onClearSelection?.();
    },
    [onClearSelection],
  );

  const applySelection = useCallback(
    (next: Set<string>) => {
      if (onReplaceSelection) {
        onReplaceSelection(next);
        return;
      }
      // Fallback (older callers): clear then add keys back via onEntrySelect.
      onClearSelection?.();
      if (!onEntrySelect) return;
      next.forEach((key) => {
        const [type, id] = key.split(":");
        if (type !== "event" && type !== "task") return;
        onEntrySelect(type as CalendarEntryType, id, true);
      });
    },
    [onClearSelection, onEntrySelect, onReplaceSelection],
  );

  const getSlotDateFromCell = useCallback(
    (cell: HTMLElement, clientY: number): Date | null => {
      const dayKey = cell.dataset.dayKey;
      const hourStr = cell.dataset.hour;
      if (!dayKey || !hourStr) return null;
      const day = dayByKey.get(dayKey);
      const hour = Number(hourStr);
      if (!day || Number.isNaN(hour)) return null;

      const rect = cell.getBoundingClientRect();
      const ratio = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);
      const minutes = Math.min(
        Math.max(Math.round(ratio * MINUTES_IN_HOUR), 0),
        MINUTES_IN_HOUR - 1,
      );
      return setTime(day, hour, minutes);
    },
    [dayByKey],
  );

  const openCreateMenuAtEvent = useCallback(
    (event: React.MouseEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest("[data-entry-key]") ||
        target.closest(".week-grid__quick-add-container") ||
        target.closest(".week-grid__action-popover")
      ) {
        return;
      }
      const cell = target.closest(".week-grid__cell") as HTMLElement | null;
      if (!cell) return;
      const slotDate = getSlotDateFromCell(cell, event.clientY);
      if (!slotDate) return;

      setPopover(null);
      setStackPopover(null);
      setChildMenu(null);
      setContextMenu(null);
      setCreateMenu({ position: { x: event.clientX, y: event.clientY }, date: slotDate });
    },
    [getSlotDateFromCell],
  );

  const handleGridContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Allow entry-level context menus to handle themselves.
      if ((event.target as HTMLElement | null)?.closest("[data-entry-key]")) return;
      event.preventDefault();
      event.stopPropagation();
      openCreateMenuAtEvent(event);
    },
    [openCreateMenuAtEvent],
  );

  const getIntersectingEntryKeys = useCallback(
    (rect: { left: number; right: number; top: number; bottom: number }): Set<string> => {
      const grid = gridRef.current;
      const keys = new Set<string>();
      if (!grid) return keys;
      const nodes = grid.querySelectorAll<HTMLElement>("[data-entry-key][data-entry-type]");
      nodes.forEach((node) => {
        const entryType = node.dataset.entryType;
        const entryKey = node.dataset.entryKey;
        if (!entryKey) return;
        const b = node.getBoundingClientRect();
        const intersects = !(
          b.right < rect.left ||
          b.left > rect.right ||
          b.bottom < rect.top ||
          b.top > rect.bottom
        );
        if (!intersects) return;

        if (entryType === "event" || entryType === "task") {
          keys.add(entryKey);
          return;
        }

        // Stack tiles are UI aggregates that visually cover multiple entries.
        // When marquee-selecting, expand them into their child entry keys so
        // multi-copy / bulk actions include the underlying entries.
        if (entryType === "overlapStack" || entryType === "taskStack") {
          const raw = node.dataset.stackChildKeys;
          if (!raw) return;
          raw
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean)
            .forEach((k) => keys.add(k));
        }
      });
      return keys;
    },
    [],
  );

  const updateMarquee = useCallback(
    (clientX: number, clientY: number) => {
      const state = marqueeStateRef.current;
      const grid = gridRef.current;
      if (!state || !grid) return;
      const gridRect = grid.getBoundingClientRect();

      const left = Math.min(state.startX, clientX);
      const top = Math.min(state.startY, clientY);
      const right = Math.max(state.startX, clientX);
      const bottom = Math.max(state.startY, clientY);

      const relLeft = left - gridRect.left;
      const relTop = top - gridRect.top;
      const width = Math.max(0, right - left);
      const height = Math.max(0, bottom - top);
      setMarqueeRect({ left: relLeft, top: relTop, width, height });

      const intersect = getIntersectingEntryKeys({ left, right, top, bottom });
      const next = (() => {
        if (state.mode === "add") {
          const merged = new Set(state.initialSelection);
          intersect.forEach((k) => merged.add(k));
          return merged;
        }
        if (state.mode === "subtract") {
          const remaining = new Set(state.initialSelection);
          intersect.forEach((k) => remaining.delete(k));
          return remaining;
        }
        return intersect;
      })();

      applySelection(next);
    },
    [applySelection, getIntersectingEntryKeys],
  );

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const setMarqueeSelecting = useCallback((isOn: boolean) => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("isMarqueeSelecting", isOn);
  }, []);

  useEffect(() => {
    return () => setMarqueeSelecting(false);
  }, [setMarqueeSelecting]);

  const handleGridPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("input, textarea, [contenteditable='true']")) return;
      if (
        target.closest("[data-entry-key]") ||
        target.closest(".week-grid__quick-add-container") ||
        target.closest(".week-grid__action-popover")
      ) {
        return;
      }
      const cell = target.closest(".week-grid__cell") as HTMLElement | null;
      if (!cell) return;

      // Ctrl/Cmd + click opens create menu (trackpad-friendly right-click fallback).
      if (event.button === 0 && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        openCreateMenuAtEvent(event);
        return;
      }

      // Only left-button starts marquee selection.
      if (event.button !== 0) return;

      setCreateMenu(null);
      setContextMenu(null);

      try {
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      } catch {
        // Ignore (e.g., if capture is not allowed in this state).
      }

      const mode: "replace" | "add" | "subtract" = event.shiftKey
        ? "add"
        : event.altKey
        ? "subtract"
        : "replace";

      marqueeStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        mode,
        initialSelection: new Set(selectedEntryKeys),
        didDrag: false,
      };

      // Touch long-press → open create menu (no right click).
      clearLongPressTimer();
      if (event.pointerType === "touch") {
        longPressTimerRef.current = setTimeout(() => {
          const state = marqueeStateRef.current;
          if (!state || state.didDrag) return;
          // Open menu at the press point (minimal event-like object).
          openCreateMenuAtEvent({
            target: event.target,
            clientX: state.startX,
            clientY: state.startY,
          } as unknown as React.PointerEvent<HTMLDivElement>);
        }, LONG_PRESS_MS);
      }
    },
    [clearLongPressTimer, openCreateMenuAtEvent, selectedEntryKeys],
  );

  const handleGridPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = marqueeStateRef.current;
      if (!state) return;
      if (event.pointerId !== state.pointerId) return;

      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      const dist = Math.hypot(dx, dy);
      if (dist >= DRAG_THRESHOLD_PX) {
        if (!state.didDrag) {
          state.didDrag = true;
          suppressClickRef.current = true;
          setMarqueeSelecting(true);
        }
        clearLongPressTimer();
      }

      if (!state.didDrag) return;
      if (marqueeRafRef.current) cancelAnimationFrame(marqueeRafRef.current);
      marqueeRafRef.current = requestAnimationFrame(() => {
        updateMarquee(event.clientX, event.clientY);
      });
    },
    [clearLongPressTimer, setMarqueeSelecting, updateMarquee],
  );

  const handleGridPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = marqueeStateRef.current;
      if (!state) return;
      if (event.pointerId !== state.pointerId) return;

      clearLongPressTimer();
      marqueeStateRef.current = null;
      if (marqueeRafRef.current) {
        cancelAnimationFrame(marqueeRafRef.current);
        marqueeRafRef.current = null;
      }

      setMarqueeSelecting(false);

      if (!state.didDrag) {
        // Single click on empty space: clear selection (and do nothing else).
        setPopover(null);
        setStackPopover(null);
        setChildMenu(null);
        setContextMenu(null);
        setCreateMenu(null);
        onClearSelection?.();
      }

      setMarqueeRect(null);
    },
    [clearLongPressTimer, onClearSelection, setMarqueeSelecting],
  );

  const renderWeekTimelineEntry = (
    entry: WeekTimelineEntry,
    dayKey: string,
    entryStyle?: React.CSSProperties,
    stacked = false,
    entryKeyOverride?: string,
  ) => {
    const entrySelectionKey = `${entry.type}:${entry.id}`;
    const isStack = entry.type === "taskStack" || entry.type === "overlapStack";
    const stackPayload = isStack ? (entry.payload as TaskStackPayload | OverlapStackPayload) : null;
    const isEntrySelected = selectedEntryKeys.has(entrySelectionKey) ||
      (isStack ? stackPayload!.childEntryKeys.some((k) => selectedEntryKeys.has(k)) : false);
    const stackChildren = isStack
      ? stackPayload!.childEntryKeys
          .map((key) => entryLookup.get(key)?.entry)
          .filter((child): child is WeekTimelineEntry => Boolean(child))
          .sort((a, b) => a.startMinutes - b.startMinutes)
      : [];

    const overlapStackTitle = (() => {
      if (entry.type !== "overlapStack") return null;
      const payload = entry.payload as OverlapStackPayload;
      const key = buildOverlapTitleKey(payload.childEntryKeys);
      const defaultTitle = stackChildren[0]?.title ?? entry.title;
      return overlapStackTitleOverrides[key] ?? defaultTitle;
    })();

    const isSingleUserStack = isStack && entry.avatars.length === 1;
    const previewTitle = isSingleUserStack
      ? getWeekEntryPreview(stackChildren[0]?.title ?? overlapStackTitle ?? entry.title)
      : getWeekEntryPreview(overlapStackTitle ?? entry.title);
    const tooltipBaseTitle = overlapStackTitle ?? entry.title;
    const tooltipLabel = entry.timeLabel ? `${tooltipBaseTitle} · ${entry.timeLabel}` : tooltipBaseTitle;
    const isFocusBlock = (() => {
      if (entry.type !== "task") return false;
      const task = entry.payload as CalendarTask | undefined;
      if (!task) return false;
      // Detect Focus Blocks by kind OR by having child task references (legacy support)
      if (task.kind === "focus_block") return true;
      const hasChildren = (task.focusChildTaskIds && task.focusChildTaskIds.length > 0) ||
        (task.focusChecklist && task.focusChecklist.length > 0);
      return hasChildren;
    })();
    const focusMeter = (() => {
      if (!isFocusBlock) return null;
      const task = entry.payload as CalendarTask;
      const childIds =
        task.focusChildTaskIds ?? task.focusChecklist?.map((item) => item.taskId) ?? [];
      if (childIds.length === 0) return null;
      const doneCount = childIds.reduce((sum, id) => {
        const child = calendarTaskById.get(id);
        if (!child) return sum;
        return sum + (child.status === "done" ? 1 : 0);
      }, 0);
      return (
        <span
          className="week-grid__focus-meter week-grid__focus-meter--tile"
          aria-label={`Focus block progress ${doneCount} of ${childIds.length}`}
        >
          {doneCount}/{childIds.length}
        </span>
      );
    })();
    const avatarsToRender = isFocusBlock ? entry.avatars.slice(0, 1) : entry.avatars;
    const inlineAvatars =
      avatarsToRender.length > 0 ? (
        <div className="week-grid__timeline-entry-avatars" aria-hidden="true">
          {buildAvatarStack(avatarsToRender, "week-grid__timeline-avatar", 10, "inline")}
        </div>
      ) : null;
    
    // Stacks are UI-computed aggregates; keep them aligned to the active project's color.
    const color = isStack ? projectColor : entry.projectColor || projectColor;
    const pillStyle = {
      ...entryStyle,
      background: hexToRgba(color).replace(/[\d.]+\)$/, '0.18)'),
      border: `1px solid ${hexToRgba(color).replace(/[\d.]+\)$/, '0.32)')}`,
    };
    const dragTransform = dragPreviewTransforms[entrySelectionKey];
    const resizeTransform = resizePreviewTransforms[entrySelectionKey];
    const showCopyPreview = Boolean(isCopyMode && dragTransform);

    const entryClasses = [
      "week-grid__timeline-entry",
      entry.type === "event"
        ? "week-grid__timeline-entry--event"
        : entry.type === "task"
        ? "week-grid__timeline-entry--task"
        : entry.type === "taskStack"
        ? "week-grid__timeline-entry--task-stack"
        : "week-grid__timeline-entry--overlap-stack",
      isFocusBlock ? "week-grid__timeline-entry--focus-block" : "",
      stacked ? "week-grid__timeline-entry--stacked" : "",
      isEntrySelected ? "week-grid__timeline-entry--selected" : "",
      // Only apply the copy styling to the moving preview, not the original.
      !showCopyPreview && isEntrySelected && isCopyMode && dragTransform ? "week-grid__timeline-entry--copying" : "",
    ]
      .filter(Boolean)
      .join(" ");
    
    let entryStyleWithPreview = pillStyle;
    if (!showCopyPreview && dragTransform) {
      entryStyleWithPreview = {
        ...pillStyle,
        transform: `translate(${dragTransform.translateX}px, ${dragTransform.translateY}px)`,
        transition: "none",
        zIndex: 2,
      };
    } else if (resizeTransform) {
      const previewHeightPx = Math.max(ENTRY_MIN_HEIGHT_PX, resizeTransform.initialHeight * resizeTransform.scaleY);
      entryStyleWithPreview = {
        ...pillStyle,
        transform: `translateY(${resizeTransform.translateY}px)`,
        transition: "none",
        zIndex: 2,
        height: `${previewHeightPx}px`,
        borderRadius: `${ENTRY_RADIUS_PX}px`,
      };
    }

    const copyPreviewStyle: React.CSSProperties | null = showCopyPreview
      ? {
          ...pillStyle,
          transform: `translate(${dragTransform!.translateX}px, ${dragTransform!.translateY}px)`,
          transition: "none",
          zIndex: 3,
          pointerEvents: "none",
        }
      : null;

    const copyPreviewClassName = showCopyPreview
      ? [
          "week-grid__timeline-entry",
          entry.type === "event"
            ? "week-grid__timeline-entry--event"
            : entry.type === "task"
            ? "week-grid__timeline-entry--task"
            : entry.type === "taskStack"
            ? "week-grid__timeline-entry--task-stack"
            : "week-grid__timeline-entry--overlap-stack",
          isFocusBlock ? "week-grid__timeline-entry--focus-block" : "",
          stacked ? "week-grid__timeline-entry--stacked" : "",
          isEntrySelected ? "week-grid__timeline-entry--selected" : "",
          "week-grid__timeline-entry--copying",
        ]
          .filter(Boolean)
          .join(" ")
      : "";
    const content = (
      <div className="week-grid__timeline-entry-content">
        <div className="week-grid__timeline-entry-header">
          {(entry.type === "task" || entry.type === "taskStack" || entry.type === "overlapStack") && (
            <span className="week-grid__timeline-entry-icon">
              {entry.type === "overlapStack" ? (
                <Users className="week-grid__task-icon-svg" aria-hidden />
              ) : entry.type === "task" && isFocusBlock ? (
                <ListTodo className="week-grid__task-icon-svg" aria-hidden />
              ) : (
                <CheckSquare className="week-grid__task-icon-svg" aria-hidden />
              )}
            </span>
          )}
          {entry.type === "event" && (
            <span className="week-grid__timeline-entry-icon">
              <Clock className="week-grid__event-icon-svg" aria-hidden />
            </span>
          )}
          <div
            className={`week-grid__timeline-entry-title ${
              entry.completed ? "is-complete" : ""
            }`}
          >
            {previewTitle}
          </div>
        </div>
      </div>
    );
    const resolvedKey = entryKeyOverride ?? entry.id;

    const renderChecklistPreviewList = (options: {
      items: Array<{ key: string; title: string; done: boolean }>;
      tileHeightPx: number;
      maxRows: number;
    }) => {
      const { items, tileHeightPx, maxRows } = options;
      if (items.length === 0) return null;

      const paddingYPx = 12;
      const headerHeightPx = 16;
      const headerToListGapPx = 6;
      const rowHeightPx = 14;

      const available = tileHeightPx - (paddingYPx + headerHeightPx + headerToListGapPx);
      const fitRows = Math.max(0, Math.floor(available / rowHeightPx));
      const computedMaxRows = Math.max(0, Math.min(maxRows, fitRows));

      if (computedMaxRows <= 0) return null;

      const total = items.length;
      const needsMore = total > computedMaxRows;
      const displayCount = needsMore
        ? Math.max(0, computedMaxRows - 1)
        : Math.min(total, computedMaxRows);
      const visible = items.slice(0, displayCount);

      return (
        <div className="week-grid__task-preview-list" aria-hidden>
          {visible.map((item) => (
            <div
              key={item.key}
              className={`week-grid__task-preview-row${item.done ? " is-complete" : ""}`}
            >
              <span className="week-grid__task-preview-checkbox" aria-hidden>
                {item.done ? (
                  <CheckSquare className="week-grid__task-preview-check" aria-hidden />
                ) : (
                  <span className="week-grid__task-preview-box" aria-hidden />
                )}
              </span>
              <span className="week-grid__task-preview-text">{item.title}</span>
            </div>
          ))}
          {needsMore && (
            <div className="week-grid__task-preview-row week-grid__task-preview-row--more">
              +{total - displayCount} more
            </div>
          )}
        </div>
      );
    };

    const renderTileHeader = (options: {
      icon: React.ReactNode;
      title: string;
      isComplete?: boolean;
      chip: React.ReactNode | null;
    }) => {
      const { icon, title, isComplete, chip } = options;
      return (
        <div className="week-grid__tile-header" aria-hidden>
          <div className="week-grid__tile-header-left">
            <span className="week-grid__timeline-entry-icon">{icon}</span>
            <div className={`week-grid__tile-title${isComplete ? " is-complete" : ""}`}>{title}</div>
          </div>
          <div className="week-grid__tile-chip">{chip}</div>
        </div>
      );
    };

    const renderInlineStackList = () => {
      if (!isSingleUserStack) return null;
      if (!stackChildren.length) return null;

      const durationMinutes = entry.endMinutes - entry.startMinutes;
      const tileHeightPx = Math.max(32, minutesToPxWeek(durationMinutes));
      const headerHeightPx = 16;
      const paddingYPx = 12;
      const lineHeightPx = 14;
      const available = tileHeightPx - headerHeightPx - paddingYPx;
      const maxLines = Math.max(0, Math.floor(available / lineHeightPx));
      if (maxLines <= 0) return null;

      const total = stackChildren.length;
      const needsMore = total > maxLines;
      const displayCount = needsMore ? Math.max(0, maxLines - 1) : Math.min(total, maxLines);
      const visible = stackChildren.slice(0, displayCount);

      return (
        <div className="week-grid__stack-list" aria-hidden>
          {visible.map((child) => {
            const childKey = `${child.type}:${child.id}`;
            const childColor = color;
            return (
              <div
                key={childKey}
                className={`week-grid__stack-line${child.completed ? " is-complete" : ""}`}
              >
                <span className="week-grid__stack-pill" style={{ background: childColor }} aria-hidden />
                <span className="week-grid__stack-text">{child.title}</span>
              </div>
            );
          })}
          {needsMore && (
            <div className="week-grid__stack-line week-grid__stack-line--more">
              +{total - displayCount} more
            </div>
          )}
        </div>
      );
    };

    const renderFocusBlockChildren = () => {
      if (!isFocusBlock) return null;
      const task = entry.payload as CalendarTask;
      const childIds = task.focusChildTaskIds ?? task.focusChecklist?.map((item) => item.taskId) ?? [];
      if (childIds.length === 0) return null;

      const children = childIds
        .map((id) => calendarTaskById.get(id))
        .filter((child): child is CalendarTask => Boolean(child));
      if (children.length === 0) return null;

      const durationMinutes = entry.endMinutes - entry.startMinutes;
      const tileHeightPx = Math.max(32, minutesToPxWeek(durationMinutes));
      const items = children.map((child) => ({
        key: `task:${child.id}`,
        title: child.title,
        done: child.status === "done" || Boolean(child.done),
      }));

      // Clamp to tile height.
      return renderChecklistPreviewList({ items, tileHeightPx, maxRows: Number.POSITIVE_INFINITY });
    };

    const renderMultiUserOverlapChecklist = () => {
      if (entry.type !== "overlapStack") return null;
      if (isSingleUserStack) return null;
      if (!stackChildren.length) return null;

      const tasksOnly = stackChildren
        .filter((child) => child.type === "task")
        .map((child) => {
          const task = child.payload as CalendarTask;
          return {
            key: `task:${task.id}`,
            title: task.title,
            done: task.status === "done" || Boolean(task.done),
          };
        });

      if (tasksOnly.length === 0) return null;

      const durationMinutes = entry.endMinutes - entry.startMinutes;
      const tileHeightPx = Math.max(32, minutesToPxWeek(durationMinutes));
      // Clamp to fit, but cap at ~3 rows.
      return renderChecklistPreviewList({ items: tasksOnly, tileHeightPx, maxRows: 3 });
    };

    if (entry.type === "overlapStack") {
      const payload = entry.payload as OverlapStackPayload;
      const count = payload.childEntryKeys.length;

      if (isSingleUserStack) {
        return (
          <>
            <button
              key={resolvedKey}
              type="button"
              className={entryClasses}
              data-entry-key={entrySelectionKey}
              data-entry-type={entry.type}
              data-stack-child-keys={payload.childEntryKeys.join(",")}
              onPointerDown={(event) => handleEntryPointerDown(entry, dayKey, event)}
              style={entryStyleWithPreview}
              title={tooltipLabel}
              aria-label={tooltipLabel}
              onClick={(event) => handleEntryClick(event, entry)}
              onKeyDown={(keyboardEvent) => handleEntryKeyDown(keyboardEvent, entry)}
            >
              <div className="week-grid__timeline-entry-main">
                <div className="week-grid__timeline-entry-body">
                  {content}
                  {renderInlineStackList()}
                </div>
                {inlineAvatars}
              </div>
              {focusMeter}
            </button>
            {showCopyPreview && copyPreviewStyle ? (
              <div className={copyPreviewClassName} style={copyPreviewStyle} aria-hidden>
                <div className="week-grid__timeline-entry-main">
                  <div className="week-grid__timeline-entry-body">
                    {content}
                    {renderInlineStackList()}
                  </div>
                  {inlineAvatars}
                </div>
                {focusMeter}
              </div>
            ) : null}
          </>
        );
      }

      const extra = Math.max(count - entry.avatars.length, 0);
      const headerChip = entry.avatars.length ? (
        <div className="week-grid__tile-chip-avatars" aria-hidden="true">
          {buildAvatarStack(entry.avatars, "week-grid__timeline-avatar", 10, "overlap")}
          {extra > 0 && (
            <span className="week-grid__timeline-avatar week-grid__timeline-avatar--more">+{extra}</span>
          )}
        </div>
      ) : null;

      return (
        <>
          <button
            key={resolvedKey}
            type="button"
            className={entryClasses}
            data-entry-key={entrySelectionKey}
            data-entry-type={entry.type}
            data-stack-child-keys={payload.childEntryKeys.join(",")}
            onPointerDown={(event) => handleEntryPointerDown(entry, dayKey, event)}
            style={entryStyleWithPreview}
            title={tooltipLabel}
            aria-label={tooltipLabel}
            onClick={(event) => handleEntryClick(event, entry)}
            onKeyDown={(keyboardEvent) => handleEntryKeyDown(keyboardEvent, entry)}
          >
            <div className="week-grid__timeline-entry-main week-grid__timeline-entry-main--tile">
              <div className="week-grid__timeline-entry-body week-grid__timeline-entry-body--tile">
                {renderTileHeader({
                  icon: <Users className="week-grid__task-icon-svg" aria-hidden />,
                  title: previewTitle,
                  chip: headerChip,
                })}
                {renderMultiUserOverlapChecklist()}
              </div>
            </div>
          </button>
          {showCopyPreview && copyPreviewStyle ? (
            <div className={copyPreviewClassName} style={copyPreviewStyle} aria-hidden>
              <div className="week-grid__timeline-entry-main week-grid__timeline-entry-main--tile">
                <div className="week-grid__timeline-entry-body week-grid__timeline-entry-body--tile">
                  {renderTileHeader({
                    icon: <Users className="week-grid__task-icon-svg" aria-hidden />,
                    title: previewTitle,
                    chip: headerChip,
                  })}
                  {renderMultiUserOverlapChecklist()}
                </div>
              </div>
            </div>
          ) : null}
        </>
      );
    }

    if (entry.type === "taskStack") {
      const payload = entry.payload as TaskStackPayload;
      return (
        <>
          <button
            key={resolvedKey}
            type="button"
            className={entryClasses}
            data-entry-key={entrySelectionKey}
            data-entry-type={entry.type}
            data-stack-child-keys={payload.childEntryKeys.join(",")}
            onPointerDown={(event) => handleEntryPointerDown(entry, dayKey, event)}
            style={entryStyleWithPreview}
            title={tooltipLabel}
            aria-label={tooltipLabel}
            onClick={(event) => handleEntryClick(event, entry)}
            onKeyDown={(keyboardEvent) => handleEntryKeyDown(keyboardEvent, entry)}
          >
            <div className="week-grid__timeline-entry-main">
              <div className="week-grid__timeline-entry-body">
                {content}
                {renderInlineStackList()}
              </div>
              {inlineAvatars}
            </div>
            {focusMeter}
          </button>
          {showCopyPreview && copyPreviewStyle ? (
            <div className={copyPreviewClassName} style={copyPreviewStyle} aria-hidden>
              <div className="week-grid__timeline-entry-main">
                <div className="week-grid__timeline-entry-body">
                  {content}
                  {renderInlineStackList()}
                </div>
                {inlineAvatars}
              </div>
              {focusMeter}
            </div>
          ) : null}
        </>
      );
    }

    if (entry.type === "event") {
      return (
        <>
          <motion.div
            key={resolvedKey}
            initial={stacked ? undefined : { opacity: 0.4, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={entryClasses}
            data-entry-key={entrySelectionKey}
            data-entry-type={entry.type}
            onPointerDown={(event) => handleEntryPointerDown(entry, dayKey, event)}
            style={entryStyleWithPreview}
            title={tooltipLabel}
            aria-label={tooltipLabel}
            role="button"
            tabIndex={0}
            onClick={(event) => handleEntryClick(event, entry)}
            onContextMenu={(event) => handleContextMenu(event, entry)}
            onKeyDown={(keyboardEvent) => handleEntryKeyDown(keyboardEvent, entry)}
            onMouseMove={updateResizeCursor}
            onMouseEnter={(event) => handleEntryMouseEnter(event, entry)}
            onMouseLeave={handleEntryMouseLeave}
          >
            <div className="week-grid__timeline-entry-main">
              {content}
              {inlineAvatars}
            </div>
            {focusMeter}
          </motion.div>
          {showCopyPreview && copyPreviewStyle ? (
            <div className={copyPreviewClassName} style={copyPreviewStyle} aria-hidden>
              <div className="week-grid__timeline-entry-main">
                {content}
                {inlineAvatars}
              </div>
              {focusMeter}
            </div>
          ) : null}
        </>
      );
    }

    const useTileLayout = isFocusBlock;

    return (
      <>
        <button
          key={resolvedKey}
          type="button"
          className={entryClasses}
          data-entry-key={entrySelectionKey}
          data-entry-type={entry.type}
          style={entryStyleWithPreview}
          title={tooltipLabel}
          aria-label={tooltipLabel}
          onPointerDown={(event) => handleEntryPointerDown(entry, dayKey, event)}
          onClick={(event) => handleEntryClick(event, entry)}
          onContextMenu={(event) => handleContextMenu(event, entry)}
          onKeyDown={(keyboardEvent) => handleEntryKeyDown(keyboardEvent, entry)}
          onMouseMove={updateResizeCursor}
          onMouseEnter={(event) => handleEntryMouseEnter(event, entry)}
          onMouseLeave={handleEntryMouseLeave}
        >
          <div
            className={`week-grid__timeline-entry-main${useTileLayout ? " week-grid__timeline-entry-main--tile" : ""}`}
          >
            <div
              className={`week-grid__timeline-entry-body${useTileLayout ? " week-grid__timeline-entry-body--tile" : ""}`}
            >
              {useTileLayout
                ? renderTileHeader({
                    icon: <ListTodo className="week-grid__task-icon-svg" aria-hidden />,
                    title: previewTitle,
                    isComplete: entry.completed,
                    chip:
                      avatarsToRender.length > 0 ? (
                        <div className="week-grid__tile-chip-avatars" aria-hidden="true">
                          {buildAvatarStack(avatarsToRender, "week-grid__timeline-avatar", 10, "inline")}
                        </div>
                      ) : null,
                  })
                : content}

              {useTileLayout ? renderFocusBlockChildren() : null}
            </div>

            {useTileLayout ? null : inlineAvatars}
          </div>
          {focusMeter}
        </button>
        {showCopyPreview && copyPreviewStyle ? (
          <div className={copyPreviewClassName} style={copyPreviewStyle} aria-hidden>
            <div
              className={`week-grid__timeline-entry-main${useTileLayout ? " week-grid__timeline-entry-main--tile" : ""}`}
            >
              <div
                className={`week-grid__timeline-entry-body${useTileLayout ? " week-grid__timeline-entry-body--tile" : ""}`}
              >
                {useTileLayout
                  ? renderTileHeader({
                      icon: <ListTodo className="week-grid__task-icon-svg" aria-hidden />,
                      title: previewTitle,
                      isComplete: entry.completed,
                      chip:
                        avatarsToRender.length > 0 ? (
                          <div className="week-grid__tile-chip-avatars" aria-hidden="true">
                            {buildAvatarStack(avatarsToRender, "week-grid__timeline-avatar", 10, "inline")}
                          </div>
                        ) : null,
                    })
                  : content}
                {useTileLayout ? renderFocusBlockChildren() : null}
              </div>
              {useTileLayout ? null : inlineAvatars}
            </div>
            {focusMeter}
          </div>
        ) : null}
      </>
    );
  };

  useEffect(() => {
    if (!quickAddKey) return;

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".week-grid__quick-add-container")) {
        return;
      }
      setQuickAddKey(null);
    };

    document.addEventListener("click", handleDocumentClick);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
    };
  }, [quickAddKey]);

  const triggerCreateEvent = useCallback(
    (date: Date, options?: { triggeredFromCalendar?: boolean }) => {
      onCreateEvent(date, options);
      setQuickAddKey(null);
      setCreateMenu(null);
    },
    [onCreateEvent],
  );

  const triggerCreateTask = useCallback(
    (date: Date, startAt?: Date) => {
      if (!canCreateTasks) return;
      const normalizedStartAt = startAt ? snapDateToHalfHour(startAt) : undefined;
      onCreateTask(date, normalizedStartAt);
      setQuickAddKey(null);
      setCreateMenu(null);
    },
    [canCreateTasks, onCreateTask],
  );

  const handleCreateEvent = useCallback(
    (day: Date, hour?: number) => {
      const baseDate = hour == null ? setTime(day, 9) : setTime(day, hour);
      triggerCreateEvent(baseDate);
    },
    [triggerCreateEvent],
  );

  const handleCreateTask = useCallback(
    (day: Date) => {
      triggerCreateTask(new Date(day));
    },
    [triggerCreateTask],
  );

  const createMenuTimeLabel = useMemo(
    () =>
      createMenu
        ? snapDateToHalfHour(createMenu.date).toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })
        : "",
    [createMenu],
  );

  return (
    <div
      className="week-grid"
      ref={gridRef}
      onClick={handleGridClick}
      onContextMenu={handleGridContextMenu}
      onPointerDown={handleGridPointerDown}
      onPointerMove={handleGridPointerMove}
      onPointerUp={handleGridPointerUp}
      onPointerCancel={handleGridPointerUp}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
    >
      <div className="week-grid__spacer" aria-hidden />
      {days.map((day, index) => {
        const key = fmtLocal(day);
        const isOpen = quickAddKey === key;
        const weekdayClassName = `week-grid__weekday${
          index === days.length - 1 ? " week-grid__weekday--end" : ""
        }`;
        return (
          <div key={key} className={weekdayClassName}>
            <span className="week-grid__weekday-label">
              {day.toLocaleDateString(undefined, { weekday: "short" })} {day.getDate()}
            </span>
            <div className="week-grid__quick-add-container">
              <button
                type="button"
                className={`week-grid__quick-add-button${isOpen ? " is-open" : ""}`}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-label={`Add to ${day.toLocaleDateString()}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setQuickAddKey((current) => (current === key ? null : key));
                }}
              >
                <Plus className="week-grid__quick-add-icon" aria-hidden />
              </button>
              <div
                className={`week-grid__quick-add-menu${isOpen ? " is-visible" : ""}`}
                role="menu"
              >
                <button
                  type="button"
                  className="week-grid__quick-add-option"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCreateEvent(day);
                  }}
                  role="menuitem"
                >
                  Event
                </button>
                <button
                  type="button"
                  className="week-grid__quick-add-option week-grid__quick-add-option--task"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCreateTask(day);
                  }}
                  disabled={!canCreateTasks}
                  role="menuitem"
                >
                  Task
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {hours.map((hour, hourIndex) => (
        <React.Fragment key={hour}>
          <div className="week-grid__hour">{formatHour12(hour)}</div>
          {days.map((day) => {
            const key = fmtLocal(day);
            const dayEventBucket = eventsByDay.get(key) ?? { allDay: [] };
            const dayTaskBucket = tasksByDay.get(key) ?? { allDay: [] };
            const doneCount = hideCompleted ? (doneCountsByDay?.get(key) ?? 0) : 0;
            const timelineEntries = renderTimelineEntriesByDay.get(key)?.get(hour) ?? [];
            const slotId = `${day.getTime()}-${hour}`;
            const isExpandedSlot = expandedSlots.has(slotId);
            const visibleEntries = isExpandedSlot ? [] : timelineEntries.slice(0, 2);
            const overflowCount = Math.max(timelineEntries.length - 2, 0);
            const expandSlot = (event: React.MouseEvent<HTMLDivElement>) => {
              event.stopPropagation();
              setExpandedSlots((prev) => new Set(prev).add(slotId));
            };
            const collapseSlot = (event: React.MouseEvent<HTMLDivElement>) => {
              event.stopPropagation();
              setExpandedSlots((prev) => {
                const next = new Set(prev);
                next.delete(slotId);
                return next;
              });
            };

            const allDayIntents = dayTaskBucket.allDay.filter((task) => task.kind === "intent");
            const allDayTasks = dayTaskBucket.allDay.filter((task) => task.kind !== "intent");

            return (
                <div
                  key={`${key}-${hour}`}
                  className="week-grid__cell"
                  data-day-key={key}
                  data-hour={hour}
                  role="presentation"
                >
                {hourIndex === 0 &&
                  (dayEventBucket.allDay.length > 0 || dayTaskBucket.allDay.length > 0 || doneCount > 0) && (
                    <div className="week-grid__all-day">
                      {allDayIntents.length > 0 && (
                        <div className="week-grid__intents" aria-label="Intents">
                          {allDayIntents.map((task) => (
                            <button
                              key={`${task.id}-intent`}
                              type="button"
                              className="week-grid__intent-chip"
                              onClick={() => onEditTask(task)}
                              title="Intent (click to edit)"
                            >
                              {task.title}
                            </button>
                          ))}
                        </div>
                      )}
                      {hideCompleted && doneCount > 0 && (
                        <div className="week-grid__done-sweep-badge" title="Completed tasks hidden">
                          Done · {doneCount}
                        </div>
                      )}
                      {dayEventBucket.allDay.map((event) => {
                        const eventPillStyle = {
                          background: hexToRgba(projectColor).replace(/[\d.]+\)$/, '0.18)'),
                          border: `1px solid ${hexToRgba(projectColor).replace(/[\d.]+\)$/, '0.32)')}`,
                        };
                        return (
                        <div
                          key={event.id}
                          className="week-grid__all-day-pill"
                          style={eventPillStyle}
                          role="button"
                          tabIndex={0}
                          onClick={() => onEditEvent(event)}
                          onKeyDown={(keyboardEvent) => {
                            if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                              keyboardEvent.preventDefault();
                              onEditEvent(event);
                            }
                          }}
                        >
                          <div className="week-grid__event-title">{event.title}</div>
                          <div className="week-grid__event-time">All day</div>
                        </div>
                      );
                      })}
                      {allDayTasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          className="week-grid__task"
                          onClick={() => onEditTask(task)}
                        >
                          <span className="week-grid__task-icon">
                            <CheckSquare className="week-grid__task-icon-svg" aria-hidden />
                          </span>
                          <div className="week-grid__task-body">
                            <div
                              className={`week-grid__task-title ${
                                task.done || task.status === "archived" ? "is-complete" : ""
                              }`}
                            >
                              {task.title}
                            </div>
                            <div className="week-grid__task-time">All day</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                {isExpandedSlot ? (
                  <div className="week-grid__timeline-rows">
                    {timelineEntries.map((entry) => (
                      <div key={`${entry.id}-stacked`} className="week-grid__timeline-row">
                    {renderWeekTimelineEntry(entry, key, undefined, true)}
                      </div>
                    ))}
                    {overflowCount > 0 && (
                      <div className="week-grid__collapse-pill" onClick={collapseSlot}>
                        Show less
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {visibleEntries.map((entry) => {
                      const columns = Math.max(entry.columnCount, 1);
                      const hourStart = hour * MINUTES_IN_HOUR;
                      const startWithinHour = Math.max(
                        0,
                        Math.min(MINUTES_IN_HOUR, entry.startMinutes - hourStart),
                      );
                      const durationMinutes = Math.max(entry.endMinutes - entry.startMinutes, 5);
                      const topPercent = (startWithinHour / MINUTES_IN_HOUR) * 100;
                      const rawHeightPercent = (durationMinutes / MINUTES_IN_HOUR) * 100;
                      const heightPercent = Math.max(rawHeightPercent, 6);
                      const columnWidth = 100 / columns;
                      const entryStyle = {
                        top: `${topPercent}%`,
                        height: `${heightPercent}%`,
                        left: `calc(${columnWidth * entry.columnIndex}% + ${entry.columnIndex * 4}px)`,
                        width: `${columnWidth}%`,
                      };
                      return renderWeekTimelineEntry(entry, key, entryStyle, false, entry.id);
                    })}
                    {overflowCount > 0 && (
                      <div className="week-grid__overflow-pill" onClick={expandSlot}>
                        +{overflowCount}
                      </div>
                    )}
                  </>
                )}

              </div>
            );
          })}
        </React.Fragment>
      ))}
      {marqueeRect && (
        <div
          className="calendar-marquee"
          aria-hidden
          style={{
            left: marqueeRect.left,
            top: marqueeRect.top,
            width: marqueeRect.width,
            height: marqueeRect.height,
          }}
        />
      )}
      {createMenu && (
        <CalendarGridCreateMenu
          position={createMenu.position}
          timeLabel={createMenuTimeLabel}
          canCreateTasks={canCreateTasks}
          onCreateEvent={() => triggerCreateEvent(createMenu.date, { triggeredFromCalendar: true })}
          onCreateTask={() => triggerCreateTask(createMenu.date, createMenu.date)}
          onClose={() => setCreateMenu(null)}
        />
      )}
      {stackPopover && (
        (() => {
          const stackChildren = stackPopover.childEntryKeys
            .map((entryKey): StackPopoverChild | null => {
              const lookup = entryLookup.get(entryKey);
              if (!lookup) return null;
              if (lookup.entry.type === "task") {
                return {
                  entryKey,
                  entryType: "task",
                  entry: lookup.entry.payload as CalendarTask,
                  dayKey: lookup.dayKey,
                  startMinutes: lookup.entry.startMinutes,
                  endMinutes: lookup.entry.endMinutes,
                };
              }
              if (lookup.entry.type === "event") {
                return {
                  entryKey,
                  entryType: "event",
                  entry: lookup.entry.payload as CalendarEvent,
                  dayKey: lookup.dayKey,
                  startMinutes: lookup.entry.startMinutes,
                  endMinutes: lookup.entry.endMinutes,
                };
              }
              return null;
            })
            .filter((child): child is StackPopoverChild => Boolean(child));

          const primaryChild = stackChildren[0];
          const focusBlockChild = stackChildren.find((c) => {
            if (c.entryType !== "task") return false;
            const t = c.entry as CalendarTask;
            return (
              t.kind === "focus_block" ||
              (t.focusChildTaskIds && t.focusChildTaskIds.length > 0) ||
              (t.focusChecklist && t.focusChecklist.length > 0)
            );
          });
          const editTarget = focusBlockChild ?? primaryChild;

          const canInlineRename = Boolean(
            editTarget &&
              editTarget.entryType === "task" &&
              onRenameTaskTitle &&
              (() => {
                const t = editTarget.entry as CalendarTask;
                return (
                  t.kind === "focus_block" ||
                  (t.focusChildTaskIds && t.focusChildTaskIds.length > 0) ||
                  (t.focusChecklist && t.focusChecklist.length > 0)
                );
              })(),
          );

          const focusMeter = (() => {
            const focusTask = stackChildren.find((c) => {
              if (c.entryType !== "task") return false;
              const t = c.entry as CalendarTask;
              const hasChildren =
                t.kind === "focus_block" ||
                (t.focusChildTaskIds && t.focusChildTaskIds.length > 0) ||
                (t.focusChecklist && t.focusChecklist.length > 0);
              return hasChildren;
            });
            if (!focusTask || focusTask.entryType !== "task") return null;
            const task = focusTask.entry as CalendarTask;
            const focusId = task.source?.taskId ?? task.id;
            const childIds = task.focusChildTaskIds ?? task.focusChecklist?.map((item) => item.taskId) ?? [];
            const childrenFromIds = childIds
              .map((id) => calendarTaskById.get(id))
              .filter((value): value is CalendarTask => Boolean(value));
            const childrenFromFocusId = focusId ? (focusChildrenByFocusId.get(focusId) ?? []) : [];
            const children = Array.from(
              new Map(
                [...childrenFromIds, ...childrenFromFocusId].map((childTask) => [childTask.source?.taskId ?? childTask.id, childTask]),
              ).values(),
            );
            const total = children.length;
            if (total <= 0) return null;
            const done = children.reduce((sum, child) => sum + (child.status === "done" || child.done ? 1 : 0), 0);
            return { done, total };
          })();

          return (
        <CalendarStackPopover
          anchorElement={stackPopover.anchorElement}
          kind={stackPopover.kind}
          parentId={stackPopover.parentId}
          title={stackPopover.baseTitle}
          count={stackPopover.count}
          avatars={stackPopover.avatars}
          focusMeter={focusMeter}
          projectColor={projectColor}
          children={stackChildren}
          teamMembers={teamMembers}
          childMenu={childMenu}
          setChildMenu={setChildMenu}
          onClose={handleCloseStackPopover}
          onEditTitle={() => {
            if (!editTarget) return;
            if (editTarget.entryType === "event") {
              onEditEvent(editTarget.entry as CalendarEvent);
            } else {
              onEditTask(editTarget.entry as CalendarTask);
            }
            handleCloseStackPopover();
          }}
          onRenameTitle={
            stackPopover.kind === "overlapStack"
              ? async (nextTitle) => {
                  const normalized = nextTitle.trim();
                  if (!normalized) return;
                  const key = stackPopover.titleKey;
                  if (key) {
                    // Optimistic local update
                    setLocalOverlapTitleOverrides((prev) => ({ ...prev, [key]: normalized }));
                    // Persist to backend via prop callback
                    if (onRenameOverlapStackTitle) {
                      try {
                        await onRenameOverlapStackTitle(key, normalized);
                      } catch (error) {
                        console.error("Failed to persist overlap stack title:", error);
                      }
                    }
                  }
                  setStackPopover((prev) => (prev ? { ...prev, baseTitle: normalized } : prev));
                }
              : canInlineRename
                ? async (nextTitle) => {
                    if (!editTarget || editTarget.entryType !== "task" || !onRenameTaskTitle) return;
                    await onRenameTaskTitle(editTarget.entry as CalendarTask, nextTitle);
                    setStackPopover((prev) => (prev ? { ...prev, baseTitle: nextTitle } : prev));
                  }
                : undefined
          }
          onPrimaryAction={
            stackPopover.kind === "overlapStack"
              ? (child) => {
                  // Open the clicked task/event for editing (not create a new one)
                  if (child.entryType === "event") {
                    onEditEvent(child.entry as CalendarEvent);
                  } else {
                    onEditTask(child.entry as CalendarTask);
                  }
                  handleCloseStackPopover();
                }
              : undefined
          }
          onOpenDetails={handleOpenDetailsFromStackPopover}
          onOpenContextMenu={handleOpenContextMenuFromStackPopover}
          onEditEntry={(entryType, entry) => {
            if (entryType === "event") {
              onEditEvent(entry as CalendarEvent);
            } else {
              onEditTask(entry as CalendarTask);
            }
          }}
          onDuplicateEntry={onDuplicateEntries}
          onDeleteEntry={onDeleteEntries}
        />
          );
        })()
      )}
      {popover && (
        (() => {
          const resolvedEntry = (() => {
            if (popover.entryType !== "task") return popover.entry;
            const taskId = (popover.entry as CalendarTask).id;
            return calendarTaskById.get(taskId) ?? (popover.entry as CalendarTask);
          })();

          const resolvedFocusChildren = (() => {
            if (popover.entryType !== "task") return undefined;
            const task = resolvedEntry as CalendarTask;
            const isFocusBlock =
              task.kind === "focus_block" ||
              (task.focusChildTaskIds && task.focusChildTaskIds.length > 0) ||
              (task.focusChecklist && task.focusChecklist.length > 0);
            if (!isFocusBlock) return undefined;

            const focusId = task.source?.taskId ?? task.id;
            const childIds = task.focusChildTaskIds ?? task.focusChecklist?.map((item) => item.taskId) ?? [];
            const childrenFromIds = childIds
              .map((id) => calendarTaskById.get(id))
              .filter((value): value is CalendarTask => Boolean(value));
            const childrenFromFocusId = focusId ? (focusChildrenByFocusId.get(focusId) ?? []) : [];
            const children = Array.from(
              new Map(
                [...childrenFromIds, ...childrenFromFocusId].map((childTask) => [childTask.source?.taskId ?? childTask.id, childTask]),
              ).values(),
            ).sort((a, b) => (parseTimeToMinutes(a.start) ?? 0) - (parseTimeToMinutes(b.start) ?? 0));
            return children.length ? children : undefined;
          })();

          return (
        <CalendarEntryPopover
          anchorElement={popover.anchorElement}
          entryType={popover.entryType}
          entry={resolvedEntry}
          selectedCount={selectedEntryKeys.size}
          teamMembers={teamMembers}
          focusChildren={resolvedFocusChildren}
          parentId={buildEntryParentId(popover.entryType, resolvedEntry)}
          childMenu={childMenu}
          setChildMenu={setChildMenu}
          onClose={handleClosePopover}
          onEdit={() => {
            if (popover.entryType === "event") {
              onEditEvent(popover.entry as CalendarEvent);
            } else {
              onEditTask(resolvedEntry as CalendarTask);
            }
            handleClosePopover();
          }}
          onRenameTaskTitle={onRenameTaskTitle}
          onEditFocusChild={(task) => onEditTask(task)}
          onOpenFocusChildContextMenu={handleOpenContextMenuFromFocusChild}
          onSubmitForReview={onSubmitForReview ? (tasks) => onSubmitForReview(tasks) : undefined}
          onMarkAsDone={onMarkAsDone ? (tasks) => onMarkAsDone(tasks) : undefined}
          onDuplicate={onDuplicateEntries}
          onDelete={onDeleteEntries}
        />
          );
        })()
      )}
      {contextMenu && (
        <CalendarEntryContextMenu
          position={contextMenu.position}
          entryType={contextMenu.entryType}
          entry={contextMenu.entry}
          selectedEntries={getSelectedContextMenuEntries()}
          onClose={handleCloseContextMenu}
          onEdit={(e) => {
            if (contextMenu.entryType === "event") {
              onEditEvent(e as CalendarEvent);
            } else {
              onEditTask(e as CalendarTask);
            }
            handleCloseContextMenu();
          }}
          onSubmitForReview={onSubmitForReview}
          onMarkAsDone={onMarkAsDone}
          onConvertToFocusBlock={
            contextMenu.allowConvertToFocusBlock ? onConvertToFocusBlock : undefined
          }
          onUngroupFocusBlock={onUngroupFocusBlock}
          onDuplicate={onDuplicateEntries}
          onDelete={onDeleteEntries}
        />
      )}
    </div>
  );
}

export default WeekGrid;
