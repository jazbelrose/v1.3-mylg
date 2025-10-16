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
  fetchTasks,
  updateTask,
  type Task as ApiTask,
  type TimelineEvent as ApiTimelineEvent,
} from "@/shared/utils/api";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";

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
  Work: "bg-amber-500",
  Education: "bg-indigo-500",
  Personal: "bg-emerald-500",
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

  const title =
    (event as { title?: string }).title ||
    event.description ||
    event.payload?.description ||
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
    description: event.description || event.payload?.description,
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
    <div className="rounded-2xl bg-white/5 backdrop-blur p-4 shadow-sm border border-white/10 text-gray-100">
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium">{monthName}</div>
        <div className="flex gap-1">
          <button
            className="p-2 hover:bg-white/10 rounded-md"
            onClick={() =>
              onChange(new Date(value.getFullYear(), value.getMonth() - 1, 1))
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            className="p-2 hover:bg-white/10 rounded-md"
            onClick={() =>
              onChange(new Date(value.getFullYear(), value.getMonth() + 1, 1))
            }
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-[11px] text-gray-400 mb-1">
        {"SMTWTFS".split("").map((c) => (
          <div key={c} className="text-center py-1">
            {c}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const isToday = fmt(d) === fmt(new Date());
          const isCurrentMonth = d.getMonth() === value.getMonth();
          const isSelected = isSameDay(d, value);
          return (
            <button
              key={d.toISOString()}
              onClick={() => onChange(d)}
              className={`aspect-square rounded-md text-[12px] flex items-center justify-center border border-white/10 transition-colors
                ${isCurrentMonth ? "bg-white/5 text-gray-100" : "bg-white/0 text-gray-500"}
                ${isToday ? "ring-2 ring-[#FA3356]" : ""}
                ${isSelected ? "bg-white/10" : ""}
                hover:bg-white/10`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------
// Top Bar (dark)
// ------------------------------------------------------

type TopBarProps = {
  onAdd: () => void;
};

function TopBar({ onAdd }: TopBarProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/30 backdrop-blur rounded-t-2xl text-gray-100">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-xl bg-white/10 grid place-items-center">
          <CalendarIcon className="h-4 w-4" />
        </div>
        <div className="font-semibold tracking-tight">Calendar</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            placeholder="Search for anything"
            className="pl-9 pr-3 py-2 rounded-xl bg-white/10 border border-white/10 shadow-sm w-[280px] placeholder:text-gray-400 text-gray-100 focus:outline-none focus:ring-2 focus:ring-white/20"
          />
        </div>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#FA3356] text-white shadow hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add Event
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------
// Month Grid (dark)
// ------------------------------------------------------

type MonthGridProps = {
  viewDate: Date;
  selectedDate: Date;
  events: CalendarEvent[];
  onSelectDate: (d: Date) => void;
};

function MonthGrid({ viewDate, selectedDate, events, onSelectDate }: MonthGridProps) {
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

  return (
    <div className="grid grid-cols-7 border-t border-l border-white/10 text-sm text-gray-100">
      {"SUN,MON,TUE,WED,THU,FRI,SAT".split(",").map((d) => (
        <div
          key={d}
          className="sticky top-0 z-10 bg-black/30 backdrop-blur px-3 py-2 border-r border-b border-white/10 font-medium"
        >
          {d}
        </div>
      ))}
      {days.map((day) => {
        const isCurrentMonth = day.getMonth() === month;
        const key = fmt(day);
        const isSelected = isSameDay(day, selectedDate);
        const dayEvents = eventsByDate.get(key) || [];
        return (
          <div
            key={key}
            className={`min-h-[120px] border-r border-b border-white/10 p-2 transition-colors ${
              isCurrentMonth ? "bg-white/5" : "bg-white/[0.02] text-gray-400"
            } ${isSelected ? "ring-2 ring-[#FA3356]/70" : ""}`}
          >
            <button
              onClick={() => onSelectDate(day)}
              className="text-xs text-gray-400 hover:underline"
            >
              {day.getDate()}
            </button>
            <div className="mt-2 space-y-1">
              {dayEvents.slice(0, 4).map((event) => (
                <div key={event.id} className="flex items-center gap-2 text-[11px]">
                  <span
                    className={`h-2 w-2 rounded-full ${categoryColor[event.category]}`}
                  />
                  <span className="truncate" title={event.title}>
                    {event.title}
                  </span>
                </div>
              ))}
              {dayEvents.length > 4 && (
                <div className="text-[11px] text-gray-400">
                  +{dayEvents.length - 4} more
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
    <div className="grid grid-cols-[60px_repeat(7,1fr)] border-t border-white/10 text-sm text-gray-100">
      <div className="border-b border-r border-white/10" />
      {days.map((day) => (
        <div
          key={fmt(day)}
          className="border-b border-r border-white/10 bg-black/30 backdrop-blur py-2 px-3 font-medium sticky top-0 z-10"
        >
          {day.toLocaleDateString(undefined, { weekday: "short" })} {day.getDate()}
        </div>
      ))}
      {hours.map((hour, hourIndex) => (
        <React.Fragment key={hour}>
          <div className="border-t border-r border-white/10 text-xs text-gray-400 px-2 py-6">
            {pad(hour)}:00
          </div>
          {days.map((day) => {
            const key = fmt(day);
            const dayEvents = eventsByDay.get(key) ?? { allDay: [], timed: [] };
            const timed = dayEvents.timed.filter(
              (event) => parseHour(event.start) === hour
            );
            return (
              <div
                key={`${key}-${hour}`}
                className={`relative border-t border-r border-white/10 min-h-[72px] bg-white/[0.03] ${
                  hourIndex === 0 ? "pt-12" : ""
                }`}
              >
                {hourIndex === 0 && dayEvents.allDay.length > 0 && (
                  <div className="absolute left-2 right-2 top-1 z-10 space-y-1">
                    {dayEvents.allDay.map((event) => (
                      <div
                        key={event.id}
                        className={`rounded-lg px-2 py-1 text-[12px] text-white shadow ${categoryColor[event.category]}`}
                      >
                        <div className="font-medium truncate">{event.title}</div>
                        <div className="opacity-90">All day</div>
                      </div>
                    ))}
                  </div>
                )}
                {timed.map((event) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0.4, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`absolute left-2 right-2 top-1 rounded-lg p-2 text-[12px] text-white shadow ${categoryColor[event.category]}`}
                  >
                    <div className="font-medium truncate">{event.title}</div>
                    <div className="opacity-90">
                      {event.start} – {event.end ?? ""}
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
}

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
    return <div className="p-6 text-gray-400 text-sm">No events for this day.</div>;
  }

  return (
    <div className="divide-y divide-white/10 text-gray-100">
      {list.map((event) => (
        <div key={event.id} className="flex items-start gap-3 p-4">
          <div className={`h-2 w-2 rounded-full mt-2 ${categoryColor[event.category]}`} />
          <div>
            <div className="font-medium">{event.title}</div>
            <div className="text-sm text-gray-400 flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {event.start && event.end ? (
                <>{event.start} – {event.end}</>
              ) : (
                "All day"
              )}
            </div>
            {event.description && (
              <div className="text-sm text-gray-300 mt-1">{event.description}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

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
    <div className="rounded-2xl bg-white/5 backdrop-blur p-4 shadow-sm border border-white/10 text-gray-100">
      <div className="font-medium mb-3">Events & Tasks</div>

      <div className="mb-4">
        <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">Upcoming events</div>
        <ul className="space-y-2 text-sm">
          {upcoming.map((event) => (
            <li key={event.id} className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${categoryColor[event.category]}`}
              />
              <span className="truncate" title={event.title}>
                {event.title}
              </span>
              <span className="ml-auto text-xs text-gray-400">
                {event.date.slice(5)}
                {event.start ? ` · ${event.start}` : ""}
              </span>
            </li>
          ))}
          {upcoming.length === 0 && (
            <li className="text-xs text-gray-500">No upcoming events scheduled.</li>
          )}
        </ul>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">Tasks</div>
        <ul className="space-y-2 text-sm">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(task.done)}
                onChange={() => onToggleTask(task.id)}
                className="accent-[#FA3356]"
              />
              <span
                className={`truncate ${task.done ? "line-through text-gray-500" : ""}`}
              >
                {task.title}
              </span>
              {task.due && (
                <span className="ml-auto text-xs text-gray-400">
                  due {task.due.slice(5)}
                </span>
              )}
            </li>
          ))}
          {tasks.length === 0 && (
            <li className="text-xs text-gray-500">No tasks yet. Add tasks to keep track of work.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

// ------------------------------------------------------
// Calendar Surface
// ------------------------------------------------------

type CalendarSurfaceProps = {
  events: CalendarEvent[];
  tasks: CalendarTask[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onAddEvent: (date: Date) => void;
  onToggleTask: (id: string) => void;
};

const CalendarSurface: React.FC<CalendarSurfaceProps> = ({
  events,
  tasks,
  currentDate,
  onDateChange,
  onAddEvent,
  onToggleTask,
}) => {
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [internalDate, setInternalDate] = useState<Date>(currentDate);

  useEffect(() => {
    if (!isSameDay(currentDate, internalDate)) {
      setInternalDate(currentDate);
    }
  }, [currentDate, internalDate]);

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

  const go = useCallback(
    (deltaMonths: number) => {
      const next = new Date(internalDate);
      next.setMonth(internalDate.getMonth() + deltaMonths);
      setInternalDate(next);
    },
    [internalDate]
  );

  const handleSelectDate = useCallback((date: Date) => {
    setInternalDate(date);
    setView("day");
  }, []);

  return (
    <div className="min-h-screen w-full bg-[#0c0c0c] text-gray-100">
      <div className="mx-auto max-w-[1200px] py-6 px-4">
        <div className="rounded-3xl overflow-hidden shadow-xl ring-1 ring-white/10 bg-black/40 backdrop-blur">
          <TopBar onAdd={() => onAddEvent(internalDate)} />

          <div className="grid grid-cols-[280px_1fr] gap-6 p-6">
            <div className="space-y-6">
              <MiniCalendar value={internalDate} onChange={setInternalDate} />
              <EventsAndTasks events={events} tasks={tasks} onToggleTask={onToggleTask} />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    className="p-2 rounded-xl hover:bg-white/10"
                    onClick={() => go(-1)}
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    className="p-2 rounded-xl hover:bg-white/10"
                    onClick={() => go(1)}
                    aria-label="Next month"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <div className="text-lg font-semibold tracking-tight ml-2">
                    {title}
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl">
                  <button
                    onClick={() => setView("day")}
                    className={`px-3 py-1 rounded-lg text-sm ${
                      view === "day" ? "bg-white/10 ring-1 ring-white/20" : ""
                    }`}
                  >
                    Day
                  </button>
                  <button
                    onClick={() => setView("week")}
                    className={`px-3 py-1 rounded-lg text-sm ${
                      view === "week" ? "bg-white/10 ring-1 ring-white/20" : ""
                    }`}
                  >
                    Week
                  </button>
                  <button
                    onClick={() => setView("month")}
                    className={`px-3 py-1 rounded-lg text-sm ${
                      view === "month" ? "bg-white/10 ring-1 ring-white/20" : ""
                    }`}
                  >
                    Month
                  </button>
                </div>
              </div>

              <div className="rounded-2xl overflow-hidden ring-1 ring-white/10 bg-white/[0.03]">
                {view === "month" && (
                  <MonthGrid
                    viewDate={internalDate}
                    selectedDate={internalDate}
                    events={events}
                    onSelectDate={handleSelectDate}
                  />
                )}
                {view === "week" && <WeekGrid anchorDate={internalDate} events={events} />}
                {view === "day" && <DayList date={internalDate} events={events} />}
              </div>
            </div>
          </div>

          <div className="px-6 py-3 border-t border-white/10 flex items-center justify-between text-xs text-gray-400">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4" />
              Connected to project data — events update automatically.
            </div>
            <div>Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</div>
          </div>
        </div>
      </div>
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

  const handleAddEvent = useCallback(
    async (date: Date) => {
      if (!projectId) return;
      const isoDate = fmt(date);
      try {
        const created = await createEvent(projectId, {
          date: isoDate,
          description: "New event",
        });
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
          if (!prev) return prev;
          if (prev.projectId !== projectId) return prev;
          const nextTimeline = [...(prev.timelineEvents ?? []), asTimelineEvent];
          return { ...prev, timelineEvents: nextTimeline };
        });
        setProjects((prev) =>
          Array.isArray(prev)
            ? prev.map((project) =>
                project.projectId === projectId
                  ? { ...project, timelineEvents: [...(project.timelineEvents ?? []), asTimelineEvent] }
                  : project
              )
            : prev
        );

        if (!normalized) return;
        setCurrentDate(safeDate(normalized.date) ?? date);
      } catch (error) {
        console.error("Failed to create event", error);
      }
    },
    [projectId, setActiveProject, setProjects]
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
        onAddEvent={handleAddEvent}
        onToggleTask={handleToggleTask}
      />
    </ProjectPageLayout>
  );
};

export default CalendarPage;

