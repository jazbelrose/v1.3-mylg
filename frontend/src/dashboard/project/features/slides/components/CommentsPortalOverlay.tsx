/**
 * CommentsPortalOverlay.tsx - Portal-based comment overlay for zoom-independent rendering
 * 
 * This component renders comment pins and popovers outside the zoomed slide DOM
 * to ensure constant pin size and prevent clipping. It uses:
 * - A portal to render above the editor viewport
 * - Coordinate conversion from slide-space to screen-space
 * - Viewport-aware popover positioning
 */
import React, { useState, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';
import { Plus } from 'lucide-react';
import { useComments } from '../contexts/CommentsContext';
import { useViewportTransform } from '../hooks/useViewportTransform';
import { calculatePopoverPosition } from '../lib/popoverPositioning';
import CommentPinPortal from './CommentPinPortal';
import CommentThreadPortal from './CommentThreadPortal';
import './CommentsPortalOverlay.css';

interface CommentsPortalOverlayProps {
  slideId: string;
  /** Ref to the canvas element (the scaled slide container) */
  canvasRef: React.RefObject<HTMLElement | null>;
  /** Ref to the viewport container (for bounds checking) */
  viewportRef: React.RefObject<HTMLElement | null>;
  /** Natural slide dimensions */
  slideWidth: number;
  slideHeight: number;
  /** Current zoom level (1 = 100%) */
  zoom: number;
  /** Current user info */
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar?: string;
  /** Whether in read-only mode */
  readOnly?: boolean;
}

// Pin size constants (in screen pixels, constant regardless of zoom)
const PIN_SIZE = 32;
const PIN_STEM_HEIGHT = 8;

export const CommentsPortalOverlay: React.FC<CommentsPortalOverlayProps> = ({
  slideId,
  canvasRef,
  viewportRef,
  slideWidth,
  slideHeight,
  zoom,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  readOnly = false,
}) => {
  const {
    mode,
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
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const [threadSize, setThreadSize] = useState({ width: 320, height: 400 });

  // Track viewport transform for coordinate conversion
  const transform = useViewportTransform(canvasRef, zoom, slideWidth, slideHeight);

  // Get or create portal container
  useLayoutEffect(() => {
    let container = document.getElementById('comments-portal-root');
    if (!container) {
      container = document.createElement('div');
      container.id = 'comments-portal-root';
      container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 9999;
        overflow: visible;
      `;
      document.body.appendChild(container);
    }
    setPortalContainer(container);

    return () => {
      // Clean up only if no other overlays are using it
      // (for multi-slide support in the future)
    };
  }, []);

  // Filter visible comments
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

  // Calculate selected comment position for thread placement
  const selectedPinPosition = useMemo(() => {
    if (!selectedComment || !transform.ready) return null;
    return {
      x: transform.slideXToScreen(selectedComment.anchorX),
      y: transform.slideYToScreen(selectedComment.anchorY),
    };
  }, [selectedComment, transform]);

  // Calculate thread popover position
  const threadPosition = useMemo(() => {
    if (!selectedPinPosition || !viewportRef.current) return null;

    const viewportRect = viewportRef.current.getBoundingClientRect();
    
    return calculatePopoverPosition({
      anchorX: selectedPinPosition.x,
      anchorY: selectedPinPosition.y - PIN_SIZE - PIN_STEM_HEIGHT, // Anchor at pin top
      popoverWidth: threadSize.width,
      popoverHeight: threadSize.height,
      viewportRect,
      preferredPlacement: 'right',
      offset: 16,
      margin: 12,
    });
  }, [selectedPinPosition, viewportRef, threadSize]);

  // Pending comment position
  const pendingPosition = useMemo(() => {
    if (!pendingPlacement || !transform.ready) return null;
    return {
      x: transform.slideXToScreen(pendingPlacement.x),
      y: transform.slideYToScreen(pendingPlacement.y),
    };
  }, [pendingPlacement, transform]);

  // Handle click on canvas to add new comment
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (mode !== 'comment' || readOnly) return;
    if (!transform.ready) return;

    const x = transform.screenXToSlide(e.clientX);
    const y = transform.screenYToSlide(e.clientY);

    // Clamp to valid range
    const clampedX = Math.max(0, Math.min(100, x));
    const clampedY = Math.max(0, Math.min(100, y));

    setPendingPlacement({ x: clampedX, y: clampedY });
    setSelectedCommentId(null);
  }, [mode, readOnly, transform, setSelectedCommentId, setPendingPlacement]);

  // Handle creating new comment
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
  }, [pendingPlacement, newCommentText, slideId, addComment, setPendingPlacement]);

  // Cancel pending comment
  const handleCancelPending = useCallback(() => {
    setPendingPlacement(null);
    setNewCommentText('');
  }, [setPendingPlacement]);

  // Handle pin selection
  const handlePinClick = useCallback((commentId: string) => {
    setSelectedCommentId(commentId);
    setPendingPlacement(null);
  }, [setSelectedCommentId, setPendingPlacement]);

  // Handle pin drag for repositioning
  const handlePinDragEnd = useCallback((commentId: string, anchorX: number, anchorY: number) => {
    moveComment(commentId, anchorX, anchorY);
  }, [moveComment]);

  // Close thread
  const handleCloseThread = useCallback(() => {
    setSelectedCommentId(null);
  }, [setSelectedCommentId]);

  // Update thread size when it renders
  const handleThreadRef = useCallback((el: HTMLDivElement | null) => {
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width !== threadSize.width || rect.height !== threadSize.height) {
        setThreadSize({ width: rect.width, height: rect.height });
      }
    }
    (threadRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
  }, [threadSize]);

  // Don't render in view mode
  if (mode === 'view') {
    return null;
  }

  // Don't render until portal container is ready
  if (!portalContainer || !transform.ready) {
    return null;
  }

  // Create click capture layer that matches the canvas bounds
  const canvasRect = transform.canvasRect;
  const clickLayerStyle: React.CSSProperties = canvasRect ? {
    position: 'fixed',
    left: canvasRect.left,
    top: canvasRect.top,
    width: canvasRect.width,
    height: canvasRect.height,
    pointerEvents: mode === 'comment' ? 'auto' : 'none',
    cursor: mode === 'comment' ? 'crosshair' : 'default',
    zIndex: 1,
  } : { display: 'none' };

  return ReactDOM.createPortal(
    <div className="comments-portal-overlay">
      {/* Click capture layer for adding new comments */}
      <div
        className="comments-portal-overlay__click-layer"
        style={clickLayerStyle}
        onClick={handleCanvasClick}
      />

      {/* Existing comment pins */}
      {visibleComments.map((comment) => {
        const pos = {
          x: transform.slideXToScreen(comment.anchorX),
          y: transform.slideYToScreen(comment.anchorY),
        };
        
        return (
          <CommentPinPortal
            key={comment.id}
            comment={comment}
            screenX={pos.x}
            screenY={pos.y}
            isSelected={comment.id === selectedCommentId}
            onClick={handlePinClick}
            draggable={!readOnly && mode === 'comment'}
            onDragEnd={(anchorX, anchorY) => handlePinDragEnd(comment.id, anchorX, anchorY)}
            screenToSlide={transform.screenXToSlide}
            screenToSlideY={transform.screenYToSlide}
          />
        );
      })}

      {/* Selected comment thread popover */}
      {selectedComment && threadPosition && (
        <CommentThreadPortal
          ref={handleThreadRef}
          comment={selectedComment}
          position={threadPosition}
          onClose={handleCloseThread}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          currentUserAvatar={currentUserAvatar}
        />
      )}

      {/* Pending new comment pin */}
      {pendingPosition && (
        <div
          className="comments-portal-overlay__pending"
          style={{
            position: 'fixed',
            left: pendingPosition.x,
            top: pendingPosition.y,
            transform: 'translate(-50%, -100%)',
            pointerEvents: 'auto',
            zIndex: 10,
          }}
        >
          <div className="comments-portal-overlay__pending-pin">
            <div className="comments-portal-overlay__pending-head">
              <Plus size={18} />
            </div>
            <div className="comments-portal-overlay__pending-stem" />
          </div>

          {/* New comment input */}
          <div className="comments-portal-overlay__new-comment">
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
            <div className="comments-portal-overlay__new-actions">
              <button onClick={handleCancelPending}>Cancel</button>
              <button
                className="comments-portal-overlay__submit-btn"
                onClick={handleCreateComment}
                disabled={!newCommentText.trim()}
              >
                Comment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comment mode hint */}
      {mode === 'comment' && visibleComments.length === 0 && !pendingPlacement && canvasRect && (
        <div
          className="comments-portal-overlay__hint"
          style={{
            position: 'fixed',
            left: canvasRect.left + canvasRect.width / 2,
            top: canvasRect.top + canvasRect.height / 2,
            transform: 'translate(-50%, -50%)',
          }}
        >
          Click anywhere to add a comment
        </div>
      )}
    </div>,
    portalContainer
  );
};

export default CommentsPortalOverlay;
