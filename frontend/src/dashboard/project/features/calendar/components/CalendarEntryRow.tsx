import React from "react";
import { CheckSquare, Clock, Square, ListTodo } from "lucide-react";
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
  titleAttr?: string;
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
  titleAttr,
}) => {
  const resolvedAvatars = avatars ?? [];
  const showAvatars = resolvedAvatars.length > 0;

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
      className={["calendar-entry-row", isSelected ? "calendar-entry-row--selected" : ""]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={titleAttr ?? title}
    >
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
