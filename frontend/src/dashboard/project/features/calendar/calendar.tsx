import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Search,
  Plus,
  Check,
} from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  ProjectPageLayout,
  ProjectHeader,
  QuickLinksComponent,
  FileManager as FileManagerComponent,
} from "@/dashboard/project/components";
import { useProjectPalette } from "@/dashboard/project/hooks/useProjectPalette";
import { resolveProjectCoverUrl } from "@/dashboard/project/utils/theme";
import { useData } from "@/app/contexts/useData";
import { useSocket } from "@/app/contexts/SocketContext";
import type { Project } from "@/app/contexts/DataProvider";
import type { QuickLinksRef } from "@/dashboard/project/components";
import {
  createEvent,
  createTask as createTaskApi,
  fetchTasks,
  updateTask,
  type Task as ApiTask,
  type TimelineEvent as ApiTimelineEvent,
} from "@/shared/utils/api";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";

import "./calendar-preview.css";
import CreateCalendarItemModal, {
  type CreateCalendarItemTab,
  type CreateEventRequest,
  type CreateTaskRequest,
} from "./CreateCalendarItemModal";

type CalendarCategory = "Work" | "Education" | "Personal";

type CalendarEvent = {
  id: string;
  title: string;
  date: string; // ISO date (yyyy-mm-dd)
  start?: string; // "HH:MM"
  end?: string; // "HH:MM"
  description?: string;
  category: CalendarCategory;
};

type CalendarTask = {
  id: string;
  title: string;
  due?: string; // ISO date
  done?: boolean;
};

const categoryColor: Record<CalendarCategory, string> = {
  Work: "calendar-pill-work",
  Education: "calendar-pill-education",
  Personal: "calendar-pill-personal",
};

// ------------------------------------------------------
// Utilities
// ------------------------------------------------------

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const safeDate = (value?: string | null) => {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

const extractTime = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const match = value.match(/^(\d{1,2})(:?)(\d{2})?/);
    if (match) {
      const hours = pad(Number(match[1]));
      const minutes = match[3] ? pad(Number(match[3])) : "00";
      return `${hours}:${minutes}`;
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const clamped = Math.max(0, Math.min(23.99, value));
    const hours = Math.floor(clamped);
    const minutes = Math.round((clamped - hours) * 60);
    return `${pad(hours)}:${pad(minutes)}`;
  }
  return undefined;
};

const addHoursToTime = (time: string, hours: number) => {
  const [hh, mm] = time.split(":").map(Number);
  const totalMinutes = hh * 60 + mm + Math.round(hours * 60);
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const outH = Math.floor(normalized / 60);
  const outM = normalized % 60;
  return `${pad(outH)}:${pad(outM)}`;
};

const deriveCategory = (event: ApiTimelineEvent): CalendarCategory => {
  const textChunks = [
    event.type,
    (event as { category?: string }).category,
    event.phase,
    event.description,
    event.payload?.description,
  ]
    .flatMap((chunk) => (typeof chunk === "string" ? [chunk] : []))
    .map((chunk) => chunk.toLowerCase());

  if (textChunks.some((chunk) => chunk.match(/class|training|education|workshop/))) {
    return "Education";
  }
  if (textChunks.some((chunk) => chunk.match(/personal|holiday|break|lunch|off/))) {
    return "Personal";
  }
  return "Work";
};

const normalizeTimelineEvent = (event: ApiTimelineEvent): CalendarEvent | null => {
  const isoDate = event.date || event.timestamp?.slice(0, 10);
  if (!isoDate) return null;

  const startCandidate =
    (event as { start?: unknown }).start ??
    (event as { startHour?: unknown }).startHour ??
    event.payload?.start ??
    event.payload?.startTime;
  const endCandidate =
    (event as { end?: unknown }).end ??
    event.payload?.end ??
    event.payload?.endTime;

  const start = extractTime(startCandidate);
  const endRaw = extractTime(endCandidate);
  const durationHours = Number(
    (event as { hours?: unknown }).hours ?? event.payload?.hours
  );
  const end =
    endRaw || (start && Number.isFinite(durationHours) ? addHoursToTime(start, Number(durationHours)) : undefined);

  const payloadDescription = event.payload?.description;
  const payloadNotes = (event.payload as { notes?: string; details?: string })?.notes;
  const payloadDetails =
    payloadNotes ||
    (event.payload as { details?: string })?.details ||
    (payloadDescription && payloadDescription !== event.description ? payloadDescription : undefined);

  const title =
    (event as { title?: string }).title ||
    event.description ||
    payloadDescription ||
    "Untitled event";

  return {
    id:
      event.id ||
      event.eventId ||
      event.timelineEventId ||
      `${isoDate}-${Math.random().toString(36).slice(2)}`,
    title,
    date: isoDate,
    start,
    end,
    description:
      payloadDetails ||
      (payloadDescription && payloadDescription !== title ? payloadDescription : undefined) ||
      event.description ||
      payloadDescription ||
      undefined,
    category: deriveCategory(event),
  };
};

const normalizeTask = (task: ApiTask): CalendarTask => ({
  id:
    task.taskId ||
    (task as { id?: string }).id ||
    `${task.projectId}-${Math.random().toString(36).slice(2)}`,
  title: task.title ?? "Untitled task",
  due: task.dueDate?.slice(0, 10),
  done: task.status === "done",
});

const getMonthMatrix = (viewDate: Date) => {
  const start = startOfMonth(viewDate);
  const end = endOfMonth(viewDate);
  const startOffset = start.getDay();
  const daysInMonth = end.getDate();
  const days: Date[] = [];

  for (let i = 0; i < startOffset; i += 1) {
    days.push(addDays(start, i - startOffset));
  }
  for (let i = 1; i <= daysInMonth; i += 1) {
    days.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), i));
  }
  while (days.length % 7 !== 0) {
    days.push(addDays(end, days.length % 7));
  }
  while (days.length < 42) {
    days.push(addDays(days[days.length - 1], 1));
  }
  return days;
};

// ------------------------------------------------------
// Sidebar Mini Calendar (dark)
// ------------------------------------------------------

type MiniCalendarProps = {
  value: Date;
  onChange: (d: Date) => void;
};

function MiniCalendar({ value, onChange }: MiniCalendarProps) {
  const days = useMemo(() => getMonthMatrix(value), [value]);
  const monthName = value.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

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
          const className = [
            "mini-calendar__day-button",
            isCurrentMonth ? "is-current" : "is-outside",
            isToday ? "is-today" : "",
            isSelected ? "is-selected" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onChange(day)}
              className={className}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ------------------------------------------------------
// Top Bar (dark)
// ------------------------------------------------------

type TopBarProps = {
  onAdd: () => void;
};

function TopBar({ onAdd }: TopBarProps) {
  return (
    <div className="calendar-top-bar">
      <div className="calendar-top-bar__heading">
        <div className="calendar-top-bar__icon">
          <CalendarIcon className="calendar-top-bar__icon-svg" />
        </div>
        <div className="calendar-top-bar__title">Calendar</div>
      </div>
      <div className="calendar-top-bar__actions">
        <div className="calendar-top-bar__search">
          <Search className="calendar-top-bar__search-icon" />
          <input
            placeholder="Search for anything"
            className="calendar-top-bar__search-input"
          />
        </div>
        <button type="button" onClick={onAdd} className="calendar-top-bar__add">
          <Plus className="calendar-top-bar__add-icon" /> Add Event
        </button>
      </div>
    </div>
  );
};

// ------------------------------------------------------
// Month Grid (dark)
// ------------------------------------------------------

type MonthGridProps = {
  viewDate: Date;
  selectedDate: Date;
  events: CalendarEvent[];
  onSelectDate: (d: Date) => void;
  onOpenCreate: (d: Date, tab?: CreateCalendarItemTab) => void;
};

function MonthGrid({
  viewDate,
  selectedDate,
  events,
  onSelectDate,
  onOpenCreate,
}: MonthGridProps) {
  const days = useMemo(() => getMonthMatrix(viewDate), [viewDate]);
  const month = viewDate.getMonth();
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((event) => {
      if (!map.has(event.date)) map.set(event.date, []);
      map.get(event.date)!.push(event);
    });
    return map;
  }, [events]);

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const handleMouseLeave = (key: string) => {
    setHoveredKey((current) => (current === key ? null : current));
  };

  const handleOpenCreate = (day: Date, tab?: CreateCalendarItemTab) => {
    onSelectDate(day);
    onOpenCreate(day, tab);
  };

  return (
    <div className="month-grid">
      {"SUN,MON,TUE,WED,THU,FRI,SAT".split(",").map((label) => (
        <div key={label} className="month-grid__weekday">
          {label}
        </div>
      ))}
      {days.map((day) => {
        const isCurrentMonth = day.getMonth() === month;
        const key = fmt(day);
        const isSelected = isSameDay(day, selectedDate);
        const dayEvents = eventsByDate.get(key) || [];
        const className = [
          "month-grid__cell",
          isCurrentMonth ? "is-current" : "is-outside",
          isSelected ? "is-selected" : "",
        ]
          .filter(Boolean)
          .join(" ");

        const isHovered = hoveredKey === key;

        return (
          <div
            key={key}
            className={`${className}${isHovered ? " is-hovered" : ""}`.trim()}
            onMouseEnter={() => setHoveredKey(key)}
            onMouseLeave={() => handleMouseLeave(key)}
            onClick={() => handleOpenCreate(day)}
            role="presentation"
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleOpenCreate(day);
              }}
              className="month-grid__date"
            >
              {day.getDate()}
            </button>
            <div className="month-grid__events">
              {dayEvents.slice(0, 4).map((event) => (
                <div key={event.id} className="month-grid__event">
                  <span className={`month-grid__event-dot ${categoryColor[event.category]}`} />
                  <span className="month-grid__event-title" title={event.title}>
                    {event.title}
                  </span>
                </div>
              ))}
              {dayEvents.length > 4 && (
                <div className="month-grid__more">+{dayEvents.length - 4} more</div>
              )}
            </div>
            <div className="month-grid__actions">
              <button
                type="button"
                className="month-grid__actions-button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleOpenCreate(day, "Event");
                }}
              >
                + Event
              </button>
              <button
                type="button"
                className="month-grid__actions-button month-grid__actions-button--task"
                onClick={(event) => {
                  event.stopPropagation();
                  handleOpenCreate(day, "Task");
                }}
              >
                + Task
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ------------------------------------------------------
// Week Grid (dark)
// ------------------------------------------------------

type WeekGridProps = {
  anchorDate: Date;
  events: CalendarEvent[];
};

type WeekDayEvents = {
  allDay: CalendarEvent[];
  timed: CalendarEvent[];
};

const parseHour = (time?: string) => {
  if (!time) return undefined;
  const [h] = time.split(":").map(Number);
  if (Number.isNaN(h)) return undefined;
  return h;
};

function WeekGrid({ anchorDate, events }: WeekGridProps) {
  const start = useMemo(() => addDays(anchorDate, -anchorDate.getDay()), [anchorDate]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const hours = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 7), []); // 7am - 6pm

  const eventsByDay = useMemo(() => {
    const map = new Map<string, WeekDayEvents>();
    days.forEach((day) => {
      map.set(fmt(day), { allDay: [], timed: [] });
    });
    events.forEach((event) => {
      const bucket = map.get(event.date);
      if (!bucket) return;
      const hour = parseHour(event.start);
      if (hour == null) {
        bucket.allDay.push(event);
      } else {
        bucket.timed.push(event);
      }
    });
    return map;
  }, [days, events]);

  return (
    <div className="week-grid">
      <div className="week-grid__spacer" />
      {days.map((day) => (
        <div key={fmt(day)} className="week-grid__weekday">
          {day.toLocaleDateString(undefined, { weekday: "short" })} {day.getDate()}
        </div>
      ))}
      {hours.map((hour, hourIndex) => (
        <React.Fragment key={hour}>
          <div className="week-grid__hour">{pad(hour)}:00</div>
          {days.map((day) => {
            const key = fmt(day);
            const dayEvents = eventsByDay.get(key) ?? { allDay: [], timed: [] };
            const timed = dayEvents.timed.filter(
              (event) => parseHour(event.start) === hour
            );
            return (
              <div key={`${key}-${hour}`} className="week-grid__cell">
                {hourIndex === 0 && dayEvents.allDay.length > 0 && (
                  <div className="week-grid__all-day">
                    {dayEvents.allDay.map((event) => (
                      <div
                        key={event.id}
                        className={`week-grid__all-day-pill ${categoryColor[event.category]}`}
                      >
                        <div className="week-grid__event-title">{event.title}</div>
                        <div className="week-grid__event-time">All day</div>
                      </div>
                    ))}
                  </div>
                )}
                {timed.map((event) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0.4, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`week-grid__event ${categoryColor[event.category]}`}
                  >
                    <div className="week-grid__event-title">{event.title}</div>
                    <div className="week-grid__event-time">
                      {event.start} – {event.end || addHoursToTime(event.start!, 1)}
                    </div>
                  </motion.div>
                ))}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
};

// ------------------------------------------------------
// Day List (dark)
// ------------------------------------------------------

type DayListProps = {
  date: Date;
  events: CalendarEvent[];
};

function DayList({ date, events }: DayListProps) {
  const list = useMemo(
    () =>
      events
        .filter((event) => event.date === fmt(date))
        .sort((a, b) => (a.start || "").localeCompare(b.start || "")),
    [date, events]
  );

  if (list.length === 0) {
    return <div className="day-list__empty">No events for this day.</div>;
  }

  return (
    <div className="day-list">
      {list.map((event) => (
        <div key={event.id} className="day-list__item">
          <div className={`day-list__dot ${categoryColor[event.category]}`} />
          <div className="day-list__content">
            <div className="day-list__title">{event.title}</div>
            <div className="day-list__time">
              <Clock className="day-list__time-icon" />
              {event.start && event.end ? (
                <>{event.start} – {event.end}</>
              ) : (
                "All day"
              )}
            </div>
            {event.description && (
              <div className="day-list__description">{event.description}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// ------------------------------------------------------
// Sidebar: Events & Tasks (dark)
// ------------------------------------------------------

type EventsAndTasksProps = {
  events: CalendarEvent[];
  tasks: CalendarTask[];
  onToggleTask: (id: string) => void;
};

const compareDateStrings = (a?: string, b?: string) => {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
};

function EventsAndTasks({ events, tasks, onToggleTask }: EventsAndTasksProps) {
  const upcoming = useMemo(
    () =>
      [...events]
        .filter((event) => event.date >= fmt(new Date()))
        .sort((a, b) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          return compareDateStrings(a.start, b.start);
        })
        .slice(0, 6),
    [events]
  );

  return (
    <div className="events-tasks">
      <div className="events-tasks__title">Events & Tasks</div>

      <div className="events-tasks__section">
        <div className="events-tasks__section-title">Upcoming events</div>
        <ul className="events-tasks__list">
          {upcoming.map((event) => (
            <li key={event.id} className="events-tasks__list-item">
              <span className={`events-tasks__dot ${categoryColor[event.category]}`} />
              <span className="events-tasks__event-title" title={event.title}>
                {event.title}
              </span>
              <span className="events-tasks__meta">
                {event.date.slice(5)}
                {event.start ? ` · ${event.start}` : ""}
              </span>
            </li>
          ))}
          {upcoming.length === 0 && (
            <li className="events-tasks__empty">No upcoming events scheduled.</li>
          )}
        </ul>
      </div>

      <div className="events-tasks__section">
        <div className="events-tasks__section-title">Tasks</div>
        <ul className="events-tasks__list">
          {tasks.map((task) => (
            <li key={task.id} className="events-tasks__list-item">
              <input
                type="checkbox"
                checked={Boolean(task.done)}
                onChange={() => onToggleTask(task.id)}
                className="events-tasks__checkbox"
                style={{ accentColor: "#FA3356" }}
              />
              <span
                className={`events-tasks__task-title ${task.done ? "is-complete" : ""}`}
              >
                {task.title}
              </span>
              {task.due && (
                <span className="events-tasks__meta">due {task.due.slice(5)}</span>
              )}
            </li>
          ))}
          {tasks.length === 0 && (
            <li className="events-tasks__empty">
              No tasks yet. Add tasks to keep track of work.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};

// ------------------------------------------------------
// Calendar Surface
// ------------------------------------------------------

type CalendarSurfaceProps = {
  events: CalendarEvent[];
  tasks: CalendarTask[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onCreateEvent: (input: CreateEventRequest) => Promise<void>;
  onCreateTask: (input: CreateTaskRequest) => Promise<void>;
  onToggleTask: (id: string) => void;
};

const CalendarSurface: React.FC<CalendarSurfaceProps> = ({
  events,
  tasks,
  currentDate,
  onDateChange,
  onCreateEvent,
  onCreateTask,
  onToggleTask,
}) => {
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [internalDate, setInternalDate] = useState<Date>(currentDate);
  const [createState, setCreateState] = useState<{
    open: boolean;
    date: Date;
    tab: CreateCalendarItemTab;
  }>({ open: false, date: currentDate, tab: "Event" });

  useEffect(() => {
    setInternalDate((previous) =>
      isSameDay(previous, currentDate) ? previous : new Date(currentDate)
    );
  }, [currentDate]);

  useEffect(() => {
    onDateChange(internalDate);
  }, [internalDate, onDateChange]);

  const title = useMemo(
    () =>
      internalDate.toLocaleString(undefined, {
        month: "long",
        year: "numeric",
      }),
    [internalDate]
  );

  const go = useCallback((deltaMonths: number) => {
    setInternalDate((previousDate) => {
      const targetMonthStart = new Date(
        previousDate.getFullYear(),
        previousDate.getMonth() + deltaMonths,
        1
      );
      const daysInTargetMonth = endOfMonth(targetMonthStart).getDate();
      const clampedDay = Math.min(previousDate.getDate(), daysInTargetMonth);
      targetMonthStart.setDate(clampedDay);
      return targetMonthStart;
    });
  }, []);

  const handleSelectDate = useCallback((date: Date) => {
    setInternalDate(date);
  }, []);

  const handleOpenCreate = useCallback(
    (date: Date, tab: CreateCalendarItemTab = "Event") => {
      setInternalDate(date);
      setCreateState({ open: true, date, tab });
    },
    []
  );

  const handleCloseCreate = useCallback(() => {
    setCreateState((previous) => ({ ...previous, open: false }));
  }, []);

  return (
    <div className="calendar-surface">
      <div className="calendar-shell">
        <div className="calendar-card">
          <TopBar onAdd={() => handleOpenCreate(internalDate, "Event")} />

          <div className="calendar-body">
            <div className="calendar-sidebar">
              <MiniCalendar value={internalDate} onChange={setInternalDate} />
              <EventsAndTasks
                events={events}
                tasks={tasks}
                onToggleTask={onToggleTask}
              />
            </div>

            <div className="calendar-main">
              <div className="calendar-controls">
                <div className="calendar-controls__nav">
                  <button
                    type="button"
                    className="calendar-controls__button"
                    onClick={() => go(-1)}
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="calendar-controls__icon" />
                  </button>
                  <button
                    type="button"
                    className="calendar-controls__button"
                    onClick={() => go(1)}
                    aria-label="Next month"
                  >
                    <ChevronRight className="calendar-controls__icon" />
                  </button>
                  <div className="calendar-controls__title">{title}</div>
                </div>
                <div className="calendar-controls__toggle">
                  <button
                    type="button"
                    onClick={() => setView("day")}
                    className={`calendar-controls__toggle-button ${
                      view === "day" ? "is-active" : ""
                    }`}
                  >
                    Day
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("week")}
                    className={`calendar-controls__toggle-button ${
                      view === "week" ? "is-active" : ""
                    }`}
                  >
                    Week
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("month")}
                    className={`calendar-controls__toggle-button ${
                      view === "month" ? "is-active" : ""
                    }`}
                  >
                    Month
                  </button>
                </div>
              </div>

              <div className="calendar-view">
                {view === "month" && (
                  <MonthGrid
                    viewDate={internalDate}
                    selectedDate={internalDate}
                    events={events}
                    onSelectDate={handleSelectDate}
                    onOpenCreate={handleOpenCreate}
                  />
                )}
                {view === "week" && (
                  <WeekGrid anchorDate={internalDate} events={events} />
                )}
                {view === "day" && <DayList date={internalDate} events={events} />}
              </div>
            </div>
          </div>
        </div>

        <div className="calendar-footer">
          <div className="calendar-footer__note">
            <Check className="calendar-footer__icon" />
            Connected to project data — events update automatically.
          </div>
          <div className="calendar-footer__timezone">
            Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </div>
        </div>
      </div>

      <CreateCalendarItemModal
        isOpen={createState.open}
        initialDate={createState.date}
        initialTab={createState.tab}
        onClose={handleCloseCreate}
        onCreateEvent={onCreateEvent}
        onCreateTask={onCreateTask}
      />
    </div>
  );
};

// ------------------------------------------------------
// Root Calendar Page
// ------------------------------------------------------

const CalendarPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    activeProject,
    setActiveProject,
    fetchProjectDetails,
    setProjects,
    setSelectedProjects,
    userId,
  } = useData();

  const { ws } = useSocket();

  const [filesOpen, setFilesOpen] = useState(false);
  const quickLinksRef = useRef<QuickLinksRef | null>(null);

  const [timelineEvents, setTimelineEvents] = useState<ApiTimelineEvent[]>([]);
  const [projectTasks, setProjectTasks] = useState<ApiTask[]>([]);
  const tasksRef = useRef<ApiTask[]>([]);
  const previousTasksSnapshot = useRef<ApiTask[] | null>(null);

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const initializedDateForProject = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    if (!activeProject || activeProject.projectId !== projectId) {
      fetchProjectDetails(projectId);
    }
  }, [projectId, activeProject, fetchProjectDetails]);

  useEffect(() => {
    if (!projectId) return;
    const title = activeProject?.title;
    if (!title) return;

    const currentPath = location.pathname.split(/[?#]/)[0];
    if (!currentPath.includes("/calendar")) return;

    const canonicalPath = getProjectDashboardPath(projectId, title, "/calendar");
    if (currentPath === canonicalPath) return;

    navigate(canonicalPath, { replace: true });
  }, [projectId, activeProject?.title, location.pathname, navigate]);

  useEffect(() => {
    if (!ws || !activeProject?.projectId) return;

    const payload = JSON.stringify({
      action: "setActiveConversation",
      conversationId: `project#${activeProject.projectId}`,
    });

    const sendWhenReady = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      } else {
        const onOpen = () => {
          ws.send(payload);
          ws.removeEventListener("open", onOpen);
        };
        ws.addEventListener("open", onOpen);
      }
    };

    sendWhenReady();
  }, [ws, activeProject?.projectId]);

  useEffect(() => {
    if (!activeProject) return;
    const events = Array.isArray(activeProject.timelineEvents)
      ? (activeProject.timelineEvents as ApiTimelineEvent[])
      : [];
    setTimelineEvents(events);
  }, [activeProject]);

  useEffect(() => {
    tasksRef.current = projectTasks;
  }, [projectTasks]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetchTasks(projectId)
      .then((tasks) => {
        if (cancelled) return;
        setProjectTasks(tasks);
      })
      .catch((error) => {
        console.error("Failed to fetch project tasks", error);
        if (!cancelled) setProjectTasks([]);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    if (initializedDateForProject.current !== projectId) {
      initializedDateForProject.current = projectId;
      const sorted = [...timelineEvents]
        .map((event) => safeDate(event.date))
        .filter((value): value is Date => Boolean(value))
        .sort((a, b) => a.getTime() - b.getTime());
      if (sorted.length > 0) {
        setCurrentDate(sorted[0]);
      } else {
        setCurrentDate(new Date());
      }
    }
  }, [projectId, timelineEvents]);

  const handleCreateEvent = useCallback(
    async (input: CreateEventRequest) => {
      if (!projectId) return;

      const isoDate = input.date;
      const repeatValue =
        input.repeat && input.repeat !== "Does not repeat" ? input.repeat : undefined;

      const payloadEntries: Record<string, unknown> = {
        description: input.description?.trim() || input.title,
        notes: input.description?.trim() || undefined,
        start: input.allDay ? undefined : input.time,
        end: input.allDay ? undefined : input.endTime,
        repeat: repeatValue,
        reminder: input.reminder,
        eventType: input.eventType,
        platform: input.platform,
        guests: input.guests.length > 0 ? input.guests : undefined,
        tags: input.tags.length > 0 ? input.tags : undefined,
        allDay: input.allDay,
      };

      const payload = Object.fromEntries(
        Object.entries(payloadEntries).filter(([, value]) => {
          if (value === undefined || value === null) return false;
          if (typeof value === "string") return value.trim().length > 0;
          if (Array.isArray(value)) return value.length > 0;
          return true;
        })
      );

      try {
        const eventBody = {
          date: isoDate,
          description: input.title,
          payload,
          ...(input.allDay
            ? {}
            : {
                start: input.time,
                end: input.endTime,
              }),
        } as ApiTimelineEvent;

        const created = await createEvent(projectId, eventBody);
        const normalized = normalizeTimelineEvent({
          ...created,
          date: created.date ?? isoDate,
        });
        const asTimelineEvent: ApiTimelineEvent = {
          ...created,
          date: created.date ?? isoDate,
        };

        setTimelineEvents((prev) => [...prev, asTimelineEvent]);
        setActiveProject((prev) => {
          if (!prev || prev.projectId !== projectId) return prev;
          const nextTimeline = [...(prev.timelineEvents ?? []), asTimelineEvent];
          return { ...prev, timelineEvents: nextTimeline };
        });
        setProjects((prev) =>
          Array.isArray(prev)
            ? prev.map((project) =>
                project.projectId === projectId
                  ? {
                      ...project,
                      timelineEvents: [...(project.timelineEvents ?? []), asTimelineEvent],
                    }
                  : project
              )
            : prev
        );

        if (!normalized) return;
        const normalizedDate = safeDate(normalized.date);
        if (normalizedDate) {
          setCurrentDate(normalizedDate);
        }
      } catch (error) {
        console.error("Failed to create event", error);
        throw error;
      }
    },
    [projectId, setActiveProject, setProjects]
  );

  const handleCreateTask = useCallback(
    async (input: CreateTaskRequest) => {
      if (!projectId) return;

      const dueDateIso = input.date
        ? (() => {
            const parsed = new Date(`${input.date}T${input.time ?? "00:00"}`);
            return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
          })()
        : undefined;

      try {
        const created = await createTaskApi({
          projectId,
          title: input.title,
          description: input.description,
          dueDate: dueDateIso,
          status: "todo",
        });
        setProjectTasks((prev) => [...prev, created]);
      } catch (error) {
        console.error("Failed to create task", error);
        throw error;
      }
    },
    [projectId]
  );

  const handleToggleTask = useCallback(
    async (taskId: string) => {
      if (!projectId) return;
      const previous = tasksRef.current;
      const target = previous.find(
        (task) => task.taskId === taskId || (task as { id?: string }).id === taskId
      );
      if (!target) return;

      const nextStatus = target.status === "done" ? "todo" : "done";
      const optimistic = previous.map((task) =>
        task.taskId === target.taskId || (task as { id?: string }).id === taskId
          ? { ...task, status: nextStatus }
          : task
      );

      previousTasksSnapshot.current = previous;
      tasksRef.current = optimistic;
      setProjectTasks(optimistic);

      try {
        await updateTask({
          ...target,
          projectId,
          taskId: target.taskId,
          status: nextStatus,
        });
      } catch (error) {
        console.error("Failed to toggle task", error);
        const snapshot = previousTasksSnapshot.current;
        if (snapshot) {
          tasksRef.current = snapshot;
          setProjectTasks(snapshot);
        }
      }
    },
    [projectId]
  );

  const parseStatusToNumber = useCallback((status?: string | number | null) => {
    if (status === undefined || status === null) return 0;
    const str = typeof status === "string" ? status : String(status);
    const num = parseFloat(str.replace("%", ""));
    return Number.isNaN(num) ? 0 : num;
  }, []);

  const handleProjectDeleted = useCallback(
    (deletedProjectId: string) => {
      setProjects((prev) => prev.filter((project) => project.projectId !== deletedProjectId));
      setSelectedProjects((prev) => prev.filter((id) => id !== deletedProjectId));
      navigate("/dashboard/projects/allprojects");
    },
    [navigate, setProjects, setSelectedProjects]
  );

  const handleBack = useCallback(() => {
    if (!projectId) {
      navigate("/dashboard/projects/allprojects");
      return;
    }
    const title = activeProject?.title;
    navigate(getProjectDashboardPath(projectId, title));
  }, [navigate, projectId, activeProject?.title]);

  const handleActiveProjectChange = useCallback(
    (updatedProject: Project) => {
      setActiveProject(updatedProject);
    },
    [setActiveProject]
  );

  const coverImage = useMemo(
    () => resolveProjectCoverUrl(activeProject ?? undefined),
    [activeProject]
  );
  const projectPalette = useProjectPalette(coverImage, {
    color: activeProject?.color,
  });

  const calendarEvents = useMemo(() => {
    const mapped = timelineEvents
      .map(normalizeTimelineEvent)
      .filter((event): event is CalendarEvent => event !== null);
    return mapped.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return compareDateStrings(a.start, b.start);
    });
  }, [timelineEvents]);

  const calendarTasks = useMemo(
    () => projectTasks.map(normalizeTask).sort((a, b) => compareDateStrings(a.due, b.due)),
    [projectTasks]
  );

  return (
    <ProjectPageLayout
      projectId={activeProject?.projectId}
      theme={projectPalette}
      header={
        <ProjectHeader
          activeProject={activeProject ?? null}
          parseStatusToNumber={parseStatusToNumber}
          userId={userId}
          onProjectDeleted={handleProjectDeleted}
          showWelcomeScreen={handleBack}
          onActiveProjectChange={handleActiveProjectChange}
          onOpenFiles={() => setFilesOpen(true)}
          onOpenQuickLinks={() => quickLinksRef.current?.openModal()}
        />
      }
    >
      <QuickLinksComponent ref={quickLinksRef} hideTrigger />
      <FileManagerComponent
        isOpen={filesOpen}
        onRequestClose={() => setFilesOpen(false)}
        showTrigger={false}
        folder="uploads"
      />

      <CalendarSurface
        events={calendarEvents}
        tasks={calendarTasks}
        currentDate={currentDate}
        onDateChange={setCurrentDate}
        onCreateEvent={handleCreateEvent}
        onCreateTask={handleCreateTask}
        onToggleTask={handleToggleTask}
      />
    </ProjectPageLayout>
  );
};

export default CalendarPage;

