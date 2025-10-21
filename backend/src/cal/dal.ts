import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION || 'us-west-2';
const MAX_ITEMS = 5000;

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

const PROJECTS_TABLE = process.env.PROJECTS_TABLE || 'Projects';
const EVENTS_TABLE = process.env.EVENTS_TABLE || 'Events';
const EVENTS_STARTAT_INDEX = process.env.EVENTS_STARTAT_INDEX || '';
const TASKS_TABLE = process.env.TASKS_TABLE || 'Tasks';
const CALENDAR_TOKENS_TABLE = process.env.CALENDAR_TOKENS_TABLE || 'ProjectCalendarTokens';

export interface CalendarTokenRecord {
  tokenHash: string;
  projectId: string;
  userId: string;
  scope?: string;
  revokedAt?: string;
  userStatus?: string;
}

export interface ProjectRecord {
  projectId: string;
  name: string;
  clientName: string;
  colorHex?: string;
  tz?: string;
}

export interface EventRecord {
  eventId: string;
  projectId: string;
  title: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  allDay?: boolean;
  location?: string;
  url?: string;
  updatedAt?: string;
  canceled?: boolean;
}

export interface TaskRecord {
  taskId: string;
  projectId: string;
  title: string;
  dueAt?: string;
  startAt?: string;
  endAt?: string;
  status: 'open' | 'done' | 'cancelled';
  updatedAt?: string;
}

export async function getCalendarTokenByHash(tokenHash: string): Promise<CalendarTokenRecord | null> {
  const response = await dynamo.send(
    new GetCommand({
      TableName: CALENDAR_TOKENS_TABLE,
      Key: { tokenHash },
    })
  );
  return (response.Item as CalendarTokenRecord | undefined) || null;
}

export async function getProject(projectId: string): Promise<ProjectRecord | null> {
  const response = await dynamo.send(
    new GetCommand({
      TableName: PROJECTS_TABLE,
      Key: { projectId },
    })
  );
  return (response.Item as ProjectRecord | undefined) || null;
}

interface QueryWindow {
  sinceIso: string;
  untilIso: string;
}

export async function listProjectEvents(
  projectId: string,
  window: QueryWindow
): Promise<EventRecord[]> {
  const items: EventRecord[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  const queryBase = {
    TableName: EVENTS_TABLE,
    KeyConditionExpression: 'projectId = :p',
    ExpressionAttributeValues: {
      ':p': projectId,
    },
  };

  const usingIndex = Boolean(EVENTS_STARTAT_INDEX);

  if (usingIndex) {
    Object.assign(queryBase, {
      IndexName: EVENTS_STARTAT_INDEX,
      KeyConditionExpression: 'projectId = :p AND startsAt BETWEEN :since AND :until',
      ExpressionAttributeValues: {
        ':p': projectId,
        ':since': window.sinceIso,
        ':until': window.untilIso,
      },
    });
  }

  do {
    const command = new QueryCommand({
      ...queryBase,
      ExclusiveStartKey: lastEvaluatedKey,
      Limit: Math.min(500, MAX_ITEMS - items.length),
      FilterExpression: usingIndex
        ? undefined
        : '#startsAt BETWEEN :since AND :until',
      ExpressionAttributeNames: usingIndex
        ? undefined
        : { '#startsAt': 'startsAt' },
      ExpressionAttributeValues: usingIndex
        ? queryBase.ExpressionAttributeValues
        : {
            ...(queryBase.ExpressionAttributeValues || {}),
            ':since': window.sinceIso,
            ':until': window.untilIso,
          },
    });

    const response = await dynamo.send(command);
    const batch = (response.Items as EventRecord[] | undefined) || [];
    items.push(...batch);
    lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey && items.length < MAX_ITEMS);

  return items;
}

export async function listProjectTasks(
  projectId: string,
  window: QueryWindow
): Promise<TaskRecord[]> {
  const items: TaskRecord[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const response = await dynamo.send(
      new QueryCommand({
        TableName: TASKS_TABLE,
        KeyConditionExpression: 'projectId = :p',
        ExpressionAttributeValues: {
          ':p': projectId,
        },
        ExclusiveStartKey: lastEvaluatedKey,
        Limit: Math.min(500, MAX_ITEMS - items.length),
      })
    );

    const batch = (response.Items as TaskRecord[] | undefined) || [];
    items.push(...batch);
    lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey && items.length < MAX_ITEMS);

  return items.filter((task) => {
    if (task.status === 'done' || task.status === 'cancelled') {
      return false;
    }
    const due = task.dueAt ? Date.parse(task.dueAt) : undefined;
    const start = task.startAt ? Date.parse(task.startAt) : undefined;
    const end = task.endAt ? Date.parse(task.endAt) : undefined;

    const lowerBound = Date.parse(window.sinceIso);
    const upperBound = Date.parse(window.untilIso);

    const relevant = [due, start, end].filter((value) => typeof value === 'number') as number[];
    if (!relevant.length) {
      return true;
    }
    return relevant.some((value) => value >= lowerBound && value <= upperBound);
  });
}
