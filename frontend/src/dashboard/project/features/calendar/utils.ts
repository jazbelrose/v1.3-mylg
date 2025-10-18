import type { ApiTask, TimelineEvent as ApiTimelineEvent } from "@/shared/utils/api";

export type CalendarCategory = "Work" | "Education" | "Personal";

export type CalendarEvent = {
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

export type CalendarTask = {
  id: string;
  title: string;
  due?: string; // ISO date
  done?: boolean;
  time?: string;
  description?: string;
  status?: ApiTask["status"];
  assignedTo?: string;
  source: ApiTask;
};

export const categoryColor: Record<CalendarCategory, string> = {
  Work: "calendar-pill-work",
  Education: "calendar-pill-education",
  Personal: "calendar-pill-personal",
};

export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
export const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const fmt = (d: Date) => d.toISOString().slice(0, 10);
export const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
export const setTime = (date: Date, hours: number, minutes = 0) =>
  new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
    0,
    0,
  );

export const generateEventId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `evt_${Math.random().toString(36).slice(2, 10)}`;
};

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const safeDate = (value?: string | null) => {
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

export const addHoursToTime = (time: string, hours: number) => {
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

export const resolveUpdatedString = (
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

export const normalizeTimelineEvent = (event: ApiTimelineEvent): CalendarEvent | null => {
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
        (details as { [key: string]: unknown })["all-day"],
    ) ?? (!start && !end);

  const repeat = parseString(
    (event as { repeat?: unknown }).repeat ??
      (event as { recurrence?: unknown }).recurrence ??
      details.repeat ??
      (details as { recurrence?: unknown }).recurrence ??
      (details as { frequency?: unknown }).frequency,
  );

  const reminder = parseString(
    (event as { reminder?: unknown }).reminder ??
      details.reminder ??
      (details as { alert?: unknown }).alert ??
      (details as { notification?: unknown }).notification,
  );

  const eventType = parseString(
    (event as { eventType?: unknown }).eventType ??
      details.eventType ??
      (details as { type?: unknown }).type ??
      (details as { category?: unknown }).category,
  );

  const platform = parseString(
    (event as { platform?: unknown }).platform ??
      details.platform ??
      (details as { provider?: unknown }).provider ??
      (details as { location?: unknown }).location,
  );

  const tags = parseStringArray(
    (event as { tags?: unknown }).tags ??
      details.tags ??
      (details as { labels?: unknown }).labels ??
      (details as { [key: string]: unknown })["tag-list"],
  );

  const guests = parseStringArray(
    (event as { guests?: unknown }).guests ??
      details.guests ??
      (details as { attendees?: unknown }).attendees ??
      (details as { participants?: unknown }).participants ??
      (details as { [key: string]: unknown })["guest-list"],
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

export const normalizeTask = (task: ApiTask): CalendarTask => {
  const dueSource = task.dueDate ?? undefined;
  let due: string | undefined;
  let time: string | undefined;
  const rawAssignedTo =
    typeof task.assigneeId === "string"
      ? task.assigneeId
      : typeof (task as { assignedTo?: string }).assignedTo === "string"
        ? (task as { assignedTo?: string }).assignedTo
        : undefined;

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
    status: task.status,
    assignedTo: rawAssignedTo,
    source: task,
  };
};

export const getMonthMatrix = (viewDate: Date) => {
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

export const compareDateStrings = (a?: string, b?: string) => {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
};

export const parseIsoDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

export const formatTimeLabel = (value?: string) => {
  if (!value) return undefined;
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return value;
  }
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
};
