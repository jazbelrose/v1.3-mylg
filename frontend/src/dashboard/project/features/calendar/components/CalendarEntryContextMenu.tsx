/**
 * CalendarEntryContextMenu.tsx
 *
 * Right-click context menu for calendar entries (tasks and events).
 * Supports single and multi-selection actions.
 * Provides quick actions: Submit for Review, Mark as Done, Duplicate, Delete.
 */

import React, { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Send, CheckCircle, Copy, Trash2, Pencil, Layers, Users, UserX, ChevronRight } from "lucide-react";
import type { CalendarTask, CalendarEvent } from "../utils";
import type { CalendarEntryType } from "./calendarInteractions";
import type { TeamMember as ProjectTeamMember } from "@/dashboard/project/components/Shared/types";

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
  /**
   * Override the task scope for Submit/Done actions.
   * Useful for container menus (e.g., stack tiles) where actions should apply to child tasks.
   */
  tasksForActionsOverride?: CalendarTask[];
  /**
   * Show Edit even when multiple entries are in scope.
   * Useful for container menus (e.g., stack tiles) where Edit means "open details".
   */
  showEditInMultiSelect?: boolean;
  /**
   * Render inline instead of portaling to document.body.
   * Useful for child menus that should be treated as "inside" a parent popover.
   */
  portal?: boolean;
  /** If false, parent overlay will handle outside-click dismissal. */
  dismissOnOutsideClick?: boolean;
  /** If false, parent overlay will handle Escape dismissal. */
  dismissOnEscape?: boolean;
  /** Team members for bulk-assign submenu */
  teamMembers?: ProjectTeamMember[];
  /** Child tasks of a Focus Block (for bulk assign) */
  focusBlockChildren?: CalendarTask[];
  /**
   * Bulk-assign children for multiple Focus Blocks (e.g., multi-user stack).
   * Each item represents a Focus Block + its children to assign.
   */
  bulkAssignChildrenGroups?: Array<{ focusBlock: CalendarTask; children: CalendarTask[] }>;

  /** Override the bulk-assign label (Focus Block children). */
  bulkAssignLabelOverride?: string;

  /** Whether to include an "Unassign" option in the bulk-assign submenu. */
  bulkAssignIncludeUnassign?: boolean;
  onClose: () => void;
  onEdit?: (entry: CalendarTask | CalendarEvent) => void;
  onSubmitForReview?: (entries: CalendarTask[]) => void;
  onMarkAsDone?: (entries: CalendarTask[]) => void;
  onConvertToFocusBlock?: (entries: CalendarTask[]) => void;
  onUngroupFocusBlock?: (focusBlock: CalendarTask) => void;
  onDuplicate?: (entries: ContextMenuEntry[]) => void;
  onDelete?: (entries: ContextMenuEntry[]) => void;
  /** Bulk assign all children of a Focus Block to a user */
  onBulkAssignChildren?: (focusBlock: CalendarTask, userId: string | null, children: CalendarTask[]) => void;
  /** Assign a single time block (task with a time range) to a user */
  onAssignTimeBlock?: (task: CalendarTask, userId: string | null) => void;
  /** Assign selected time blocks (multi-select) to a user */
  onAssignTimeBlocks?: (tasks: CalendarTask[], userId: string | null) => void;

  /**
   * Override which tasks are used for the multi-assign submenu.
   * Defaults to selected time blocks (non-focus-block tasks).
   */
  multiAssignTasksOverride?: CalendarTask[];

  /** Override the multi-assign submenu label. */
  multiAssignLabelOverride?: string;

  /** Override the mark-as-done label for the general task action. */
  markAsDoneLabelOverride?: string;
}

export type ChildMenuState =
  | null
  | {
      kind: "entry_actions" | "stack_row_actions" | "focus_child_actions";
      anchorEl: HTMLElement;
      ownerId: string;
      parentId: string;
      entryType: CalendarEntryType;
      entry: CalendarTask | CalendarEvent;
    };

export const CalendarEntryContextMenu: React.FC<CalendarEntryContextMenuProps> = ({
  position,
  entryType,
  entry,
  selectedEntries = [],
  tasksForActionsOverride,
  showEditInMultiSelect = false,
  portal = true,
  dismissOnOutsideClick = true,
  dismissOnEscape = true,
  teamMembers,
  focusBlockChildren,
  bulkAssignChildrenGroups,
  bulkAssignLabelOverride,
  bulkAssignIncludeUnassign = true,
  onClose,
  onEdit,
  onSubmitForReview,
  onMarkAsDone,
  onConvertToFocusBlock,
  onUngroupFocusBlock,
  onDuplicate,
  onDelete,
  onBulkAssignChildren,
  onAssignTimeBlock,
  onAssignTimeBlocks,
  multiAssignTasksOverride,
  multiAssignLabelOverride,
  markAsDoneLabelOverride,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showAssignSubmenu, setShowAssignSubmenu] = useState(false);
  const assignButtonRef = useRef<HTMLButtonElement>(null);
  const submenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (submenuTimeoutRef.current) {
        clearTimeout(submenuTimeoutRef.current);
      }
    };
  }, []);

  // Handlers for submenu hover with delay to prevent flickering
  const handleSubmenuMouseEnter = useCallback(() => {
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current);
      submenuTimeoutRef.current = null;
    }
    setShowAssignSubmenu(true);
  }, []);

  const handleSubmenuMouseLeave = useCallback(() => {
    submenuTimeoutRef.current = setTimeout(() => {
      setShowAssignSubmenu(false);
    }, 150); // 150ms delay to allow moving between button and submenu
  }, []);

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

  const isFocusBlock = useMemo(() => {
    if (entryType !== "task") return false;
    const task = entry as CalendarTask;
    // Detect Focus Blocks by kind OR by having child task references (legacy support)
    if (task.kind === "focus_block") return true;
    const hasChildren = (task.focusChildTaskIds && task.focusChildTaskIds.length > 0) ||
      (task.focusChecklist && task.focusChecklist.length > 0);
    return hasChildren;
  }, [entry, entryType]);

  const isTimeBlock = useMemo(() => {
    if (entryType !== "task") return false;
    if (isFocusBlock) return false;
    const task = entry as CalendarTask;
    return Boolean(task.start || task.end);
  }, [entry, entryType, isFocusBlock]);

  // For multi-select, check if we have any tasks that can be actioned
  const actionableTasks = useMemo(
    () =>
      effectiveEntries
        .filter((e) => e.entryType === "task")
        .map((e) => e.entry as CalendarTask),
    [effectiveEntries]
  );

  const resolvedTasksForActions = useMemo(() => {
    if (Array.isArray(tasksForActionsOverride) && tasksForActionsOverride.length > 0) {
      return tasksForActionsOverride;
    }
    return actionableTasks;
  }, [actionableTasks, tasksForActionsOverride]);

  const selectedTimeBlocks = useMemo(() => {
    const isTaskFocusBlock = (task: CalendarTask) => {
      if (task.kind === "focus_block") return true;
      return Boolean(
        (task.focusChildTaskIds && task.focusChildTaskIds.length > 0) ||
          (task.focusChecklist && task.focusChecklist.length > 0),
      );
    };

    return actionableTasks.filter((task) => {
      if (isTaskFocusBlock(task)) return false;
      return Boolean(task.start || task.end);
    });
  }, [actionableTasks]);
  
  const tasksForReview = useMemo(
    () => resolvedTasksForActions.filter((t) => t.status !== "in_review" && t.status !== "done"),
    [resolvedTasksForActions]
  );
  const tasksForDone = useMemo(
    () => resolvedTasksForActions.filter((t) => t.status !== "done"),
    [resolvedTasksForActions]
  );

  // Focus Block parent-only: operate on children (tasks) instead of the parent task.
  const focusBlockChildTasks = useMemo(() => {
    if (!isFocusBlock) return [];
    return Array.isArray(focusBlockChildren) ? focusBlockChildren : [];
  }, [focusBlockChildren, isFocusBlock]);

  const focusBlockChildrenForDone = useMemo(() => {
    return focusBlockChildTasks.filter((t) => t.status !== "done");
  }, [focusBlockChildTasks]);

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
    if (!dismissOnOutsideClick && !dismissOnEscape) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!dismissOnOutsideClick) return;
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!dismissOnEscape) return;
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
  }, [dismissOnEscape, dismissOnOutsideClick, onClose]);

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

  const handleMarkAllFocusChildrenDone = useCallback(() => {
    if (!onMarkAsDone) return;
    if (!isFocusBlock) return;
    if (isMultiSelect) return;
    if (focusBlockChildrenForDone.length === 0) return;
    onMarkAsDone(focusBlockChildrenForDone);
    onClose();
  }, [focusBlockChildrenForDone, isFocusBlock, isMultiSelect, onClose, onMarkAsDone]);

  const handleConvertToFocusBlock = useCallback(() => {
    if (onConvertToFocusBlock && focusBlockCandidates.length >= 2) {
      onConvertToFocusBlock(focusBlockCandidates);
    }
    onClose();
  }, [focusBlockCandidates, onConvertToFocusBlock, onClose]);

  const handleUngroupFocusBlock = useCallback(() => {
    if (!onUngroupFocusBlock) return;
    if (entryType !== "task") return;
    if (!isFocusBlock) return;
    const task = entry as CalendarTask;
    onUngroupFocusBlock(task);
    onClose();
  }, [entry, entryType, isFocusBlock, onClose, onUngroupFocusBlock]);

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

  const handleBulkAssign = useCallback(
    (userId: string | null) => {
      if (!onBulkAssignChildren) return;
      const groups = Array.isArray(bulkAssignChildrenGroups) && bulkAssignChildrenGroups.length > 0
        ? bulkAssignChildrenGroups
        : null;

      if (groups) {
        groups.forEach((group) => {
          if (!group.children || group.children.length === 0) return;
          onBulkAssignChildren(group.focusBlock, userId, group.children);
        });
        onClose();
        return;
      }
      if (!isFocusBlock) return;
      if (!focusBlockChildren || focusBlockChildren.length === 0) return;
      const focusBlock = entry as CalendarTask;
      onBulkAssignChildren(focusBlock, userId, focusBlockChildren);
      onClose();
    },
    [bulkAssignChildrenGroups, entry, focusBlockChildren, isFocusBlock, onBulkAssignChildren, onClose],
  );

  const handleAssignTimeBlock = useCallback(
    (userId: string | null) => {
      if (!onAssignTimeBlock) return;
      if (isMultiSelect) return;
      if (!isTimeBlock) return;
      onAssignTimeBlock(entry as CalendarTask, userId);
      onClose();
    },
    [entry, isMultiSelect, isTimeBlock, onAssignTimeBlock, onClose],
  );

  const handleAssignSelectedTimeBlocks = useCallback(
    (userId: string | null) => {
      if (!onAssignTimeBlocks) return;
      if (!isMultiSelect) return;
      const tasks = Array.isArray(multiAssignTasksOverride) ? multiAssignTasksOverride : selectedTimeBlocks;
      if (tasks.length === 0) return;
      onAssignTimeBlocks(tasks, userId);
      onClose();
    },
    [isMultiSelect, multiAssignTasksOverride, onAssignTimeBlocks, onClose, selectedTimeBlocks],
  );

  const resolvedBulkAssignChildCount = useMemo(() => {
    if (Array.isArray(bulkAssignChildrenGroups) && bulkAssignChildrenGroups.length > 0) {
      const unique = new Set<string>();
      bulkAssignChildrenGroups.forEach((group) => {
        group.children.forEach((child) => {
          unique.add(child.source?.taskId ?? child.id);
        });
      });
      return unique.size;
    }
    if (Array.isArray(focusBlockChildren)) {
      return focusBlockChildren.length;
    }
    return 0;
  }, [bulkAssignChildrenGroups, focusBlockChildren]);

  const showBulkAssign =
    Boolean(onBulkAssignChildren) &&
    resolvedBulkAssignChildCount > 0 &&
    Boolean(teamMembers) &&
    (teamMembers?.length ?? 0) > 0 &&
    (
      (Array.isArray(bulkAssignChildrenGroups) && bulkAssignChildrenGroups.length > 0) ||
      (isFocusBlock && !isMultiSelect)
    );

  const showTimeBlockAssign =
    isTimeBlock &&
    !isMultiSelect &&
    Boolean(onAssignTimeBlock) &&
    Boolean(teamMembers) &&
    (teamMembers?.length ?? 0) > 0;

  const resolvedMultiAssignTasks =
    isMultiSelect && Array.isArray(multiAssignTasksOverride)
      ? multiAssignTasksOverride
      : selectedTimeBlocks;

  const showMultiTimeBlockAssign =
    isMultiSelect &&
    resolvedMultiAssignTasks.length > 0 &&
    Boolean(onAssignTimeBlocks) &&
    Boolean(teamMembers) &&
    (teamMembers?.length ?? 0) > 0;

  // Build label suffix for multi-select
  const countSuffix = isMultiSelect ? ` (${selectionCount})` : "";

  // Duplicate is intentionally hidden for time blocks (start/end scheduled tasks)
  // because duplication is handled via Ctrl/Cmd-drag in the calendar grid.
  const showDuplicate = Boolean(onDuplicate) && selectedTimeBlocks.length === 0;

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
      {(!isMultiSelect || showEditInMultiSelect) && onEdit && (
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

      {/* Focus Block parent: Mark all children tasks as done */}
      {isFocusBlock && !isMultiSelect && onMarkAsDone && (
        <button
          type="button"
          className="calendar-entry-context-menu__item"
          onClick={handleMarkAllFocusChildrenDone}
          role="menuitem"
          disabled={focusBlockChildrenForDone.length === 0}
          title={focusBlockChildrenForDone.length === 0 ? "No tasks to mark" : undefined}
        >
          <CheckCircle className="calendar-entry-context-menu__icon" />
          <span>
            Mark all tasks as done
            {focusBlockChildrenForDone.length > 0 ? ` (${focusBlockChildrenForDone.length})` : ""}
          </span>
        </button>
      )}

      {/* Mark as Done - for tasks not done */}
      {tasksForDone.length > 0 && onMarkAsDone && (!isFocusBlock || isMultiSelect) && (
        <button
          type="button"
          className="calendar-entry-context-menu__item"
          onClick={handleMarkAsDone}
          role="menuitem"
        >
          <CheckCircle className="calendar-entry-context-menu__icon" />
          <span>
            {markAsDoneLabelOverride ?? "Mark as Done"}
            {isMultiSelect && tasksForDone.length > 0 ? ` (${tasksForDone.length})` : ""}
          </span>
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

      {/* Convert Focus Block back into Time Blocks (Ungroup) */}
      {isFocusBlock && onUngroupFocusBlock && (
        <button
          type="button"
          className="calendar-entry-context-menu__item"
          onClick={handleUngroupFocusBlock}
          role="menuitem"
        >
          <Layers className="calendar-entry-context-menu__icon" />
          <span>Convert to Time Blocks (Ungroup)</span>
        </button>
      )}

      {/* Bulk assign children of Focus Block */}
      {showBulkAssign && (
        <div 
          className="calendar-entry-context-menu__submenu-wrapper"
          onMouseEnter={handleSubmenuMouseEnter}
          onMouseLeave={handleSubmenuMouseLeave}
        >
          <button
            ref={assignButtonRef}
            type="button"
            className="calendar-entry-context-menu__item calendar-entry-context-menu__item--has-submenu"
            onClick={() => setShowAssignSubmenu((prev) => !prev)}
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={showAssignSubmenu}
          >
            <Users className="calendar-entry-context-menu__icon" />
            <span>
              {bulkAssignLabelOverride ??
                (resolvedBulkAssignChildCount > 0
                  ? `Assign all children to... (${resolvedBulkAssignChildCount})`
                  : "Assign all children to...")}
            </span>
            <ChevronRight className="calendar-entry-context-menu__chevron" />
          </button>

          {showAssignSubmenu && (
            <div
              className="calendar-entry-context-menu__submenu"
            >
              {teamMembers?.map((member) => {
                const displayName =
                  `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() ||
                  member.userId;
                return (
                  <button
                    key={member.userId}
                    type="button"
                    className="calendar-entry-context-menu__item"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBulkAssign(member.userId);
                    }}
                    role="menuitem"
                  >
                    <span>{displayName}</span>
                  </button>
                );
              })}
              {bulkAssignIncludeUnassign && (
                <>
                  <div className="calendar-entry-context-menu__separator" />
                  <button
                    type="button"
                    className="calendar-entry-context-menu__item calendar-entry-context-menu__item--secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBulkAssign(null);
                    }}
                    role="menuitem"
                  >
                    <UserX className="calendar-entry-context-menu__icon" />
                    <span>Unassign all</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Assign single Time Block */}
      {showTimeBlockAssign && (
        <div
          className="calendar-entry-context-menu__submenu-wrapper"
          onMouseEnter={handleSubmenuMouseEnter}
          onMouseLeave={handleSubmenuMouseLeave}
        >
          <button
            ref={assignButtonRef}
            type="button"
            className="calendar-entry-context-menu__item calendar-entry-context-menu__item--has-submenu"
            onClick={() => setShowAssignSubmenu((prev) => !prev)}
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={showAssignSubmenu}
          >
            <Users className="calendar-entry-context-menu__icon" />
            <span>Assign to...</span>
            <ChevronRight className="calendar-entry-context-menu__chevron" />
          </button>

          {showAssignSubmenu && (
            <div className="calendar-entry-context-menu__submenu">
              {teamMembers?.map((member) => {
                const displayName =
                  `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() ||
                  member.userId;
                return (
                  <button
                    key={member.userId}
                    type="button"
                    className="calendar-entry-context-menu__item"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAssignTimeBlock(member.userId);
                    }}
                    role="menuitem"
                  >
                    <span>{displayName}</span>
                  </button>
                );
              })}
              <div className="calendar-entry-context-menu__separator" />
              <button
                type="button"
                className="calendar-entry-context-menu__item calendar-entry-context-menu__item--secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAssignTimeBlock(null);
                }}
                role="menuitem"
              >
                <UserX className="calendar-entry-context-menu__icon" />
                <span>Unassign</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Assign selected Time Blocks (multi-select) */}
      {showMultiTimeBlockAssign && (
        <div
          className="calendar-entry-context-menu__submenu-wrapper"
          onMouseEnter={handleSubmenuMouseEnter}
          onMouseLeave={handleSubmenuMouseLeave}
        >
          <button
            ref={assignButtonRef}
            type="button"
            className="calendar-entry-context-menu__item calendar-entry-context-menu__item--has-submenu"
            onClick={() => setShowAssignSubmenu((prev) => !prev)}
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={showAssignSubmenu}
          >
            <Users className="calendar-entry-context-menu__icon" />
            <span>
              {multiAssignLabelOverride ?? `Assign to... (${resolvedMultiAssignTasks.length})`}
            </span>
            <ChevronRight className="calendar-entry-context-menu__chevron" />
          </button>

          {showAssignSubmenu && (
            <div className="calendar-entry-context-menu__submenu">
              {teamMembers?.map((member) => {
                const displayName =
                  `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() ||
                  member.userId;
                return (
                  <button
                    key={member.userId}
                    type="button"
                    className="calendar-entry-context-menu__item"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAssignSelectedTimeBlocks(member.userId);
                    }}
                    role="menuitem"
                  >
                    <span>{displayName}</span>
                  </button>
                );
              })}
              <div className="calendar-entry-context-menu__separator" />
              <button
                type="button"
                className="calendar-entry-context-menu__item calendar-entry-context-menu__item--secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAssignSelectedTimeBlocks(null);
                }}
                role="menuitem"
              >
                <UserX className="calendar-entry-context-menu__icon" />
                <span>Unassign ({resolvedMultiAssignTasks.length})</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Duplicate */}
      {showDuplicate && (
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

  return portal ? createPortal(menuContent, document.body) : menuContent;
};

export default CalendarEntryContextMenu;
