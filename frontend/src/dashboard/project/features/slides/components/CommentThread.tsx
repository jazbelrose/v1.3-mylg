/**
 * CommentThread.tsx - Popover for viewing and editing a comment thread
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Check, MoreVertical, Trash2, Edit2 } from 'lucide-react';
import { useComments } from '../contexts/CommentsContext';
import type { SlideComment, CommentEntry } from '../lib/commentsTypes';
import './CommentThread.css';

interface CommentThreadProps {
  comment: SlideComment;
  onClose: () => void;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar?: string;
}

export const CommentThread: React.FC<CommentThreadProps> = ({
  comment,
  onClose,
  currentUserId,
  currentUserName: _userName,
  currentUserAvatar: _userAvatar,
}) => {
  // Reserved for future use in displaying current user's pending replies
  void _userName; void _userAvatar;

  const { addReply, updateComment, deleteComment, resolveComment, reopenComment, deleteReply } = useComments();
  const [replyText, setReplyText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const isResolved = comment.status === 'resolved';

  // Auto-focus reply input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (threadRef.current && !threadRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingId) {
          setEditingId(null);
          setEditText('');
        } else if (menuOpen) {
          setMenuOpen(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, editingId, menuOpen]);

  const handleSendReply = useCallback(() => {
    if (!replyText.trim()) return;
    addReply(comment.id, replyText.trim());
    setReplyText('');
    inputRef.current?.focus();
  }, [replyText, comment.id, addReply]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  };

  const handleResolve = () => {
    if (isResolved) {
      reopenComment(comment.id);
    } else {
      resolveComment(comment.id);
    }
  };

  const handleDelete = () => {
    deleteComment(comment.id);
    onClose();
  };

  const startEdit = (entry: CommentEntry) => {
    setEditingId(entry.id);
    setEditText(entry.text);
    setMenuOpen(null);
  };

  const saveEdit = (entryId: string) => {
    if (!editText.trim()) return;
    updateComment(comment.id, entryId, editText.trim());
    setEditingId(null);
    setEditText('');
  };

  const handleDeleteReply = (replyId: string) => {
    deleteReply(comment.id, replyId);
    setMenuOpen(null);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const renderEntry = (entry: CommentEntry, index: number) => {
    const isOwner = entry.authorId === currentUserId;
    const isEditing = editingId === entry.id;
    const entryMenuOpen = menuOpen === entry.id;
    const isRoot = index === 0;

    return (
      <div key={entry.id} className={`comment-entry ${isRoot ? 'comment-entry--root' : ''}`}>
        <div className="comment-entry__header">
          <div className="comment-entry__author">
            {entry.authorAvatar ? (
              <img src={entry.authorAvatar} alt="" className="comment-entry__avatar" />
            ) : (
              <div className="comment-entry__avatar-placeholder">
                {entry.authorName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="comment-entry__name">{entry.authorName}</span>
            <span className="comment-entry__time">{formatTime(entry.createdAt)}</span>
          </div>

          {isOwner && (
            <div className="comment-entry__actions">
              <button
                className="comment-entry__menu-btn"
                onClick={() => setMenuOpen(entryMenuOpen ? null : entry.id)}
                aria-label="More options"
              >
                <MoreVertical size={14} />
              </button>
              {entryMenuOpen && (
                <div className="comment-entry__menu">
                  <button onClick={() => startEdit(entry)}>
                    <Edit2 size={12} /> Edit
                  </button>
                  <button
                    className="comment-entry__menu-delete"
                    onClick={() => isRoot ? handleDelete() : handleDeleteReply(entry.id)}
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="comment-entry__edit">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={2}
              autoFocus
            />
            <div className="comment-entry__edit-actions">
              <button onClick={() => { setEditingId(null); setEditText(''); }}>Cancel</button>
              <button className="comment-entry__save-btn" onClick={() => saveEdit(entry.id)}>
                Save
              </button>
            </div>
          </div>
        ) : (
          <p className="comment-entry__text">{entry.text}</p>
        )}
      </div>
    );
  };

  return (
    <div ref={threadRef} className={`comment-thread ${isResolved ? 'comment-thread--resolved' : ''}`}>
      <div className="comment-thread__header">
        <span className="comment-thread__slide-label">Slide comment</span>
        <div className="comment-thread__header-actions">
          <button
            className={`comment-thread__resolve-btn ${isResolved ? 'is-resolved' : ''}`}
            onClick={handleResolve}
            title={isResolved ? 'Re-open' : 'Mark resolved'}
          >
            <Check size={16} />
            {isResolved ? 'Resolved' : 'Resolve'}
          </button>
          <button className="comment-thread__close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="comment-thread__body">
        {/* Thread entries - first is root, rest are replies */}
        {comment.thread.map((entry, index) => renderEntry(entry, index))}
      </div>

      {/* Reply input */}
      <div className="comment-thread__reply-box">
        <textarea
          ref={inputRef}
          placeholder="Reply..."
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          className="comment-thread__send-btn"
          onClick={handleSendReply}
          disabled={!replyText.trim()}
          aria-label="Send reply"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
};

export default CommentThread;
