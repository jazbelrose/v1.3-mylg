import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckSquare, Clock, Plus } from "lucide-react";

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
  type TimelineHourEntry,
} from "./timelineLayout";

export type WeekGridProps = {
  anchorDate: Date;
  events: CalendarEvent[];
  tasks: CalendarTask[];
  onEditEvent: (event: CalendarEvent) => void;
  onEditTask: (task: CalendarTask) => void;
  onCreateEvent: (date: Date) => void;
  onCreateTask: (date: Date) => void;
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

const WEEK_TITLE_WORD_LIMIT = 3;

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
    const entries = new Map<
      string,
      Map<number, Array<TimelineHourEntry<CalendarEvent | CalendarTask>>>
    >();

    const addEntry = (
      dayKey: string,
      entry: TimelineHourEntry<CalendarEvent | CalendarTask>,
    ) => {
      const dayMap = entries.get(dayKey) ?? new Map();
      const bucket = dayMap.get(entry.hour) ?? [];
      bucket.push(entry);
      dayMap.set(entry.hour, bucket);
      entries.set(dayKey, dayMap);
    };

    events.forEach((event) => {
      const eventDate = safeDate(event.date);
      if (!eventDate) return;
      const dayKey = fmtLocal(eventDate);
      if (!dayKeys.has(dayKey)) return;
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
    entries.forEach((hourMap, dayKey) => {
      const layoutHour = new Map<number, ReturnType<typeof assignTimelineColumns>>();
      hourMap.forEach((hourEntries, hour) => {
        if (hourEntries.length) {
          layoutHour.set(hour, assignTimelineColumns(hourEntries));
        }
      });
      layout.set(dayKey, layoutHour);
    });

    return layout;
  }, [days, events, tasks, teamMemberLookup]);

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

  const handleCreateEvent = useCallback(
    (day: Date, hour?: number) => {
      const baseDate = hour == null ? setTime(day, 9) : setTime(day, hour);
      onCreateEvent(baseDate);
      setQuickAddKey(null);
    },
    [onCreateEvent],
  );

  const handleCreateTask = useCallback(
    (day: Date) => {
      if (!canCreateTasks) return;
      onCreateTask(new Date(day));
      setQuickAddKey(null);
    },
    [canCreateTasks, onCreateTask],
  );

  return (
    <div className="week-grid" ref={gridRef}>
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
          {days.map((day) => {
            const key = fmtLocal(day);
            const dayEventBucket = eventsByDay.get(key) ?? { allDay: [] };
            const dayTaskBucket = tasksByDay.get(key) ?? { allDay: [] };
            const timelineEntries = timelineEntriesByDay.get(key)?.get(hour) ?? [];

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
                  handleCreateEvent(day, hour);
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
                {timelineEntries
                  .slice(0, expandedSlots.has(`${day.getTime()}-${hour}`) ? undefined : 2)
                  .map((entry) => {
                    const columns = Math.max(entry.columnCount, 1);
                    const hourStart = hour * MINUTES_IN_HOUR;
                    const hourEnd = hourStart + MINUTES_IN_HOUR;
                    const startWithinHour = Math.max(
                      0,
                      Math.min(MINUTES_IN_HOUR, entry.startMinutes - hourStart),
                    );
                    const entryEnd = Math.max(
                      entry.startMinutes + 1,
                      Math.min(entry.endMinutes, hourEnd),
                    );
                    const durationMinutes = Math.max(entryEnd - entry.startMinutes, 5);
                    const topPercent = (startWithinHour / MINUTES_IN_HOUR) * 100;
                    const rawHeightPercent = (durationMinutes / MINUTES_IN_HOUR) * 100;
                    const maxHeightPercent = Math.max(4, 100 - topPercent);
                    const heightPercent = Math.min(maxHeightPercent, Math.max(rawHeightPercent, 6));
                    const columnWidth = 100 / columns;
                    const entryStyle = {
                      top: `${topPercent}%`,
                      height: `${heightPercent}%`,
                      left: `calc(${columnWidth * entry.columnIndex}% + ${entry.columnIndex * 4}px)`,
                      width: `${columnWidth}%`,
                    };
                    const previewTitle = getWeekEntryPreview(entry.title);
                    const tooltipLabel = entry.timeLabel
                      ? `${entry.title} · ${entry.timeLabel}`
                      : entry.title;
                    const entryClasses = [
                      "week-grid__timeline-entry",
                      entry.type === "event"
                        ? "week-grid__timeline-entry--event"
                        : "week-grid__timeline-entry--task",
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
                    if (entry.type === "event") {
                      return (
                        <motion.div
                          key={entry.id}
                          initial={{ opacity: 0.4, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={entryClasses}
                          role="button"
                          tabIndex={0}
                          onClick={() => onEditEvent(entry.payload as CalendarEvent)}
                          onKeyDown={(keyboardEvent) => {
                            if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                              keyboardEvent.preventDefault();
                              onEditEvent(entry.payload as CalendarEvent);
                            }
                          }}
                          style={entryStyle}
                          title={tooltipLabel}
                          aria-label={tooltipLabel}
                        >
                          <div className="week-grid__timeline-entry-main">
                            {content}
                          </div>
                        </motion.div>
                      );
                    }
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className={entryClasses}
                        onClick={() => onEditTask(entry.payload as CalendarTask)}
                        style={entryStyle}
                        title={tooltipLabel}
                        aria-label={tooltipLabel}
                      >
                        <div className="week-grid__timeline-entry-main">
                          {content}
                        </div>
                      </button>
                    );
                  })}
                {timelineEntries.length > 2 && !expandedSlots.has(`${day.getTime()}-${hour}`) && (
                  <div
                    className="week-grid__overflow-pill"
                    onClick={() => setExpandedSlots((prev) => new Set(prev).add(`${day.getTime()}-${hour}`))}
                  >
                    +{timelineEntries.length - 2}
                  </div>
                )}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

export default WeekGrid;
