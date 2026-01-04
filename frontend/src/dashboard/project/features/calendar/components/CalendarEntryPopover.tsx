/**
 * CalendarEntryPopover.tsx
 *
 * Inspector-lite popover for single-click selection on calendar entries.
 * Shows entry details and quick actions without opening the full edit modal.
 */

import React, { useEffect, useRef, useCallback, useMemo, useState } from "react";
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
  onRenameTaskTitle?: (task: CalendarTask, title: string) => void | Promise<void>;
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
  onRenameTaskTitle,
  onEditFocusChild,
  onOpenFocusChildContextMenu,
  onSubmitForReview,
  onMarkAsDone,
  onDuplicate,
  onDelete,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [titleOverride, setTitleOverride] = useState<string | null>(null);

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
    const normalizedKind = typeof task.kind === "string" ? task.kind.trim().toLowerCase() : "";
    if (normalizedKind === "focus_block") return true;
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

  const displayTitle = titleOverride ?? title;
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
      const direct = buildTaskAvatars(task, memberLookup);
      if (direct.length > 0) return direct;

      // Focus Blocks frequently have no assignee set on the parent; derive from child time blocks.
      if (isFocusBlock && focusChildrenResolved.length > 0) {
        const seen = new Set<string>();
        const derived: TimelineAvatar[] = [];
        focusChildrenResolved.forEach((child) => {
          if (derived.length >= 3) return;
          buildTaskAvatars(child, memberLookup).forEach((a) => {
            if (derived.length >= 3) return;
            if (seen.has(a.key)) return;
            seen.add(a.key);
            derived.push(a);
          });
        });
        return derived;
      }

      return direct;
    }
    if (!isTask && event) {
      return buildEventAvatars(event, memberLookup);
    }
    return [];
  }, [event, focusChildrenResolved, isFocusBlock, isTask, memberLookup, task]);

  const focusMeter = useMemo(() => {
    if (!isTask || !task) return null;
    if (!isFocusBlock) return null;
    const total = focusChildrenResolved.length;
    if (total <= 0) return null;
    const done = focusChildrenResolved.reduce((sum, child) => {
      const isDone = child.status === "done" || child.done === true;
      return sum + (isDone ? 1 : 0);
    }, 0);
    return { done, total };
  }, [focusChildrenResolved, isFocusBlock, isTask, task]);

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

  const canInlineRenameFocusBlock = Boolean(isTask && task && isFocusBlock && onRenameTaskTitle);

  useEffect(() => {
    if (!isEditingTitle) return;
    const raf = requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [isEditingTitle]);

  const beginEditTitle = useCallback(() => {
    if (!canInlineRenameFocusBlock) {
      // Fallback: open the full editor. Let the parent decide whether to close the popover.
      onEdit();
      return;
    }

    const initial = ((rawTitle ?? "").trim() || (title ?? "").trim() || "").toString();
    setDraftTitle(initial);
    setIsEditingTitle(true);
  }, [canInlineRenameFocusBlock, onEdit, rawTitle, title]);

  const commitTitle = useCallback(async () => {
    if (!canInlineRenameFocusBlock || !task || !onRenameTaskTitle) {
      setIsEditingTitle(false);
      return;
    }
    const next = draftTitle.trim();
    if (!next) {
      setIsEditingTitle(false);
      return;
    }

    try {
      await onRenameTaskTitle(task, next);
      setTitleOverride(next);
    } finally {
      setIsEditingTitle(false);
    }
  }, [canInlineRenameFocusBlock, draftTitle, onRenameTaskTitle, task]);

  const cancelTitleEdit = useCallback(() => {
    setIsEditingTitle(false);
    setDraftTitle("");
  }, []);

  const handleSubmitForReview = useCallback(() => {
    if (task && onSubmitForReview) {
      onSubmitForReview([task]);
    }
    onClose();
  }, [task, onSubmitForReview, onClose]);

  const handleMarkAsDone = useCallback(() => {
    if (!onMarkAsDone) {
      onClose();
      return;
    }

    // For Focus Blocks, treat “Done” as “All done” (mark all child time blocks as done).
    if (isFocusBlock && focusChildrenResolved.length > 0) {
      const pendingChildren = focusChildrenResolved.filter(
        (t) => t.status !== "done" && t.done !== true,
      );
      if (pendingChildren.length > 0) {
        onMarkAsDone(pendingChildren);
      }
      onClose();
      return;
    }

    if (task) {
      onMarkAsDone([task]);
    }
    onClose();
  }, [focusChildrenResolved, isFocusBlock, onClose, onMarkAsDone, task]);

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
      {/* Header with title and avatar stack */}
      <div className="calendar-entry-popover__header">
        {canInlineRenameFocusBlock && isEditingTitle ? (
          <div className="calendar-entry-popover__title-btn" role="group" aria-label="Edit title">
            <input
              ref={titleInputRef}
              className="calendar-entry-popover__title"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitTitle();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelTitleEdit();
                }
              }}
              onBlur={() => {
                void commitTitle();
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            className="calendar-entry-popover__title-btn"
            onClick={beginEditTitle}
            title={canInlineRenameFocusBlock ? "Click to rename" : "Click to edit"}
          >
            <span className="calendar-entry-popover__title">{displayTitle}</span>
            <Pencil className="calendar-entry-popover__edit-icon" />
          </button>
        )}
        
        {/* Avatar stack (aligned right, overlapped like calendar blocks) */}
        {(isFocusBlock ? avatars.slice(0, 1) : avatars).length > 0 && (
          <div className="calendar-entry-popover__avatars">
            {(isFocusBlock ? avatars.slice(0, 1) : avatars).map((avatar, index) => (
              <span
                key={avatar.key}
                className="calendar-entry-popover__avatar-wrapper"
                style={{ 
                  zIndex: (isFocusBlock ? 1 : avatars.length) - index,
                  marginLeft: !isFocusBlock && index > 0 ? "-8px" : 0 
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
        {isTask && isFocusBlock && focusMeter && (
          <div className="calendar-entry-popover__detail-row">
            <span className="calendar-entry-popover__status calendar-entry-popover__status--focus-meter">
              {focusMeter.done}/{focusMeter.total}
            </span>
          </div>
        )}
        {isTask && !isFocusBlock && task?.status && (
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
              const isChildDone = child.status === "done" || child.done === true;
              return (
                <div key={child.id} className="calendar-entry-popover__child-row">
                  <button
                    type="button"
                    className={
                      `calendar-entry-popover__child${isChildDone ? " calendar-entry-popover__child--done" : ""}`
                    }
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
                    <div
                      className={
                        `calendar-entry-popover__child-title${isChildDone ? " calendar-entry-popover__child-title--done" : ""}`
                      }
                    >
                      {childTitle}
                    </div>
                    {childTime && (
                      <div
                        className={
                          `calendar-entry-popover__child-time${isChildDone ? " calendar-entry-popover__child-time--done" : ""}`
                        }
                      >
                        {childTime}
                      </div>
                    )}
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
        {isTask && onMarkAsDone && (
          <button
            type="button"
            className="calendar-entry-popover__action calendar-entry-popover__action--success"
            onClick={handleMarkAsDone}
            title={isFocusBlock ? "Mark all as Done" : "Mark as Done"}
          >
            <CheckCircle className="calendar-entry-popover__action-icon" />
            <span>{isFocusBlock ? "All done" : "Done"}</span>
          </button>
        )}
        {!isFocusBlock && onDuplicate && (
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
