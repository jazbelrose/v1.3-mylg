/**
 * SpeakerNotesPanel.tsx - Collapsible panel for speaker notes
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, StickyNote } from 'lucide-react';
import './SpeakerNotesPanel.css';

interface SpeakerNotesPanelProps {
  notes: string;
  onChange: (notes: string) => void;
  isExpanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export const SpeakerNotesPanel: React.FC<SpeakerNotesPanelProps> = ({
  notes,
  onChange,
  isExpanded,
  onToggle,
  disabled = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localNotes, setLocalNotes] = useState(notes);

  // Sync with prop changes (e.g., when switching slides)
  useEffect(() => {
    setLocalNotes(notes);
  }, [notes]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current && isExpanded) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [localNotes, isExpanded]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setLocalNotes(value);
    onChange(value);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Allow tab to insert tab character
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const value = e.currentTarget.value;
      const newValue = value.substring(0, start) + '\t' + value.substring(end);
      setLocalNotes(newValue);
      onChange(newValue);
      // Set cursor position after tab
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 1;
        }
      }, 0);
    }
  }, [onChange]);

  const hasNotes = notes.trim().length > 0;

  return (
    <div className={`speaker-notes-panel ${isExpanded ? 'speaker-notes-panel--expanded' : ''}`}>
      <button
        type="button"
        className="speaker-notes-panel__header"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls="speaker-notes-content"
      >
        <div className="speaker-notes-panel__header-left">
          <StickyNote size={16} />
          <span className="speaker-notes-panel__title">Speaker Notes</span>
          {!isExpanded && hasNotes && (
            <span className="speaker-notes-panel__indicator" title="Has notes">•</span>
          )}
        </div>
        {isExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>

      {isExpanded && (
        <div id="speaker-notes-content" className="speaker-notes-panel__content">
          <textarea
            ref={textareaRef}
            className="speaker-notes-panel__textarea"
            value={localNotes}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Add speaker notes for this slide... (only visible in presenter view)"
            disabled={disabled}
            rows={3}
          />
          <div className="speaker-notes-panel__footer">
            <span className="speaker-notes-panel__hint">
              Press Alt+N to toggle • Notes are saved automatically
            </span>
            <span className="speaker-notes-panel__char-count">
              {localNotes.length} chars
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpeakerNotesPanel;
