import type { Task } from "@/shared/utils/api";
import { getDateKey } from "./utils";

const parseTaskDateValue = (value: unknown): Date | null => {
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

const resolveTaskTimestamp = (task: Task, names: string[]): Date | null => {
  for (const name of names) {
    const candidate = (task as Record<string, unknown>)[name];
    const parsed = parseTaskDateValue(candidate);
    if (parsed) return parsed;
  }
  return null;
};

export const getTaskDateKey = (task: Task): string | null => {
  const dateFields = [
    "dueDate",
    "due",
    "dueAt",
    "due_at",
    "startAt",
    "start",
    "startTime",
    "start_time",
    "endAt",
    "end",
    "endTime",
    "end_time",
  ];
  for (const field of dateFields) {
    const parsed = resolveTaskTimestamp(task, [field]);
    if (parsed) {
      return getDateKey(parsed);
    }
  }
  return null;
};

export const getTaskDurationHours = (task: Task): number => {
  const start = resolveTaskTimestamp(task, ["startAt", "start", "startTime", "start_time"]);
  const end = resolveTaskTimestamp(task, ["endAt", "end", "endTime", "end_time"]);
  if (!start || !end) return 0;
  const diff = end.getTime() - start.getTime();
  if (diff <= 0) return 0;
  return diff / 3_600_000;
};
