/**
 * Slide comment and annotation types
 * Implements Google Slides-like commenting and sticker functionality
 */

export type CommentStatus = 'open' | 'resolved';
export type StickerType = 'note' | 'reaction';
export type ReactionType = 'thumbs-up' | 'heart' | 'smile' | 'thinking' | 'celebrate' | 'question';

export interface SlideComment {
  id: string;
  slideId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  position: {
    x: number; // Relative to slide (0-1920)
    y: number; // Relative to slide (0-1080)
  };
  status: CommentStatus;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  replies?: SlideComment[];
  mentions?: string[]; // User IDs
}

export interface SlideSticker {
  id: string;
  slideId: string;
  type: StickerType;
  authorId: string;
  authorName: string;
  content?: string; // Text for sticky notes
  reaction?: ReactionType; // Type of reaction
  position: {
    x: number; // Relative to slide (0-1920)
    y: number; // Relative to slide (0-1080)
  };
  color?: string; // For sticky notes: yellow, pink, blue, green
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface CommentThread {
  rootComment: SlideComment;
  replies: SlideComment[];
  lastActivityAt: string; // ISO 8601
}

export interface SlideAnnotations {
  comments: SlideComment[];
  stickers: SlideSticker[];
}

// Color options for sticky notes
export const STICKER_COLORS = {
  yellow: '#FFF9C4',
  pink: '#FCE4EC',
  blue: '#E3F2FD',
  green: '#E8F5E9',
  orange: '#FFE0B2',
  purple: '#F3E5F5',
} as const;

export type StickerColor = keyof typeof STICKER_COLORS;

// Available reactions
export const REACTIONS = {
  'thumbs-up': '👍',
  'heart': '❤️',
  'smile': '😊',
  'thinking': '🤔',
  'celebrate': '🎉',
  'question': '❓',
} as const;
