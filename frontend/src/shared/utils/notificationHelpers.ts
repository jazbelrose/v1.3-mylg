/**
 * Notification Helpers - Create notifications from the frontend
 * 
 * Use these helpers to create notifications for semantic, intentional actions.
 * Regular edits should NOT use these - they go to Activity automatically.
 */

import type { WebSocket } from 'ws';

// ============================================================================
// TYPES
// ============================================================================

export type NotificationType =
  | 'mention'
  | 'share'
  | 'review_request'
  | 'review_complete'
  | 'publish'
  | 'comment_resolved'
  | 'comment_reopened'
  | 'failure'
  | 'slide_to_task'
  | 'project_invite'
  | 'task_assigned'
  | 'message';

export interface CreateNotificationParams {
  type: NotificationType;
  recipientId: string;
  title: string;
  body?: string;
  projectId: string;
  projectName?: string;
  slideId?: string;
  deckId?: string;
  versionId?: string;
  commentId?: string;
  taskId?: string;
  senderName?: string;
  senderAvatar?: string;
  actionUrl?: string;
  meta?: Record<string, unknown>;
}

// ============================================================================
// NOTIFICATION TRIGGERS (must match backend)
// ============================================================================

const NOTIFICATION_TRIGGERS = new Set<NotificationType>([
  'mention',
  'share',
  'review_request',
  'review_complete',
  'publish',
  'comment_resolved',
  'comment_reopened',
  'failure',
  'slide_to_task',
  'project_invite',
  'task_assigned',
  'message',
]);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if an event type should trigger a notification
 */
export function isNotifiable(type: string): type is NotificationType {
  return NOTIFICATION_TRIGGERS.has(type as NotificationType);
}

/**
 * Create a notification via WebSocket
 */
export function createNotification(
  ws: WebSocket | null,
  params: CreateNotificationParams
): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('[createNotification] WebSocket not ready');
    return false;
  }

  if (!isNotifiable(params.type)) {
    console.warn(`[createNotification] Event type '${params.type}' is not notifiable`);
    return false;
  }

  try {
    ws.send(JSON.stringify({
      action: 'createNotification',
      ...params,
    }));
    return true;
  } catch (err) {
    console.error('[createNotification] Failed to send:', err);
    return false;
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Notify user when they are @mentioned
 */
export function notifyMention(
  ws: WebSocket | null,
  params: {
    recipientId: string;
    senderName: string;
    projectId: string;
    projectName: string;
    slideId?: string;
    commentId?: string;
    excerpt?: string;
  }
): boolean {
  return createNotification(ws, {
    type: 'mention',
    recipientId: params.recipientId,
    title: `${params.senderName} mentioned you in ${params.projectName}`,
    body: params.excerpt,
    projectId: params.projectId,
    projectName: params.projectName,
    slideId: params.slideId,
    commentId: params.commentId,
    senderName: params.senderName,
    actionUrl: params.slideId
      ? `/project/${params.projectId}/slides?slide=${params.slideId}${params.commentId ? `&comment=${params.commentId}` : ''}`
      : `/project/${params.projectId}`,
  });
}

/**
 * Notify user when a deck is shared with them
 */
export function notifyShare(
  ws: WebSocket | null,
  params: {
    recipientId: string;
    senderName: string;
    projectId: string;
    projectName: string;
    deckId?: string;
    permission?: 'view' | 'edit' | 'admin';
  }
): boolean {
  return createNotification(ws, {
    type: 'share',
    recipientId: params.recipientId,
    title: `${params.senderName} shared ${params.projectName} with you`,
    body: params.permission ? `You can now ${params.permission} this deck` : undefined,
    projectId: params.projectId,
    projectName: params.projectName,
    deckId: params.deckId,
    senderName: params.senderName,
    actionUrl: `/project/${params.projectId}/slides`,
    meta: { permission: params.permission },
  });
}

/**
 * Notify user when review is requested
 */
export function notifyReviewRequest(
  ws: WebSocket | null,
  params: {
    recipientId: string;
    senderName: string;
    projectId: string;
    projectName: string;
    deckId: string;
    versionId?: string;
  }
): boolean {
  return createNotification(ws, {
    type: 'review_request',
    recipientId: params.recipientId,
    title: `${params.senderName} requested your review on ${params.projectName}`,
    body: params.versionId ? `Version ${params.versionId} is ready for review` : undefined,
    projectId: params.projectId,
    projectName: params.projectName,
    deckId: params.deckId,
    versionId: params.versionId,
    senderName: params.senderName,
    actionUrl: `/project/${params.projectId}/slides${params.versionId ? `?version=${params.versionId}&review=true` : ''}`,
  });
}

/**
 * Notify user when a deck is published
 */
export function notifyPublish(
  ws: WebSocket | null,
  params: {
    recipientId: string;
    senderName: string;
    projectId: string;
    projectName: string;
    deckId: string;
    versionId: string;
  }
): boolean {
  return createNotification(ws, {
    type: 'publish',
    recipientId: params.recipientId,
    title: `${params.projectName} v${params.versionId} published`,
    body: `${params.senderName} published this version to the client`,
    projectId: params.projectId,
    projectName: params.projectName,
    deckId: params.deckId,
    versionId: params.versionId,
    senderName: params.senderName,
    actionUrl: `/project/${params.projectId}/slides?version=${params.versionId}`,
  });
}

/**
 * Notify user of a failure (export, publish, sync)
 */
export function notifyFailure(
  ws: WebSocket | null,
  params: {
    recipientId: string;
    projectId: string;
    projectName: string;
    failureType: 'export' | 'publish' | 'sync' | 'conflict';
    message: string;
    deckId?: string;
  }
): boolean {
  const failureTitles: Record<string, string> = {
    export: `Export failed: ${params.projectName}`,
    publish: `Publish failed: ${params.projectName}`,
    sync: `Sync failed: ${params.projectName}`,
    conflict: `Conflict detected: ${params.projectName}`,
  };

  return createNotification(ws, {
    type: 'failure',
    recipientId: params.recipientId,
    title: failureTitles[params.failureType] || `Error: ${params.projectName}`,
    body: params.message,
    projectId: params.projectId,
    projectName: params.projectName,
    deckId: params.deckId,
    senderName: 'System',
    actionUrl: `/project/${params.projectId}/slides`,
    meta: { failureType: params.failureType },
  });
}

/**
 * Notify user when a comment is resolved/reopened
 */
export function notifyCommentStatus(
  ws: WebSocket | null,
  params: {
    recipientId: string;
    senderName: string;
    projectId: string;
    projectName: string;
    slideId: string;
    commentId: string;
    action: 'resolved' | 'reopened';
  }
): boolean {
  return createNotification(ws, {
    type: params.action === 'resolved' ? 'comment_resolved' : 'comment_reopened',
    recipientId: params.recipientId,
    title: `${params.senderName} ${params.action} a comment in ${params.projectName}`,
    projectId: params.projectId,
    projectName: params.projectName,
    slideId: params.slideId,
    commentId: params.commentId,
    senderName: params.senderName,
    actionUrl: `/project/${params.projectId}/slides?slide=${params.slideId}&comment=${params.commentId}`,
  });
}

/**
 * Notify user when a task is assigned to them
 */
export function notifyTaskAssigned(
  ws: WebSocket | null,
  params: {
    recipientId: string;
    senderName: string;
    projectId: string;
    projectName: string;
    taskId: string;
    taskTitle: string;
  }
): boolean {
  return createNotification(ws, {
    type: 'task_assigned',
    recipientId: params.recipientId,
    title: `${params.senderName} assigned you a task in ${params.projectName}`,
    body: params.taskTitle,
    projectId: params.projectId,
    projectName: params.projectName,
    taskId: params.taskId,
    senderName: params.senderName,
    actionUrl: `/project/${params.projectId}/tasks?task=${params.taskId}`,
  });
}
