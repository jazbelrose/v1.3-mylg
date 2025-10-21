import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildICalendar, CalendarItem } from '../../src/cal/ics.js';
import {
  buildCanonicalModel,
  computeEtag,
  shouldReturnNotModified,
  toCalendarItems,
} from '../../src/cal/icsHandler.js';
import type { EventRecord, ProjectRecord, TaskRecord } from '../../src/cal/dal.js';

const sampleProject: ProjectRecord = {
  projectId: 'prj_MOHG',
  name: 'Lobby Install',
  clientName: 'MOHG',
  tz: 'America/Los_Angeles',
};

const sampleEvent: EventRecord = {
  eventId: 'evt_123',
  projectId: 'prj_MOHG',
  title: 'Design review – Sprint 14',
  description: undefined,
  startsAt: '2025-10-22T17:00:00Z',
  endsAt: '2025-10-22T18:00:00Z',
  updatedAt: '2025-10-21T21:00:00Z',
  allDay: false,
  location: undefined,
  url: 'https://app.mylg.studio/projects/prj_MOHG/events/evt_123',
  canceled: false,
};

const sampleTask: TaskRecord = {
  taskId: 'task_777',
  projectId: 'prj_MOHG',
  title: 'Approve finish samples',
  dueAt: '2025-10-25',
  status: 'open',
  updatedAt: '2025-10-20T18:00:00Z',
};

test('buildICalendar produces VCALENDAR envelope with CRLF endings', () => {
  const model = buildCanonicalModel(sampleProject, [sampleEvent], [sampleTask], true);
  const generatedAt = new Date('2025-10-21T21:00:00Z');
  const ics = buildICalendar(model.project, toCalendarItems(model.items), {
    generatedAt,
  });

  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('\r\n'));
  const withoutCrLf = ics.replace(/\r\n/g, '');
  assert.ok(!withoutCrLf.includes('\n'));
  assert.match(ics, /X-WR-CALNAME:MOHG – Lobby Install/);
});

test('timestamps are emitted in UTC', () => {
  const model = buildCanonicalModel(sampleProject, [sampleEvent], [], false);
  const ics = buildICalendar(model.project, toCalendarItems(model.items), {
    generatedAt: new Date('2025-10-21T21:00:00Z'),
  });

  assert.match(ics, /DTSTART:20251022T170000Z/);
  assert.match(ics, /DTEND:20251022T180000Z/);
});

test('all-day tasks render with VALUE=DATE', () => {
  const model = buildCanonicalModel(sampleProject, [], [sampleTask], true);
  const ics = buildICalendar(model.project, toCalendarItems(model.items), {
    generatedAt: new Date('2025-10-21T21:00:00Z'),
  });

  assert.match(ics, /DTSTART;VALUE=DATE:20251025/);
});

test('special characters are escaped in SUMMARY and DESCRIPTION', () => {
  const customItem: CalendarItem = {
    id: 'evt_escape',
    projectId: 'prj_MOHG',
    type: 'event',
    title: 'Plan, Review; Discuss \\ Next',
    description: 'Line one\nLine two',
    startsAt: '2025-10-22T17:00:00Z',
    endsAt: '2025-10-22T18:00:00Z',
    url: 'https://app.mylg.studio/projects/prj_MOHG/events/evt_escape',
    status: 'CONFIRMED',
    hasAlarm: true,
  };

  const ics = buildICalendar(sampleProject, [customItem], {
    generatedAt: new Date('2025-10-21T21:00:00Z'),
  });

  assert.match(ics, /SUMMARY:Plan\\, Review\\; Discuss \\ Next/);
  assert.match(ics, /DESCRIPTION:Line one\\nLine two/);
});

test('deterministic UID and ETag for identical input', () => {
  const modelA = buildCanonicalModel(sampleProject, [sampleEvent], [sampleTask], true);
  const modelB = buildCanonicalModel(sampleProject, [sampleEvent], [sampleTask], true);
  const etagA = computeEtag(modelA);
  const etagB = computeEtag(modelB);

  assert.equal(etagA, etagB);

  const ics = buildICalendar(modelA.project, toCalendarItems(modelA.items), {
    generatedAt: new Date('2025-10-21T21:00:00Z'),
  });

  assert.match(ics, /UID:evt_prj_MOHG_event_evt_123@mylg/);
});

test('returns 304 when If-None-Match matches etag', () => {
  const etag = 'abc123';
  assert.equal(shouldReturnNotModified('"abc123"', etag), true);
  assert.equal(shouldReturnNotModified('W/"abc123"', etag), true);
  assert.equal(shouldReturnNotModified('"different"', etag), false);
});

test('cancelled events are skipped', () => {
  const cancelled: EventRecord = { ...sampleEvent, eventId: 'evt_cancelled', canceled: true };
  const model = buildCanonicalModel(sampleProject, [cancelled], [], false);
  assert.equal(model.items.length, 0);
});
