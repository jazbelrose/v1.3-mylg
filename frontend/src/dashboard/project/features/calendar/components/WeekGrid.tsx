import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckSquare, Clock, Plus } from "lucide-react";
import ProjectAvatar from "@/shared/ui/ProjectAvatar";

import type { CalendarEvent, CalendarTask } from "../utils";
import {
  addDays,
  addHoursToTime,
  categoryColor,
  fmtLocal,
  formatTimeLabel,
  safeDate,
  setTime,
} from "../utils";
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

export type WeekGridProps = {
  anchorDate: Date;
  events: CalendarEvent[];
  tasks: CalendarTask[];
  onEditEvent: (event: CalendarEvent) => void;
  onEditTask: (task: CalendarTask) => void;
  onCreateEvent: (date: Date) => void;
  onCreateTask: (date: Date, startAt?: Date) => void;
  canCreateTasks: boolean;
  teamMembers?: ProjectTeamMember[];
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

const QUICK_ADD_POPOVER_WIDTH = 200;
const QUICK_ADD_POPOVER_HEIGHT = 140;
const QUICK_ADD_POPOVER_OFFSET = 12;
const QUICK_ADD_POPOVER_MARGIN = 8;

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
}: WeekGridProps) {
  const start = useMemo(() => addDays(anchorDate, -anchorDate.getDay()), [anchorDate]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []); // 24-hour day

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
  const gridRef = useRef<HTMLDivElement>(null);

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
        colorClass: categoryColor[event.category],
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

  const renderWeekTimelineEntry = (
    entry: TimelineHourEntry<CalendarEvent | CalendarTask>,
    entryStyle?: React.CSSProperties,
    stacked = false,
    entryKey?: string,
  ) => {
    const previewTitle = getWeekEntryPreview(entry.title);
    const tooltipLabel = entry.timeLabel ? `${entry.title} · ${entry.timeLabel}` : entry.title;
    const inlineAvatars =
      entry.avatars.length > 0 ? (
        <div className="week-grid__timeline-entry-avatars" aria-hidden="true">
          {buildAvatarStack(entry.avatars, "week-grid__timeline-avatar", 10, "inline")}
        </div>
      ) : null;
    const tooltipAvatars =
      entry.avatars.length > 0 ? (
        <div className="week-grid__timeline-tooltip-avatars" aria-hidden="true">
          {buildAvatarStack(entry.avatars, "week-grid__timeline-tooltip-avatar", 14, "tooltip")}
        </div>
      ) : null;
    const tooltipTimeText =
      entry.timeLabel ?? (entry.type === "event" ? "All day" : "Scheduled task");
    const tooltipContent = (
      <div className="week-grid__timeline-entry-tooltip" role="tooltip">
        {tooltipAvatars}
        <div className="week-grid__timeline-tooltip-time">{tooltipTimeText}</div>
        <div className="week-grid__timeline-tooltip-title">{entry.title}</div>
      </div>
    );
    const entryClasses = [
      "week-grid__timeline-entry",
      entry.type === "event"
        ? "week-grid__timeline-entry--event"
        : "week-grid__timeline-entry--task",
      stacked ? "week-grid__timeline-entry--stacked" : "",
      entry.colorClass ?? "",
    ]
      .filter(Boolean)
      .join(" ");
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
    const resolvedKey = entryKey ?? entry.id;

    if (entry.type === "event") {
      return (
        <motion.div
          key={resolvedKey}
          initial={stacked ? undefined : { opacity: 0.4, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className={entryClasses}
          style={stacked ? undefined : entryStyle}
          title={tooltipLabel}
          aria-label={tooltipLabel}
          role="button"
          tabIndex={0}
          onClick={() => onEditEvent(entry.payload as CalendarEvent)}
          onKeyDown={(keyboardEvent) => {
            if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
              keyboardEvent.preventDefault();
              onEditEvent(entry.payload as CalendarEvent);
            }
          }}
        >
          <div className="week-grid__timeline-entry-main">
            {content}
            {inlineAvatars}
          </div>
          {tooltipContent}
        </motion.div>
      );
    }

    return (
      <button
        key={resolvedKey}
        type="button"
        className={entryClasses}
        style={stacked ? undefined : entryStyle}
        title={tooltipLabel}
        aria-label={tooltipLabel}
        onClick={() => onEditTask(entry.payload as CalendarTask)}
      >
        <div className="week-grid__timeline-entry-main">
          {content}
          {inlineAvatars}
        </div>
        {tooltipContent}
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
    (date: Date) => {
      onCreateEvent(date);
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
                      {dayEventBucket.allDay.map((event) => (
                        <div
                          key={event.id}
                          className={`week-grid__all-day-pill ${categoryColor[event.category]}`}
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
                      ))}
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
                        {renderWeekTimelineEntry(entry, undefined, true)}
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
                      return renderWeekTimelineEntry(entry, entryStyle, false, entry.id);
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
            onClick={() => triggerCreateEvent(pointerQuickAdd.date)}
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
    </div>
  );
}

export default WeekGrid;
