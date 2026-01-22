/**
 * CommentPinPortal.tsx - Zoom-independent comment pin for portal overlay
 * 
 * This pin renders at a constant screen size regardless of zoom level.
 * It's positioned using screen coordinates from the parent overlay.
 */
import React, { useCallback, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { SlideComment } from '../lib/commentsTypes';
import './CommentPinPortal.css';

interface CommentPinPortalProps {
  comment: SlideComment;
  /** Screen X position in pixels */
  screenX: number;
  /** Screen Y position in pixels */
  screenY: number;
  isSelected: boolean;
  onClick: (commentId: string) => void;
  onDoubleClick?: (commentId: string) => void;
  draggable?: boolean;
  onDragEnd?: (anchorX: number, anchorY: number) => void;
  /** Convert screen X to slide percentage */
  screenToSlide: (screenX: number) => number;
  /** Convert screen Y to slide percentage */
  screenToSlideY: (screenY: number) => number;
}

const CommentPinPortal: React.FC<CommentPinPortalProps> = ({
  comment,
  screenX,
  screenY,
  isSelected,
  onClick,
  onDoubleClick,
  draggable = false,
  onDragEnd,
  screenToSlide,
  screenToSlideY,
}) => {
  const pinRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const isResolved = comment.status === 'resolved';
  const threadCount = comment.thread.length;
  const rootAuthor = comment.thread[0]?.authorName ?? 'Unknown';
  const rootAuthorInitial = rootAuthor.charAt(0).toUpperCase();
  const authorAvatar = comment.thread[0]?.authorAvatar;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDragging) {
      onClick(comment.id);
    }
  }, [comment.id, onClick, isDragging]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDoubleClick?.(comment.id);
  }, [comment.id, onDoubleClick]);

  // Drag handling with mouse events (more reliable than native drag)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!draggable) return;
    e.preventDefault();
    e.stopPropagation();
    
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setDragOffset({ x: 0, y: 0 });

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartRef.current) return;
      
      const dx = moveEvent.clientX - dragStartRef.current.x;
      const dy = moveEvent.clientY - dragStartRef.current.y;
      
      // Start dragging after small threshold
      if (!isDragging && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        setIsDragging(true);
      }
      
      setDragOffset({ x: dx, y: dy });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      if (isDragging && onDragEnd) {
        const newScreenX = screenX + dragOffset.x;
        const newScreenY = screenY + dragOffset.y;
        const newAnchorX = screenToSlide(newScreenX);
        const newAnchorY = screenToSlideY(newScreenY);
        
        // Clamp to 0-100%
        const clampedX = Math.max(0, Math.min(100, newAnchorX));
        const clampedY = Math.max(0, Math.min(100, newAnchorY));
        
        onDragEnd(clampedX, clampedY);
      }
      
      dragStartRef.current = null;
      setIsDragging(false);
      setDragOffset({ x: 0, y: 0 });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [draggable, isDragging, screenX, screenY, dragOffset, onDragEnd, screenToSlide, screenToSlideY]);

  const pinX = screenX + (isDragging ? dragOffset.x : 0);
  const pinY = screenY + (isDragging ? dragOffset.y : 0);

  return (
    <div
      ref={pinRef}
      className={`comment-pin-portal${isSelected ? ' is-selected' : ''}${isResolved ? ' is-resolved' : ''}${isDragging ? ' is-dragging' : ''}`}
      style={{
        position: 'fixed',
        left: pinX,
        top: pinY,
        transform: 'translate(-50%, -100%)',
        pointerEvents: 'auto',
        zIndex: isSelected || isDragging ? 101 : 100,
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      role="button"
      tabIndex={0}
      aria-label={`Comment by ${rootAuthor}${threadCount > 1 ? `, ${threadCount} replies` : ''}${isResolved ? ' (resolved)' : ''}`}
    >
      {/* Pin head */}
      <div className="comment-pin-portal__head">
        {isResolved ? (
          <Check size={14} className="comment-pin-portal__icon comment-pin-portal__icon--resolved" />
        ) : authorAvatar ? (
          <img
            src={authorAvatar}
            alt={rootAuthor}
            className="comment-pin-portal__avatar"
          />
        ) : (
          <span className="comment-pin-portal__initial">{rootAuthorInitial}</span>
        )}
        
        {/* Reply count badge */}
        {threadCount > 1 && !isResolved && (
          <span className="comment-pin-portal__count">{threadCount}</span>
        )}
      </div>

      {/* Pin stem */}
      <div className="comment-pin-portal__stem" />

      {/* Hover preview */}
      <div className="comment-pin-portal__preview">
        <div className="comment-pin-portal__preview-author">{rootAuthor}</div>
        <div className="comment-pin-portal__preview-text">
          {comment.thread[0]?.text.substring(0, 100)}
          {(comment.thread[0]?.text.length ?? 0) > 100 ? '...' : ''}
        </div>
        {threadCount > 1 && (
          <div className="comment-pin-portal__preview-replies">
            +{threadCount - 1} {threadCount === 2 ? 'reply' : 'replies'}
          </div>
        )}
      </div>
    </div>
  );
};

export default CommentPinPortal;
