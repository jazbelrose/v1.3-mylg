// backend/projects/router.test.mjs
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  patchTask,
  reviewTransition,
  archiveTask,
  unarchiveTask
} from './router.mjs';

// Mock dependencies
vi.mock('/opt/nodejs/utils/cors.mjs', () => ({
  corsHeadersFromEvent: vi.fn(() => ({})),
  preflightFromEvent: vi.fn(() => ({ statusCode: 200 })),
  json: vi.fn((status, cors, body) => ({ statusCode: status, ...cors, body })),
}));

vi.mock('./tasksDal.mjs', () => ({
  buildStatusSortKey: vi.fn(),
  normalizeStatus: vi.fn((status) => status),
  updateTaskStatus: vi.fn(),
  setArchive: vi.fn(),
  requestReview: vi.fn(),
  approveTask: vi.fn(),
  requestChanges: vi.fn(),
  updateTaskFields: vi.fn(),
  getTaskById: vi.fn(),
}));

import {
  updateTaskStatus,
  updateTaskFields,
  setArchive,
  getTaskById
} from './tasksDal.mjs';

const dalGetTaskById = getTaskById;
const dalUpdateTaskStatus = updateTaskStatus;
const dalUpdateTaskFields = updateTaskFields;
const dalSetArchive = setArchive;

describe('patchTask', () => {
  const mockUserId = 'user123';
  const mockProjectId = 'project123';
  const mockTaskId = 'task123';

  const mockEvent = {
    body: JSON.stringify({ status: 'in_progress' }),
    requestContext: {
      http: { method: 'PATCH' },
      authorizer: {
        jwt: {
          claims: {
            'custom:userId': mockUserId,
            'cognito:groups': ['admin'],
          },
        },
      },
    },
  };

  const mockCors = {};
  const mockParams = { projectId: mockProjectId, taskId: mockTaskId };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Status transition restrictions', () => {
    it('should block transition to in_review via PATCH', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ status: 'in_review' }),
      };

      const mockTask = {
        status: 'todo',
        assigneeIds: [mockUserId],
        createdById: mockUserId,
      };

      dalGetTaskById.mockResolvedValue(mockTask);

      const result = await patchTask(event, mockCors, mockParams);

      expect(result.statusCode).toBe(400);
      expect(result.body.error).toBe('Status transition requires a dedicated endpoint');
    });

    it('should block transition to needs_changes via PATCH', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ status: 'needs_changes' }),
      };

      const mockTask = {
        status: 'in_review',
        assigneeIds: [mockUserId],
        createdById: mockUserId,
      };

      dalGetTaskById.mockResolvedValue(mockTask);

      const result = await patchTask(event, mockCors, mockParams);

      expect(result.statusCode).toBe(400);
      expect(result.body.error).toBe('Status transition requires a dedicated endpoint');
    });

    it('should block transition to done via PATCH', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ status: 'done' }),
      };

      const mockTask = {
        status: 'in_review',
        assigneeIds: [mockUserId],
        createdById: mockUserId,
      };

      dalGetTaskById.mockResolvedValue(mockTask);

      const result = await patchTask(event, mockCors, mockParams);

      expect(result.statusCode).toBe(400);
      expect(result.body.error).toBe('Status transition requires a dedicated endpoint');
    });

    it('should block transition to archived via PATCH', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ status: 'archived' }),
      };

      const mockTask = {
        status: 'done',
        assigneeIds: [mockUserId],
        createdById: mockUserId,
      };

      dalGetTaskById.mockResolvedValue(mockTask);

      const result = await patchTask(event, mockCors, mockParams);

      expect(result.statusCode).toBe(400);
      expect(result.body.error).toBe('Status transition requires a dedicated endpoint');
    });

    it('should allow transition to in_progress from todo', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ status: 'in_progress' }),
      };

      const mockTask = {
        status: 'todo',
        assigneeIds: [mockUserId],
        createdById: mockUserId,
      };

      const mockUpdatedTask = { ...mockTask, status: 'in_progress' };

      dalGetTaskById.mockResolvedValue(mockTask);
      dalUpdateTaskStatus.mockResolvedValue(mockUpdatedTask);

      const result = await patchTask(event, mockCors, mockParams);

      expect(result.statusCode).toBe(200);
      expect(dalUpdateTaskStatus).toHaveBeenCalledWith({
        ddb: expect.any(Object),
        tableName: 'Tasks',
        projectId: mockProjectId,
        taskId: mockTaskId,
        nextStatus: 'in_progress',
        actorId: mockUserId,
        now: expect.any(String),
        options: expect.any(Object),
      });
    });

    it('should allow transition to in_progress from needs_changes', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ status: 'in_progress' }),
      };

      const mockTask = {
        status: 'needs_changes',
        assigneeIds: [mockUserId],
        createdById: mockUserId,
      };

      const mockUpdatedTask = { ...mockTask, status: 'in_progress' };

      dalGetTaskById.mockResolvedValue(mockTask);
      dalUpdateTaskStatus.mockResolvedValue(mockUpdatedTask);

      const result = await patchTask(event, mockCors, mockParams);

      expect(result.statusCode).toBe(200);
      expect(dalUpdateTaskStatus).toHaveBeenCalled();
    });

    it('should allow transition to in_progress from in_progress (no-op)', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ status: 'in_progress' }),
      };

      const mockTask = {
        status: 'in_progress',
        assigneeIds: [mockUserId],
        createdById: mockUserId,
      };

      const mockUpdatedTask = { ...mockTask, status: 'in_progress' };

      dalGetTaskById.mockResolvedValue(mockTask);
      dalUpdateTaskStatus.mockResolvedValue(mockUpdatedTask);

      const result = await patchTask(event, mockCors, mockParams);

      expect(result.statusCode).toBe(200);
      expect(dalUpdateTaskStatus).toHaveBeenCalled();
    });

    it('should reject unsupported status transitions', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ status: 'done' }),
      };

      const mockTask = {
        status: 'todo',
        assigneeIds: [mockUserId],
        createdById: mockUserId,
      };

      dalGetTaskById.mockResolvedValue(mockTask);

      const result = await patchTask(event, mockCors, mockParams);

      expect(result.statusCode).toBe(400);
      expect(result.body.error).toBe('Status transition requires a dedicated endpoint');
    });

    it('should reject invalid transitions from current state', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ status: 'in_progress' }),
      };

      const mockTask = {
        status: 'done', // Cannot go from done to in_progress
        assigneeIds: [mockUserId],
        createdById: mockUserId,
      };

      dalGetTaskById.mockResolvedValue(mockTask);

      const result = await patchTask(event, mockCors, mockParams);

      expect(result.statusCode).toBe(400);
      expect(result.body.error).toBe('Invalid status transition');
    });
  });

  describe('Authorization', () => {
    it('should allow admin to update status', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ status: 'in_progress' }),
        requestContext: {
          ...mockEvent.requestContext,
          authorizer: {
            jwt: {
              claims: {
                'custom:userId': mockUserId,
                'cognito:groups': ['admin'],
              },
            },
          },
        },
      };

      const mockTask = {
        status: 'todo',
        assigneeIds: ['otherUser'],
        createdById: 'otherUser',
      };

      dalGetTaskById.mockResolvedValue(mockTask);
      dalUpdateTaskStatus.mockResolvedValue({ ...mockTask, status: 'in_progress' });

      const result = await patchTask(event, mockCors, mockParams);

      expect(result.statusCode).toBe(200);
    });

    it('should allow assignee to update status', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ status: 'in_progress' }),
        requestContext: {
          ...mockEvent.requestContext,
          authorizer: {
            jwt: {
              claims: {
                'custom:userId': mockUserId,
                'cognito:groups': [],
              },
            },
          },
        },
      };

      const mockTask = {
        status: 'todo',
        assigneeIds: [mockUserId],
        createdById: 'otherUser',
      };

      dalGetTaskById.mockResolvedValue(mockTask);
      dalUpdateTaskStatus.mockResolvedValue({ ...mockTask, status: 'in_progress' });

      const result = await patchTask(event, mockCors, mockParams);

      expect(result.statusCode).toBe(200);
    });

    it('should allow task creator to update status', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ status: 'in_progress' }),
        requestContext: {
          ...mockEvent.requestContext,
          authorizer: {
            jwt: {
              claims: {
                'custom:userId': mockUserId,
                'cognito:groups': [],
              },
            },
          },
        },
      };

      const mockTask = {
        status: 'todo',
        assigneeIds: ['otherUser'],
        createdById: mockUserId,
      };

      dalGetTaskById.mockResolvedValue(mockTask);
      dalUpdateTaskStatus.mockResolvedValue({ ...mockTask, status: 'in_progress' });

      const result = await patchTask(event, mockCors, mockParams);

      expect(result.statusCode).toBe(200);
    });

    it('should reject unauthorized user', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ status: 'in_progress' }),
        requestContext: {
          ...mockEvent.requestContext,
          authorizer: {
            jwt: {
              claims: {
                'custom:userId': 'unauthorizedUser',
                'cognito:groups': [],
              },
            },
          },
        },
      };

      const mockTask = {
        status: 'todo',
        assigneeIds: ['otherUser'],
        createdById: 'otherUser',
      };

      dalGetTaskById.mockResolvedValue(mockTask);

      const result = await patchTask(event, mockCors, mockParams);

      expect(result.statusCode).toBe(403);
      expect(result.body.error).toBe('Not authorized to update task status');
    });
  });

  describe('Field updates', () => {
    it('should allow updating non-status fields', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ title: 'Updated Title', description: 'Updated Description' }),
      };

      const mockTask = {
        status: 'todo',
        title: 'Original Title',
        description: 'Original Description',
      };

      const mockUpdatedTask = {
        ...mockTask,
        title: 'Updated Title',
        description: 'Updated Description',
      };

      dalUpdateTaskFields.mockResolvedValue(mockUpdatedTask);

      const result = await patchTask(event, mockCors, mockParams);

      expect(result.statusCode).toBe(200);
      expect(dalUpdateTaskFields).toHaveBeenCalledWith({
        ddb: expect.any(Object),
        tableName: 'Tasks',
        projectId: mockProjectId,
        taskId: mockTaskId,
        fields: { title: 'Updated Title', description: 'Updated Description' },
        now: expect.any(String),
      });
    });
  });
});

describe('Review Transition Endpoint', () => {
  const mockUserId = 'user123';
  const mockProjectId = 'project123';
  const mockTaskId = 'task123';

  const baseEvent = {
    body: JSON.stringify({}),
    requestContext: {
      http: { method: 'POST' },
      authorizer: {
        jwt: {
          claims: {
            'custom:userId': mockUserId,
            'cognito:groups': [],
          },
        },
      },
    },
  };

  const adminEvent = {
    ...baseEvent,
    requestContext: {
      ...baseEvent.requestContext,
      authorizer: {
        jwt: {
          claims: {
            'custom:userId': mockUserId,
            'cognito:groups': ['admin'],
          },
        },
      },
    },
  };

  const mockCors = {};
  const mockParams = { projectId: mockProjectId, taskId: mockTaskId };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits for review for assignee/creator/admin', async () => {
    const mockTask = {
      status: 'in_progress',
      assigneeIds: [mockUserId],
      createdById: 'otherUser',
      reviewerId: mockUserId,
      thread: [],
    };

    getTaskById.mockResolvedValue(mockTask);
    updateTaskStatus.mockResolvedValue({ ...mockTask, status: 'in_review' });

    const event = { ...baseEvent, body: JSON.stringify({ action: 'submit_for_review' }) };
    const result = await reviewTransition(event, mockCors, mockParams);

    expect(result.statusCode).toBe(200);
    expect(updateTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'Tasks',
        projectId: mockProjectId,
        taskId: mockTaskId,
        nextStatus: 'in_review',
        options: expect.objectContaining({
          additionalUpdates: expect.objectContaining({
            reviewState: 'in_review',
            currentSubmissionId: expect.any(String),
            thread: expect.any(Array),
          }),
        }),
      }),
    );
  });

  it('rejects non-admin request_changes', async () => {
    const mockTask = { status: 'in_review' };
    getTaskById.mockResolvedValue(mockTask);

    const event = { ...baseEvent, body: JSON.stringify({ action: 'request_changes', note: 'Fix this' }) };
    const result = await reviewTransition(event, mockCors, mockParams);

    expect(result.statusCode).toBe(403);
    expect(updateTaskStatus).not.toHaveBeenCalled();
    expect(updateTaskFields).not.toHaveBeenCalled();
  });

  it('approves a task (admin only)', async () => {
    const mockTask = { status: 'in_review', thread: [] };
    getTaskById.mockResolvedValue(mockTask);
    updateTaskFields.mockResolvedValue({ ...mockTask, reviewState: 'approved' });

    const event = { ...adminEvent, body: JSON.stringify({ action: 'approve' }) };
    const result = await reviewTransition(event, mockCors, mockParams);

    expect(result.statusCode).toBe(200);
    expect(updateTaskFields).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'Tasks',
        projectId: mockProjectId,
        taskId: mockTaskId,
        fields: expect.objectContaining({
          reviewState: 'approved',
          currentSubmissionId: expect.any(String),
          thread: expect.any(Array),
        }),
      }),
    );
  });

  it('marks a task done (admin only)', async () => {
    const mockTask = { status: 'in_progress', thread: [] };
    getTaskById.mockResolvedValue(mockTask);
    updateTaskStatus.mockResolvedValue({ ...mockTask, status: 'done' });

    const event = { ...adminEvent, body: JSON.stringify({ action: 'mark_done' }) };
    const result = await reviewTransition(event, mockCors, mockParams);

    expect(result.statusCode).toBe(200);
    expect(updateTaskStatus).toHaveBeenCalledTimes(2);
    expect(updateTaskStatus).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tableName: 'Tasks',
        projectId: mockProjectId,
        taskId: mockTaskId,
        nextStatus: 'in_review',
      }),
    );
    expect(updateTaskStatus).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tableName: 'Tasks',
        projectId: mockProjectId,
        taskId: mockTaskId,
        nextStatus: 'done',
      }),
    );
  });

  describe('archiveTask', () => {
    it('should allow archiving a done task', async () => {
      const mockTask = {
        status: 'done',
      };

      const mockUpdatedTask = { ...mockTask, status: 'archived' };

      dalGetTaskById.mockResolvedValue(mockTask);
      dalSetArchive.mockResolvedValue(mockUpdatedTask);

      const result = await archiveTask(adminEvent, mockCors, mockParams);

      expect(result.statusCode).toBe(200);
      expect(dalSetArchive).toHaveBeenCalledWith({
        ddb: expect.any(Object),
        tableName: 'Tasks',
        projectId: mockProjectId,
        taskId: mockTaskId,
        archived: true,
        actorId: mockUserId,
        now: expect.any(String),
      });
    });
  });

  describe('unarchiveTask', () => {
    it('should allow unarchiving an archived task', async () => {
      const mockTask = {
        status: 'archived',
      };

      const mockUpdatedTask = { ...mockTask, status: 'done' };

      dalGetTaskById.mockResolvedValue(mockTask);
      dalSetArchive.mockResolvedValue(mockUpdatedTask);

      const result = await unarchiveTask(adminEvent, mockCors, mockParams);

      expect(result.statusCode).toBe(200);
      expect(dalSetArchive).toHaveBeenCalledWith({
        ddb: expect.any(Object),
        tableName: 'Tasks',
        projectId: mockProjectId,
        taskId: mockTaskId,
        archived: false,
        actorId: mockUserId,
        now: expect.any(String),
      });
    });
  });
});
