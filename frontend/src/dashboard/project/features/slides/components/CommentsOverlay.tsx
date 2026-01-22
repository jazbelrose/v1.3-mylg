/**
 * CommentsOverlay.tsx - Renders all comment pins for a slide
 * 
 * This overlay is positioned absolutely over the slide canvas and renders
 * all comment pins at their anchored positions. It handles:
 * - Rendering pins at percentage-based positions
 * - Click-to-add new comment in Comment mode
 * - Selection state management
 * - Thread popover display
 */
import React, { useState, useCallback, useMemo } from 'react';
import { useComments } from '../contexts/CommentsContext';
import CommentPin from './CommentPin';
import CommentThread from './CommentThread';
import './CommentsOverlay.css';

interface CommentsOverlayProps {
  slideId: string;
  /** Slide canvas dimensions for anchor calculations */
  canvasWidth: number;
  canvasHeight: number;
  /** Current zoom level (1 = 100%) */
  zoom: number;
  /** Current user info for new comments */
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar?: string;
  /** Whether the slide is in read-only/view mode */
  readOnly?: boolean;
}

export const CommentsOverlay: React.FC<CommentsOverlayProps> = ({
  slideId,
  canvasWidth,
  canvasHeight,
  zoom,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  readOnly = false,
}) => {
  const { 
    activeTool,
    setActiveTool,
    canEdit,
    showComments,
    activeSlideComments,
    filterOptions,
    selectedCommentId,
    setSelectedCommentId,
    addComment,
    moveComment,
    pendingPlacement,
    setPendingPlacement,
  } = useComments();

  const [newCommentText, setNewCommentText] = useState('');

  // Filter comments based on filter options
  const visibleComments = useMemo(() => {
    return activeSlideComments.filter(c => {
      if (!filterOptions.showResolved && c.status === 'resolved') return false;
      return true;
    });
  }, [activeSlideComments, filterOptions.showResolved]);

  // Get selected comment for thread display
  const selectedComment = useMemo(() => {
    return visibleComments.find(c => c.id === selectedCommentId);
  }, [visibleComments, selectedCommentId]);

  // Handle click to add new comment (only when using Comment tool)
  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'comment' || readOnly || !canEdit) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert to percentage of actual slide size (accounting for zoom)
    const xPercent = (x / (canvasWidth * zoom)) * 100;
    const yPercent = (y / (canvasHeight * zoom)) * 100;

    // Clamp to valid range
    const clampedX = Math.max(0, Math.min(100, xPercent));
    const clampedY = Math.max(0, Math.min(100, yPercent));

    setPendingPlacement({ x: clampedX, y: clampedY });
    setSelectedCommentId(null);
  }, [activeTool, canEdit, readOnly, canvasWidth, canvasHeight, zoom, setSelectedCommentId, setPendingPlacement]);

  // Handle creating new comment at pending anchor
  const handleCreateComment = useCallback(() => {
    if (!pendingPlacement || !newCommentText.trim()) return;

    addComment(
      slideId,
      pendingPlacement.x,
      pendingPlacement.y,
      newCommentText.trim()
    );

    setPendingPlacement(null);
    setNewCommentText('');
    
    // Auto-return to Select tool after placing a comment
    setActiveTool('select');
  }, [pendingPlacement, newCommentText, slideId, addComment, setPendingPlacement, setActiveTool]);

  // Handle pin drag to reposition
  const handlePinDragEnd = useCallback((commentId: string, anchorX: number, anchorY: number) => {
    moveComment(commentId, anchorX, anchorY);
  }, [moveComment]);

  // Cancel pending comment - also return to select
  const handleCancelPending = useCallback(() => {
    setPendingPlacement(null);
    setNewCommentText('');
    setActiveTool('select');
  }, [setPendingPlacement, setActiveTool]);

  // Handle pin selection
  const handlePinClick = useCallback((commentId: string) => {
    setSelectedCommentId(commentId);
    setPendingPlacement(null);
  }, [setSelectedCommentId, setPendingPlacement]);

  // Close thread
  const handleCloseThread = useCallback(() => {
    setSelectedCommentId(null);
  }, [setSelectedCommentId]);

  // Don't render overlay if comments are hidden (unless using comment tool)
  const shouldShow = activeTool === 'comment' || showComments;
  if (!shouldShow) {
    return null;
  }

  const isCommentTool = activeTool === 'comment' && canEdit;

  return (
    <div 
      className={`comments-overlay ${isCommentTool ? 'comments-overlay--interactive' : ''}`}
      onClick={handleOverlayClick}
      style={{
        width: canvasWidth * zoom,
        height: canvasHeight * zoom,
      }}
    >
      {/* Existing comment pins */}
      {visibleComments.map((comment) => (
        <div key={comment.id} className="comments-overlay__pin-wrapper">
          <CommentPin
            comment={comment}
            containerWidth={canvasWidth}
            containerHeight={canvasHeight}
            zoom={zoom}
            isSelected={comment.id === selectedCommentId}
            onClick={handlePinClick}
            draggable={canEdit && !readOnly && activeTool === 'comment'}
            onDragEnd={readOnly ? undefined : handlePinDragEnd}
          />
          
          {/* Thread popover for selected pin */}
          {comment.id === selectedCommentId && selectedComment && (
            <CommentThread
              comment={selectedComment}
              onClose={handleCloseThread}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              currentUserAvatar={currentUserAvatar}
            />
          )}
        </div>
      ))}

      {/* Pending new comment pin */}
      {pendingPlacement && (
        <div 
          className="comments-overlay__pin-wrapper comments-overlay__pending"
          style={{
            left: `${pendingPlacement.x}%`,
            top: `${pendingPlacement.y}%`,
          }}
        >
          <div className="comments-overlay__pending-pin" style={{ transform: `scale(${1 / zoom})` }}>
            <div className="comments-overlay__pending-head">+</div>
            <div className="comments-overlay__pending-stem" />
          </div>
          
          {/* Quick input for new comment */}
          <div className="comments-overlay__new-comment">
            <textarea
              placeholder="Add a comment..."
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCreateComment();
                }
                if (e.key === 'Escape') {
                  handleCancelPending();
                }
              }}
              autoFocus
              rows={2}
            />
            <div className="comments-overlay__new-actions">
              <button onClick={handleCancelPending}>Cancel</button>
              <button 
                className="comments-overlay__submit-btn"
                onClick={handleCreateComment}
                disabled={!newCommentText.trim()}
              >
                Comment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comment tool hint */}
      {isCommentTool && visibleComments.length === 0 && !pendingPlacement && (
        <div className="comments-overlay__hint">
          Click anywhere to add a comment
        </div>
      )}
    </div>
  );
};

export default CommentsOverlay;
