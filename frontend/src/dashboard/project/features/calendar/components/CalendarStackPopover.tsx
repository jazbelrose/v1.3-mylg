/**
 * CalendarStackPopover.tsx
 *
 * Folded-only inspector popover for Task Stack + Overlap Stack tiles.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil } from "lucide-react";
import { formatTimeLabel, type CalendarEvent, type CalendarTask } from "../utils";
import type { CalendarEntryType } from "./calendarInteractions";
import type { TeamMember as ProjectTeamMember } from "@/dashboard/project/components/Shared/types";
import ProjectAvatar from "@/shared/ui/ProjectAvatar";
import { formatAssigneeDisplay } from "@/dashboard/project/components/Tasks/utils";
import { fetchUserProfilesBatch } from "@/shared/utils/api";
import { Kebab } from "@/shared/icons/Kebab";
import {
  CalendarEntryContextMenu,
  type ChildMenuState,
  type ContextMenuEntry,
} from "./CalendarEntryContextMenu";
import {
  buildEventAvatars,
  buildTeamMemberLookup,
  buildTaskAvatars,
  getAvatarForAssignee,
  getAvatarForGuest,
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
}) => {
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

  const memberLookupByCompactName = useMemo(() => {
    const map = new Map<string, ProjectTeamMember>();
    effectiveTeamMembers.forEach((member) => {
      const first = (member.firstName ?? "").trim();
      const last = (member.lastName ?? "").trim();
      const compact = `${first}${last}`.replace(/\s+/g, "").toLowerCase();
      if (compact) {
        map.set(compact, member);
      }
    });
    return map;
  }, [effectiveTeamMembers]);

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
            thumbnail: typeof profile.thumbnail === "string" ? profile.thumbnail : null,
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
    if (kind !== "overlapStack") return avatars ?? [];
    // For overlap stacks, rebuild the header coin stack from resolved user groups,
    // so thumbnails can appear even when the stack entry was computed before we fetched missing profiles.
    return [] as TimelineAvatar[];
  }, [avatars, kind]);

  const isSingleUser = Boolean((avatars?.length ?? 0) === 1);
  const showRowAvatars = kind === "overlapStack" && !isSingleUser;

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

  const rows = useMemo(() => {
    const buildTimeRange = (child: StackPopoverChild): string => {
      if (child.entryType === "event") {
        const event = child.entry as CalendarEvent;
        if (event.allDay) return "All day";
        if (event.start && event.end) {
          return `${formatTimeLabel(event.start) ?? event.start}–${formatTimeLabel(event.end) ?? event.end}`;
        }
        return (formatTimeLabel(event.start) ?? event.start) || "";
      }
      const task = child.entry as CalendarTask;
      if (task.start && task.end) {
        return `${formatTimeLabel(task.start) ?? task.start}–${formatTimeLabel(task.end) ?? task.end}`;
      }
      return (formatTimeLabel(task.start) ?? task.start) || "";
    };

    const buildRowAvatar = (child: StackPopoverChild): TimelineAvatar | null => {
      if (!showRowAvatars) return null;
      if (child.entryType === "task") {
        const task = child.entry as CalendarTask;
        return buildTaskAvatars(task, memberLookup)[0] ?? null;
      }
      const event = child.entry as CalendarEvent;
      return buildEventAvatars(event, memberLookup)[0] ?? null;
    };

    const resolvePrimaryUser = (
      child: StackPopoverChild,
    ): { groupKey: string; label: string; avatar: TimelineAvatar | null } => {
      if (child.entryType === "task") {
        const task = child.entry as CalendarTask;

        const candidates = [...(task.assigneeIds ?? [])
          .map((id) => (typeof id === "string" ? id.trim() : ""))
          .filter(Boolean)];
        if (task.assignedTo) {
          candidates.push(task.assignedTo);
        }

        const resolveMemberFromCandidate = (value: string): ProjectTeamMember | undefined => {
          const userId = parseAssigneeUserId(value);
          if (userId) {
            const direct = memberLookup.byId.get(userId);
            if (direct) return direct;
          }
          const display = (formatAssigneeDisplay(value) ?? value).trim().toLowerCase();
          if (display) {
            const byDisplay = memberLookup.byDisplayName.get(display);
            if (byDisplay) return byDisplay;
          }

          const compact = (formatAssigneeDisplay(value) ?? value)
            .replace(/\s+/g, "")
            .trim()
            .toLowerCase();
          return compact ? memberLookupByCompactName.get(compact) : undefined;
        };

        const chosen = candidates.find((value) => Boolean(resolveMemberFromCandidate(value)))
          ?? candidates[0]
          ?? undefined;

        const member = chosen ? resolveMemberFromCandidate(chosen) : undefined;
        const label = member
          ? `${member.firstName || ""} ${member.lastName || ""}`.trim() || member.userId
          : chosen
          ? (formatAssigneeDisplay(chosen) ?? chosen.trim())
          : "Unassigned";

        const groupKey = member?.userId
          ?? (chosen ? (parseAssigneeUserId(chosen) ?? label) : "unassigned");

        const avatar = chosen ? getAvatarForAssignee(chosen, memberLookup, `group-${task.id}`) : null;
        return {
          groupKey,
          label,
          avatar,
        };
      }

      const event = child.entry as CalendarEvent;
      const candidates = (event.guests ?? []).map((guest) => guest?.trim()).filter(Boolean);

      const resolveMemberFromCandidate = (value: string): ProjectTeamMember | undefined => {
        const userId = parseAssigneeUserId(value);
        if (userId) {
          const direct = memberLookup.byId.get(userId);
          if (direct) return direct;
        }
        const display = (formatAssigneeDisplay(value) ?? value).trim().toLowerCase();
        if (display) {
          const byDisplay = memberLookup.byDisplayName.get(display);
          if (byDisplay) return byDisplay;
        }

        const compact = (formatAssigneeDisplay(value) ?? value)
          .replace(/\s+/g, "")
          .trim()
          .toLowerCase();
        return compact ? memberLookupByCompactName.get(compact) : undefined;
      };

      const chosen = candidates.find((value) => Boolean(resolveMemberFromCandidate(value)))
        ?? candidates[0]
        ?? undefined;

      const member = chosen ? resolveMemberFromCandidate(chosen) : undefined;
      const label = member
        ? `${member.firstName || ""} ${member.lastName || ""}`.trim() || member.userId
        : chosen
        ? (formatAssigneeDisplay(chosen) ?? chosen.trim())
        : "Guests";

      const groupKey = member?.userId
        ?? (chosen ? (parseAssigneeUserId(chosen) ?? label) : "guests");

      const avatar = chosen ? getAvatarForGuest(chosen, memberLookup, `group-${event.id}`) : null;
      return {
        groupKey,
        label,
        avatar,
      };
    };

    return [...children]
      .map((child) => {
        const title =
          child.entry.title || (child.entryType === "task" ? "Untitled task" : "Untitled event");
        const isDone =
          child.entryType === "task"
            ? ((child.entry as CalendarTask).status === "done" || (child.entry as CalendarTask).done === true)
            : false;
        const primaryUser = resolvePrimaryUser(child);
        return {
          child,
          title,
          time: buildTimeRange(child),
          avatar: buildRowAvatar(child),
          isDone,
          primaryUser,
        };
      })
      .sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
  }, [children, memberLookup, showRowAvatars]);

  const userStacks = useMemo(() => {
    if (kind !== "overlapStack") return null;
    const groups = new Map<
      string,
      { label: string; avatar: TimelineAvatar | null; rows: typeof rows }
    >();

    rows.forEach((row) => {
      const key = row.primaryUser.groupKey;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, { label: row.primaryUser.label, avatar: row.primaryUser.avatar, rows: [row] });
      } else {
        existing.rows.push(row);
      }
    });

    return [...groups.entries()]
      .map(([groupKey, group]) => ({ groupKey, ...group }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [kind, rows]);

  const headerAvatars = useMemo(() => {
    const derivedAvatars: TimelineAvatar[] =
      kind === "overlapStack"
        ? (userStacks ?? [])
            .map((group) => group.avatar)
            .filter((value): value is TimelineAvatar => Boolean(value))
        : (headerAvatarSource ?? []);

    if (!derivedAvatars || derivedAvatars.length === 0) return null;
    const visible = derivedAvatars.slice(0, 3);
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
  }, [headerAvatarSource, kind, userStacks]);

  const popoverContent = (
    <div
      ref={popoverRef}
      className="calendar-entry-popover"
      role="dialog"
      aria-label="Stack details"
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
        {kind === "overlapStack" && userStacks ? (
          userStacks.map((group) => (
            <div key={group.groupKey} className="calendar-stack-popover__user-stack">
              <div className="calendar-stack-popover__user-stack-header">
                {group.avatar ? (
                  <ProjectAvatar
                    className="calendar-stack-popover__group-avatar"
                    thumb={group.avatar.thumb ?? undefined}
                    name={group.avatar.name}
                    shape="circle"
                    radius={9}
                  />
                ) : (
                  <span
                    className="calendar-stack-popover__group-avatar calendar-stack-popover__group-avatar--empty"
                    aria-hidden
                  />
                )}
                <span className="calendar-stack-popover__user-stack-name">{group.label}</span>
                <span className="calendar-stack-popover__user-stack-count" aria-label={`${group.rows.length} items`}>
                  {group.rows.length}
                </span>
              </div>

              <div className="calendar-stack-popover__user-stack-items">
                {group.rows
                  .sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title))
                  .map((row) => (
                    <div key={row.child.entryKey} className="calendar-stack-popover__row">
                      <button
                        type="button"
                        className={`calendar-stack-popover__item${row.isDone ? " is-done" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onPrimaryAction) {
                            onPrimaryAction(row.child);
                            return;
                          }
                          onOpenDetails(row.child, e.currentTarget);
                        }}
                        onContextMenu={(e) => {
                          e.stopPropagation();
                          onOpenContextMenu(row.child, e);
                        }}
                        title={row.title}
                      >
                        <span
                          className="calendar-stack-popover__item-pill"
                          style={{ background: projectColor }}
                          aria-hidden
                        />
                        <div className="calendar-stack-popover__item-title">{row.title}</div>
                        {row.time ? <div className="calendar-stack-popover__item-time">{row.time}</div> : null}
                      </button>

                      <button
                        type="button"
                        className="calendar-stack-popover__row-actions"
                        aria-label="Actions"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!setChildMenu) return;
                          const ownerId = `${row.child.entryType}:${row.child.entry.id}`;
                          setChildMenu((prev) => {
                            const isSame =
                              prev && prev.parentId === parentId && prev.ownerId === ownerId;
                            if (isSame) return null;
                            return {
                              kind: "stack_row_actions",
                              parentId,
                              ownerId,
                              anchorEl: e.currentTarget,
                              entryType: row.child.entryType,
                              entry: row.child.entry,
                            };
                          });
                        }}
                      >
                        <Kebab className="calendar-stack-popover__row-actions-icon" />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          ))
        ) : (
          rows.map((row) => (
            <div
              key={row.child.entryKey}
              className="calendar-stack-popover__row"
            >
              <button
                type="button"
                className={`calendar-stack-popover__item${row.isDone ? " is-done" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDetails(row.child, e.currentTarget);
                }}
                onContextMenu={(e) => {
                  e.stopPropagation();
                  onOpenContextMenu(row.child, e);
                }}
                title={row.title}
              >
                <span
                  className="calendar-stack-popover__item-pill"
                  style={{ background: projectColor }}
                  aria-hidden
                />
                <div className="calendar-stack-popover__item-title">{row.title}</div>
                {row.time ? <div className="calendar-stack-popover__item-time">{row.time}</div> : null}
                {row.avatar ? (
                  <span className="calendar-stack-popover__row-avatar" aria-hidden>
                    <ProjectAvatar
                      className="calendar-stack-popover__row-avatar-img"
                      thumb={row.avatar.thumb ?? undefined}
                      name={row.avatar.name}
                      shape="circle"
                      radius={9}
                    />
                  </span>
                ) : null}
              </button>

              <button
                type="button"
                className="calendar-stack-popover__row-actions"
                aria-label="Actions"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!setChildMenu) return;
                  const ownerId = `${row.child.entryType}:${row.child.entry.id}`;
                  setChildMenu((prev) => {
                    const isSame = prev && prev.parentId === parentId && prev.ownerId === ownerId;
                    if (isSame) return null;
                    return {
                      kind: "stack_row_actions",
                      parentId,
                      ownerId,
                      anchorEl: e.currentTarget,
                      entryType: row.child.entryType,
                      entry: row.child.entry,
                    };
                  });
                }}
              >
                <Kebab className="calendar-stack-popover__row-actions-icon" />
              </button>
            </div>
          ))
        )}
      </div>

      {childMenu && childMenu.parentId === parentId ? (
        (() => {
          const rect = childMenu.anchorEl.getBoundingClientRect();
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
    </div>
  );

  return createPortal(popoverContent, document.body);
};
