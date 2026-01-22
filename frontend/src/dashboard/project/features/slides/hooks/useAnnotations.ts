import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  SlideComment,
  SlideSticker,
  SlideAnnotations,
  CommentStatus,
  StickerType,
  ReactionType,
  StickerColor,
} from '../lib/comments';

interface UseAnnotationsProps {
  slideId: string;
  projectId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
}

interface UseAnnotationsReturn {
  annotations: SlideAnnotations;
  isLoading: boolean;
  error: Error | null;
  // Comment methods
  addComment: (position: { x: number; y: number }, content: string) => void;
  updateComment: (commentId: string, content: string) => void;
  deleteComment: (commentId: string) => void;
  resolveComment: (commentId: string) => void;
  replyToComment: (commentId: string, content: string) => void;
  // Sticker methods
  addSticker: (
    position: { x: number; y: number },
    type: StickerType,
    options?: { content?: string; reaction?: ReactionType; color?: StickerColor }
  ) => void;
  updateSticker: (stickerId: string, content: string, color?: StickerColor) => void;
  deleteSticker: (stickerId: string) => void;
  // Persistence
  saveAnnotations: () => Promise<void>;
}

/**
 * Hook for managing slide comments and stickers
 * Handles local state and syncs with backend/Yjs
 */
export function useAnnotations({
  slideId,
  projectId,
  userId,
  userName,
  userAvatar,
}: UseAnnotationsProps): UseAnnotationsReturn {
  const [annotations, setAnnotations] = useState<SlideAnnotations>({
    comments: [],
    stickers: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Load annotations on mount
  useEffect(() => {
    // TODO: Load from backend/Yjs
    // For now, use localStorage for persistence
    const key = `slide-annotations-${slideId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setAnnotations(parsed);
      } catch (err) {
        console.error('Failed to parse stored annotations:', err);
      }
    }
  }, [slideId]);

  // Save to localStorage whenever annotations change
  useEffect(() => {
    const key = `slide-annotations-${slideId}`;
    localStorage.setItem(key, JSON.stringify(annotations));
  }, [slideId, annotations]);

  const addComment = useCallback(
    (position: { x: number; y: number }, content: string) => {
      const newComment: SlideComment = {
        id: uuidv4(),
        slideId,
        authorId: userId,
        authorName: userName,
        authorAvatar: userAvatar,
        content,
        position,
        status: 'open',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        replies: [],
      };

      setAnnotations((prev) => ({
        ...prev,
        comments: [...prev.comments, newComment],
      }));
    },
    [slideId, userId, userName, userAvatar]
  );

  const updateComment = useCallback((commentId: string, content: string) => {
    setAnnotations((prev) => ({
      ...prev,
      comments: prev.comments.map((comment) =>
        comment.id === commentId
          ? { ...comment, content, updatedAt: new Date().toISOString() }
          : comment
      ),
    }));
  }, []);

  const deleteComment = useCallback((commentId: string) => {
    setAnnotations((prev) => ({
      ...prev,
      comments: prev.comments.filter((comment) => comment.id !== commentId),
    }));
  }, []);

  const resolveComment = useCallback((commentId: string) => {
    setAnnotations((prev) => ({
      ...prev,
      comments: prev.comments.map((comment) =>
        comment.id === commentId
          ? {
              ...comment,
              status: (comment.status === 'resolved' ? 'open' : 'resolved') as CommentStatus,
              updatedAt: new Date().toISOString(),
            }
          : comment
      ),
    }));
  }, []);

  const replyToComment = useCallback(
    (commentId: string, content: string) => {
      const reply: SlideComment = {
        id: uuidv4(),
        slideId,
        authorId: userId,
        authorName: userName,
        authorAvatar: userAvatar,
        content,
        position: { x: 0, y: 0 }, // Replies don't need position
        status: 'open',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setAnnotations((prev) => ({
        ...prev,
        comments: prev.comments.map((comment) =>
          comment.id === commentId
            ? {
                ...comment,
                replies: [...(comment.replies || []), reply],
                updatedAt: new Date().toISOString(),
              }
            : comment
        ),
      }));
    },
    [slideId, userId, userName, userAvatar]
  );

  const addSticker = useCallback(
    (
      position: { x: number; y: number },
      type: StickerType,
      options?: { content?: string; reaction?: ReactionType; color?: StickerColor }
    ) => {
      const newSticker: SlideSticker = {
        id: uuidv4(),
        slideId,
        type,
        authorId: userId,
        authorName: userName,
        content: options?.content,
        reaction: options?.reaction,
        position,
        color: options?.color || 'yellow',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setAnnotations((prev) => ({
        ...prev,
        stickers: [...prev.stickers, newSticker],
      }));
    },
    [slideId, userId, userName]
  );

  const updateSticker = useCallback((stickerId: string, content: string, color?: StickerColor) => {
    setAnnotations((prev) => ({
      ...prev,
      stickers: prev.stickers.map((sticker) =>
        sticker.id === stickerId
          ? {
              ...sticker,
              content,
              ...(color && { color }),
              updatedAt: new Date().toISOString(),
            }
          : sticker
      ),
    }));
  }, []);

  const deleteSticker = useCallback((stickerId: string) => {
    setAnnotations((prev) => ({
      ...prev,
      stickers: prev.stickers.filter((sticker) => sticker.id !== stickerId),
    }));
  }, []);

  const saveAnnotations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // TODO: Implement backend API call
      // await apiFetch(`/projects/${projectId}/slides/${slideId}/annotations`, {
      //   method: 'PUT',
      //   body: JSON.stringify(annotations),
      // });
      console.log('Saving annotations:', annotations);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [annotations]);

  return {
    annotations,
    isLoading,
    error,
    addComment,
    updateComment,
    deleteComment,
    resolveComment,
    replyToComment,
    addSticker,
    updateSticker,
    deleteSticker,
    saveAnnotations,
  };
}
