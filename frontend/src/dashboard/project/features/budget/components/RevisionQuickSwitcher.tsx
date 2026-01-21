import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar, faCheck, faPen, faChevronRight, faLock } from "@fortawesome/free-solid-svg-icons";
import styles from "./revision-quick-switcher.module.css";

export interface RevisionQuickSwitcherItem {
  revision: number;
  revisionName?: string | null;
  isClientVersion?: boolean;
  isActive?: boolean;
  isEditing?: boolean;
  isLocked?: boolean;
  revisionNote?: string | null;
}

interface RevisionQuickSwitcherProps {
  revisions: RevisionQuickSwitcherItem[];
  activeRevision: number | null;
  currentRevisionName?: string | null;
  isClientVersion?: boolean;
  onSwitch: (revision: number) => void;
  onManageRevisions: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}

const RevisionQuickSwitcher: React.FC<RevisionQuickSwitcherProps> = ({
  revisions,
  activeRevision,
  currentRevisionName,
  isClientVersion,
  onSwitch,
  onManageRevisions,
  children,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverHeight = 300; // Estimated max height
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < popoverHeight && rect.top > popoverHeight;

    setPosition({
      top: showAbove ? rect.top - 8 : rect.bottom + 8,
      left: rect.left + rect.width / 2,
    });
  }, []);

  const openPopover = useCallback(() => {
    if (disabled) return;
    updatePosition();
    setIsOpen(true);
  }, [disabled, updatePosition]);

  const closePopover = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) {
      closePopover();
    } else {
      openPopover();
    }
  };

  const handleSwitchRevision = (revision: number) => {
    onSwitch(revision);
    closePopover();
  };

  const handleManageClick = () => {
    onManageRevisions();
    closePopover();
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        closePopover();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePopover();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, closePopover]);

  // Update position on scroll/resize
  useEffect(() => {
    if (!isOpen) return;

    const handleUpdate = () => updatePosition();
    window.addEventListener("scroll", handleUpdate, true);
    window.addEventListener("resize", handleUpdate);

    return () => {
      window.removeEventListener("scroll", handleUpdate, true);
      window.removeEventListener("resize", handleUpdate);
    };
  }, [isOpen, updatePosition]);

  const displayTitle = currentRevisionName || `Rev.${activeRevision ?? 1}`;
  const statusLabel = isClientVersion ? "Client Version" : "Editing";

  const sortedRevisions = [...revisions].sort((a, b) => b.revision - a.revision);

  const popoverContent = (
    <div
      ref={popoverRef}
      className={styles.popover}
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      {/* Current revision header */}
      <div className={styles.currentHeader}>
        <div className={styles.currentTitle}>{displayTitle}</div>
        <div className={styles.currentMeta}>
          <span className={styles.revTag}>Rev.{activeRevision ?? 1}</span>
          <span className={styles.separator}>•</span>
          <span className={isClientVersion ? styles.clientBadge : styles.editingBadge}>
            {isClientVersion && <FontAwesomeIcon icon={faStar} className={styles.badgeIcon} />}
            {!isClientVersion && <FontAwesomeIcon icon={faPen} className={styles.badgeIcon} />}
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Revision list */}
      <div className={styles.revisionList}>
        {sortedRevisions.map((rev) => {
          const isActive = rev.revision === activeRevision;
          const displayName = rev.revisionName || `Rev.${rev.revision}`;

          return (
            <button
              key={rev.revision}
              type="button"
              className={`${styles.revisionItem} ${isActive ? styles.revisionItemActive : ""}`}
              onClick={() => handleSwitchRevision(rev.revision)}
              disabled={isActive}
            >
              <div className={styles.revisionItemLeft}>
                {isActive && (
                  <span className={styles.activeIndicator}>
                    <FontAwesomeIcon icon={faCheck} />
                  </span>
                )}
                <div className={styles.revisionItemContent}>
                  <span className={styles.revisionItemName}>{displayName}</span>
                  {rev.revisionNote && (
                    <span className={styles.revisionItemNote}>{rev.revisionNote}</span>
                  )}
                </div>
              </div>
              <div className={styles.revisionItemBadges}>
                {rev.isClientVersion && (
                  <span className={styles.clientVersionBadge}>
                    <FontAwesomeIcon icon={faStar} />
                    <span>Client</span>
                  </span>
                )}
                {rev.isEditing && !rev.isClientVersion && (
                  <span className={styles.editingLabel}>Editing</span>
                )}
                {rev.isLocked && (
                  <span className={styles.lockedBadge}>
                    <FontAwesomeIcon icon={faLock} />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <button
        type="button"
        className={styles.manageButton}
        onClick={handleManageClick}
      >
        <span>Manage revisions…</span>
        <FontAwesomeIcon icon={faChevronRight} className={styles.manageIcon} />
      </button>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={handleTriggerClick}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {children}
      </button>

      {isOpen && createPortal(popoverContent, document.body)}
    </>
  );
};

export default RevisionQuickSwitcher;
