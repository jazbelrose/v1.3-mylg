import React, { useState, useCallback, useRef, useEffect } from 'react';
import { MessageSquare, X, Check, MoreVertical, Trash2, Edit2, Reply } from 'lucide-react';
import { SlideComment, CommentStatus } from '../lib/comments';
import './CommentPin.css';

interface CommentPinProps {
  comment: SlideComment;
  scale: number; // Current slide scale for positioning
  isActive: boolean;
  onSelect: () => void;
  onUpdate: (commentId: string, content: string) => void;
  onDelete: (commentId: string) => void;
  onResolve: (commentId: string) => void;
  onReply: (commentId: string, content: string) => void;
  onClose: () => void;
  currentUserId: string;
}

/**
 * Comment pin marker with expandable thread popover
 */
const CommentPin: React.FC<CommentPinProps> = ({
  comment,
  scale,
  isActive,
  onSelect,
  onUpdate,
  onDelete,
  onResolve,
  onReply,
  onClose,
  currentUserId,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [replyContent, setReplyContent] = useState('');
  const [showReply, setShowReply] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isOwner = comment.authorId === currentUserId;
  const hasReplies = comment.replies && comment.replies.length > 0;

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const handleSaveEdit = useCallback(() => {
    if (editContent.trim()) {
      onUpdate(comment.id, editContent.trim());
      setIsEditing(false);
    }
  }, [editContent, comment.id, onUpdate]);

  const handleSubmitReply = useCallback(() => {
    if (replyContent.trim()) {
      onReply(comment.id, replyContent.trim());
      setReplyContent('');
      setShowReply(false);
    }
  }, [replyContent, comment.id, onReply]);

  const handleResolve = useCallback(() => {
    onResolve(comment.id);
    setShowMenu(false);
  }, [comment.id, onResolve]);

  const handleDelete = useCallback(() => {
    if (window.confirm('Delete this comment?')) {
      onDelete(comment.id);
      setShowMenu(false);
    }
  }, [comment.id, onDelete]);

  return (
    <>
      {/* Pin marker on slide */}
      <button
        type="button"
        className={`comment-pin ${isActive ? 'comment-pin--active' : ''} ${comment.status === 'resolved' ? 'comment-pin--resolved' : ''}`}
        style={{
          left: `${comment.position.x * scale}px`,
          top: `${comment.position.y * scale}px`,
        }}
        onClick={onSelect}
        aria-label={`Comment by ${comment.authorName}`}
        title={comment.content}
      >
        {comment.status === 'resolved' ? (
          <Check size={16} />
        ) : (
          <MessageSquare size={16} />
        )}
        {hasReplies && <span className="comment-pin__count">{comment.replies!.length}</span>}
      </button>

      {/* Comment thread popover */}
      {isActive && (
        <div
          ref={popoverRef}
          className="comment-popover"
          style={{
            left: `${(comment.position.x + 30) * scale}px`,
            top: `${comment.position.y * scale}px`,
          }}
          role="dialog"
          aria-label="Comment thread"
        >
          <div className="comment-popover__header">
            <span className="comment-popover__title">Comments</span>
            <button
              type="button"
              className="comment-popover__close"
              onClick={onClose}
              aria-label="Close comments"
            >
              <X size={16} />
            </button>
          </div>

          <div className="comment-popover__body">
            {/* Root comment */}
            <div className="comment-item">
              <div className="comment-item__header">
                {comment.authorAvatar && (
                  <img
                    src={comment.authorAvatar}
                    alt={comment.authorName}
                    className="comment-item__avatar"
                  />
                )}
                <div className="comment-item__meta">
                  <span className="comment-item__author">{comment.authorName}</span>
                  <span className="comment-item__time">
                    {new Date(comment.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="comment-item__actions">
                  {isOwner && (
                    <div className="comment-item__menu-container">
                      <button
                        type="button"
                        className="comment-item__menu-button"
                        onClick={() => setShowMenu(!showMenu)}
                        aria-label="Comment options"
                      >
                        <MoreVertical size={16} />
                      </button>
                      {showMenu && (
                        <div ref={menuRef} className="comment-item__menu">
                          <button onClick={() => { setIsEditing(true); setShowMenu(false); }}>
                            <Edit2 size={14} /> Edit
                          </button>
                          <button onClick={handleResolve}>
                            <Check size={14} /> {comment.status === 'resolved' ? 'Unresolve' : 'Resolve'}
                          </button>
                          <button onClick={handleDelete} className="comment-item__menu-danger">
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="comment-item__content">
                {isEditing ? (
                  <div className="comment-item__edit">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="comment-item__textarea"
                      autoFocus
                    />
                    <div className="comment-item__edit-actions">
                      <button onClick={handleSaveEdit} className="comment-item__save">
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setIsEditing(false);
                          setEditContent(comment.content);
                        }}
                        className="comment-item__cancel"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p>{comment.content}</p>
                )}
              </div>
            </div>

            {/* Replies */}
            {hasReplies && (
              <div className="comment-replies">
                {comment.replies!.map((reply) => (
                  <div key={reply.id} className="comment-item comment-item--reply">
                    <div className="comment-item__header">
                      {reply.authorAvatar && (
                        <img
                          src={reply.authorAvatar}
                          alt={reply.authorName}
                          className="comment-item__avatar"
                        />
                      )}
                      <div className="comment-item__meta">
                        <span className="comment-item__author">{reply.authorName}</span>
                        <span className="comment-item__time">
                          {new Date(reply.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="comment-item__content">
                      <p>{reply.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Reply input */}
            {comment.status !== 'resolved' && (
              <div className="comment-reply">
                {!showReply ? (
                  <button
                    type="button"
                    className="comment-reply__button"
                    onClick={() => setShowReply(true)}
                  >
                    <Reply size={14} /> Reply
                  </button>
                ) : (
                  <div className="comment-reply__form">
                    <textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="Write a reply..."
                      className="comment-reply__textarea"
                      autoFocus
                    />
                    <div className="comment-reply__actions">
                      <button onClick={handleSubmitReply} className="comment-reply__send">
                        Send
                      </button>
                      <button
                        onClick={() => {
                          setShowReply(false);
                          setReplyContent('');
                        }}
                        className="comment-reply__cancel"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default CommentPin;
