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
import { getFileUrl } from "../../../shared/utils/api";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import Squircle from "@/shared/ui/Squircle";
import SVGThumbnail from "./SvgThumbnail";

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

type CombinedTooltipItem = {
  projectId: string;
  title?: string;
  thumbnail?: string;
  finishline?: string;
  events: TimelineEvent[];
};

type RangeMap = Record<string, Project[]>;
type EventsMap = Record<string, (TimelineEvent & { projectId: string; title?: string })[]>;

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

const titleKey = (t?: string) => (t ?? "").toString();

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
        const key = getDateKey(safeParseDate((ev?.date as string | undefined) ?? null));
        if (!key) return;
        if (!map[key]) map[key] = [];
        map[key].push({
          ...ev,
          projectId: project.projectId,
          title: project.title,
        });
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

    // Merge projects + events (dedupe by projectId)
    const combined: Record<string, CombinedTooltipItem> = {};
    activeProjects.forEach((p) => {
      combined[p.projectId] = {
        projectId: p.projectId,
        title: p.title,
        thumbnail: p.thumbnail,
        finishline: p.finishline,
        events: [],
      };
    });
    dayEvents.forEach((ev) => {
      if (!combined[ev.projectId]) {
        combined[ev.projectId] = {
          projectId: ev.projectId,
          title: ev.title,
          thumbnail: undefined,
          finishline: undefined,
          events: [],
        };
      }
      combined[ev.projectId].events.push(ev);
    });

    // SAFE sort (prevents undefined.localeCompare crash)
    const tooltipItems = Object.values(combined).sort((a, b) =>
      titleKey(a.title).localeCompare(titleKey(b.title), undefined, { sensitivity: "base" })
    );

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
    const MAX_DOTS = 6;
    const showOverflow = dayEvents.length > MAX_DOTS;
    const dotsToRender = showOverflow ? dayEvents.slice(0, 2) : dayEvents.slice(0, MAX_DOTS);
    const overflowCount = showOverflow ? dayEvents.length - 2 : 0;

    return (
      <div
        className="tile-minimal"
        style={{ ["--lane-count" as string]: maxLane + 1 }}
        onMouseEnter={!isMobile ? showHover : undefined}
        onMouseLeave={!isMobile ? hideHover : undefined}
        onClick={handleClick}
      >
        <div className="tile-dots">
          {dotsToRender.map((e, idx) => (
            <FontAwesomeIcon
              key={`e-${idx}`}
              icon={faClock}
              className="event-dot"
              style={{ color: colorMap[e.projectId] || getColor(e.projectId) }}
              title={e.description}
            />
          ))}
          {overflowCount > 0 && <span className="event-overflow">+{overflowCount}</span>}
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
            className="tile-tooltip visible"
            style={{
              transform: `translateX(calc(-50% + ${tooltipOffset}px)) translateY(-4px)`,
            }}
          >
            {tooltipItems.slice(0, 3).map((item) => {
              const events = Array.isArray(item.events) ? item.events : [];
              return (
                <div
                  key={item.projectId}
                  className="tooltip-item"
                  onClick={() => handleProjectClick({ projectId: item.projectId, title: item.title } as Project)}
                >
                  <Squircle as="span" className="tooltip-thumb" aria-hidden radius={6}>
                    {item.thumbnail ? (
                      <img
                        src={getFileUrl(item.thumbnail)}
                        alt={item.title ?? "thumbnail"}
                        className="tooltip-thumb-image"
                      />
                    ) : (
                      <SVGThumbnail
                        initial={(item.title ?? "Untitled").trim().charAt(0).toUpperCase() || "#"}
                        className="tooltip-thumb-placeholder"
                      />
                    )}
                  </Squircle>
                  <div className="tooltip-text">
                    <div className="tooltip-header">
                      <span className="tooltip-title">{item.title ?? "Untitled"}</span>
                      {item.finishline && (
                        <span className="tooltip-date">
                          {new Date(String(item.finishline)).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {events.map((ev, idx) => (
                      <span key={idx} className="tooltip-info">
                        {(ev.description ?? "").toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
            {tooltipItems.length > 3 && (
              <div className="tooltip-more">+{tooltipItems.length - 3} more</div>
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









