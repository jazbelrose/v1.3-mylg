import crypto from 'node:crypto';
import type { CalendarTokenRecord } from './dal.js';
import { getCalendarTokenByHash } from './dal.js';

export interface CalendarTokenPayload {
  tokenHash: string;
  userId: string;
  projectId: string;
  scope: string;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function redactToken(token: string): string {
  if (token.length <= 6) {
    return token;
  }
  return `${token.slice(0, 4)}…${token.slice(-2)}`;
}

export async function validateCalendarToken(
  projectId: string,
  token: string
): Promise<CalendarTokenPayload | null> {
  if (!token) {
    return null;
  }
  const tokenHash = hashToken(token);
  let record: CalendarTokenRecord | null = null;
  try {
    record = await getCalendarTokenByHash(tokenHash);
  } catch (err) {
    console.error('Failed to load calendar token', {
      projectId,
      tokenHash,
      error: err instanceof Error ? err.message : err,
    });
    return null;
  }

  if (!record) {
    return null;
  }

  if (record.revokedAt) {
    console.warn('Calendar token revoked', {
      projectId,
      tokenHash,
    });
    return null;
  }

  if (record.projectId !== projectId) {
    console.warn('Calendar token project mismatch', {
      expected: projectId,
      actual: record.projectId,
      tokenHash,
    });
    return null;
  }

  if (record.scope && record.scope !== 'read:calendar') {
    console.warn('Calendar token lacks calendar scope', {
      projectId,
      tokenHash,
      scope: record.scope,
    });
    return null;
  }

  if (record.userStatus && record.userStatus !== 'active') {
    console.warn('Calendar token user not active', {
      projectId,
      tokenHash,
      status: record.userStatus,
    });
    return null;
  }

  return {
    tokenHash,
    userId: record.userId,
    projectId: record.projectId,
    scope: 'read:calendar',
  };
}

export function buildTokenRecordKey(token: string): { tokenHash: string } {
  return { tokenHash: hashToken(token) };
}
