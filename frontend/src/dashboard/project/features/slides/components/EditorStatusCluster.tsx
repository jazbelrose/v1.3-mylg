/**
 * EditorStatusCluster.tsx - Right-side status and collaboration controls
 * 
 * Contains:
 * - Comment pins visibility toggle (with pin icon, not eye)
 * - Comments panel button (opens thread list/sidebar) with badge
 * - Lock/Edit state toggle
 */
import React, { useCallback, useEffect } from 'react';
import { MapPin, MapPinOff, MessageCircle, Lock, Unlock } from 'lucide-react';
import './EditorStatusCluster.css';

interface EditorStatusClusterProps {
  /** Whether comment pins are visible on the canvas */
  showPins: boolean;
  onShowPinsChange: (show: boolean) => void;
  
  /** Whether editing is allowed */
  canEdit: boolean;
  onCanEditChange: (canEdit: boolean) => void;
  
  /** Count of open comments (for badge) */
  openCommentCount?: number;
  
  /** Callback to open comments panel/sidebar */
  onOpenCommentsPanel?: () => void;
  
  /** Whether a comment thread popover is open (for Esc handling) */
  hasOpenPopover?: boolean;
  onClosePopover?: () => void;
  
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

const EditorStatusCluster: React.FC<EditorStatusClusterProps> = ({
  showPins,
  onShowPinsChange,
  canEdit,
  onCanEditChange,
  openCommentCount = 0,
  onOpenCommentsPanel,
  hasOpenPopover = false,
  onClosePopover,
  disabled = false,
}) => {
  // Esc key handling for closing popovers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && hasOpenPopover) {
        // Allow Esc even in editable targets for closing popovers
        e.preventDefault();
        onClosePopover?.();
      }
      
      // P key toggles pins visibility (when not typing)
      if (!isEditableTarget(e.target) && e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onShowPinsChange(!showPins);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasOpenPopover, onClosePopover, showPins, onShowPinsChange]);

  const handlePinsToggle = useCallback(() => {
    onShowPinsChange(!showPins);
  }, [showPins, onShowPinsChange]);

  const handleLockToggle = useCallback(() => {
    onCanEditChange(!canEdit);
  }, [canEdit, onCanEditChange]);

  return (
    <div className="editor-status-cluster">
      {/* Pins visibility toggle */}
      <button
        type="button"
        className={`editor-status-cluster__btn${showPins ? ' is-active' : ''}`}
        onClick={handlePinsToggle}
        disabled={disabled}
        title={showPins ? 'Hide pins (P)' : 'Show pins (P)'}
        aria-pressed={showPins}
        aria-label={showPins ? 'Hide comment pins' : 'Show comment pins'}
      >
        {showPins ? <MapPin size={16} /> : <MapPinOff size={16} />}
      </button>

      {/* Comments panel button with badge */}
      {onOpenCommentsPanel && (
        <button
          type="button"
          className="editor-status-cluster__btn editor-status-cluster__btn--panel"
          onClick={onOpenCommentsPanel}
          disabled={disabled}
          title="Comments"
          aria-label={`Comments${openCommentCount > 0 ? ` (${openCommentCount} open)` : ''}`}
        >
          <MessageCircle size={16} />
          {openCommentCount > 0 && (
            <span className="editor-status-cluster__badge">{openCommentCount}</span>
          )}
        </button>
      )}

      <div className="editor-status-cluster__divider" />

      {/* Lock/Edit toggle */}
      <button
        type="button"
        className={`editor-status-cluster__btn editor-status-cluster__btn--lock${!canEdit ? ' is-locked' : ''}`}
        onClick={handleLockToggle}
        disabled={disabled}
        title={canEdit ? 'Lock editing' : 'Unlock editing'}
        aria-pressed={!canEdit}
        aria-label={canEdit ? 'Currently editing - click to lock' : 'Currently locked - click to unlock'}
      >
        {canEdit ? <Unlock size={16} /> : <Lock size={16} />}
        <span className="editor-status-cluster__label">
          {canEdit ? 'Editing' : 'Locked'}
        </span>
      </button>
    </div>
  );
};

export default EditorStatusCluster;
