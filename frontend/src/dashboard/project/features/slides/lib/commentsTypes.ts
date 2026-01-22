// lib/commentsTypes.ts - Type definitions for Comments Mode feature
// Google Slides–style toggleable comments anchored to slide coordinates

/**
 * Editor mode for slides
 * - view: Read-only mode, comments visible but not editable
 * - edit: Normal editing mode, comments hidden by default (toggle to show)
 * - comment: Comment mode, click to place/edit comments, editing disabled
 */
export type SlideEditorMode = 'view' | 'edit' | 'comment';

/**
 * Comment thread state
 */
export type CommentStatus = 'open' | 'resolved';

/**
 * Individual comment/reply in a thread
 */
export interface CommentEntry {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  createdAt: string;
  updatedAt?: string;
  /** @mentions extracted from text */
  mentions?: string[];
}

/**
 * Comment thread anchored to a slide
 * Anchor position is percentage-based (0-100) for zoom-invariant positioning
 */
export interface SlideComment {
  id: string;
  slideId: string;
  /** X position as percentage of slide width (0-100) */
  anchorX: number;
  /** Y position as percentage of slide height (0-100) */
  anchorY: number;
  /** Thread of comments - first entry is the root comment */
  thread: CommentEntry[];
  status: CommentStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/**
 * Comment anchor visual representation (pin/sticker)
 */
export interface CommentAnchorStyle {
  /** Color of the anchor pin */
  color: string;
  /** Size of the anchor pin */
  size: 'small' | 'medium' | 'large';
  /** Whether to show author avatar on pin */
  showAvatar: boolean;
}

/**
 * Export options for comments
 */
export interface CommentExportOptions {
  /** Whether to include comments in PDF export */
  includeInPdf: boolean;
  /** How to render comments in PDF */
  pdfRenderMode: 'pins' | 'appendix' | 'both';
  /** Whether to include resolved comments */
  includeResolved: boolean;
}

/**
 * Comment filter options for display
 */
export interface CommentFilterOptions {
  showResolved: boolean;
  authorFilter?: string[];
  dateRange?: {
    from: string;
    to: string;
  };
}

/**
 * Websocket events for real-time comment sync
 */
export type CommentWebSocketAction =
  | 'commentCreated'
  | 'commentUpdated'
  | 'commentDeleted'
  | 'commentResolved'
  | 'commentReopened'
  | 'replyAdded';

export interface CommentWebSocketPayload {
  action: CommentWebSocketAction;
  projectId: string;
  slideId: string;
  comment: SlideComment;
  senderId: string;
  username: string;
  versionId?: string;
}

/**
 * Helper to create a new comment entry
 */
export function createCommentEntry(
  text: string,
  authorId: string,
  authorName: string,
  authorAvatar?: string
): CommentEntry {
  const mentions = extractMentions(text);
  return {
    id: crypto.randomUUID(),
    text,
    authorId,
    authorName,
    authorAvatar,
    createdAt: new Date().toISOString(),
    mentions: mentions.length > 0 ? mentions : undefined,
  };
}

/**
 * Helper to create a new slide comment
 */
export function createSlideComment(
  slideId: string,
  anchorX: number,
  anchorY: number,
  initialText: string,
  authorId: string,
  authorName: string,
  authorAvatar?: string
): SlideComment {
  const rootEntry = createCommentEntry(initialText, authorId, authorName, authorAvatar);
  return {
    id: crypto.randomUUID(),
    slideId,
    anchorX: Math.max(0, Math.min(100, anchorX)),
    anchorY: Math.max(0, Math.min(100, anchorY)),
    thread: [rootEntry],
    status: 'open',
    createdAt: rootEntry.createdAt,
    updatedAt: rootEntry.createdAt,
    createdBy: authorId,
  };
}

/**
 * Extract @mentions from text
 * Returns array of usernames mentioned (without the @ symbol)
 */
export function extractMentions(text: string): string[] {
  const mentionRegex = /@(\w+)/g;
  const matches = text.matchAll(mentionRegex);
  return Array.from(matches, (m) => m[1]);
}

/** TeamMember type for mention lookups */
export interface MentionableUser {
  userId: string;
  firstName: string;
  lastName: string;
  thumbnail?: string | null;
}

/**
 * Parse text and identify @mention segments
 * Returns an array of segments, each marked as mention or plain text
 */
export interface TextSegment {
  type: 'text' | 'mention';
  content: string;
  /** For mentions: the username without @ */
  username?: string;
  /** For mentions: matched user info if found */
  user?: MentionableUser;
}

export function parseTextWithMentions(
  text: string,
  users: MentionableUser[]
): TextSegment[] {
  const mentionRegex = /@(\w+)/g;
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Build a lookup map: lowercase firstName, lastName, and full name
  const userMap = new Map<string, MentionableUser>();
  for (const user of users) {
    const firstName = user.firstName?.toLowerCase() || '';
    const lastName = user.lastName?.toLowerCase() || '';
    const fullName = `${firstName}${lastName}`.replace(/\s+/g, '');
    if (firstName) userMap.set(firstName, user);
    if (lastName) userMap.set(lastName, user);
    if (fullName) userMap.set(fullName, user);
  }

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      });
    }

    const username = match[1];
    const user = userMap.get(username.toLowerCase());

    segments.push({
      type: 'mention',
      content: match[0], // includes @
      username,
      user,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last mention
  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }

  return segments;
}

/**
 * Convert percentage anchor to pixel position
 */
export function anchorToPixels(
  anchorX: number,
  anchorY: number,
  containerWidth: number,
  containerHeight: number
): { x: number; y: number } {
  return {
    x: (anchorX / 100) * containerWidth,
    y: (anchorY / 100) * containerHeight,
  };
}

/**
 * Convert pixel position to percentage anchor
 */
export function pixelsToAnchor(
  x: number,
  y: number,
  containerWidth: number,
  containerHeight: number
): { anchorX: number; anchorY: number } {
  return {
    anchorX: Math.max(0, Math.min(100, (x / containerWidth) * 100)),
    anchorY: Math.max(0, Math.min(100, (y / containerHeight) * 100)),
  };
}

/**
 * Default anchor style for comment pins
 */
export const DEFAULT_ANCHOR_STYLE: CommentAnchorStyle = {
  color: '#facc15', // Yellow like post-it notes
  size: 'medium',
  showAvatar: true,
};

/**
 * Default export options
 */
export const DEFAULT_EXPORT_OPTIONS: CommentExportOptions = {
  includeInPdf: false,
  pdfRenderMode: 'pins',
  includeResolved: false,
};

/**
 * Default filter options
 */
export const DEFAULT_FILTER_OPTIONS: CommentFilterOptions = {
  showResolved: false,
};
