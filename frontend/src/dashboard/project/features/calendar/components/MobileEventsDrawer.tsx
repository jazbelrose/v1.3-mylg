import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";

import EventsAndTasks from "./EventsAndTasks";
import {
  DEFAULT_EVENT_FILTER,
  DEFAULT_TASK_FILTER,
  EVENT_FILTER_LABELS,
  TASK_FILTER_LABELS,
  type EventFilter,
  type TaskFilter,
} from "./events-and-tasks-filters";
import type { CalendarEvent, CalendarTask } from "../utils";

import styles from "./mobile-events-drawer.module.css";

type MobileEventsDrawerProps = {
  open: boolean;
  events: CalendarEvent[];
  tasks: CalendarTask[];
  onClose: () => void;
  onToggleTask: (id: string) => void;
  onEditEvent: (event: CalendarEvent) => void;
  onEditTask: (task: CalendarTask) => void;
  onOpenTasksOverview: () => void;
};

const MobileEventsDrawer: React.FC<MobileEventsDrawerProps> = ({
  open,
  events,
  tasks,
  onClose,
  onToggleTask,
  onEditEvent,
  onEditTask,
  onOpenTasksOverview,
}) => {
  const [eventFilter, setEventFilter] = useState<EventFilter>(DEFAULT_EVENT_FILTER);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>(DEFAULT_TASK_FILTER);

  const eventFilterOptions = React.useMemo(
    () => Object.keys(EVENT_FILTER_LABELS) as EventFilter[],
    [],
  );
  const taskFilterOptions = React.useMemo(
    () => Object.keys(TASK_FILTER_LABELS) as TaskFilter[],
    [],
  );

  const hasActiveFilters = eventFilter !== "all" || taskFilter !== "all";

  const handleEventFilterChange = (next: EventFilter) => {
    setEventFilter(next);
  };

  const handleTaskFilterChange = (next: TaskFilter) => {
    setTaskFilter(next);
  };

  const handleResetFilters = () => {
    handleEventFilterChange(DEFAULT_EVENT_FILTER);
    handleTaskFilterChange(DEFAULT_TASK_FILTER);
  };

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (typeof document === "undefined") {
    return null;
  }

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) {
      onClose();
    }
  };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="calendar-mobile-events-overlay"
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            key="calendar-mobile-events-drawer"
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label="Events and tasks"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.08, bottom: 0.2 }}
            onDragEnd={handleDragEnd}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.handleArea} role="presentation">
              <span className={styles.handleIndicator} aria-hidden="true" />
            </div>
            <div className={styles.scrollArea}>
              <div className={styles.filters}>
                <div className={styles.filtersHeader}>
                  <span className={styles.filtersTitle}>Filters</span>
                  <button
                    type="button"
                    className={styles.resetButton}
                    onClick={handleResetFilters}
                    disabled={!hasActiveFilters}
                  >
                    Reset
                  </button>
                </div>
                <div className={styles.filterSection}>
                  <span className={styles.filterLabel}>Events</span>
                  <div className={styles.filterOptions} role="group" aria-label="Filter events">
                    {eventFilterOptions.map((option) => {
                      const isActive = eventFilter === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          className={`${styles.filterButton}${isActive ? ` ${styles.filterButtonActive}` : ""}`}
                          onClick={() => handleEventFilterChange(option)}
                          aria-pressed={isActive}
                        >
                          {EVENT_FILTER_LABELS[option]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className={styles.filterSection}>
                  <span className={styles.filterLabel}>Tasks</span>
                  <div className={styles.filterOptions} role="group" aria-label="Filter tasks">
                    {taskFilterOptions.map((option) => {
                      const isActive = taskFilter === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          className={`${styles.filterButton}${isActive ? ` ${styles.filterButtonActive}` : ""}`}
                          onClick={() => handleTaskFilterChange(option)}
                          aria-pressed={isActive}
                        >
                          {TASK_FILTER_LABELS[option]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <EventsAndTasks
                events={events}
                tasks={tasks}
                onToggleTask={onToggleTask}
                onEditEvent={onEditEvent}
                onEditTask={onEditTask}
                onOpenTasksOverview={onOpenTasksOverview}
                eventFilter={eventFilter}
                taskFilter={taskFilter}
                onEventFilterChange={handleEventFilterChange}
                onTaskFilterChange={handleTaskFilterChange}
                hideFilterControls
              />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
};

export default MobileEventsDrawer;
