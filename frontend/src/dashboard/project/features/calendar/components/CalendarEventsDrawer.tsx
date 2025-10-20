import React from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Search } from "lucide-react";

import EventsAndTasks from "./EventsAndTasks";
import type { CalendarEvent, CalendarTask } from "../utils";

import styles from "./CalendarEventsDrawer.module.css";

type CalendarEventsDrawerProps = {
  open: boolean;
  viewportHeight: number;
  targetY: number;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  events: CalendarEvent[];
  tasks: CalendarTask[];
  onToggleTask: (id: string) => void;
  onEditEvent: (event: CalendarEvent) => void;
  onEditTask: (task: CalendarTask) => void;
  onOpenTasksOverview: () => void;
  onHandleClick: () => void;
  onTouchStart: (event: React.TouchEvent<HTMLDivElement>) => void;
  onTouchMove: (event: React.TouchEvent<HTMLDivElement>) => void;
  onTouchEnd: () => void;
};

const CalendarEventsDrawer: React.FC<CalendarEventsDrawerProps> = ({
  open,
  viewportHeight,
  targetY,
  searchTerm,
  onSearchTermChange,
  events,
  tasks,
  onToggleTask,
  onEditEvent,
  onEditTask,
  onOpenTasksOverview,
  onHandleClick,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}) => {
  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className={styles.drawerOverlay} role="presentation">
      <motion.div
        className={styles.drawerSheet}
        role="dialog"
        aria-modal="true"
        aria-label="Project calendar events and tasks"
        initial={{ y: viewportHeight }}
        animate={{ y: targetY }}
        transition={{ type: "spring", stiffness: 360, damping: 42, mass: 0.9 }}
      >
        <div
          className={styles.dragArea}
          role="button"
          tabIndex={0}
          aria-label="Toggle events drawer size"
          onClick={onHandleClick}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onHandleClick();
            }
          }}
        >
          <div className={styles.handle}>
            <span className={styles.handleBar} aria-hidden="true" />
          </div>
          <header className={styles.header}>
            <div className={styles.titleGroup}>
              <span className={styles.title}>Events &amp; Tasks</span>
              <span className={styles.subtitle}>Stay aligned with the schedule</span>
            </div>
          </header>
        </div>
        <div className={styles.search}>
          <div className="calendar-controls__search">
            <Search className="calendar-controls__search-icon" aria-hidden />
            <input
              type="search"
              className="calendar-controls__search-input"
              placeholder="Search events and tasks"
              aria-label="Search events and tasks"
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
            />
          </div>
        </div>
        <div className={styles.content}>
          <EventsAndTasks
            events={events}
            tasks={tasks}
            onToggleTask={onToggleTask}
            onEditEvent={onEditEvent}
            onEditTask={onEditTask}
            onOpenTasksOverview={onOpenTasksOverview}
          />
        </div>
      </motion.div>
    </div>,
    document.body,
  );
};

export default CalendarEventsDrawer;
