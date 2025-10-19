import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckSquare, Plus } from "lucide-react";

import type { CalendarEvent, CalendarTask } from "../utils";
import {
  addDays,
  addHoursToTime,
  categoryColor,
  fmt,
  pad,
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

const parseHour = (time?: string) => {
  if (!time) return undefined;
  const [h] = time.split(":").map(Number);
  if (Number.isNaN(h)) return undefined;
  return h;
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
  const hours = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 7), []); // 7am - 6pm

  const [quickAddKey, setQuickAddKey] = useState<string | null>(null);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, WeekDayEvents>();
    days.forEach((day) => {
      map.set(fmt(day), { allDay: [], timed: [] });
    });
    events.forEach((event) => {
      const bucket = map.get(event.date);
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
    const map = new Map<string, CalendarTask[]>();
    days.forEach((day) => {
      map.set(fmt(day), []);
    });
    tasks.forEach((task) => {
      if (!task.due) return;
      const bucket = map.get(task.due);
      if (!bucket) return;
      bucket.push(task);
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
        const key = fmt(day);
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
          <div className="week-grid__hour">{pad(hour)}:00</div>
          {days.map((day) => {
            const key = fmt(day);
            const dayEvents = eventsByDay.get(key) ?? { allDay: [], timed: [] };
            const dayTasks = tasksByDay.get(key) ?? [];
            const timed = dayEvents.timed.filter(
              (event) => parseHour(event.start) === hour,
            );
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
                {hourIndex === 0 && (dayEvents.allDay.length > 0 || dayTasks.length > 0) && (
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
                    {dayTasks.map((task) => (
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
                          <div className={`week-grid__task-title ${task.done ? "is-complete" : ""}`}>
                            {task.title}
                          </div>
                          {task.time && (
                            <div className="week-grid__task-time">{task.time}</div>
                          )}
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
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

export default WeekGrid;
