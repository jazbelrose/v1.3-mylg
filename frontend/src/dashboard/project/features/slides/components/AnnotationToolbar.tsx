import React, { useState, useCallback } from 'react';
import { MessageSquarePlus, StickyNote, Smile } from 'lucide-react';
import { ReactionType, REACTIONS, StickerColor, STICKER_COLORS } from '../lib/comments';
import './AnnotationToolbar.css';

interface AnnotationToolbarProps {
  isCommentsVisible: boolean;
  isStickersVisible: boolean;
  onToggleComments: () => void;
  onToggleStickers: () => void;
  onAddComment: (position: { x: number; y: number }) => void;
  onAddSticker: (position: { x: number; y: number }, color: StickerColor) => void;
  onAddReaction: (position: { x: number; y: number }, reaction: ReactionType) => void;
  commentCount: number;
  stickerCount: number;
}

/**
 * Toolbar for managing comments and stickers on slides
 */
const AnnotationToolbar: React.FC<AnnotationToolbarProps> = ({
  isCommentsVisible,
  isStickersVisible,
  onToggleComments,
  onToggleStickers,
  commentCount,
  stickerCount,
}) => {
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  const handleToggleComments = useCallback(() => {
    onToggleComments();
  }, [onToggleComments]);

  const handleToggleStickers = useCallback(() => {
    onToggleStickers();
  }, [onToggleStickers]);

  return (
    <div className="annotation-toolbar">
      <div className="annotation-toolbar__group">
        <button
          type="button"
          className={`annotation-toolbar__button ${isCommentsVisible ? 'annotation-toolbar__button--active' : ''}`}
          onClick={handleToggleComments}
          title="Toggle comments"
          aria-label="Toggle comments"
          aria-pressed={isCommentsVisible}
        >
          <MessageSquarePlus size={20} />
          {commentCount > 0 && (
            <span className="annotation-toolbar__badge">{commentCount}</span>
          )}
        </button>

        <button
          type="button"
          className={`annotation-toolbar__button ${isStickersVisible ? 'annotation-toolbar__button--active' : ''}`}
          onClick={handleToggleStickers}
          title="Toggle sticky notes"
          aria-label="Toggle sticky notes"
          aria-pressed={isStickersVisible}
        >
          <StickyNote size={20} />
          {stickerCount > 0 && (
            <span className="annotation-toolbar__badge">{stickerCount}</span>
          )}
        </button>

        <div className="annotation-toolbar__divider" />

        {isCommentsVisible && (
          <div className="annotation-toolbar__hint">
            <span>Click on slide to add comment</span>
          </div>
        )}

        {isStickersVisible && (
          <div className="annotation-toolbar__hint">
            <span>Click on slide to add sticky note or reaction</span>
          </div>
        )}
      </div>

      {/* Sticker color picker */}
      {showStickerPicker && (
        <div className="annotation-toolbar__picker">
          <div className="annotation-toolbar__picker-header">
            <span>Choose a color</span>
          </div>
          <div className="annotation-toolbar__color-grid">
            {Object.entries(STICKER_COLORS).map(([key, color]) => (
              <button
                key={key}
                type="button"
                className="annotation-toolbar__color-option"
                style={{ backgroundColor: color }}
                title={key}
                aria-label={`${key} sticky note`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Reaction picker */}
      {showReactionPicker && (
        <div className="annotation-toolbar__picker">
          <div className="annotation-toolbar__picker-header">
            <span>Add reaction</span>
          </div>
          <div className="annotation-toolbar__reaction-grid">
            {Object.entries(REACTIONS).map(([key, emoji]) => (
              <button
                key={key}
                type="button"
                className="annotation-toolbar__reaction-option"
                title={key}
                aria-label={key}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnotationToolbar;
