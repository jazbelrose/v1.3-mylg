import React, {
  useMemo,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
} from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { useData } from "@/app/contexts/useData";
import "./AllProjectsCalendar.css";
import { useNavigate } from "react-router-dom";
import { getColor } from "@/shared/utils/colorUtils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { TimelineEvent } from "@/shared/utils/api";
import { faClock } from "@fortawesome/free-solid-svg-icons";
import { WeekWidget } from "./WeekWidget";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";

// --- Types ---
type Project = {
  projectId: string;
  title?: string;
  color?: string;
  dateCreated?: string;     // YYYY-MM-DD or parseable string
  finishline?: string;      // YYYY-MM-DD or parseable string
  thumbnail?: string;
  timelineEvents?: TimelineEvent[];
  // injected at runtime:
  lane?: number;
};

type RangeMap = Record<string, Project[]>;
type CalendarEvent = TimelineEvent & {
  projectId: string;
  projectTitle?: string;
  spanStart?: Date;
  spanEnd?: Date;
};
type EventsMap = Record<string, CalendarEvent[]>;

// --- Helpers ---
function safeParseDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  // allow simple YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map((p) => parseInt(p, 10));
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(dateStr);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  return null;
}

// Returns YYYY-MM-DD in UTC (prevents TZ drift across tiles)
function getDateKey(date: Date | null | undefined): string | null {
  if (!date) return null;
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  return utc.toISOString().slice(0, 10);
}

function isSameDay(a?: Date | null, b?: Date | null) {
  return !!(
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function parseInstant(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatTimeString(date: Date) {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function getTooltipTimeLabel(event: CalendarEvent): string | undefined {
  const startInstant = parseInstant(event.startAt ?? event.date ?? null);
  const endInstant = parseInstant(event.endAt ?? event.date ?? event.startAt ?? null);
  const resolvedEnd = endInstant && startInstant && endInstant < startInstant ? startInstant : endInstant;

  if (startInstant && resolvedEnd) {
    if (isSameDay(startInstant, resolvedEnd)) {
      return `${formatTimeString(startInstant)} – ${formatTimeString(resolvedEnd)}`;
    }
    return `${formatDayLabel(startInstant)} – ${formatDayLabel(resolvedEnd)}`;
  }

  if (startInstant) {
    return event.allDay ? formatDayLabel(startInstant) : formatTimeString(startInstant);
  }

  if (event.spanStart && event.spanEnd && event.spanEnd > event.spanStart) {
    return `${formatDayLabel(event.spanStart)} – ${formatDayLabel(event.spanEnd)}`;
  }

  if (event.spanStart) {
    return formatDayLabel(event.spanStart);
  }

  return undefined;
}

function getEventSortValue(event: CalendarEvent) {
  const instant = parseInstant(event.startAt ?? event.date ?? event.endAt ?? null);
  return event.spanStart?.getTime() ?? (instant ? instant.getTime() : 0);
}

// --- Component ---
const AllProjectsCalendar: React.FC = () => {
  const { projects, fetchProjectDetails } = useData();
  const navigate = useNavigate();

  const colorMap = useMemo<Record<string, string | undefined>>(() => {
    const map: Record<string, string | undefined> = {};
    (projects ?? []).forEach((p) => {
      const c = (p as Project)?.color;
      map[p.projectId] = typeof c === 'string' ? c : undefined;
    });
    return map;
  }, [projects]);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentWeek, setCurrentWeek] = useState<Date>(new Date());
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const hoverTimer = useRef<number | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [tooltipOffset, setTooltipOffset] = useState(0);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    if (typeof window !== "undefined") {
      handleResize();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, []);

  const handleProjectClick = async (project: Project, flashDate?: string) => {
    await fetchProjectDetails(project.projectId);
    navigate(getProjectDashboardPath(project.projectId, project.title), {
      state: flashDate ? { flashDate } : undefined,
    });
  };

  // Assign non-overlapping "lanes" for running bars
  const projectsWithLanes = useMemo<Project[]>(() => {
    if (!projects?.length) return [];
    const sorted = [...projects].sort((a, b) => {
      const aDate = safeParseDate(((a as Project)?.dateCreated as string | undefined));
      const bDate = safeParseDate(((b as Project)?.dateCreated as string | undefined));
      return (aDate?.getTime() ?? 0) - (bDate?.getTime() ?? 0);
    });

    const lanes: (Date | null)[] = [];
    return sorted.map((p) => {
      const start = safeParseDate(((p as Project)?.dateCreated as string | undefined));
      const end = safeParseDate(((p as Project)?.finishline as string | undefined));
      let lane = 0;
      if (start && end) {
        while (lanes[lane] && (lanes[lane] as Date) >= start) {
          lane += 1;
        }
        lanes[lane] = end;
      }
      return { ...p, lane };
    });
  }, [projects]);

  const maxLane = useMemo<number>(
    () =>
      projectsWithLanes.length
        ? Math.max(...projectsWithLanes.map((p) => p.lane ?? 0))
        : 0,
    [projectsWithLanes]
  );

  // Map date -> projects active that day
  const rangeMap = useMemo<RangeMap>(() => {
    const map: RangeMap = {};
    if (!projectsWithLanes?.length) return map;

    projectsWithLanes.forEach((project) => {
      const start = safeParseDate(((project as Project)?.dateCreated as string | undefined));
      const end = safeParseDate(((project as Project)?.finishline as string | undefined));
      if (!(start && end)) return;

      // iterate days inclusive
      for (
        let d = new Date(start.getTime());
        d.getTime() <= end.getTime();
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        const key = getDateKey(d);
        if (!key) continue;
        if (!map[key]) map[key] = [];
        map[key].push(project);
      }
    });

    // de-dupe per day by projectId & keep lane info
    Object.keys(map).forEach((day) => {
      const byId: Record<string, Project> = {};
      map[day].forEach((p) => {
        byId[p.projectId] = p;
      });
      map[day] = Object.values(byId);
    });

    return map;
  }, [projectsWithLanes]);

  // Map date -> events (normalize to YYYY-MM-DD as well)
  const eventsMap = useMemo<EventsMap>(() => {
    const map: EventsMap = {};
    if (!projects?.length) return map;

    projects.forEach((project) => {
      if (!Array.isArray(project.timelineEvents)) return;
      project.timelineEvents.forEach((ev) => {
        const start = safeParseDate(
          (ev?.startAt as string | undefined) ??
            (ev?.date as string | undefined) ??
            (ev?.endAt as string | undefined) ??
            null
        );
        if (!start) return;
        const endCandidate = safeParseDate(
          (ev?.endAt as string | undefined) ??
            (ev?.date as string | undefined) ??
            (ev?.startAt as string | undefined) ??
            null
        );
        const end = endCandidate && endCandidate >= start ? endCandidate : start;

        for (
          let cursor = new Date(start.getTime());
          cursor.getTime() <= end.getTime();
          cursor.setUTCDate(cursor.getUTCDate() + 1)
        ) {
          const key = getDateKey(cursor);
          if (!key) continue;
          if (!map[key]) map[key] = [];
          map[key].push({
            ...ev,
            projectId: project.projectId,
            projectTitle: project.title,
            spanStart: start,
            spanEnd: end,
          });
        }
      });
    });

    return map;
  }, [projects]);

  // Keep tooltip within viewport
  useLayoutEffect(() => {
    if (!hoverDate) {
      if (tooltipOffset !== 0) setTooltipOffset(0);
      return;
    }
    const el = tooltipRef.current;
    if (!el) return;
    const tile = el.parentElement;
    if (!tile) return;

    const margin = 4;
    const tooltipWidth = el.offsetWidth;
    const tileRect = tile.getBoundingClientRect();
    let offset = 0;

    const baseLeft = tileRect.left + tileRect.width / 2 - tooltipWidth / 2;
    const baseRight = baseLeft + tooltipWidth;

    if (baseLeft < margin) {
      offset = margin - baseLeft;
    } else if (baseRight > window.innerWidth - margin) {
      offset = window.innerWidth - margin - baseRight;
    }

    if (offset !== tooltipOffset) setTooltipOffset(offset);
   
  }, [hoverDate, tooltipOffset]);

  // Recalc tooltip on resize
  useEffect(() => {
    const handleResize = () => {
      if (hoverDate) setTooltipOffset(0);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [hoverDate]);

  const tileContent: (args: { date: Date; view: "month" | "year" | "decade" | "century" }) => React.ReactNode = ({
    date,
    view,
  }) => {
    if (view !== "month") return null;

    const dayKey = getDateKey(date);
    const activeProjects = dayKey ? rangeMap[dayKey] ?? [] : [];
    const dayEvents = dayKey ? eventsMap[dayKey] ?? [] : [];

    const uniqueEvents = (() => {
      const seen = new Set<string>();
      const list: CalendarEvent[] = [];
      dayEvents.forEach((ev, idx) => {
        const dedupeKey =
          ev.id ??
          ev.eventId ??
          `${ev.projectId}-${idx}-${dayKey ?? date.toISOString()}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        list.push(ev);
      });
      return list;
    })();

    const sortedEvents = [...uniqueEvents].sort(
      (a, b) => getEventSortValue(a) - getEventSortValue(b)
    );

    type TooltipEntry = {
      id: string;
      title: string;
      note?: string;
      time?: string;
      color: string;
      onSelect: () => void;
    };

    const tooltipItems: TooltipEntry[] = sortedEvents.map((event, idx) => {
      const id =
        event.id ??
        event.eventId ??
        `${event.projectId}-${idx}-${dayKey ?? date.toISOString()}`;
      const title = event.title ?? event.projectTitle ?? "Untitled";
      const note =
        event.description ??
        (event.payload && typeof event.payload.description === "string"
          ? event.payload.description
          : undefined);
      const time = getTooltipTimeLabel(event);
      const color = colorMap[event.projectId] || getColor(event.projectId);
      const onSelect = () =>
        handleProjectClick(
          { projectId: event.projectId, title: event.projectTitle } as Project,
          dayKey ?? undefined
        );
      return { id, title, note, time, color, onSelect };
    });

    const MAX_TOOLTIP_ITEMS = 3;
    const tooltipOverflowCount = Math.max(0, tooltipItems.length - MAX_TOOLTIP_ITEMS);
    const visibleTooltipItems = tooltipItems.slice(0, MAX_TOOLTIP_ITEMS);

    const showHover = () => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
      hoverTimer.current = window.setTimeout(() => setHoverDate(date), 100);
    };
    const hideHover = () => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
      hoverTimer.current = window.setTimeout(() => setHoverDate(null), 200);
    };
    const handleClick = () => {
      setSelectedDate(date);
      if (isMobile) setHoverDate(date);
    };

    const isHovered = hoverDate && getDateKey(hoverDate) === dayKey;

    // Dots (events)
    const MAX_DOTS = 3;
    const dotsToRender = uniqueEvents.slice(0, MAX_DOTS);
    const overflowCount = Math.max(0, uniqueEvents.length - MAX_DOTS);

    return (
      <div
        className="tile-minimal"
        style={{ ["--lane-count" as string]: maxLane + 1 }}
        onMouseEnter={!isMobile ? showHover : undefined}
        onMouseLeave={!isMobile ? hideHover : undefined}
        onClick={handleClick}
      >
        <div className="tile-dots">
          {dotsToRender.map((event, idx) => (
            <FontAwesomeIcon
              key={`e-${idx}`}
              icon={faClock}
              className="event-dot"
              style={{ color: colorMap[event.projectId] || getColor(event.projectId) }}
              title={event.description}
            />
          ))}
          {overflowCount > 0 && (
            <span className="tile-dot-more-pill" aria-label={`${overflowCount} more events`}>
              +{overflowCount}
            </span>
          )}
        </div>

        <div className="tile-date-number">{date.getDate()}</div>

        <div className="timeline-bars">
          {Array.from({ length: maxLane + 1 }).map((_, laneIdx) => {
            const proj = activeProjects.find((p) => p.lane === laneIdx);
            if (!proj) {
              return (
                <div
                  key={laneIdx}
                  className="timeline-bar"
                  style={{ visibility: "hidden" }}
                />
              );
            }

            const prevDate = new Date(date);
            prevDate.setDate(prevDate.getDate() - 1);
            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);

            const prevKey = getDateKey(prevDate);
            const nextKey = getDateKey(nextDate);

            const prevProjects = prevKey ? rangeMap[prevKey] ?? [] : [];
            const nextProjects = nextKey ? rangeMap[nextKey] ?? [] : [];

            const hasPrev = prevProjects.some(
              (p) => p.projectId === proj.projectId && (p.lane ?? 0) === laneIdx
            );
            const hasNext = nextProjects.some(
              (p) => p.projectId === proj.projectId && (p.lane ?? 0) === laneIdx
            );

            return (
              <div
                key={laneIdx}
                className="timeline-bar"
                style={{
                  backgroundColor: colorMap[proj.projectId] || getColor(proj.projectId),
                  borderTopLeftRadius: hasPrev ? 0 : 5,
                  borderBottomLeftRadius: hasPrev ? 0 : 5,
                  borderTopRightRadius: hasNext ? 0 : 5,
                  borderBottomRightRadius: hasNext ? 0 : 5,
                }}
                title={proj.title}
                onClick={(e) => {
                  e.stopPropagation();
                  const flashDate = getDateKey(date) ?? undefined;
                  handleProjectClick(proj, flashDate);
                }}
              />
            );
          })}
        </div>

        {isHovered && tooltipItems.length > 0 && (
          <div
            ref={tooltipRef}
            className={`tile-tooltip visible${tooltipOverflowCount > 0 ? " tile-tooltip--has-overflow" : ""}`}
            style={{
              transform: `translateX(calc(-50% + ${tooltipOffset}px)) translateY(-4px)`,
            }}
          >
            {visibleTooltipItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="tooltip-item"
                onClick={() => {
                  item.onSelect();
                  setHoverDate(null);
                }}
              >
                <span className="tooltip-dot" style={{ background: item.color }} aria-hidden="true" />
                <div className="tooltip-text">
                  <div className="tooltip-header">
                    <span className="tooltip-title">{item.title}</span>
                    {item.time && <span className="tooltip-time">{item.time}</span>}
                  </div>
                  {item.note && <span className="tooltip-info">{item.note}</span>}
                </div>
              </button>
            ))}
            {tooltipOverflowCount > 0 && (
              <span className="tile-tooltip-more-pill" aria-label={`+${tooltipOverflowCount} more events`}>
                +{tooltipOverflowCount}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  const tileClassName = () => null;

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    if (isMobile) setHoverDate(date);
    // (Kept for parity with your original) – combined is calculated on hover tile as well
    // If you want a click panel later, you already have the pieces here.
  };

  // Week widget data transformation
  const weekWidgetTracks = useMemo(() => {
    if (!projectsWithLanes?.length) return [];
    
    return projectsWithLanes.map((project) => {
      const start = safeParseDate(((project as Project)?.dateCreated as string | undefined));
      const end = safeParseDate(((project as Project)?.finishline as string | undefined));
      
      if (!start || !end) return null;
      
      return {
        id: project.projectId,
        color: colorMap[project.projectId] || getColor(project.projectId),
        start,
        end,
      };
    }).filter(Boolean) as Array<{ id: string; color: string; start: Date; end: Date }>;
  }, [projectsWithLanes, colorMap]);

  const weekWidgetDots = useMemo(() => {
    if (!projects?.length) return [];
    
    const dots: Array<{ date: Date; color?: string }> = [];
    
    projects.forEach((project) => {
      if (!Array.isArray(project.timelineEvents)) return;
      
      project.timelineEvents.forEach((ev) => {
        const eventDate = safeParseDate((ev?.date as string | undefined) ?? null);
        if (eventDate) {
          dots.push({
            date: eventDate,
            color: colorMap[project.projectId] || getColor(project.projectId),
          });
        }
      });
    });
    
    return dots;
  }, [projects, colorMap]);

  const handleWeekNavigation = (newWeek: Date) => {
    setCurrentWeek(newWeek);
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setCurrentWeek(date); // Keep week in sync with selected date
  };

  const getWeekTooltipItems = (date: Date) => {
    const key = getDateKey(date);
    if (!key) return [];
    const activeProjects = rangeMap[key] ?? [];
    const dayEvents = eventsMap[key] ?? [];

    const makeOnSelect = (projectId: string, title?: string) => () => {
      const project =
        activeProjects.find((p) => p.projectId === projectId) ||
        projectsWithLanes.find((p) => p.projectId === projectId) ||
        (projects?.find((p) => p.projectId === projectId) as Project | undefined);
      if (project) {
        void handleProjectClick(project, key ?? undefined);
        return;
      }
      void handleProjectClick(
        { projectId, title } as Project,
        key ?? undefined
      );
    };

    const byId: Record<
      string,
      {
        id: string;
        title?: string;
        color?: string;
        time?: string;
        badge?: string;
        note?: string;
        onSelect?: () => void;
      }
    > = {};

    activeProjects.forEach((p) => {
      byId[p.projectId] = {
        id: p.projectId,
        title: p.title,
        color: colorMap[p.projectId] || getColor(p.projectId),
        onSelect: makeOnSelect(p.projectId, p.title),
      };
    });

    dayEvents.forEach((ev) => {
      const id = ev.projectId;
      if (!byId[id]) {
        byId[id] = {
          id,
          title: ev.title,
          color: colorMap[id] || getColor(id),
          onSelect: makeOnSelect(id, ev.title),
        };
      }
      if (ev.description) byId[id].note = ev.description as string;
    });

    return Object.values(byId);
  };

  return (
    <div className="all-projects-calendar-wrapper">
      {isMobile ? (
        <div className="mobile-calendar-container">
          <div className="mobile-calendar-header">
            <span className="calendar-title">Projects</span>
          </div>

          <WeekWidget
            weekOf={currentWeek}
            tracks={weekWidgetTracks}
            dots={weekWidgetDots}
            onPrevWeek={handleWeekNavigation}
            onNextWeek={handleWeekNavigation}
            onSelectDate={handleDateSelect}
            className="mobile-week-widget"
            getTooltipItems={getWeekTooltipItems}
            isMobile
          />
        </div>
      ) : (
        <Calendar
          onChange={(d) => setSelectedDate(d as Date)}
          value={selectedDate}
          tileContent={tileContent}
          tileClassName={tileClassName}
          onClickDay={handleDayClick}
          showNeighboringMonth={false}
          showFixedNumberOfWeeks
        />
      )}
    </div>
  );
};

export default AllProjectsCalendar;









