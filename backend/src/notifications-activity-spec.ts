/**
 * MYLG Notifications & Activity System - Implementation Spec
 * 
 * This file contains the exact types, constants, and helper functions
 * for implementing the two-stream notification/activity system.
 * 
 * Hand this to the notifications Lambda for implementation.
 */

// ============================================================================
// SECTION 1: EVENT CLASSIFICATION
// ============================================================================

/**
 * Events that MUST create a notification (rare, interruptive)
 */
export const NOTIFICATION_TRIGGERS = {
  // Slides
  MENTION: 'mention',                     // @mentioned in comment/note
  SHARE: 'share',                         // Deck shared / permissions changed
  REVIEW_REQUEST: 'review_request',       // Explicit "Request Review" action
  REVIEW_COMPLETE: 'review_complete',     // Review submitted
  PUBLISH: 'publish',                     // Deck published / sent to client
  COMMENT_RESOLVED: 'comment_resolved',   // Comment resolved
  COMMENT_REOPENED: 'comment_reopened',   // Comment reopened
  FAILURE: 'failure',                     // Export/publish/sync failure
  SLIDE_TO_TASK: 'slide_to_task',         // Slide converted to task
  
  // Cross-feature
  PROJECT_INVITE: 'project_invite',       // Invited to project
  TASK_ASSIGNED: 'task_assigned',         // Task assigned to user
  MESSAGE: 'message',                     // Direct message received
} as const;

export type NotificationType = typeof NOTIFICATION_TRIGGERS[keyof typeof NOTIFICATION_TRIGGERS];

/**
 * Events that MUST NOT create a notification (activity only)
 */
export const ACTIVITY_ONLY_EVENTS = new Set([
  'autosave',
  'autosave_tick',
  'yjs_sync',
  'yjs_update',
  'presence_join',
  'presence_leave',
  'cursor_move',
  'cursor_update',
  'selection_change',
  'editor_open',
  'editor_close',
  'heartbeat',
  'idle_timeout',
  'background_sync',
  'connection_reconnect',
  'slide_edit',           // Goes to activity, not notifications
  'slide_typing',
  'slide_drag',
  'slide_nudge',
]);

/**
 * Check if an event should create a notification
 */
export function isNotifiable(eventType: string): boolean {
  return Object.values(NOTIFICATION_TRIGGERS).includes(eventType as NotificationType);
}

/**
 * Check if an event should be completely ignored (not even activity)
 */
export function isIgnored(eventType: string): boolean {
  const COMPLETELY_IGNORED = new Set([
    'heartbeat',
    'cursor_move',
    'cursor_update',
    'selection_change',
    'presence_join',
    'presence_leave',
    'yjs_sync',
    'connection_reconnect',
  ]);
  return COMPLETELY_IGNORED.has(eventType);
}

// ============================================================================
// SECTION 2: THROTTLE & BATCH CONFIGURATION
// ============================================================================

export const BATCH_CONFIG = {
  /**
   * Don't emit activity until user is idle for this duration.
   * Prevents spamming during active editing sessions.
   */
  IDLE_THRESHOLD_MS: 90_000, // 90 seconds
  
  /**
   * Maximum time between batch emissions per deck per user.
   * Ensures activity shows up even during marathon editing.
   */
  MAX_BATCH_INTERVAL_MS: 30 * 60_000, // 30 minutes
  
  /**
   * Minimum changes before emitting early (before idle threshold).
   * Balances responsiveness with spam prevention.
   */
  MIN_CHANGES_FOR_EARLY_EMIT: 10,
  
  /**
   * Maximum changes to track before forcing emit.
   * Prevents memory issues in very long sessions.
   */
  MAX_CHANGES_PER_BATCH: 100,
  
  /**
   * Debounce window for collapsing duplicate notifications.
   * Multiple share/permission changes within this window = 1 notification.
   */
  NOTIFICATION_COLLAPSE_WINDOW_MS: 60_000, // 1 minute
  
  /**
   * Activity retention period (TTL for DynamoDB).
   */
  ACTIVITY_TTL_DAYS: 90,
};

// ============================================================================
// SECTION 3: TYPE DEFINITIONS
// ============================================================================

/**
 * Notification event payload (stored in Notifications table, sent via WebSocket)
 */
export interface NotificationPayload {
  // Identity
  notificationId: string;           // Format: "N#<timestamp>#<uuid>"
  userId: string;                   // Recipient user ID
  
  // Classification
  type: NotificationType;
  category: 'slides' | 'budget' | 'messages' | 'project' | 'tasks' | 'system';
  
  // Content
  title: string;                    // "Jaz mentioned you in MB2 Tahoe Slides"
  body?: string;                    // Optional excerpt or details
  
  // Context
  projectId: string;
  projectName?: string;
  slideId?: string;
  deckId?: string;
  versionId?: string;
  commentId?: string;
  taskId?: string;
  
  // Actor (who triggered this)
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  
  // State
  createdAt: string;                // ISO timestamp
  readAt?: string;                  // ISO timestamp when read
  
  // Deep link
  actionUrl?: string;               // e.g., "/project/abc/slides?slide=xyz"
  
  // Metadata
  meta?: Record<string, unknown>;
}

/**
 * Activity event payload (stored in ProjectActivity table)
 */
export interface ActivityPayload {
  // Identity
  activityId: string;               // Format: "A#<timestamp>#<uuid>"
  projectId: string;
  
  // Classification
  type: ActivityType;
  category: 'slides' | 'budget' | 'files' | 'tasks' | 'project' | 'messages';
  
  // Content (supports batching)
  summary: string;                  // "Updated Slides: Slide 3 text, Slide 7 image"
  changes?: ActivityChange[];       // Detailed breakdown
  
  // Actor
  userId: string;
  userName: string;
  userAvatar?: string;
  
  // Timing
  createdAt: string;
  periodStart?: string;             // For batched events (first edit time)
  periodEnd?: string;               // For batched events (last edit time)
  
  // Grouping
  batchId?: string;                 // Groups related changes
  changeCount?: number;             // Total changes in batch
  
  // TTL
  expiresAt?: number;               // Unix timestamp for DynamoDB TTL
}

export interface ActivityChange {
  slideId?: string;
  slideNumber?: number;
  deckId?: string;
  changeType: 'text' | 'image' | 'layout' | 'style' | 'delete' | 'create' | 'reorder' | 'move';
  description?: string;
  timestamp?: string;
}

export type ActivityType =
  | 'slide_edit'
  | 'slide_create'
  | 'slide_delete'
  | 'slide_reorder'
  | 'slide_duplicate'
  | 'deck_create'
  | 'deck_rename'
  | 'deck_publish'
  | 'budget_update'
  | 'budget_revision'
  | 'file_upload'
  | 'file_delete'
  | 'file_rename'
  | 'task_create'
  | 'task_update'
  | 'task_complete'
  | 'project_settings'
  | 'comment_add'
  | 'comment_resolve';

// ============================================================================
// SECTION 4: EXAMPLE PAYLOADS
// ============================================================================

export const EXAMPLE_PAYLOADS = {
  // -------------------------------------------------------------------------
  // NOTIFICATION EXAMPLES
  // -------------------------------------------------------------------------
  
  mention: {
    notificationId: 'N#1735833600000#a1b2c3d4',
    userId: 'user-456',           // Recipient
    type: 'mention',
    category: 'slides',
    title: 'Jaz mentioned you in MB2 Tahoe Slides',
    body: '"...please review the @Sarah changes on slide 3..."',
    projectId: 'proj-123',
    projectName: 'MB2 Tahoe',
    slideId: 'slide-789',
    deckId: 'deck-001',
    commentId: 'comment-xyz',
    senderId: 'user-jaz-123',
    senderName: 'Jaz',
    senderAvatar: 'https://cdn.mylg.app/avatars/jaz.jpg',
    createdAt: '2026-01-02T12:00:00.000Z',
    actionUrl: '/project/proj-123/slides?slide=slide-789&comment=comment-xyz',
  } as NotificationPayload,
  
  share: {
    notificationId: 'N#1735833600000#b2c3d4e5',
    userId: 'user-456',
    type: 'share',
    category: 'slides',
    title: 'Jaz shared MB2 Tahoe Slides with you',
    body: 'You can now edit this deck',
    projectId: 'proj-123',
    projectName: 'MB2 Tahoe',
    deckId: 'deck-001',
    senderId: 'user-jaz-123',
    senderName: 'Jaz',
    createdAt: '2026-01-02T12:00:00.000Z',
    actionUrl: '/project/proj-123/slides',
    meta: { permission: 'edit' },
  } as NotificationPayload,
  
  review_request: {
    notificationId: 'N#1735833600000#c3d4e5f6',
    userId: 'user-456',
    type: 'review_request',
    category: 'slides',
    title: 'Jaz requested your review on MB2 Tahoe Slides',
    body: 'Version 2.1 is ready for review',
    projectId: 'proj-123',
    projectName: 'MB2 Tahoe',
    deckId: 'deck-001',
    versionId: 'v2.1',
    senderId: 'user-jaz-123',
    senderName: 'Jaz',
    createdAt: '2026-01-02T12:00:00.000Z',
    actionUrl: '/project/proj-123/slides?version=v2.1&review=true',
  } as NotificationPayload,
  
  publish: {
    notificationId: 'N#1735833600000#d4e5f6g7',
    userId: 'user-456',
    type: 'publish',
    category: 'slides',
    title: 'MB2 Tahoe Slides v2.1 published',
    body: 'Jaz published this version to the client',
    projectId: 'proj-123',
    projectName: 'MB2 Tahoe',
    deckId: 'deck-001',
    versionId: 'v2.1',
    senderId: 'user-jaz-123',
    senderName: 'Jaz',
    createdAt: '2026-01-02T12:00:00.000Z',
    actionUrl: '/project/proj-123/slides?version=v2.1',
  } as NotificationPayload,
  
  failure: {
    notificationId: 'N#1735833600000#e5f6g7h8',
    userId: 'user-jaz-123',       // Notify the person who initiated
    type: 'failure',
    category: 'slides',
    title: 'Export failed: MB2 Tahoe Slides',
    body: 'PDF generation timed out. Please try again.',
    projectId: 'proj-123',
    projectName: 'MB2 Tahoe',
    deckId: 'deck-001',
    senderId: 'system',
    senderName: 'System',
    createdAt: '2026-01-02T12:00:00.000Z',
    actionUrl: '/project/proj-123/slides',
    meta: { failureType: 'export_timeout', errorCode: 'TIMEOUT_001' },
  } as NotificationPayload,
  
  // -------------------------------------------------------------------------
  // ACTIVITY EXAMPLES
  // -------------------------------------------------------------------------
  
  slide_edit_batch: {
    activityId: 'A#1735833600000#f6g7h8i9',
    projectId: 'proj-123',
    type: 'slide_edit',
    category: 'slides',
    summary: 'Jaz edited MB2 Tahoe Slides · 12 changes · 3 slides · 4m ago',
    changes: [
      { slideId: 'slide-3', slideNumber: 3, changeType: 'text', description: 'Updated title' },
      { slideId: 'slide-3', slideNumber: 3, changeType: 'text', description: 'Added paragraph' },
      { slideId: 'slide-7', slideNumber: 7, changeType: 'image', description: 'Replaced hero image' },
      { slideId: 'slide-9', slideNumber: 9, changeType: 'layout', description: 'Changed to 2-column' },
      // ... 8 more changes
    ],
    userId: 'user-jaz-123',
    userName: 'Jaz',
    userAvatar: 'https://cdn.mylg.app/avatars/jaz.jpg',
    createdAt: '2026-01-02T12:04:00.000Z',
    periodStart: '2026-01-02T12:00:00.000Z',
    periodEnd: '2026-01-02T12:04:00.000Z',
    batchId: 'batch-abc123',
    changeCount: 12,
    expiresAt: 1743609600, // 90 days from now
  } as ActivityPayload,
  
  deck_publish: {
    activityId: 'A#1735833600000#g7h8i9j0',
    projectId: 'proj-123',
    type: 'deck_publish',
    category: 'slides',
    summary: 'Jaz published MB2 Tahoe Slides v2.1',
    userId: 'user-jaz-123',
    userName: 'Jaz',
    createdAt: '2026-01-02T12:05:00.000Z',
    changeCount: 1,
  } as ActivityPayload,
};

// ============================================================================
// SECTION 5: HELPER FUNCTIONS
// ============================================================================

import { randomUUID } from 'crypto';

/**
 * Generate notification ID with timestamp for sorting
 */
export function generateNotificationId(): string {
  return `N#${Date.now()}#${randomUUID().split('-')[0]}`;
}

/**
 * Generate activity ID with timestamp for sorting
 */
export function generateActivityId(): string {
  return `A#${Date.now()}#${randomUUID().split('-')[0]}`;
}

/**
 * Build a human-readable activity summary from changes
 */
export function buildActivitySummary(
  userName: string,
  deckName: string,
  changes: ActivityChange[],
  durationMinutes?: number
): string {
  const slideNumbers = [...new Set(changes.map(c => c.slideNumber).filter(Boolean))].sort();
  const changeCount = changes.length;
  
  let summary = `${userName} edited ${deckName}`;
  summary += ` · ${changeCount} change${changeCount === 1 ? '' : 's'}`;
  summary += ` · ${slideNumbers.length} slide${slideNumbers.length === 1 ? '' : 's'}`;
  
  if (durationMinutes && durationMinutes > 0) {
    summary += ` · ${durationMinutes}m ago`;
  }
  
  return summary;
}

/**
 * Check if user should receive notification (not self, preferences respected)
 */
export function shouldNotifyUser(
  recipientId: string,
  senderId: string,
  eventType: NotificationType,
  preferences?: ProjectNotificationPreferences
): boolean {
  // Never notify the actor
  if (recipientId === senderId) return false;
  
  // Check preferences if provided
  if (preferences) {
    const prefMap: Record<NotificationType, keyof ProjectNotificationPreferences> = {
      mention: 'mentions',
      share: 'sharing',
      review_request: 'reviewRequests',
      review_complete: 'reviewRequests',
      publish: 'publishing',
      comment_resolved: 'mentions',
      comment_reopened: 'mentions',
      failure: 'failures',
      slide_to_task: 'mentions',
      project_invite: 'sharing',
      task_assigned: 'mentions',
      message: 'mentions',
    };
    
    const prefKey = prefMap[eventType];
    if (prefKey && preferences[prefKey] === false) return false;
  }
  
  return true;
}

/**
 * Compute TTL for activity records (90 days from now)
 */
export function computeActivityTTL(): number {
  return Math.floor(Date.now() / 1000) + (BATCH_CONFIG.ACTIVITY_TTL_DAYS * 24 * 60 * 60);
}

// ============================================================================
// SECTION 6: PREFERENCES
// ============================================================================

export interface ProjectNotificationPreferences {
  projectId: string;
  userId: string;
  
  // Notification toggles (default: all true)
  mentions: boolean;
  reviewRequests: boolean;
  publishing: boolean;
  sharing: boolean;
  failures: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: Omit<ProjectNotificationPreferences, 'projectId' | 'userId'> = {
  mentions: true,
  reviewRequests: true,
  publishing: true,
  sharing: true,
  failures: true,
};

// ============================================================================
// SECTION 7: WEBSOCKET ACTIONS
// ============================================================================

/**
 * WebSocket actions for the notification/activity system.
 * Add these to default.mjs switch statement.
 */
export const WS_ACTIONS = {
  // Inbound (client → server)
  TRACK_SLIDE_EDIT: 'trackSlideEdit',
  FETCH_PROJECT_ACTIVITY: 'fetchProjectActivity',
  CREATE_NOTIFICATION: 'createNotification',
  MARK_NOTIFICATION_READ: 'notificationRead',
  UPDATE_NOTIFICATION_PREFS: 'updateNotificationPrefs',
  
  // Outbound (server → client)
  NOTIFICATION: 'notification',
  NOTIFICATIONS_BATCH: 'notificationsBatch',
  ACTIVITY_UPDATE: 'activityUpdate',
  ACTIVITY_BATCH: 'activityBatch',
};

/**
 * Example WebSocket message payloads
 */
export const WS_MESSAGE_EXAMPLES = {
  // Client tracking a slide edit
  trackSlideEdit: {
    action: 'trackSlideEdit',
    projectId: 'proj-123',
    deckId: 'deck-001',
    changes: [
      { slideId: 'slide-3', slideNumber: 3, changeType: 'text' },
    ],
  },
  
  // Server sending a notification
  notification: {
    action: 'notification',
    notificationId: 'N#1735833600000#a1b2c3d4',
    type: 'mention',
    title: 'Jaz mentioned you in MB2 Tahoe Slides',
    projectId: 'proj-123',
    senderId: 'user-jaz-123',
    senderName: 'Jaz',
    createdAt: '2026-01-02T12:00:00.000Z',
    read: false,
  },
  
  // Server sending activity update
  activityUpdate: {
    action: 'activityUpdate',
    activityId: 'A#1735833600000#f6g7h8i9',
    projectId: 'proj-123',
    type: 'slide_edit',
    summary: 'Jaz edited MB2 Tahoe Slides · 12 changes · 3 slides',
    userId: 'user-jaz-123',
    userName: 'Jaz',
    createdAt: '2026-01-02T12:04:00.000Z',
  },
};
