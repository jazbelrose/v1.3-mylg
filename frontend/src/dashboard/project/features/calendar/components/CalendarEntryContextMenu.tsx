/**
 * CalendarEntryContextMenu.tsx
 *
 * Right-click context menu for calendar entries (tasks and events).
 * Provides quick actions: Submit for Review, Mark as Done, Save Changes, Delete.
 */

import React, { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Send, CheckCircle, Save, Trash2 } from "lucide-react";
import type { CalendarTask, CalendarEvent } from "../utils";
import type { CalendarEntryType } from "./calendarInteractions";

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface CalendarEntryContextMenuProps {
  position: ContextMenuPosition;
  entryType: CalendarEntryType;
  entry: CalendarTask | CalendarEvent;
  onClose: () => void;
  onSubmitForReview?: (entry: CalendarTask) => void;
  onMarkAsDone?: (entry: CalendarTask) => void;
  onSaveChanges?: (entry: CalendarTask | CalendarEvent) => void;
  onDelete?: (entryType: CalendarEntryType, entry: CalendarTask | CalendarEvent) => void;
}

export const CalendarEntryContextMenu: React.FC<CalendarEntryContextMenuProps> = ({
  position,
  entryType,
  entry,
  onClose,
  onSubmitForReview,
  onMarkAsDone,
  onSaveChanges,
  onDelete,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

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

  const isTask = entryType === "task";
  const task = isTask ? (entry as CalendarTask) : null;

  const handleSubmitForReview = useCallback(() => {
    if (task && onSubmitForReview) {
      onSubmitForReview(task);
    }
    onClose();
  }, [task, onSubmitForReview, onClose]);

  const handleMarkAsDone = useCallback(() => {
    if (task && onMarkAsDone) {
      onMarkAsDone(task);
    }
    onClose();
  }, [task, onMarkAsDone, onClose]);

  const handleSaveChanges = useCallback(() => {
    if (onSaveChanges) {
      onSaveChanges(entry);
    }
    onClose();
  }, [entry, onSaveChanges, onClose]);

  const handleDelete = useCallback(() => {
    if (onDelete) {
      onDelete(entryType, entry);
    }
    onClose();
  }, [entryType, entry, onDelete, onClose]);

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
      {isTask && task && (
        <>
          {/* Only show Submit for Review if task is not already in review or done */}
          {task.status !== "in_review" && task.status !== "done" && onSubmitForReview && (
            <button
              type="button"
              className="calendar-entry-context-menu__item"
              onClick={handleSubmitForReview}
              role="menuitem"
            >
              <Send className="calendar-entry-context-menu__icon" />
              <span>Submit for Review</span>
            </button>
          )}

          {/* Only show Mark as Done if task is not already done */}
          {task.status !== "done" && onMarkAsDone && (
            <button
              type="button"
              className="calendar-entry-context-menu__item"
              onClick={handleMarkAsDone}
              role="menuitem"
            >
              <CheckCircle className="calendar-entry-context-menu__icon" />
              <span>Mark as Done</span>
            </button>
          )}
        </>
      )}

      {onSaveChanges && (
        <button
          type="button"
          className="calendar-entry-context-menu__item"
          onClick={handleSaveChanges}
          role="menuitem"
        >
          <Save className="calendar-entry-context-menu__icon" />
          <span>Save Changes</span>
        </button>
      )}

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
            <span>Delete</span>
          </button>
        </>
      )}
    </div>
  );

  return createPortal(menuContent, document.body);
};

export default CalendarEntryContextMenu;
