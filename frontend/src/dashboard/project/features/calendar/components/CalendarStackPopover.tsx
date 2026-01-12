/**
 * CalendarStackPopover.tsx
 *
 * Folded-only inspector popover for Task Stack + Overlap Stack tiles.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil } from "lucide-react";
import {
  formatCompactTimeLabel,
  formatCompactTimeRange,
  formatTimeLabel,
  type CalendarEvent,
  type CalendarTask,
} from "../utils";
import type { CalendarEntryType } from "./calendarInteractions";
import type { TeamMember as ProjectTeamMember } from "@/dashboard/project/components/Shared/types";
import ProjectAvatar from "@/shared/ui/ProjectAvatar";
import { fetchUserProfilesBatch } from "@/shared/utils/api";
import {
  CalendarEntryContextMenu,
  type ChildMenuState,
  type ContextMenuEntry,
} from "./CalendarEntryContextMenu";
import { PopoverShell } from "./PopoverShell";
import { CalendarEntryRow } from "./CalendarEntryRow";
import {
  buildEventAvatars,
  buildTeamMemberLookup,
  buildTaskAvatars,
  parseAssigneeUserId,
  type TimelineAvatar,
} from "./timelineLayout";

export type StackPopoverKind = "taskStack" | "overlapStack";

export type StackPopoverChild = {
  entryKey: string;
  entryType: "task" | "event";
  entry: CalendarTask | CalendarEvent;
  dayKey: string;
  startMinutes: number;
  endMinutes: number;
};

export interface CalendarStackPopoverProps {
  anchorElement: HTMLElement;
  kind: StackPopoverKind;
  parentId: string;
  title: string;
  count?: number;
  avatars?: TimelineAvatar[];
  focusMeter?: { done: number; total: number } | null;
  projectColor: string;
  children: StackPopoverChild[];
  teamMembers?: ProjectTeamMember[];
  childMenu?: ChildMenuState;
  setChildMenu?: React.Dispatch<React.SetStateAction<ChildMenuState>>;
  onClose: () => void;
  onEditTitle?: () => void;
  onRenameTitle?: (title: string) => void | Promise<void>;
  onOpenDetails: (child: StackPopoverChild, anchorElement: HTMLElement) => void;
  onPrimaryAction?: (child: StackPopoverChild) => void;
  onOpenContextMenu: (child: StackPopoverChild, event: React.MouseEvent<HTMLElement>) => void;
  onEditEntry?: (entryType: CalendarEntryType, entry: CalendarTask | CalendarEvent) => void;
  onDuplicateEntry?: (entries: ContextMenuEntry[]) => void;
  onDeleteEntry?: (entries: ContextMenuEntry[]) => void;
  /**
   * Called when user starts dragging a child entry out of the stack.
   * The parent (WeekGrid) should start a drag interaction for this entry.
   */
  onStartDragChild?: (child: StackPopoverChild, event: React.PointerEvent<HTMLElement>) => void;
}

export const CalendarStackPopover: React.FC<CalendarStackPopoverProps> = ({
  anchorElement,
  kind,
  parentId,
  title,
  count,
  avatars,
  focusMeter,
  projectColor,
  children,
  teamMembers,
  childMenu,
  setChildMenu,
  onClose,
  onEditTitle,
  onRenameTitle,
  onOpenDetails,
  onPrimaryAction,
  onOpenContextMenu,
  onEditEntry,
  onDuplicateEntry,
  onDeleteEntry,
  onStartDragChild,
}) => {
  const DRAG_PX = 8;
  const LONG_PRESS_MS = 220;
  const TOUCH_SLOP_PX = 12;

  const popoverRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [titleOverride, setTitleOverride] = useState<string | null>(null);

  const [extraMembers, setExtraMembers] = useState<ProjectTeamMember[]>([]);
  const fetchedUserIdsRef = useRef(new Set<string>());
  const fetchingUserIdsRef = useRef<Set<string> | null>(null);

  const effectiveTeamMembers = useMemo(() => {
    const merged = new Map<string, ProjectTeamMember>();
    (teamMembers ?? []).forEach((member) => {
      if (member?.userId) merged.set(member.userId, member);
    });
    extraMembers.forEach((member) => {
      if (!member?.userId) return;
      if (!merged.has(member.userId)) {
        merged.set(member.userId, member);
      }
    });
    return Array.from(merged.values());
  }, [teamMembers, extraMembers]);

  const memberLookup = useMemo(
    () => buildTeamMemberLookup(effectiveTeamMembers),
    [effectiveTeamMembers],
  );

  useEffect(() => {
    if (kind !== "overlapStack") return;

    const isViableUserId = (value: string): boolean => {
      const trimmed = value.trim();
      if (!trimmed) return false;
      if (trimmed.length > 128) return false;
      if (trimmed.includes(",")) return false;
      if (/\s/.test(trimmed)) return false;
      return true;
    };

    const baseKnownIds = new Set(
      (teamMembers ?? []).map((m) => m.userId).filter(Boolean),
    );

    const idsToFetch = new Set<string>();
    children.forEach((child) => {
      const collect = (value?: string | null) => {
        if (!value) return;
        const id = parseAssigneeUserId(value);
        if (!id) return;
        const normalized = id.trim();
        if (!isViableUserId(normalized)) return;
        if (baseKnownIds.has(normalized)) return;
        if (fetchedUserIdsRef.current.has(normalized)) return;
        if (fetchingUserIdsRef.current?.has(normalized)) return;
        idsToFetch.add(normalized);
      };

      if (child.entryType === "task") {
        const task = child.entry as CalendarTask;
        collect(task.assignedTo);
        (task.assigneeIds ?? []).forEach((candidate) => collect(candidate));
        return;
      }
      const event = child.entry as CalendarEvent;
      (event.guests ?? []).forEach((candidate) => collect(candidate));
    });

    const ids = Array.from(idsToFetch);
    if (ids.length === 0) return;

    fetchingUserIdsRef.current = new Set(ids);
    let cancelled = false;

    fetchUserProfilesBatch(ids)
      .then((profiles) => {
        if (cancelled) return;

        const members: ProjectTeamMember[] = (profiles ?? [])
          .filter((profile) => Boolean(profile?.userId))
          .map((profile) => ({
            userId: String(profile.userId),
            firstName: typeof profile.firstName === "string" ? profile.firstName : "",
            lastName: typeof profile.lastName === "string" ? profile.lastName : "",
            thumbnail:
              (typeof profile.thumbnail === "string" && profile.thumbnail) ||
              (typeof (profile as { thumbnailUrl?: unknown }).thumbnailUrl === "string" &&
                (profile as { thumbnailUrl?: string }).thumbnailUrl) ||
              (typeof (profile as { avatar?: unknown }).avatar === "string" && (profile as { avatar?: string }).avatar) ||
              (typeof (profile as { avatarUrl?: unknown }).avatarUrl === "string" &&
                (profile as { avatarUrl?: string }).avatarUrl) ||
              null,
          }));

        members.forEach((m) => fetchedUserIdsRef.current.add(m.userId));
        setExtraMembers((prev) => {
          const merged = new Map(prev.map((m) => [m.userId, m]));
          members.forEach((m) => {
            if (!merged.has(m.userId)) merged.set(m.userId, m);
          });
          return Array.from(merged.values());
        });
      })
      .catch(() => {
        // Ignore: calendar can still render initials for unknown users.
      })
      .finally(() => {
        fetchingUserIdsRef.current = null;
      });

    return () => {
      cancelled = true;
    };
  }, [children, kind, teamMembers]);

  const headerAvatarSource = useMemo(() => {
    const dedupe = (items: TimelineAvatar[]): TimelineAvatar[] => {
      const out: TimelineAvatar[] = [];
      const seen = new Set<string>();
      for (const item of items) {
        const stableId = item.entityId ?? item.key;
        if (seen.has(stableId)) continue;
        seen.add(stableId);
        out.push(item);
      }
      return out;
    };

    const fromChildren = (): TimelineAvatar[] => {
      const collected: TimelineAvatar[] = [];
      children.forEach((child) => {
        if (child.entryType === "task") {
          collected.push(...buildTaskAvatars(child.entry as CalendarTask, memberLookup));
          return;
        }
        collected.push(...buildEventAvatars(child.entry as CalendarEvent, memberLookup));
      });
      return dedupe(collected);
    };

    if (kind === "overlapStack") {
      // For overlap stacks, rebuild the header coin stack from resolved members,
      // so thumbnails can appear even when the stack tile was computed before profile fetches completed.
      return fromChildren();
    }

    if (avatars && avatars.length > 0) return dedupe(avatars);
    return fromChildren();
  }, [avatars, children, kind, memberLookup]);

  const canInlineRename = Boolean(onRenameTitle);
  const displayTitle = titleOverride ?? title;
  const displayTitleWithCount =
    kind === "overlapStack"
      ? displayTitle
      : typeof count === "number"
      ? `${displayTitle} (${count})`
      : displayTitle;

  useEffect(() => {
    if (!isEditingTitle) return;
    const raf = requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [isEditingTitle]);

  const beginEditTitle = useCallback(() => {
    if (!canInlineRename) {
      onEditTitle?.();
      return;
    }

    setDraftTitle((displayTitle ?? "").trim());
    setIsEditingTitle(true);
  }, [canInlineRename, displayTitle, onEditTitle]);

  const commitTitle = useCallback(async () => {
    if (!onRenameTitle) {
      setIsEditingTitle(false);
      return;
    }
    const next = draftTitle.trim();
    if (!next) {
      setIsEditingTitle(false);
      return;
    }
    try {
      await onRenameTitle(next);
      setTitleOverride(next);
    } finally {
      setIsEditingTitle(false);
    }
  }, [draftTitle, onRenameTitle]);

  const cancelTitleEdit = useCallback(() => {
    setIsEditingTitle(false);
    setDraftTitle("");
  }, []);

  useEffect(() => {
    if (!popoverRef.current || !anchorElement) return;

    const popover = popoverRef.current;
    const anchorRect = anchorElement.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = anchorRect.right + 8;
    let top = anchorRect.top;

    if (left + popoverRect.width > viewportWidth - 16) {
      left = anchorRect.left - popoverRect.width - 8;
    }

    if (left < 16) {
      left = Math.max(16, (viewportWidth - popoverRect.width) / 2);
    }

    if (top + popoverRect.height > viewportHeight - 16) {
      top = viewportHeight - popoverRect.height - 16;
    }
    if (top < 16) {
      top = 16;
    }

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }, [anchorElement]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (childMenu && childMenu.parentId === parentId && setChildMenu) {
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

  const closeChildMenuIfOwned = useCallback(() => {
    if (!setChildMenu) return;
    if (!childMenu) return;
    if (childMenu.parentId !== parentId) return;
    setChildMenu(null);
  }, [childMenu, parentId, setChildMenu]);

  // Defensive: if an anchored child menu loses its anchor element (e.g. rerender/unmount)
  // close it instead of crashing on getBoundingClientRect.
  useEffect(() => {
    if (!childMenu || childMenu.parentId !== parentId) return;
    const anchorEl = (childMenu.anchorEl as unknown as HTMLElement | null) ?? null;
    if (!anchorEl || typeof (anchorEl as any).getBoundingClientRect !== "function") {
      setChildMenu?.(null);
    }
  }, [childMenu, parentId, setChildMenu]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const targetElement = target instanceof HTMLElement ? target : null;

      // If the user is interacting with another calendar popover (e.g. the single-item details popover
      // opened from this list), don't treat it as an outside click.
      if (targetElement?.closest(".calendar-entry-popover")) {
        return;
      }
      // If the user is interacting with the right-click context menu, don't treat it as an outside click.
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

    const timeoutId = window.setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [anchorElement, onClose]);

  const [collapsedFocusIds, setCollapsedFocusIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setCollapsedFocusIds(new Set());
  }, [parentId]);

  const rows = useMemo(() => {
    type RowBase = {
      child: StackPopoverChild;
      title: string;
      time: string;
      isDone: boolean;
      entryType: StackPopoverChild["entryType"];
      taskId?: string;
      parentFocusId?: string;
      focusChildIds?: string[];
      isFocusBlockSeed: boolean;
    };

    const buildTimeRange = (child: StackPopoverChild): string => {
      if (child.entryType === "event") {
        const event = child.entry as CalendarEvent;
        if (event.allDay) return "All day";
        if (event.start && event.end) {
          return formatCompactTimeRange(event.start, event.end);
        }
        return (formatCompactTimeLabel(event.start) ?? formatTimeLabel(event.start) ?? event.start) || "";
      }
      const task = child.entry as CalendarTask;
      if (task.start && task.end) {
        return formatCompactTimeRange(task.start, task.end);
      }
      return (formatCompactTimeLabel(task.start) ?? formatTimeLabel(task.start) ?? task.start) || "";
    };

    const resolveTaskId = (task: CalendarTask): string => {
      const source = task.source as unknown as { taskId?: unknown };
      const sourceId = typeof source?.taskId === "string" ? source.taskId.trim() : "";
      const localId = typeof task.id === "string" ? task.id.trim() : "";
      return sourceId || localId;
    };

    const resolveParentFocusId = (task: CalendarTask): string | undefined => {
      const direct = typeof task.focusBlockId === "string" ? task.focusBlockId.trim() : "";
      if (direct) return direct;
      const source = task.source as unknown as { focusBlockId?: unknown };
      const fromSource = typeof source?.focusBlockId === "string" ? source.focusBlockId.trim() : "";
      return fromSource || undefined;
    };

    const base: RowBase[] = [...children].map((child) => {
      const title =
        child.entry.title || (child.entryType === "task" ? "Untitled task" : "Untitled event");

      if (child.entryType !== "task") {
        return {
          child,
          entryType: child.entryType,
          title,
          time: buildTimeRange(child),
          isDone: false,
          isFocusBlockSeed: false,
        };
      }

      const task = child.entry as CalendarTask;
      const normalizedKind = String(task.kind ?? "").trim().toLowerCase();
      const hasDeclaredChildren =
        (task.focusChildTaskIds && task.focusChildTaskIds.length > 0) ||
        (task.focusChecklist && task.focusChecklist.length > 0);

      const focusChildIds = [
        ...(task.focusChildTaskIds ?? []),
        ...(task.focusChecklist ?? []).map((item) => item.taskId),
      ]
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean);

      return {
        child,
        entryType: child.entryType,
        title,
        time: buildTimeRange(child),
        isDone: task.status === "done" || task.done === true,
        taskId: resolveTaskId(task),
        parentFocusId: resolveParentFocusId(task),
        focusChildIds,
        isFocusBlockSeed: normalizedKind === "focus_block" || hasDeclaredChildren,
      };
    });

    const byTaskId = new Map<string, RowBase>();
    base.forEach((row) => {
      if (row.entryType !== "task") return;
      const id = row.taskId;
      if (!id) return;
      byTaskId.set(id, row);
    });

    const parentByTaskId = new Map<string, string>();
    const childrenByFocusId = new Map<string, Set<string>>();

    const ensureChildSet = (focusId: string): Set<string> => {
      const existing = childrenByFocusId.get(focusId);
      if (existing) return existing;
      const next = new Set<string>();
      childrenByFocusId.set(focusId, next);
      return next;
    };

    // 1) Link children by `focusBlockId` (when the parent is also present in this list).
    base.forEach((row) => {
      if (row.entryType !== "task") return;
      if (!row.taskId) return;
      const parent = row.parentFocusId;
      if (!parent) return;
      if (!byTaskId.has(parent)) return;
      parentByTaskId.set(row.taskId, parent);
      ensureChildSet(parent).add(row.taskId);
    });

    // 2) Link children by the Focus Block's declared references (legacy support).
    base.forEach((row) => {
      if (row.entryType !== "task") return;
      if (!row.taskId) return;
      if (!row.isFocusBlockSeed) return;
      const focusId = row.taskId;
      (row.focusChildIds ?? []).forEach((childId) => {
        if (!childId) return;
        if (childId === focusId) return;
        if (!byTaskId.has(childId)) return;
        if (parentByTaskId.has(childId)) return;
        parentByTaskId.set(childId, focusId);
        ensureChildSet(focusId).add(childId);
      });
    });

    const isFocusBlockTaskId = (taskId: string): boolean => {
      const row = byTaskId.get(taskId);
      if (!row) return false;
      if (row.isFocusBlockSeed) return true;
      const children = childrenByFocusId.get(taskId);
      return Boolean(children && children.size > 0);
    };

    const sortKeys = (rowsToSort: RowBase[]): RowBase[] =>
      rowsToSort.slice().sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title));

    const descendantCache = new Map<string, string[]>();
    const collectDescendants = (focusId: string): string[] => {
      const cached = descendantCache.get(focusId);
      if (cached) return cached;

      const out: string[] = [];
      const visited = new Set<string>();
      const walk = (id: string) => {
        const set = childrenByFocusId.get(id);
        if (!set) return;
        for (const childId of set) {
          if (visited.has(childId)) continue;
          visited.add(childId);
          out.push(childId);
          walk(childId);
        }
      };
      walk(focusId);
      descendantCache.set(focusId, out);
      return out;
    };

    const buildFocusPreview = (titles: string[]): string | undefined => {
      const cleaned = titles.map((t) => t.trim()).filter(Boolean);
      if (cleaned.length === 0) return undefined;
      const visible = cleaned.slice(0, 3);
      const extra = Math.max(cleaned.length - visible.length, 0);
      return extra > 0 ? `${visible.join(" • ")} • +${extra}` : visible.join(" • ");
    };

    const topLevel = sortKeys(
      base.filter((row) => {
        if (row.entryType !== "task") return true;
        if (!row.taskId) return true;
        return !parentByTaskId.has(row.taskId);
      }),
    );

    const flattened: Array<{
      child: StackPopoverChild;
      title: string;
      time: string;
      isDone: boolean;
      isFocusBlock: boolean;
      focusId?: string;
      hasChildren: boolean;
      isExpanded: boolean;
      level: number;
      avatars: TimelineAvatar[];
      preview?: string;
      progressLabel?: string;
    }> = [];

    const buildRowAvatars = (row: RowBase): TimelineAvatar[] => {
      if (row.entryType === "event") {
        return buildEventAvatars(row.child.entry as CalendarEvent, memberLookup);
      }
      return buildTaskAvatars(row.child.entry as CalendarTask, memberLookup);
    };

    const buildDerivedFocusAvatars = (focusId: string): TimelineAvatar[] => {
      const avatarList: TimelineAvatar[] = [];
      const stable = new Set<string>();

      const add = (avatarsToAdd: TimelineAvatar[]) => {
        avatarsToAdd.forEach((avatar) => {
          if (avatarList.length >= 4) return;
          const stableId = avatar.entityId ?? avatar.key;
          if (stable.has(stableId)) return;
          stable.add(stableId);
          avatarList.push(avatar);
        });
      };

      const focusRow = byTaskId.get(focusId);
      if (focusRow) {
        add(buildRowAvatars(focusRow));
      }

      collectDescendants(focusId).forEach((taskId) => {
        const row = byTaskId.get(taskId);
        if (!row) return;
        if (isFocusBlockTaskId(taskId)) return;
        add(buildRowAvatars(row));
      });

      return avatarList;
    };

    const buildProgressLabel = (focusId: string): string | undefined => {
      const descendantTasks = collectDescendants(focusId)
        .map((taskId) => byTaskId.get(taskId))
        .filter((row): row is RowBase => Boolean(row))
        .filter((row) => !isFocusBlockTaskId(row.taskId ?? ""));

      if (descendantTasks.length === 0) return undefined;
      const done = descendantTasks.reduce((sum, row) => sum + (row.isDone ? 1 : 0), 0);
      return `${done}/${descendantTasks.length}`;
    };

    const buildFocusPreviewTitles = (focusId: string): string | undefined => {
      const descendantTasks = collectDescendants(focusId)
        .map((taskId) => byTaskId.get(taskId))
        .filter((row): row is RowBase => Boolean(row))
        .filter((row) => !isFocusBlockTaskId(row.taskId ?? ""))
        .map((row) => row.title);
      return buildFocusPreview(descendantTasks);
    };

    const pushFlattened = (row: RowBase, level: number) => {
      const taskId = row.taskId;
      const isFocusBlock = row.entryType === "task" && Boolean(taskId && isFocusBlockTaskId(taskId));
      const hasChildren = Boolean(taskId && (childrenByFocusId.get(taskId)?.size ?? 0) > 0);
      const isExpanded = Boolean(taskId && !collapsedFocusIds.has(taskId));

      const avatarsForRow = isFocusBlock && taskId ? buildDerivedFocusAvatars(taskId) : buildRowAvatars(row);
      const progressLabel = isFocusBlock && taskId ? buildProgressLabel(taskId) : undefined;
      const preview = isFocusBlock && taskId ? buildFocusPreviewTitles(taskId) : undefined;

      flattened.push({
        child: row.child,
        title: row.title,
        time: row.time,
        isDone: row.isDone,
        isFocusBlock,
        focusId: taskId,
        hasChildren,
        isExpanded,
        level,
        avatars: avatarsForRow,
        preview,
        progressLabel,
      });

      if (!isFocusBlock || !hasChildren || !isExpanded || !taskId) return;

      const childIds = Array.from(childrenByFocusId.get(taskId) ?? []);
      const childRows = childIds
        .map((id) => byTaskId.get(id))
        .filter((r): r is RowBase => Boolean(r));
      sortKeys(childRows).forEach((childRow) => pushFlattened(childRow, level + 1));
    };

    topLevel.forEach((row) => pushFlattened(row, 0));
    return flattened;
  }, [children, collapsedFocusIds, memberLookup]);

  const headerAvatars = useMemo(() => {
    const derivedAvatars: TimelineAvatar[] = headerAvatarSource ?? [];

    if (!derivedAvatars || derivedAvatars.length === 0) return null;
    const visible = derivedAvatars.slice(0, 4);
    const extra = Math.max(derivedAvatars.length - visible.length, 0);

    return (
      <div className="calendar-stack-popover__header-avatars" aria-hidden>
        <div className="calendar-entry-popover__avatars" aria-hidden>
          {visible.map((avatar, index) => (
            <span
              key={avatar.key}
              className="calendar-entry-popover__avatar-wrapper"
              style={{
                zIndex: visible.length - index,
                marginLeft: index > 0 ? "-8px" : 0,
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
        {extra > 0 ? <span className="calendar-entry-popover__badge">+{extra}</span> : null}
      </div>
    );
  }, [headerAvatarSource]);

  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);

  const pointerStateRef = useRef<{
    child: StackPopoverChild;
    pointerId: number;
    pointerType: string;
    startX: number;
    startY: number;
    didDrag: boolean;
    dragArmed: boolean;
    longPressTimer: number | null;
    cancelled: boolean;
  } | null>(null);

  const clearPointerState = useCallback(() => {
    const state = pointerStateRef.current;
    if (state?.longPressTimer) {
      window.clearTimeout(state.longPressTimer);
    }
    pointerStateRef.current = null;
  }, []);

  const startDragIfPossible = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, child: StackPopoverChild) => {
      if (!onStartDragChild) return;
      const state = pointerStateRef.current;
      if (!state || state.didDrag || state.cancelled) return;

      state.didDrag = true;
      if (state.longPressTimer) {
        window.clearTimeout(state.longPressTimer);
        state.longPressTimer = null;
      }

      event.preventDefault();
      event.stopPropagation();
      setActiveRowKey(child.entryKey);
      onStartDragChild(child, event);
    },
    [onStartDragChild],
  );

  const handleRowPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, child: StackPopoverChild) => {
      // Only initiate interactions on primary button.
      if (event.button !== 0) return;
      // If user is editing title, ignore.
      if (isEditingTitle) return;

      // Capture pointer so move/up events continue even if cursor leaves the row.
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }

      setActiveRowKey(child.entryKey);

      const pointerType = event.pointerType || "mouse";
      const isTouch = pointerType === "touch";

      const nextState = {
        child,
        pointerId: event.pointerId,
        pointerType,
        startX: event.clientX,
        startY: event.clientY,
        didDrag: false,
        dragArmed: !isTouch,
        longPressTimer: null as number | null,
        cancelled: false,
      };

      if (isTouch) {
        nextState.longPressTimer = window.setTimeout(() => {
          const st = pointerStateRef.current;
          if (!st) return;
          if (st.pointerId !== event.pointerId) return;
          if (st.cancelled || st.didDrag) return;
          st.dragArmed = true;
        }, LONG_PRESS_MS);
      }

      pointerStateRef.current = nextState;
    },
    [LONG_PRESS_MS, isEditingTitle],
  );

  const handleRowPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = pointerStateRef.current;
      if (!state) return;
      if (event.pointerId !== state.pointerId) return;
      if (state.didDrag || state.cancelled) return;

      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      const dist = Math.hypot(dx, dy);

      const isTouch = state.pointerType === "touch";
      if (isTouch && !state.dragArmed) {
        // Cancel long-press if user moves too much before the timer fires.
        if (dist > TOUCH_SLOP_PX) {
          state.cancelled = true;
          if (state.longPressTimer) {
            window.clearTimeout(state.longPressTimer);
            state.longPressTimer = null;
          }
        }
        return;
      }

      // Start drag once threshold is exceeded.
      const threshold = isTouch ? TOUCH_SLOP_PX : DRAG_PX;
      if (dist >= threshold) {
        startDragIfPossible(event, state.child);
      }
    },
    [DRAG_PX, TOUCH_SLOP_PX, startDragIfPossible],
  );

  const handleRowPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = pointerStateRef.current;
      if (!state) return;
      if (event.pointerId !== state.pointerId) return;

      const child = state.child;
      const didDrag = state.didDrag;
      clearPointerState();

      if (didDrag) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      // Short click → primary action (edit) WITHOUT using onClick.
      event.preventDefault();
      event.stopPropagation();
      if (onPrimaryAction) {
        onPrimaryAction(child);
        return;
      }
      onOpenDetails(child, event.currentTarget);
    },
    [clearPointerState, onOpenDetails, onPrimaryAction],
  );

  const handleRowPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = pointerStateRef.current;
      if (!state) return;
      if (event.pointerId !== state.pointerId) return;
      clearPointerState();
    },
    [clearPointerState],
  );

  const popoverContent = (
    <PopoverShell
      ref={popoverRef}
      ariaLabel="Stack details"
      onMouseDownCapture={(e) => {
        if (!childMenu || childMenu.parentId !== parentId) return;
        const target = e.target as HTMLElement;
        if (target?.closest(".calendar-entry-context-menu")) return;
        closeChildMenuIfOwned();
      }}
      onWheelCapture={() => closeChildMenuIfOwned()}
      onScrollCapture={() => closeChildMenuIfOwned()}
    >
      <div className="calendar-entry-popover__header calendar-stack-popover__header">
        {(canInlineRename || onEditTitle) ? (
          canInlineRename && isEditingTitle ? (
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
              onClick={(e) => {
                e.stopPropagation();
                beginEditTitle();
              }}
              title={canInlineRename ? "Click to rename" : "Click to edit"}
            >
              <span className="calendar-entry-popover__title">{displayTitleWithCount}</span>
              <Pencil className="calendar-entry-popover__edit-icon" aria-hidden />
            </button>
          )
        ) : (
          <div className="calendar-entry-popover__title">{displayTitleWithCount}</div>
        )}

        <div className="calendar-stack-popover__header-right" aria-hidden>
          {focusMeter && focusMeter.total > 0 ? (
            <span className="calendar-entry-popover__status calendar-entry-popover__status--focus-meter">
              {focusMeter.done}/{focusMeter.total}
            </span>
          ) : null}
          {headerAvatars}
        </div>
      </div>

      <div className="calendar-stack-popover__list">
        {rows.map((row) => (
          <div
            key={row.child.entryKey}
            className="calendar-stack-popover__row calendar-stack-popover__row--list"
          >
            <CalendarEntryRow
              entryType={row.child.entryType}
              title={row.title}
              timeLabel={row.time}
              isDone={row.isDone}
              taskIcon={row.child.entryType === "task" && row.isFocusBlock ? "stack" : undefined}
              level={row.level}
              preview={row.preview}
              progressLabel={row.progressLabel}
              disclosure={
                row.child.entryType === "task" && row.isFocusBlock && row.hasChildren && row.focusId
                  ? {
                      visible: true,
                      expanded: row.isExpanded,
                      onToggle: () => {
                        setCollapsedFocusIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.focusId as string)) next.delete(row.focusId as string);
                          else next.add(row.focusId as string);
                          return next;
                        });
                      },
                      ariaLabel: row.isExpanded ? "Collapse Focus Block" : "Expand Focus Block",
                    }
                  : undefined
              }
              avatars={row.avatars}
              isSelected={activeRowKey === row.child.entryKey}
              draggable={Boolean(onStartDragChild)}
              showDragHandle={kind !== "overlapStack"}
              onPointerDown={(e) => {
                e.stopPropagation();
                handleRowPointerDown(e, row.child);
              }}
              onPointerMove={handleRowPointerMove}
              onPointerUp={handleRowPointerUp}
              onPointerCancel={handleRowPointerCancel}
              onContextMenu={(e) => {
                e.stopPropagation();
                setActiveRowKey(row.child.entryKey);
                onOpenContextMenu(row.child, e);
              }}
              titleAttr={row.title}
            />

            {/* Actions via right-click on the row. */}
          </div>
        ))}
      </div>

      {childMenu && childMenu.parentId === parentId ? (
        (() => {
          const anchorEl = (childMenu.anchorEl as unknown as HTMLElement | null) ?? null;
          if (!anchorEl || typeof anchorEl.getBoundingClientRect !== "function") {
            return null;
          }
          const rect = anchorEl.getBoundingClientRect();
          const position = { x: rect.left, y: rect.bottom + 6 };
          return (
            <CalendarEntryContextMenu
              portal={false}
              dismissOnOutsideClick={false}
              dismissOnEscape={false}
              position={position}
              entryType={childMenu.entryType}
              entry={childMenu.entry}
              onClose={() => setChildMenu?.(null)}
              onEdit={(e) => {
                onEditEntry?.(childMenu.entryType, e);
                setChildMenu?.(null);
              }}
              onDuplicate={onDuplicateEntry}
              onDelete={onDeleteEntry}
            />
          );
        })()
      ) : null}
    </PopoverShell>
  );

  return createPortal(popoverContent, document.body);
};
