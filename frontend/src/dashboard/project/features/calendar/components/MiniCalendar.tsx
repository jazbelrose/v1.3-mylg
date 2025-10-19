import React, { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { getMonthMatrix, fmt, isSameDay } from "../utils";

export type MiniCalendarProps = {
  value: Date;
  onChange: (d: Date) => void;
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
  rangeColor?: string | null;
};

type MiniCalendarStyle = React.CSSProperties & {
  "--mini-calendar-accent"?: string;
};

function MiniCalendar({ value, onChange, rangeStart, rangeEnd, rangeColor }: MiniCalendarProps) {
  const days = useMemo(() => getMonthMatrix(value), [value]);
  const monthName = value.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

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

  return (
    <div className="mini-calendar">
      <div className="mini-calendar__header">
        <div className="mini-calendar__title">{monthName}</div>
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
          const isToday = fmt(day) === fmt(new Date());
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
          const className = [
            "mini-calendar__day-button",
            isCurrentMonth ? "is-current" : "is-outside",
            isToday ? "is-today" : "",
            isSelected ? "is-selected" : "",
            isInRange ? "is-in-range" : "",
            rangeStartMatch ? "is-range-start" : "",
            rangeEndMatch ? "is-range-end" : "",
          ]
            .filter(Boolean)
            .join(" ");

          const style: MiniCalendarStyle | undefined =
            isRangeEdge && rangeColor
              ? { "--mini-calendar-accent": rangeColor }
              : undefined;

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onChange(day)}
              className={className}
              style={style}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default MiniCalendar;
