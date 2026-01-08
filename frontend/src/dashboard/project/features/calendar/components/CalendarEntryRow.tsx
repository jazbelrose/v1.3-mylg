import React from "react";
import { CheckSquare, Clock, Square, ListTodo, GripVertical } from "lucide-react";
import ProjectAvatar from "@/shared/ui/ProjectAvatar";
import type { TimelineAvatar } from "./timelineLayout";

export type CalendarEntryRowProps = {
  entryType: "task" | "event";
  title: string;
  timeLabel?: string;
  isDone?: boolean;
  taskIcon?: "checkbox" | "list";
  avatars?: TimelineAvatar[];
  isSelected?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onContextMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel?: (e: React.PointerEvent<HTMLButtonElement>) => void;
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
  avatars,
  isSelected,
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
  const showAvatars = resolvedAvatars.length > 0;
  const hasDragHandle = Boolean(draggable && showDragHandle);

  const icon =
    entryType === "event" ? (
      <Clock className="calendar-entry-row__icon-svg calendar-entry-row__icon-svg--event" aria-hidden />
    ) : taskIcon === "list" ? (
      <ListTodo className="calendar-entry-row__icon-svg calendar-entry-row__icon-svg--task" aria-hidden />
    ) : isDone ? (
      <CheckSquare className="calendar-entry-row__icon-svg calendar-entry-row__icon-svg--task" aria-hidden />
    ) : (
      <Square className="calendar-entry-row__icon-svg calendar-entry-row__icon-svg--task" aria-hidden />
    );

  return (
    <button
      type="button"
      className={[
        "calendar-entry-row",
        isSelected ? "calendar-entry-row--selected" : "",
        draggable ? "calendar-entry-row--draggable" : "",
        draggable && !hasDragHandle ? "calendar-entry-row--draggable-no-handle" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      title={titleAttr ?? title}
    >
      {hasDragHandle ? (
        <span className="calendar-entry-row__drag-handle" aria-hidden>
          <GripVertical size={14} />
        </span>
      ) : null}
      <span className="calendar-entry-row__icon" aria-hidden>
        {icon}
      </span>
      <div className="calendar-entry-row__main">
        <div className={["calendar-entry-row__title", isDone ? "is-complete" : ""].filter(Boolean).join(" ")}>
          {title}
        </div>
        {timeLabel ? <div className="calendar-entry-row__time">{timeLabel}</div> : null}
      </div>
      {showAvatars ? (
        <div className="calendar-entry-row__avatars" aria-hidden>
          {resolvedAvatars.slice(0, 1).map((avatar) => (
            <ProjectAvatar
              key={avatar.key}
              className="calendar-entry-row__avatar"
              thumb={avatar.thumb ?? undefined}
              name={avatar.name}
              shape="circle"
              radius={9}
            />
          ))}
        </div>
      ) : null}
    </button>
  );
};
