import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { calculateTooltipPosition, isTouchDevice, type PositionPreference } from "@/shared/utils/positioning";

export interface TimelineTooltipPortalProps {
  anchorElement: HTMLElement;
  avatars: React.ReactNode;
  timeText: string;
  title: string;
  onClose: () => void;
  onTooltipHover?: (isHovering: boolean) => void;
  preference?: PositionPreference;
  tooltipId?: string;
}

export const TimelineTooltipPortal: React.FC<TimelineTooltipPortalProps> = ({
  anchorElement,
  avatars,
  timeText,
  title,
  onClose,
  onTooltipHover,
  preference = "top",
  tooltipId = "timeline-tooltip",
}) => {
  // Don't show tooltips on touch devices (mobile)
  // Touch users can tap to access details via other UI patterns
  if (isTouchDevice()) return null;

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

    // Tier 1 strategy: Dismiss on scroll/resize (simplest, prevents floating tooltips)
    // We don't reposition because it's simpler and avoids listener overhead
    const handleDismiss = () => onClose();

    // Use capture phase to catch scroll in any container
    window.addEventListener("scroll", handleDismiss, true);
    window.addEventListener("resize", handleDismiss);

    // Observe size changes for dynamic content
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(assignPosition);
      resizeObserver.observe(node);
      resizeObserver.observe(anchorElement);
    }

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", handleDismiss, true);
      window.removeEventListener("resize", handleDismiss);
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
      id={tooltipId}
      className="week-grid__timeline-entry-tooltip week-grid__timeline-entry-tooltip--portal"
      role="tooltip"
      aria-live="polite"
      style={{
        position: "fixed" as const,
        top: `${style.top}px`,
        left: `${style.left}px`,
        opacity: ready ? 1 : 0,
        pointerEvents: "auto" as const,
        zIndex: 1000,
      }}
      onMouseEnter={(event) => {
        // Hover bridge: notify parent we're hovering the tooltip
        // This prevents premature close when moving cursor from anchor to tooltip
        event.stopPropagation();
        onTooltipHover?.(true);
      }}
      onMouseLeave={() => {
        // Notify parent we've left the tooltip
        onTooltipHover?.(false);
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
