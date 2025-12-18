import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { calculateTooltipPosition, type PositionPreference } from "@/shared/utils/positioning";

export interface TimelineTooltipPortalProps {
  anchorElement: HTMLElement;
  avatars: React.ReactNode;
  timeText: string;
  title: string;
  onClose: () => void;
  preference?: PositionPreference;
}

export const TimelineTooltipPortal: React.FC<TimelineTooltipPortalProps> = ({
  anchorElement,
  avatars,
  timeText,
  title,
  onClose,
  preference = "top",
}) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const node = tooltipRef.current;
    if (!node) return;

    setReady(false);

    const assignPosition = () => {
      const anchorRect = anchorElement.getBoundingClientRect();
      const tooltipRect = node.getBoundingClientRect();

      const position = calculateTooltipPosition({
        anchorRect,
        tooltipRect,
        preference,
      });

      setStyle({ top: position.top, left: position.left });
      setReady(true);
    };

    assignPosition();

    // Observe size changes
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(assignPosition);
      resizeObserver.observe(node);
      resizeObserver.observe(anchorElement);
    }

    // Handle scroll and resize
    window.addEventListener("scroll", assignPosition, true);
    window.addEventListener("resize", assignPosition);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", assignPosition, true);
      window.removeEventListener("resize", assignPosition);
    };
  }, [anchorElement, preference]);

  useLayoutEffect(() => {
    const handlePointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      const node = tooltipRef.current;

      // Don't close if clicking inside tooltip
      if (node?.contains(target)) return;

      // Don't close if clicking anchor (let onMouseLeave handle it)
      if (anchorElement.contains(target)) return;

      // Close on outside click
      onClose();
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    // Delay adding listeners to avoid immediate close from the triggering click
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handlePointer);
      document.addEventListener("touchstart", handlePointer);
      document.addEventListener("keydown", handleKey);
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [anchorElement, onClose]);

  return createPortal(
    <div
      ref={tooltipRef}
      className="week-grid__timeline-entry-tooltip week-grid__timeline-entry-tooltip--portal"
      role="tooltip"
      style={{
        position: "fixed" as const,
        top: `${style.top}px`,
        left: `${style.left}px`,
        opacity: ready ? 1 : 0,
        pointerEvents: "auto" as const,
      }}
      onMouseEnter={(event) => {
        // Keep tooltip open when hovering over it
        event.stopPropagation();
      }}
      onMouseLeave={() => {
        // Close when leaving tooltip
        onClose();
      }}
    >
      {avatars}
      <div className="week-grid__timeline-tooltip-time">{timeText}</div>
      <div className="week-grid__timeline-tooltip-title">{title}</div>
    </div>,
    document.body,
  );
};
