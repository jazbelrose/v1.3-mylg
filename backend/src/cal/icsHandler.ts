import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { createHash } from 'node:crypto';
import { buildICalendar, CalendarItem, ProjectCalendarMeta } from './ics.js';
import {
  getProject,
  listProjectEvents,
  listProjectTasks,
  type EventRecord,
  type ProjectRecord,
  type TaskRecord,
} from './dal.js';
import { validateCalendarToken } from './token.js';

const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || 'America/Los_Angeles';
const MAX_WINDOW_PAST_DAYS = 90;
const MAX_WINDOW_FUTURE_DAYS = 180;

export interface CanonicalCalendarItem {
  id: string;
  projectId: string;
  type: 'event' | 'task';
  title: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  allDay?: boolean;
  url?: string;
  status: 'CONFIRMED' | 'CANCELLED';
  lastModified?: string;
  hasAlarm?: boolean;
}

export interface CanonicalCalendarModel {
  project: ProjectCalendarMeta;
  items: CanonicalCalendarItem[];
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return value.toLowerCase() === 'true' || value === '1';
}

interface TimeWindow {
  since: Date;
  until: Date;
}

export function resolveTimeWindow(sinceParam?: string | null): TimeWindow {
  const now = new Date();
  const defaultSince = new Date(now.getTime() - MAX_WINDOW_PAST_DAYS * 24 * 60 * 60 * 1000);
  let since = defaultSince;
  if (sinceParam) {
    const parsed = new Date(sinceParam);
    if (!Number.isNaN(parsed.getTime())) {
      since = parsed;
    }
  }
  const until = new Date(now.getTime() + MAX_WINDOW_FUTURE_DAYS * 24 * 60 * 60 * 1000);
  return { since, until };
}

function toIsoString(date: Date): string {
  return date.toISOString();
}

function normalizeEvent(event: EventRecord, projectId: string): CanonicalCalendarItem | null {
  if (event.canceled) {
    return null;
  }
  const url = event.url || `https://app.mylg.studio/projects/${projectId}/events/${event.eventId}`;
  return {
    id: event.eventId,
    projectId,
    type: 'event',
    title: event.title,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: Boolean(event.allDay),
    url,
    status: 'CONFIRMED',
    lastModified: event.updatedAt || event.endsAt || event.startsAt,
    hasAlarm: true,
  };
}

function normalizeTask(task: TaskRecord, projectId: string): CanonicalCalendarItem | null {
  if (task.status === 'done' || task.status === 'cancelled') {
    return null;
  }
  const baseUrl = `https://app.mylg.studio/projects/${projectId}/tasks/${task.taskId}`;
  const title = `🧩 Task: ${task.title}`;
  const startsAt = task.startAt || task.dueAt;
  const endsAt = task.endAt || (task.dueAt ? addDays(task.dueAt, 1) : undefined);
  const allDay = Boolean(task.dueAt && !task.startAt && !task.endAt);
  return {
    id: task.taskId,
    projectId,
    type: 'task',
    title,
    description: undefined,
    startsAt: startsAt || undefined,
    endsAt: endsAt || undefined,
    allDay,
    url: baseUrl,
    status: 'CONFIRMED',
    lastModified: task.updatedAt || task.dueAt || task.startAt || task.endAt,
    hasAlarm: !allDay,
  };
}

function addDays(isoDate: string, days: number): string {
  const base = new Date(isoDate);
  if (Number.isNaN(base.getTime())) {
    return isoDate;
  }
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().split('T')[0];
}

export function buildCanonicalModel(
  project: ProjectRecord,
  events: EventRecord[],
  tasks: TaskRecord[],
  includeTasks: boolean
): CanonicalCalendarModel {
  const projectMeta: ProjectCalendarMeta = {
    projectId: project.projectId,
    projectName: project.name,
    clientName: project.clientName,
    timezone: project.tz || DEFAULT_TIMEZONE,
  };

  const items: CanonicalCalendarItem[] = [];
  for (const event of events) {
    const normalized = normalizeEvent(event, project.projectId);
    if (normalized) {
      items.push(normalized);
    }
  }

  if (includeTasks) {
    for (const task of tasks) {
      const normalized = normalizeTask(task, project.projectId);
      if (normalized) {
        items.push(normalized);
      }
    }
  }

  return { project: projectMeta, items };
}

export function computeEtag(model: CanonicalCalendarModel): string {
  const canonical = JSON.stringify(model);
  return createHash('sha1').update(canonical).digest('hex');
}

function shouldReturnNotModified(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) {
    return false;
  }
  const normalized = ifNoneMatch.trim();
  return normalized.replace(/^W\//, '').replace(/^"|"$/g, '') === etag;
}

export function toCalendarItems(items: CanonicalCalendarItem[]): CalendarItem[] {
  return items.map((item) => ({
    id: item.id,
    projectId: item.projectId,
    type: item.type,
    title: item.title,
    description: item.description,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    allDay: item.allDay,
    url: item.url,
    status: item.status,
    lastModified: item.lastModified,
    hasAlarm: item.hasAlarm,
  }));
}

function buildHttpResponse(
  statusCode: number,
  body?: string,
  headers?: Record<string, string>
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'max-age=300, must-revalidate',
      ...(headers || {}),
    },
    body,
    isBase64Encoded: false,
  };
}

function notFound(): APIGatewayProxyResultV2 {
  return {
    statusCode: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'max-age=60',
    },
    body: 'Not Found',
  };
}

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const projectId = event.pathParameters?.projectId;
  const token = event.pathParameters?.token;

  if (!projectId || !token) {
    return notFound();
  }

  const tokenPayload = await validateCalendarToken(projectId, token);
  if (!tokenPayload) {
    return notFound();
  }

  const includeTasks = parseBoolean(event.queryStringParameters?.includeTasks);
  const { since, until } = resolveTimeWindow(event.queryStringParameters?.since);

  const window = { sinceIso: toIsoString(since), untilIso: toIsoString(until) };

  const [project, events, tasks] = await Promise.all([
    getProject(projectId),
    listProjectEvents(projectId, window),
    includeTasks ? listProjectTasks(projectId, window) : Promise.resolve([] as TaskRecord[]),
  ]);

  if (!project) {
    return notFound();
  }

  const canonicalModel = buildCanonicalModel(project, events, tasks, includeTasks);
  const etag = computeEtag(canonicalModel);

  if (shouldReturnNotModified(event.headers?.['if-none-match'], etag)) {
    return buildHttpResponse(304, undefined, { ETag: `"${etag}"` });
  }

  const generatedAt = deriveGeneratedAt(canonicalModel.items);
  const icsBody = buildICalendar(canonicalModel.project, toCalendarItems(canonicalModel.items), {
    generatedAt,
  });

  const headers: Record<string, string> = {
    ETag: `"${etag}"`,
  };

  if (canonicalModel.items.length) {
    headers['Last-Modified'] = generatedAt.toUTCString();
  }

  return buildHttpResponse(200, icsBody, headers);
};

function deriveGeneratedAt(items: CanonicalCalendarItem[]): Date {
  let latest = 0;
  for (const item of items) {
    const timestamp = item.lastModified || item.endsAt || item.startsAt;
    if (timestamp) {
      const value = Date.parse(timestamp);
      if (!Number.isNaN(value) && value > latest) {
        latest = value;
      }
    }
  }
  if (latest > 0) {
    return new Date(latest);
  }
  return new Date();
}

export { shouldReturnNotModified };
