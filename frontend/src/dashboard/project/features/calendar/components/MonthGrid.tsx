import React, { useEffect, useMemo, useState } from "react";
import { Calendar, CheckSquare, Clock, Plus } from "lucide-react";

import type { CalendarEvent, CalendarTask } from "../utils";
import {
  getMonthMatrix,
  fmtLocal,
  formatTimeLabel,
  isSameDay,
  safeDate,
} from "../utils";

export type MonthGridProps = {
  viewDate: Date;
  selectedDate: Date;
  events: CalendarEvent[];
  tasks: CalendarTask[];
  onSelectDate: (d: Date) => void;
  onOpenCreate: (d: Date, options?: { triggeredFromCalendar?: boolean }) => void;
  onOpenQuickTask: (d: Date) => void;
  canCreateTasks: boolean;
  onEditEvent: (event: CalendarEvent) => void;
  onEditTask: (task: CalendarTask) => void;
  onSwitchToDayView?: () => void;
};

type DayEntryType = "event" | "task";

type DayEntry = {
  id: string;
  type: DayEntryType;
  sortKey: string;
  title: string;
  note?: string;
  spanStart: Date;
  spanEnd: Date;
  event?: CalendarEvent;
  task?: CalendarTask;
};

const MAX_VISIBLE_ENTRIES = 3;

const parseDateCandidate = (...candidates: Array<string | undefined | null>) => {
  for (const candidate of candidates) {
    const parsed = safeDate(candidate ?? undefined);
    if (parsed) {
      return parsed;
    }
  }
  return undefined;
};

const buildDateRange = (
  startCandidates: Array<string | undefined | null>,
  endCandidates: Array<string | undefined | null>,
  fallback?: string,
) => {
  const fallbackDate = fallback ? safeDate(fallback) : undefined;
  const start = parseDateCandidate(...startCandidates) ?? fallbackDate;
  const end =
    parseDateCandidate(...endCandidates) ?? fallbackDate ?? (start ? new Date(start.getTime()) : undefined);
  if (!start || !end) return null;
  if (start.getTime() <= end.getTime()) {
    return { start, end };
  }
  return { start: end, end: start };
};

const formatSpanLabel = (date: Date) =>
  date.toLocaleDateString(undefined, { month: "short", day: "numeric" });

const buildTooltipTimeLabel = (entry: DayEntry) => {
  const { spanStart, spanEnd, event, task } = entry;
  if (!isSameDay(spanStart, spanEnd)) {
    return `${formatSpanLabel(spanStart)} – ${formatSpanLabel(spanEnd)}`;
  }

  if (event && event.allDay) {
    return "All day";
  }

  const startTime = event?.start ?? task?.start;
  const endTime = event?.end ?? task?.end;

  const startLabel = formatTimeLabel(startTime) ?? startTime;
  const endLabel = formatTimeLabel(endTime) ?? endTime;

  if (startLabel && endLabel) {
    return `${startLabel} – ${endLabel}`;
  }
  return startLabel ?? endLabel;
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
  onSwitchToDayView,
}: MonthGridProps) {
  const days = useMemo(() => getMonthMatrix(viewDate), [viewDate]);
  const month = viewDate.getMonth();
  const entriesByDate = useMemo(() => {
    const map = new Map<string, DayEntry[]>();

    const addToMap = (day: Date, entry: DayEntry) => {
      const key = fmtLocal(day);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    };

    const addRangeToMap = ({ start, end }: { start: Date; end: Date }, entry: DayEntry) => {
      for (
        let cursor = new Date(start.getTime());
        cursor.getTime() <= end.getTime();
        cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
      ) {
        addToMap(cursor, entry);
      }
    };

    events.forEach((event) => {
      const range = buildDateRange(
        [event.source.startAt, event.source.start as string | undefined | null, event.date],
        [event.source.endAt, event.source.end, event.date],
        event.date,
      );
      if (!range) return;

      const entry: DayEntry = {
        id: event.id,
        type: "event",
        sortKey: event.start ?? "99:99",
        title: event.title,
        note: event.description,
        spanStart: range.start,
        spanEnd: range.end,
        event,
      };

      addRangeToMap(range, entry);
    });

    tasks.forEach((task) => {
      const range = buildDateRange(
        [
          task.source.startAt,
          (task.source as { start?: string }).start,
          task.source.dueDate,
          task.due,
        ],
        [
          task.source.endAt,
          (task.source as { end?: string }).end,
          task.source.dueDate,
          task.due,
        ],
        task.due,
      );
      if (!range) return;

      const entry: DayEntry = {
        id: task.id,
        type: "task",
        sortKey: task.start ?? "99:99",
        title: task.title,
        note: task.description,
        spanStart: range.start,
        spanEnd: range.end,
        task,
      };

      addRangeToMap(range, entry);
    });

    return map;
  }, [events, tasks]);

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
    onOpenCreate(day, { triggeredFromCalendar: true });
    setQuickAddKey(null);
  };

  const handleSelectDay = (day: Date) => {
    onSelectDate(day);
    onSwitchToDayView?.();
    setQuickAddKey(null);
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
          const key = fmtLocal(day);
          const isSelected = isSameDay(day, selectedDate);
          const dayEntries = entriesByDate.get(key) || [];
          const sortedEntries = [...dayEntries].sort((a, b) => {
            const timeCompare = a.sortKey.localeCompare(b.sortKey);
            if (timeCompare !== 0) return timeCompare;
            return a.title.localeCompare(b.title);
          });

          const visibleEntries = sortedEntries.slice(0, MAX_VISIBLE_ENTRIES);
          const overflowCount = Math.max(0, sortedEntries.length - visibleEntries.length);
          const tooltipItems = visibleEntries;

          const className = [
            "month-grid__cell",
            isCurrentMonth ? "is-current" : "is-outside",
            isSelected ? "is-selected" : "",
          ]
            .filter(Boolean)
            .join(" ");

          const isHovered = hoveredKey === key;
          const tooltipOverflowCount = overflowCount;

          return (
            <div
              key={key}
              className={`${className}${isHovered ? " is-hovered" : ""}`.trim()}
              onMouseEnter={() => setHoveredKey(key)}
              onMouseLeave={() => handleMouseLeave(key)}
              onClick={() => handleSelectDay(day)}
              role="presentation"
            >
              <button
                type="button"
                className="month-grid__date"
                onClick={(event) => {
                  event.stopPropagation();
                  handleSelectDay(day);
                }}
              >
                {day.getDate()}
              </button>
              <div className="month-grid__events">
                {visibleEntries.map((item) => {
                  if (item.type === "event" && item.event) {
                    return (
                      <div
                        key={`event-${item.event.id}`}
                        className="month-grid__event"
                        role="button"
                        tabIndex={0}
                        onClick={(mouseEvent) => {
                          mouseEvent.stopPropagation();
                          onEditEvent(item.event!);
                        }}
                        onKeyDown={(keyboardEvent) => {
                          if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                            keyboardEvent.preventDefault();
                            onEditEvent(item.event!);
                          }
                        }}
                      >
                        <div className="month-grid__event-content">
                          <div className="month-grid__item-icon month-grid__item-icon--event">
                            <Calendar size={10} className="month-grid__item-icon-svg" />
                          </div>
                          <div className="month-grid__event-title" title={item.title}>
                            {item.title}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (item.task) {
                    return (
                      <div
                        key={`task-${item.task.id}`}
                        className="month-grid__event month-grid__event--task"
                        role="button"
                        tabIndex={0}
                        onClick={(mouseEvent) => {
                          mouseEvent.stopPropagation();
                          onEditTask(item.task!);
                        }}
                        onKeyDown={(keyboardEvent) => {
                          if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                            keyboardEvent.preventDefault();
                            onEditTask(item.task!);
                          }
                        }}
                      >
                        <div className="month-grid__event-content">
                          <div className="month-grid__item-icon month-grid__item-icon--task">
                            <CheckSquare size={10} className="month-grid__item-icon-svg" />
                          </div>
                          <div
                            className={`month-grid__event-title ${
                              (item.task.done || item.task.status === "archived") ? "is-complete" : ""
                            }`}
                            title={item.title}
                          >
                            {item.title}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return null;
                })}
                {overflowCount > 0 && <div className="month-grid__more-pill">+{overflowCount} more</div>}
              </div>
              {isHovered && tooltipItems.length > 0 && (
                <div
                  className={`month-grid__tooltip${
                    tooltipOverflowCount > 0 ? " month-grid__tooltip--has-overflow" : ""
                  }`}
                >
                  {tooltipItems.map((item) => {
                    const timeLabel = buildTooltipTimeLabel(item);
                    const triggerTooltipAction = () => {
                      if (item.type === "event" && item.event) {
                        onEditEvent(item.event);
                      } else if (item.type === "task" && item.task) {
                        onEditTask(item.task);
                      }
                    };
                    const handleAction = (event: React.MouseEvent<HTMLButtonElement>) => {
                      event.stopPropagation();
                      triggerTooltipAction();
                    };
                    return (
                      <button
                        key={`${item.type}-${item.id}`}
                        type="button"
                        className="month-grid__tooltip-item"
                        onClick={handleAction}
                        onKeyDown={(keyboardEvent) => {
                          if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                            keyboardEvent.preventDefault();
                            triggerTooltipAction();
                          }
                        }}
                      >
                        <span
                          className={`month-grid__tooltip-dot month-grid__tooltip-dot--${item.type}`}
                          aria-hidden="true"
                        />
                        <div className="month-grid__tooltip-body">
                          <span className="month-grid__tooltip-title">{item.title}</span>
                          {timeLabel && <span className="month-grid__tooltip-time">{timeLabel}</span>}
                          {item.note && <span className="month-grid__tooltip-note">{item.note}</span>}
                        </div>
                      </button>
                    );
                  })}
                  {tooltipOverflowCount > 0 && (
                    <span className="month-grid__tooltip-pill">+{tooltipOverflowCount}</span>
                  )}
                </div>
              )}
            <div className="month-grid__quick-add-container">
              <button
                type="button"
                className={`month-grid__quick-add${quickAddKey === key ? " is-open" : ""}`}
                aria-label="Add calendar item"
                onClick={(event) => {
                  event.stopPropagation();
                  const isOpen = quickAddKey === key;
                  if (!isOpen) {
                    onSelectDate(day);
                  }
                  setQuickAddKey(isOpen ? null : key);
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
