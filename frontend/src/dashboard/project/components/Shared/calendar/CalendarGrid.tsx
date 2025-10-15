import React, { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { endOfWeek, rangePct, startOfWeek } from "@/dashboard/home/utils/dateUtils";
import { getColor } from "@/shared/utils/colorUtils";
import CalendarDayButton from "./CalendarDayButton";
import { DOT_SIZE, DOT_STROKE } from "./constants";
import type { TimelineEvent } from "./types";
import { formatDateLabel } from "./utils";

interface CalendarGridDay {
  date: Date;
  key: string;
  inMonth: boolean;
}

interface CalendarGridProps {
  monthTitle: string;
  weekdayLabels: string[];
  weeks: CalendarGridDay[][];
  startDate: Date | null;
  endDate: Date | null;
  projectColor: string;
  selectedKey: string | null;
  todayKey: string | null;
  flashKey: string | null;
  rangeSet: Set<string>;
  eventsByDate: Record<string, TimelineEvent[]>;
  onDayOpen: (anchor: HTMLButtonElement, meta: { date: Date; dayKey: string; inMonth: boolean }) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

const CalendarGrid: React.FC<CalendarGridProps> = ({
  monthTitle,
  weekdayLabels,
  weeks,
  startDate,
  endDate,
  projectColor,
  selectedKey,
  todayKey,
  flashKey,
  rangeSet,
  eventsByDate,
  onDayOpen,
  onPrevMonth,
  onNextMonth,
}) => {
  const weekTracks = useMemo(() => {
    return weeks.map((week) => {
      if (!week.length) return null;
      const rowStart = startOfWeek(week[0].date);
      const rowEnd = endOfWeek(week[0].date);
      if (startDate && endDate) {
        const { left, width } = rangePct(startDate, endDate, rowStart, rowEnd);
        if (width > 0) {
          return { left, width };
        }
      }
      return null;
    });
  }, [weeks, startDate, endDate]);

  return (
    <div className="month-widget">
      <div className="month-widget-header">
        <button className="month-nav-btn" onClick={onPrevMonth} aria-label="Previous month">
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>
        <span className="month-title">{monthTitle}</span>
        <button className="month-nav-btn" onClick={onNextMonth} aria-label="Next month">
          <FontAwesomeIcon icon={faChevronRight} />
        </button>
      </div>

      <div className="calendar-weekdays">
        {weekdayLabels.map((label, idx) => (
          <div key={`${label}-${idx}`} className="calendar-weekday">
            {label}
          </div>
        ))}
      </div>

      <div className="calendar-weeks">
        {weeks.map((week, weekIdx) => {
          const track = weekTracks[weekIdx];
          return (
            <div className="calendar-week" key={`week-${weekIdx}`}>
              {track && (
                <div
                  className="calendar-week-track"
                  style={{
                    left: `calc(${track.left}% - 3px)`,
                    width: `calc(${track.width}% + 6px)`,
                    backgroundColor: projectColor,
                    opacity: 1,
                  }}
                  aria-hidden
                />
              )}

              {week.map(({ date, key, inMonth }) => {
                const dayEvents = eventsByDate[key] || [];
                const primaryEvent = dayEvents[0];
                const iconColor =
                  projectColor ||
                  (primaryEvent ? getColor(primaryEvent.description || primaryEvent.id || key) : undefined);
                const hasEvents = dayEvents.length > 0;
                const isSelected = selectedKey === key;
                const isToday = todayKey === key;
                const isFlashing = flashKey === key;
                const inRange = rangeSet.has(key);
                const label = formatDateLabel(date);

                return (
                  <div key={key} className="calendar-day-wrapper">
                    <CalendarDayButton
                      date={date}
                      dayKey={key}
                      inMonth={inMonth}
                      isSelected={isSelected}
                      isToday={isToday}
                      isFlashing={isFlashing}
                      inRange={inRange}
                      hasEvents={hasEvents}
                      label={`Events on ${label}`}
                      onOpen={onDayOpen}
                    >
                      <div className="tile-date-number">{date.getDate()}</div>

                      <div className="day-dots">
                        {hasEvents && (
                          <svg
                            key={`${key}-dot`}
                            width={DOT_SIZE}
                            height={DOT_SIZE}
                            viewBox="0 0 24 24"
                            style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,.45))" }}
                            aria-hidden
                          >
                            <circle cx="12" cy="12" r="10" fill="rgba(0,0,0,0.65)" />
                            <circle
                              cx="12"
                              cy="12"
                              r={10 - DOT_STROKE}
                              fill="none"
                              stroke={iconColor}
                              strokeWidth={DOT_STROKE}
                            />
                            <path
                              d="M12 7v5l3 2"
                              stroke={iconColor}
                              strokeWidth={DOT_STROKE}
                              fill="none"
                              strokeLinecap="round"
                            />
                          </svg>
                        )}
                      </div>
                    </CalendarDayButton>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CalendarGrid;
