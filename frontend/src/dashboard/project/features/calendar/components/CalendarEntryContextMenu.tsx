/**
 * CalendarEntryContextMenu.tsx
 *
 * Right-click context menu for calendar entries (tasks and events).
 * Supports single and multi-selection actions.
 * Provides quick actions: Submit for Review, Mark as Done, Duplicate, Delete.
 */

import React, { useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Send, CheckCircle, Copy, Trash2, Pencil, Layers } from "lucide-react";
import type { CalendarTask, CalendarEvent } from "../utils";
import type { CalendarEntryType } from "./calendarInteractions";

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface ContextMenuEntry {
  entryType: CalendarEntryType;
  entry: CalendarTask | CalendarEvent;
}

export interface CalendarEntryContextMenuProps {
  position: ContextMenuPosition;
  /** Primary entry (right-clicked entry) */
  entryType: CalendarEntryType;
  entry: CalendarTask | CalendarEvent;
  /** All selected entries for bulk actions */
  selectedEntries?: ContextMenuEntry[];
  onClose: () => void;
  onEdit?: (entry: CalendarTask | CalendarEvent) => void;
  onSubmitForReview?: (entries: CalendarTask[]) => void;
  onMarkAsDone?: (entries: CalendarTask[]) => void;
  onConvertToFocusBlock?: (entries: CalendarTask[]) => void;
  onDuplicate?: (entries: ContextMenuEntry[]) => void;
  onDelete?: (entries: ContextMenuEntry[]) => void;
}

export const CalendarEntryContextMenu: React.FC<CalendarEntryContextMenuProps> = ({
  position,
  entryType,
  entry,
  selectedEntries = [],
  onClose,
  onEdit,
  onSubmitForReview,
  onMarkAsDone,
  onConvertToFocusBlock,
  onDuplicate,
  onDelete,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Determine if we're in multi-select mode
  const effectiveEntries: ContextMenuEntry[] = useMemo(
    () =>
      selectedEntries.length > 0
        ? selectedEntries
        : [{ entryType, entry }],
    [selectedEntries, entryType, entry]
  );
  
  const selectionCount = effectiveEntries.length;
  const isMultiSelect = selectionCount > 1;

  // For multi-select, check if we have any tasks that can be actioned
  const actionableTasks = useMemo(
    () =>
      effectiveEntries
        .filter((e) => e.entryType === "task")
        .map((e) => e.entry as CalendarTask),
    [effectiveEntries]
  );
  
  const tasksForReview = useMemo(
    () => actionableTasks.filter((t) => t.status !== "in_review" && t.status !== "done"),
    [actionableTasks]
  );
  const tasksForDone = useMemo(
    () => actionableTasks.filter((t) => t.status !== "done"),
    [actionableTasks]
  );

  const focusBlockCandidates = useMemo(() => {
    return actionableTasks.filter((t) => {
      if (t.kind === "intent") return false;
      if (t.kind === "focus_block") return false;
      if (t.focusBlockId) return false;
      return true;
    });
  }, [actionableTasks]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = position.x;
    let adjustedY = position.y;

    // Keep menu within horizontal bounds
    if (rect.right > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 8;
    }
    if (adjustedX < 8) {
      adjustedX = 8;
    }

    // Keep menu within vertical bounds
    if (rect.bottom > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 8;
    }
    if (adjustedY < 8) {
      adjustedY = 8;
    }

    menu.style.left = `${adjustedX}px`;
    menu.style.top = `${adjustedY}px`;
  }, [position]);

  const handleEdit = useCallback(() => {
    if (onEdit) {
      onEdit(entry);
    }
    onClose();
  }, [entry, onEdit, onClose]);

  const handleSubmitForReview = useCallback(() => {
    if (onSubmitForReview && tasksForReview.length > 0) {
      onSubmitForReview(tasksForReview);
    }
    onClose();
  }, [tasksForReview, onSubmitForReview, onClose]);

  const handleMarkAsDone = useCallback(() => {
    if (onMarkAsDone && tasksForDone.length > 0) {
      onMarkAsDone(tasksForDone);
    }
    onClose();
  }, [tasksForDone, onMarkAsDone, onClose]);

  const handleConvertToFocusBlock = useCallback(() => {
    if (onConvertToFocusBlock && focusBlockCandidates.length >= 2) {
      onConvertToFocusBlock(focusBlockCandidates);
    }
    onClose();
  }, [focusBlockCandidates, onConvertToFocusBlock, onClose]);

  const handleDuplicate = useCallback(() => {
    if (onDuplicate) {
      onDuplicate(effectiveEntries);
    }
    onClose();
  }, [effectiveEntries, onDuplicate, onClose]);

  const handleDelete = useCallback(() => {
    if (onDelete) {
      onDelete(effectiveEntries);
    }
    onClose();
  }, [effectiveEntries, onDelete, onClose]);

  // Build label suffix for multi-select
  const countSuffix = isMultiSelect ? ` (${selectionCount})` : "";

  const menuContent = (
    <div
      ref={menuRef}
      className="calendar-entry-context-menu"
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 9999,
      }}
      role="menu"
      aria-label="Entry actions"
    >
      {/* Edit - only for single selection */}
      {!isMultiSelect && onEdit && (
        <button
          type="button"
          className="calendar-entry-context-menu__item"
          onClick={handleEdit}
          role="menuitem"
        >
          <Pencil className="calendar-entry-context-menu__icon" />
          <span>Edit</span>
        </button>
      )}

      {/* Submit for Review - for tasks not in review/done */}
      {tasksForReview.length > 0 && onSubmitForReview && (
        <button
          type="button"
          className="calendar-entry-context-menu__item"
          onClick={handleSubmitForReview}
          role="menuitem"
        >
          <Send className="calendar-entry-context-menu__icon" />
          <span>Submit for Review{isMultiSelect && tasksForReview.length > 0 ? ` (${tasksForReview.length})` : ""}</span>
        </button>
      )}

      {/* Mark as Done - for tasks not done */}
      {tasksForDone.length > 0 && onMarkAsDone && (
        <button
          type="button"
          className="calendar-entry-context-menu__item"
          onClick={handleMarkAsDone}
          role="menuitem"
        >
          <CheckCircle className="calendar-entry-context-menu__icon" />
          <span>Mark as Done{isMultiSelect && tasksForDone.length > 0 ? ` (${tasksForDone.length})` : ""}</span>
        </button>
      )}

      {/* Convert selected tasks into a Focus Block */}
      {onConvertToFocusBlock && focusBlockCandidates.length >= 2 && (
        <button
          type="button"
          className="calendar-entry-context-menu__item"
          onClick={handleConvertToFocusBlock}
          role="menuitem"
        >
          <Layers className="calendar-entry-context-menu__icon" />
          <span>Convert to Focus Block ({focusBlockCandidates.length})</span>
        </button>
      )}

      {/* Duplicate */}
      {onDuplicate && (
        <button
          type="button"
          className="calendar-entry-context-menu__item"
          onClick={handleDuplicate}
          role="menuitem"
        >
          <Copy className="calendar-entry-context-menu__icon" />
          <span>Duplicate{countSuffix}</span>
        </button>
      )}

      {/* Delete */}
      {onDelete && (
        <>
          <div className="calendar-entry-context-menu__separator" />
          <button
            type="button"
            className="calendar-entry-context-menu__item calendar-entry-context-menu__item--danger"
            onClick={handleDelete}
            role="menuitem"
          >
            <Trash2 className="calendar-entry-context-menu__icon" />
            <span>Delete{countSuffix}</span>
          </button>
        </>
      )}
    </div>
  );

  return createPortal(menuContent, document.body);
};

export default CalendarEntryContextMenu;
