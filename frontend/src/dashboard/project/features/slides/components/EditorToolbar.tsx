/**
 * EditorToolbar.tsx - Clean tool/permission controls for the slide editor
 * 
 * Implements a clear mental model:
 * - Tools: Select (V) vs Comment (C) - what happens when you click
 * - Permission: Can Edit toggle - whether modifications are allowed
 * - Comments visibility toggle when in Select mode
 */
import React, { useCallback, useEffect } from 'react';
import { MousePointer2, MessageSquare, Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import type { EditorTool } from '../lib/commentsTypes';
import './EditorToolbar.css';

interface EditorToolbarProps {
  /** Currently active tool */
  activeTool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  
  /** Whether editing is allowed */
  canEdit: boolean;
  onCanEditChange: (canEdit: boolean) => void;
  
  /** Whether to show comment pins when in Select mode */
  showComments: boolean;
  onShowCommentsChange: (show: boolean) => void;
  
  /** Count of open comments (for badge) */
  openCommentCount?: number;
  
  /** Disabled state */
  disabled?: boolean;
  
  /** Whether a comment thread popover is open */
  hasOpenPopover?: boolean;
  
  /** Callback to close any open popover */
  onClosePopover?: () => void;
  
  /** Callback to clear selection */
  onClearSelection?: () => void;
}

/**
 * Check if an event target is an editable element (input, textarea, contenteditable)
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea') return true;
  if (target.isContentEditable) return true;
  // Check for Lexical editor
  if (target.closest('[contenteditable="true"]')) return true;
  return false;
}

const EditorToolbar: React.FC<EditorToolbarProps> = ({
  activeTool,
  onToolChange,
  canEdit,
  onCanEditChange,
  showComments,
  onShowCommentsChange,
  openCommentCount = 0,
  disabled = false,
  hasOpenPopover = false,
  onClosePopover,
  onClearSelection,
}) => {
  // Global keyboard shortcuts: V, C, Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input field
      if (isEditableTarget(e.target)) {
        // Exception: Esc should still work to close popovers
        if (e.key === 'Escape' && hasOpenPopover) {
          e.preventDefault();
          onClosePopover?.();
        }
        return;
      }

      // Ignore if modifier keys are held (except for shortcuts that use them)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case 'v':
          e.preventDefault();
          onToolChange('select');
          break;
        case 'c':
          // Only switch to comment if not already in comment mode
          // (prevents conflict with copy shortcut which uses Ctrl+C)
          e.preventDefault();
          if (activeTool === 'comment') {
            // Toggle off - return to select
            onToolChange('select');
          } else {
            onToolChange('comment');
          }
          break;
        case 'escape':
          e.preventDefault();
          // Priority order:
          // 1. Close any open popover
          // 2. Exit comment tool → return to select
          // 3. Clear selection
          if (hasOpenPopover) {
            onClosePopover?.();
          } else if (activeTool === 'comment') {
            onToolChange('select');
          } else {
            onClearSelection?.();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, onToolChange, hasOpenPopover, onClosePopover, onClearSelection]);

  const handleSelectClick = useCallback(() => {
    onToolChange('select');
  }, [onToolChange]);

  const handleCommentClick = useCallback(() => {
    // Toggle: if already in comment mode, return to select
    if (activeTool === 'comment') {
      onToolChange('select');
    } else {
      onToolChange('comment');
    }
  }, [activeTool, onToolChange]);

  const handleCanEditToggle = useCallback(() => {
    onCanEditChange(!canEdit);
  }, [canEdit, onCanEditChange]);

  const handleShowCommentsToggle = useCallback(() => {
    onShowCommentsChange(!showComments);
  }, [showComments, onShowCommentsChange]);

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Editor tools">
      {/* Tool selection: Select vs Comment */}
      <div className="editor-toolbar__tools" role="radiogroup" aria-label="Active tool">
        <button
          type="button"
          role="radio"
          aria-checked={activeTool === 'select'}
          className={`editor-toolbar__tool${activeTool === 'select' ? ' is-active' : ''}`}
          onClick={handleSelectClick}
          disabled={disabled}
          title="Select tool (V)"
        >
          <MousePointer2 size={16} />
          <span className="editor-toolbar__label">Select</span>
          <kbd className="editor-toolbar__shortcut">V</kbd>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={activeTool === 'comment'}
          className={`editor-toolbar__tool${activeTool === 'comment' ? ' is-active' : ''}`}
          onClick={handleCommentClick}
          disabled={disabled}
          title="Comment tool (C) - click to place comments"
        >
          <MessageSquare size={16} />
          <span className="editor-toolbar__label">Comment</span>
          <kbd className="editor-toolbar__shortcut">C</kbd>
          {openCommentCount > 0 && (
            <span className="editor-toolbar__badge">{openCommentCount}</span>
          )}
        </button>
      </div>

      <div className="editor-toolbar__divider" />

      {/* Show/Hide comments toggle (only visible when not in comment mode) */}
      {activeTool === 'select' && (
        <button
          type="button"
          className={`editor-toolbar__toggle${showComments ? ' is-active' : ''}`}
          onClick={handleShowCommentsToggle}
          disabled={disabled}
          title={showComments ? 'Hide comments' : 'Show comments'}
          aria-pressed={showComments}
        >
          {showComments ? <Eye size={16} /> : <EyeOff size={16} />}
          <span className="editor-toolbar__label sr-only">
            {showComments ? 'Comments visible' : 'Comments hidden'}
          </span>
        </button>
      )}

      {/* Can Edit / View Only toggle */}
      <button
        type="button"
        className={`editor-toolbar__toggle editor-toolbar__toggle--lock${!canEdit ? ' is-locked' : ''}`}
        onClick={handleCanEditToggle}
        disabled={disabled}
        title={canEdit ? 'Lock editing (view only)' : 'Unlock editing'}
        aria-pressed={!canEdit}
      >
        {canEdit ? <Unlock size={16} /> : <Lock size={16} />}
        <span className="editor-toolbar__label">
          {canEdit ? 'Editing' : 'View Only'}
        </span>
      </button>
    </div>
  );
};

export default EditorToolbar;
