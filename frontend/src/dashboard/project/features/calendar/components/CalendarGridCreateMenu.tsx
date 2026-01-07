import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

export type CalendarGridCreateMenuPosition = { x: number; y: number };

export type CalendarGridCreateMenuProps = {
  position: CalendarGridCreateMenuPosition;
  timeLabel?: string;
  canCreateTasks: boolean;
  onCreateEvent: () => void;
  onCreateTask: () => void;
  onClose: () => void;
};

export const CalendarGridCreateMenu: React.FC<CalendarGridCreateMenuProps> = ({
  position,
  timeLabel,
  canCreateTasks,
  onCreateEvent,
  onCreateTask,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
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
  }, [onClose]);

  const adjustedPosition = useMemo(() => {
    if (typeof window === "undefined") return position;
    const margin = 8;
    const width = 200;
    const height = timeLabel ? 176 : 140;
    return {
      x: Math.min(Math.max(position.x, margin), Math.max(margin, window.innerWidth - width - margin)),
      y: Math.min(Math.max(position.y, margin), Math.max(margin, window.innerHeight - height - margin)),
    };
  }, [position, timeLabel]);

  const handleCreateEvent = useCallback(() => {
    onCreateEvent();
    onClose();
  }, [onClose, onCreateEvent]);

  const handleCreateTask = useCallback(() => {
    if (!canCreateTasks) return;
    onCreateTask();
    onClose();
  }, [canCreateTasks, onClose, onCreateTask]);

  const menu = (
    <div
      ref={menuRef}
      className="week-grid__action-popover"
      role="menu"
      aria-label="Create"
      style={{
        position: "fixed",
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        zIndex: 9999,
      }}
    >
      {timeLabel && (
        <div className="week-grid__action-popover-time" aria-hidden>
          {timeLabel}
        </div>
      )}
      <button
        type="button"
        className="week-grid__action-popover-option"
        onClick={handleCreateEvent}
        role="menuitem"
      >
        Create Event
      </button>
      <button
        type="button"
        className="week-grid__action-popover-option week-grid__action-popover-option--task"
        onClick={handleCreateTask}
        disabled={!canCreateTasks}
        role="menuitem"
      >
        Create Task
      </button>
    </div>
  );

  return createPortal(menu, document.body);
};
