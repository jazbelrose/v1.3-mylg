// contexts/CommentsContext.tsx - State management for slide comments
import React, { createContext, useContext, useCallback, useState, useMemo, useRef, useEffect } from 'react';
import {
  SlideComment,
  SlideEditorMode,
  EditorTool,
  CommentFilterOptions,
  CommentStatus,
  createSlideComment,
  createCommentEntry,
  DEFAULT_FILTER_OPTIONS,
  type MentionableUser,
} from '../lib/commentsTypes';
import {
  fetchDeckVersionComments,
  updateDeckVersionComments,
  SlideComment as ApiSlideComment,
} from '@/shared/utils/api';

interface CommentsContextValue {
  /** 
   * Active editor tool - what happens when you click on the canvas
   * - select: Click selects/moves/resizes objects (default)
   * - comment: Click places a comment pin
   */
  activeTool: EditorTool;
  setActiveTool: (tool: EditorTool) => void;

  /**
   * Whether editing is allowed (permission/lock state)
   * When false, user can only view/pan/zoom, not modify objects
   */
  canEdit: boolean;
  setCanEdit: (canEdit: boolean) => void;

  /** 
   * @deprecated Use activeTool and canEdit instead
   * Backward-compatible mode mapping:
   * - 'view' = canEdit: false
   * - 'edit' = canEdit: true, activeTool: 'select'
   * - 'comment' = activeTool: 'comment'
   */
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

  /** Visibility toggle for comments when using select tool */
  showComments: boolean;
  setShowComments: (show: boolean) => void;

  /** @deprecated Use showComments instead */
  showCommentsInEditMode: boolean;
  setShowCommentsInEditMode: (show: boolean) => void;

  /** Pending placement - when user clicks to place a new comment */
  pendingPlacement: { x: number; y: number } | null;
  setPendingPlacement: (placement: { x: number; y: number } | null) => void;

  /** Count helpers */
  totalCount: number;
  openCount: number;
  resolvedCount: number;

  /** Team members for @mentions */
  teamMembers: MentionableUser[];
}

const CommentsContext = createContext<CommentsContextValue | null>(null);

interface CommentsProviderProps {
  children: React.ReactNode;
  projectId: string | undefined;
  activeSlideId: string | null;
  userId: string | undefined;
  userName: string | undefined;
  userAvatar?: string;
  /** Active deck version ID for persistence */
  versionId: string | undefined;
  /** Team members for @mentions */
  teamMembers?: MentionableUser[];
  /** Initial comments loaded from backend */
  initialComments?: SlideComment[];
  /** Callback when comments change (for persistence) */
  onCommentsChange?: (comments: SlideComment[]) => void;
  /** Callback to broadcast comment events via WebSocket */
  onBroadcastComment?: (action: string, comment: Record<string, unknown>) => void;
}

export const CommentsProvider: React.FC<CommentsProviderProps> = ({
  children,
  projectId,
  activeSlideId,
  userId,
  userName,
  userAvatar,
  versionId,
  teamMembers = [],
  initialComments = [],
  onCommentsChange,
  onBroadcastComment,
}) => {
  // New state model
  const [activeTool, setActiveTool] = useState<EditorTool>('select');
  const [canEdit, setCanEdit] = useState(true);
  const [showComments, setShowComments] = useState(false);

  // Backward-compatible mode (derived from activeTool + canEdit)
  const mode: SlideEditorMode = useMemo(() => {
    if (!canEdit) return 'view';
    if (activeTool === 'comment') return 'comment';
    return 'edit';
  }, [activeTool, canEdit]);

  // Backward-compatible setMode
  const setMode = useCallback((newMode: SlideEditorMode) => {
    switch (newMode) {
      case 'view':
        setCanEdit(false);
        break;
      case 'edit':
        setCanEdit(true);
        setActiveTool('select');
        break;
      case 'comment':
        setCanEdit(true);
        setActiveTool('comment');
        break;
    }
  }, []);

  const [comments, setComments] = useState<SlideComment[]>(initialComments);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<CommentFilterOptions>(DEFAULT_FILTER_OPTIONS);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingPlacement, setPendingPlacement] = useState<{ x: number; y: number } | null>(null);

  const onCommentsChangeRef = useRef(onCommentsChange);
  useEffect(() => {
    onCommentsChangeRef.current = onCommentsChange;
  }, [onCommentsChange]);

  const onBroadcastCommentRef = useRef(onBroadcastComment);
  useEffect(() => {
    onBroadcastCommentRef.current = onBroadcastComment;
  }, [onBroadcastComment]);

  // Debounced save to API
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const pendingCommentsRef = useRef<SlideComment[] | null>(null);

  // Helper to broadcast comment events
  const broadcastComment = useCallback((action: string, comment: SlideComment) => {
    onBroadcastCommentRef.current?.(action, comment as unknown as Record<string, unknown>);
  }, []);

  const saveCommentsToApi = useCallback(async (commentsToSave: SlideComment[]) => {
    if (!projectId || !versionId) return;
    
    // Avoid concurrent saves
    if (isSavingRef.current) {
      pendingCommentsRef.current = commentsToSave;
      return;
    }

    isSavingRef.current = true;
    try {
      // Convert local types to API types (they should be compatible)
      await updateDeckVersionComments(projectId, versionId, commentsToSave as unknown as ApiSlideComment[]);
    } catch (error) {
      console.error('[Comments] Failed to save comments:', error);
    } finally {
      isSavingRef.current = false;
      // Check if there's a pending save
      if (pendingCommentsRef.current) {
        const pending = pendingCommentsRef.current;
        pendingCommentsRef.current = null;
        void saveCommentsToApi(pending);
      }
    }
  }, [projectId, versionId]);

  // Load comments when version changes
  useEffect(() => {
    if (!projectId || !versionId) {
      setComments([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void (async () => {
      try {
        const loaded = await fetchDeckVersionComments(projectId, versionId);
        if (!cancelled) {
          setComments(loaded as unknown as SlideComment[]);
        }
      } catch (error) {
        console.error('[Comments] Failed to load comments:', error);
        if (!cancelled) {
          setComments([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, versionId]);

  // Listen for incoming WebSocket comment events from other users
  useEffect(() => {
    if (!projectId || !userId) return;

    const handleWsMessage = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        action?: string;
        projectId?: string;
        senderId?: string;
        versionId?: string;
        comment?: SlideComment;
      } | null;
      
      if (!detail || typeof detail !== 'object') return;
      
      // Ignore our own events
      if (detail.senderId === userId) return;
      
      // Ignore events for different projects or versions
      if (detail.projectId !== projectId) return;
      if (versionId && detail.versionId !== versionId) return;
      
      const incomingComment = detail.comment;
      if (!incomingComment) return;

      switch (detail.action) {
        case 'commentCreated':
          setComments((prev) => {
            // Don't add if already exists
            if (prev.some((c) => c.id === incomingComment.id)) return prev;
            return [...prev, incomingComment];
          });
          break;
          
        case 'commentUpdated':
        case 'replyAdded':
        case 'commentResolved':
        case 'commentReopened':
          setComments((prev) =>
            prev.map((c) => (c.id === incomingComment.id ? incomingComment : c))
          );
          break;
          
        case 'commentDeleted':
          setComments((prev) => prev.filter((c) => c.id !== incomingComment.id));
          break;
      }
    };

    window.addEventListener('ws-message', handleWsMessage as EventListener);
    return () => window.removeEventListener('ws-message', handleWsMessage as EventListener);
  }, [projectId, versionId, userId]);

  // Sync initial comments when they change (for external updates)
  useEffect(() => {
    if (initialComments && initialComments.length > 0) {
      setComments(initialComments);
    }
  }, [initialComments]);

  // Cleanup save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // Notify parent of changes and debounce API save
  const notifyChange = useCallback((updatedComments: SlideComment[]) => {
    onCommentsChangeRef.current?.(updatedComments);
    
    // Debounce API save (500ms)
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      void saveCommentsToApi(updatedComments);
    }, 500);
  }, [saveCommentsToApi]);

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

      // Broadcast for real-time sync
      broadcastComment('commentCreated', comment);

      setPendingPlacement(null);
      return comment;
    },
    [userId, userName, userAvatar, notifyChange, broadcastComment]
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
          const updatedComment = {
            ...c,
            thread: [...c.thread, entry],
            updatedAt: entry.createdAt,
          };
          // Broadcast the updated comment
          broadcastComment('replyAdded', updatedComment);
          return updatedComment;
        });
        notifyChange(updated);
        return updated;
      });
    },
    [userId, userName, userAvatar, notifyChange, broadcastComment]
  );

  // Update a comment entry
  const updateComment = useCallback(
    (commentId: string, entryId: string, text: string) => {
      setComments((prev) => {
        const updated = prev.map((c) => {
          if (c.id !== commentId) return c;
          const updatedComment = {
            ...c,
            thread: c.thread.map((e) =>
              e.id === entryId
                ? { ...e, text, updatedAt: new Date().toISOString() }
                : e
            ),
            updatedAt: new Date().toISOString(),
          };
          broadcastComment('commentUpdated', updatedComment);
          return updatedComment;
        });
        notifyChange(updated);
        return updated;
      });
      setEditingCommentId(null);
    },
    [notifyChange, broadcastComment]
  );

  // Delete an entire comment thread
  const deleteComment = useCallback(
    (commentId: string) => {
      setComments((prev) => {
        const deletedComment = prev.find((c) => c.id === commentId);
        const updated = prev.filter((c) => c.id !== commentId);
        notifyChange(updated);
        // Broadcast deletion
        if (deletedComment) {
          broadcastComment('commentDeleted', deletedComment);
        }
        return updated;
      });
      if (selectedCommentId === commentId) {
        setSelectedCommentId(null);
      }
    },
    [selectedCommentId, notifyChange, broadcastComment]
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
        const updated = prev.map((c) => {
          if (c.id !== commentId) return c;
          const resolvedComment = { ...c, status: 'resolved' as CommentStatus, updatedAt: new Date().toISOString() };
          broadcastComment('commentResolved', resolvedComment);
          return resolvedComment;
        });
        notifyChange(updated);
        return updated;
      });
    },
    [notifyChange, broadcastComment]
  );

  // Reopen a resolved comment
  const reopenComment = useCallback(
    (commentId: string) => {
      setComments((prev) => {
        const updated = prev.map((c) => {
          if (c.id !== commentId) return c;
          const reopenedComment = { ...c, status: 'open' as CommentStatus, updatedAt: new Date().toISOString() };
          broadcastComment('commentReopened', reopenedComment);
          return reopenedComment;
        });
        notifyChange(updated);
        return updated;
      });
    },
    [notifyChange, broadcastComment]
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

  // Clear pending placement when exiting comment tool
  useEffect(() => {
    if (activeTool !== 'comment') {
      setPendingPlacement(null);
    }
  }, [activeTool]);

  const value = useMemo<CommentsContextValue>(
    () => ({
      activeTool,
      setActiveTool,
      canEdit,
      setCanEdit,
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
      showComments,
      setShowComments,
      // Backward compatibility aliases (same refs as showComments/setShowComments)
      showCommentsInEditMode: showComments,
      setShowCommentsInEditMode: setShowComments,
      pendingPlacement,
      setPendingPlacement,
      totalCount,
      openCount,
      resolvedCount,
      teamMembers,
    }),
    [
      activeTool,
      canEdit,
      mode,
      setMode,
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
      showComments,
      setShowComments,
      pendingPlacement,
      totalCount,
      openCount,
      resolvedCount,
      teamMembers,
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
