/**
 * CalendarStackPopover.tsx
 *
 * Folded-only inspector popover for Task Stack + Overlap Stack tiles.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil } from "lucide-react";
import { formatTimeLabel, type CalendarEvent, type CalendarTask } from "../utils";
import type { TeamMember as ProjectTeamMember } from "@/dashboard/project/components/Shared/types";
import ProjectAvatar from "@/shared/ui/ProjectAvatar";
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
  title: string;
  count?: number;
  avatars?: TimelineAvatar[];
  focusMeter?: { done: number; total: number } | null;
  projectColor: string;
  children: StackPopoverChild[];
  teamMembers?: ProjectTeamMember[];
  onClose: () => void;
  onEditTitle?: () => void;
  onRenameTitle?: (title: string) => void | Promise<void>;
  onOpenDetails: (child: StackPopoverChild, anchorElement: HTMLElement) => void;
  onPrimaryAction?: (child: StackPopoverChild) => void;
  onOpenContextMenu: (child: StackPopoverChild, event: React.MouseEvent<HTMLElement>) => void;
}

export const CalendarStackPopover: React.FC<CalendarStackPopoverProps> = ({
  anchorElement,
  kind,
  title,
  count,
  avatars,
  focusMeter,
  projectColor,
  children,
  teamMembers,
  onClose,
  onEditTitle,
  onRenameTitle,
  onOpenDetails,
  onPrimaryAction,
  onOpenContextMenu,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [titleOverride, setTitleOverride] = useState<string | null>(null);

  const memberLookup = useMemo(() => buildTeamMemberLookup(teamMembers), [teamMembers]);

  const headerAvatars = useMemo(() => {
    if (!avatars || avatars.length === 0) return null;
    const visible = avatars.slice(0, 3);
    const extra = Math.max(avatars.length - visible.length, 0);

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
  }, [avatars]);

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
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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
        const candidate = task.assignedTo ?? task.assigneeIds?.[0] ?? undefined;
        const userId = parseAssigneeUserId(candidate);
        const member = userId ? memberLookup.byId.get(userId) : undefined;
        const label = member
          ? `${member.firstName || ""} ${member.lastName || ""}`.trim() || member.userId
          : (candidate ? candidate.trim() : "Unassigned");
        const avatar = candidate ? getAvatarForAssignee(candidate, memberLookup, `group-${task.id}`) : null;
        return {
          groupKey: userId ?? label,
          label,
          avatar,
        };
      }

      const event = child.entry as CalendarEvent;
      const candidate = event.guests?.[0] ?? undefined;
      const userId = parseAssigneeUserId(candidate);
      const member = userId ? memberLookup.byId.get(userId) : undefined;
      const label = member
        ? `${member.firstName || ""} ${member.lastName || ""}`.trim() || member.userId
        : (candidate ? candidate.trim() : "Guests");
      const avatar = candidate ? getAvatarForGuest(candidate, memberLookup, `group-${event.id}`) : null;
      return {
        groupKey: userId ?? label,
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

  const popoverContent = (
    <div ref={popoverRef} className="calendar-entry-popover" role="dialog" aria-label="Stack details">
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
                    <button
                      key={row.child.entryKey}
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
                  ))}
              </div>
            </div>
          ))
        ) : (
          rows.map((row) => (
            <div
              key={row.child.entryKey}
              className="calendar-stack-popover__row calendar-stack-popover__row--list"
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
            </div>
          ))
        )}
      </div>
    </div>
  );

  return createPortal(popoverContent, document.body);
};
