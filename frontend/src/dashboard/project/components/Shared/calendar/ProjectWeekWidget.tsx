import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WeekWidget, { type Dot, type Track } from "@/dashboard/home/components/WeekWidget";
import { addDays, startOfWeek } from "@/dashboard/home/utils/dateUtils";
import { getColor } from "@/shared/utils/colorUtils";
import { DayPopover, DaySheet } from "./DayOverlay";
import { useCalendarController } from "./useCalendarController";
import type { CalendarBaseProps } from "./CalendarBase";
import { formatHours, getDateKey, safeParse } from "./utils";
import "./project-week-widget.css";

type ProjectWeekWidgetProps = Omit<CalendarBaseProps, "wrapperClassName" | "dayHeaderIdPrefix"> & {
  className?: string;
};

const ensureFallbackAnchor = (() => {
  let fallback: HTMLButtonElement | null = null;
  return () => {
    if (fallback) return fallback;
    if (typeof document === "undefined") {
      return null;
    }
    fallback = document.createElement("button");
    fallback.type = "button";
    fallback.style.display = "none";
    document.body.appendChild(fallback);
    return fallback;
  };
})();

const ProjectWeekWidget: React.FC<ProjectWeekWidgetProps> = ({
  project,
  initialFlashDate,
  onDateSelect,
  onWrapperClick,
  showEventList = false,
  className = "",
}) => {
  const controller = useCalendarController({
    project,
    initialFlashDate,
    onDateSelect,
    onWrapperClick,
    dayHeaderIdPrefix: "project-week-widget-day",
    showEventList,
  });

  const { wrapperHandlers, startDate, endDate, projectColor, selectedKey, eventsByDate, openDay, overlayState, modal } =
    controller;

  const [weekOf, setWeekOf] = useState<Date>(() => {
    return safeParse(initialFlashDate) || safeParse(selectedKey) || new Date();
  });

  const weekOfRef = useRef<Date>(weekOf);
  useEffect(() => {
    weekOfRef.current = weekOf;
  }, [weekOf]);

  useEffect(() => {
    const parsed = safeParse(selectedKey);
    if (!parsed) return;
    const currentKey = getDateKey(weekOfRef.current);
    const nextKey = getDateKey(parsed);
    if (currentKey !== nextKey) {
      setWeekOf(parsed);
    }
    // Only re-run when selectedKey changes. The ref above provides the latest
    // weekOf value without requiring it in the dependency list, which prevents
    // user-driven week navigation from being immediately overridden by the
    // selectedKey sync.
  }, [selectedKey]);

  const handleWeekChange = useCallback(
    (weekStartDate: Date) => {
      const currentStart = startOfWeek(weekOf);
      const offset = Math.max(
        0,
        Math.min(6, Math.round((weekOf.getTime() - currentStart.getTime()) / 86400000))
      );
      const target = addDays(weekStartDate, offset);
      setWeekOf(target);
    },
    [weekOf]
  );

  const handleSelectDate = useCallback(
    (date: Date) => {
      setWeekOf(date);
      onDateSelect?.(getDateKey(date));
    },
    [onDateSelect]
  );

  const registerDayRef = useRef<Record<string, HTMLButtonElement | null>>({});

  const handleRegisterDayRef = useCallback((day: Date, key: string, node: HTMLButtonElement | null) => {
    if (node) {
      registerDayRef.current[key] = node;
    } else {
      delete registerDayRef.current[key];
    }
  }, []);

  const getAnchorForKey = useCallback(
    (key: string) => {
      return registerDayRef.current[key] || ensureFallbackAnchor();
    },
    []
  );

  const tracks = useMemo<Track[]>(() => {
    if (!startDate || !endDate) return [];
    return [
      {
        id: "project-range",
        color: projectColor,
        start: startDate,
        end: endDate,
      },
    ];
  }, [startDate, endDate, projectColor]);

  const dots = useMemo<Dot[]>(() => {
    return Object.entries(eventsByDate).reduce<Dot[]>((acc, [key, items]) => {
      const parsed = safeParse(key);
      if (!parsed) return acc;
      items.forEach((event, index) => {
        const color = projectColor || getColor(event.description || event.id || `${key}-${index}`);
        acc.push({ date: parsed, color });
      });
      return acc;
    }, []);
  }, [eventsByDate, projectColor]);

  const getTooltipItems = useCallback(
    (date: Date) => {
      const key = getDateKey(date);
      if (!key) return [];

      const dayEvents = eventsByDate[key] || [];

      const items: Array<{ id: string; title?: string; time?: string; color?: string; note?: string; onSelect?: () => void }> =
        dayEvents.map((event, index) => ({
        id: event.id || `${key}-event-${index}`,
        title: event.description || "Untitled Event",
        time: formatHours(event.hours) || undefined,
        color: projectColor || getColor(event.description || event.id || key),
        onSelect: () => {
          const anchor = getAnchorForKey(key);
          if (anchor) {
            openDay(anchor, { date, dayKey: key, inMonth: true });
          }
          overlayState.onEdit(event);
        },
      }));

      items.push({
        id: `${key}-add-event`,
        title: "Add Event",
        note: dayEvents.length ? "Schedule another timeline item" : "Schedule a timeline event",
        color: projectColor,
        onSelect: () => {
          const anchor = getAnchorForKey(key);
          if (anchor) {
            openDay(anchor, { date, dayKey: key, inMonth: true });
          }
          overlayState.onNew();
        },
      });

      return items;
    },
    [eventsByDate, getAnchorForKey, openDay, overlayState, projectColor]
  );

  const weekWidgetClass = ["project-week-widget", className].filter(Boolean).join(" ");

  const handleWrapperClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      wrapperHandlers.onClick(event);
    },
    [wrapperHandlers]
  );

  return (
    <div
      className={weekWidgetClass}
      onClick={handleWrapperClick}
      onMouseEnter={wrapperHandlers.onMouseEnter}
      onMouseMove={wrapperHandlers.onMouseMove}
      onMouseLeave={wrapperHandlers.onMouseLeave}
      role="presentation"
    >
      <WeekWidget
        weekOf={weekOf}
        tracks={tracks}
        dots={dots}
        onPrevWeek={handleWeekChange}
        onNextWeek={handleWeekChange}
        onSelectDate={handleSelectDate}
        getTooltipItems={getTooltipItems}
        registerDayRef={handleRegisterDayRef}
        className="project-week-widget-inner"
        isMobile
      />

      {overlayState.isOpen && overlayState.dayKey && (
        overlayState.isMobile ? (
          <DaySheet
            headerId={overlayState.headerId}
            dateLabel={overlayState.dateLabel}
            events={overlayState.events}
            onClose={overlayState.close}
            onNew={overlayState.onNew}
            onEdit={overlayState.onEdit}
            onDelete={overlayState.onDelete}
          />
        ) : overlayState.anchor ? (
          <DayPopover
            anchor={overlayState.anchor}
            headerId={overlayState.headerId}
            dateLabel={overlayState.dateLabel}
            events={overlayState.events}
            onClose={() => overlayState.close()}
            onNew={overlayState.onNew}
            onEdit={overlayState.onEdit}
            onDelete={overlayState.onDelete}
          />
        ) : null
      )}

      {modal.component}
    </div>
  );
};

export default ProjectWeekWidget;
