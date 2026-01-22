/**
 * ToolModeGroup.tsx - Compact tool selector for slide editor
 * 
 * Renders icon-only buttons with tooltips for the active tool.
 * Goes on the LEFT side of the toolbar with other creation tools.
 */
import React, { useCallback, useEffect } from 'react';
import { MousePointer2, MessageCirclePlus } from 'lucide-react';
import type { EditorTool } from '../lib/commentsTypes';
import './ToolModeGroup.css';

interface ToolModeGroupProps {
  activeTool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  disabled?: boolean;
}

/**
 * Check if an event target is an editable element
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea') return true;
  if (target.isContentEditable) return true;
  if (target.closest('[contenteditable="true"]')) return true;
  return false;
}

const ToolModeGroup: React.FC<ToolModeGroupProps> = ({
  activeTool,
  onToolChange,
  disabled = false,
}) => {
  // Global keyboard shortcuts: V, C
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case 'v':
          e.preventDefault();
          onToolChange('select');
          break;
        case 'c':
          e.preventDefault();
          onToolChange(activeTool === 'comment' ? 'select' : 'comment');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, onToolChange]);

  const handleSelectClick = useCallback(() => {
    onToolChange('select');
  }, [onToolChange]);

  const handleCommentClick = useCallback(() => {
    onToolChange(activeTool === 'comment' ? 'select' : 'comment');
  }, [activeTool, onToolChange]);

  return (
    <div className="tool-mode-group" role="radiogroup" aria-label="Editor tool">
      <button
        type="button"
        role="radio"
        aria-checked={activeTool === 'select'}
        className={`tool-mode-group__btn${activeTool === 'select' ? ' is-active' : ''}`}
        onClick={handleSelectClick}
        disabled={disabled}
        title="Select (V)"
        aria-label="Select tool"
      >
        <MousePointer2 size={16} />
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={activeTool === 'comment'}
        className={`tool-mode-group__btn${activeTool === 'comment' ? ' is-active' : ''}`}
        onClick={handleCommentClick}
        disabled={disabled}
        title="Add comment (C)"
        aria-label="Add comment tool"
      >
        <MessageCirclePlus size={16} />
      </button>
    </div>
  );
};

export default ToolModeGroup;
