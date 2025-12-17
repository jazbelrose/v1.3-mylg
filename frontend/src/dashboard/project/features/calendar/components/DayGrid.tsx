import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckSquare, Clock, Plus } from "lucide-react";

import type { CalendarEvent, CalendarTask } from "../utils";
import {
  addHoursToTime,
  categoryColor,
  fmtLocal,
  formatTimeLabel,
  safeDate,
  setTime,
} from "../utils";
import type { TeamMember as ProjectTeamMember } from "@/dashboard/project/components/Shared/types";
import ProjectAvatar from "@/shared/ui/ProjectAvatar";
import {
  MINUTES_IN_HOUR,
  assignTimelineColumns,
  buildEventAvatars,
  buildTaskAvatars,
  buildTeamMemberLookup,
  parseTimeToMinutes,
  type TimelineHourEntry,
} from "./timelineLayout";

export type DayGridProps = {
  date: Date;
  events: CalendarEvent[];
  tasks: CalendarTask[];
  onEditEvent: (event: CalendarEvent) => void;
  onEditTask: (task: CalendarTask) => void;
  onCreateEvent: (date: Date) => void;
  onCreateTask: (date: Date) => void;
  canCreateTasks: boolean;
  teamMembers?: ProjectTeamMember[];
};

const parseHour = (time?: string) => {
  if (!time) return undefined;
  const [hours] = time.split(":").map(Number);
  if (Number.isNaN(hours)) return undefined;
  return hours;
};

const formatHour12 = (hour: number): string => {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
};

const HOURS_IN_DAY = 24;
const HOUR_ROW_HEIGHT_PX = 88;
const ROW_ENTRY_LIMIT = 2;
const ENTRY_VERTICAL_PADDING_PX = 4;
const ENTRY_HORIZONTAL_PADDING_PX = 4;
const ENTRY_MIN_HEIGHT_PX = 24;
const COLUMN_GAP_PX = 4;

const chunkEntries = <T,>(entries: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < entries.length; index += size) {
    chunks.push(entries.slice(index, index + size));
  }
  return chunks;
};

function DayGrid({
  date,
  events,
  tasks,
  onEditEvent,
  onEditTask,
  onCreateEvent,
  onCreateTask,
  canCreateTasks,
  teamMembers,
}: DayGridProps) {
  const key = useMemo(() => fmtLocal(date), [date]);
  const hours = useMemo(() => Array.from({ length: HOURS_IN_DAY }, (_, index) => index), []);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [expandedHours, setExpandedHours] = useState<Set<number>>(new Set());
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollToNoon = () => {
      const grid = gridRef.current;
      if (!grid) return;

      const scroller = grid.closest('.calendar-view__scroller') as HTMLElement | null;
      if (scroller) {
        scroller.scrollTop = 12 * HOUR_ROW_HEIGHT_PX;
      }
    };

    const timer = setTimeout(scrollToNoon, 0);
    return () => clearTimeout(timer);
  }, [date]);

  const dayAllDayEvents = useMemo(() => {
    const allDay: CalendarEvent[] = [];
    events.forEach((event) => {
      const eventDate = safeDate(event.date);
      if (!eventDate) return;
      if (fmtLocal(eventDate) !== key) return;
      const hour = event.allDay ? undefined : parseHour(event.start);
      if (hour == null) {
        allDay.push(event);
      }
    });
    return allDay;
  }, [events, key]);

  const dayFloatingTasks = useMemo(() => {
    const floating: CalendarTask[] = [];
    tasks.forEach((task) => {
      if (!task.due) return;
      const taskDate = safeDate(task.due);
      if (!taskDate) return;
      if (fmtLocal(taskDate) !== key) return;
      const hour = parseHour(task.start);
      if (hour == null) {
        floating.push(task);
      }
    });
    return floating;
  }, [tasks, key]);

  const teamMemberLookup = useMemo(
    () => buildTeamMemberLookup(teamMembers ?? []),
    [teamMembers],
  );

  const timelineEntriesByHour = useMemo(() => {
    const entries = new Map<number, Array<TimelineHourEntry<CalendarEvent | CalendarTask>>>();
    const addEntry = (hour: number, entry: TimelineHourEntry<CalendarEvent | CalendarTask>) => {
      if (hour < 0 || hour > 23) return;
      const bucket = entries.get(hour) ?? [];
      bucket.push(entry);
      entries.set(hour, bucket);
    };

    events.forEach((event) => {
      const eventDate = safeDate(event.date);
      if (!eventDate) return;
      if (fmtLocal(eventDate) !== key) return;
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
      addEntry(hour, {
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
      if (fmtLocal(taskDate) !== key) return;
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
      addEntry(hour, {
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

    const layout = new Map<number, ReturnType<typeof assignTimelineColumns>>();
    entries.forEach((hourEntries, hour) => {
      if (hourEntries.length) {
        layout.set(hour, assignTimelineColumns(hourEntries));
      }
    });

    return layout;
  }, [events, tasks, key, teamMemberLookup]);

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

  const renderTimelineEntry = (
    entry: TimelineHourEntry<CalendarEvent | CalendarTask>,
    hourValue: number,
    stacked: boolean,
  ) => {
    const hourStart = hourValue * MINUTES_IN_HOUR;
    const hourEnd = hourStart + MINUTES_IN_HOUR;
    const startWithinHour = Math.max(
      0,
      Math.min(MINUTES_IN_HOUR, entry.startMinutes - hourStart),
    );
    const entryEnd = Math.max(entry.startMinutes + 1, Math.min(entry.endMinutes, hourEnd));
    const durationMinutes = Math.max(entryEnd - entry.startMinutes, 5);
    const topPercent = (startWithinHour / MINUTES_IN_HOUR) * 100;
    const rawHeightPercent = (durationMinutes / MINUTES_IN_HOUR) * 100;
    const maxHeightPercent = Math.max(4, 100 - topPercent);
    const heightPercent = Math.min(maxHeightPercent, Math.max(rawHeightPercent, 6));
    const columns = Math.max(entry.columnCount, 1);
    const entryHeight = Math.max((heightPercent / 100) * HOUR_ROW_HEIGHT_PX, 32);
    const columnWidth = 100 / columns;
    const verticalPadding = ENTRY_VERTICAL_PADDING_PX;
    const horizontalPadding = ENTRY_HORIZONTAL_PADDING_PX;
    const columnSpacingAdjustment = Math.max(COLUMN_GAP_PX - horizontalPadding, 0);
    const heightWithPadding = stacked
      ? entryHeight
      : Math.max(entryHeight - verticalPadding * 2, ENTRY_MIN_HEIGHT_PX);
    const entryStyle = {
      height: `${heightWithPadding}px`,
      ...(stacked
        ? {}
        : {
            top: `calc(${topPercent}% + ${verticalPadding}px)`,
            left: `calc(${columnWidth * entry.columnIndex}% + ${entry.columnIndex * columnSpacingAdjustment}px + ${horizontalPadding}px)`,
            width: `calc(${columnWidth}% - ${horizontalPadding * 2}px)`,
          }),
    };

    const avatars = entry.avatars.length > 0 ? (
      <div className="week-grid__timeline-entry-avatars" aria-hidden="true">
        {entry.avatars.map((avatar) => (
          <ProjectAvatar
            key={avatar.key}
            className="week-grid__timeline-avatar"
            thumb={avatar.thumb ?? undefined}
            name={avatar.name}
            shape="circle"
            radius={9}
          />
        ))}
      </div>
    ) : null;

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
            {entry.title}
          </div>
        </div>
      </div>
    );

    const className = [
      "week-grid__timeline-entry",
      entry.type === "event"
        ? "week-grid__timeline-entry--event"
        : "week-grid__timeline-entry--task",
      stacked ? "week-grid__timeline-entry--stacked" : "",
      entry.colorClass ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    if (entry.type === "event") {
      return (
        <motion.div
          key={entry.id}
          initial={stacked ? undefined : { opacity: 0.4, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className={className}
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
        >
          <div className="week-grid__timeline-entry-main">
            {content}
            {avatars}
          </div>
        </motion.div>
      );
    }

    return (
      <button
        key={entry.id}
        type="button"
        className={className}
        onClick={() => onEditTask(entry.payload as CalendarTask)}
        style={entryStyle}
      >
        <div className="week-grid__timeline-entry-main">
          {content}
          {avatars}
        </div>
      </button>
    );
  };

  return (
    <div className="day-grid" ref={gridRef}>
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
        const timelineEntries = timelineEntriesByHour.get(hour) ?? [];

        return (
          <React.Fragment key={hour}>
            <div className="week-grid__hour">{formatHour12(hour)}</div>
            <div
              className="week-grid__cell day-grid__cell"
              role="presentation"
              onClick={(mouseEvent) => {
                const target = mouseEvent.target as HTMLElement | null;
                if (!target) return;
                if (
                  target.closest(".week-grid__timeline-entry") ||
                  target.closest(".week-grid__all-day") ||
                  target.closest(".day-grid__all-day") ||
                  target.closest(".week-grid__quick-add-container") ||
                  target.closest(".week-grid__overflow-pill")
                ) {
                  return;
                }
                handleCreateEvent(hour);
              }}
            >
              {hourIndex === 0 &&
                (dayAllDayEvents.length > 0 || dayFloatingTasks.length > 0) && (
                  <div className="week-grid__all-day day-grid__all-day">
                    {dayAllDayEvents.map((event) => (
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
                    {dayFloatingTasks.map((task) => (
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
                          <div className="week-grid__task-header">
                            <div
                              className={`week-grid__task-title ${
                                task.done || task.status === "archived" ? "is-complete" : ""
                              }`}
                            >
                              {task.title}
                            </div>
                          </div>
                          <div className="week-grid__task-time">All day</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              {(() => {
                const entryRows = chunkEntries(timelineEntries, ROW_ENTRY_LIMIT);
                const isExpanded = expandedHours.has(hour);
                const overflowCount = Math.max(timelineEntries.length - ROW_ENTRY_LIMIT, 0);
                if (isExpanded) {
                  return (
                    <div className="week-grid__timeline-rows">
                      {entryRows.map((row, rowIndex) => {
                        const sortedRow = [...row].sort(
                          (a, b) => a.columnIndex - b.columnIndex,
                        );
                        return (
                          <div key={`${hour}-row-${rowIndex}`} className="week-grid__timeline-row">
                            {sortedRow.map((entry) => renderTimelineEntry(entry, hour, true))}
                          </div>
                        );
                      })}
                      {timelineEntries.length > ROW_ENTRY_LIMIT && (
                        <div
                          className="week-grid__collapse-pill"
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedHours((prev) => {
                              const next = new Set(prev);
                              next.delete(hour);
                              return next;
                            });
                          }}
                        >
                          Show less
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <>
                    {timelineEntries.slice(0, ROW_ENTRY_LIMIT).map((entry) =>
                      renderTimelineEntry(entry, hour, false),
                    )}
                    {overflowCount > 0 && (
                      <div
                        className="week-grid__overflow-pill"
                        onClick={() => setExpandedHours((prev) => new Set(prev).add(hour))}
                      >
                        +{overflowCount} more
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default DayGrid;
