// contexts/CommentsContext.tsx - State management for slide comments
import React, { createContext, useContext, useCallback, useState, useMemo, useRef, useEffect } from 'react';
import {
  SlideComment,
  SlideEditorMode,
  CommentFilterOptions,
  CommentStatus,
  createSlideComment,
  createCommentEntry,
  DEFAULT_FILTER_OPTIONS,
} from '../lib/commentsTypes';

interface CommentsContextValue {
  /** Current editor mode */
  mode: SlideEditorMode;
  setMode: (mode: SlideEditorMode) => void;

  /** All comments for the current project/deck */
  comments: SlideComment[];

  /** Comments filtered for the active slide */
  activeSlideComments: SlideComment[];

  /** Currently selected/focused comment */
  selectedCommentId: string | null;
  setSelectedCommentId: (id: string | null) => void;

  /** Comment being edited */
  editingCommentId: string | null;
  setEditingCommentId: (id: string | null) => void;

  /** Filter options */
  filterOptions: CommentFilterOptions;
  setFilterOptions: (options: CommentFilterOptions) => void;

  /** CRUD operations */
  addComment: (
    slideId: string,
    anchorX: number,
    anchorY: number,
    text: string
  ) => SlideComment | null;
  addReply: (commentId: string, text: string) => void;
  updateComment: (commentId: string, entryId: string, text: string) => void;
  deleteComment: (commentId: string) => void;
  deleteReply: (commentId: string, entryId: string) => void;
  resolveComment: (commentId: string) => void;
  reopenComment: (commentId: string) => void;
  moveComment: (commentId: string, anchorX: number, anchorY: number) => void;

  /** Loading state */
  isLoading: boolean;

  /** Visibility toggle for comments in edit mode */
  showCommentsInEditMode: boolean;
  setShowCommentsInEditMode: (show: boolean) => void;

  /** Pending placement - when user clicks to place a new comment */
  pendingPlacement: { x: number; y: number } | null;
  setPendingPlacement: (placement: { x: number; y: number } | null) => void;

  /** Count helpers */
  totalCount: number;
  openCount: number;
  resolvedCount: number;
}

const CommentsContext = createContext<CommentsContextValue | null>(null);

interface CommentsProviderProps {
  children: React.ReactNode;
  projectId: string | undefined;
  activeSlideId: string | null;
  userId: string | undefined;
  userName: string | undefined;
  userAvatar?: string;
  /** Initial comments loaded from backend */
  initialComments?: SlideComment[];
  /** Callback when comments change (for persistence) */
  onCommentsChange?: (comments: SlideComment[]) => void;
}

export const CommentsProvider: React.FC<CommentsProviderProps> = ({
  children,
  projectId: _projectId,
  activeSlideId,
  userId,
  userName,
  userAvatar,
  initialComments = [],
  onCommentsChange,
}) => {
  // Reserved props for future WebSocket sync
  void _projectId;

  const [mode, setMode] = useState<SlideEditorMode>('edit');
  const [comments, setComments] = useState<SlideComment[]>(initialComments);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<CommentFilterOptions>(DEFAULT_FILTER_OPTIONS);
  const [isLoading, setIsLoading] = useState(false);
  const [showCommentsInEditMode, setShowCommentsInEditMode] = useState(false);
  const [pendingPlacement, setPendingPlacement] = useState<{ x: number; y: number } | null>(null);

  // Mark isLoading as intentionally preserved for future async operations
  void isLoading; void setIsLoading;

  const onCommentsChangeRef = useRef(onCommentsChange);
  useEffect(() => {
    onCommentsChangeRef.current = onCommentsChange;
  }, [onCommentsChange]);

  // Sync initial comments when they change
  useEffect(() => {
    if (initialComments && initialComments.length > 0) {
      setComments(initialComments);
    }
  }, [initialComments]);

  // Notify parent of changes
  const notifyChange = useCallback((updatedComments: SlideComment[]) => {
    onCommentsChangeRef.current?.(updatedComments);
  }, []);

  // Filter comments for active slide
  const activeSlideComments = useMemo(() => {
    if (!activeSlideId) return [];
    
    let filtered = comments.filter((c) => c.slideId === activeSlideId);
    
    // Apply filter options
    if (!filterOptions.showResolved) {
      filtered = filtered.filter((c) => c.status === 'open');
    }
    
    if (filterOptions.authorFilter && filterOptions.authorFilter.length > 0) {
      filtered = filtered.filter((c) => filterOptions.authorFilter!.includes(c.createdBy));
    }
    
    return filtered;
  }, [comments, activeSlideId, filterOptions]);

  // Counts
  const totalCount = comments.length;
  const openCount = useMemo(() => comments.filter((c) => c.status === 'open').length, [comments]);
  const resolvedCount = useMemo(() => comments.filter((c) => c.status === 'resolved').length, [comments]);

  // Add a new comment
  const addComment = useCallback(
    (slideId: string, anchorX: number, anchorY: number, text: string): SlideComment | null => {
      if (!userId || !userName) {
        console.warn('[Comments] Cannot add comment: user not authenticated');
        return null;
      }

      const comment = createSlideComment(
        slideId,
        anchorX,
        anchorY,
        text,
        userId,
        userName,
        userAvatar
      );

      setComments((prev) => {
        const updated = [...prev, comment];
        notifyChange(updated);
        return updated;
      });

      setPendingPlacement(null);
      return comment;
    },
    [userId, userName, userAvatar, notifyChange]
  );

  // Add a reply to an existing comment
  const addReply = useCallback(
    (commentId: string, text: string) => {
      if (!userId || !userName) {
        console.warn('[Comments] Cannot add reply: user not authenticated');
        return;
      }

      const entry = createCommentEntry(text, userId, userName, userAvatar);

      setComments((prev) => {
        const updated = prev.map((c) => {
          if (c.id !== commentId) return c;
          return {
            ...c,
            thread: [...c.thread, entry],
            updatedAt: entry.createdAt,
          };
        });
        notifyChange(updated);
        return updated;
      });
    },
    [userId, userName, userAvatar, notifyChange]
  );

  // Update a comment entry
  const updateComment = useCallback(
    (commentId: string, entryId: string, text: string) => {
      setComments((prev) => {
        const updated = prev.map((c) => {
          if (c.id !== commentId) return c;
          return {
            ...c,
            thread: c.thread.map((e) =>
              e.id === entryId
                ? { ...e, text, updatedAt: new Date().toISOString() }
                : e
            ),
            updatedAt: new Date().toISOString(),
          };
        });
        notifyChange(updated);
        return updated;
      });
      setEditingCommentId(null);
    },
    [notifyChange]
  );

  // Delete an entire comment thread
  const deleteComment = useCallback(
    (commentId: string) => {
      setComments((prev) => {
        const updated = prev.filter((c) => c.id !== commentId);
        notifyChange(updated);
        return updated;
      });
      if (selectedCommentId === commentId) {
        setSelectedCommentId(null);
      }
    },
    [selectedCommentId, notifyChange]
  );

  // Delete a single reply from a thread
  const deleteReply = useCallback(
    (commentId: string, entryId: string) => {
      setComments((prev) => {
        const updated = prev.map((c) => {
          if (c.id !== commentId) return c;
          // Don't allow deleting the root comment via this method
          if (c.thread[0]?.id === entryId) return c;
          return {
            ...c,
            thread: c.thread.filter((e) => e.id !== entryId),
            updatedAt: new Date().toISOString(),
          };
        });
        notifyChange(updated);
        return updated;
      });
    },
    [notifyChange]
  );

  // Resolve a comment
  const resolveComment = useCallback(
    (commentId: string) => {
      setComments((prev) => {
        const updated = prev.map((c) =>
          c.id === commentId
            ? { ...c, status: 'resolved' as CommentStatus, updatedAt: new Date().toISOString() }
            : c
        );
        notifyChange(updated);
        return updated;
      });
    },
    [notifyChange]
  );

  // Reopen a resolved comment
  const reopenComment = useCallback(
    (commentId: string) => {
      setComments((prev) => {
        const updated = prev.map((c) =>
          c.id === commentId
            ? { ...c, status: 'open' as CommentStatus, updatedAt: new Date().toISOString() }
            : c
        );
        notifyChange(updated);
        return updated;
      });
    },
    [notifyChange]
  );

  // Move a comment anchor
  const moveComment = useCallback(
    (commentId: string, anchorX: number, anchorY: number) => {
      setComments((prev) => {
        const updated = prev.map((c) =>
          c.id === commentId
            ? {
                ...c,
                anchorX: Math.max(0, Math.min(100, anchorX)),
                anchorY: Math.max(0, Math.min(100, anchorY)),
                updatedAt: new Date().toISOString(),
              }
            : c
        );
        notifyChange(updated);
        return updated;
      });
    },
    [notifyChange]
  );

  // Clear selection when changing slides
  useEffect(() => {
    setSelectedCommentId(null);
    setEditingCommentId(null);
    setPendingPlacement(null);
  }, [activeSlideId]);

  // Clear pending placement when exiting comment mode
  useEffect(() => {
    if (mode !== 'comment') {
      setPendingPlacement(null);
    }
  }, [mode]);

  const value = useMemo<CommentsContextValue>(
    () => ({
      mode,
      setMode,
      comments,
      activeSlideComments,
      selectedCommentId,
      setSelectedCommentId,
      editingCommentId,
      setEditingCommentId,
      filterOptions,
      setFilterOptions,
      addComment,
      addReply,
      updateComment,
      deleteComment,
      deleteReply,
      resolveComment,
      reopenComment,
      moveComment,
      isLoading,
      showCommentsInEditMode,
      setShowCommentsInEditMode,
      pendingPlacement,
      setPendingPlacement,
      totalCount,
      openCount,
      resolvedCount,
    }),
    [
      mode,
      comments,
      activeSlideComments,
      selectedCommentId,
      editingCommentId,
      filterOptions,
      addComment,
      addReply,
      updateComment,
      deleteComment,
      deleteReply,
      resolveComment,
      reopenComment,
      moveComment,
      isLoading,
      showCommentsInEditMode,
      pendingPlacement,
      totalCount,
      openCount,
      resolvedCount,
    ]
  );

  return (
    <CommentsContext.Provider value={value}>
      {children}
    </CommentsContext.Provider>
  );
};

export function useComments(): CommentsContextValue {
  const context = useContext(CommentsContext);
  if (!context) {
    throw new Error('useComments must be used within a CommentsProvider');
  }
  return context;
}

export default CommentsContext;
