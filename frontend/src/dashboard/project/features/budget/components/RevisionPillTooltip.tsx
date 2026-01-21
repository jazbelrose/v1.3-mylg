import React, { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar, faCopy, faCheck } from "@fortawesome/free-solid-svg-icons";
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
  const [copied, setCopied] = useState(false);
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
      setCopied(false);
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

  const handleCopyName = async () => {
    const textToCopy = data.revisionName || `Rev.${data.revisionNumber}`;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may fail in some contexts
    }
  };

  useEffect(() => {
    return () => clearTimeouts();
  }, [clearTimeouts]);

  const displayTitle = data.revisionName || `Rev.${data.revisionNumber}`;
  const statusLabel = data.isClientVersion ? "Client Version" : "Internal";
  const formattedDate = formatTooltipDate(data.savedAt);

  let saveStatus: string;
  if (data.hasUnsavedChanges) {
    saveStatus = "Unsaved changes";
  } else if (data.isAutosaved) {
    saveStatus = "Autosaved";
  } else if (formattedDate) {
    saveStatus = `Saved ${formattedDate}`;
  } else {
    saveStatus = "Not saved";
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

      {visible && (
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
            <span className={styles.revisionTag}>Rev.{data.revisionNumber}</span>
            <span className={styles.separator}>•</span>
            <span className={data.isClientVersion ? styles.clientLabel : styles.internalLabel}>
              {data.isClientVersion && (
                <FontAwesomeIcon icon={faStar} className={styles.starIcon} />
              )}
              {statusLabel}
            </span>
          </div>

          <div className={styles.saveStatus}>{saveStatus}</div>

          {data.revisionNote && (
            <div className={styles.revisionNote}>{data.revisionNote}</div>
          )}

          <button
            type="button"
            className={styles.copyButton}
            onClick={handleCopyName}
            aria-label="Copy revision name"
          >
            <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
            <span>{copied ? "Copied!" : "Copy name"}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default RevisionPillTooltip;
