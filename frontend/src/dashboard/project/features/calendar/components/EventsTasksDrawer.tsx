import React from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { motion } from "framer-motion";

import styles from "./EventsTasksDrawer.module.css";

type EventsTasksDrawerProps = {
  open: boolean;
  viewportHeight: number;
  targetY: number;
  title: string;
  subtitle?: string;
  sheetRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  onHandleClick: () => void;
  onTouchStart: (event: React.TouchEvent<HTMLDivElement>) => void;
  onTouchMove: (event: React.TouchEvent<HTMLDivElement>) => void;
  onTouchEnd: () => void;
  children: React.ReactNode;
};

const drawerTransition = { type: "spring", stiffness: 360, damping: 42, mass: 0.9 } as const;

const EventsTasksDrawer: React.FC<EventsTasksDrawerProps> = ({
  open,
  viewportHeight,
  targetY,
  title,
  subtitle,
  sheetRef,
  onClose,
  onHandleClick,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  children,
}) => {
  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className={styles.overlay} role="presentation">
      <button
        type="button"
        className={styles.dismissButton}
        onClick={onClose}
        aria-label="Close events and tasks drawer"
      >
        <ChevronDown size={20} strokeWidth={2.5} aria-hidden="true" />
      </button>
      <motion.div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label="Project events and tasks overview"
        drag={false}
        initial={{ y: viewportHeight }}
        animate={{ y: targetY }}
        transition={drawerTransition}
      >
        <div
          className={styles.dragArea}
          role="button"
          tabIndex={0}
          aria-label="Toggle events and tasks drawer size"
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
            <span className={styles.title}>{title}</span>
            {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
          </header>
        </div>
        <div className={styles.content}>{children}</div>
      </motion.div>
    </div>,
    document.body,
  );
};

export default EventsTasksDrawer;
