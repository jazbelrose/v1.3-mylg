import React from "react";
import { CheckSquare, ChevronDown, ChevronRight, Clock, GripVertical, ListTodo, Square } from "lucide-react";
import ProjectAvatar from "@/shared/ui/ProjectAvatar";
import type { TimelineAvatar } from "./timelineLayout";

type DisclosureProps = {
  visible: boolean;
  expanded: boolean;
  onToggle: () => void;
  ariaLabel?: string;
};

export type CalendarEntryRowProps = {
  entryType: "task" | "event";
  title: string;
  timeLabel?: string;
  isDone?: boolean;
  taskIcon?: "checkbox" | "list" | "stack";
  preview?: string;
  progressLabel?: string;
  avatars?: TimelineAvatar[];
  isSelected?: boolean;
  level?: number;
  disclosure?: DisclosureProps;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel?: (e: React.PointerEvent<HTMLDivElement>) => void;
  titleAttr?: string;
  /** Show a drag handle to indicate the row can be dragged out of a stack. */
  draggable?: boolean;
  /** When draggable, optionally hide the grip icon (full row is still draggable). */
  showDragHandle?: boolean;
};

export const CalendarEntryRow: React.FC<CalendarEntryRowProps> = ({
  entryType,
  title,
  timeLabel,
  isDone,
  taskIcon,
  preview,
  progressLabel,
  avatars,
  isSelected,
  level,
  disclosure,
  onClick,
  onContextMenu,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  titleAttr,
  draggable,
  showDragHandle = true,
}) => {
  const resolvedAvatars = avatars ?? [];
  const hasDragHandle = Boolean(draggable && showDragHandle);
  const isFocusBlockRow = entryType === "task" && taskIcon === "stack";

  const dedupedAvatars = (() => {
    const out: TimelineAvatar[] = [];
    const seen = new Set<string>();
    for (const avatar of resolvedAvatars) {
      const stableId = avatar.entityId ?? avatar.key;
      if (seen.has(stableId)) continue;
      seen.add(stableId);
      out.push(avatar);
    }
    return out;
  })();

  const maxVisibleAvatars = 4;
  const visibleAvatars = dedupedAvatars.slice(0, maxVisibleAvatars);
  const extraAvatars = Math.max(dedupedAvatars.length - visibleAvatars.length, 0);
  const hasAvatars = Boolean(visibleAvatars.length > 0 || extraAvatars > 0);
  const showActionsOverlay = Boolean(draggable && showDragHandle);

  const icon =
    entryType === "event" ? (
      <Clock className="calendar-entry-row__icon-svg calendar-entry-row__icon-svg--event" aria-hidden />
    ) : taskIcon === "stack" ? (
      <ListTodo className="calendar-entry-row__icon-svg calendar-entry-row__icon-svg--task" aria-hidden />
    ) : taskIcon === "list" ? (
      <ListTodo className="calendar-entry-row__icon-svg calendar-entry-row__icon-svg--task" aria-hidden />
    ) : isDone ? (
      <CheckSquare className="calendar-entry-row__icon-svg calendar-entry-row__icon-svg--task" aria-hidden />
    ) : (
      <Square className="calendar-entry-row__icon-svg calendar-entry-row__icon-svg--task" aria-hidden />
    );

  const indentPx = Math.max(0, Math.min(4, level ?? 0)) * 16;
  const showChevron = Boolean(disclosure?.visible);
  const isExpanded = Boolean(disclosure?.expanded);

  return (
    <div
      role="button"
      tabIndex={0}
      className={[
        "calendar-entry-row",
        entryType === "event" ? "calendar-entry-row--event" : "calendar-entry-row--task",
        isFocusBlockRow ? "calendar-entry-row--focus-block" : "",
        isSelected ? "calendar-entry-row--selected" : "",
        draggable ? "calendar-entry-row--draggable" : "",
        hasAvatars ? "calendar-entry-row--has-avatars" : "calendar-entry-row--no-avatars",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
        }
      }}
      title={titleAttr ?? title}
    >
      <div className="calendar-entry-row__left" aria-hidden>
        <span className="calendar-entry-row__icon" aria-hidden>
          {icon}
        </span>
        <span className={`calendar-entry-row__time${timeLabel ? "" : " is-empty"}`} aria-hidden={!timeLabel}>
          {timeLabel ?? ""}
        </span>
      </div>

      <div className="calendar-entry-row__title-cell" style={indentPx ? { paddingLeft: indentPx } : undefined}>
        {showChevron ? (
          <button
            type="button"
            className="calendar-entry-row__chevron"
            aria-label={disclosure?.ariaLabel ?? (isExpanded ? "Collapse group" : "Expand group")}
            aria-expanded={isExpanded}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              disclosure?.onToggle();
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onPointerMove={(e) => {
              e.stopPropagation();
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
            }}
          >
            {isExpanded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
          </button>
        ) : null}
        <div className="calendar-entry-row__title-line">
          <span className={["calendar-entry-row__title", isDone ? "is-complete" : ""].filter(Boolean).join(" ")}>
            {title}
          </span>
          {progressLabel ? <span className="calendar-entry-row__progress">{progressLabel}</span> : null}
        </div>
        {preview ? <div className="calendar-entry-row__preview">{preview}</div> : null}
      </div>

      {hasAvatars ? (
        <div className="calendar-entry-row__meta" aria-hidden>
          <div className="calendar-entry-row__avatar-stack">
            {visibleAvatars.map((avatar, index) => (
              <span
                key={avatar.key}
                className="calendar-entry-row__avatar-wrapper"
                style={{
                  zIndex: visibleAvatars.length - index,
                  marginLeft: index > 0 ? "-6px" : 0,
                }}
              >
                <ProjectAvatar
                  className="calendar-entry-row__avatar"
                  thumb={avatar.thumb ?? undefined}
                  name={avatar.name}
                  shape="circle"
                  radius={8}
                />
              </span>
            ))}
            {extraAvatars > 0 ? (
              <span className="calendar-entry-row__avatar-badge" aria-hidden>
                +{extraAvatars}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {showActionsOverlay ? (
        <span className="calendar-entry-row__actions-overlay" aria-hidden>
          <GripVertical size={14} />
        </span>
      ) : null}
    </div>
  );
};
