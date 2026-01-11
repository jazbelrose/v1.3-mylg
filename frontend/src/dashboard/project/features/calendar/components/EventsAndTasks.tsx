import React, { useCallback, useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon, CheckSquare, ChevronDown, Clock, Pencil } from "lucide-react";

import desktopStyles from "@/dashboard/home/components/ProjectsPanelDesktop.module.css";

import type { CalendarEvent, CalendarTask } from "../utils";
import { compareDateStrings, formatTimeLabel, parseIsoDate, fmtLocal } from "../utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUser } from "@/app/contexts/useUser";
import {
  createTaskStatusContext,
  getTaskStatusBadge,
  normalizeTask as normalizeQuickTask,
  formatStatusLabel,
  type QuickTask,
} from "@/dashboard/project/components/Tasks/components/quickTaskUtils";
import { formatAssigneeDisplay } from "@/dashboard/project/components/Tasks/utils";
import {
  DEFAULT_EVENT_FILTER,
  DEFAULT_TASK_FILTER,
  EVENT_FILTER_LABELS,
  EVENT_FILTER_SUMMARY,
  TASK_FILTER_LABELS,
  TASK_FILTER_SUMMARY,
  type EventFilter,
  type TaskFilter,
} from "./events-and-tasks-filters";
import { formatTaskName } from "@/shared/utils/taskNameFormatting";

import { CalendarEntryContextMenu, type ContextMenuEntry, type ContextMenuPosition } from "./CalendarEntryContextMenu";
import type { CalendarEntryType } from "./calendarInteractions";
import type { TeamMember as ProjectTeamMember } from "@/dashboard/project/components/Shared/types";

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
  /** Shared selection from the calendar surface (keys like "task:<id>" / "event:<id>") */
  selectedEntryKeys?: Set<string>;
  onEntrySelect?: (type: CalendarEntryType, id: string, additive: boolean) => void;
  onReplaceSelection?: (next: Set<string>) => void;
  onClearSelection?: () => void;
  /** Context menu actions (wired to CalendarSurface handlers) */
  teamMembers?: ProjectTeamMember[];
  onSubmitForReview?: (entries: CalendarTask[]) => void;
  onMarkAsDone?: (entries: CalendarTask[]) => void;
  onConvertToFocusBlock?: (entries: CalendarTask[]) => void;
  onUngroupFocusBlock?: (focusBlock: CalendarTask) => void;
  onDuplicateEntries?: (entries: ContextMenuEntry[]) => void;
  onDeleteEntries?: (entries: ContextMenuEntry[]) => void;
  onBulkAssignChildren?: (focusBlock: CalendarTask, userId: string | null, children: CalendarTask[]) => void;
  onAssignTimeBlock?: (task: CalendarTask, userId: string | null) => void;
  onAssignTimeBlocks?: (tasks: CalendarTask[], userId: string | null) => void;
  hideMapPill?: boolean;
  eventFilter?: EventFilter;
  taskFilter?: TaskFilter;
  onEventFilterChange?: (next: EventFilter) => void;
  onTaskFilterChange?: (next: TaskFilter) => void;
  hideFilterControls?: boolean;
};

function EventsAndTasks({
  events,
  tasks,
  onToggleTask,
  onEditEvent,
  onEditTask,
  onOpenTasksOverview,
  selectedEntryKeys,
  onEntrySelect,
  onReplaceSelection,
  onClearSelection,
  teamMembers,
  onSubmitForReview,
  onMarkAsDone,
  onConvertToFocusBlock,
  onUngroupFocusBlock,
  onDuplicateEntries,
  onDeleteEntries,
  onBulkAssignChildren,
  onAssignTimeBlock,
  onAssignTimeBlocks,
  hideMapPill = false,
  eventFilter: eventFilterProp,
  taskFilter: taskFilterProp,
  onEventFilterChange,
  onTaskFilterChange,
  hideFilterControls = false,
}: EventsAndTasksProps) {
  const { isAdmin } = useUser();
  const isEventFilterControlled = eventFilterProp !== undefined;
  const isTaskFilterControlled = taskFilterProp !== undefined;

  const [internalEventFilter, setInternalEventFilter] = useState<EventFilter>(
    eventFilterProp ?? DEFAULT_EVENT_FILTER,
  );
  const [internalTaskFilter, setInternalTaskFilter] = useState<TaskFilter>(
    taskFilterProp ?? DEFAULT_TASK_FILTER,
  );
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);

  const resolvedEventFilter = isEventFilterControlled
    ? eventFilterProp!
    : internalEventFilter;
  const resolvedTaskFilter = isTaskFilterControlled ? taskFilterProp! : internalTaskFilter;

  const handleEventFilterChange = (next: EventFilter) => {
    if (!isEventFilterControlled) {
      setInternalEventFilter(next);
    }
    onEventFilterChange?.(next);
  };

  const handleTaskFilterChange = (next: TaskFilter) => {
    if (!isTaskFilterControlled) {
      setInternalTaskFilter(next);
    }
    onTaskFilterChange?.(next);
  };

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
    if (resolvedEventFilter === "all") {
      return sortedEvents;
    }

    const today = fmtLocal(new Date());
    return sortedEvents.filter((event) => {
      if (resolvedEventFilter === "upcoming") {
        return event.date >= today;
      }
      return event.date < today;
    });
  }, [resolvedEventFilter, sortedEvents]);

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
      if (resolvedTaskFilter === "all") {
        return true;
      }

      const rawStatus = quickTask?.status ?? task.status ?? (task.done ? "done" : "todo");
      const normalizedStatus = typeof rawStatus === "string" ? rawStatus.trim().toLowerCase() : "";
      const isCompleted =
        Boolean(task.done) ||
        normalizedStatus === "done" ||
        normalizedStatus === "completed" ||
        normalizedStatus === "complete" ||
        normalizedStatus === "archived";

      if (resolvedTaskFilter === "completed") {
        return isCompleted;
      }

      return !isCompleted;
    });
  }, [normalizedTasks, resolvedTaskFilter]);

  const hasActiveFilters = resolvedEventFilter !== "all" || resolvedTaskFilter !== "all";
  const filterButtonAriaLabel = hasActiveFilters
    ? `Filtering by ${EVENT_FILTER_LABELS[resolvedEventFilter]} and ${TASK_FILTER_LABELS[resolvedTaskFilter]}`
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

  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectionKeys = selectedEntryKeys ?? new Set<string>();
  const isSelectionEnabled = Boolean(selectedEntryKeys && onEntrySelect && onReplaceSelection);
  const buildSelectionKey = useCallback((type: CalendarEntryType, id: string) => `${type}:${id}`, []);

  const [contextMenuState, setContextMenuState] = useState<{
    position: ContextMenuPosition;
    entryType: CalendarEntryType;
    entry: CalendarTask | CalendarEvent;
  } | null>(null);

  const resolveSelectedEntries = useCallback(
    (keys: Set<string>): ContextMenuEntry[] => {
      if (!keys.size) return [];
      const byEventId = new Map(filteredEvents.map((e) => [e.id, e]));
      const byTaskId = new Map(filteredTasks.map(({ task }) => [task.id, task]));

      const resolved: ContextMenuEntry[] = [];
      keys.forEach((key) => {
        const [type, id] = key.split(":");
        if (type === "event") {
          const ev = byEventId.get(id);
          if (ev) resolved.push({ entryType: "event", entry: ev });
        }
        if (type === "task") {
          const t = byTaskId.get(id);
          if (t) resolved.push({ entryType: "task", entry: t });
        }
      });
      return resolved;
    },
    [filteredEvents, filteredTasks],
  );

  const selectedEntries = useMemo(() => resolveSelectedEntries(selectionKeys), [resolveSelectedEntries, selectionKeys]);

  const [eventAnchorId, setEventAnchorId] = useState<string | null>(null);
  const [taskAnchorId, setTaskAnchorId] = useState<string | null>(null);

  const replaceSelection = useCallback(
    (next: Set<string>) => {
      if (onReplaceSelection) {
        onReplaceSelection(next);
      }
    },
    [onReplaceSelection],
  );

  const handleSelectRange = useCallback(
    (type: CalendarEntryType, idsInOrder: string[], anchorId: string | null, clickedId: string, additive: boolean) => {
      const anchorIndex = anchorId ? idsInOrder.indexOf(anchorId) : -1;
      const clickedIndex = idsInOrder.indexOf(clickedId);
      if (clickedIndex < 0) return;

      const start = anchorIndex >= 0 ? Math.min(anchorIndex, clickedIndex) : clickedIndex;
      const end = anchorIndex >= 0 ? Math.max(anchorIndex, clickedIndex) : clickedIndex;
      const slice = idsInOrder.slice(start, end + 1);

      const next = additive ? new Set(selectionKeys) : new Set<string>();
      slice.forEach((id) => next.add(buildSelectionKey(type, id)));
      replaceSelection(next);
    },
    [buildSelectionKey, replaceSelection, selectionKeys],
  );

  const handleSelectEntry = useCallback(
    (event: React.MouseEvent | React.KeyboardEvent, type: CalendarEntryType, id: string, section: "event" | "task") => {
      const e = event as React.MouseEvent;
      const additive = Boolean((e as any).metaKey || (e as any).ctrlKey);
      const isRange = Boolean((e as any).shiftKey);

      if (!isSelectionEnabled || !onEntrySelect || !onReplaceSelection) {
        return;
      }

      if (isRange) {
        if (section === "event") {
          handleSelectRange(
            "event",
            filteredEvents.map((ev) => ev.id),
            eventAnchorId,
            id,
            additive,
          );
        } else {
          handleSelectRange(
            "task",
            filteredTasks.map(({ task }) => task.id),
            taskAnchorId,
            id,
            additive,
          );
        }
        return;
      }

      onEntrySelect(type, id, additive);
      if (section === "event") setEventAnchorId(id);
      if (section === "task") setTaskAnchorId(id);
    },
    [
      eventAnchorId,
      filteredEvents,
      filteredTasks,
      handleSelectRange,
      isSelectionEnabled,
      onEntrySelect,
      onReplaceSelection,
      taskAnchorId,
    ],
  );

  const openContextMenuFor = useCallback(
    (mouseEvent: React.MouseEvent, entryType: CalendarEntryType, entry: CalendarTask | CalendarEvent) => {
      mouseEvent.preventDefault();
      mouseEvent.stopPropagation();

      const key = buildSelectionKey(entryType, (entry as any).id as string);
      const isAlreadySelected = selectionKeys.has(key);

      // File-manager style: if right-clicking a non-selected item, replace selection.
      if (!isAlreadySelected && onReplaceSelection) {
        onReplaceSelection(new Set([key]));
      }

      setContextMenuState({
        position: { x: mouseEvent.clientX, y: mouseEvent.clientY },
        entryType,
        entry,
      });
    },
    [buildSelectionKey, onReplaceSelection, selectionKeys],
  );

  const focusBlockChildren = useMemo(() => {
    if (!contextMenuState) return undefined;
    if (contextMenuState.entryType !== "task") return undefined;
    const task = contextMenuState.entry as CalendarTask;
    const focusId = (task.source as any)?.taskId ?? task.id;
    if (!focusId) return undefined;
    const isFocusBlock =
      task.kind === "focus_block" ||
      (Array.isArray((task as any).focusChildTaskIds) && (task as any).focusChildTaskIds.length > 0) ||
      (Array.isArray((task as any).focusChecklist) && (task as any).focusChecklist.length > 0);
    if (!isFocusBlock) return undefined;

    return tasks.filter((t) => (t as any).focusBlockId === focusId);
  }, [contextMenuState, tasks]);

  return (
    <div
      ref={rootRef}
      className="events-tasks"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClearSelection?.();
        }
      }}
    >
      <div className="events-tasks__header">
        <div className="events-tasks__header-row events-tasks__header-row--primary">
          <div className="events-tasks__title">Events & Tasks</div>
          {hideMapPill ? null : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="events-tasks__map-pill"
              onClick={onOpenTasksOverview}
            >
              Open Map
            </Button>
          )}
        </div>
        {hideFilterControls ? null : (
          <div className="events-tasks__header-row events-tasks__header-row--secondary">
            <Popover open={isFilterPopoverOpen} onOpenChange={setIsFilterPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={desktopStyles.statusTrigger}
                  aria-haspopup="menu"
                  aria-expanded={isFilterPopoverOpen}
                  aria-label={filterButtonAriaLabel}
                  style={{ width: "100%", display: "flex" }}
                >
                  <span className={desktopStyles.triggerLabel}>
                    <span className={desktopStyles.triggerLabelText}>
                      {hasActiveFilters
                        ? `${EVENT_FILTER_SUMMARY[resolvedEventFilter]} · ${TASK_FILTER_SUMMARY[resolvedTaskFilter]}`
                        : "Filters"}
                    </span>
                  </span>
                  <ChevronDown size={14} aria-hidden className={desktopStyles.triggerChevron} />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="events-tasks__filter-popover"
                align="start"
              >
                <div className="events-tasks__filter-header">
                  <div className="events-tasks__filter-title">Filter events & tasks</div>
                  <button
                    type="button"
                    className="events-tasks__filter-reset"
                    onClick={() => {
                      handleEventFilterChange(DEFAULT_EVENT_FILTER);
                      handleTaskFilterChange(DEFAULT_TASK_FILTER);
                    }}
                    disabled={!hasActiveFilters}
                  >
                    Reset
                  </button>
                </div>
                {hasActiveFilters && (
                  <div className="events-tasks__summary">
                    Showing: {EVENT_FILTER_LABELS[resolvedEventFilter]} · {TASK_FILTER_LABELS[resolvedTaskFilter]}
                  </div>
                )}
                <div className="events-tasks__filter-section">
                  <div className="events-tasks__filter-heading">Events</div>
                  <div className="events-tasks__filter-options" role="group" aria-label="Filter events">
                    {(Object.keys(EVENT_FILTER_LABELS) as EventFilter[]).map((option) => {
                      const isActive = resolvedEventFilter === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          className={`events-tasks__filter-option${isActive ? " is-active" : ""}`}
                          onClick={() => handleEventFilterChange(option)}
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
                      const isActive = resolvedTaskFilter === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          className={`events-tasks__filter-option${isActive ? " is-active" : ""}`}
                          onClick={() => handleTaskFilterChange(option)}
                          aria-pressed={isActive}
                        >
                          {TASK_FILTER_LABELS[option]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      <div className="events-tasks__content">
        <div className="events-tasks__section">
          <div className="events-tasks__section-header">
            <div className="events-tasks__section-title">{EVENT_FILTER_LABELS[resolvedEventFilter]}</div>
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

              const entryKey = buildSelectionKey("event", event.id);
              const isSelected = selectionKeys.has(entryKey);

              return (
                <li key={event.id} className="events-tasks__list-item">
                  <div
                    role="button"
                    tabIndex={0}
                    className={`events-tasks__card events-tasks__card--event${isSelected ? " is-selected" : ""}`}
                    onClick={(mouseEvent) => {
                      if (isSelectionEnabled) {
                        handleSelectEntry(mouseEvent, "event", event.id, "event");
                        return;
                      }
                      onEditEvent(event);
                    }}
                    onDoubleClick={() => {
                      if (isSelectionEnabled) {
                        onEditEvent(event);
                      }
                    }}
                    onContextMenu={(mouseEvent) => openContextMenuFor(mouseEvent, "event", event)}
                    onKeyDown={(keyboardEvent) => {
                      if (keyboardEvent.key === "Enter") {
                        keyboardEvent.preventDefault();
                        onEditEvent(event);
                      }
                      if (keyboardEvent.key === " " && isSelectionEnabled) {
                        keyboardEvent.preventDefault();
                        handleSelectEntry(keyboardEvent, "event", event.id, "event");
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
            <div className="events-tasks__section-title">{TASK_FILTER_LABELS[resolvedTaskFilter]}</div>
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
              const assignedLabel = quickTask?.assignedTo
                ? formatAssigneeDisplay(quickTask.assignedTo)
                : formatAssigneeDisplay(task.assignedTo);
              const assignedInitials = formatInitials(assignedLabel);
              const isPopoverOpen = activeTaskPopoverId === task.id;
              const normalizedStatus = typeof rawStatus === "string" ? rawStatus.trim().toLowerCase() : "";
              const isDone =
                normalizedStatus === "done" ||
                normalizedStatus === "archived";
              const isAwaitingApproval = normalizedStatus === "in_review";
              const canApprove = isAdmin && isAwaitingApproval;
              const canSubmitForReview = !isAwaitingApproval && !isDone;
              const showStatusAction = canApprove || canSubmitForReview;
              const toggleLabel = canApprove ? "Approve task" : "Submit for review";
              const rawTitle = typeof task.title === "string" ? task.title.trim() : "";
              const displayTaskTitle = rawTitle ? formatTaskName(rawTitle) : "Untitled task";

              const entryKey = buildSelectionKey("task", task.id);
              const isSelected = selectionKeys.has(entryKey);

              return (
                <li key={task.id} className="events-tasks__list-item">
                  <div
                    role="button"
                    tabIndex={0}
                    className={`events-tasks__card events-tasks__card--task${isDone ? " is-complete" : ""}${isSelected ? " is-selected" : ""}`}
                    onClick={(mouseEvent) => {
                      if (isSelectionEnabled) {
                        handleSelectEntry(mouseEvent, "task", task.id, "task");
                        return;
                      }
                      onEditTask(task);
                    }}
                    onDoubleClick={() => {
                      if (isSelectionEnabled) {
                        onEditTask(task);
                      }
                    }}
                    onContextMenu={(mouseEvent) => openContextMenuFor(mouseEvent, "task", task)}
                    onKeyDown={(keyboardEvent) => {
                      if (keyboardEvent.key === "Enter") {
                        keyboardEvent.preventDefault();
                        onEditTask(task);
                      }
                      if (keyboardEvent.key === " " && isSelectionEnabled) {
                        keyboardEvent.preventDefault();
                        handleSelectEntry(keyboardEvent, "task", task.id, "task");
                      }
                    }}
                  >
                    <div className="events-tasks__card-header">
                      <span className="events-tasks__card-title" title={displayTaskTitle}>
                        {displayTaskTitle}
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
                            onMouseDown={(event) => {
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
                          onMouseDown={(event) => {
                            event.stopPropagation();
                          }}
                        >
                          {showStatusAction ? (
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
                          ) : null}
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
                            <span>Due {dueLabel}</span>
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

      {contextMenuState ? (
        <CalendarEntryContextMenu
          position={contextMenuState.position}
          entryType={contextMenuState.entryType}
          entry={contextMenuState.entry}
          selectedEntries={selectedEntries}
          teamMembers={teamMembers}
          focusBlockChildren={focusBlockChildren}
          onClose={() => setContextMenuState(null)}
          onEdit={(entry) => {
            setContextMenuState(null);
            if (contextMenuState.entryType === "event") onEditEvent(entry as CalendarEvent);
            if (contextMenuState.entryType === "task") onEditTask(entry as CalendarTask);
          }}
          onSubmitForReview={(entries) => {
            setContextMenuState(null);
            onSubmitForReview?.(entries);
          }}
          onMarkAsDone={(entries) => {
            setContextMenuState(null);
            onMarkAsDone?.(entries);
          }}
          onConvertToFocusBlock={(entries) => {
            setContextMenuState(null);
            onConvertToFocusBlock?.(entries);
          }}
          onUngroupFocusBlock={(focusBlock) => {
            setContextMenuState(null);
            onUngroupFocusBlock?.(focusBlock);
          }}
          onDuplicate={(entries) => {
            setContextMenuState(null);
            onDuplicateEntries?.(entries);
          }}
          onDelete={(entries) => {
            setContextMenuState(null);
            onDeleteEntries?.(entries);
          }}
          onBulkAssignChildren={(focusBlock, userId, children) => {
            setContextMenuState(null);
            onBulkAssignChildren?.(focusBlock, userId, children);
          }}
          onAssignTimeBlock={(task, userId) => {
            setContextMenuState(null);
            onAssignTimeBlock?.(task, userId);
          }}
          onAssignTimeBlocks={(tasksToAssign, userId) => {
            setContextMenuState(null);
            onAssignTimeBlocks?.(tasksToAssign, userId);
          }}
        />
      ) : null}
    </div>
  );
}

export default EventsAndTasks;
