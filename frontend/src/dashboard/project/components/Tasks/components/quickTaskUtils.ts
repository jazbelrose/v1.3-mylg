import type { Status } from "../types";
import { parseDueDate, parseLocation } from "../utils";
import type { QuickTask, RawTask, TaskMapMarker, TaskStats } from "./taskTypes";

export type { QuickTask, RawTask, TaskMapMarker, TaskStats };

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export type TaskStatusCategory = "completed" | "overdue" | "dueSoon" | "scheduled" | "unscheduled";

export type TaskStatusContext = {
  startOfToday: Date;
  upcomingThreshold: Date;
};

export function createTaskStatusContext(baseDate: Date = new Date()): TaskStatusContext {
  const startOfToday = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const upcomingThreshold = new Date(startOfToday.getTime() + 7 * DAY_IN_MS);

  return { startOfToday, upcomingThreshold };
}

export function formatStatusLabel(status: Status): string {
  const normalized = status.replace(/_/g, " ").trim();
  if (!normalized) {
    return "To do";
  }

  return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
}

export function getTaskStatusCategory(
  status: Status,
  dueDate: Date | null,
  context: TaskStatusContext = createTaskStatusContext(),
): TaskStatusCategory {
  if (status === "done") {
    return "completed";
  }

  if (!dueDate || Number.isNaN(dueDate.getTime())) {
    return "unscheduled";
  }

  if (dueDate < context.startOfToday) {
    return "overdue";
  }

  if (dueDate <= context.upcomingThreshold) {
    return "dueSoon";
  }

  return "scheduled";
}

export function getTaskStatusBadge(
  status: Status,
  dueDate: Date | null,
  context?: TaskStatusContext,
): { label: string; category: TaskStatusCategory } {
  const category = getTaskStatusCategory(status, dueDate, context);

  switch (category) {
    case "completed":
      return { category, label: "Completed" };
    case "overdue":
      return { category, label: "Overdue" };
    case "dueSoon":
      return { category, label: "Due soon" };
    default:
      return { category, label: formatStatusLabel(status) };
  }
}

export type TaskStatusTone = "success" | "danger" | "warning" | "neutral";

export function getTaskStatusTone(category: TaskStatusCategory): TaskStatusTone {
  switch (category) {
    case "completed":
      return "success";
    case "overdue":
      return "danger";
    case "dueSoon":
      return "warning";
    default:
      return "neutral";
  }
}

export const DRAWER_SNAP_POINTS = [0.1, 0.45, 0.9] as const;
export type SnapIndex = 0 | 1 | 2;

export function getViewportHeight(): number {
  if (typeof window === "undefined") {
    return 0;
  }

  return window.visualViewport?.height ?? window.innerHeight;
}

export const DEFAULT_LOCATION = { lat: 37.0902, lng: -95.7129 } as const;

const dueDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  weekday: "short",
});

export function formatDueDate(date: Date): string {
  return dueDateFormatter.format(date);
}

export function formatDueLabel(task: QuickTask): string {
  if (!task.dueDate) {
    return "No due date";
  }

  return formatDueDate(task.dueDate);
}

export function resolveTaskDueDateIso(task: QuickTask): string | undefined {
  const raw = task.raw ?? {};
  const possible = (raw.dueDate ?? raw.due_date ?? raw.dueAt ?? raw.due_at ?? raw.due) as
    | string
    | number
    | Date
    | undefined;

  if (typeof possible === "string") {
    const trimmed = possible.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const normalized = new Date(`${trimmed}T00:00:00`);
      return Number.isNaN(normalized.getTime()) ? undefined : normalized.toISOString();
    }
    return trimmed;
  }

  if (possible instanceof Date && !Number.isNaN(possible.getTime())) {
    return possible.toISOString();
  }

  if (typeof possible === "number") {
    const fromNumber = new Date(possible);
    return Number.isNaN(fromNumber.getTime()) ? undefined : fromNumber.toISOString();
  }

  if (task.dueDate instanceof Date && !Number.isNaN(task.dueDate.getTime())) {
    return task.dueDate.toISOString();
  }

  if (typeof task.dueDateInput === "string" && task.dueDateInput) {
    const fromInput = new Date(`${task.dueDateInput}T00:00:00`);
    return Number.isNaN(fromInput.getTime()) ? undefined : fromInput.toISOString();
  }

  return undefined;
}

export function toDateInputString(value: unknown): string | null {
  if (value == null || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
          value.getDate(),
        ).padStart(2, "0")}`;
  }

  if (typeof value === "number") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate(),
    ).padStart(2, "0")}`;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
        parsed.getDate(),
      ).padStart(2, "0")}`;
    }
  }

  return null;
}

export function normalizeTask(raw: RawTask): QuickTask | null {
  const id = raw.taskId || raw.id;
  const title = (raw.title || raw.name || "").toString().trim();
  if (!id) {
    return null;
  }

  const dueSource = raw.dueAt ?? raw.due_at ?? raw.dueDate ?? raw.due_date ?? raw.due;
  const dueDate = parseDueDate(dueSource);

  return {
    id,
    title: title || "Untitled task",
    description: typeof raw.description === "string" ? raw.description : undefined,
    status: (raw.status as Status) || "todo",
    dueDate,
    dueDateInput: toDateInputString(dueSource),
    address: typeof raw.address === "string" ? raw.address : undefined,
    location: parseLocation(raw.location),
    assignedTo:
      typeof raw.assigneeId === "string"
        ? raw.assigneeId
        : typeof raw.assignedTo === "string"
          ? raw.assignedTo
          : undefined,
    projectId: typeof raw.projectId === "string" ? raw.projectId : undefined,
    raw,
  };
}

export function computeStats(tasks: QuickTask[]): TaskStats {
  const context = createTaskStatusContext();

  let completed = 0;
  let overdue = 0;
  let dueSoon = 0;

  tasks.forEach((task) => {
    const { category } = getTaskStatusBadge(task.status, task.dueDate, context);

    if (category === "completed") {
      completed += 1;
    } else if (category === "overdue") {
      overdue += 1;
    } else if (category === "dueSoon") {
      dueSoon += 1;
    }
  });

  return { completed, overdue, dueSoon };
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function buildMarkerThumbnail(color?: string): string {
  const fill = color && color.trim() ? color : "#2563eb";
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg width="40" height="52" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg"><path d="M20 2C11.163 2 4 9.163 4 18c0 11.046 16 30 16 30s16-18.954 16-30C36 9.163 28.837 2 20 2z" fill="${fill}" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="18" r="7" fill="#ffffff"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function sortTasksForDrawer(tasks: QuickTask[]): QuickTask[] {
  return tasks
    .slice()
    .sort((a, b) => {
      const aTime = a.dueDate ? a.dueDate.getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.dueDate ? b.dueDate.getTime() : Number.POSITIVE_INFINITY;
      if (aTime === bTime) {
        return a.title.localeCompare(b.title);
      }

      return aTime - bTime;
    });
}

export function buildMapMarkers(
  tasks: QuickTask[],
  markerThumbnail: string,
  activeTaskId: string | null,
): TaskMapMarker[] {
  return tasks.map((task) => ({
    id: task.id,
    lat: task.location!.lat,
    lng: task.location!.lng,
    iconUrl: markerThumbnail,
    title: task.title,
    isActive: task.id === activeTaskId,
    variant: "pin",
  }));
}
