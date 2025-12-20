import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckSquare, Clock, Plus } from "lucide-react";
import { TimelineTooltipPortal } from "./TimelineTooltipPortal";

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
const COLUMN_GAP_PX = 4;
const QUICK_ADD_POPOVER_WIDTH = 200;
const QUICK_ADD_POPOVER_HEIGHT = 140;
const QUICK_ADD_POPOVER_OFFSET = 12;
const QUICK_ADD_POPOVER_MARGIN = 8;

type InteractionMode = "drag" | "resizeTop" | "resizeBottom";

type InteractionTarget = {
  entry: TimelineHourEntry<CalendarEvent | CalendarTask>;
  startMinutes: number;
  endMinutes: number;
};

type InteractionState = {
  mode: InteractionMode;
  startX: number;
  startY: number;
  targets: InteractionTarget[];
  duplicate: boolean;
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
}: DayGridProps) {
  const key = useMemo(() => fmtLocal(date), [date]);
  const hours = useMemo(() => Array.from({ length: HOURS_IN_DAY }, (_, index) => index), []);
  
  const projectColor = useMemo(
    () => getProjectColor(activeProjectId, activeProjectColor),
    [activeProjectId, activeProjectColor]
  );
  
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [expandedHours, setExpandedHours] = useState<Set<number>>(new Set());
  const [pointerQuickAdd, setPointerQuickAdd] = useState<{
    date: Date;
    clientX: number;
    clientY: number;
  } | null>(null);
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
  const rescheduleEntriesRef = useRef(onRescheduleEntries);

  useEffect(() => {
    rescheduleEntriesRef.current = onRescheduleEntries;
  }, [onRescheduleEntries]);

  useEffect(() => {
    setDragPreviewTransforms({});
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
        floating.push(task);
      }
    });
    return floating;
  }, [tasks, key]);

  const teamMemberLookup = useMemo(
    () => buildTeamMemberLookup(teamMembers ?? []),
    [teamMembers],
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
        avatars: buildTaskAvatars(task, teamMemberLookup),
        completed: isComplete,        projectColor,        hour,
      });
    });

    const arranged = assignTimelineColumns(dayEntries);
    const layout = new Map<number, ReturnType<typeof assignTimelineColumns>>();
    arranged.forEach((entry) => {
      if (entry.hour < 0 || entry.hour > 23) return;
      const bucket = layout.get(entry.hour) ?? [];
      bucket.push(entry);
      layout.set(entry.hour, bucket);
    });

    return layout;
  }, [events, tasks, key, teamMemberLookup]);

  const entryLookup = useMemo(() => {
    const map = new Map<string, TimelineHourEntry<CalendarEvent | CalendarTask>>();
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
        clearResizePreviews();
      } else {
        setDragPreviewTransforms({});
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
          const topChangePx = minutesToPxDay(clampedStart - target.startMinutes);
          const durationChangePx = minutesToPxDay((clampedEnd - clampedStart) - durationMinutes);
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
      const additive = Boolean(pointerEvent.ctrlKey || pointerEvent.metaKey);
      onEntrySelect?.(entryType, entry.id, additive);
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

      interactionRef.current = {
        mode,
        startX: pointerEvent.clientX,
        startY: pointerEvent.clientY,
        targets,
        duplicate: additive,
      };
      pointerEvent.preventDefault();
    },
    [createTarget, gatherTargets, onEntrySelect],
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
      setPointerQuickAdd(null);
    },
    [onCreateEvent],
  );

  const triggerCreateTask = useCallback(
    (slotDate: Date, startAt?: Date) => {
      if (!canCreateTasks) return;
      const normalizedStartAt = startAt ? snapDateToHalfHour(startAt) : undefined;
      onCreateTask(slotDate, normalizedStartAt);
      setQuickAddOpen(false);
      setPointerQuickAdd(null);
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

  const openPointerQuickAdd = useCallback(
    (hourValue: number, mouseEvent: React.MouseEvent<HTMLDivElement>) => {
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
      const slotDate = setTime(date, hourValue, minutes);
      setPointerQuickAdd({
        date: slotDate,
        clientX: mouseEvent.clientX,
        clientY: mouseEvent.clientY,
      });
    },
    [date],
  );

  useEffect(() => {
    if (!pointerQuickAdd) return undefined;
    if (typeof document === "undefined") return undefined;

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".day-grid__action-popover")) {
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
  }, [setPointerQuickAdd]);

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

    const inlineAvatars =
      entry.avatars.length > 0 ? (
        <div className="week-grid__timeline-entry-avatars" aria-hidden="true">
          {buildAvatarStack(entry.avatars, "week-grid__timeline-avatar", 10, "inline")}
        </div>
      ) : null;

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
            {entry.title}
          </div>
        </div>
      </div>
    );

    const className = [
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

    if (entry.type === "event") {
      return (
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
          style={entryStyleWithPreview}
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
        key={entry.id}
        type="button"
        className={className}
        data-entry-key={entrySelectionKey}
        data-entry-type={entry.type}
        style={entryStyleWithPreview}
        onPointerDown={(event) => handleEntryPointerDown(entry, event)}
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

  return (
    <div className="day-grid" ref={gridRef}>
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
              onClick={(mouseEvent) => {
                const target = mouseEvent.target as HTMLElement | null;
                if (!target) return;
                if (
                  target.closest(".week-grid__timeline-entry") ||
                  target.closest(".week-grid__all-day") ||
                  target.closest(".day-grid__all-day") ||
                  target.closest(".week-grid__quick-add-container") ||
                  target.closest(".week-grid__overflow-pill")
                ) {
                  return;
                }
                openPointerQuickAdd(hour, mouseEvent);
              }}
            >
              {hourIndex === 0 &&
                (dayAllDayEvents.length > 0 || dayFloatingTasks.length > 0) && (
                  <div className="week-grid__all-day day-grid__all-day">
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
      {pointerQuickAdd && (
        <div
          className="day-grid__action-popover"
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

export default DayGrid;
