import React, { useMemo, useState } from "react";
import { Calendar as CalendarIcon, CheckSquare, Clock, Pencil } from "lucide-react";

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

function formatInitials(value?: string): string | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const tokens = trimmed
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase());

  if (tokens.length === 0) {
    const fallback = trimmed.slice(0, 2).toUpperCase();
    return fallback || undefined;
  }

  return tokens.join("").slice(0, 3) || undefined;
}

export type EventsAndTasksProps = {
  events: CalendarEvent[];
  tasks: CalendarTask[];
  onToggleTask: (id: string) => void;
  onEditEvent: (event: CalendarEvent) => void;
  onEditTask: (task: CalendarTask) => void;
  onOpenTasksOverview: () => void;
};

type EventFilter = "all" | "upcoming" | "past";
type TaskFilter = "all" | "open" | "completed";

const DEFAULT_EVENT_FILTER: EventFilter = "upcoming";
const DEFAULT_TASK_FILTER: TaskFilter = "open";

const EVENT_FILTER_LABELS: Record<EventFilter, string> = {
  all: "All events",
  upcoming: "Upcoming events",
  past: "Past events",
};

const EVENT_FILTER_SUMMARY: Record<EventFilter, string> = {
  all: "All events",
  upcoming: "Upcoming",
  past: "Past",
};

const TASK_FILTER_LABELS: Record<TaskFilter, string> = {
  all: "All tasks",
  open: "Open tasks",
  completed: "Completed tasks",
};

const TASK_FILTER_SUMMARY: Record<TaskFilter, string> = {
  all: "All tasks",
  open: "Open",
  completed: "Completed",
};

function EventsAndTasks({
  events,
  tasks,
  onToggleTask,
  onEditEvent,
  onEditTask,
  onOpenTasksOverview,
}: EventsAndTasksProps) {
  const [eventFilter, setEventFilter] = useState<EventFilter>(DEFAULT_EVENT_FILTER);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>(DEFAULT_TASK_FILTER);
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);

  const sortedEvents = useMemo(
    () =>
      [...events].sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return compareDateStrings(a.start, b.start);
      }),
    [events],
  );

  const filteredEvents = useMemo(() => {
    if (eventFilter === "all") {
      return sortedEvents;
    }

    const today = fmt(new Date());
    return sortedEvents.filter((event) => {
      if (eventFilter === "upcoming") {
        return event.date >= today;
      }
      return event.date < today;
    });
  }, [eventFilter, sortedEvents]);

  const normalizedTasks = useMemo(
    () =>
      tasks.map((task) => ({
        task,
        quickTask: normalizeQuickTask(task.source),
      })),
    [tasks],
  );

  const filteredTasks = useMemo(() => {
    return normalizedTasks.filter(({ task, quickTask }) => {
      if (taskFilter === "all") {
        return true;
      }

      const rawStatus = quickTask?.status ?? task.status ?? (task.done ? "done" : "todo");
      const normalizedStatus = typeof rawStatus === "string" ? rawStatus.trim().toLowerCase() : "";
      const isCompleted =
        Boolean(task.done) ||
        normalizedStatus === "done" ||
        normalizedStatus === "completed" ||
        normalizedStatus === "complete";

      if (taskFilter === "completed") {
        return isCompleted;
      }

      return !isCompleted;
    });
  }, [normalizedTasks, taskFilter]);

  const hasActiveFilters = eventFilter !== "all" || taskFilter !== "all";
  const filterButtonLabel = hasActiveFilters
    ? `${EVENT_FILTER_SUMMARY[eventFilter]} · ${TASK_FILTER_SUMMARY[taskFilter]}`
    : "Filter";
  const filterButtonAriaLabel = hasActiveFilters
    ? `Filtering by ${EVENT_FILTER_LABELS[eventFilter]} and ${TASK_FILTER_LABELS[taskFilter]}`
    : "Filter events and tasks";

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
      <div className="events-tasks__header">
        <div className="events-tasks__header-row events-tasks__header-row--primary">
          <div className="events-tasks__title">Events & Tasks</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="events-tasks__map-pill"
            onClick={onOpenTasksOverview}
          >
            Open Map
          </Button>
        </div>
        <div className="events-tasks__header-row events-tasks__header-row--secondary">
          <Popover open={isFilterPopoverOpen} onOpenChange={setIsFilterPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`events-tasks__filter-trigger${hasActiveFilters ? " is-active" : ""}`}
                aria-haspopup="menu"
                aria-expanded={isFilterPopoverOpen}
                aria-label={filterButtonAriaLabel}
              >
                <span className="events-tasks__filter-dot" aria-hidden />
                <span className="events-tasks__filter-label">{filterButtonLabel}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="events-tasks__filter-popover"
              align="end"
              side="right"
              sideOffset={8}
            >
              <div className="events-tasks__filter-section">
                <div className="events-tasks__filter-heading">Events</div>
                <div className="events-tasks__filter-options" role="group" aria-label="Filter events">
                  {(Object.keys(EVENT_FILTER_LABELS) as EventFilter[]).map((option) => {
                    const isActive = eventFilter === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        className={`events-tasks__filter-option${isActive ? " is-active" : ""}`}
                        onClick={() => setEventFilter(option)}
                        aria-pressed={isActive}
                      >
                        {EVENT_FILTER_LABELS[option]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="events-tasks__filter-section">
                <div className="events-tasks__filter-heading">Tasks</div>
                <div className="events-tasks__filter-options" role="group" aria-label="Filter tasks">
                  {(Object.keys(TASK_FILTER_LABELS) as TaskFilter[]).map((option) => {
                    const isActive = taskFilter === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        className={`events-tasks__filter-option${isActive ? " is-active" : ""}`}
                        onClick={() => setTaskFilter(option)}
                        aria-pressed={isActive}
                      >
                        {TASK_FILTER_LABELS[option]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="events-tasks__filter-footer">
                <button
                  type="button"
                  className="events-tasks__filter-reset"
                  onClick={() => {
                    setEventFilter(DEFAULT_EVENT_FILTER);
                    setTaskFilter(DEFAULT_TASK_FILTER);
                  }}
                  disabled={!hasActiveFilters}
                >
                  Reset filters
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="events-tasks__content">
        <div className="events-tasks__section">
          <div className="events-tasks__section-header">
            <div className="events-tasks__section-title">{EVENT_FILTER_LABELS[eventFilter]}</div>
            <div className="events-tasks__section-count" aria-live="polite">
              {filteredEvents.length} {filteredEvents.length === 1 ? "event" : "events"}
            </div>
          </div>
          <ul className="events-tasks__list">
            {filteredEvents.map((event) => {
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
                      <div className="events-tasks__meta-group">
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
                  </div>
                </li>
              );
            })}
            {filteredEvents.length === 0 && (
              <li className="events-tasks__empty">
                {events.length === 0
                  ? "No events scheduled."
                  : "No events match the current filters."}
              </li>
            )}
          </ul>
        </div>

        <div className="events-tasks__section">
          <div className="events-tasks__section-header">
            <div className="events-tasks__section-title">{TASK_FILTER_LABELS[taskFilter]}</div>
            <div className="events-tasks__section-count" aria-live="polite">
              {filteredTasks.length} {filteredTasks.length === 1 ? "task" : "tasks"}
            </div>
          </div>
          <ul className="events-tasks__list">
            {filteredTasks.map(({ task, quickTask }) => {
              const rawStatus = quickTask?.status ?? task.status ?? (task.done ? "done" : "todo");
              const statusValue = rawStatus as QuickTask["status"];
              const dueDate = quickTask?.dueDate ?? parseIsoDate(task.due);
              const statusData = getTaskStatusBadge(statusValue, dueDate, statusContext);
              const formattedStatusLabel = formatStatusLabel(statusValue);
              const displayStatusLabel = statusData.label;
              const statusDescription =
                statusData.label === formattedStatusLabel
                  ? formattedStatusLabel
                  : `${statusData.label} (${formattedStatusLabel})`;
              const dueLabel = dueDate ? scheduleDateFormatter.format(dueDate) : undefined;
              const timeLabel = formatTimeLabel(task.time);
              const assignedLabel = quickTask?.assignedTo
                ? formatAssigneeDisplay(quickTask.assignedTo)
                : formatAssigneeDisplay(task.assignedTo);
              const assignedInitials = formatInitials(assignedLabel);
              const isPopoverOpen = activeTaskPopoverId === task.id;
              const normalizedStatus = typeof rawStatus === "string" ? rawStatus.trim().toLowerCase() : "";
              const isDone =
                Boolean(task.done) ||
                normalizedStatus === "done" ||
                normalizedStatus === "completed" ||
                normalizedStatus === "complete";
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
                            className="events-tasks__status-trigger"
                            title={statusDescription}
                            aria-label={`Task status: ${statusDescription}`}
                            onClick={(event) => {
                              event.stopPropagation();
                            }}
                          >
                            <span
                              className={`events-tasks__status-badge events-tasks__status-badge--${statusData.category}`}
                            >
                              {displayStatusLabel}
                            </span>
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
                      <div className="events-tasks__meta-group">
                        {dueLabel ? (
                          <span className="events-tasks__meta-chip">
                            <CalendarIcon size={12} aria-hidden />
                            <span>
                              Due {dueLabel}
                              {timeLabel ? ` · ${timeLabel}` : ""}
                            </span>
                          </span>
                        ) : null}
                      </div>
                      {assignedInitials ? (
                        <span
                          className="events-tasks__assignee-badge"
                          title={assignedLabel ?? undefined}
                          aria-label={assignedLabel ? `Assigned to ${assignedLabel}` : undefined}
                        >
                          {assignedInitials}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
            {filteredTasks.length === 0 && (
              <li className="events-tasks__empty">
                {tasks.length === 0
                  ? "No tasks yet. Add tasks to keep track of work."
                  : "No tasks match the current filters."}
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default EventsAndTasks;
