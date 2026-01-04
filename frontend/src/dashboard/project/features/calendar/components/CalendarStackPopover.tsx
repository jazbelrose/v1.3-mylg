/**
 * CalendarStackPopover.tsx
 *
 * Folded-only inspector popover for Task Stack + Overlap Stack tiles.
 */

import React, { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import type { CalendarEvent, CalendarTask } from "../utils";
import type { TeamMember as ProjectTeamMember } from "@/dashboard/project/components/Shared/types";
import ProjectAvatar from "@/shared/ui/ProjectAvatar";
import {
  buildEventAvatars,
  buildTeamMemberLookup,
  buildTaskAvatars,
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
  onOpenDetails: (child: StackPopoverChild, anchorElement: HTMLElement) => void;
  onOpenContextMenu: (child: StackPopoverChild, event: React.MouseEvent<HTMLElement>) => void;
}

export const CalendarStackPopover: React.FC<CalendarStackPopoverProps> = ({
  anchorElement,
  kind,
  title,
  avatars,
  projectColor,
  children,
  teamMembers,
  onClose,
  onOpenDetails,
  onOpenContextMenu,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  const memberLookup = useMemo(() => buildTeamMemberLookup(teamMembers), [teamMembers]);

  const headerAvatars = useMemo(() => {
    if (!avatars || avatars.length === 0) return null;
    return (
      <div className="calendar-entry-popover__avatars" aria-hidden>
        {avatars.map((avatar, index) => (
          <span
            key={avatar.key}
            className="calendar-entry-popover__avatar-wrapper"
            style={{
              zIndex: avatars.length - index,
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
    );
  }, [avatars]);

  const isSingleUser = Boolean((avatars?.length ?? 0) === 1);
  const showRowAvatars = kind === "overlapStack" && !isSingleUser;

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
        if (event.start && event.end) return `${event.start}–${event.end}`;
        return event.start || "";
      }
      const task = child.entry as CalendarTask;
      if (task.start && task.end) return `${task.start}–${task.end}`;
      return task.start || "";
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

    return [...children]
      .map((child) => {
        const title = child.entry.title || (child.entryType === "task" ? "Untitled task" : "Untitled event");
        return {
          child,
          title,
          time: buildTimeRange(child),
          avatar: buildRowAvatar(child),
        };
      })
      .sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
  }, [children, memberLookup, showRowAvatars]);

  const popoverContent = (
    <div ref={popoverRef} className="calendar-entry-popover" role="dialog" aria-label="Stack details">
      <div className="calendar-entry-popover__header calendar-stack-popover__header">
        <div className="calendar-entry-popover__title">{title}</div>
        {headerAvatars}
      </div>

      <div className="calendar-stack-popover__list">
        {rows.map((row) => (
          <div key={row.child.entryKey} className="calendar-stack-popover__row calendar-stack-popover__row--list">
            <button
              type="button"
              className="calendar-stack-popover__item"
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
              <span className="calendar-stack-popover__item-pill" style={{ background: projectColor }} aria-hidden />
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
        ))}
      </div>
    </div>
  );

  return createPortal(popoverContent, document.body);
};
