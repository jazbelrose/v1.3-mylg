import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckSquare, Clock, Square, Plus, ListTodo } from "lucide-react";
import { CalendarGridCreateMenu } from "./CalendarGridCreateMenu";
import {
  CalendarEntryContextMenu,
  type ContextMenuPosition,
  type ContextMenuEntry,
} from "./CalendarEntryContextMenu";
import { CalendarEntryPopover } from "./CalendarEntryPopover";

import type { CalendarEvent, CalendarTask } from "../utils";
import {
  addHoursToTime,
  fmtLocal,
  formatTimeLabel,
  safeDate,
  setTime,
  getProjectColor,
} from "../utils";
import { hexToRgba } from "@/shared/utils/colorUtils";
import type { TeamMember as ProjectTeamMember } from "@/dashboard/project/components/Shared/types";
import ProjectAvatar from "@/shared/ui/ProjectAvatar";
import {
  MINUTES_IN_HOUR,
  assignTimelineColumns,
  buildEventAvatars,
  buildTaskAvatars,
  buildTeamMemberLookup,
  parseTimeToMinutes,
  snapDateToHalfHour,
  type TimelineAvatar,
  type TimelineHourEntry,
} from "./timelineLayout";
import {
  CalendarEntryChanges,
  CalendarEntryType,
  formatTimeFromMinutes,
} from "./calendarInteractions";

export type DayGridProps = {
  date: Date;
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
  /** Assign a single time block (task with a time range) to a user */
  onAssignTimeBlock?: (task: CalendarTask, userId: string | null) => void;
  /** Assign selected time blocks (multi-select) to a user */
  onAssignTimeBlocks?: (tasks: CalendarTask[], userId: string | null) => void;
};

const parseHour = (time?: string) => {
  if (!time) return undefined;
  const [hours] = time.split(":").map(Number);
  if (Number.isNaN(hours)) return undefined;
  return hours;
};

const formatHour12 = (hour: number): string => {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
};

const HOURS_IN_DAY = 24;
const HOUR_ROW_HEIGHT_PX = 88;
const ROW_ENTRY_LIMIT = 2;
const SNAP_INTERVAL_MINUTES = 30;
const MIN_DURATION_MINUTES = SNAP_INTERVAL_MINUTES;
const RESIZE_HANDLE_THRESHOLD_PX = 10;
const MAX_MINUTES = 24 * MINUTES_IN_HOUR;

const clampMinutes = (value: number) => Math.max(0, Math.min(MAX_MINUTES, value));

const minutesToPxDay = (minutes: number) => (minutes / MINUTES_IN_HOUR) * HOUR_ROW_HEIGHT_PX;

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
const ENTRY_VERTICAL_PADDING_PX = 4;
const ENTRY_HORIZONTAL_PADDING_PX = 4;
const ENTRY_MIN_HEIGHT_PX = 24;
const ENTRY_RADIUS_PX = 12;
const COLUMN_GAP_PX = 4;
const LONG_PRESS_MS = 320;
const DRAG_THRESHOLD_PX = 6;

type InteractionMode = "drag" | "resizeTop" | "resizeBottom";

type InteractionTarget = {
  entry: TimelineHourEntry<CalendarEvent | CalendarTask>;
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
};

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

const chunkEntries = <T,>(entries: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < entries.length; index += size) {
    chunks.push(entries.slice(index, index + size));
  }
  return chunks;
};

function DayGrid({
  date,
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
  onAssignTimeBlock,
  onAssignTimeBlocks,
}: DayGridProps) {
  const key = useMemo(() => fmtLocal(date), [date]);
  const doneCount = useMemo(
    () => (hideCompleted ? (doneCountsByDay?.get(key) ?? 0) : 0),
    [doneCountsByDay, hideCompleted, key],
  );
  const hours = useMemo(() => Array.from({ length: HOURS_IN_DAY }, (_, index) => index), []);
  
  const projectColor = useMemo(
    () => getProjectColor(activeProjectId, activeProjectColor),
    [activeProjectId, activeProjectColor]
  );
  
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [expandedHours, setExpandedHours] = useState<Set<number>>(new Set());
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
  const isDraggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const [dragPreviewTransforms, setDragPreviewTransforms] = useState<
    Record<string, { translateX: number; translateY: number }>
  >({});
  const [resizePreviewTransforms, setResizePreviewTransforms] = useState<
    Record<string, { translateY: number; scaleY: number; initialHeight: number }>
  >({});
  const [isCopyMode, setIsCopyMode] = useState(false);
  const rescheduleEntriesRef = useRef(onRescheduleEntries);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    position: ContextMenuPosition;
    entryType: CalendarEntryType;
    entry: CalendarTask | CalendarEvent;
    allowConvertToFocusBlock: boolean;
  } | null>(null);

  // Popover state for single-click inspector
  const [popover, setPopover] = useState<{
    anchorElement: HTMLElement;
    entryType: CalendarEntryType;
    entry: CalendarTask | CalendarEvent;
    focusChildren?: CalendarTask[];
  } | null>(null);

  // Double-click detection refs
  const lastClickTimeRef = useRef(0);
  const lastClickedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    rescheduleEntriesRef.current = onRescheduleEntries;
  }, [onRescheduleEntries]);

  useEffect(() => {
    setDragPreviewTransforms({});
    setResizePreviewTransforms({});
  }, [events, tasks]);

  useEffect(() => {
    const scrollToNoon = () => {
      const grid = gridRef.current;
      if (!grid) return;

      const scroller = grid.closest('.calendar-view__scroller') as HTMLElement | null;
      if (scroller) {
        scroller.scrollTop = 12 * HOUR_ROW_HEIGHT_PX;
      }
    };

    const timer = setTimeout(scrollToNoon, 0);
    return () => clearTimeout(timer);
  }, [date]);

  const dayAllDayEvents = useMemo(() => {
    const allDay: CalendarEvent[] = [];
    events.forEach((event) => {
      const eventDate = safeDate(event.date);
      if (!eventDate) return;
      if (fmtLocal(eventDate) !== key) return;
      const hour = event.allDay ? undefined : parseHour(event.start);
      if (hour == null) {
        allDay.push(event);
      }
    });
    return allDay;
  }, [events, key]);

  const dayFloatingTasks = useMemo(() => {
    const floating: CalendarTask[] = [];
    tasks.forEach((task) => {
      if (!task.due) return;
      const taskDate = safeDate(task.due);
      if (!taskDate) return;
      if (fmtLocal(taskDate) !== key) return;
      const hour = parseHour(task.start);
      if (hour == null) {
        if (task.kind === "intent") return;
        if (task.focusBlockId) return;
        floating.push(task);
      }
    });
    return floating;
  }, [tasks, key]);

  // Intent items are no longer collected or rendered.
  // Per product decision, Spellbook should only create Focus Blocks.
  // Grey intent tiles broke trust (uneditable ghost records).
  const dayIntents: CalendarTask[] = [];

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

  const buildAvatarsForTaskEntry = useCallback(
    (task: CalendarTask) => {
      const direct = buildTaskAvatars(task, teamMemberLookup);
      if (direct.length > 0) return direct;

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
      const derived: ReturnType<typeof buildTaskAvatars> = [];
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
    },
    [calendarTaskById, focusChildrenByFocusId, teamMemberLookup],
  );

  const timelineEntriesByHour = useMemo(() => {
    const dayEntries: Array<TimelineHourEntry<CalendarEvent | CalendarTask>> = [];

    const pushEntry = (entry: TimelineHourEntry<CalendarEvent | CalendarTask>) => {
      dayEntries.push(entry);
    };

    events.forEach((event) => {
      const eventDate = safeDate(event.date);
      if (!eventDate) return;
      if (fmtLocal(eventDate) !== key) return;
      if (event.allDay) return;
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
      pushEntry({
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
      if (!task.due) return;
      const taskDate = safeDate(task.due);
      if (!taskDate) return;
      if (fmtLocal(taskDate) !== key) return;
      if (task.kind === "intent") return;
      if (task.focusBlockId) return;
      const startMinutes = parseTimeToMinutes(task.start);
      if (startMinutes == null) return;
      const fallbackEnd =
        task.end ?? (task.start ? addHoursToTime(task.start, 1) : undefined);
      const rawEndMinutes =
        parseTimeToMinutes(fallbackEnd) ?? startMinutes + MINUTES_IN_HOUR;
      const endMinutes = Math.max(
        startMinutes + 5,
        Math.min(rawEndMinutes, 24 * MINUTES_IN_HOUR),
      );

      const startLabel = formatTimeLabel(task.start) ?? task.start;
      const endLabel = fallbackEnd ? formatTimeLabel(fallbackEnd) ?? fallbackEnd : undefined;
      const timeLabel =
        startLabel && endLabel ? `${startLabel} - ${endLabel}` : startLabel ?? endLabel;

      const hour = Math.min(23, Math.max(0, Math.floor(startMinutes / MINUTES_IN_HOUR)));
      const isComplete = Boolean(task.done || task.status === "archived");
      pushEntry({
        id: `task-${task.id}`,
        type: "task",
        payload: task,
        title: task.title || "Untitled task",
        timeLabel,
        startMinutes,
        endMinutes,
        avatars: buildAvatarsForTaskEntry(task),
        completed: isComplete,        projectColor,        hour,
      });
    });

    const arranged = assignTimelineColumns(dayEntries);
    const layout = new Map<
      number,
      Array<
        TimelineHourEntry<CalendarEvent | CalendarTask> & { columnIndex: number; columnCount: number }
      >
    >();
    arranged.forEach((entry) => {
      if (entry.hour < 0 || entry.hour > 23) return;
      const bucket = layout.get(entry.hour) ?? [];
      bucket.push(entry);
      layout.set(entry.hour, bucket);
    });

    return layout;
  }, [events, tasks, key, teamMemberLookup]);

  const entryLookup = useMemo(() => {
    const map = new Map<string, TimelineHourEntry<CalendarEvent | CalendarTask> & { columnIndex: number; columnCount: number; }>();
    timelineEntriesByHour.forEach((entries) => {
      entries.forEach((entry) => {
        map.set(`${entry.type}:${entry.id}`, entry);
      });
    });
    return map;
  }, [timelineEntriesByHour]);

  useEffect(() => {
    const handlePointerUp = (event: PointerEvent) => {
      const state = interactionRef.current;
      if (!state) return;
      const deltaY = event.clientY - state.startY;
      const deltaMinutes = Math.round(deltaY / (HOUR_ROW_HEIGHT_PX / MINUTES_IN_HOUR));
    const dayKey = key;
      const changes: CalendarEntryChanges[] = [];

      state.targets.forEach((target) => {
        let newStart = target.startMinutes;
        let newEnd = target.endMinutes;

        if (state.mode === "drag") {
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
          finalStart !== target.startMinutes || finalEnd !== target.endMinutes;
        if (!hadChange) {
          return;
        }

        const change: CalendarEntryChanges = {
          type: target.entry.type === "event" ? "event" : "task",
          entry: target.entry.payload,
          date: dayKey,
          start: formatTimeFromMinutes(finalStart),
          end: formatTimeFromMinutes(finalEnd),
          duplicate: state.isCopyMode,
        };
        changes.push(change);
      });

      const wasDragging = isDraggingRef.current;
      interactionRef.current = null;
      setIsCopyMode(false);
      if (!changes.length) {
        setDragPreviewTransforms({});
        setResizePreviewTransforms({});
      }
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
  }, [key]);

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
        const deltaMinutes = Math.round(deltaY / (HOUR_ROW_HEIGHT_PX / MINUTES_IN_HOUR));
        const transforms: Record<string, { translateX: number; translateY: number }> = {};
        state.targets.forEach((target) => {
          transforms[`${target.entry.type}:${target.entry.id}`] = {
            translateX: 0,
            translateY: Math.round((deltaMinutes * HOUR_ROW_HEIGHT_PX) / MINUTES_IN_HOUR),
          };
        });
        setDragPreviewTransforms(transforms);
        setResizePreviewTransforms({});
      } else {
        setDragPreviewTransforms({});
        const resizeTransforms: Record<string, { translateY: number; scaleY: number; initialHeight: number }> = {};
        state.targets.forEach((target) => {
          const entryKey = `${target.entry.type}:${target.entry.id}`;
          const durationMinutes = target.endMinutes - target.startMinutes;
          const deltaMinutes = Math.round(deltaY / (HOUR_ROW_HEIGHT_PX / MINUTES_IN_HOUR));
          let newStart = target.startMinutes;
          let newEnd = target.endMinutes;
          
          if (state.mode === "resizeTop") {
            newStart = Math.max(0, Math.min(target.endMinutes - MIN_DURATION_MINUTES, target.startMinutes + deltaMinutes));
          } else if (state.mode === "resizeBottom") {
            newEnd = Math.min(MAX_MINUTES, Math.max(target.startMinutes + MIN_DURATION_MINUTES, target.endMinutes + deltaMinutes));
          }
          
          const [clampedStart, clampedEnd] = snapAndClampRange(newStart, newEnd);
          const initialHeight = target.initialHeight ?? minutesToPxDay(durationMinutes);
          const newHeight = minutesToPxDay(clampedEnd - clampedStart);
          const scaleY = Math.max(ENTRY_MIN_HEIGHT_PX / initialHeight, newHeight / initialHeight);
          
          // Calculate translateY for resizeTop to move the element up/down as it resizes
          const translateY = state.mode === "resizeTop" 
            ? minutesToPxDay(clampedStart - target.startMinutes)
            : 0;
          
          if (clampedEnd - clampedStart > 0) {
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
    (entry: TimelineHourEntry<CalendarEvent | CalendarTask>): InteractionTarget => ({
      entry,
      startMinutes: entry.startMinutes,
      endMinutes: entry.endMinutes,
    }),
    [],
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
        targets.push(createTarget(lookup));
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
      entry: TimelineHourEntry<CalendarEvent | CalendarTask>,
      pointerEvent: React.PointerEvent<HTMLElement>,
    ) => {
      if (pointerEvent.button !== 0) {
        return;
      }
      isDraggingRef.current = false;
      suppressClickRef.current = false;
      const entryKey = `${entry.type}:${entry.id}`;
      const entryType: CalendarEntryType = entry.type === "event" ? "event" : "task";
      // Both Shift AND Ctrl/Cmd toggle additive selection (Adobe pattern)
      const additive = Boolean(pointerEvent.shiftKey || pointerEvent.ctrlKey || pointerEvent.metaKey);
      onEntrySelect?.(entryType, entry.id, additive);
      // Suppress click when using modifier keys to prevent modal open
      if (additive) {
        suppressClickRef.current = true;
      }
      const baseTarget = createTarget(entry);
      const targets = gatherTargets(entryKey, baseTarget);
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
      const mode: InteractionMode =
        relativeY <= RESIZE_HANDLE_THRESHOLD_PX
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
      };
      setIsCopyMode(copyMode);
      pointerEvent.preventDefault();
    },
    [createTarget, gatherTargets, onEntrySelect],
  );

  // Close popover handler
  const handleClosePopover = useCallback(() => {
    setPopover(null);
  }, []);

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
          if (lookup.type !== "task") return;
          const selectedTask = lookup.payload as CalendarTask;
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

  // Single click: select + show popover. Double click: open edit modal.
  const handleEntryClick = useCallback(
    (clickEvent: React.MouseEvent<HTMLElement>, entry: TimelineHourEntry<CalendarEvent | CalendarTask>) => {
      if (suppressClickRef.current) {
        return;
      }
      const now = Date.now();
      const entryKey = `${entry.type}:${entry.id}`;
      const isDoubleClick =
        now - lastClickTimeRef.current < 300 && lastClickedKeyRef.current === entryKey;

      lastClickTimeRef.current = now;
      lastClickedKeyRef.current = entryKey;

      if (isDoubleClick) {
        // Double click → open edit modal
        setPopover(null);
        if (entry.type === "event") {
          onEditEvent(entry.payload as CalendarEvent);
        } else {
          onEditTask(entry.payload as CalendarTask);
        }
      } else {
        // Single click → show popover
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
              [...childrenFromIds, ...childrenFromFocusId].map((child) => [child.source?.taskId ?? child.id, child]),
            ).values(),
          ).sort((a, b) => (parseTimeToMinutes(a.start) ?? 0) - (parseTimeToMinutes(b.start) ?? 0));
          return children.length ? children : undefined;
        })();
        setPopover({
          anchorElement: clickEvent.currentTarget,
          entryType: entry.type === "event" ? "event" : "task",
          entry: entry.payload,
          focusChildren,
        });
      }
    },
    [calendarTaskById, focusChildrenByFocusId, onEditEvent, onEditTask],
  );

  // Keyboard handler for entries
  const handleEntryKeyDown = useCallback(
    (keyboardEvent: React.KeyboardEvent<HTMLElement>, entry: TimelineHourEntry<CalendarEvent | CalendarTask>) => {
      if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
        keyboardEvent.preventDefault();
        // Enter/Space opens edit modal
        if (entry.type === "event") {
          onEditEvent(entry.payload as CalendarEvent);
        } else {
          onEditTask(entry.payload as CalendarTask);
        }
      } else if (keyboardEvent.key === "Escape") {
        setPopover(null);
        setContextMenu(null);
      } else if (keyboardEvent.key === "Delete" || keyboardEvent.key === "Backspace") {
        // Delete key with popover open deletes the entry
        if (popover && onDeleteEntries) {
          onDeleteEntries([{ entryType: popover.entryType, entry: popover.entry }]);
          setPopover(null);
        }
      }
    },
    [onEditEvent, onEditTask, popover, onDeleteEntries],
  );

  // Build context menu entries from selected entries
  const getSelectedContextMenuEntries = useCallback((): ContextMenuEntry[] => {
    const result: ContextMenuEntry[] = [];
    selectedEntryKeys.forEach((key) => {
      const [type, id] = key.split(":");
      const entryType: CalendarEntryType = type === "event" ? "event" : "task";
      const lookup = entryLookup[id];
      if (lookup) {
        result.push({ entryType, entry: lookup.payload });
      }
    });
    return result;
  }, [selectedEntryKeys, entryLookup]);

  // Click on empty grid: clear selection and close popover
  const handleGridClick = useCallback(
    (clickEvent: React.MouseEvent<HTMLDivElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      const target = clickEvent.target as HTMLElement;
      // Only clear if clicking directly on the grid background, not on entries
      if (
        target.closest("[data-entry-key]") ||
        target.closest(".week-grid__quick-add-container")
      ) {
        return;
      }
      setPopover(null);
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
      const hourStr = cell.dataset.hour;
      if (!hourStr) return null;
      const hour = Number(hourStr);
      if (Number.isNaN(hour)) return null;

      const rect = cell.getBoundingClientRect();
      const ratio = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);
      const minutes = Math.min(
        Math.max(Math.round(ratio * MINUTES_IN_HOUR), 0),
        MINUTES_IN_HOUR - 1,
      );
      return setTime(date, hour, minutes);
    },
    [date],
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
      const cell = target.closest(".day-grid__cell") as HTMLElement | null;
      if (!cell) return;
      const slotDate = getSlotDateFromCell(cell, event.clientY);
      if (!slotDate) return;

      setPopover(null);
      setContextMenu(null);
      setCreateMenu({ position: { x: event.clientX, y: event.clientY }, date: slotDate });
    },
    [getSlotDateFromCell],
  );

  const handleGridContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
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
        if (entryType !== "event" && entryType !== "task") return;
        const entryKey = node.dataset.entryKey;
        if (!entryKey) return;
        const b = node.getBoundingClientRect();
        const intersects = !(
          b.right < rect.left ||
          b.left > rect.right ||
          b.bottom < rect.top ||
          b.top > rect.bottom
        );
        if (intersects) keys.add(entryKey);
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
      const cell = target.closest(".day-grid__cell") as HTMLElement | null;
      if (!cell) return;

      if (event.button === 0 && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        openCreateMenuAtEvent(event);
        return;
      }

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

      clearLongPressTimer();
      if (event.pointerType === "touch") {
        longPressTimerRef.current = setTimeout(() => {
          const state = marqueeStateRef.current;
          if (!state || state.didDrag) return;
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
        setPopover(null);
        setContextMenu(null);
        setCreateMenu(null);
        onClearSelection?.();
      }

      setMarqueeRect(null);
    },
    [clearLongPressTimer, onClearSelection, setMarqueeSelecting],
  );

  const headerLabel = useMemo(
    () =>
      date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [date],
  );

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' '),
    [],
  );

  useEffect(() => {
    if (!quickAddOpen) return undefined;
    if (typeof document === "undefined") return undefined;

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".week-grid__quick-add-container")) {
        return;
      }
      setQuickAddOpen(false);
    };

    document.addEventListener("click", handleDocumentClick);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
    };
  }, [quickAddOpen]);

  useEffect(() => {
    if (!quickAddOpen) return undefined;
    if (typeof window === "undefined") return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setQuickAddOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [quickAddOpen]);

  const triggerCreateEvent = useCallback(
    (slotDate: Date, options?: { triggeredFromCalendar?: boolean }) => {
      onCreateEvent(slotDate, options);
      setQuickAddOpen(false);
      setCreateMenu(null);
    },
    [onCreateEvent],
  );

  const triggerCreateTask = useCallback(
    (slotDate: Date, startAt?: Date) => {
      if (!canCreateTasks) return;
      const normalizedStartAt = startAt ? snapDateToHalfHour(startAt) : undefined;
      onCreateTask(slotDate, normalizedStartAt);
      setQuickAddOpen(false);
      setCreateMenu(null);
    },
    [canCreateTasks, onCreateTask],
  );

  const handleCreateEvent = useCallback(
    (hour?: number) => {
      const baseDate = hour == null ? setTime(date, 9) : setTime(date, hour);
      triggerCreateEvent(baseDate);
    },
    [date, triggerCreateEvent],
  );

  const handleCreateTask = useCallback(() => {
    triggerCreateTask(new Date(date));
  }, [date, triggerCreateTask]);

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

  const handleEntryMouseEnter = useCallback(
    (
      event: React.MouseEvent<HTMLElement>,
      entry: TimelineHourEntry<CalendarEvent | CalendarTask>,
    ) => {
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

  const handleEntryMouseLeave = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
    // Mark anchor as not hovered
    isAnchorHoverRef.current = false;

    // Clear any pending show timer
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }

    // Hover bridge: only close if BOTH anchor and tooltip are not hovered
    hoverTimerRef.current = setTimeout(() => {
      if (!isAnchorHoverRef.current && !isTooltipHoverRef.current) {
        setHoveredEntry(null);
      }
    }, 150);
    event.currentTarget.style.cursor = "";
  }, []);

  const handleContextMenu = useCallback(
    (
      event: React.MouseEvent<HTMLElement>,
      entry: TimelineHourEntry<CalendarEvent | CalendarTask>,
    ) => {
      event.preventDefault();
      event.stopPropagation();

      const eligibleSelectedTasksCount = (() => {
        if (selectedEntryKeys.size < 2) return 0;
        const eligible: CalendarTask[] = [];
        selectedEntryKeys.forEach((key) => {
          const [, id] = key.split(":");
          const lookup = entryLookup[id];
          if (!lookup) return;
          if (lookup.type !== "task") return;
          const task = lookup.payload as CalendarTask;
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
        entry: entry.payload,
        allowConvertToFocusBlock: eligibleSelectedTasksCount >= 2,
      });
    },
    [entryLookup, selectedEntryKeys],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const updateResizeCursor = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const relativeY = event.clientY - rect.top;
    const isTopHandle = relativeY <= RESIZE_HANDLE_THRESHOLD_PX;
    const isBottomHandle = relativeY >= rect.height - RESIZE_HANDLE_THRESHOLD_PX;
    const isResize = isTopHandle || isBottomHandle;
    if (isResize) {
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

  const renderTimelineEntry = (
    entry: TimelineHourEntry<CalendarEvent | CalendarTask> & {
      columnIndex: number;
      columnCount: number;
    },
    hourValue: number,
    stacked: boolean,
  ) => {
    const hourStart = hourValue * MINUTES_IN_HOUR;
    const startWithinHour = Math.max(
      0,
      Math.min(MINUTES_IN_HOUR, entry.startMinutes - hourStart),
    );
    const durationMinutes = Math.max(entry.endMinutes - entry.startMinutes, 5);
    const topPercent = (startWithinHour / MINUTES_IN_HOUR) * 100;
    const rawHeightPercent = (durationMinutes / MINUTES_IN_HOUR) * 100;
    const heightPercent = Math.max(rawHeightPercent, 6);
    const columns = Math.max(entry.columnCount, 1);
    const entryHeight = Math.max((heightPercent / 100) * HOUR_ROW_HEIGHT_PX, 32);
    const columnWidth = 100 / columns;
    const verticalPadding = ENTRY_VERTICAL_PADDING_PX;
    const horizontalPadding = ENTRY_HORIZONTAL_PADDING_PX;
    const columnSpacingAdjustment = Math.max(COLUMN_GAP_PX - horizontalPadding, 0);
    const heightWithPadding = stacked
      ? entryHeight
      : Math.max(entryHeight - verticalPadding * 2, ENTRY_MIN_HEIGHT_PX);
    const entryStyle = {
      height: `${heightWithPadding}px`,
      ...(stacked
        ? {}
        : {
            top: `calc(${topPercent}% + ${verticalPadding}px)`,
            left: `calc(${columnWidth * entry.columnIndex}% + ${entry.columnIndex * columnSpacingAdjustment}px + ${horizontalPadding}px)`,
            width: `calc(${columnWidth}% - ${horizontalPadding * 2}px)`,
          }),
    };

    const entrySelectionKey = `${entry.type}:${entry.id}`;
    const isEntrySelected = selectedEntryKeys.has(entrySelectionKey);
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

    // Render inline children for Focus Blocks (legacy layout)
    const renderFocusBlockChildren = (): React.ReactNode => {
      if (!isFocusBlock) return null;
      const task = entry.payload as CalendarTask;
      const childIds =
        task.focusChildTaskIds ?? task.focusChecklist?.map((item) => item.taskId) ?? [];
      if (childIds.length === 0) return null;
      const childTasks = childIds
        .map((id) => calendarTaskById.get(id))
        .filter((t): t is CalendarTask => !!t);
      if (childTasks.length === 0) return null;
      return (
        <ul className="week-grid__focus-children-list" aria-hidden>
          {childTasks.map((child) => {
            const kind = (child.kind ?? "").toLowerCase();
            const isEventLike = kind.includes("event");
            return (
              <li
                key={child.id}
                className={`week-grid__focus-child-item week-grid__focus-child-item--icon${
                  child.status === "done" ? " is-done" : ""
                }`}
              >
                <span className="week-grid__focus-child-icon" aria-hidden>
                  {isEventLike ? (
                    <Clock className="week-grid__focus-child-icon-svg" aria-hidden />
                  ) : (
                    <CheckSquare className="week-grid__focus-child-icon-svg" aria-hidden />
                  )}
                </span>
                {child.title}
              </li>
            );
          })}
        </ul>
      );
    };

    const avatarsToRender = isFocusBlock ? entry.avatars.slice(0, 1) : entry.avatars;
    const inlineAvatars =
      avatarsToRender.length > 0 ? (
        <div className="week-grid__timeline-entry-avatars" aria-hidden="true">
          {buildAvatarStack(avatarsToRender, "week-grid__timeline-avatar", 10, "inline")}
        </div>
      ) : null;

    const content = (
      <div className="week-grid__timeline-entry-content">
        <div className="week-grid__timeline-entry-header">
          {entry.type === "task" && (
            <span className="week-grid__timeline-entry-icon">
              {(() => {
                if (isFocusBlock) {
                  return <ListTodo className="week-grid__task-icon-svg" aria-hidden />;
                }
                return Boolean(entry.completed) ? (
                  <CheckSquare className="week-grid__task-icon-svg" aria-hidden />
                ) : (
                  <Square className="week-grid__task-icon-svg" aria-hidden />
                );
              })()}
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
            {entry.title}
          </div>
        </div>
      </div>
    );

    const pillStyle = (() => {
      const isTimeBlockTask = (() => {
        if (entry.type !== "task" || isFocusBlock) return false;
        const task = entry.payload as CalendarTask | undefined;
        return Boolean(task?.start || task?.end);
      })();

      if (entry.type === "task" && !isFocusBlock && !isTimeBlockTask) {
        return entryStyle;
      }

      const shouldUseActiveProjectTint = isFocusBlock || isTimeBlockTask;
      const color = shouldUseActiveProjectTint ? projectColor : entry.projectColor || projectColor;
      return {
        ...entryStyle,
        background: hexToRgba(color).replace(/[\d.]+\)$/, "0.18)"),
        border: `1px solid ${hexToRgba(color).replace(/[\d.]+\)$/, "0.32)")}`,
      };
    })();
    const dragTransform = dragPreviewTransforms[entrySelectionKey];
    const resizeTransform = resizePreviewTransforms[entrySelectionKey];
    const showCopyPreview = Boolean(isCopyMode && dragTransform);

    const className = [
      "week-grid__timeline-entry",
      entry.type === "event"
        ? "week-grid__timeline-entry--event"
        : "week-grid__timeline-entry--task",
      isFocusBlock ? "week-grid__timeline-entry--focus-block" : "",
      stacked ? "week-grid__timeline-entry--stacked" : "",
      isEntrySelected ? "week-grid__timeline-entry--selected" : "",
      // Only apply the copy styling to the moving preview, not the original.
      !showCopyPreview && isEntrySelected && isCopyMode && dragTransform ? "week-grid__timeline-entry--copying" : "",
    ]
      .filter(Boolean)
      .join(" ");

    let entryStyleWithPreview: React.CSSProperties = pillStyle;
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
            : "week-grid__timeline-entry--task",
          isFocusBlock ? "week-grid__timeline-entry--focus-block" : "",
          stacked ? "week-grid__timeline-entry--stacked" : "",
          isEntrySelected ? "week-grid__timeline-entry--selected" : "",
          "week-grid__timeline-entry--copying",
        ]
          .filter(Boolean)
          .join(" ")
      : "";

    if (entry.type === "event") {
      return (
        <>
          <motion.div
            key={entry.id}
            initial={stacked ? undefined : { opacity: 0.4, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={className}
            data-entry-key={entrySelectionKey}
            data-entry-type={entry.type}
            onPointerDown={(event) => handleEntryPointerDown(entry, event)}
            role="button"
            tabIndex={0}
            onClick={(event) => handleEntryClick(event, entry)}
            onContextMenu={(event) => handleContextMenu(event, entry)}
            onKeyDown={(keyboardEvent) => handleEntryKeyDown(keyboardEvent, entry)}
            style={entryStyleWithPreview}
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

    return (
      <>
        <button
          key={entry.id}
          type="button"
          className={className}
          data-entry-key={entrySelectionKey}
          data-entry-type={entry.type}
          style={entryStyleWithPreview}
          onPointerDown={(event) => handleEntryPointerDown(entry, event)}
          onClick={(event) => handleEntryClick(event, entry)}
          onContextMenu={(event) => handleContextMenu(event, entry)}
          onKeyDown={(keyboardEvent) => handleEntryKeyDown(keyboardEvent, entry)}
          onMouseMove={updateResizeCursor}
          onMouseEnter={(event) => handleEntryMouseEnter(event, entry)}
          onMouseLeave={handleEntryMouseLeave}
        >
          <div className="week-grid__timeline-entry-main">
            <div className="week-grid__timeline-entry-body">
              {content}
              {renderFocusBlockChildren()}
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
                {renderFocusBlockChildren()}
              </div>
              {inlineAvatars}
            </div>
            {focusMeter}
          </div>
        ) : null}
      </>
    );
  };

  return (
    <div
      className="day-grid"
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
      <div className="day-grid__spacer" aria-hidden />
      <div className="day-grid__header">
        <div className="day-grid__header-row">
          <div className="day-grid__header-main">
            <div className="day-grid__header-label">{headerLabel}</div>
            <div className="day-grid__header-subtitle">{timezone}</div>
          </div>
          <div className="day-grid__actions">
            <div className="week-grid__quick-add-container day-grid__quick-add">
              <button
                type="button"
                className={`week-grid__quick-add-button${quickAddOpen ? " is-open" : ""}`}
                aria-haspopup="menu"
                aria-expanded={quickAddOpen}
                aria-label={`Add to ${headerLabel}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setQuickAddOpen((current) => !current);
                }}
              >
                <Plus className="week-grid__quick-add-icon" aria-hidden />
              </button>
              <div
                className={`week-grid__quick-add-menu${quickAddOpen ? " is-visible" : ""}`}
                role="menu"
              >
                <button
                  type="button"
                  className="week-grid__quick-add-option"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCreateEvent();
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
                    handleCreateTask();
                  }}
                  disabled={!canCreateTasks}
                  role="menuitem"
                >
                  Task
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {hours.map((hour, hourIndex) => {
        const timelineEntries = timelineEntriesByHour.get(hour) ?? [];

        return (
          <React.Fragment key={hour}>
            <div className="week-grid__hour">{formatHour12(hour)}</div>
            <div
              className="week-grid__cell day-grid__cell"
              role="presentation"
              data-hour={hour}
            >
              {hourIndex === 0 &&
                (dayAllDayEvents.length > 0 || dayFloatingTasks.length > 0 || dayIntents.length > 0 || doneCount > 0) && (
                  <div className="week-grid__all-day day-grid__all-day">
                    {dayIntents.length > 0 && (
                      <div className="week-grid__intents" aria-label="Intents">
                        {dayIntents.map((task) => (
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
                    {dayAllDayEvents.map((event) => {
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
                    {dayFloatingTasks.map((task) => (
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
                          <div className="week-grid__task-header">
                            <div
                              className={`week-grid__task-title ${
                                task.done || task.status === "archived" ? "is-complete" : ""
                              }`}
                            >
                              {task.title}
                            </div>
                          </div>
                          <div className="week-grid__task-time">All day</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              {(() => {
                const entryRows = chunkEntries(timelineEntries, ROW_ENTRY_LIMIT);
                const isExpanded = expandedHours.has(hour);
                const overflowCount = Math.max(timelineEntries.length - ROW_ENTRY_LIMIT, 0);
                if (isExpanded) {
                  return (
                    <div className="week-grid__timeline-rows">
                      {entryRows.map((row, rowIndex) => {
                        const sortedRow = [...row].sort(
                          (a, b) => a.columnIndex - b.columnIndex,
                        );
                        return (
                          <div key={`${hour}-row-${rowIndex}`} className="week-grid__timeline-row">
                            {sortedRow.map((entry) => renderTimelineEntry(entry, hour, true))}
                          </div>
                        );
                      })}
                      {timelineEntries.length > ROW_ENTRY_LIMIT && (
                        <div
                          className="week-grid__collapse-pill"
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedHours((prev) => {
                              const next = new Set(prev);
                              next.delete(hour);
                              return next;
                            });
                          }}
                        >
                          Show less
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <>
                    {timelineEntries.slice(0, ROW_ENTRY_LIMIT).map((entry) =>
                      renderTimelineEntry(entry, hour, false),
                    )}
                    {overflowCount > 0 && (
                      <div
                        className="week-grid__overflow-pill"
                        onClick={() => setExpandedHours((prev) => new Set(prev).add(hour))}
                      >
                        +{overflowCount}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </React.Fragment>
        );
      })}
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
      {contextMenu && (
        <CalendarEntryContextMenu
          position={contextMenu.position}
          entryType={contextMenu.entryType}
          entry={contextMenu.entry}
          selectedEntries={getSelectedContextMenuEntries()}
          teamMembers={teamMembers}
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
          onAssignTimeBlock={onAssignTimeBlock}
          onAssignTimeBlocks={onAssignTimeBlocks}
        />
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
                [...childrenFromIds, ...childrenFromFocusId].map((child) => [child.source?.taskId ?? child.id, child]),
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
          onAssignTimeBlock={onAssignTimeBlock}
          onAssignTimeBlocks={onAssignTimeBlocks}
        />
          );
        })()
      )}
    </div>
  );
}

export default DayGrid;
