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
  DollarSign,
  CheckSquare,
  Square,
  ListTodo,
} from "lucide-react";
import { formatTimeLabel, type CalendarTask, type CalendarEvent } from "../utils";
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
import {
  createBudgetItem,
  fetchBudgetHeader,
  fetchBudgetItems,
  updateTask,
  type BudgetHeader,
  type BudgetLine,
} from "@/shared/utils/api";
import {
  BUDGET_TASK_LINK_TYPES,
  inferBudgetTaskLinkTypeFromTitle,
  getPrimaryBudgetLineItemId,
  normalizeBudgetTaskLinkType,
  type BudgetTaskLinkType,
} from "@/shared/utils/budgetTaskLinks";

import {
  CalendarEntryContextMenu,
  type ChildMenuState,
  type ContextMenuEntry,
} from "./CalendarEntryContextMenu";
import { PopoverShell } from "./PopoverShell";
import { CalendarEntryRow } from "./CalendarEntryRow";

export interface CalendarEntryPopoverProps {
  anchorElement: HTMLElement;
  entryType: CalendarEntryType;
  entry: CalendarTask | CalendarEvent;
  selectedCount: number;
  teamMembers?: ProjectTeamMember[];
  focusChildren?: CalendarTask[];
  parentId?: string;
  childMenu?: ChildMenuState;
  setChildMenu?: React.Dispatch<React.SetStateAction<ChildMenuState>>;
  onClose: () => void;
  onEdit: () => void;
  onRenameTaskTitle?: (task: CalendarTask, title: string) => void | Promise<void>;
  onEditFocusChild?: (task: CalendarTask) => void;
  onStartDragFocusChild?: (
    task: CalendarTask,
    pointerEvent: React.PointerEvent<HTMLElement>,
    /** Initial pointer position and offset for proper ghost alignment */
    dragInfo: {
      startX: number;
      startY: number;
      offsetX: number;
      offsetY: number;
      sourceWidth: number;
      sourceHeight: number;
    },
  ) => void;
  onOpenFocusChildContextMenu?: (task: CalendarTask, event: React.MouseEvent<HTMLElement>) => void;
  onSubmitForReview?: (tasks: CalendarTask[]) => void;
  onMarkAsDone?: (tasks: CalendarTask[]) => void;
  onDuplicate?: (entries: ContextMenuEntry[]) => void;
  onDelete?: (entries: ContextMenuEntry[]) => void;
  /** Assign a single time block (task with a time range) to a user */
  onAssignTimeBlock?: (task: CalendarTask, userId: string | null) => void;
  /** Assign selected time blocks (multi-select) to a user */
  onAssignTimeBlocks?: (tasks: CalendarTask[], userId: string | null) => void;
}

export const CalendarEntryPopover: React.FC<CalendarEntryPopoverProps> = ({
  anchorElement,
  entryType,
  entry,
  selectedCount,
  teamMembers,
  focusChildren,
  parentId,
  childMenu,
  setChildMenu,
  onClose,
  onEdit,
  onRenameTaskTitle,
  onEditFocusChild,
  onStartDragFocusChild,
  onOpenFocusChildContextMenu,
  onSubmitForReview,
  onMarkAsDone,
  onDuplicate,
  onDelete,
  onAssignTimeBlock,
  onAssignTimeBlocks,
}) => {
  const DRAG_PX = 8;
  const LONG_PRESS_MS = 220;
  const TOUCH_SLOP_PX = 12;

  const popoverRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [activeChildKey, setActiveChildKey] = useState<string | null>(null);

  const focusChildPointerRef = useRef<{
    task: CalendarTask;
    key: string;
    pointerId: number;
    pointerType: string;
    startX: number;
    startY: number;
    /** Offset of the initial click within the element */
    offsetX: number;
    offsetY: number;
    sourceWidth: number;
    sourceHeight: number;
    didDrag: boolean;
    dragArmed: boolean;
    longPressTimer: number | null;
    cancelled: boolean;
  } | null>(null);

  const clearFocusChildPointerState = useCallback(() => {
    const state = focusChildPointerRef.current;
    if (state?.longPressTimer) {
      window.clearTimeout(state.longPressTimer);
    }
    focusChildPointerRef.current = null;
  }, []);

  const startDragFocusChildIfPossible = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const state = focusChildPointerRef.current;
      if (!state) return;
      if (state.didDrag || state.cancelled) return;
      if (!onStartDragFocusChild) return;

      state.didDrag = true;
      if (state.longPressTimer) {
        window.clearTimeout(state.longPressTimer);
        state.longPressTimer = null;
      }

      event.preventDefault();
      event.stopPropagation();
      setActiveChildKey(state.key);
      // Use the current pointer position (drag start), plus the offset captured on pointer down.
      onStartDragFocusChild(state.task, event, {
        startX: event.clientX,
        startY: event.clientY,
        offsetX: state.offsetX,
        offsetY: state.offsetY,
        sourceWidth: state.sourceWidth,
        sourceHeight: state.sourceHeight,
      });
    },
    [onStartDragFocusChild],
  );

  const handleFocusChildPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, child: CalendarTask, childKey: string) => {
      if (event.button !== 0) return;
      if (isEditingTitle) return;

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }

      setActiveChildKey(childKey);

      const pointerType = event.pointerType || "mouse";
      const isTouch = pointerType === "touch";

      // Calculate offset within the element at pointer down time
      const rect = event.currentTarget.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;

      const nextState = {
        task: child,
        key: childKey,
        pointerId: event.pointerId,
        pointerType,
        startX: event.clientX,
        startY: event.clientY,
        offsetX,
        offsetY,
        sourceWidth: rect.width,
        sourceHeight: rect.height,
        didDrag: false,
        dragArmed: !isTouch,
        longPressTimer: null as number | null,
        cancelled: false,
      };

      if (isTouch) {
        nextState.longPressTimer = window.setTimeout(() => {
          const st = focusChildPointerRef.current;
          if (!st) return;
          if (st.pointerId !== event.pointerId) return;
          if (st.cancelled || st.didDrag) return;
          st.dragArmed = true;
        }, LONG_PRESS_MS);
      }

      focusChildPointerRef.current = nextState;
    },
    [LONG_PRESS_MS, isEditingTitle],
  );

  const handleFocusChildPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const state = focusChildPointerRef.current;
      if (!state) return;
      if (event.pointerId !== state.pointerId) return;
      if (state.didDrag || state.cancelled) return;

      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      const dist = Math.hypot(dx, dy);

      const isTouch = state.pointerType === "touch";
      if (isTouch && !state.dragArmed) {
        if (dist > TOUCH_SLOP_PX) {
          state.cancelled = true;
          if (state.longPressTimer) {
            window.clearTimeout(state.longPressTimer);
            state.longPressTimer = null;
          }
        }
        return;
      }

      const threshold = isTouch ? TOUCH_SLOP_PX : DRAG_PX;
      if (dist >= threshold) {
        startDragFocusChildIfPossible(event);
      }
    },
    [DRAG_PX, TOUCH_SLOP_PX, startDragFocusChildIfPossible],
  );

  const handleFocusChildPointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const state = focusChildPointerRef.current;
      if (!state) return;
      if (event.pointerId !== state.pointerId) return;

      const didDrag = state.didDrag;
      const taskToEdit = state.task;
      const key = state.key;
      clearFocusChildPointerState();

      if (didDrag) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setActiveChildKey(key);
      onEditFocusChild?.(taskToEdit);
      onClose();
    },
    [clearFocusChildPointerState, onClose, onEditFocusChild],
  );

  const handleFocusChildPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const state = focusChildPointerRef.current;
      if (!state) return;
      if (event.pointerId !== state.pointerId) return;
      clearFocusChildPointerState();
    },
    [clearFocusChildPointerState],
  );

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

  const closeChildMenuIfOwned = useCallback(() => {
    if (!setChildMenu) return;
    if (!childMenu) return;
    if (!parentId) return;
    if (childMenu.parentId !== parentId) return;
    setChildMenu(null);
  }, [childMenu, parentId, setChildMenu]);

  // Defensive: if an anchored child menu loses its anchor element (e.g. rerender/unmount)
  // close it instead of crashing on getBoundingClientRect.
  useEffect(() => {
    if (!childMenu || !parentId || childMenu.parentId !== parentId) return;
    const anchorEl = (childMenu.anchorEl as unknown as HTMLElement | null) ?? null;
    if (!anchorEl || typeof anchorEl.getBoundingClientRect !== "function") {
      setChildMenu?.(null);
    }
  }, [childMenu, parentId, setChildMenu]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (childMenu && parentId && childMenu.parentId === parentId && setChildMenu) {
          event.preventDefault();
          setChildMenu(null);
          return;
        }
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [childMenu, onClose, parentId, setChildMenu]);

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
  const sourceTask = task?.source ?? null;
  const sourceProjectId = typeof sourceTask?.projectId === "string" ? sourceTask.projectId : "";
  const sourceTaskId = typeof sourceTask?.taskId === "string" ? sourceTask.taskId : "";

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
      ? `${formatTimeLabel(task.start) ?? task.start} - ${formatTimeLabel(task.end) ?? task.end}`
      : (formatTimeLabel(task?.start) ?? task?.start) || "No time set"
    : event?.start && event?.end
      ? `${formatTimeLabel(event.start) ?? event.start} - ${formatTimeLabel(event.end) ?? event.end}`
      : event?.allDay
        ? "All day"
        : (formatTimeLabel(event?.start) ?? event?.start) || "No time set";

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

  const canInlineRenameTitle = Boolean(isTask && task && onRenameTaskTitle);

  const [attachedBudgetItemId, setAttachedBudgetItemId] = useState<string | null>(null);
  const [budgetLinkType, setBudgetLinkType] = useState<BudgetTaskLinkType>("build");
  const [isCostPanelOpen, setIsCostPanelOpen] = useState(false);
  const [budgetHeader, setBudgetHeader] = useState<BudgetHeader | null>(null);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [budgetLoadError, setBudgetLoadError] = useState<string | null>(null);
  const [costQuery, setCostQuery] = useState("");
  const [isCostSaving, setIsCostSaving] = useState(false);
  const [isCreatingLineItem, setIsCreatingLineItem] = useState(false);
  const [newLineKey, setNewLineKey] = useState("");
  const [newLineDesc, setNewLineDesc] = useState("");
  const [newLineCost, setNewLineCost] = useState("");

  useEffect(() => {
    if (!isTask || !task || !sourceTask) return;
    setAttachedBudgetItemId(getPrimaryBudgetLineItemId(sourceTask));

    const inferred = inferBudgetTaskLinkTypeFromTitle(task.title || sourceTask.title || "");
    const existing = normalizeBudgetTaskLinkType(sourceTask.budgetLinkType);
    setBudgetLinkType(existing ?? inferred);

    setIsCostPanelOpen(false);
    setIsCreatingLineItem(false);
    setCostQuery("");
    setNewLineKey("");
    setNewLineDesc("");
    setNewLineCost("");
  }, [isTask, sourceTaskId, task, sourceTask]);

  const loadBudget = useCallback(async () => {
    if (!sourceProjectId) return;
    setBudgetLoading(true);
    setBudgetLoadError(null);
    try {
      const header = await fetchBudgetHeader(sourceProjectId);
      setBudgetHeader(header);
      if (!header?.budgetId) {
        setBudgetLines([]);
        return;
      }
      const lines = await fetchBudgetItems(header.budgetId, header.revision);
      setBudgetLines(lines);
    } catch (err) {
      console.error("Failed to load budget for cost attach", err);
      setBudgetLines([]);
      setBudgetHeader(null);
      setBudgetLoadError("Failed to load budget.");
    } finally {
      setBudgetLoading(false);
    }
  }, [sourceProjectId]);

  useEffect(() => {
    if (!isTask) return;
    if (!sourceProjectId) return;
    if (!isCostPanelOpen && !attachedBudgetItemId) return;
    void loadBudget();
  }, [attachedBudgetItemId, isCostPanelOpen, isTask, loadBudget, sourceProjectId]);

  const budgetLineById = useMemo(() => {
    const map = new Map<string, BudgetLine>();
    budgetLines.forEach((line) => {
      if (typeof line?.budgetItemId === "string" && line.budgetItemId.trim()) {
        map.set(line.budgetItemId.trim(), line);
      }
    });
    return map;
  }, [budgetLines]);

  const attachedBudgetLine = useMemo(() => {
    if (!attachedBudgetItemId) return null;
    return budgetLineById.get(attachedBudgetItemId) ?? null;
  }, [attachedBudgetItemId, budgetLineById]);

  const attachedBudgetLabel = useMemo(() => {
    if (!attachedBudgetItemId) return "";
    if (!attachedBudgetLine) return attachedBudgetItemId;
    const key = typeof attachedBudgetLine.elementKey === "string" ? attachedBudgetLine.elementKey.trim() : "";
    const desc = typeof attachedBudgetLine.description === "string" ? attachedBudgetLine.description.trim() : "";
    return [key, desc].filter(Boolean).join(" ") || attachedBudgetItemId;
  }, [attachedBudgetItemId, attachedBudgetLine]);

  const filteredBudgetLines = useMemo(() => {
    const q = costQuery.trim().toLowerCase();
    if (!q) return budgetLines.slice(0, 20);
    return budgetLines
      .filter((line) => {
        const key = typeof line.elementKey === "string" ? line.elementKey.toLowerCase() : "";
        const desc = typeof line.description === "string" ? line.description.toLowerCase() : "";
        return key.includes(q) || desc.includes(q) || (line.budgetItemId || "").toLowerCase().includes(q);
      })
      .slice(0, 20);
  }, [budgetLines, costQuery]);

  const handleAttachCost = useCallback(
    async (budgetItemId: string) => {
      if (!sourceProjectId || !sourceTaskId) return;
      if (!budgetItemId) return;
      setIsCostSaving(true);
      try {
        await updateTask({
          projectId: sourceProjectId,
          taskId: sourceTaskId,
          title: sourceTask?.title ?? task?.title ?? "",
          primaryBudgetLineItemId: budgetItemId,
          budgetLinkType,
        });
        setAttachedBudgetItemId(budgetItemId);
        setIsCostPanelOpen(false);
      } finally {
        setIsCostSaving(false);
      }
    },
    [budgetLinkType, sourceProjectId, sourceTask, sourceTaskId, task?.title],
  );

  const handleDetachCost = useCallback(async () => {
    if (!sourceProjectId || !sourceTaskId) return;
    setIsCostSaving(true);
    try {
      await updateTask({
        projectId: sourceProjectId,
        taskId: sourceTaskId,
        title: sourceTask?.title ?? task?.title ?? "",
        primaryBudgetLineItemId: null,
        budgetLinkType: null,
      });
      setAttachedBudgetItemId(null);
      setIsCostPanelOpen(false);
    } finally {
      setIsCostSaving(false);
    }
  }, [sourceProjectId, sourceTask, sourceTaskId, task?.title]);

  const handleCreateLineItemAndAttach = useCallback(async () => {
    if (!sourceProjectId || !sourceTaskId) return;
    if (!budgetHeader?.budgetId) return;

    const elementKey = newLineKey.trim();
    const description = newLineDesc.trim();
    if (!elementKey || !description) return;

    const parsedCost = Number(String(newLineCost).replace(/[$,]/g, ""));
    const itemBudgetedCost = Number.isFinite(parsedCost) ? parsedCost : 0;

    setIsCostSaving(true);
    try {
      const created = await createBudgetItem(sourceProjectId, budgetHeader.budgetId, {
        revision: budgetHeader.revision ?? 1,
        category: "CONTINGENCY-MISC",
        elementKey,
        description,
        quantity: 1,
        unit: "EA",
        itemBudgetedCost,
      });

      if (created && typeof created === "object" && typeof (created as BudgetLine).budgetItemId === "string") {
        const createdLine = created as BudgetLine;
        setBudgetLines((prev) => [createdLine, ...prev]);
        await handleAttachCost(createdLine.budgetItemId);
        setIsCreatingLineItem(false);
      }
    } finally {
      setIsCostSaving(false);
    }
  }, [
    budgetHeader?.budgetId,
    budgetHeader?.revision,
    handleAttachCost,
    newLineCost,
    newLineDesc,
    newLineKey,
    sourceProjectId,
    sourceTaskId,
  ]);

  useEffect(() => {
    if (!isEditingTitle) return;
    const raf = requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [isEditingTitle]);

  const beginEditTitle = useCallback(() => {
    if (!canInlineRenameTitle) {
      // Fallback: open the full editor. Let the parent decide whether to close the popover.
      onEdit();
      return;
    }

    const initial = ((rawTitle ?? "").trim() || (title ?? "").trim() || "").toString();
    setDraftTitle(initial);
    setIsEditingTitle(true);
  }, [canInlineRenameTitle, onEdit, rawTitle, title]);

  const commitTitle = useCallback(async () => {
    if (!canInlineRenameTitle || !task || !onRenameTaskTitle) {
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
  }, [canInlineRenameTitle, draftTitle, onRenameTaskTitle, task]);

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
    <PopoverShell
      ref={popoverRef}
      ariaLabel="Entry details"
      onMouseDownCapture={(e) => {
        if (!childMenu || !parentId) return;
        if (childMenu.parentId !== parentId) return;
        const target = e.target as HTMLElement;
        if (target?.closest(".calendar-entry-context-menu")) return;
        closeChildMenuIfOwned();
      }}
      onWheelCapture={() => closeChildMenuIfOwned()}
      onScrollCapture={() => closeChildMenuIfOwned()}
      onMouseDown={(e) => {
        // This popover is rendered via a React portal; without stopping propagation,
        // parent calendar click handlers can interpret clicks inside the popover as
        // "click on empty grid" and close it immediately.
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header with title and avatar stack */}
      <div className="calendar-entry-popover__header">
        <span className="calendar-entry-row__icon" aria-hidden>
          {entryType === "event" ? (
            <Clock className="calendar-entry-row__icon-svg" aria-hidden />
          ) : isFocusBlock ? (
            <ListTodo className="calendar-entry-row__icon-svg" aria-hidden />
          ) : (() => {
            const bundleDone =
              isFocusBlock && focusChildrenResolved.length > 0
                ? focusChildrenResolved.every((t) => t.status === "done" || t.done === true)
                : Boolean(task && (task.status === "done" || task.done === true));
            return bundleDone ? (
              <CheckSquare className="calendar-entry-row__icon-svg" aria-hidden />
            ) : (
              <Square className="calendar-entry-row__icon-svg" aria-hidden />
            );
          })()}
        </span>
        {canInlineRenameTitle && isEditingTitle ? (
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
            title={canInlineRenameTitle ? "Click to rename" : "Click to edit"}
          >
            <span className="calendar-entry-popover__title">{displayTitle}</span>
            <Pencil className="calendar-entry-popover__edit-icon" />
          </button>
        )}

        <div className="calendar-entry-popover__header-right" aria-hidden>
          {/* Avatar stack (aligned right, overlapped like calendar blocks) */}
          {(isFocusBlock ? avatars.slice(0, 1) : avatars).length > 0 && (
            <div className="calendar-entry-popover__avatars">
              {(isFocusBlock ? avatars.slice(0, 1) : avatars).map((avatar, index) => (
                <span
                  key={avatar.key}
                  className="calendar-entry-popover__avatar-wrapper"
                  style={{
                    zIndex: (isFocusBlock ? 1 : avatars.length) - index,
                    marginLeft: !isFocusBlock && index > 0 ? "-8px" : 0,
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
            <span className="calendar-entry-popover__badge">+{selectedCount - 1} more</span>
          )}

          {/* Focus meter pinned in header (n/n) */}
          {isTask && isFocusBlock && focusMeter && (
            <span className="calendar-entry-popover__status calendar-entry-popover__status--focus-meter">
              {focusMeter.done}/{focusMeter.total}
            </span>
          )}

          {/* Removed kebab/ellipsis menu: actions are available via right-click and the buttons below. */}
        </div>
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
        {isTask && !isFocusBlock && (
          <div className="calendar-entry-popover__detail-row calendar-entry-popover__detail-row--cost">
            <DollarSign className="calendar-entry-popover__detail-icon" />
            {attachedBudgetItemId ? (
              <>
                <button
                  type="button"
                  className="calendar-entry-popover__cost-btn"
                  onClick={() => setIsCostPanelOpen((prev) => !prev)}
                  disabled={isCostSaving}
                  title="Change attached cost"
                >
                  <span className="calendar-entry-popover__cost-label">Cost:</span>
                  <span className="calendar-entry-popover__cost-value">{attachedBudgetLabel}</span>
                </button>
                <button
                  type="button"
                  className="calendar-entry-popover__cost-clear"
                  onClick={() => void handleDetachCost()}
                  disabled={isCostSaving}
                  title="Detach cost"
                >
                  Remove
                </button>
              </>
            ) : (
              <button
                type="button"
                className="calendar-entry-popover__cost-btn"
                onClick={() => setIsCostPanelOpen(true)}
                disabled={isCostSaving}
              >
                + Attach cost
              </button>
            )}
          </div>
        )}
        {isTask && !isFocusBlock && isCostPanelOpen && (
          <div className="calendar-entry-popover__cost-panel" onClick={(e) => e.stopPropagation()}>
            <div className="calendar-entry-popover__cost-panel-row">
              <label className="calendar-entry-popover__cost-panel-label">Link type</label>
              <select
                className="calendar-entry-popover__cost-panel-select"
                value={budgetLinkType}
                onChange={(e) => setBudgetLinkType(e.target.value as BudgetTaskLinkType)}
                disabled={isCostSaving}
              >
                {BUDGET_TASK_LINK_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {budgetLoading ? (
              <div className="calendar-entry-popover__cost-panel-muted">Loading budget…</div>
            ) : budgetLoadError ? (
              <div className="calendar-entry-popover__cost-panel-muted">{budgetLoadError}</div>
            ) : !budgetHeader?.budgetId ? (
              <div className="calendar-entry-popover__cost-panel-muted">No budget found for this project.</div>
            ) : (
              <>
                <input
                  className="calendar-entry-popover__cost-panel-input"
                  value={costQuery}
                  onChange={(e) => setCostQuery(e.target.value)}
                  placeholder="Search line items…"
                  disabled={isCostSaving}
                />

                <div className="calendar-entry-popover__cost-panel-results">
                  {filteredBudgetLines.length === 0 ? (
                    <div className="calendar-entry-popover__cost-panel-muted">No matches.</div>
                  ) : (
                    filteredBudgetLines.map((line) => {
                      const id = String(line.budgetItemId || "");
                      const key = typeof line.elementKey === "string" ? line.elementKey : "";
                      const desc = typeof line.description === "string" ? line.description : "";
                      return (
                        <button
                          key={id}
                          type="button"
                          className="calendar-entry-popover__cost-panel-result"
                          onClick={() => void handleAttachCost(id)}
                          disabled={isCostSaving}
                          title="Attach this line item"
                        >
                          <div className="calendar-entry-popover__cost-panel-result-title">
                            {key ? `${key} ` : ""}
                            {desc || id}
                          </div>
                          <div className="calendar-entry-popover__cost-panel-result-meta">{id}</div>
                        </button>
                      );
                    })
                  )}
                </div>

                <button
                  type="button"
                  className="calendar-entry-popover__cost-panel-toggle"
                  onClick={() => setIsCreatingLineItem((prev) => !prev)}
                  disabled={isCostSaving}
                >
                  {isCreatingLineItem ? "Cancel new line item" : "Create new line item"}
                </button>

                {isCreatingLineItem && (
                  <div className="calendar-entry-popover__cost-panel-create">
                    <input
                      className="calendar-entry-popover__cost-panel-input"
                      value={newLineKey}
                      onChange={(e) => setNewLineKey(e.target.value)}
                      placeholder="Element key (e.g. NIKE-0023)"
                      disabled={isCostSaving}
                    />
                    <input
                      className="calendar-entry-popover__cost-panel-input"
                      value={newLineDesc}
                      onChange={(e) => setNewLineDesc(e.target.value)}
                      placeholder="Description"
                      disabled={isCostSaving}
                    />
                    <input
                      className="calendar-entry-popover__cost-panel-input"
                      value={newLineCost}
                      onChange={(e) => setNewLineCost(e.target.value)}
                      placeholder="Budgeted cost (optional)"
                      disabled={isCostSaving}
                    />
                    <button
                      type="button"
                      className="calendar-entry-popover__cost-panel-primary"
                      onClick={() => void handleCreateLineItemAndAttach()}
                      disabled={
                        isCostSaving ||
                        !budgetHeader?.budgetId ||
                        newLineKey.trim().length === 0 ||
                        newLineDesc.trim().length === 0
                      }
                    >
                      Create + attach
                    </button>
                  </div>
                )}
              </>
            )}
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
              const childTime = child.start && child.end
                ? `${formatTimeLabel(child.start) ?? child.start} - ${formatTimeLabel(child.end) ?? child.end}`
                : (formatTimeLabel(child.start) ?? child.start) || "";
              const isChildDone = child.status === "done" || child.done === true;
              const childKey = `task:${child.id}`;
              return (
                <div key={child.id} className="calendar-entry-popover__child-row">
                  <CalendarEntryRow
                    entryType="task"
                    title={childTitle}
                    timeLabel={childTime}
                    isDone={isChildDone}
                    isSelected={activeChildKey === childKey}
                    draggable={Boolean(onStartDragFocusChild)}
                    showDragHandle={false}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      handleFocusChildPointerDown(e, child, childKey);
                    }}
                    onPointerMove={handleFocusChildPointerMove}
                    onPointerUp={handleFocusChildPointerUp}
                    onPointerCancel={handleFocusChildPointerCancel}
                    onContextMenu={(e) => {
                      if (!onOpenFocusChildContextMenu) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveChildKey(childKey);
                      onOpenFocusChildContextMenu(child, e);
                    }}
                    titleAttr={childTitle}
                  />

                  {/* Focus Block time blocks: actions are available via right-click on the row. */}
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

      {childMenu && parentId && childMenu.parentId === parentId ? (
        (() => {
          const anchorEl = (childMenu.anchorEl as unknown as HTMLElement | null) ?? null;
          if (!anchorEl || typeof anchorEl.getBoundingClientRect !== "function") {
            return null;
          }
          const rect = anchorEl.getBoundingClientRect();
          const position = { x: rect.left, y: rect.bottom + 6 };
          const isFocusChild = childMenu.kind === "focus_child_actions";
          const focusChildTask = isFocusChild && childMenu.entryType === "task"
            ? (childMenu.entry as CalendarTask)
            : null;
          return (
            <CalendarEntryContextMenu
              portal={false}
              dismissOnOutsideClick={false}
              dismissOnEscape={false}
              position={position}
              entryType={childMenu.entryType}
              entry={childMenu.entry}
              teamMembers={teamMembers}
              onClose={() => setChildMenu?.(null)}
              onEdit={
                isFocusChild
                  ? focusChildTask
                    ? () => {
                        onEditFocusChild?.(focusChildTask);
                        setChildMenu?.(null);
                        onClose();
                      }
                    : undefined
                  : () => {
                      onEdit();
                      setChildMenu?.(null);
                    }
              }
              onDuplicate={
                isFocusChild
                  ? onDuplicate
                    ? (entries) => {
                        onDuplicate(entries);
                        setChildMenu?.(null);
                        onClose();
                      }
                    : undefined
                  : onDuplicate
              }
              onDelete={
                isFocusChild
                  ? onDelete
                    ? (entries) => {
                        onDelete(entries);
                        setChildMenu?.(null);
                        onClose();
                      }
                    : undefined
                  : onDelete
              }
              onAssignTimeBlock={onAssignTimeBlock}
              onAssignTimeBlocks={onAssignTimeBlocks}
            />
          );
        })()
      ) : null}
    </PopoverShell>
  );

  return createPortal(popoverContent, document.body);
};

export default CalendarEntryPopover;
