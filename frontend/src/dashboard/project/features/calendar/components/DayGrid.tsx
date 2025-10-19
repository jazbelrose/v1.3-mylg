import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckSquare, Plus } from "lucide-react";

import type { CalendarEvent, CalendarTask } from "../utils";
import { addHoursToTime, categoryColor, fmt, pad, setTime } from "../utils";

export type DayGridProps = {
  date: Date;
  events: CalendarEvent[];
  tasks: CalendarTask[];
  onEditEvent: (event: CalendarEvent) => void;
  onEditTask: (task: CalendarTask) => void;
  onCreateEvent: (date: Date) => void;
  onCreateTask: (date: Date) => void;
  canCreateTasks: boolean;
};

const parseHour = (time?: string) => {
  if (!time) return undefined;
  const [hours] = time.split(":").map(Number);
  if (Number.isNaN(hours)) return undefined;
  return hours;
};

const HOURS_IN_DAY = 24;

function DayGrid({
  date,
  events,
  tasks,
  onEditEvent,
  onEditTask,
  onCreateEvent,
  onCreateTask,
  canCreateTasks,
}: DayGridProps) {
  const key = useMemo(() => fmt(date), [date]);
  const hours = useMemo(() => Array.from({ length: HOURS_IN_DAY }, (_, index) => index), []);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const dayEvents = useMemo(() => {
    const allDay: CalendarEvent[] = [];
    const timed = new Map<number, CalendarEvent[]>();

    events.forEach((event) => {
      if (event.date !== key) return;
      const hour = event.allDay ? undefined : parseHour(event.start);
      if (hour == null) {
        allDay.push(event);
        return;
      }

      const bucket = timed.get(hour);
      if (bucket) {
        bucket.push(event);
      } else {
        timed.set(hour, [event]);
      }
    });

    Array.from(timed.values()).forEach((bucket) =>
      bucket.sort((a, b) => (a.start ?? "").localeCompare(b.start ?? "")),
    );

    return { allDay, timed };
  }, [events, key]);

  const dayTasks = useMemo(() => {
    const floating: CalendarTask[] = [];
    const timed = new Map<number, CalendarTask[]>();

    tasks.forEach((task) => {
      if (task.due !== key) return;
      const hour = parseHour(task.time);
      if (hour == null) {
        floating.push(task);
        return;
      }

      const bucket = timed.get(hour);
      if (bucket) {
        bucket.push(task);
      } else {
        timed.set(hour, [task]);
      }
    });

    Array.from(timed.values()).forEach((bucket) =>
      bucket.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")),
    );

    return { floating, timed };
  }, [tasks, key]);

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
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
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

  const handleCreateEvent = useCallback(
    (hour?: number) => {
      const baseDate = hour == null ? setTime(date, 9) : setTime(date, hour);
      onCreateEvent(baseDate);
      setQuickAddOpen(false);
    },
    [date, onCreateEvent],
  );

  const handleCreateTask = useCallback(() => {
    if (!canCreateTasks) return;
    onCreateTask(new Date(date));
    setQuickAddOpen(false);
  }, [canCreateTasks, date, onCreateTask]);

  return (
    <div className="day-grid">
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
        const timedEvents = dayEvents.timed.get(hour) ?? [];
        const timedTasks = dayTasks.timed.get(hour) ?? [];

        return (
          <React.Fragment key={hour}>
            <div className="week-grid__hour">{pad(hour)}:00</div>
            <div
              className="week-grid__cell day-grid__cell"
              role="presentation"
              onClick={(mouseEvent) => {
                const target = mouseEvent.target as HTMLElement | null;
                if (!target) return;
                if (
                  target.closest(".week-grid__event") ||
                  target.closest(".week-grid__task") ||
                  target.closest(".week-grid__all-day") ||
                  target.closest(".day-grid__all-day") ||
                  target.closest(".week-grid__quick-add-container")
                ) {
                  return;
                }
                handleCreateEvent(hour);
              }}
            >
              {hourIndex === 0 && (dayEvents.allDay.length > 0 || dayTasks.floating.length > 0) && (
                <div className="week-grid__all-day day-grid__all-day">
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
                  {dayTasks.floating.map((task) => (
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
                        <div className="week-grid__task-time">
                          {task.time ? `Due ${task.time}` : "Task"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {timedEvents.map((event) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0.4, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`week-grid__event ${categoryColor[event.category]}`}
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
                  <div className="week-grid__event-time">
                    {event.start ?? ""}
                    {event.start && " – "}
                    {event.end || (event.start ? addHoursToTime(event.start, 1) : "")}
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
                    <div className={`week-grid__task-title ${task.done ? "is-complete" : ""}`}>
                      {task.title}
                    </div>
                    {task.time && <div className="week-grid__task-time">Due {task.time}</div>}
                  </div>
                </button>
              ))}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default DayGrid;
