import React, { useEffect, useMemo, useState } from "react";
import { CheckSquare, Clock, Plus } from "lucide-react";

import type { CalendarEvent, CalendarTask } from "../utils";
import { getMonthMatrix, fmt, isSameDay } from "../utils";

export type MonthGridProps = {
  viewDate: Date;
  selectedDate: Date;
  events: CalendarEvent[];
  tasks: CalendarTask[];
  onSelectDate: (d: Date) => void;
  onOpenCreate: (d: Date) => void;
  onOpenQuickTask: (d: Date) => void;
  canCreateTasks: boolean;
  onEditEvent: (event: CalendarEvent) => void;
  onEditTask: (task: CalendarTask) => void;
};

function MonthGrid({
  viewDate,
  selectedDate,
  events,
  tasks,
  onSelectDate,
  onOpenCreate,
  onOpenQuickTask,
  canCreateTasks,
  onEditEvent,
  onEditTask,
}: MonthGridProps) {
  const days = useMemo(() => getMonthMatrix(viewDate), [viewDate]);
  const month = viewDate.getMonth();
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((event) => {
      if (!map.has(event.date)) map.set(event.date, []);
      map.get(event.date)!.push(event);
    });
    return map;
  }, [events]);
  const tasksByDate = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();
    tasks.forEach((task) => {
      if (!task.due) return;
      if (!map.has(task.due)) map.set(task.due, []);
      map.get(task.due)!.push(task);
    });
    return map;
  }, [tasks]);

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [quickAddKey, setQuickAddKey] = useState<string | null>(null);

  useEffect(() => {
    if (!quickAddKey) return;

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".month-grid__quick-add-container")) {
        return;
      }
      setQuickAddKey(null);
    };

    document.addEventListener("click", handleDocumentClick);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
    };
  }, [quickAddKey]);

  const handleMouseLeave = (key: string) => {
    setHoveredKey((current) => (current === key ? null : current));
  };

  const handleOpenCreate = (day: Date) => {
    onSelectDate(day);
    onOpenCreate(day);
    setQuickAddKey(null);
  };

  const handleOpenQuickAdd = (day: Date) => {
    const key = fmt(day);
    onSelectDate(day);
    setQuickAddKey(key);
  };

  const handleOpenQuickTask = (day: Date) => {
    onSelectDate(day);
    onOpenQuickTask(day);
    setQuickAddKey(null);
  };

  const weekdayLabels = useMemo(() => "SUN,MON,TUE,WED,THU,FRI,SAT".split(","), []);

  return (
    <div className="month-grid">
      <div className="month-grid__header">
        {weekdayLabels.map((label) => (
          <div key={label} className="month-grid__weekday">
            {label}
          </div>
        ))}
      </div>
      <div className="month-grid__body">
        {days.map((day) => {
          const isCurrentMonth = day.getMonth() === month;
          const key = fmt(day);
          const isSelected = isSameDay(day, selectedDate);
          const dayEvents = eventsByDate.get(key) || [];
          const dayTasks = tasksByDate.get(key) || [];
          const combined = [
            ...dayEvents.map((event) => ({
              type: "event" as const,
              sortKey: event.start ?? "99:99",
              event,
            })),
            ...dayTasks.map((task) => ({
              type: "task" as const,
              sortKey: task.time ?? "99:99",
              task,
            })),
          ].sort((a, b) => {
            const timeCompare = a.sortKey.localeCompare(b.sortKey);
            if (timeCompare !== 0) return timeCompare;
            if (a.type === b.type) {
              const titleA = a.type === "event" ? a.event.title : a.task.title;
              const titleB = b.type === "event" ? b.event.title : b.task.title;
              return titleA.localeCompare(titleB);
            }
            return a.type === "event" ? -1 : 1;
          });

          const visible = combined.slice(0, 4);
          const remaining = combined.length - visible.length;

          const className = [
            "month-grid__cell",
            isCurrentMonth ? "is-current" : "is-outside",
            isSelected ? "is-selected" : "",
          ]
            .filter(Boolean)
            .join(" ");

          const isHovered = hoveredKey === key;

          return (
            <div
              key={key}
              className={`${className}${isHovered ? " is-hovered" : ""}`.trim()}
              onMouseEnter={() => setHoveredKey(key)}
              onMouseLeave={() => handleMouseLeave(key)}
              onClick={() => handleOpenQuickAdd(day)}
              role="presentation"
            >
              <button type="button" className="month-grid__date">
                {day.getDate()}
              </button>
              <div className="month-grid__events">
              {visible.map((item) => {
                if (item.type === "event") {
                  const { event } = item;
                  return (
                    <div
                      key={`event-${event.id}`}
                      className="month-grid__event"
                      role="button"
                      tabIndex={0}
                      onClick={(mouseEvent) => {
                        mouseEvent.stopPropagation();
                        onEditEvent(event);
                      }}
                      onKeyDown={(keyboardEvent) => {
                        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                          keyboardEvent.preventDefault();
                          onEditEvent(event);
                        }
                      }}
                    >
                      <span className="month-grid__item-icon month-grid__item-icon--event">
                        <Clock className="month-grid__item-icon-svg" aria-hidden />
                      </span>
                      <span className="month-grid__event-title" title={event.title}>
                        {event.title}
                      </span>
                    </div>
                  );
                }

                const { task } = item;
                return (
                  <div
                    key={`task-${task.id}`}
                    className="month-grid__event month-grid__event--task"
                    role="button"
                    tabIndex={0}
                    onClick={(mouseEvent) => {
                      mouseEvent.stopPropagation();
                      onEditTask(task);
                    }}
                    onKeyDown={(keyboardEvent) => {
                      if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                        keyboardEvent.preventDefault();
                        onEditTask(task);
                      }
                    }}
                  >
                    <span className="month-grid__item-icon month-grid__item-icon--task">
                      <CheckSquare className="month-grid__item-icon-svg" aria-hidden />
                    </span>
                    <span
                      className={`month-grid__event-title ${task.done ? "is-complete" : ""}`}
                      title={task.title}
                    >
                      {task.title}
                    </span>
                  </div>
                );
              })}
              {remaining > 0 && <div className="month-grid__more">+{remaining} more</div>}
            </div>
            <div className="month-grid__quick-add-container">
              <button
                type="button"
                className={`month-grid__quick-add${quickAddKey === key ? " is-open" : ""}`}
                aria-label="Add calendar item"
                onClick={(event) => {
                  event.stopPropagation();
                  setQuickAddKey((current) => (current === key ? null : key));
                }}
              >
                <Plus className="month-grid__quick-add-icon" aria-hidden />
              </button>
              <div
                className={`month-grid__quick-add-tooltip${
                  quickAddKey === key ? " is-visible" : ""
                }`}
                role="menu"
                aria-hidden={quickAddKey === key ? undefined : true}
              >
                <button
                  type="button"
                  className="month-grid__quick-add-option"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleOpenCreate(day);
                  }}
                >
                  Event
                </button>
                <button
                  type="button"
                  className="month-grid__quick-add-option month-grid__quick-add-option--task"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleOpenQuickTask(day);
                  }}
                  disabled={!canCreateTasks}
                >
                  Task
                </button>
              </div>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

export default MonthGrid;
