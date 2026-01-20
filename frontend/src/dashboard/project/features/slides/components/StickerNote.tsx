import React, { useState } from 'react';
import { X, MoreVertical, Trash2 } from 'lucide-react';
import { SlideSticker, REACTIONS, STICKER_COLORS, StickerColor } from '../lib/comments';
import './StickerNote.css';

interface StickerNoteProps {
  sticker: SlideSticker;
  scale: number;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (stickerId: string, content: string, color?: StickerColor) => void;
  onDelete: (stickerId: string) => void;
  currentUserId: string;
}

/**
 * Sticky note or reaction sticker on slide
 */
const StickerNote: React.FC<StickerNoteProps> = ({
  sticker,
  scale,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  currentUserId,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(sticker.content || '');
  const [showMenu, setShowMenu] = useState(false);

  const isOwner = sticker.authorId === currentUserId;
  const bgColor = sticker.color ? STICKER_COLORS[sticker.color as StickerColor] : STICKER_COLORS.yellow;

  const handleSave = () => {
    if (editContent.trim()) {
      onUpdate(sticker.id, editContent.trim(), sticker.color as StickerColor);
      setIsEditing(false);
    }
  };

  const handleDelete = () => {
    if (window.confirm('Delete this note?')) {
      onDelete(sticker.id);
    }
  };

  if (sticker.type === 'reaction') {
    return (
      <div
        className={`sticker-reaction ${isSelected ? 'sticker-reaction--selected' : ''}`}
        style={{
          left: `${sticker.position.x * scale}px`,
          top: `${sticker.position.y * scale}px`,
        }}
        onClick={onSelect}
        role="button"
        tabIndex={0}
        aria-label={`Reaction: ${sticker.reaction}`}
      >
        <span className="sticker-reaction__emoji">
          {sticker.reaction ? REACTIONS[sticker.reaction] : '👍'}
        </span>
        {isOwner && isSelected && (
          <button
            type="button"
            className="sticker-reaction__delete"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            aria-label="Delete reaction"
          >
            <X size={12} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`sticker-note ${isSelected ? 'sticker-note--selected' : ''}`}
      style={{
        left: `${sticker.position.x * scale}px`,
        top: `${sticker.position.y * scale}px`,
        backgroundColor: bgColor,
      }}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-label={`Sticky note by ${sticker.authorName}`}
    >
      <div className="sticker-note__header">
        <span className="sticker-note__author">{sticker.authorName}</span>
        {isOwner && (
          <div className="sticker-note__actions">
            <button
              type="button"
              className="sticker-note__menu-button"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              aria-label="Note options"
            >
              <MoreVertical size={14} />
            </button>
            {showMenu && (
              <div className="sticker-note__menu">
                <button
                  onClick={() => {
                    setIsEditing(true);
                    setShowMenu(false);
                  }}
                >
                  Edit
                </button>
                <button onClick={handleDelete} className="sticker-note__menu-danger">
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="sticker-note__content">
        {isEditing ? (
          <div className="sticker-note__edit">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="sticker-note__textarea"
              autoFocus
              placeholder="Write a note..."
            />
            <div className="sticker-note__edit-actions">
              <button onClick={handleSave} className="sticker-note__save">
                Save
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(sticker.content || '');
                }}
                className="sticker-note__cancel"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p>{sticker.content || 'Empty note'}</p>
        )}
      </div>

      {!isEditing && (
        <div className="sticker-note__footer">
          <span className="sticker-note__time">
            {new Date(sticker.createdAt).toLocaleDateString()}
          </span>
        </div>
      )}
    </div>
  );
};

export default StickerNote;
