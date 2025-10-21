import { Buffer } from 'node:buffer';
import { format } from 'node:util';

export interface ProjectCalendarMeta {
  projectId: string;
  projectName: string;
  clientName: string;
  timezone?: string;
}

export interface CalendarItem {
  id: string;
  projectId: string;
  type: 'event' | 'task';
  title: string;
  description?: string;
  startsAt?: string; // ISO8601 UTC string
  endsAt?: string; // ISO8601 UTC string
  allDay?: boolean;
  url?: string;
  status?: 'CONFIRMED' | 'CANCELLED';
  lastModified?: string; // ISO8601 string
  hasAlarm?: boolean;
}

export interface BuildCalendarOptions {
  generatedAt?: Date;
}

const PROD_ID = '-//MYLG//Calendar//EN';
const DEFAULT_TIMEZONE = 'America/Los_Angeles';

export function formatDateUtc(date: Date): string {
  const pad = (value: number, size = 2) => value.toString().padStart(size, '0');
  return (
    pad(date.getUTCFullYear(), 4) +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

export function formatDateValue(date: Date): string {
  const pad = (value: number, size = 2) => value.toString().padStart(size, '0');
  return pad(date.getUTCFullYear(), 4) + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate());
}

export function icalEscape(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function foldLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) {
    return line;
  }
  let cursor = 0;
  const parts: string[] = [];
  while (cursor < bytes.length) {
    let end = Math.min(cursor + 75, bytes.length);
    if (end < bytes.length) {
      // Avoid splitting multi-byte UTF-8 code points
      while (end > cursor && (bytes[end] & 0b11000000) === 0b10000000) {
        end -= 1;
      }
      if (end === cursor) {
        end = Math.min(cursor + 75, bytes.length);
      }
    }
    const segment = bytes.slice(cursor, end).toString('utf8');
    if (parts.length === 0) {
      parts.push(segment);
    } else {
      parts.push('\r\n ' + segment);
    }
    cursor = end;
  }
  return parts.join('');
}

export function foldLines(payload: string): string {
  return payload
    .split('\r\n')
    .map((line) => foldLine(line))
    .join('\r\n');
}

function buildDescription(item: CalendarItem): string | undefined {
  const segments: string[] = [];
  if (item.description) {
    segments.push(item.description);
  }
  if (item.url) {
    segments.push(format('Open in MYLG: %s', item.url));
  }
  if (!segments.length) {
    return undefined;
  }
  return segments.join('\n\n');
}

function computeUid(item: CalendarItem): string {
  return `evt_${item.projectId}_${item.type}_${item.id}@mylg`;
}

function formatTimestamp(source?: string, fallback?: Date): string {
  if (source) {
    const date = new Date(source);
    if (!Number.isNaN(date.getTime())) {
      return formatDateUtc(date);
    }
  }
  const date = fallback ?? new Date();
  return formatDateUtc(date);
}

function formatEventDates(item: CalendarItem): string[] {
  if (item.allDay) {
    if (!item.startsAt) {
      return [];
    }
    const startDate = new Date(item.startsAt);
    const lines: string[] = [`DTSTART;VALUE=DATE:${formatDateValue(startDate)}`];
    if (item.endsAt) {
      const endDate = new Date(item.endsAt);
      lines.push(`DTEND;VALUE=DATE:${formatDateValue(endDate)}`);
    }
    return lines;
  }

  if (!item.startsAt) {
    return [];
  }
  const start = new Date(item.startsAt);
  const lines = [`DTSTART:${formatDateUtc(start)}`];
  if (item.endsAt) {
    const end = new Date(item.endsAt);
    lines.push(`DTEND:${formatDateUtc(end)}`);
  }
  return lines;
}

export function buildICalendar(
  project: ProjectCalendarMeta,
  items: CalendarItem[],
  options: BuildCalendarOptions = {}
): string {
  const tz = project.timezone || DEFAULT_TIMEZONE;
  const generatedAt = options.generatedAt ?? new Date();
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    `PRODID:${PROD_ID}`,
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icalEscape(`${project.clientName} – ${project.projectName}`)}`,
    `X-WR-TIMEZONE:${icalEscape(tz)}`,
  ];

  const sorted = [...items].sort((a, b) => {
    const aDate = a.startsAt ? new Date(a.startsAt).getTime() : 0;
    const bDate = b.startsAt ? new Date(b.startsAt).getTime() : 0;
    return aDate - bDate;
  });

  for (const item of sorted) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${icalEscape(computeUid(item))}`);
    lines.push(`DTSTAMP:${formatTimestamp(item.lastModified, generatedAt)}`);

    const dateLines = formatEventDates(item);
    for (const dateLine of dateLines) {
      lines.push(dateLine);
    }

    lines.push(`SUMMARY:${icalEscape(item.title)}`);

    const description = buildDescription(item);
    if (description) {
      lines.push(`DESCRIPTION:${icalEscape(description)}`);
    }

    if (item.url) {
      lines.push(`URL:${icalEscape(item.url)}`);
    }

    if (item.status) {
      lines.push(`STATUS:${icalEscape(item.status)}`);
    }

    if (item.hasAlarm && !item.allDay) {
      lines.push('BEGIN:VALARM');
      lines.push('TRIGGER:-PT30M');
      lines.push('ACTION:DISPLAY');
      lines.push('DESCRIPTION:Reminder');
      lines.push('END:VALARM');
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  const raw = lines.join('\r\n') + '\r\n';
  return foldLines(raw);
}
