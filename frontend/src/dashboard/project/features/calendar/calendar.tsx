import React, { useMemo, useState } from "react";
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
import {
  ProjectPageLayout,
  ProjectHeader,
  QuickLinksComponent,
  FileManager as FileManagerComponent,
} from "@/dashboard/project/components";
import { useProjectPalette } from "@/dashboard/project/hooks/useProjectPalette";
import { resolveProjectCoverUrl } from "@/dashboard/project/utils/theme";
import type { Project } from "@/app/contexts/DataProvider";
import { useCalendarPageState } from "./useCalendarPageState";

interface TimelineLikeEvent {
  id?: string;
  title?: string;
  description?: string;
  date?: string;
  timestamp?: string;
  start?: string;
  end?: string;
  payload?: Record<string, unknown> | null;
  [key: string]: unknown;
}

type Category = "Work" | "Education" | "Personal";

type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  start?: string;
  end?: string;
  description?: string;
  category: Category;
};

type CalendarTask = {
  id: string;
  title: string;
  due?: string;
  done?: boolean;
};

const categoryColor: Record<Category, string> = {
  Work: "bg-amber-500",
  Education: "bg-indigo-500",
  Personal: "bg-emerald-500",
};

const fmt = (date: Date) => date.toISOString().slice(0, 10);
const pad = (value: number) => (value < 10 ? `0${value}` : `${value}`);

const startOfMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth(), 1);
const endOfMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth() + 1, 0);
const addDays = (value: Date, count: number) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate() + count);

function getMonthMatrix(viewDate: Date) {
  const start = startOfMonth(viewDate);
  const end = endOfMonth(viewDate);
  const startOffset = start.getDay();
  const daysInMonth = end.getDate();
  const days: Date[] = [];

  for (let index = 0; index < startOffset; index += 1) {
    days.push(addDays(start, index - startOffset));
  }

  for (let index = 1; index <= daysInMonth; index += 1) {
    days.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), index));
  }

  while (days.length % 7 !== 0) {
    days.push(addDays(end, days.length % 7));
  }

  while (days.length < 42) {
    days.push(addDays(days[days.length - 1], 1));
  }

  return days;
}

function getEventCategory(event: TimelineLikeEvent): Category {
  const candidate = (event.payload as { category?: string } | null)?.category;
  if (typeof candidate === "string") {
    const normalized = candidate.toLowerCase();
    if (normalized.includes("educat")) return "Education";
    if (normalized.includes("personal")) return "Personal";
  }

  const type = typeof event.type === "string" ? event.type.toLowerCase() : "";
  if (type.includes("educat")) return "Education";
  if (type.includes("personal")) return "Personal";

  const phase = typeof event.phase === "string" ? event.phase.toLowerCase() : "";
  if (phase.includes("educat")) return "Education";
  if (phase.includes("personal")) return "Personal";

  return "Work";
}

function mapTimelineEvent(event: TimelineLikeEvent, fallbackId: string): CalendarEvent | null {
  const isoDate = event.date || event.timestamp;
  if (!isoDate) {
    return null;
  }

  const title = event.title || event.description || "Untitled event";
  const category = getEventCategory(event);

  const rawStart = typeof event.start === "string" ? event.start : undefined;
  const rawEnd = typeof event.end === "string" ? event.end : undefined;

  const payloadStart =
    typeof event.payload === "object" && event.payload
      ? (event.payload as { start?: string; startTime?: string; time?: string }).start ||
        (event.payload as { startTime?: string; time?: string }).startTime ||
        (event.payload as { time?: string }).time
      : undefined;
  const payloadEnd =
    typeof event.payload === "object" && event.payload
      ? (event.payload as { end?: string; endTime?: string }).end ||
        (event.payload as { endTime?: string }).endTime
      : undefined;

  const parseTime = (value?: string) => {
    if (!value) return undefined;
    const match = value.match(/(\d{1,2})(?::(\d{2}))?/);
    if (!match) return undefined;
    const hours = pad(Number(match[1]));
    const minutes = pad(match[2] ? Number(match[2]) : 0);
    return `${hours}:${minutes}`;
  };

  return {
    id: event.id ?? fallbackId,
    title,
    date: isoDate.slice(0, 10),
    description: event.description,
    start: parseTime(rawStart || payloadStart),
    end: parseTime(rawEnd || payloadEnd),
    category,
  };
}

function deriveEvents(project?: Project | null): CalendarEvent[] {
  if (!project || !Array.isArray(project.timelineEvents)) {
    return [];
  }

  return project.timelineEvents
    .map((timelineEvent, index) => mapTimelineEvent(timelineEvent, `event-${index}`))
    .filter((value): value is CalendarEvent => Boolean(value));
}

function deriveTasks(events: CalendarEvent[], completed: Record<string, boolean>): CalendarTask[] {
  const todayIso = fmt(new Date());
  return events
    .map<CalendarTask>((event) => ({
      id: event.id,
      title: event.title,
      due: event.date,
      done: completed[event.id] ?? event.date < todayIso,
    }))
    .sort((a, b) => {
      if (!a.due) return 1;
      if (!b.due) return -1;
      return a.due.localeCompare(b.due);
    });
}

interface MiniCalendarProps {
  value: Date;
  onChange: (value: Date) => void;
}

function MiniCalendar({ value, onChange }: MiniCalendarProps) {
  const days = useMemo(() => getMonthMatrix(value), [value]);
  const monthName = value.toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="rounded-2xl bg-white/5 backdrop-blur p-4 shadow-sm border border-white/10 text-gray-100">
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium">{monthName}</div>
        <div className="flex gap-1">
          <button
            className="p-2 hover:bg-white/10 rounded-md"
            type="button"
            onClick={() => onChange(new Date(value.getFullYear(), value.getMonth() - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            className="p-2 hover:bg-white/10 rounded-md"
            type="button"
            onClick={() => onChange(new Date(value.getFullYear(), value.getMonth() + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-[11px] text-gray-400 mb-1">
        {"SMTWTFS".split("").map((label) => (
          <div key={label} className="text-center py-1">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => {
          const isToday = fmt(day) === fmt(new Date());
          const isCurrentMonth = day.getMonth() === value.getMonth();
          return (
            <button
              key={fmt(day)}
              type="button"
              onClick={() => onChange(day)}
              className={`aspect-square rounded-md text-[12px] flex items-center justify-center border border-white/10 transition-colors ${
                isCurrentMonth ? "bg-white/5 text-gray-100" : "bg-white/0 text-gray-500"
              } ${isToday ? "ring-2 ring-[#FA3356]" : ""} hover:bg-white/10`}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface TopBarProps {
  onAdd: () => void;
}

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
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#FA3356] text-white shadow hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add Schedule
        </button>
      </div>
    </div>
  );
}

interface MonthGridProps {
  viewDate: Date;
  events: CalendarEvent[];
  onSelectDate: (value: Date) => void;
}

function MonthGrid({ viewDate, events, onSelectDate }: MonthGridProps) {
  const days = useMemo(() => getMonthMatrix(viewDate), [viewDate]);
  const month = viewDate.getMonth();
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();
    events.forEach((event) => {
      if (!grouped.has(event.date)) {
        grouped.set(event.date, []);
      }
      grouped.get(event.date)!.push(event);
    });
    return grouped;
  }, [events]);

  return (
    <div className="grid grid-cols-7 border-t border-l border-white/10 text-sm text-gray-100">
      {"SUN,MON,TUE,WED,THU,FRI,SAT".split(",").map((label) => (
        <div
          key={label}
          className="sticky top-0 z-10 bg-black/30 backdrop-blur px-3 py-2 border-r border-b border-white/10 font-medium"
        >
          {label}
        </div>
      ))}
      {days.map((day) => {
        const isCurrentMonth = day.getMonth() === month;
        const key = fmt(day);
        const dayEvents = eventsByDate.get(key) || [];
        return (
          <div
            key={key}
            className={`min-h-[120px] border-r border-b border-white/10 p-2 ${
              isCurrentMonth ? "bg-white/5" : "bg-white/[0.02] text-gray-400"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectDate(day)}
              className="text-xs text-gray-400 hover:underline"
            >
              {day.getDate()}
            </button>
            <div className="mt-2 space-y-1">
              {dayEvents.slice(0, 4).map((event) => (
                <div key={event.id} className="flex items-center gap-2 text-[11px]">
                  <span className={`h-2 w-2 rounded-full ${categoryColor[event.category]}`} />
                  <span className="truncate" title={event.title}>
                    {event.title}
                  </span>
                </div>
              ))}
              {dayEvents.length > 4 && (
                <div className="text-[11px] text-gray-400">+{dayEvents.length - 4} more</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface WeekGridProps {
  anchorDate: Date;
  events: CalendarEvent[];
}

function WeekGrid({ anchorDate, events }: WeekGridProps) {
  const start = addDays(anchorDate, -anchorDate.getDay());
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const hours = Array.from({ length: 12 }, (_, index) => index + 7);

  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();
    days.forEach((day) => grouped.set(fmt(day), []));
    events.forEach((event) => {
      if (grouped.has(event.date)) {
        grouped.get(event.date)!.push(event);
      }
    });
    return grouped;
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
      {hours.map((hour) => (
        <React.Fragment key={hour}>
          <div className="border-t border-r border-white/10 text-xs text-gray-400 px-2 py-6">{`${pad(hour)}:00`}</div>
          {days.map((day) => (
            <div
              key={`${fmt(day)}-${hour}`}
              className="relative border-t border-r border-white/10 min-h-[72px] bg-white/[0.03]"
            >
              {(eventsByDay.get(fmt(day)) || [])
                .filter((event) => Number(event.start?.slice(0, 2)) === hour)
                .map((event) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0.4, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`absolute left-2 right-2 top-1 rounded-lg p-2 text-[12px] text-white shadow ${categoryColor[event.category]}`}
                  >
                    <div className="font-medium truncate">{event.title}</div>
                    {event.start && event.end && (
                      <div className="opacity-90">
                        {event.start} – {event.end}
                      </div>
                    )}
                  </motion.div>
                ))}
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

interface DayListProps {
  date: Date;
  events: CalendarEvent[];
}

function DayList({ date, events }: DayListProps) {
  const dayKey = fmt(date);
  const items = useMemo(
    () =>
      events
        .filter((event) => event.date === dayKey)
        .sort((a, b) => (a.start || "").localeCompare(b.start || "")),
    [events, dayKey],
  );

  if (!items.length) {
    return <div className="p-6 text-gray-400 text-sm">No events for this day.</div>;
  }

  return (
    <div className="divide-y divide-white/10 text-gray-100">
      {items.map((event) => (
        <div key={event.id} className="flex items-start gap-3 p-4">
          <div className={`h-2 w-2 rounded-full mt-2 ${categoryColor[event.category]}`} />
          <div>
            <div className="font-medium">{event.title}</div>
            {(event.start || event.end) && (
              <div className="text-sm text-gray-400 flex items-center gap-1">
                <Clock className="h-4 w-4" /> {event.start} – {event.end}
              </div>
            )}
            {event.description && <div className="text-sm text-gray-300 mt-1">{event.description}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

interface EventsAndTasksProps {
  events: CalendarEvent[];
  tasks: CalendarTask[];
  onToggleTask: (id: string) => void;
}

function EventsAndTasks({ events, tasks, onToggleTask }: EventsAndTasksProps) {
  const upcoming = useMemo(
    () => [...events].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6),
    [events],
  );

  return (
    <div className="rounded-2xl bg-white/5 backdrop-blur p-4 shadow-sm border border-white/10 text-gray-100">
      <div className="font-medium mb-3">Events & Tasks</div>
      <div className="mb-4">
        <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">Upcoming events</div>
        <ul className="space-y-2 text-sm">
          {upcoming.map((event) => (
            <li key={event.id} className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${categoryColor[event.category]}`} />
              <span className="truncate" title={event.title}>
                {event.title}
              </span>
              <span className="ml-auto text-xs text-gray-400">
                {event.date.slice(5)} {event.start && `· ${event.start}`}
              </span>
            </li>
          ))}
          {!upcoming.length && (
            <li className="text-xs text-gray-400">No upcoming events.</li>
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
                className="accent-[#FA3356]"
                checked={Boolean(task.done)}
                onChange={() => onToggleTask(task.id)}
              />
              <span className={`truncate ${task.done ? "line-through text-gray-500" : ""}`}>
                {task.title}
              </span>
              {task.due && <span className="ml-auto text-xs text-gray-400">due {task.due.slice(5)}</span>}
            </li>
          ))}
          {!tasks.length && <li className="text-xs text-gray-400">No tasks yet.</li>}
        </ul>
      </div>
    </div>
  );
}

interface CalendarShellProps {
  projectTitle?: string;
  events: CalendarEvent[];
  tasks: CalendarTask[];
  timezoneLabel?: string;
  onAddSchedule: (currentDate: Date) => void;
  onToggleTask: (id: string) => void;
}

function CalendarShell({
  projectTitle,
  events,
  tasks,
  timezoneLabel,
  onAddSchedule,
  onToggleTask,
}: CalendarShellProps) {
  const [current, setCurrent] = useState(new Date());
  const [view, setView] = useState<"month" | "week" | "day">("month");

  const title = useMemo(
    () => current.toLocaleString(undefined, { month: "long", year: "numeric" }),
    [current],
  );

  const handleAddSchedule = () => {
    onAddSchedule(current);
  };

  return (
    <div className="min-h-screen w-full bg-[#0c0c0c] text-gray-100">
      <div className="mx-auto max-w-[1200px] py-6 px-4">
        <div className="rounded-3xl overflow-hidden shadow-xl ring-1 ring-white/10 bg-black/40 backdrop-blur">
          <TopBar onAdd={handleAddSchedule} />

          <div className="grid grid-cols-[280px_1fr] gap-6 p-6">
            <div className="space-y-6">
              <MiniCalendar value={current} onChange={setCurrent} />
              <EventsAndTasks events={events} tasks={tasks} onToggleTask={onToggleTask} />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="p-2 rounded-xl hover:bg-white/10"
                    onClick={() => setCurrent(new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="p-2 rounded-xl hover:bg-white/10"
                    onClick={() => setCurrent(new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <div className="text-lg font-semibold tracking-tight ml-2">
                    {projectTitle ? `${projectTitle} · ${title}` : title}
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setView("day")}
                    className={`px-3 py-1 rounded-lg text-sm ${
                      view === "day" ? "bg-white/10 ring-1 ring-white/20" : ""
                    }`}
                  >
                    Day
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("week")}
                    className={`px-3 py-1 rounded-lg text-sm ${
                      view === "week" ? "bg-white/10 ring-1 ring-white/20" : ""
                    }`}
                  >
                    Week
                  </button>
                  <button
                    type="button"
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
                    viewDate={current}
                    events={events}
                    onSelectDate={(value) => {
                      setCurrent(value);
                      setView("day");
                    }}
                  />
                )}
                {view === "week" && <WeekGrid anchorDate={current} events={events} />}
                {view === "day" && <DayList date={current} events={events} />}
              </div>
            </div>
          </div>

          <div className="px-6 py-3 border-t border-white/10 flex items-center justify-between text-xs text-gray-400">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4" /> Mock data blended with project events.
            </div>
            <div>{timezoneLabel ?? "Timezone: Local"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const CalendarPage: React.FC = () => {
  const {
    projectId,
    activeProject,
    initialActiveProject,
    userId,
    filesOpen,
    setFilesOpen,
    quickLinksRef,
    handleProjectDeleted,
    handleBack,
    setActiveProject,
  } = useCalendarPageState();

  const coverImage = useMemo(() => resolveProjectCoverUrl(activeProject), [activeProject]);
  const projectPalette = useProjectPalette(coverImage, { color: activeProject?.color });

  const baseEvents = useMemo(
    () => deriveEvents(activeProject ?? initialActiveProject),
    [activeProject, initialActiveProject],
  );

  const [customEvents, setCustomEvents] = useState<CalendarEvent[]>([]);
  const [taskCompletion, setTaskCompletion] = useState<Record<string, boolean>>({});

  const events = useMemo(() => {
    const merged = new Map<string, CalendarEvent>();
    baseEvents.forEach((event) => {
      merged.set(event.id, event);
    });
    customEvents.forEach((event) => {
      merged.set(event.id, event);
    });
    return Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [baseEvents, customEvents]);

  const tasks = useMemo(() => deriveTasks(events, taskCompletion), [events, taskCompletion]);

  const handleAddSchedule = (currentDate: Date) => {
    const iso = fmt(currentDate);
    const id = `custom-${Date.now()}`;
    setCustomEvents((prev) => [
      ...prev,
      {
        id,
        title: "New Event",
        date: iso,
        start: "10:00",
        end: "11:00",
        category: "Work",
      },
    ]);
    setTaskCompletion((prev) => ({ ...prev, [id]: false }));
  };

  const handleToggleTask = (taskId: string) => {
    setTaskCompletion((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const parseStatusToNumber = (statusString?: string | number | null) => {
    if (statusString === undefined || statusString === null) return 0;
    const value = typeof statusString === "string" ? statusString : String(statusString);
    const number = parseFloat(value.replace("%", ""));
    return Number.isNaN(number) ? 0 : number;
  };

  const handleActiveProjectChange = (updatedProject: Project) => {
    setActiveProject(updatedProject);
  };

  const timezoneLabel = useMemo(() => {
    if (!activeProject?.projectId) return undefined;
    try {
      const formatter = new Intl.DateTimeFormat(undefined, {
        timeZoneName: "short",
      });
      const parts = formatter.formatToParts(new Date());
      const zone = parts.find((part) => part.type === "timeZoneName");
      return zone ? `Timezone: ${zone.value}` : undefined;
    } catch (error) {
      return undefined;
    }
  }, [activeProject?.projectId]);

  return (
    <ProjectPageLayout
      projectId={activeProject?.projectId}
      theme={projectPalette}
      header={
        <ProjectHeader
          activeProject={activeProject}
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

      <div className="py-6">
        <CalendarShell
          key={projectId ?? "calendar"}
          projectTitle={activeProject?.title ?? initialActiveProject?.title}
          events={events}
          tasks={tasks}
          timezoneLabel={timezoneLabel}
          onAddSchedule={handleAddSchedule}
          onToggleTask={handleToggleTask}
        />
      </div>
    </ProjectPageLayout>
  );
};

export default CalendarPage;
