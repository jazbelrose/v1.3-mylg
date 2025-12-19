import type { CalendarEvent, CalendarTask } from "../utils";

export type CalendarEntryType = "event" | "task";

export type CalendarEntryChanges = {
  type: CalendarEntryType;
  entry: CalendarEvent | CalendarTask;
  date: string; // YYYY-MM-DD
  start?: string; // HH:MM
  end?: string; // HH:MM
  duplicate?: boolean;
};

export const formatTimeFromMinutes = (minutes: number) => {
  const normalized = Math.max(0, Math.min(minutes, 24 * 60));
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  const paddedHours = `${hours}`.padStart(2, "0");
  const paddedMinutes = `${mins}`.padStart(2, "0");
  return `${paddedHours}:${paddedMinutes}`;
};

export const buildIsoDateTime = (date: string, time?: string) =>
  time ? `${date}T${time}:00` : null;
