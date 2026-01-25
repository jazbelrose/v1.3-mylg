/**
 * BottomSheet - iOS-style bottom sheet with snap points
 * =============================================================================
 * Features:
 * - Framer Motion animations
 * - Snap points (percentage-based)
 * - Swipe down to dismiss
 * - Scroll lock when open
 * - Safe area handling
 * - Backdrop click to close
 * - Accessible (ARIA dialog)
 * =============================================================================
 */
import React, { useRef, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, PanInfo, useAnimation } from "framer-motion";
import { X } from "lucide-react";
import { useScrollLock } from "@/shared/hooks/useScrollLock";
import "@/shared/styles/mobile.css";

export interface BottomSheetProps {
  /** Whether the sheet is open */
  isOpen: boolean;
  /** Close callback */
  onClose: () => void;
  /** Sheet title (optional, shows header if provided) */
  title?: string;
  /** Custom header content (alternative to title) */
  header?: React.ReactNode;
  /** Content of the sheet */
  children: React.ReactNode;
  /** Snap points as viewport percentages (e.g., [50, 90]). Default: [90] */
  snapPoints?: number[];
  /** Initial snap point index. Default: 0 (first snap point) */
  initialSnap?: number;
  /** Whether to show close button in header. Default: true */
  showCloseButton?: boolean;
  /** Whether clicking backdrop closes the sheet. Default: true */
  closeOnBackdropClick?: boolean;
  /** Custom class for the sheet container */
  className?: string;
  /** Custom class for the content area */
  contentClassName?: string;
  /** Footer/actions content (sticky at bottom) */
  footer?: React.ReactNode;
  /** ARIA label for accessibility */
  ariaLabel?: string;
  /** Whether to disable swipe to dismiss. Default: false */
  disableSwipeToDismiss?: boolean;
}

const DISMISS_THRESHOLD = 0.25; // 25% of sheet height to trigger dismiss
const VELOCITY_THRESHOLD = 500; // px/s velocity to trigger dismiss

export function BottomSheet({
  isOpen,
  onClose,
  title,
  header,
  children,
  snapPoints = [90],
  initialSnap = 0,
  showCloseButton = true,
  closeOnBackdropClick = true,
  className = "",
  contentClassName = "",
  footer,
  ariaLabel,
  disableSwipeToDismiss = false,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const controls = useAnimation();
  const currentSnapIndex = useRef(initialSnap);

  // Lock scroll when open
  useScrollLock(isOpen);

  // Calculate snap point heights
  const snapHeights = useMemo(
    () => snapPoints.map((p) => `${p}vh`),
    [snapPoints]
  );

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Animate to snap point
  const snapTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= snapPoints.length) return;
      currentSnapIndex.current = index;
      controls.start({
        height: snapHeights[index],
        transition: { type: "spring", damping: 25, stiffness: 300 },
      });
    },
    [controls, snapHeights, snapPoints.length]
  );

  // Handle drag end
  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      if (disableSwipeToDismiss) {
        // Snap back to current position
        snapTo(currentSnapIndex.current);
        return;
      }

      const sheetHeight = sheetRef.current?.offsetHeight || 0;
      const dragDistance = info.offset.y;
      const velocity = info.velocity.y;

      // Dismiss if dragged down past threshold or with high velocity
      if (
        dragDistance > sheetHeight * DISMISS_THRESHOLD ||
        velocity > VELOCITY_THRESHOLD
      ) {
        onClose();
        return;
      }

      // Otherwise, find nearest snap point
      const currentHeight = sheetHeight - dragDistance;
      const viewportHeight = window.innerHeight;
      const currentPercent = (currentHeight / viewportHeight) * 100;

      // Find closest snap point
      let closestIndex = 0;
      let closestDiff = Infinity;
      snapPoints.forEach((point, index) => {
        const diff = Math.abs(point - currentPercent);
        if (diff < closestDiff) {
          closestDiff = diff;
          closestIndex = index;
        }
      });

      snapTo(closestIndex);
    },
    [disableSwipeToDismiss, onClose, snapPoints, snapTo]
  );

  // Handle backdrop click
  const handleBackdropClick = useCallback(() => {
    if (closeOnBackdropClick) {
      onClose();
    }
  }, [closeOnBackdropClick, onClose]);

  if (typeof document === "undefined") return null;

  const sheet = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="bottom-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleBackdropClick}
          />

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            className={`bottom-sheet ${className}`}
            initial={{ y: "100%" }}
            animate={{ y: 0, height: snapHeights[initialSnap] }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel || title || "Bottom sheet"}
          >
            {/* Drag handle */}
            <div className="bottom-sheet-handle" />

            {/* Header (if title or header provided) */}
            {(title || header || showCloseButton) && (
              <div className="bottom-sheet-header">
                {header ? (
                  <div className="bottom-sheet-header-content">{header}</div>
                ) : title ? (
                  <h2 className="bottom-sheet-title">{title}</h2>
                ) : null}
                {showCloseButton && (
                  <button
                    type="button"
                    className="bottom-sheet-close"
                    onClick={onClose}
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            )}

            {/* Content */}
            <div className={`bottom-sheet-content ${contentClassName}`}>
              {children}
            </div>

            {/* Footer (if provided) */}
            {footer && <div className="bottom-sheet-actions">{footer}</div>}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(sheet, document.body);
}

export default BottomSheet;
