import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import type { TimelineEvent } from "./types";
import { FOCUSABLE_SELECTOR, POPPER_GAP } from "./constants";
import { formatHours, isElementWithin } from "./utils";

export interface DayOverlayContentProps {
  headerId: string;
  dateLabel: string;
  events: TimelineEvent[];
  onClose: () => void;
  onNew: () => void;
  onEdit: (event: TimelineEvent) => void;
  onDelete: (event: TimelineEvent) => void;
}

export const DayOverlayContent: React.FC<DayOverlayContentProps> = ({
  headerId,
  dateLabel,
  events,
  onClose,
  onNew,
  onEdit,
  onDelete,
}) => {
  const hasEvents = events.length > 0;

  return (
    <div className="day-overlay-surface" role="document">
      <header className="day-overlay-header">
        <h2 id={headerId} className="day-overlay-title">
          Events on {dateLabel}
        </h2>
        <button type="button" className="day-overlay-close" aria-label="Close" onClick={onClose}>
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </header>

      <div className="day-overlay-body">
        {hasEvents ? (
          <ul className="day-overlay-events" role="list">
            {events.map((event) => {
              const hoursLabel = formatHours(event.hours);
              return (
                <li key={event.id} className="day-overlay-event">
                  <div className="day-overlay-event-info">
                    <span className="day-overlay-event-title">
                      {event.description || "Untitled event"}
                    </span>
                    {hoursLabel && (
                      <span className="day-overlay-event-hours">{hoursLabel}</span>
                    )}
                  </div>
                  <div className="day-overlay-event-actions">
                    <button
                      type="button"
                      className="day-overlay-event-edit"
                      onClick={() => onEdit(event)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="day-overlay-event-delete"
                      onClick={() => onDelete(event)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="day-overlay-empty">No events yet</div>
        )}
      </div>

      <button
        type="button"
        className={`day-overlay-new ${hasEvents ? "" : "day-overlay-new--primary"}`.trim()}
        onClick={onNew}
      >
        + New event
      </button>
    </div>
  );
};

export interface DayPopoverProps extends DayOverlayContentProps {
  anchor: HTMLButtonElement;
}

export const DayPopover: React.FC<DayPopoverProps> = ({ anchor, onClose, ...contentProps }) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const node = popoverRef.current;
    if (!node) return;
    setReady(false);
    const assignPosition = () => {
      const rect = anchor.getBoundingClientRect();
      const popRect = node.getBoundingClientRect();
      let top = rect.bottom + POPPER_GAP;
      let left = rect.left + rect.width / 2 - popRect.width / 2;

      if (top + popRect.height > window.innerHeight - 16) {
        top = Math.max(rect.top - popRect.height - POPPER_GAP, 16);
      }
      if (left + popRect.width > window.innerWidth - 16) {
        left = window.innerWidth - popRect.width - 16;
      }
      if (left < 16) left = 16;

      setStyle({ top, left });
      setReady(true);
    };

    assignPosition();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(assignPosition);
      observer.observe(node);
      observer.observe(anchor);
    }

    window.addEventListener("scroll", assignPosition, true);
    window.addEventListener("resize", assignPosition);

    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", assignPosition, true);
      window.removeEventListener("resize", assignPosition);
    };
  }, [anchor]);

  useEffect(() => {
    const handlePointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (isElementWithin(target, popoverRef.current || undefined)) return;
      if (isElementWithin(target, anchor)) return;
      onClose();
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "Tab") {
        const container = popoverRef.current;
        if (!container) return;
        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => !el.hasAttribute("disabled"));

        if (!focusables.length) {
          event.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (event.shiftKey) {
          if (active === first || !container.contains(active)) {
            event.preventDefault();
            last.focus();
          }
        } else if (active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [anchor, onClose]);

  useLayoutEffect(() => {
    const container = popoverRef.current;
    if (!container) return;
    const focusable = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable || container).focus({ preventScroll: true });
  }, []);

  return createPortal(
    <div
      ref={popoverRef}
      className={`day-popover${ready ? " ready" : ""}`}
      style={{ top: style.top, left: style.left }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={contentProps.headerId}
      tabIndex={-1}
    >
      <DayOverlayContent onClose={onClose} {...contentProps} />
    </div>,
    document.body
  );
};

export interface DaySheetProps extends DayOverlayContentProps {
  onClose: (options?: { focus?: boolean }) => void;
}

export const DaySheet: React.FC<DaySheetProps> = ({ onClose, ...contentProps }) => {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const focusable = sheet.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable || sheet).focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose({ focus: false });
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="day-sheet" role="dialog" aria-modal="true" aria-labelledby={contentProps.headerId}>
      <div className="day-sheet-backdrop" onClick={() => onClose({ focus: false })} />
      <div
        ref={sheetRef}
        className="day-sheet-content"
        tabIndex={-1}
        role="document"
        aria-labelledby={contentProps.headerId}
      >
        <DayOverlayContent onClose={() => onClose({ focus: true })} {...contentProps} />
      </div>
    </div>,
    document.body
  );
};
