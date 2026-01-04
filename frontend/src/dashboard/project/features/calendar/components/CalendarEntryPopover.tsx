/**
 * CalendarEntryPopover.tsx
 *
 * Inspector-lite popover for single-click selection on calendar entries.
 * Shows entry details and quick actions without opening the full edit modal.
 */

import React, { useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Send,
  CheckCircle,
  Copy,
  Trash2,
  Pencil,
  Clock,
  Calendar,
} from "lucide-react";
import type { CalendarTask, CalendarEvent } from "../utils";
import type { CalendarEntryType } from "./calendarInteractions";
import type { TeamMember as ProjectTeamMember } from "@/dashboard/project/components/Shared/types";
import ProjectAvatar from "@/shared/ui/ProjectAvatar";
import {
  buildTeamMemberLookup,
  buildTaskAvatars,
  buildEventAvatars,
  parseAssigneeUserId,
  type TimelineAvatar,
} from "./timelineLayout";
import { formatAssigneeDisplay } from "@/dashboard/project/components/Tasks/utils";

import type { ContextMenuEntry } from "./CalendarEntryContextMenu";

export interface CalendarEntryPopoverProps {
  anchorElement: HTMLElement;
  entryType: CalendarEntryType;
  entry: CalendarTask | CalendarEvent;
  selectedCount: number;
  teamMembers?: ProjectTeamMember[];
  focusChildren?: CalendarTask[];
  onClose: () => void;
  onEdit: () => void;
  onEditFocusChild?: (task: CalendarTask) => void;
  onOpenFocusChildContextMenu?: (task: CalendarTask, event: React.MouseEvent<HTMLElement>) => void;
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
  teamMembers,
  focusChildren,
  onClose,
  onEdit,
  onEditFocusChild,
  onOpenFocusChildContextMenu,
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
      const targetElement = target instanceof HTMLElement ? target : null;

      // If the user is interacting with the context menu, don't treat it as an outside click.
      if (targetElement?.closest(".calendar-entry-context-menu")) {
        return;
      }
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

  // Helper to detect Focus Blocks (by kind OR by having child task references for legacy support)
  const isFocusBlock = useMemo(() => {
    if (!isTask || !task) return false;
    if (task.kind === "focus_block") return true;
    const hasChildren = (task.focusChildTaskIds && task.focusChildTaskIds.length > 0) ||
      (task.focusChecklist && task.focusChecklist.length > 0);
    return hasChildren;
  }, [isTask, task]);

  const focusChildrenResolved = useMemo(() => {
    if (!isTask || !task) return [];
    if (!isFocusBlock) return [];
    return focusChildren ?? [];
  }, [focusChildren, isFocusBlock, isTask, task]);

  const rawTitle = isTask ? task?.title : event?.title;
  const title = useMemo(() => {
    if (!isTask || !task) return rawTitle;
    if (!isFocusBlock) return rawTitle;
    const normalized = (rawTitle ?? "").trim();
    if (!normalized || normalized.toLowerCase() === "focus block") {
      return focusChildrenResolved[0]?.title ?? rawTitle;
    }
    return rawTitle;
  }, [focusChildrenResolved, isFocusBlock, isTask, rawTitle, task]);
  const timeLabel = isTask
    ? task?.start && task?.end
      ? `${task.start} - ${task.end}`
      : task?.start || "No time set"
    : event?.start && event?.end
    ? `${event.start} - ${event.end}`
    : event?.allDay
    ? "All day"
    : event?.start || "No time set";

  // Build team member lookup for avatar resolution
  const memberLookup = useMemo(
    () => buildTeamMemberLookup(teamMembers),
    [teamMembers]
  );

  // Build avatars (overlapped stack like calendar blocks)
  const avatars: TimelineAvatar[] = useMemo(() => {
    if (isTask && task) {
      return buildTaskAvatars(task, memberLookup);
    }
    if (!isTask && event) {
      return buildEventAvatars(event, memberLookup);
    }
    return [];
  }, [isTask, task, event, memberLookup]);

  // Get formatted assignee names (not user IDs)
  const assigneeNames = useMemo(() => {
    if (!isTask || !task) return null;
    const names: string[] = [];
    
    // Check assignedTo
    if (task.assignedTo) {
      const userId = parseAssigneeUserId(task.assignedTo);
      if (userId && memberLookup.byId.has(userId)) {
        const member = memberLookup.byId.get(userId)!;
        const name = `${member.firstName || ""} ${member.lastName || ""}`.trim();
        if (name) names.push(name);
      } else {
        const formatted = formatAssigneeDisplay(task.assignedTo);
        if (formatted) names.push(formatted);
      }
    }
    
    // Check assigneeIds for additional assignees
    task.assigneeIds?.forEach((assigneeId) => {
      if (names.length >= 3) return; // Limit to 3 names
      const userId = parseAssigneeUserId(assigneeId);
      if (userId && memberLookup.byId.has(userId)) {
        const member = memberLookup.byId.get(userId)!;
        const name = `${member.firstName || ""} ${member.lastName || ""}`.trim();
        if (name && !names.includes(name)) names.push(name);
      } else {
        const formatted = formatAssigneeDisplay(assigneeId);
        if (formatted && !names.includes(formatted)) names.push(formatted);
      }
    });
    
    return names.length > 0 ? names : null;
  }, [isTask, task, memberLookup]);

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

  const handleDuplicateChild = useCallback(
    (child: CalendarTask) => {
      if (!onDuplicate) return;
      onDuplicate([{ entryType: "task", entry: child }]);
      onClose();
    },
    [onClose, onDuplicate],
  );

  const handleDeleteChild = useCallback(
    (child: CalendarTask) => {
      if (!onDelete) return;
      onDelete([{ entryType: "task", entry: child }]);
      onClose();
    },
    [onClose, onDelete],
  );

  const popoverContent = (
    <div
      ref={popoverRef}
      className="calendar-entry-popover"
      role="dialog"
      aria-label="Entry details"
    >
      {/* Header with title and avatar stack */}
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
        
        {/* Avatar stack (aligned right, overlapped like calendar blocks) */}
        {avatars.length > 0 && (
          <div className="calendar-entry-popover__avatars">
            {avatars.map((avatar, index) => (
              <span
                key={avatar.key}
                className="calendar-entry-popover__avatar-wrapper"
                style={{ 
                  zIndex: avatars.length - index,
                  marginLeft: index > 0 ? "-8px" : 0 
                }}
              >
                <ProjectAvatar
                  className="calendar-entry-popover__avatar"
                  thumb={avatar.thumb ?? undefined}
                  name={avatar.name}
                  shape="circle"
                  radius={10}
                />
              </span>
            ))}
          </div>
        )}
        
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
        {/* Show formatted assignee names, not IDs */}
        {assigneeNames && assigneeNames.length > 0 && (
          <div className="calendar-entry-popover__detail-row calendar-entry-popover__assignees">
            <span className="calendar-entry-popover__assignee-label">Assigned:</span>
            <span className="calendar-entry-popover__assignee-names">
              {assigneeNames.join(", ")}
            </span>
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

      {/* Focus Block children (Time Blocks) */}
      {focusChildrenResolved.length > 0 && (
        <div className="calendar-entry-popover__children">
          <div className="calendar-entry-popover__children-title">Time Blocks</div>
          <div className="calendar-entry-popover__children-list">
            {focusChildrenResolved.map((child) => {
              const childTitle = child.title || "Untitled task";
              const childTime = child.start && child.end ? `${child.start} - ${child.end}` : child.start || "";
              return (
                <div key={child.id} className="calendar-entry-popover__child-row">
                  <button
                    type="button"
                    className="calendar-entry-popover__child"
                    onClick={() => {
                      onEditFocusChild?.(child);
                      onClose();
                    }}
                    onContextMenu={(e) => {
                      if (!onOpenFocusChildContextMenu) return;
                      e.preventDefault();
                      e.stopPropagation();
                      onOpenFocusChildContextMenu(child, e);
                    }}
                    title={childTitle}
                  >
                    <div className="calendar-entry-popover__child-title">{childTitle}</div>
                    {childTime && <div className="calendar-entry-popover__child-time">{childTime}</div>}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
