/**
 * CalendarEntryPopover.tsx
 *
 * Inspector-lite popover for single-click selection on calendar entries.
 * Shows entry details and quick actions without opening the full edit modal.
 */

import React, { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Send,
  CheckCircle,
  Copy,
  Trash2,
  Pencil,
  Clock,
  User,
  Calendar,
} from "lucide-react";
import type { CalendarTask, CalendarEvent } from "../utils";
import type { CalendarEntryType } from "./calendarInteractions";

import type { ContextMenuEntry } from "./CalendarEntryContextMenu";

export interface CalendarEntryPopoverProps {
  anchorElement: HTMLElement;
  entryType: CalendarEntryType;
  entry: CalendarTask | CalendarEvent;
  selectedCount: number;
  onClose: () => void;
  onEdit: () => void;
  onSubmitForReview?: (tasks: CalendarTask[]) => void;
  onMarkAsDone?: (tasks: CalendarTask[]) => void;
  onDuplicate?: (entries: ContextMenuEntry[]) => void;
  onDelete?: (entries: ContextMenuEntry[]) => void;
}

export const CalendarEntryPopover: React.FC<CalendarEntryPopoverProps> = ({
  anchorElement,
  entryType,
  entry,
  selectedCount,
  onClose,
  onEdit,
  onSubmitForReview,
  onMarkAsDone,
  onDuplicate,
  onDelete,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Position calculation
  useEffect(() => {
    if (!popoverRef.current || !anchorElement) return;

    const popover = popoverRef.current;
    const anchorRect = anchorElement.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Default: position to the right of the anchor
    let left = anchorRect.right + 8;
    let top = anchorRect.top;

    // If not enough space on the right, try left
    if (left + popoverRect.width > viewportWidth - 16) {
      left = anchorRect.left - popoverRect.width - 8;
    }

    // If still overflows, center it
    if (left < 16) {
      left = Math.max(16, (viewportWidth - popoverRect.width) / 2);
    }

    // Vertical adjustment
    if (top + popoverRect.height > viewportHeight - 16) {
      top = viewportHeight - popoverRect.height - 16;
    }
    if (top < 16) {
      top = 16;
    }

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }, [anchorElement]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        !anchorElement.contains(target)
      ) {
        onClose();
      }
    };

    // Delay adding listener to avoid immediate close
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [anchorElement, onClose]);

  const isTask = entryType === "task";
  const task = isTask ? (entry as CalendarTask) : null;
  const event = !isTask ? (entry as CalendarEvent) : null;

  const title = isTask ? task?.title : event?.title;
  const timeLabel = isTask
    ? task?.start && task?.end
      ? `${task.start} - ${task.end}`
      : task?.start || "No time set"
    : event?.start && event?.end
    ? `${event.start} - ${event.end}`
    : event?.allDay
    ? "All day"
    : event?.start || "No time set";

  const handleEdit = useCallback(() => {
    onEdit();
    onClose();
  }, [onEdit, onClose]);

  const handleSubmitForReview = useCallback(() => {
    if (task && onSubmitForReview) {
      onSubmitForReview([task]);
    }
    onClose();
  }, [task, onSubmitForReview, onClose]);

  const handleMarkAsDone = useCallback(() => {
    if (task && onMarkAsDone) {
      onMarkAsDone([task]);
    }
    onClose();
  }, [task, onMarkAsDone, onClose]);

  const handleDuplicate = useCallback(() => {
    if (onDuplicate) {
      onDuplicate([{ entryType, entry }]);
    }
    onClose();
  }, [entryType, entry, onDuplicate, onClose]);

  const handleDelete = useCallback(() => {
    if (onDelete) {
      onDelete([{ entryType, entry }]);
    }
    onClose();
  }, [entryType, entry, onDelete, onClose]);

  const popoverContent = (
    <div
      ref={popoverRef}
      className="calendar-entry-popover"
      role="dialog"
      aria-label="Entry details"
    >
      {/* Header with title */}
      <div className="calendar-entry-popover__header">
        <button
          type="button"
          className="calendar-entry-popover__title-btn"
          onClick={handleEdit}
          title="Click to edit"
        >
          <span className="calendar-entry-popover__title">{title}</span>
          <Pencil className="calendar-entry-popover__edit-icon" />
        </button>
        {selectedCount > 1 && (
          <span className="calendar-entry-popover__badge">
            +{selectedCount - 1} more
          </span>
        )}
      </div>

      {/* Details */}
      <div className="calendar-entry-popover__details">
        <div className="calendar-entry-popover__detail-row">
          <Clock className="calendar-entry-popover__detail-icon" />
          <span>{timeLabel}</span>
        </div>
        {isTask && task?.due && (
          <div className="calendar-entry-popover__detail-row">
            <Calendar className="calendar-entry-popover__detail-icon" />
            <span>{task.due}</span>
          </div>
        )}
        {isTask && task?.assignedTo && (
          <div className="calendar-entry-popover__detail-row">
            <User className="calendar-entry-popover__detail-icon" />
            <span>{task.assignedTo}</span>
          </div>
        )}
        {isTask && task?.status && (
          <div className="calendar-entry-popover__detail-row">
            <span
              className={`calendar-entry-popover__status calendar-entry-popover__status--${task.status}`}
            >
              {task.status.replace(/_/g, " ")}
            </span>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="calendar-entry-popover__actions">
        {isTask && task && task.status !== "in_review" && task.status !== "done" && onSubmitForReview && (
          <button
            type="button"
            className="calendar-entry-popover__action"
            onClick={handleSubmitForReview}
            title="Submit for Review"
          >
            <Send className="calendar-entry-popover__action-icon" />
            <span>Review</span>
          </button>
        )}
        {isTask && task && task.status !== "done" && onMarkAsDone && (
          <button
            type="button"
            className="calendar-entry-popover__action calendar-entry-popover__action--success"
            onClick={handleMarkAsDone}
            title="Mark as Done"
          >
            <CheckCircle className="calendar-entry-popover__action-icon" />
            <span>Done</span>
          </button>
        )}
        {onDuplicate && (
          <button
            type="button"
            className="calendar-entry-popover__action"
            onClick={handleDuplicate}
            title="Duplicate"
          >
            <Copy className="calendar-entry-popover__action-icon" />
            <span>Copy</span>
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className="calendar-entry-popover__action calendar-entry-popover__action--danger"
            onClick={handleDelete}
            title="Delete"
          >
            <Trash2 className="calendar-entry-popover__action-icon" />
            <span>Delete</span>
          </button>
        )}
      </div>
    </div>
  );

  return createPortal(popoverContent, document.body);
};

export default CalendarEntryPopover;
