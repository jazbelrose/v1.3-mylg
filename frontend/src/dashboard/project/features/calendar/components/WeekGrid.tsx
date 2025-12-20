import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckSquare, Clock, Plus } from "lucide-react";
import ProjectAvatar from "@/shared/ui/ProjectAvatar";
import { TimelineTooltipPortal } from "./TimelineTooltipPortal";

import type { CalendarEvent, CalendarTask } from "../utils";
import {
  addDays,
  addHoursToTime,
  fmtLocal,
  formatTimeLabel,
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
  onEditEvent: (event: CalendarEvent) => void;
  onEditTask: (task: CalendarTask) => void;
  onCreateEvent: (date: Date, options?: { triggeredFromCalendar?: boolean }) => void;
  onCreateTask: (date: Date, startAt?: Date) => void;
  canCreateTasks: boolean;
  teamMembers?: ProjectTeamMember[];
  activeProjectId?: string | null;
  activeProjectColor?: string | null;
  selectedEntryKeys: Set<string>;
  onEntrySelect?: (type: CalendarEntryType, id: string, additive: boolean) => void;
  onRescheduleEntries?: (changes: CalendarEntryChanges[]) => void;
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
const ENTRY_MIN_HEIGHT_PX = 24;

// Convert minute deltas to pixels for resize operations
const minutesToPxWeek = (minutes: number) => (minutes / MINUTES_IN_HOUR) * WEEK_ROW_HEIGHT_PX;

const clampMinutes = (value: number) => Math.max(0, Math.min(MAX_MINUTES, value));

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
  entry: TimelineHourEntry<CalendarEvent | CalendarTask>;
  dayKey: string;
  dayIndex: number;
  startMinutes: number;
  endMinutes: number;
};

type InteractionState = {
  mode: InteractionMode;
  startX: number;
  startY: number;
  targets: InteractionTarget[];
  duplicate: boolean;
  startDayIndex: number;
};

const QUICK_ADD_POPOVER_WIDTH = 200;
const QUICK_ADD_POPOVER_HEIGHT = 140;
const QUICK_ADD_POPOVER_OFFSET = 12;
const QUICK_ADD_POPOVER_MARGIN = 8;
const WEEK_GRID_SPACER_PX = 60;

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
  onEditEvent,
  onEditTask,
  onCreateEvent,
  onCreateTask,
  canCreateTasks,
  teamMembers,
  activeProjectId,
  activeProjectColor,
  selectedEntryKeys,
  onEntrySelect,
  onRescheduleEntries,
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
  const [pointerQuickAdd, setPointerQuickAdd] = useState<
    | {
        date: Date;
        clientX: number;
        clientY: number;
      }
    | null
  >(null);
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
  const resizePreviewStylesRef = useRef<Record<string, true>>({});
  const applyResizePreview = useCallback((entryKey: string, top: number, height: number) => {
    const element = document.querySelector(
      `[data-entry-key="${entryKey}"]`,
    ) as HTMLElement | null;
    if (!element) return;
    resizePreviewStylesRef.current[entryKey] = true;
    element.style.top = `${top}px`;
    element.style.height = `${Math.max(height, ENTRY_MIN_HEIGHT_PX)}px`;
  }, []);
  const clearResizePreviews = useCallback(() => {
    Object.keys(resizePreviewStylesRef.current).forEach((entryKey) => {
      const element = document.querySelector(
        `[data-entry-key="${entryKey}"]`,
      ) as HTMLElement | null;
      if (!element) return;
      element.style.top = "";
      element.style.height = "";
    });
    resizePreviewStylesRef.current = {};
  }, []);
  const isDraggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const rescheduleEntriesRef = useRef(onRescheduleEntries);

  useEffect(() => {
    rescheduleEntriesRef.current = onRescheduleEntries;
  }, [onRescheduleEntries]);

  useEffect(() => {
    setDragPreviewTransforms({});
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
    });
    return map;
  }, [days, tasks]);

  const teamMemberLookup = useMemo(
    () => buildTeamMemberLookup(teamMembers ?? []),
    [teamMembers],
  );

  const timelineEntriesByDay = useMemo(() => {
    const dayKeys = new Set(days.map((day) => fmtLocal(day)));
    const entriesByDay = new Map<
      string,
      Array<TimelineHourEntry<CalendarEvent | CalendarTask>>
    >();

    const addEntry = (
      dayKey: string,
      entry: TimelineHourEntry<CalendarEvent | CalendarTask>,
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
      if (!task.due) return;
      const taskDate = safeDate(task.due);
      if (!taskDate) return;
      const dayKey = fmtLocal(taskDate);
      if (!dayKeys.has(dayKey)) return;
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
      addEntry(dayKey, {
        id: `task-${task.id}`,
        type: "task",
        payload: task,
        title: task.title || "Untitled task",
        timeLabel,
        startMinutes,
        endMinutes,
        avatars: buildTaskAvatars(task, teamMemberLookup),
        completed: isComplete,
        hour,
      });
    });

    const layout = new Map<string, Map<number, ReturnType<typeof assignTimelineColumns>>>();
    entriesByDay.forEach((dayEntries, dayKey) => {
      if (!dayEntries.length) {
        return;
      }
      const arranged = assignTimelineColumns(dayEntries);
      const layoutHour = new Map<number, ReturnType<typeof assignTimelineColumns>>();
      arranged.forEach((entry) => {
        const bucket = layoutHour.get(entry.hour) ?? [];
        bucket.push(entry);
        layoutHour.set(entry.hour, bucket);
      });
      layout.set(dayKey, layoutHour);
    });

    return layout;
  }, [days, events, tasks, teamMemberLookup]);

  const entryLookup = useMemo(() => {
    const map = new Map<
      string,
      { entry: TimelineHourEntry<CalendarEvent | CalendarTask>; dayKey: string }
    >();
    timelineEntriesByDay.forEach((hourMap, dayKey) => {
      hourMap.forEach((entries) => {
        entries.forEach((entry) => {
          map.set(`${entry.type}:${entry.id}`, { entry, dayKey });
        });
      });
    });
    return map;
  }, [timelineEntriesByDay]);

  useEffect(() => {
    const handlePointerUp = (event: PointerEvent) => {
      const state = interactionRef.current;
      if (!state) return;
      const grid = gridRef.current;
      const gridRect = grid?.getBoundingClientRect();
      const spacer = grid?.querySelector(".week-grid__spacer") as HTMLElement | null;
      
      // Validate spacer width measurement - fallback to 60px if measurement fails
      let spacerWidth = spacer?.getBoundingClientRect().width ?? 60;
      // Ensure spacer width is reasonable (CSS defines 60px)
      if (spacerWidth < 40 || spacerWidth > 100) {
        spacerWidth = 60;
      }
      
      const columnWidth =
        gridRect && days.length > 0 ? (gridRect.width - spacerWidth) / days.length : 0;
      const weekdayEls = grid
        ? (Array.from(grid.querySelectorAll(".week-grid__weekday")) as HTMLDivElement[])
        : [];
      let dropDayIndex = state.startDayIndex;

      if (weekdayEls.length === days.length) {
        const hitIndex = weekdayEls.findIndex((element) => {
          const rect = element.getBoundingClientRect();
          return event.clientX >= rect.left && event.clientX <= rect.right;
        });
        if (hitIndex !== -1) {
          dropDayIndex = hitIndex;
        } else if (weekdayEls.length > 0) {
          const firstRect = weekdayEls[0].getBoundingClientRect();
          const lastRect = weekdayEls[weekdayEls.length - 1].getBoundingClientRect();
          if (event.clientX < firstRect.left) {
            dropDayIndex = 0;
          } else if (event.clientX > lastRect.right) {
            dropDayIndex = weekdayEls.length - 1;
          }
        }
      } else if (columnWidth > 0 && gridRect) {
        const relativeX = event.clientX - (gridRect.left + spacerWidth);
        
        // Clamp relativeX to valid range (0 to total columns width)
        const maxX = gridRect.width - spacerWidth;
        const clampedX = Math.max(0, Math.min(maxX, relativeX));
        
        // Calculate drop day index from clamped position
        dropDayIndex = Math.floor(clampedX / columnWidth);
        // Double-check bounds
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
          entry: target.entry.payload,
          date: fmtLocal(days[newDayIndex]),
          start: formatTimeFromMinutes(finalStart),
          end: formatTimeFromMinutes(finalEnd),
          duplicate: state.duplicate && target.entry.type === "task",
        };
        changes.push(change);
      });

      const wasDragging = isDraggingRef.current;
      interactionRef.current = null;
      clearResizePreviews();
      if (!changes.length) {
        setDragPreviewTransforms({});
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
        const result = onReschedule(changes);
        if (result && typeof (result as Promise<unknown>).catch === "function") {
          (result as Promise<unknown>).catch(() => {
            setDragPreviewTransforms({});
          });
        }
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
        state.targets.forEach((target) => {
          transforms[`${target.entry.type}:${target.entry.id}`] = {
            translateX: deltaX,
            translateY: deltaY,
          };
        });
        setDragPreviewTransforms(transforms);
        clearResizePreviews();
      } else {
        setDragPreviewTransforms({});
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
          const [clampedStart, clampedEnd] = snapAndClampRange(newStart, newEnd);
          const topChangePx = minutesToPxWeek(clampedStart - target.startMinutes);
          const durationChangePx = minutesToPxWeek((clampedEnd - clampedStart) - durationMinutes);
          const newTop = (target.initialTop ?? 0) + topChangePx;
          const newHeight = (target.initialHeight ?? 0) + durationChangePx;
          if (clampedEnd - clampedStart > 0) {
            applyResizePreview(entryKey, newTop, newHeight);
          }
        });
      }
    };

    document.addEventListener("pointermove", handlePointerMove);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
    };
  }, [applyResizePreview, clearResizePreviews]);

  const createTarget = useCallback(
    (entry: TimelineHourEntry<CalendarEvent | CalendarTask>, dayKey: string): InteractionTarget => ({
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
      entry: TimelineHourEntry<CalendarEvent | CalendarTask>,
      dayKey: string,
      pointerEvent: React.PointerEvent<HTMLElement>,
    ) => {
      if (pointerEvent.button !== 0) {
        return;
      }
      isDraggingRef.current = false;
      suppressClickRef.current = false;
      const entryKey = `${entry.type}:${entry.id}`;
      const entryType: CalendarEntryType = entry.type === "event" ? "event" : "task";
      const additive = Boolean(pointerEvent.ctrlKey || pointerEvent.metaKey);
      onEntrySelect?.(entryType, entry.id, additive);
      const baseTarget = createTarget(entry, dayKey);
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

      interactionRef.current = {
        mode,
        startX: pointerEvent.clientX,
        startY: pointerEvent.clientY,
        targets,
        duplicate: additive,
        startDayIndex: baseTarget.dayIndex,
      };
      pointerEvent.preventDefault();
    },
    [createTarget, gatherTargets, onEntrySelect],
  );

  const handleEntryMouseEnter = useCallback(
    (
      event: React.MouseEvent<HTMLElement>,
      entry: TimelineHourEntry<CalendarEvent | CalendarTask>,
    ) => {
      setPointerQuickAdd(null);
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
  }, [setPointerQuickAdd]);

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

  const renderWeekTimelineEntry = (
    entry: TimelineHourEntry<CalendarEvent | CalendarTask>,
    dayKey: string,
    entryStyle?: React.CSSProperties,
    stacked = false,
    entryKeyOverride?: string,
  ) => {
    const entrySelectionKey = `${entry.type}:${entry.id}`;
    const isEntrySelected = selectedEntryKeys.has(entrySelectionKey);
    const previewTitle = getWeekEntryPreview(entry.title);
    const tooltipLabel = entry.timeLabel ? `${entry.title} · ${entry.timeLabel}` : entry.title;
    const inlineAvatars =
      entry.avatars.length > 0 ? (
        <div className="week-grid__timeline-entry-avatars" aria-hidden="true">
          {buildAvatarStack(entry.avatars, "week-grid__timeline-avatar", 10, "inline")}
        </div>
      ) : null;
    const entryClasses = [
      "week-grid__timeline-entry",
      entry.type === "event"
        ? "week-grid__timeline-entry--event"
        : "week-grid__timeline-entry--task",
      stacked ? "week-grid__timeline-entry--stacked" : "",
      isEntrySelected ? "week-grid__timeline-entry--selected" : "",
    ]
      .filter(Boolean)
      .join(" ");
    
    const color = entry.projectColor || projectColor;
    const pillStyle = {
      ...entryStyle,
      background: hexToRgba(color).replace(/[\d.]+\)$/, '0.18)'),
      border: `1px solid ${hexToRgba(color).replace(/[\d.]+\)$/, '0.32)')}`,
    };
    const previewTransform = dragPreviewTransforms[entrySelectionKey];
    const entryStyleWithPreview = previewTransform
      ? {
          ...pillStyle,
          transform: `translate(${previewTransform.translateX}px, ${previewTransform.translateY}px)`,
          transition: "none",
          zIndex: 2,
        }
      : pillStyle;
    const content = (
      <div className="week-grid__timeline-entry-content">
        <div className="week-grid__timeline-entry-header">
          {entry.type === "task" && (
            <span className="week-grid__timeline-entry-icon">
              <CheckSquare className="week-grid__task-icon-svg" aria-hidden />
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

    if (entry.type === "event") {
      return (
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
          onClick={() => {
            if (suppressClickRef.current) {
              return;
            }
            onEditEvent(entry.payload as CalendarEvent);
          }}
          onKeyDown={(keyboardEvent) => {
            if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
              keyboardEvent.preventDefault();
              onEditEvent(entry.payload as CalendarEvent);
            }
          }}
          onMouseMove={updateResizeCursor}
          onMouseEnter={(event) => handleEntryMouseEnter(event, entry)}
          onMouseLeave={handleEntryMouseLeave}
        >
          <div className="week-grid__timeline-entry-main">
            {content}
            {inlineAvatars}
          </div>
        </motion.div>
      );
    }

    return (
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
        onClick={() => {
          if (suppressClickRef.current) {
            return;
          }
          onEditTask(entry.payload as CalendarTask);
        }}
        onMouseMove={updateResizeCursor}
        onMouseEnter={(event) => handleEntryMouseEnter(event, entry)}
        onMouseLeave={handleEntryMouseLeave}
      >
        <div className="week-grid__timeline-entry-main">
          {content}
          {inlineAvatars}
        </div>
      </button>
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
      setPointerQuickAdd(null);
    },
    [onCreateEvent],
  );

  const triggerCreateTask = useCallback(
    (date: Date, startAt?: Date) => {
      if (!canCreateTasks) return;
      const normalizedStartAt = startAt ? snapDateToHalfHour(startAt) : undefined;
      onCreateTask(date, normalizedStartAt);
      setQuickAddKey(null);
      setPointerQuickAdd(null);
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

  const openPointerQuickAdd = useCallback(
    (day: Date, hour: number, mouseEvent: React.MouseEvent<HTMLDivElement>) => {
      const cell = mouseEvent.currentTarget;
      const rect = cell.getBoundingClientRect();
      const ratio = Math.min(
        Math.max((mouseEvent.clientY - rect.top) / rect.height, 0),
        1,
      );
      const minutes = Math.min(
        Math.max(Math.round(ratio * MINUTES_IN_HOUR), 0),
        MINUTES_IN_HOUR - 1,
      );
      const slotDate = setTime(day, hour, minutes);
      setPointerQuickAdd({
        date: slotDate,
        clientX: mouseEvent.clientX,
        clientY: mouseEvent.clientY,
      });
    },
    [],
  );

  useEffect(() => {
    if (!pointerQuickAdd) return undefined;

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".week-grid__action-popover")) {
        return;
      }
      setPointerQuickAdd(null);
    };

    document.addEventListener("mousedown", handleDocumentClick);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
    };
  }, [pointerQuickAdd]);

  const quickAddPopoverStyle = useMemo(() => {
    if (!pointerQuickAdd) return undefined;
    const grid = gridRef.current;
    const width = QUICK_ADD_POPOVER_WIDTH;
    const height = QUICK_ADD_POPOVER_HEIGHT;
    const gridRect = grid?.getBoundingClientRect();
    const relativeTop = pointerQuickAdd.clientY - (gridRect?.top ?? 0);
    const relativeLeft = pointerQuickAdd.clientX - (gridRect?.left ?? 0) - width / 2;
    const gridHeight = grid?.clientHeight ?? window.innerHeight;
    const gridWidth = grid?.clientWidth ?? window.innerWidth;
    const maxTop =
      gridHeight - height - QUICK_ADD_POPOVER_MARGIN;
    const maxLeft =
      gridWidth - width - QUICK_ADD_POPOVER_MARGIN;
    return {
      position: "absolute",
      top: Math.min(
        Math.max(relativeTop + QUICK_ADD_POPOVER_OFFSET, QUICK_ADD_POPOVER_MARGIN),
        Math.max(maxTop, QUICK_ADD_POPOVER_MARGIN),
      ),
      left: Math.min(
        Math.max(relativeLeft, QUICK_ADD_POPOVER_MARGIN),
        Math.max(maxLeft, QUICK_ADD_POPOVER_MARGIN),
      ),
    };
  }, [pointerQuickAdd]);

  const snappedPointerDate = useMemo(
    () => (pointerQuickAdd ? snapDateToHalfHour(pointerQuickAdd.date) : null),
    [pointerQuickAdd],
  );

  const quickAddTimeLabel = useMemo(
    () =>
      snappedPointerDate
        ? snappedPointerDate.toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })
        : "",
    [snappedPointerDate],
  );

  return (
    <div className="week-grid" ref={gridRef}>
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
            const timelineEntries = timelineEntriesByDay.get(key)?.get(hour) ?? [];
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

            return (
                <div
                  key={`${key}-${hour}`}
                  className="week-grid__cell"
                  role="presentation"
                  onClick={(mouseEvent) => {
                    const target = mouseEvent.target as HTMLElement | null;
                    if (!target) return;
                    if (
                      target.closest(".week-grid__timeline-entry") ||
                      target.closest(".week-grid__all-day") ||
                      target.closest(".week-grid__quick-add-container") ||
                      target.closest(".week-grid__overflow-pill")
                    ) {
                      return;
                    }
                    openPointerQuickAdd(day, hour, mouseEvent);
                  }}
                >
                {hourIndex === 0 &&
                  (dayEventBucket.allDay.length > 0 || dayTaskBucket.allDay.length > 0) && (
                    <div className="week-grid__all-day">
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
                      {dayTaskBucket.allDay.map((task) => (
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
                      const horizontalPadding = 4;
                      const columnSpacingAdjustment = 0;
                      const entryStyle = {
                        top: `${topPercent}%`,
                        height: `${heightPercent}%`,
                        left: `calc(${columnWidth * entry.columnIndex}% + ${entry.columnIndex * columnSpacingAdjustment}px + ${horizontalPadding}px)`,
                        width: `calc(${columnWidth}% - ${horizontalPadding * 2}px)`,
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
      {pointerQuickAdd && (
        <div
          className="week-grid__action-popover"
          role="dialog"
          aria-label="Quick add calendar entry"
          style={quickAddPopoverStyle}
        >
          <div className="week-grid__action-popover-time" aria-hidden>
            {quickAddTimeLabel}
          </div>
          <button
            type="button"
            className="week-grid__action-popover-option"
            onClick={() =>
              triggerCreateEvent(pointerQuickAdd.date, { triggeredFromCalendar: true })
            }
          >
            Event
          </button>
          <button
            type="button"
            className="week-grid__action-popover-option week-grid__action-popover-option--task"
            onClick={() => triggerCreateTask(pointerQuickAdd.date, pointerQuickAdd.date)}
            disabled={!canCreateTasks}
          >
            Task
          </button>
        </div>
      )}
      {hoveredEntry && (
        <TimelineTooltipPortal
          anchorElement={hoveredEntry.anchorElement}
          avatars={hoveredEntry.avatars}
          timeText={hoveredEntry.timeText}
          title={hoveredEntry.title}
          onClose={handleTooltipClose}
          onTooltipHover={handleTooltipHover}
        />
      )}
    </div>
  );
}

export default WeekGrid;
