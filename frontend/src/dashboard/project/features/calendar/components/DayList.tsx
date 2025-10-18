import React, { useMemo } from "react";
import { CheckSquare, Clock } from "lucide-react";

import type { CalendarEvent, CalendarTask } from "../utils";
import { addHoursToTime, fmt } from "../utils";

export type DayListProps = {
  date: Date;
  events: CalendarEvent[];
  tasks: CalendarTask[];
  onEditEvent: (event: CalendarEvent) => void;
  onEditTask: (task: CalendarTask) => void;
};

function DayList({ date, events, tasks, onEditEvent, onEditTask }: DayListProps) {
  const list = useMemo(() => {
    const key = fmt(date);
    const eventItems = events
      .filter((event) => event.date === key)
      .map((event) => ({
        type: "event" as const,
        sortKey: event.start ?? "99:99",
        event,
      }));
    const taskItems = tasks
      .filter((task) => task.due === key)
      .map((task) => ({
        type: "task" as const,
        sortKey: task.time ?? "99:99",
        task,
      }));
    return [...eventItems, ...taskItems].sort((a, b) => {
      const timeCompare = a.sortKey.localeCompare(b.sortKey);
      if (timeCompare !== 0) return timeCompare;
      if (a.type === b.type) {
        const labelA = a.type === "event" ? a.event.title : a.task.title;
        const labelB = b.type === "event" ? b.event.title : b.task.title;
        return labelA.localeCompare(labelB);
      }
      return a.type === "event" ? -1 : 1;
    });
  }, [date, events, tasks]);

  if (list.length === 0) {
    return <div className="day-list__empty">No events or tasks for this day.</div>;
  }

  return (
    <div className="day-list">
      {list.map((item) => {
        if (item.type === "event") {
          const { event } = item;
          const fallbackEnd =
            event.end || (event.start ? addHoursToTime(event.start, 1) : undefined);
          return (
            <div
              key={`event-${event.id}`}
              className="day-list__item"
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
              <div className="day-list__icon-wrapper">
                <span className="day-list__icon day-list__icon--event">
                  <Clock className="day-list__icon-svg" aria-hidden />
                </span>
              </div>
              <div className="day-list__content">
                <div className="day-list__title">{event.title}</div>
                <div className="day-list__time">
                  {event.start ? (
                    fallbackEnd ? `${event.start} - ${fallbackEnd}` : event.start
                  ) : (
                    "All day"
                  )}
                </div>
                {event.description && (
                  <div className="day-list__description">{event.description}</div>
                )}
              </div>
            </div>
          );
        }

        const { task } = item;
        return (
          <div
            key={`task-${task.id}`}
            className="day-list__item day-list__item--task"
            role="button"
            tabIndex={0}
            onClick={() => onEditTask(task)}
            onKeyDown={(keyboardEvent) => {
              if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                keyboardEvent.preventDefault();
                onEditTask(task);
              }
            }}
          >
            <div className="day-list__icon-wrapper">
              <span className="day-list__icon day-list__icon--task">
                <CheckSquare className="day-list__icon-svg" aria-hidden />
              </span>
            </div>
            <div className="day-list__content">
              <div className={`day-list__title ${task.done ? "is-complete" : ""}`}>
                {task.title}
              </div>
              <div className="day-list__time">
                {task.time ? `Due ${task.time}` : "Task"}
              </div>
              {task.description && (
                <div className="day-list__description">{task.description}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default DayList;
