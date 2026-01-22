// components/EditorModeToggle.tsx - View/Edit/Comment mode toggle
import React from 'react';
import { Eye, Edit3, MessageSquare } from 'lucide-react';
import { SlideEditorMode } from '../lib/commentsTypes';
import './EditorModeToggle.css';

interface EditorModeToggleProps {
  mode: SlideEditorMode;
  onModeChange: (mode: SlideEditorMode) => void;
  openCommentCount?: number;
  disabled?: boolean;
}

const EditorModeToggle: React.FC<EditorModeToggleProps> = ({
  mode,
  onModeChange,
  openCommentCount = 0,
  disabled = false,
}) => {
  const modes: Array<{ id: SlideEditorMode; icon: React.ReactNode; label: string; shortcut?: string }> = [
    { id: 'view', icon: <Eye size={16} />, label: 'View', shortcut: 'V' },
    { id: 'edit', icon: <Edit3 size={16} />, label: 'Edit', shortcut: 'E' },
    { id: 'comment', icon: <MessageSquare size={16} />, label: 'Comment', shortcut: 'C' },
  ];

  return (
    <div className="editor-mode-toggle" role="tablist" aria-label="Editor mode">
      {modes.map(({ id, icon, label, shortcut }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={mode === id}
          aria-label={`${label} mode${shortcut ? ` (${shortcut})` : ''}`}
          className={`editor-mode-toggle__button${mode === id ? ' is-active' : ''}`}
          onClick={() => onModeChange(id)}
          disabled={disabled}
          title={`${label}${shortcut ? ` (${shortcut})` : ''}`}
        >
          {icon}
          <span className="editor-mode-toggle__label">{label}</span>
          {id === 'comment' && openCommentCount > 0 && (
            <span className="editor-mode-toggle__badge">{openCommentCount}</span>
          )}
        </button>
      ))}
    </div>
  );
};

export default EditorModeToggle;
