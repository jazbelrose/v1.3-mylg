import type { CalendarEvent, CalendarTask } from "../utils";

export type CalendarEntryType = "event" | "task";

/**
 * Represents changes to be applied to a calendar entry after drag/resize operations.
 * 
 * Keyboard shortcuts for calendar interactions:
 * - Drag: Move entries to a new time/date
 * - Ctrl/Cmd + Drag: Copy the entry to a new time/date
 * - Shift + Click: Multi-select entries
 * - Resize handles: Drag top/bottom edges to resize duration
 */
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
