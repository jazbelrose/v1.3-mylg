import React, { useMemo, useState } from "react";
import { Calendar as CalendarIcon, CheckSquare, Clock, Pencil, User2 } from "lucide-react";

import type { CalendarEvent, CalendarTask } from "../utils";
import { compareDateStrings, formatTimeLabel, parseIsoDate, fmt } from "../utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  createTaskStatusContext,
  getTaskStatusBadge,
  normalizeTask as normalizeQuickTask,
  formatStatusLabel,
  type QuickTask,
} from "@/dashboard/project/components/Tasks/components/quickTaskUtils";
import { formatAssigneeDisplay } from "@/dashboard/project/components/Tasks/utils";

export type EventsAndTasksProps = {
  events: CalendarEvent[];
  tasks: CalendarTask[];
  onToggleTask: (id: string) => void;
  onEditEvent: (event: CalendarEvent) => void;
  onEditTask: (task: CalendarTask) => void;
  onOpenTasksOverview: () => void;
};

function EventsAndTasks({
  events,
  tasks,
  onToggleTask,
  onEditEvent,
  onEditTask,
  onOpenTasksOverview,
}: EventsAndTasksProps) {
  const upcoming = useMemo(
    () =>
      [...events]
        .filter((event) => event.date >= fmt(new Date()))
        .sort((a, b) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          return compareDateStrings(a.start, b.start);
        })
        .slice(0, 6),
    [events],
  );

  const statusContext = useMemo(() => createTaskStatusContext(), []);
  const compactDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
      }),
    [],
  );
  const scheduleDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    [],
  );

  const [activeTaskPopoverId, setActiveTaskPopoverId] = useState<string | null>(null);

  return (
    <div className="events-tasks">
      <div className="events-tasks__title">Events & Tasks</div>

      <div className="events-tasks__section">
        <div className="events-tasks__section-title">Upcoming events</div>
        <ul className="events-tasks__list">
          {upcoming.map((event) => {
            const eventDate = parseIsoDate(event.date);
            const badgeLabel = eventDate ? compactDateFormatter.format(eventDate) : event.date;
            const scheduleLabel = eventDate ? scheduleDateFormatter.format(eventDate) : undefined;
            const startLabel = event.allDay ? "All day" : formatTimeLabel(event.start);
            const endLabel = event.allDay ? undefined : formatTimeLabel(event.end);
            const timeLabel = event.allDay
              ? "All day"
              : startLabel && endLabel
                ? `${startLabel} – ${endLabel}`
                : startLabel ?? undefined;

            return (
              <li key={event.id} className="events-tasks__list-item">
                <div
                  role="button"
                  tabIndex={0}
                  className="events-tasks__card events-tasks__card--event"
                  onClick={() => onEditEvent(event)}
                  onKeyDown={(keyboardEvent) => {
                    if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                      keyboardEvent.preventDefault();
                      onEditEvent(event);
                    }
                  }}
                >
                  <div className="events-tasks__card-header">
                    <span className="events-tasks__card-title" title={event.title}>
                      {event.title}
                    </span>
                    <span className="events-tasks__status-badge events-tasks__status-badge--neutral">
                      {badgeLabel}
                    </span>
                  </div>
                  <div className="events-tasks__card-meta">
                    {scheduleLabel ? (
                      <span className="events-tasks__meta-chip">
                        <CalendarIcon size={12} aria-hidden />
                        <span>{scheduleLabel}</span>
                      </span>
                    ) : null}
                    {timeLabel ? (
                      <span className="events-tasks__meta-chip">
                        <Clock size={12} aria-hidden />
                        <span>{timeLabel}</span>
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
          {upcoming.length === 0 && (
            <li className="events-tasks__empty">No upcoming events scheduled.</li>
          )}
        </ul>
      </div>

      <div className="events-tasks__section">
        <div className="events-tasks__section-header">
          <div className="events-tasks__section-title">Tasks</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="events-tasks__map-pill"
            onClick={onOpenTasksOverview}
          >
            Open map view
          </Button>
        </div>
        <ul className="events-tasks__list">
          {tasks.map((task) => {
            const quickTask = normalizeQuickTask(task.source);
            const isDone = Boolean(task.done);
            const fallbackStatus = (task.status ?? (isDone ? "done" : "todo")) as QuickTask["status"];
            const statusValue = quickTask?.status ?? fallbackStatus;
            const dueDate = quickTask?.dueDate ?? parseIsoDate(task.due);
            const statusData = getTaskStatusBadge(statusValue, dueDate, statusContext);
            const displayStatusLabel =
              statusData.label === formatStatusLabel(statusValue)
                ? statusData.label
                : `${statusData.label} · ${formatStatusLabel(statusValue)}`;
            const dueLabel = dueDate ? scheduleDateFormatter.format(dueDate) : undefined;
            const timeLabel = formatTimeLabel(task.time);
            const assignedLabel = quickTask?.assignedTo
              ? formatAssigneeDisplay(quickTask.assignedTo)
              : formatAssigneeDisplay(task.assignedTo);
            const isPopoverOpen = activeTaskPopoverId === task.id;
            const toggleLabel = isDone ? "Mark as not done" : "Mark as done";

            return (
              <li key={task.id} className="events-tasks__list-item">
                <div
                  role="button"
                  tabIndex={0}
                  className={`events-tasks__card events-tasks__card--task${isDone ? " is-complete" : ""}`}
                  onClick={() => onEditTask(task)}
                  onKeyDown={(keyboardEvent) => {
                    if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                      keyboardEvent.preventDefault();
                      onEditTask(task);
                    }
                  }}
                >
                  <div className="events-tasks__card-header">
                    <span className="events-tasks__card-title" title={task.title}>
                      {task.title}
                    </span>
                    <Popover
                      open={isPopoverOpen}
                      onOpenChange={(open) => {
                        setActiveTaskPopoverId(open ? task.id : null);
                      }}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={`events-tasks__status-badge events-tasks__status-badge--${statusData.category} events-tasks__status-trigger`}
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                        >
                          {displayStatusLabel}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="events-tasks__status-popover"
                        align="end"
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                      >
                        <button
                          type="button"
                          className="events-tasks__status-action"
                          onClick={() => {
                            setActiveTaskPopoverId(null);
                            onToggleTask(task.id);
                          }}
                        >
                          <CheckSquare size={14} aria-hidden />
                          <span>{toggleLabel}</span>
                        </button>
                        <button
                          type="button"
                          className="events-tasks__status-action"
                          onClick={() => {
                            setActiveTaskPopoverId(null);
                            onEditTask(task);
                          }}
                        >
                          <Pencil size={14} aria-hidden />
                          <span>Open task</span>
                        </button>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="events-tasks__card-meta">
                    {dueLabel ? (
                      <span className="events-tasks__meta-chip">
                        <CalendarIcon size={12} aria-hidden />
                        <span>
                          Due {dueLabel}
                          {timeLabel ? ` · ${timeLabel}` : ""}
                        </span>
                      </span>
                    ) : null}
                    {assignedLabel ? (
                      <span className="events-tasks__meta-chip">
                        <User2 size={12} aria-hidden />
                        <span>{assignedLabel}</span>
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
          {tasks.length === 0 && (
            <li className="events-tasks__empty">
              No tasks yet. Add tasks to keep track of work.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

export default EventsAndTasks;
