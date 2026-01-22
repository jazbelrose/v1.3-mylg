/**
 * CommentThread.tsx - Popover for viewing and editing a comment thread
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Send, Check, MoreVertical, Trash2, Edit2 } from 'lucide-react';
import { useComments } from '../contexts/CommentsContext';
import type { SlideComment, CommentEntry } from '../lib/commentsTypes';
import { parseTextWithMentions } from '../lib/commentsTypes';
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

  const { addReply, updateComment, deleteComment, resolveComment, reopenComment, deleteReply, teamMembers } = useComments();
  const [replyText, setReplyText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const isResolved = comment.status === 'resolved';

  // Filter team members for mention autocomplete
  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const query = mentionQuery.toLowerCase();
    return teamMembers.filter((m) => {
      const firstName = m.firstName?.toLowerCase() || '';
      const lastName = m.lastName?.toLowerCase() || '';
      return firstName.startsWith(query) || lastName.startsWith(query) ||
        `${firstName} ${lastName}`.includes(query);
    }).slice(0, 5); // Limit to 5 suggestions
  }, [mentionQuery, teamMembers]);

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
        if (mentionQuery !== null) {
          setMentionQuery(null);
        } else if (editingId) {
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
  }, [onClose, editingId, menuOpen, mentionQuery]);

  const handleSendReply = useCallback(() => {
    if (!replyText.trim()) return;
    addReply(comment.id, replyText.trim());
    setReplyText('');
    setMentionQuery(null);
    inputRef.current?.focus();
  }, [replyText, comment.id, addReply]);

  // Detect @mention trigger and track query
  const handleReplyChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setReplyText(value);

    // Check for @mention at cursor position
    const cursorPos = e.target.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }, []);

  // Insert mention into text
  const insertMention = useCallback((user: typeof teamMembers[0]) => {
    if (mentionQuery === null) return;

    const cursorPos = inputRef.current?.selectionStart ?? replyText.length;
    const textBeforeCursor = replyText.slice(0, cursorPos);
    const textAfterCursor = replyText.slice(cursorPos);

    // Replace @query with @firstName
    const mentionText = `@${user.firstName} `;
    const newText = textBeforeCursor.replace(/@\w*$/, mentionText) + textAfterCursor;
    setReplyText(newText);
    setMentionQuery(null);

    // Focus and set cursor after mention
    setTimeout(() => {
      if (inputRef.current) {
        const newPos = newText.length - textAfterCursor.length;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  }, [mentionQuery, replyText]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle mention autocomplete navigation
    if (mentionQuery !== null && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, mentionSuggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionSuggestions[mentionIndex]);
        return;
      }
    }

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

  // Render text with @mentions highlighted
  const renderTextWithMentions = useCallback((text: string) => {
    const segments = parseTextWithMentions(text, teamMembers);
    return segments.map((segment, i) => {
      if (segment.type === 'mention') {
        const displayName = segment.user
          ? `@${segment.user.firstName}${segment.user.lastName ? ' ' + segment.user.lastName : ''}`
          : segment.content;
        const title = segment.user
          ? `${segment.user.firstName} ${segment.user.lastName}`.trim()
          : segment.username;
        return (
          <span
            key={i}
            className={`comment-mention${segment.user ? ' comment-mention--matched' : ''}`}
            title={title}
          >
            {displayName}
          </span>
        );
      }
      return <React.Fragment key={i}>{segment.content}</React.Fragment>;
    });
  }, [teamMembers]);

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
          <p className="comment-entry__text">{renderTextWithMentions(entry.text)}</p>
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
        {/* Mention autocomplete dropdown */}
        {mentionQuery !== null && mentionSuggestions.length > 0 && (
          <div className="mention-autocomplete">
            {mentionSuggestions.map((user, i) => (
              <button
                key={user.userId}
                className={`mention-autocomplete__item ${i === mentionIndex ? 'mention-autocomplete__item--active' : ''}`}
                onClick={() => insertMention(user)}
                onMouseEnter={() => setMentionIndex(i)}
              >
                {user.thumbnail ? (
                  <img src={user.thumbnail} alt="" className="mention-autocomplete__avatar" />
                ) : (
                  <span className="mention-autocomplete__avatar-placeholder">
                    {user.firstName?.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="mention-autocomplete__name">
                  {user.firstName} {user.lastName}
                </span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={inputRef}
          placeholder="Reply... (use @ to mention)"
          value={replyText}
          onChange={handleReplyChange}
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
