import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar } from "@fortawesome/free-solid-svg-icons";
import styles from "./revision-pill-tooltip.module.css";

export interface RevisionPillTooltipData {
  revisionNumber: number;
  revisionName?: string | null;
  isClientVersion?: boolean;
  savedAt?: string | null;
  isAutosaved?: boolean;
  hasUnsavedChanges?: boolean;
  revisionNote?: string | null;
}

interface RevisionPillTooltipProps {
  data: RevisionPillTooltipData;
  children: React.ReactNode;
  disabled?: boolean;
}

const formatTooltipDate = (value?: string | null): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const RevisionPillTooltip: React.FC<RevisionPillTooltipProps> = ({
  data,
  children,
  disabled = false,
}) => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimeouts = useCallback(() => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 8,
      left: rect.left + rect.width / 2,
    });
  }, []);

  const showTooltip = useCallback(() => {
    if (disabled) return;
    clearTimeouts();
    showTimeoutRef.current = setTimeout(() => {
      updatePosition();
      setVisible(true);
    }, 200);
  }, [disabled, clearTimeouts, updatePosition]);

  const hideTooltip = useCallback(() => {
    clearTimeouts();
    hideTimeoutRef.current = setTimeout(() => {
      setVisible(false);
    }, 150);
  }, [clearTimeouts]);

  const handleMouseEnter = () => showTooltip();
  const handleMouseLeave = () => hideTooltip();

  const handleTooltipMouseEnter = () => {
    clearTimeouts();
  };

  const handleTooltipMouseLeave = () => {
    hideTooltip();
  };

  // Mobile: long-press support
  const handleTouchStart = () => {
    if (disabled) return;
    clearTimeouts();
    longPressTimeoutRef.current = setTimeout(() => {
      updatePosition();
      setVisible(true);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearTimeouts();
  }, [clearTimeouts]);

  const displayTitle =
    data.revisionName || (data.isClientVersion ? "Final Invoice" : `Revision ${data.revisionNumber}`);
  const statusLabel = data.isClientVersion ? "Published" : "Internal";
  const formattedDate = formatTooltipDate(data.savedAt);

  let saveStatus: string | null = null;
  if (data.hasUnsavedChanges) {
    saveStatus = "Unsaved changes";
  } else if (data.isAutosaved) {
    saveStatus = "Autosaved";
  } else if (!formattedDate) {
    saveStatus = null; // keep tooltip tight when we already show saved timestamp in meta line
  }

  return (
    <div
      ref={triggerRef}
      className={styles.triggerWrapper}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {children}

      {visible && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tooltipRef}
            className={styles.tooltip}
            style={{
              top: position.top,
              left: position.left,
            }}
            onMouseEnter={handleTooltipMouseEnter}
            onMouseLeave={handleTooltipMouseLeave}
          >
            <div className={styles.tooltipTitle}>{displayTitle}</div>

            <div className={styles.tooltipMeta}>
              <span className={styles.revisionTag}>{`Rev ${data.revisionNumber}`}</span>
              <span className={styles.separator}>•</span>
              <span className={data.isClientVersion ? styles.clientLabel : styles.internalLabel}>
                {data.isClientVersion && (
                  <FontAwesomeIcon icon={faStar} className={styles.starIcon} />
                )}
                {statusLabel}
              </span>
              {formattedDate && (
                <>
                  <span className={styles.separator}>•</span>
                  <span>{`Saved ${formattedDate}`}</span>
                </>
              )}
            </div>

            {saveStatus && (
              <div
                className={styles.saveStatus}
                style={data.hasUnsavedChanges ? { color: "#f59e0b" } : undefined}
              >
                {saveStatus}
              </div>
            )}

            {data.revisionNote && (
              <div className={styles.revisionNote}>{data.revisionNote}</div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

export default RevisionPillTooltip;
