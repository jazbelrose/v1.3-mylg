import React, { MouseEvent as ReactMouseEvent } from "react";

interface CalendarDayButtonProps {
  date: Date;
  dayKey: string;
  inMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
  isFlashing: boolean;
  inRange: boolean;
  isRangeStart: boolean;
  isRangeEnd: boolean;
  isRangeMiddle: boolean;
  projectColor: string;
  hasEvents: boolean;
  label: string;
  onOpen: (anchor: HTMLButtonElement, meta: { date: Date; dayKey: string; inMonth: boolean }) => void;
  children: React.ReactNode;
}

const CalendarDayButton = React.forwardRef<HTMLButtonElement, CalendarDayButtonProps>(
  ({
    date,
    dayKey,
    inMonth,
    isSelected,
    isToday,
    isFlashing,
    inRange,
    isRangeStart,
    isRangeEnd,
    isRangeMiddle,
    projectColor,
    hasEvents,
    label,
    onOpen,
    children,
  }, ref) => {
    const className = [
      "calendar-day",
      inMonth ? "" : "calendar-day--muted",
      isToday ? "today" : "",
      isSelected ? "selected" : "",
      isFlashing ? "tile-highlight" : "",
      inRange ? "in-range" : "",
      isRangeStart ? "range-start" : "",
      isRangeEnd ? "range-end" : "",
      isRangeMiddle ? "range-middle" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const handleOpen = (
      event: ReactMouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>
    ) => {
      event.preventDefault();
      onOpen(event.currentTarget, { date, dayKey, inMonth });
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        handleOpen(event);
      }
    };

    const suffix = hasEvents ? ", has events" : ", no events";

    return (
      <button
        type="button"
        ref={ref}
        data-stopnav
        className={className}
        style={projectColor ? ({ ["--project-color" as const]: projectColor } as React.CSSProperties) : undefined}
        aria-pressed={isSelected}
        aria-haspopup="dialog"
        aria-label={`${label}${suffix}`}
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
      >
        {children}
      </button>
    );
  }
);

CalendarDayButton.displayName = "CalendarDayButton";

export default CalendarDayButton;
