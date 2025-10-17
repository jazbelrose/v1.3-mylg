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
  CheckSquare,
  X,
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
import { useTeamMembers } from "@/dashboard/project/components/Shared/projectHeaderState/useTeamMembers";
import type { TeamMember as ProjectTeamMember } from "@/dashboard/project/components/Shared/types";
import {
  createEvent,
  createTask as createTaskApi,
  fetchTasks,
  updateEvent,
  updateTask,
  deleteEvent,
  deleteTask,
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
import QuickCreateTaskModal, {
  type QuickCreateTaskModalProject,
  type QuickCreateTaskModalTask,
} from "@/dashboard/home/components/QuickCreateTaskModal";
import TasksOverviewCard from "@/dashboard/home/components/TasksOverviewCard";

type CalendarCategory = "Work" | "Education" | "Personal";

type CalendarEvent = {
  id: string;
  title: string;
  date: string; // ISO date (yyyy-mm-dd)
  start?: string; // "HH:MM"
  end?: string; // "HH:MM"
  description?: string;
  category: CalendarCategory;
  allDay: boolean;
  repeat?: string;
  reminder?: string;
  eventType?: string;
  platform?: string;
  tags: string[];
  guests: string[];
  source: ApiTimelineEvent;
};

type CalendarTask = {
  id: string;
  title: string;
  due?: string; // ISO date
  done?: boolean;
  time?: string;
  description?: string;
  source: ApiTask;
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

const generateEventId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `evt_${Math.random().toString(36).slice(2, 10)}`;
};

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

const extractEventDetails = (event: ApiTimelineEvent): Record<string, unknown> => {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const meta = ((event as { meta?: Record<string, unknown> }).meta ?? {}) as Record<
    string,
    unknown
  >;
  return { ...payload, ...meta };
};

const extractTime = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    if (value.includes("T")) {
      const isoMatch = value.match(/T(\d{2}):(\d{2})/);
      if (isoMatch) {
        return `${isoMatch[1]}:${isoMatch[2]}`;
      }
    }
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

const parseBooleanish = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }
    if (["true", "1", "yes", "y"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "n"].includes(normalized)) {
      return false;
    }
  }
  return undefined;
};

const parseString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

const parseStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") {
          const trimmed = item.trim();
          return trimmed.length > 0 ? trimmed : null;
        }
        if (typeof item === "number" && Number.isFinite(item)) {
          return String(item);
        }
        return null;
      })
      .filter((item): item is string => item !== null);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [];
};

const resolveUpdatedString = (
  next: string | undefined,
  previous: unknown,
): string | null | undefined => {
  if (typeof next === "string") {
    const trimmed = next.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  if (typeof previous === "string") {
    const trimmedPrev = previous.trim();
    if (trimmedPrev.length > 0) {
      return null;
    }
  }

  return undefined;
};

const parseNumberish = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const numeric = Number(trimmed);
    return Number.isNaN(numeric) ? undefined : numeric;
  }
  return undefined;
};

const extractDateString = (value: unknown): string | undefined => {
  if (value instanceof Date) {
    return fmt(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return fmt(new Date(value));
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = safeDate(trimmed);
  if (parsed) {
    return fmt(parsed);
  }
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return match[1];
  }
  return undefined;
};

const deriveCategory = (event: ApiTimelineEvent): CalendarCategory => {
  const details = extractEventDetails(event);
  const textChunks = [
    event.type,
    (event as { category?: string }).category,
    event.phase,
    (event as { title?: string }).title,
    event.description,
    (details as { description?: string }).description,
    (details as { notes?: string }).notes,
    (details as { title?: string }).title,
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
  const details = extractEventDetails(event);
  const dateCandidates: unknown[] = [
    event.date,
    (event as { day?: unknown }).day,
    (event as { scheduledDate?: unknown }).scheduledDate,
    (event as { dueDate?: unknown }).dueDate,
    (details as { date?: unknown }).date,
    (details as { day?: unknown }).day,
    (details as { scheduledDate?: unknown }).scheduledDate,
    (details as { dueDate?: unknown }).dueDate,
    event.timestamp,
    event.createdAt,
  ];
  const isoDate = dateCandidates
    .map(extractDateString)
    .find((value): value is string => Boolean(value));
  if (!isoDate) return null;
  const startCandidate =
    (event as { start?: unknown }).start ??
    (event as { startHour?: unknown }).startHour ??
    (event as { startTime?: unknown }).startTime ??
    (event as { startAt?: unknown }).startAt ??
    details.start ??
    (details as { startTime?: unknown }).startTime ??
    (details as { start_time?: unknown }).start_time ??
    (details as { starttime?: unknown }).starttime ??
    (details as { [key: string]: unknown })["start-time"] ??
    (details as { time?: unknown }).time;
  const endCandidate =
    (event as { end?: unknown }).end ??
    (event as { endHour?: unknown }).endHour ??
    (event as { endTime?: unknown }).endTime ??
    (event as { endAt?: unknown }).endAt ??
    details.end ??
    (details as { endTime?: unknown }).endTime ??
    (details as { end_time?: unknown }).end_time ??
    (details as { endtime?: unknown }).endtime ??
    (details as { [key: string]: unknown })["end-time"];

  const start = extractTime(startCandidate);
  const endRaw = extractTime(endCandidate);
  const durationHours =
    parseNumberish((event as { hours?: unknown }).hours) ??
    parseNumberish((event as { duration?: unknown }).duration) ??
    parseNumberish(details.hours) ??
    parseNumberish((details as { duration?: unknown }).duration) ??
    parseNumberish((details as { length?: unknown }).length);
  const end =
    endRaw || (start && typeof durationHours === "number" ? addHoursToTime(start, durationHours) : undefined);

  const allDay =
    parseBooleanish(
      (event as { allDay?: unknown }).allDay ??
        (event as { all_day?: unknown }).all_day ??
        (event as { isAllDay?: unknown }).isAllDay ??
        details.allDay ??
        (details as { all_day?: unknown }).all_day ??
        (details as { isAllDay?: unknown }).isAllDay ??
        (details as { is_all_day?: unknown }).is_all_day ??
        (details as { [key: string]: unknown })["all-day"]
    ) ?? (!start && !end);

  const repeat = parseString(
    (event as { repeat?: unknown }).repeat ??
      (event as { recurrence?: unknown }).recurrence ??
      details.repeat ??
      (details as { recurrence?: unknown }).recurrence ??
      (details as { frequency?: unknown }).frequency
  );

  const reminder = parseString(
    (event as { reminder?: unknown }).reminder ??
      details.reminder ??
      (details as { alert?: unknown }).alert ??
      (details as { notification?: unknown }).notification
  );

  const eventType = parseString(
    (event as { eventType?: unknown }).eventType ??
      details.eventType ??
      (details as { type?: unknown }).type ??
      (details as { category?: unknown }).category
  );

  const platform = parseString(
    (event as { platform?: unknown }).platform ??
      details.platform ??
      (details as { provider?: unknown }).provider ??
      (details as { location?: unknown }).location
  );

  const tags = parseStringArray(
    (event as { tags?: unknown }).tags ??
      details.tags ??
      (details as { labels?: unknown }).labels ??
      (details as { [key: string]: unknown })["tag-list"]
  );

  const guests = parseStringArray(
    (event as { guests?: unknown }).guests ??
      details.guests ??
      (details as { attendees?: unknown }).attendees ??
      (details as { participants?: unknown }).participants ??
      (details as { [key: string]: unknown })["guest-list"]
  );

  const payloadDescription = (details as { description?: string }).description;
  const payloadTitle = (details as { title?: string }).title;
  const payloadNotes = (details as { notes?: string; details?: string }).notes;
  const payloadDetails =
    payloadNotes ||
    (details as { details?: string }).details ||
    (payloadDescription &&
    payloadDescription !== event.description &&
    payloadDescription !== payloadTitle
      ? payloadDescription
      : undefined);

  const title =
    (event as { title?: string }).title ||
    payloadTitle ||
    event.description ||
    payloadDescription ||
    "Untitled event";

  const eventDescription = event.description;
  const normalizedDescription =
    payloadDetails ||
    (payloadDescription && payloadDescription !== title ? payloadDescription : undefined) ||
    (eventDescription && eventDescription !== title ? eventDescription : undefined) ||
    undefined;

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
    description: normalizedDescription,
    category: deriveCategory(event),
    allDay,
    repeat,
    reminder,
    eventType,
    platform,
    tags,
    guests,
    source: event,
  };
};

const normalizeTask = (task: ApiTask): CalendarTask => {
  const dueSource = task.dueDate ?? undefined;
  let due: string | undefined;
  let time: string | undefined;

  if (dueSource) {
    const match = dueSource.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))/);
    if (match) {
      due = match[1];
      time = match[2];
    } else {
      due = dueSource.slice(0, 10);
      const fallback = dueSource.match(/T(\d{2}:\d{2})/);
      time = fallback ? fallback[1] : undefined;
    }
  }

  return {
    id:
      task.taskId ||
      (task as { id?: string }).id ||
      `${task.projectId}-${Math.random().toString(36).slice(2)}`,
    title: task.title ?? "Untitled task",
    due,
    time,
    done: task.status === "done",
    description: task.description ?? undefined,
    source: task,
  };
};

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
  tasks: CalendarTask[];
  onSelectDate: (d: Date) => void;
  onOpenCreate: (d: Date, tab?: CreateCalendarItemTab) => void;
  onOpenQuickTask: (d: Date) => void;
  canCreateTasks: boolean;
  onEditEvent: (event: CalendarEvent) => void;
  onEditTask: (task: CalendarTask) => void;
};

function MonthGrid({
  viewDate,
  selectedDate,
  events,
  tasks,
  onSelectDate,
  onOpenCreate,
  onOpenQuickTask,
  canCreateTasks,
  onEditEvent,
  onEditTask,
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
  const tasksByDate = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();
    tasks.forEach((task) => {
      if (!task.due) return;
      if (!map.has(task.due)) map.set(task.due, []);
      map.get(task.due)!.push(task);
    });
    return map;
  }, [tasks]);

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [quickAddKey, setQuickAddKey] = useState<string | null>(null);

  useEffect(() => {
    if (!quickAddKey) return;

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".month-grid__quick-add-container")) {
        return;
      }
      setQuickAddKey(null);
    };

    document.addEventListener("click", handleDocumentClick);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
    };
  }, [quickAddKey]);

  const handleMouseLeave = (key: string) => {
    setHoveredKey((current) => (current === key ? null : current));
  };

  const handleOpenCreate = (day: Date, tab?: CreateCalendarItemTab) => {
    onSelectDate(day);
    onOpenCreate(day, tab);
    setQuickAddKey(null);
  };

  const handleOpenQuickTask = (day: Date) => {
    onSelectDate(day);
    onOpenQuickTask(day);
    setQuickAddKey(null);
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
        const dayTasks = tasksByDate.get(key) || [];
        const combined = [
          ...dayEvents.map((event) => ({
            type: "event" as const,
            sortKey: event.start ?? "99:99",
            event,
          })),
          ...dayTasks.map((task) => ({
            type: "task" as const,
            sortKey: task.time ?? "99:99",
            task,
          })),
        ].sort((a, b) => {
          const timeCompare = a.sortKey.localeCompare(b.sortKey);
          if (timeCompare !== 0) return timeCompare;
          if (a.type === b.type) {
            const titleA = a.type === "event" ? a.event.title : a.task.title;
            const titleB = b.type === "event" ? b.event.title : b.task.title;
            return titleA.localeCompare(titleB);
          }
          return a.type === "event" ? -1 : 1;
        });

        const visible = combined.slice(0, 4);
        const remaining = combined.length - visible.length;

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
              {visible.map((item) => {
                if (item.type === "event") {
                  const { event } = item;
                  return (
                    <div
                      key={`event-${event.id}`}
                      className="month-grid__event"
                      role="button"
                      tabIndex={0}
                      onClick={(mouseEvent) => {
                        mouseEvent.stopPropagation();
                        onEditEvent(event);
                      }}
                      onKeyDown={(keyboardEvent) => {
                        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                          keyboardEvent.preventDefault();
                          onEditEvent(event);
                        }
                      }}
                    >
                      <span
                        className={`month-grid__item-icon ${categoryColor[event.category]}`}
                      >
                        <Clock className="month-grid__item-icon-svg" aria-hidden />
                      </span>
                      <span className="month-grid__event-title" title={event.title}>
                        {event.title}
                      </span>
                    </div>
                  );
                }

                const { task } = item;
                return (
                  <div
                    key={`task-${task.id}`}
                    className="month-grid__event month-grid__event--task"
                    role="button"
                    tabIndex={0}
                    onClick={(mouseEvent) => {
                      mouseEvent.stopPropagation();
                      onEditTask(task);
                    }}
                    onKeyDown={(keyboardEvent) => {
                      if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                        keyboardEvent.preventDefault();
                        onEditTask(task);
                      }
                    }}
                  >
                    <span className="month-grid__item-icon month-grid__item-icon--task">
                      <CheckSquare className="month-grid__item-icon-svg" aria-hidden />
                    </span>
                    <span
                      className={`month-grid__event-title ${task.done ? "is-complete" : ""}`}
                      title={task.title}
                    >
                      {task.title}
                    </span>
                  </div>
                );
              })}
              {remaining > 0 && <div className="month-grid__more">+{remaining} more</div>}
            </div>
            <div className="month-grid__quick-add-container">
              <button
                type="button"
                className={`month-grid__quick-add${quickAddKey === key ? " is-open" : ""}`}
                aria-label="Add calendar item"
                onClick={(event) => {
                  event.stopPropagation();
                  setQuickAddKey((current) => (current === key ? null : key));
                }}
              >
                <Plus className="month-grid__quick-add-icon" aria-hidden />
              </button>
              <div
                className={`month-grid__quick-add-tooltip${
                  quickAddKey === key ? " is-visible" : ""
                }`}
                role="menu"
                aria-hidden={quickAddKey === key ? undefined : true}
              >
                <button
                  type="button"
                  className="month-grid__quick-add-option"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleOpenCreate(day, "Event");
                  }}
                >
                  Event
                </button>
                <button
                  type="button"
                  className="month-grid__quick-add-option month-grid__quick-add-option--task"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleOpenQuickTask(day);
                  }}
                  disabled={!canCreateTasks}
                >
                  Task
                </button>
              </div>
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
  tasks: CalendarTask[];
  onEditEvent: (event: CalendarEvent) => void;
  onEditTask: (task: CalendarTask) => void;
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

function WeekGrid({ anchorDate, events, tasks, onEditEvent, onEditTask }: WeekGridProps) {
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

  const tasksByDay = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();
    days.forEach((day) => {
      map.set(fmt(day), []);
    });
    tasks.forEach((task) => {
      if (!task.due) return;
      const bucket = map.get(task.due);
      if (!bucket) return;
      bucket.push(task);
    });
    return map;
  }, [days, tasks]);

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
            const dayTasks = tasksByDay.get(key) ?? [];
            const timed = dayEvents.timed.filter(
              (event) => parseHour(event.start) === hour
            );
            return (
              <div key={`${key}-${hour}`} className="week-grid__cell">
                {hourIndex === 0 && (dayEvents.allDay.length > 0 || dayTasks.length > 0) && (
                  <div className="week-grid__all-day">
                    {dayEvents.allDay.map((event) => (
                      <div
                        key={event.id}
                        className={`week-grid__all-day-pill ${categoryColor[event.category]}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => onEditEvent(event)}
                        onKeyDown={(keyboardEvent) => {
                          if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                            keyboardEvent.preventDefault();
                            onEditEvent(event);
                          }
                        }}
                      >
                        <div className="week-grid__event-title">{event.title}</div>
                        <div className="week-grid__event-time">All day</div>
                      </div>
                    ))}
                    {dayTasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        className="week-grid__task"
                        onClick={() => onEditTask(task)}
                      >
                        <span className="week-grid__task-icon">
                          <CheckSquare className="week-grid__task-icon-svg" aria-hidden />
                        </span>
                        <div className="week-grid__task-body">
                          <div
                            className={`week-grid__task-title ${task.done ? "is-complete" : ""}`}
                          >
                            {task.title}
                          </div>
                          {task.time && (
                            <div className="week-grid__task-time">{task.time}</div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {timed.map((event) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0.4, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`week-grid__event ${categoryColor[event.category]}`}
                    onClick={() => onEditEvent(event)}
                    onKeyDown={(keyboardEvent) => {
                      if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                        keyboardEvent.preventDefault();
                        onEditEvent(event);
                      }
                    }}
                    role="button"
                    tabIndex={0}
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
  tasks: CalendarTask[];
  onEditEvent: (event: CalendarEvent) => void;
  onEditTask: (task: CalendarTask) => void;
};

function DayList({ date, events, tasks, onEditEvent, onEditTask }: DayListProps) {
  const list = useMemo(() => {
    const key = fmt(date);
    const eventItems = events
      .filter((event) => event.date === key)
      .map((event) => ({
        type: "event" as const,
        sortKey: event.start ?? "99:99",
        event,
      }));
    const taskItems = tasks
      .filter((task) => task.due === key)
      .map((task) => ({
        type: "task" as const,
        sortKey: task.time ?? "99:99",
        task,
      }));
    return [...eventItems, ...taskItems].sort((a, b) => {
      const timeCompare = a.sortKey.localeCompare(b.sortKey);
      if (timeCompare !== 0) return timeCompare;
      if (a.type === b.type) {
        const labelA = a.type === "event" ? a.event.title : a.task.title;
        const labelB = b.type === "event" ? b.event.title : b.task.title;
        return labelA.localeCompare(labelB);
      }
      return a.type === "event" ? -1 : 1;
    });
  }, [date, events, tasks]);

  if (list.length === 0) {
    return <div className="day-list__empty">No events or tasks for this day.</div>;
  }

  return (
    <div className="day-list">
      {list.map((item) => {
        if (item.type === "event") {
          const { event } = item;
          const fallbackEnd =
            event.end || (event.start ? addHoursToTime(event.start, 1) : undefined);
          return (
            <div
              key={`event-${event.id}`}
              className="day-list__item"
              role="button"
              tabIndex={0}
              onClick={() => onEditEvent(event)}
              onKeyDown={(keyboardEvent) => {
                if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                  keyboardEvent.preventDefault();
                  onEditEvent(event);
                }
              }}
            >
              <div className="day-list__icon-wrapper">
                <span
                  className={`day-list__icon ${categoryColor[event.category]}`}
                >
                  <Clock className="day-list__icon-svg" aria-hidden />
                </span>
              </div>
              <div className="day-list__content">
                <div className="day-list__title">{event.title}</div>
                <div className="day-list__time">
                  {event.start ? (
                    fallbackEnd ? `${event.start} - ${fallbackEnd}` : event.start
                  ) : (
                    "All day"
                  )}
                </div>
                {event.description && (
                  <div className="day-list__description">{event.description}</div>
                )}
              </div>
            </div>
          );
        }

        const { task } = item;
        return (
          <div
            key={`task-${task.id}`}
            className="day-list__item day-list__item--task"
            role="button"
            tabIndex={0}
            onClick={() => onEditTask(task)}
            onKeyDown={(keyboardEvent) => {
              if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                keyboardEvent.preventDefault();
                onEditTask(task);
              }
            }}
          >
            <div className="day-list__icon-wrapper">
              <span className="day-list__icon day-list__icon--task">
                <CheckSquare className="day-list__icon-svg" aria-hidden />
              </span>
            </div>
            <div className="day-list__content">
              <div className={`day-list__title ${task.done ? "is-complete" : ""}`}>
                {task.title}
              </div>
              <div className="day-list__time">
                {task.time ? `Due ${task.time}` : "Task"}
              </div>
              {task.description && (
                <div className="day-list__description">{task.description}</div>
              )}
            </div>
          </div>
        );
      })}
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
  onEditEvent: (event: CalendarEvent) => void;
  onEditTask: (task: CalendarTask) => void;
  onOpenTasksOverview: () => void;
};

const compareDateStrings = (a?: string, b?: string) => {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
};

function EventsAndTasks({
  events,
  tasks,
  onToggleTask,
  onEditEvent,
  onEditTask,
  onOpenTasksOverview,
}: EventsAndTasksProps) {
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
              <button
                type="button"
                className="events-tasks__item-button"
                onClick={() => onEditEvent(event)}
              >
                <span
                  className={`events-tasks__icon events-tasks__icon--event ${categoryColor[event.category]}`}
                >
                  <Clock className="events-tasks__icon-svg" aria-hidden />
                </span>
                <span className="events-tasks__event-title" title={event.title}>
                  {event.title}
                </span>
                <span className="events-tasks__meta">
                  {event.date.slice(5)}
                  {event.start ? ` · ${event.start}` : ""}
                </span>
              </button>
            </li>
          ))}
          {upcoming.length === 0 && (
            <li className="events-tasks__empty">No upcoming events scheduled.</li>
          )}
        </ul>
      </div>

      <div className="events-tasks__section">
        <div className="events-tasks__section-header">
          <div className="events-tasks__section-title">Tasks</div>
          <button
            type="button"
            className="events-tasks__map-button"
            onClick={onOpenTasksOverview}
          >
            Open map
          </button>
        </div>
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
              <button
                type="button"
                className="events-tasks__item-button"
                onClick={() => onEditTask(task)}
              >
                <span className="events-tasks__icon events-tasks__icon--task">
                  <CheckSquare className="events-tasks__icon-svg" aria-hidden />
                </span>
                <span
                  className={`events-tasks__task-title ${task.done ? "is-complete" : ""}`}
                >
                  {task.title}
                </span>
                {task.due && (
                  <span className="events-tasks__meta">
                    due {task.due.slice(5)}
                    {task.time ? ` · ${task.time}` : ""}
                  </span>
                )}
              </button>
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
  onUpdateEvent: (target: ApiTimelineEvent, input: CreateEventRequest) => Promise<void>;
  onCreateTask: (input: CreateTaskRequest) => Promise<void>;
  onUpdateTask: (target: ApiTask, input: CreateTaskRequest) => Promise<void>;
  onDeleteEvent: (target: ApiTimelineEvent) => Promise<void>;
  onDeleteTask: (target: ApiTask) => Promise<void>;
  onToggleTask: (id: string) => void;
  teamMembers: ProjectTeamMember[];
  onRefreshTasks: () => Promise<void> | void;
  taskProjects: QuickCreateTaskModalProject[];
  activeProjectId?: string | null;
  activeProjectName?: string | null;
};

const CalendarSurface: React.FC<CalendarSurfaceProps> = ({
  events,
  tasks,
  currentDate,
  onDateChange,
  onCreateEvent,
  onUpdateEvent,
  onCreateTask,
  onUpdateTask,
  onDeleteEvent,
  onDeleteTask,
  onToggleTask,
  teamMembers,
  onRefreshTasks,
  taskProjects,
  activeProjectId,
  activeProjectName,
}) => {
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [internalDate, setInternalDate] = useState<Date>(currentDate);
  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    date: Date;
    tab: CreateCalendarItemTab;
    event: CalendarEvent | null;
    task: CalendarTask | null;
  }>({
    open: false,
    mode: "create",
    date: currentDate,
    tab: "Event",
    event: null,
    task: null,
  });
  const [isQuickTaskModalOpen, setIsQuickTaskModalOpen] = useState(false);
  const [quickTaskDraft, setQuickTaskDraft] = useState<QuickCreateTaskModalTask | null>(null);
  const [isTasksOverviewOpen, setIsTasksOverviewOpen] = useState(false);

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

  const canCreateTasks = useMemo(
    () => taskProjects.length > 0 || Boolean(activeProjectId),
    [taskProjects, activeProjectId]
  );

  const handleRefreshTasks = useCallback(() => {
    void onRefreshTasks();
  }, [onRefreshTasks]);

  const handleOpenTasksOverview = useCallback(() => {
    setIsTasksOverviewOpen(true);
  }, []);

  const handleCloseTasksOverview = useCallback(() => {
    setIsTasksOverviewOpen(false);
  }, []);

  useEffect(() => {
    if (!isTasksOverviewOpen) return;
    if (typeof window === "undefined") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCloseTasksOverview();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCloseTasksOverview, isTasksOverviewOpen]);

  const handleOpenQuickTaskModal = useCallback(
    (date: Date) => {
      setInternalDate(date);
      const fallbackProjectId =
        (typeof activeProjectId === "string" && activeProjectId) ||
        (taskProjects.length > 0 ? taskProjects[0].id : "");
      const fallbackProjectName =
        activeProjectName ??
        taskProjects.find((project) => project.id === fallbackProjectId)?.name ??
        (taskProjects.length === 1 ? taskProjects[0].name : undefined);

      setQuickTaskDraft({
        projectId: fallbackProjectId || "",
        projectName: fallbackProjectName ?? undefined,
        dueDate: date,
        status: "todo",
      });
      setIsQuickTaskModalOpen(true);
    },
    [activeProjectId, activeProjectName, taskProjects]
  );

  const handleCloseQuickTaskModal = useCallback(() => {
    setIsQuickTaskModalOpen(false);
    setQuickTaskDraft(null);
  }, []);

  const handleSelectDate = useCallback((date: Date) => {
    setInternalDate(date);
  }, []);

  const handleOpenCreate = useCallback(
    (date: Date, tab: CreateCalendarItemTab = "Event") => {
      setInternalDate(date);
      setModalState({ open: true, mode: "create", date, tab, event: null, task: null });
    },
    []
  );

  const handleOpenEditEvent = useCallback((event: CalendarEvent) => {
    const eventDate = safeDate(event.date) ?? new Date(event.date);
    setInternalDate(eventDate);
    setModalState({
      open: true,
      mode: "edit",
      date: eventDate,
      tab: "Event",
      event,
      task: null,
    });
  }, []);

  const handleOpenEditTask = useCallback((task: CalendarTask) => {
    const taskDate = task.due ? safeDate(task.due) ?? new Date(task.due) : new Date();
    setInternalDate(taskDate);
    setModalState({
      open: true,
      mode: "edit",
      date: taskDate,
      tab: "Task",
      event: null,
      task,
    });
  }, []);

  const handleCloseCreate = useCallback(() => {
    setModalState((previous) => ({
      open: false,
      mode: "create",
      date: previous.date,
      tab: "Event",
      event: null,
      task: null,
    }));
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
                onEditEvent={handleOpenEditEvent}
                onEditTask={handleOpenEditTask}
                onOpenTasksOverview={handleOpenTasksOverview}
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
                    tasks={tasks}
                    onSelectDate={handleSelectDate}
                    onOpenCreate={handleOpenCreate}
                    onOpenQuickTask={handleOpenQuickTaskModal}
                    canCreateTasks={canCreateTasks}
                    onEditEvent={handleOpenEditEvent}
                    onEditTask={handleOpenEditTask}
                  />
                )}
                {view === "week" && (
                  <WeekGrid
                    anchorDate={internalDate}
                    events={events}
                    tasks={tasks}
                    onEditEvent={handleOpenEditEvent}
                    onEditTask={handleOpenEditTask}
                  />
                )}
                {view === "day" && (
                  <DayList
                    date={internalDate}
                    events={events}
                    tasks={tasks}
                    onEditEvent={handleOpenEditEvent}
                    onEditTask={handleOpenEditTask}
                  />
                )}
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
        isOpen={modalState.open}
        initialDate={
          modalState.event
            ? safeDate(modalState.event.date) ?? modalState.date
            : modalState.task?.due
            ? safeDate(modalState.task.due) ?? modalState.date
            : modalState.date
        }
        initialTab={modalState.tab}
        mode={modalState.mode}
        teamMembers={teamMembers}
        initialValues={
          modalState.mode === "edit"
            ? modalState.event
              ? {
                  title: modalState.event.title,
                  date: modalState.event.date,
                  time: modalState.event.start,
                  endTime: modalState.event.end,
                  allDay: modalState.event.allDay,
                  repeat: modalState.event.repeat,
                  reminder: modalState.event.reminder,
                  eventType: modalState.event.eventType,
                  platform: modalState.event.platform,
                  description: modalState.event.description,
                  tags: modalState.event.tags,
                  guests: modalState.event.guests,
                }
              : modalState.task
              ? {
                  title: modalState.task.title,
                  date: modalState.task.due ?? fmt(modalState.date),
                  time: modalState.task.time,
                  description: modalState.task.description,
                  tags: [],
                  guests: [],
                }
              : undefined
            : undefined
        }
        availableTabs={modalState.mode === "edit" ? [modalState.tab] : undefined}
        onClose={handleCloseCreate}
        onCreateEvent={onCreateEvent}
        onCreateTask={onCreateTask}
        onUpdateEvent={
          modalState.mode === "edit" && modalState.event
            ? (input) => onUpdateEvent(modalState.event!.source, input)
            : undefined
        }
        onUpdateTask={
          modalState.mode === "edit" && modalState.task
            ? (input) => onUpdateTask(modalState.task!.source, input)
            : undefined
        }
        onDelete={
          modalState.mode === "edit"
            ? modalState.event
              ? () => onDeleteEvent(modalState.event!.source)
              : modalState.task
              ? () => onDeleteTask(modalState.task!.source)
              : undefined
            : undefined
        }
      />
      <QuickCreateTaskModal
        open={isQuickTaskModalOpen}
        onClose={handleCloseQuickTaskModal}
        projects={taskProjects}
        onCreated={handleRefreshTasks}
        onUpdated={handleRefreshTasks}
        onDeleted={handleRefreshTasks}
        activeProjectId={activeProjectId ?? null}
        activeProjectName={activeProjectName ?? undefined}
        scopedProjectId={activeProjectId ?? null}
        task={quickTaskDraft}
      />
      {isTasksOverviewOpen && (
        <div
          className="calendar-tasks-overview-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Tasks overview"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              handleCloseTasksOverview();
            }
          }}
        >
          <div className="calendar-tasks-overview-panel">
            <button
              type="button"
              className="calendar-tasks-overview-close"
              onClick={handleCloseTasksOverview}
              aria-label="Close tasks overview"
            >
              <X aria-hidden />
            </button>
            <TasksOverviewCard className="calendar-tasks-overview-card" />
          </div>
        </div>
      )}
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

  const teamMembers = useTeamMembers(activeProject ?? null);

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

  const getEventIdentifier = useCallback((event: ApiTimelineEvent) => {
    const candidate =
      (event.eventId ??
        event.timelineEventId ??
        event.id ??
        (event as { [key: string]: unknown })["timestamp#uuid"] ??
        (event as { uuid?: string }).uuid ??
        (event as { event_id?: string }).event_id) ?? null;

    if (candidate != null && candidate !== "") {
      return String(candidate);
    }

    return `${event.date ?? ""}#${event.description ?? ""}`;
  }, []);

  const handleCreateEvent = useCallback(
    async (input: CreateEventRequest) => {
      if (!projectId) return;

      const isoDate = input.date;
      const repeatValue =
        input.repeat && input.repeat !== "Does not repeat" ? input.repeat : undefined;

      const trimmedTitle = input.title.trim();
      const trimmedDescription = input.description?.trim();
      const draftEventId = generateEventId();

      const startAtIso =
        !input.allDay && input.time
          ? (() => {
              const parsed = new Date(`${isoDate}T${input.time}`);
              return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
            })()
          : undefined;

      const endAtIso =
        !input.allDay && input.endTime
          ? (() => {
              const parsed = new Date(`${isoDate}T${input.endTime}`);
              return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
            })()
          : undefined;

      try {
        const baseBody: ApiTimelineEvent = {
          id: draftEventId,
          eventId: draftEventId,
          timelineEventId: draftEventId,
          date: isoDate,
          title: trimmedTitle,
          description: trimmedDescription ?? trimmedTitle,
          tags: input.tags,
          guests: input.guests,
          allDay: input.allDay,
          startAt: input.allDay ? null : startAtIso ?? null,
          endAt: input.allDay ? null : endAtIso ?? null,
        };

        const optionalStrings: Record<string, unknown> = {};
        const nextRepeat = resolveUpdatedString(repeatValue, undefined);
        if (nextRepeat !== undefined) {
          optionalStrings.repeat = nextRepeat;
        }
        const nextReminder = resolveUpdatedString(input.reminder, undefined);
        if (nextReminder !== undefined) {
          optionalStrings.reminder = nextReminder;
        }
        const nextEventType = resolveUpdatedString(input.eventType, undefined);
        if (nextEventType !== undefined) {
          optionalStrings.eventType = nextEventType;
        }
        const nextPlatform = resolveUpdatedString(input.platform, undefined);
        if (nextPlatform !== undefined) {
          optionalStrings.platform = nextPlatform;
        }

        const eventBody = {
          ...baseBody,
          ...optionalStrings,
        } as ApiTimelineEvent;

        const created = await createEvent(projectId, eventBody);

        const resolvedId =
          created.id || created.eventId || created.timelineEventId || draftEventId;
        const resolvedEventId = created.eventId || resolvedId;
        const resolvedTitle = (created as { title?: string }).title ?? trimmedTitle;
        const resolvedDescription =
          created.description ?? trimmedDescription ?? trimmedTitle;
        const resolvedAllDay =
          typeof created.allDay === "boolean" ? created.allDay : eventBody.allDay;
        const resolvedStartAt =
          resolvedAllDay
            ? null
            : typeof created.startAt === "string"
              ? created.startAt
              : (eventBody.startAt as string | null) ?? null;
        const resolvedEndAt =
          resolvedAllDay
            ? null
            : typeof created.endAt === "string"
              ? created.endAt
              : (eventBody.endAt as string | null) ?? null;

        const pickResolvedField = <T,>(field: string): T | undefined => {
          if (Object.prototype.hasOwnProperty.call(created, field)) {
            return (created as Record<string, unknown>)[field] as T;
          }
          if (Object.prototype.hasOwnProperty.call(eventBody, field)) {
            return (eventBody as Record<string, unknown>)[field] as T;
          }
          return undefined;
        };

        const normalized = normalizeTimelineEvent({
          ...created,
          id: resolvedId,
          eventId: resolvedEventId,
          title: resolvedTitle,
          description: resolvedDescription,
          date: created.date ?? isoDate,
          tags: created.tags ?? eventBody.tags ?? input.tags,
          guests:
            (Array.isArray((created as { guests?: unknown }).guests)
              ? (created as { guests?: string[] }).guests
              : undefined) ?? eventBody.guests,
          repeat: pickResolvedField("repeat"),
          reminder: pickResolvedField("reminder"),
          eventType: pickResolvedField("eventType"),
          platform: pickResolvedField("platform"),
          allDay: resolvedAllDay,
          startAt: resolvedStartAt,
          endAt: resolvedEndAt,
        });

        const asTimelineEvent: ApiTimelineEvent = {
          ...created,
          ...eventBody,
          id: resolvedId,
          eventId: resolvedEventId,
          title: resolvedTitle,
          description: resolvedDescription,
          date: created.date ?? isoDate,
          tags: created.tags ?? eventBody.tags ?? input.tags,
          guests:
            (Array.isArray((created as { guests?: unknown }).guests)
              ? (created as { guests?: string[] }).guests
              : undefined) ?? eventBody.guests,
          allDay: resolvedAllDay,
          startAt: resolvedStartAt,
          endAt: resolvedEndAt,
        };
        asTimelineEvent.projectId = (created as { projectId?: string }).projectId ?? projectId;
        asTimelineEvent.timelineEventId =
          (created as { timelineEventId?: string }).timelineEventId ?? resolvedEventId;

        const assignOptional = (field: string, value: unknown) => {
          const container = asTimelineEvent as Record<string, unknown>;
          if (value !== undefined) {
            container[field] = value;
          } else {
            delete container[field];
          }
        };

        assignOptional("repeat", pickResolvedField("repeat"));
        assignOptional("reminder", pickResolvedField("reminder"));
        assignOptional("eventType", pickResolvedField("eventType"));
        assignOptional("platform", pickResolvedField("platform"));
        delete (asTimelineEvent as Record<string, unknown>).payload;
        delete (asTimelineEvent as Record<string, unknown>).meta;

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

  const handleUpdateEvent = useCallback(
    async (target: ApiTimelineEvent, input: CreateEventRequest) => {
      if (!projectId) return;

      const identifier = getEventIdentifier(target);
      const isoDate = input.date;
      const repeatValue =
        input.repeat && input.repeat !== "Does not repeat" ? input.repeat : undefined;

      const trimmedTitle = input.title.trim();
      const trimmedDescription = input.description?.trim();
      const startAtIso =
        !input.allDay && input.time
          ? (() => {
              const parsed = new Date(`${isoDate}T${input.time}`);
              return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
            })()
          : undefined;

      const endAtIso =
        !input.allDay && input.endTime
          ? (() => {
              const parsed = new Date(`${isoDate}T${input.endTime}`);
              return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
            })()
          : undefined;

      const existingDetails: Record<string, unknown> = {
        ...(((target as { meta?: Record<string, unknown> }).meta) ?? {}),
        ...((target.payload as Record<string, unknown>) ?? {}),
      };

      const eventId =
        target.eventId ??
        target.timelineEventId ??
        target.id ??
        (target as { event_id?: string }).event_id;

      if (!eventId) {
        throw new Error("Unable to determine event id for update");
      }

      const baseUpdate: ApiTimelineEvent & { projectId: string; eventId: string } = {
        projectId,
        eventId,
        title: trimmedTitle,
        description: trimmedDescription ?? trimmedTitle,
        date: isoDate,
        tags: input.tags,
        guests: input.guests,
        allDay: input.allDay,
        startAt: input.allDay ? null : startAtIso ?? null,
        endAt: input.allDay ? null : endAtIso ?? null,
      };

      const optionalUpdates: Record<string, unknown> = {};

      const previousRepeat =
        (target as { repeat?: unknown }).repeat ?? existingDetails.repeat;
      const resolvedRepeat = resolveUpdatedString(repeatValue, previousRepeat);
      if (resolvedRepeat !== undefined) {
        optionalUpdates.repeat = resolvedRepeat;
      }

      const previousReminder =
        (target as { reminder?: unknown }).reminder ?? existingDetails.reminder;
      const resolvedReminder = resolveUpdatedString(input.reminder, previousReminder);
      if (resolvedReminder !== undefined) {
        optionalUpdates.reminder = resolvedReminder;
      }

      const previousEventType =
        (target as { eventType?: unknown }).eventType ?? existingDetails.eventType;
      const resolvedEventType = resolveUpdatedString(
        input.eventType,
        previousEventType,
      );
      if (resolvedEventType !== undefined) {
        optionalUpdates.eventType = resolvedEventType;
      }

      const previousPlatform =
        (target as { platform?: unknown }).platform ?? existingDetails.platform;
      const resolvedPlatform = resolveUpdatedString(input.platform, previousPlatform);
      if (resolvedPlatform !== undefined) {
        optionalUpdates.platform = resolvedPlatform;
      }

      const updatePayload = {
        ...baseUpdate,
        ...optionalUpdates,
      } satisfies ApiTimelineEvent & { projectId: string; eventId: string };

      try {
        const updated = await updateEvent(updatePayload);

        const resolvedAllDay =
          typeof updated.allDay === "boolean" ? updated.allDay : updatePayload.allDay;
        const resolvedStartAt =
          resolvedAllDay
            ? null
            : typeof updated.startAt === "string"
              ? updated.startAt
              : (updatePayload.startAt as string | null) ?? null;
        const resolvedEndAt =
          resolvedAllDay
            ? null
            : typeof updated.endAt === "string"
              ? updated.endAt
              : (updatePayload.endAt as string | null) ?? null;

        const pickResolvedField = <T,>(field: string): T | undefined => {
          if (Object.prototype.hasOwnProperty.call(updated, field)) {
            return (updated as Record<string, unknown>)[field] as T;
          }
          if (Object.prototype.hasOwnProperty.call(updatePayload, field)) {
            return (updatePayload as Record<string, unknown>)[field] as T;
          }
          if (Object.prototype.hasOwnProperty.call(target, field)) {
            return (target as Record<string, unknown>)[field] as T;
          }
          if (Object.prototype.hasOwnProperty.call(existingDetails, field)) {
            return existingDetails[field] as T;
          }
          return undefined;
        };

        const updatedEvent: ApiTimelineEvent = {
          ...target,
          ...updated,
          projectId,
          title: updated.title ?? trimmedTitle,
          description: updated.description ?? trimmedDescription ?? trimmedTitle,
          date: updated.date ?? isoDate,
          tags: Array.isArray(updated.tags) ? updated.tags : updatePayload.tags,
          guests:
            (Array.isArray((updated as { guests?: unknown }).guests)
              ? (updated as { guests?: string[] }).guests
              : undefined) ?? updatePayload.guests,
          allDay: resolvedAllDay,
          startAt: resolvedStartAt,
          endAt: resolvedEndAt,
        };

        updatedEvent.projectId =
          (updated as { projectId?: string }).projectId ?? projectId;

        updatedEvent.id =
          updated.id ??
          target.id ??
          target.eventId ??
          target.timelineEventId ??
          updatePayload.eventId;
        updatedEvent.eventId = updated.eventId ?? updatePayload.eventId;
        updatedEvent.timelineEventId =
          (updated as { timelineEventId?: string }).timelineEventId ??
          target.timelineEventId ??
          updatedEvent.eventId;

        const repeatField = pickResolvedField<string | null>("repeat");
        const reminderField = pickResolvedField<string | null>("reminder");
        const eventTypeField = pickResolvedField<string | null>("eventType");
        const platformField = pickResolvedField<string | null>("platform");

        const assignOptional = (field: string, value: unknown) => {
          const container = updatedEvent as Record<string, unknown>;
          if (value !== undefined) {
            container[field] = value;
          } else {
            delete container[field];
          }
        };

        assignOptional("repeat", repeatField);
        assignOptional("reminder", reminderField);
        assignOptional("eventType", eventTypeField);
        assignOptional("platform", platformField);

        delete (updatedEvent as Record<string, unknown>).payload;
        delete (updatedEvent as Record<string, unknown>).meta;

        setTimelineEvents((previous) => {
          let found = false;
          const next = previous.map((event) => {
            if (getEventIdentifier(event) === identifier) {
              found = true;
              return updatedEvent;
            }
            return event;
          });
          return found ? next : [...next, updatedEvent];
        });

        setActiveProject((prev) => {
          if (!prev || prev.projectId !== projectId) return prev;
          const existing = Array.isArray(prev.timelineEvents)
            ? prev.timelineEvents
            : [];
          let found = false;
          const nextTimeline = existing.map((event) => {
            if (getEventIdentifier(event) === identifier) {
              found = true;
              return updatedEvent;
            }
            return event;
          });
          return {
            ...prev,
            timelineEvents: found ? nextTimeline : [...nextTimeline, updatedEvent],
          };
        });

        setProjects((prev) =>
          Array.isArray(prev)
            ? prev.map((project) => {
                if (project.projectId !== projectId) return project;
                const existing = Array.isArray(project.timelineEvents)
                  ? project.timelineEvents
                  : [];
                let found = false;
                const nextTimeline = existing.map((event) => {
                  if (getEventIdentifier(event) === identifier) {
                    found = true;
                    return updatedEvent;
                  }
                  return event;
                });
                return {
                  ...project,
                  timelineEvents: found ? nextTimeline : [...nextTimeline, updatedEvent],
                };
              })
            : prev
        );

        const normalized = normalizeTimelineEvent(updatedEvent);
        if (normalized) {
          const normalizedDate = safeDate(normalized.date);
          if (normalizedDate) {
            setCurrentDate(normalizedDate);
          }
        }
      } catch (error) {
        console.error("Failed to update event", error);
        throw error;
      }
    },
    [projectId, getEventIdentifier, setActiveProject, setProjects]
  );

  const handleDeleteEvent = useCallback(
    async (target: ApiTimelineEvent) => {
      if (!projectId) return;

      const eventId =
        target.eventId ??
        target.timelineEventId ??
        target.id ??
        (target as { event_id?: string }).event_id;

      if (!eventId) {
        throw new Error("Unable to determine event id for delete");
      }

      const identifier = getEventIdentifier(target);
      const previousEvents = timelineEvents;
      const previousActiveProject = activeProject;
      let previousProjectsSnapshot: Project[] | null = null;

      const filterEvents = (items: ApiTimelineEvent[] | undefined | null) =>
        Array.isArray(items)
          ? items.filter((event) => getEventIdentifier(event) !== identifier)
          : items;

      setTimelineEvents((prev) =>
        prev.filter((event) => getEventIdentifier(event) !== identifier)
      );

      setActiveProject((prev) => {
        if (!prev || prev.projectId !== projectId) return prev;
        const filtered = filterEvents(prev.timelineEvents) ?? [];
        return {
          ...prev,
          timelineEvents: filtered,
        };
      });

      setProjects((prev) => {
        if (!Array.isArray(prev)) return prev;
        previousProjectsSnapshot = prev;
        return prev.map((project) => {
          if (project.projectId !== projectId) return project;
          const filtered = filterEvents(project.timelineEvents) ?? [];
          return {
            ...project,
            timelineEvents: filtered,
          };
        });
      });

      try {
        await deleteEvent(projectId, eventId);
      } catch (error) {
        console.error("Failed to delete event", error);
        setTimelineEvents(previousEvents);
        if (previousActiveProject?.projectId === projectId) {
          setActiveProject(previousActiveProject);
        }
        if (previousProjectsSnapshot) {
          setProjects(previousProjectsSnapshot);
        }
        throw error;
      }
    },
    [
      projectId,
      getEventIdentifier,
      timelineEvents,
      activeProject,
      setActiveProject,
      setProjects,
    ]
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

  const handleUpdateTask = useCallback(
    async (target: ApiTask, input: CreateTaskRequest) => {
      if (!projectId) return;

      const taskId = target.taskId ?? (target as { id?: string }).id;
      if (!taskId) {
        throw new Error("Unable to determine task id for update");
      }

      const dueDateIso = input.date
        ? (() => {
            const parsed = new Date(`${input.date}T${input.time ?? "00:00"}`);
            return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
          })()
        : undefined;

      try {
        const updated = await updateTask({
          ...target,
          projectId,
          taskId,
          title: input.title,
          description: input.description,
          dueDate: dueDateIso,
          status: target.status ?? "todo",
        });

        const next = tasksRef.current.map((task) =>
          (task.taskId ?? (task as { id?: string }).id) === taskId ? updated : task
        );
        tasksRef.current = next;
        setProjectTasks(next);
      } catch (error) {
        console.error("Failed to update task", error);
        throw error;
      }
    },
    [projectId]
  );

  const handleDeleteTask = useCallback(
    async (target: ApiTask) => {
      if (!projectId) return;

      const taskId = target.taskId ?? (target as { id?: string }).id;
      if (!taskId) return;

      const previous = tasksRef.current;
      const filtered = previous.filter(
        (task) => (task.taskId ?? (task as { id?: string }).id) !== taskId
      );

      tasksRef.current = filtered;
      setProjectTasks(filtered);

      try {
        await deleteTask({ projectId, taskId });
      } catch (error) {
        console.error("Failed to delete task", error);
        tasksRef.current = previous;
        setProjectTasks(previous);
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

  const refreshProjectTasks = useCallback(async () => {
    if (!projectId) return;

    try {
      const tasks = await fetchTasks(projectId);
      tasksRef.current = tasks;
      setProjectTasks(tasks);
    } catch (error) {
      console.error("Failed to refresh project tasks", error);
    }
  }, [projectId]);

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

  const quickCreateProjects = useMemo<QuickCreateTaskModalProject[]>(() => {
    if (!activeProject?.projectId) return [];

    const title = typeof activeProject.title === "string" ? activeProject.title.trim() : "";
    return [
      {
        id: activeProject.projectId,
        name: title || "Untitled project",
      },
    ];
  }, [activeProject]);

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
        onUpdateEvent={handleUpdateEvent}
        onCreateTask={handleCreateTask}
        onUpdateTask={handleUpdateTask}
        onDeleteEvent={handleDeleteEvent}
        onDeleteTask={handleDeleteTask}
        onToggleTask={handleToggleTask}
        teamMembers={teamMembers}
        onRefreshTasks={refreshProjectTasks}
        taskProjects={quickCreateProjects}
        activeProjectId={activeProject?.projectId ?? null}
        activeProjectName={activeProject?.title ?? null}
      />
    </ProjectPageLayout>
  );
};

export default CalendarPage;

