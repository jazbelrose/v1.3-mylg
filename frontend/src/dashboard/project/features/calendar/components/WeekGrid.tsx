import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckSquare, Plus } from "lucide-react";

import type { CalendarEvent, CalendarTask } from "../utils";
import {
  addDays,
  addHoursToTime,
  categoryColor,
  fmtLocal,
  pad,
  safeDate,
  setTime,
} from "../utils";

export type WeekGridProps = {
  anchorDate: Date;
  events: CalendarEvent[];
  tasks: CalendarTask[];
  onEditEvent: (event: CalendarEvent) => void;
  onEditTask: (task: CalendarTask) => void;
  onCreateEvent: (date: Date) => void;
  onCreateTask: (date: Date) => void;
  canCreateTasks: boolean;
};

type WeekDayEvents = {
  allDay: CalendarEvent[];
  timed: CalendarEvent[];
};

type WeekDayTasks = {
  allDay: CalendarTask[];
  timed: Map<number, CalendarTask[]>;
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

function WeekGrid({
  anchorDate,
  events,
  tasks,
  onEditEvent,
  onEditTask,
  onCreateEvent,
  onCreateTask,
  canCreateTasks,
}: WeekGridProps) {
  const start = useMemo(() => addDays(anchorDate, -anchorDate.getDay()), [anchorDate]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []); // 24-hour day

  const [quickAddKey, setQuickAddKey] = useState<string | null>(null);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, WeekDayEvents>();
    days.forEach((day) => {
      map.set(fmtLocal(day), { allDay: [], timed: [] });
    });
    events.forEach((event) => {
      // Normalize event.date to match map keys format
      const eventDate = safeDate(event.date);
      if (!eventDate) return;
      const eventKey = fmtLocal(eventDate);
      const bucket = map.get(eventKey);
      if (!bucket) return;
      const hour = parseHour(event.start);
      if (hour == null) {
        bucket.allDay.push(event);
      } else {
        bucket.timed.push(event);
      }
    });
    return map;
  }, [days, events]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, WeekDayTasks>();
    days.forEach((day) => {
      map.set(fmtLocal(day), { allDay: [], timed: new Map() });
    });
    tasks.forEach((task) => {
      if (!task.due) return;
      // Normalize task.due to match map keys format
      const taskDate = safeDate(task.due);
      if (!taskDate) return;
      const taskKey = fmtLocal(taskDate);
      const bucket = map.get(taskKey);
      if (!bucket) return;
      const hour = parseHour(task.start);
      if (hour == null) {
        bucket.allDay.push(task);
        return;
      }
      const timedBucket = bucket.timed.get(hour);
      if (timedBucket) {
        timedBucket.push(task);
      } else {
        bucket.timed.set(hour, [task]);
      }
    });
    map.forEach((bucket) => {
      Array.from(bucket.timed.values()).forEach((timedBucket) =>
        timedBucket.sort((a, b) => (a.start ?? "").localeCompare(b.start ?? "")),
      );
    });
    return map;
  }, [days, tasks]);

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
    <div className="week-grid">
      <div className="week-grid__spacer" />
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
            const dayEvents = eventsByDay.get(key) ?? { allDay: [], timed: [] };
            const dayTasks = tasksByDay.get(key) ?? { allDay: [], timed: new Map() };
            const timed = dayEvents.timed.filter(
              (event) => parseHour(event.start) === hour,
            );
            const timedTasks = dayTasks.timed.get(hour) ?? [];
            return (
              <div
                key={`${key}-${hour}`}
                className="week-grid__cell"
                role="presentation"
                onClick={(mouseEvent) => {
                  const target = mouseEvent.target as HTMLElement | null;
                  if (!target) return;
                  if (
                    target.closest(".week-grid__event") ||
                    target.closest(".week-grid__task") ||
                    target.closest(".week-grid__all-day-pill") ||
                    target.closest(".week-grid__quick-add-container")
                  ) {
                    return;
                  }
                  handleCreateEvent(day, hour);
                }}
              >
                {hourIndex === 0 && (dayEvents.allDay.length > 0 || dayTasks.allDay.length > 0) && (
                  <div className="week-grid__all-day">
                    {dayEvents.allDay.map((event) => (
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
                    {dayTasks.allDay.map((task) => (
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
                          <div className={`week-grid__task-title ${(task.done || task.status === 'archived') ? "is-complete" : ""}`}>
                            {task.title}
                          </div>
                          <div className="week-grid__task-time">All day</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {timed.map((event) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0.4, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`week-grid__event ${categoryColor[event.category]}`}
                    onClick={() => onEditEvent(event)}
                    onKeyDown={(keyboardEvent) => {
                      if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                        keyboardEvent.preventDefault();
                        onEditEvent(event);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="week-grid__event-title">{event.title}</div>
                    <div className="week-grid__event-time">
                      {event.start} – {event.end || addHoursToTime(event.start!, 1)}
                    </div>
                    </motion.div>
                ))}
                {timedTasks.map((task) => (
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
                      <div className={`week-grid__task-title ${(task.done || task.status === 'archived') ? "is-complete" : ""}`}>
                        {task.title}
                      </div>
                      {task.start ? (
                        <div className="week-grid__task-time">
                          {task.start}
                          {task.end ? ` - ${task.end}` : ""}
                        </div>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

export default WeekGrid;
