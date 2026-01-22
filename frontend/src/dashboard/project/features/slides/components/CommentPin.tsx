// components/CommentPin.tsx - Visual anchor/pin for comments on slides
import React, { useCallback, useMemo } from 'react';
import { Check } from 'lucide-react';
import { SlideComment, anchorToPixels } from '../lib/commentsTypes';
import './CommentPin.css';

interface CommentPinProps {
  comment: SlideComment;
  containerWidth: number;
  containerHeight: number;
  isSelected: boolean;
  onClick: (commentId: string) => void;
  onDoubleClick?: (commentId: string) => void;
  zoom?: number;
  /** Whether the pin is draggable (for repositioning) */
  draggable?: boolean;
  onDragEnd?: (commentId: string, anchorX: number, anchorY: number) => void;
}

const CommentPin: React.FC<CommentPinProps> = ({
  comment,
  containerWidth,
  containerHeight,
  isSelected,
  onClick,
  onDoubleClick,
  zoom = 1,
  draggable = false,
  onDragEnd: _onDragEnd,
}) => {
  // onDragEnd reserved for future drag-to-reposition feature
  void _onDragEnd;

  const position = useMemo(
    () => anchorToPixels(comment.anchorX, comment.anchorY, containerWidth, containerHeight),
    [comment.anchorX, comment.anchorY, containerWidth, containerHeight]
  );

  const isResolved = comment.status === 'resolved';
  const threadCount = comment.thread.length;
  const rootAuthor = comment.thread[0]?.authorName ?? 'Unknown';
  const rootAuthorInitial = rootAuthor.charAt(0).toUpperCase();
  const authorAvatar = comment.thread[0]?.authorAvatar;

  // Scale inversely with zoom so pins remain readable
  const pinScale = Math.max(0.6, Math.min(1.5, 1 / zoom));

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick(comment.id);
    },
    [comment.id, onClick]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDoubleClick?.(comment.id);
    },
    [comment.id, onDoubleClick]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (!draggable) return;
      e.dataTransfer.setData('text/plain', comment.id);
      e.dataTransfer.effectAllowed = 'move';
    },
    [comment.id, draggable]
  );

  return (
    <div
      className={`comment-pin${isSelected ? ' is-selected' : ''}${isResolved ? ' is-resolved' : ''}`}
      style={{
        left: position.x,
        top: position.y,
        transform: `translate(-50%, -100%) scale(${pinScale})`,
        transformOrigin: 'bottom center',
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      draggable={draggable}
      onDragStart={handleDragStart}
      role="button"
      tabIndex={0}
      aria-label={`Comment by ${rootAuthor}${threadCount > 1 ? `, ${threadCount} replies` : ''}${isResolved ? ' (resolved)' : ''}`}
    >
      {/* Pin stem */}
      <div className="comment-pin__stem" />
      
      {/* Pin head */}
      <div className="comment-pin__head">
        {isResolved ? (
          <Check size={14} className="comment-pin__icon comment-pin__icon--resolved" />
        ) : authorAvatar ? (
          <img
            src={authorAvatar}
            alt={rootAuthor}
            className="comment-pin__avatar"
          />
        ) : (
          <span className="comment-pin__initial">{rootAuthorInitial}</span>
        )}
        
        {/* Reply count badge */}
        {threadCount > 1 && !isResolved && (
          <span className="comment-pin__count">{threadCount}</span>
        )}
      </div>

      {/* Hover preview */}
      <div className="comment-pin__preview">
        <div className="comment-pin__preview-author">{rootAuthor}</div>
        <div className="comment-pin__preview-text">
          {comment.thread[0]?.text.substring(0, 100)}
          {(comment.thread[0]?.text.length ?? 0) > 100 ? '...' : ''}
        </div>
        {threadCount > 1 && (
          <div className="comment-pin__preview-replies">
            +{threadCount - 1} {threadCount === 2 ? 'reply' : 'replies'}
          </div>
        )}
      </div>
    </div>
  );
};

export default CommentPin;
