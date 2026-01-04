/**
 * CalendarStackPopover.tsx
 *
 * Folded-only inspector popover for Task Stack + Overlap Stack tiles.
 */

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { CheckCircle, Pencil } from "lucide-react";
import type { CalendarEvent, CalendarTask } from "../utils";
import type { TeamMember as ProjectTeamMember } from "@/dashboard/project/components/Shared/types";
import ProjectAvatar from "@/shared/ui/ProjectAvatar";
import {
  buildEventAvatars,
  buildTeamMemberLookup,
  parseAssigneeUserId,
  type TimelineAvatar,
} from "./timelineLayout";

export type StackPopoverKind = "taskStack" | "overlapStack";

export type StackPopoverChild = {
  entryKey: string;
  entryType: "task" | "event";
  entry: CalendarTask | CalendarEvent;
};

export interface CalendarStackPopoverProps {
  anchorElement: HTMLElement;
  kind: StackPopoverKind;
  title: string;
  avatars?: TimelineAvatar[];
  projectColor: string;
  children: StackPopoverChild[];
  teamMembers?: ProjectTeamMember[];
  onClose: () => void;
  onEditTask: (task: CalendarTask) => void;
  onEditEvent: (event: CalendarEvent) => void;
  onMarkAsDone?: (tasks: CalendarTask[]) => void;
  onConvertToFocusBlock?: (tasks: CalendarTask[]) => void;
  onStartDragOut: (entryKey: string, pointerEvent: React.PointerEvent) => void;
}

type GroupedChildren = {
  label: string;
  avatar: TimelineAvatar | null;
  children: StackPopoverChild[];
};

const getDisplayName = (member?: ProjectTeamMember | null): string => {
  if (!member) return "";
  const full = `${member.firstName || ""} ${member.lastName || ""}`.trim();
  return full || member.userId || "";
};

export const CalendarStackPopover: React.FC<CalendarStackPopoverProps> = ({
  anchorElement,
  kind,
  title,
  avatars,
  projectColor,
  children,
  teamMembers,
  onClose,
  onEditTask,
  onEditEvent,
  onMarkAsDone,
  onConvertToFocusBlock,
  onStartDragOut,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  const memberLookup = useMemo(() => buildTeamMemberLookup(teamMembers), [teamMembers]);

  const headerAvatar = useMemo(() => {
    const first = avatars?.[0];
    if (!first) return null;
    return (
      <ProjectAvatar
        className="calendar-stack-popover__header-avatar"
        thumb={first.thumb ?? undefined}
        name={first.name}
        shape="circle"
        radius={12}
      />
    );
  }, [avatars]);

  const isSingleUser = Boolean((avatars?.length ?? 0) === 1);

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

  const groups: GroupedChildren[] = useMemo(() => {
    if (kind !== "overlapStack" || isSingleUser) {
      return [
        {
          label: "",
          avatar: null,
          children,
        },
      ];
    }

    const map = new Map<string, GroupedChildren>();

    children.forEach((child) => {
      if (child.entryType === "task") {
        const task = child.entry as CalendarTask;
        const userId = parseAssigneeUserId(task.assignedTo) ??
          (task.assigneeIds ? parseAssigneeUserId(task.assigneeIds[0]) : undefined);
        const member = userId ? memberLookup.byId.get(userId) : undefined;
        const label = getDisplayName(member) || "Unassigned";
        const avatar = member
          ? ({ key: member.userId, thumb: member.thumbnail ?? undefined, name: label } satisfies TimelineAvatar)
          : null;

        const groupKey = userId ?? label;
        const existing = map.get(groupKey) ?? { label, avatar, children: [] };
        existing.children.push(child);
        map.set(groupKey, existing);
        return;
      }

      const event = child.entry as CalendarEvent;
      const avatars = buildEventAvatars(event, memberLookup);
      const first = avatars[0] ?? null;
      const label = first?.name ?? "Event";
      const groupKey = first?.key ?? label;
      const existing = map.get(groupKey) ?? { label, avatar: first, children: [] };
      existing.children.push(child);
      map.set(groupKey, existing);
    });

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [children, isSingleUser, kind, memberLookup]);

  const focusBlockTasks = useMemo(() => {
    if (kind !== "taskStack") return [];
    return children
      .filter((child) => child.entryType === "task")
      .map((child) => child.entry as CalendarTask);
  }, [children, kind]);

  const handleConvertToFocusBlock = useCallback(() => {
    if (kind !== "taskStack") return;
    if (!onConvertToFocusBlock) return;
    if (focusBlockTasks.length === 0) return;
    onConvertToFocusBlock(focusBlockTasks);
    onClose();
  }, [focusBlockTasks, kind, onConvertToFocusBlock, onClose]);

  const popoverContent = (
    <div ref={popoverRef} className="calendar-entry-popover" role="dialog" aria-label="Stack details">
      <div className="calendar-entry-popover__header calendar-stack-popover__header">
        <button
          type="button"
          className="calendar-entry-popover__title-btn"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <div className="calendar-entry-popover__title">{title}</div>
          <Pencil className="calendar-entry-popover__edit-icon" aria-hidden />
        </button>
        {headerAvatar}
      </div>

      <div className="calendar-stack-popover__list">
        {groups.map((group) => (
          <div key={group.label || "__all"} className="calendar-stack-popover__group">
            {kind === "overlapStack" && !isSingleUser && (
              <div className="calendar-stack-popover__group-header">
                {group.avatar ? (
                  <ProjectAvatar
                    className="calendar-stack-popover__group-avatar"
                    thumb={group.avatar.thumb ?? undefined}
                    name={group.avatar.name}
                    shape="circle"
                    radius={10}
                  />
                ) : (
                  <div className="calendar-stack-popover__group-avatar calendar-stack-popover__group-avatar--empty" aria-hidden />
                )}
                <div className="calendar-stack-popover__group-title">{group.label}</div>
              </div>
            )}

            {group.children.map((child) => {
              const entryTitle = child.entry.title || (child.entryType === "task" ? "Untitled task" : "Untitled event");
              const entryTime =
                child.entryType === "task"
                  ? (child.entry as CalendarTask).start && (child.entry as CalendarTask).end
                    ? `${(child.entry as CalendarTask).start} - ${(child.entry as CalendarTask).end}`
                    : (child.entry as CalendarTask).start || "No time set"
                  : (child.entry as CalendarEvent).start && (child.entry as CalendarEvent).end
                  ? `${(child.entry as CalendarEvent).start} - ${(child.entry as CalendarEvent).end}`
                  : (child.entry as CalendarEvent).allDay
                  ? "All day"
                  : (child.entry as CalendarEvent).start || "No time set";

              const isDone =
                child.entryType === "task"
                  ? Boolean((child.entry as CalendarTask).done || (child.entry as CalendarTask).status === "archived")
                  : false;

              return (
                <div key={child.entryKey} className="calendar-stack-popover__row">
                  <button
                    type="button"
                    className={`calendar-stack-popover__item${isDone ? " is-done" : ""}`}
                    onClick={() => {
                      if (child.entryType === "task") {
                        onEditTask(child.entry as CalendarTask);
                      } else {
                        onEditEvent(child.entry as CalendarEvent);
                      }
                      onClose();
                    }}
                    title={entryTitle}
                  >
                    <span className="calendar-stack-popover__item-pill" style={{ background: projectColor }} aria-hidden />
                    <div className="calendar-stack-popover__item-title">{entryTitle}</div>
                    {kind === "overlapStack" && !isSingleUser && (
                      <div className="calendar-stack-popover__item-time">{entryTime}</div>
                    )}
                  </button>

                  <button
                    type="button"
                    className="calendar-stack-popover__pullout"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onStartDragOut(child.entryKey, e);
                    }}
                  >
                    Pull out
                  </button>

                  {child.entryType === "task" && onMarkAsDone && !isDone && (
                    <button
                      type="button"
                      className="calendar-stack-popover__done"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkAsDone([child.entry as CalendarTask]);
                        onClose();
                      }}
                    >
                      <CheckCircle aria-hidden />
                      Done
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {kind === "taskStack" && onConvertToFocusBlock && (
        <div className="calendar-stack-popover__footer">
          <button
            type="button"
            className="calendar-stack-popover__focus"
            onClick={handleConvertToFocusBlock}
          >
            Convert to Focus Block
          </button>
        </div>
      )}
    </div>
  );

  return createPortal(popoverContent, document.body);
};
