import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckSquare, ChevronLeft, ChevronRight, Clock, Target, X } from "lucide-react";

import { getMonthMatrix, fmt, isSameDay } from "../utils";

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export type MiniCalendarActivityItem = {
  id: string;
  title: string;
  time?: string;
  note?: string;
  type: "event" | "task";
  color?: string | null;
  isCompleted?: boolean;
  sortKey?: string;
};

export type MiniCalendarProps = {
  value: Date;
  onChange: (d: Date) => void;
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
  rangeColor?: string | null;
  finishLineDate?: Date | null;
  activityDates?: string[];
  activityMap?: Record<string, MiniCalendarActivityItem[]>;
  indicatorColor?: string | null;
  isMobile?: boolean;
};

type MiniCalendarStyle = React.CSSProperties & {
  "--mini-calendar-accent"?: string;
  "--mini-calendar-indicator"?: string;
};

type MiniCalendarTooltipStyle = React.CSSProperties & {
  "--mini-calendar-tooltip-arrow"?: string;
};

function MiniCalendar({
  value,
  onChange,
  rangeStart,
  rangeEnd,
  rangeColor,
  finishLineDate,
  activityDates,
  activityMap,
  indicatorColor,
  isMobile,
}: MiniCalendarProps) {
  const days = useMemo(() => getMonthMatrix(value), [value]);
  const monthName = value.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  const activityDateSet = useMemo(() => {
    if (activityDates && activityDates.length) {
      return new Set(activityDates);
    }
    return new Set(Object.keys(activityMap ?? {}));
  }, [activityDates, activityMap]);

  const todayKey = fmt(new Date());

  const handleFocusFinishLine = useCallback(() => {
    if (!finishLineDate) return;
    onChange(finishLineDate);
  }, [finishLineDate, onChange]);

  const normalizedRange = useMemo(() => {
    if (!rangeStart && !rangeEnd) return null;

    const normalize = (date: Date | null) =>
      date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : null;

    let start = normalize(rangeStart ?? null);
    let end = normalize(rangeEnd ?? null);

    if (start && end && end.getTime() < start.getTime()) {
      [start, end] = [end, start];
    }

    if (!start && end) {
      start = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    }

    return { start, end };
  }, [rangeStart, rangeEnd]);

  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [tooltip, setTooltip] = useState<{ key: string; date: Date } | null>(null);

  useEffect(() => {
    if (!isMobile) {
      setTooltip(null);
    }
  }, [isMobile]);

  useEffect(() => {
    if (tooltip && (!activityMap || !(activityMap[tooltip.key]?.length))) {
      setTooltip(null);
    }
  }, [tooltip, activityMap]);

  useEffect(() => {
    if (!tooltip || typeof window === "undefined") return;

    const handlePointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      const tooltipNode = tooltipRef.current;
      const buttonNode = buttonRefs.current[tooltip.key];
      if (tooltipNode?.contains(target) || buttonNode?.contains(target as Node)) {
        return;
      }
      setTooltip(null);
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTooltip(null);
      }
    };

    const handleViewportChange = () => {
      setTooltip(null);
    };

    window.addEventListener("mousedown", handlePointer, { passive: true });
    window.addEventListener("touchstart", handlePointer, { passive: true });
    window.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleViewportChange, { passive: true });
    window.addEventListener("resize", handleViewportChange);

    return () => {
      window.removeEventListener("mousedown", handlePointer as EventListener);
      window.removeEventListener("touchstart", handlePointer as EventListener);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleViewportChange);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [tooltip]);

  const registerDayRef = useCallback((key: string, node: HTMLButtonElement | null) => {
    if (node) {
      buttonRefs.current[key] = node;
    } else {
      delete buttonRefs.current[key];
    }
  }, []);

  const tooltipItems = useMemo(() => {
    if (!tooltip) return [];
    if (!activityMap) return [];
    return activityMap[tooltip.key] ?? [];
  }, [tooltip, activityMap]);

  const tooltipPosition = useMemo(() => {
    if (!tooltip || !isMobile || typeof window === "undefined") return null;
    const button = buttonRefs.current[tooltip.key];
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    const anchorX = rect.left + rect.width / 2;
    const anchorY = rect.bottom;
    const viewportWidth = window.innerWidth || 320;
    const viewportHeight = window.innerHeight || 640;
    const width = Math.min(320, viewportWidth - 16);
    const top = clamp(anchorY + 12, 8, viewportHeight - 200);
    const left = clamp(anchorX - width / 2, 8, viewportWidth - width - 8);
    const arrowX = anchorX - left;
    return { top, left, width, arrowX };
  }, [tooltip, isMobile]);

  const tooltipPortal =
    tooltip &&
    tooltipItems.length > 0 &&
    tooltipPosition &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            className="mini-calendar-tooltip"
            style={
              {
                top: tooltipPosition.top,
                left: tooltipPosition.left,
                width: tooltipPosition.width,
                "--mini-calendar-tooltip-arrow": `${tooltipPosition.arrowX}px`,
              } as MiniCalendarTooltipStyle
            }
            ref={(node) => {
              tooltipRef.current = node;
            }}
            role="dialog"
            aria-label={tooltip.date.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          >
            <div className="mini-calendar-tooltip__header">
              <div className="mini-calendar-tooltip__title">
                {tooltip.date.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </div>
              <button
                type="button"
                className="mini-calendar-tooltip__close"
                onClick={() => setTooltip(null)}
                aria-label="Close day details"
              >
                <X className="mini-calendar-tooltip__close-icon" aria-hidden />
              </button>
            </div>
            <ul className="mini-calendar-tooltip__list">
              {tooltipItems.map((item) => {
                const iconColor =
                  item.color ?? indicatorColor ?? rangeColor ?? undefined;
                const meta: string[] = [];
                if (item.time) {
                  meta.push(item.time);
                }
                if (item.note) {
                  meta.push(item.note);
                }
                if (item.type === "task" && item.isCompleted) {
                  meta.push("Completed");
                }

                const titleClassName = [
                  "mini-calendar-tooltip__item-title",
                  item.type === "task" && item.isCompleted ? "is-completed" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <li key={item.id} className="mini-calendar-tooltip__item">
                    <span
                      className="mini-calendar-tooltip__icon"
                      style={{ color: iconColor }}
                      aria-hidden
                    >
                      {item.type === "task" ? (
                        <CheckSquare className="mini-calendar-tooltip__icon-svg" />
                      ) : (
                        <Clock className="mini-calendar-tooltip__icon-svg" />
                      )}
                    </span>
                    <div className="mini-calendar-tooltip__item-body">
                      <div className={titleClassName}>{item.title}</div>
                      {meta.length > 0 ? (
                        <div className="mini-calendar-tooltip__item-meta">
                          {meta.join(" • ")}
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="mini-calendar">
      <div className="mini-calendar__header">
        <div className="mini-calendar__title">
          <span>{monthName}</span>
          <button
            type="button"
            className="mini-calendar__target-button"
            onClick={handleFocusFinishLine}
            aria-label="Jump to project finishline"
            title="Jump to project finishline"
            disabled={!finishLineDate}
          >
            <Target className="mini-calendar__target-icon" aria-hidden />
          </button>
        </div>
        <div className="mini-calendar__nav">
          <button
            type="button"
            className="mini-calendar__nav-button"
            onClick={() =>
              onChange(new Date(value.getFullYear(), value.getMonth() - 1, 1))
            }
            aria-label="Previous month"
          >
            <ChevronLeft className="mini-calendar__nav-icon" />
          </button>
          <button
            type="button"
            className="mini-calendar__nav-button"
            onClick={() =>
              onChange(new Date(value.getFullYear(), value.getMonth() + 1, 1))
            }
            aria-label="Next month"
          >
            <ChevronRight className="mini-calendar__nav-icon" />
          </button>
        </div>
      </div>
      <div className="mini-calendar__weekday-row">
        {"SMTWTFS".split("").map((char, index) => (
          <div key={`${char}-${index}`} className="mini-calendar__weekday">
            {char}
          </div>
        ))}
      </div>
      <div className="mini-calendar__grid">
        {days.map((day) => {
          const key = fmt(day);
          const isToday = key === todayKey;
          const isCurrentMonth = day.getMonth() === value.getMonth();
          const isSelected = isSameDay(day, value);
          const rangeStartMatch = normalizedRange?.start
            ? isSameDay(day, normalizedRange.start)
            : false;
          const rangeEndMatch = normalizedRange?.end
            ? isSameDay(day, normalizedRange.end)
            : false;
          const isBetweenRange =
            normalizedRange?.start && normalizedRange.end
              ? day > normalizedRange.start && day < normalizedRange.end
              : false;
          const isRangeEdge = rangeStartMatch || rangeEndMatch;
          const isInRange = isBetweenRange || isRangeEdge;
          const dayActivities = activityMap?.[key] ?? [];
          const hasActivity = dayActivities.length > 0 || activityDateSet.has(key);
          const className = [
            "mini-calendar__day-button",
            isCurrentMonth ? "is-current" : "is-outside",
            isToday ? "is-today" : "",
            isSelected ? "is-selected" : "",
            isInRange ? "is-in-range" : "",
            rangeStartMatch ? "is-range-start" : "",
            rangeEndMatch ? "is-range-end" : "",
            hasActivity ? "has-activity" : "",
          ]
            .filter(Boolean)
            .join(" ");

          const indicator = dayActivities[0]?.color ?? indicatorColor ?? rangeColor;
          const style: MiniCalendarStyle = {};
          if (isRangeEdge && rangeColor) {
            style["--mini-calendar-accent"] = rangeColor;
          }
          if (indicator) {
            style["--mini-calendar-indicator"] = indicator;
          }
          const hasCustomStyle = Object.keys(style).length > 0;

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => {
                onChange(day);
                if (!isMobile) {
                  return;
                }
                const items = activityMap?.[key] ?? [];
                if (!items.length) {
                  setTooltip(null);
                  return;
                }
                setTooltip((previous) => {
                  if (previous && previous.key === key) {
                    return null;
                  }
                  return {
                    key,
                    date: new Date(day.getFullYear(), day.getMonth(), day.getDate()),
                  };
                });
              }}
              className={className}
              style={hasCustomStyle ? style : undefined}
              ref={(node) => registerDayRef(key, node)}
            >
              <span className="mini-calendar__day-number">{day.getDate()}</span>
              {hasActivity ? (
                <span className="mini-calendar__day-indicator" aria-hidden>
                  <Clock className="mini-calendar__day-indicator-icon" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {tooltipPortal}
    </div>
  );
}

export default MiniCalendar;
