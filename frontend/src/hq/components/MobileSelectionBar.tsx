/**
 * MobileSelectionBar - Floating action bar for multi-selection mode
 * =============================================================================
 * Shows in selection mode, provides quick bulk actions.
 * - Left: "X selected" (tappable → Select all / Clear)
 * - Right: 2-3 primary actions + More
 * =============================================================================
 */
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tag, CreditCard, MoreHorizontal, CheckCircle2, XCircle } from "lucide-react";
import styles from "./MobileSelectionBar.module.css";

interface MobileSelectionBarProps {
  isSelectionMode: boolean;
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onSetCategory: () => void;
  onSetPaymentType: () => void;
  onMoreActions: () => void;
}

export default function MobileSelectionBar({
  isSelectionMode,
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onSetCategory,
  onSetPaymentType,
  onMoreActions,
}: MobileSelectionBarProps) {
  const [isSelectMenuOpen, setIsSelectMenuOpen] = useState(false);

  // Only show when in selection mode
  if (!isSelectionMode) return null;

  const allSelected = selectedCount > 0 && selectedCount === totalCount;

  return (
    <AnimatePresence>
      {isSelectionMode && (
        <motion.div
          className={styles.bar}
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
          {/* Left: Count (tappable) */}
          <div className={styles.left}>
            <button
              type="button"
              className={styles.countButton}
              onClick={() => setIsSelectMenuOpen((prev) => !prev)}
              aria-label="Selection options"
              aria-expanded={isSelectMenuOpen}
            >
              <span className={styles.count}>
                {selectedCount === 0 ? "None selected" : `${selectedCount} selected`}
              </span>
            </button>

            {/* Select all / Clear popover */}
            <AnimatePresence>
              {isSelectMenuOpen && (
                <motion.div
                  className={styles.selectMenu}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                >
                  <button
                    type="button"
                    className={styles.selectMenuItem}
                    onClick={() => {
                      onSelectAll();
                      setIsSelectMenuOpen(false);
                    }}
                    disabled={allSelected}
                  >
                    <CheckCircle2 size={16} />
                    Select all ({totalCount})
                  </button>
                  <button
                    type="button"
                    className={styles.selectMenuItem}
                    onClick={() => {
                      onClearSelection();
                      setIsSelectMenuOpen(false);
                    }}
                    disabled={selectedCount === 0}
                  >
                    <XCircle size={16} />
                    Clear selection
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: Actions */}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={onSetCategory}
              disabled={selectedCount === 0}
              aria-label="Set category"
            >
              <Tag size={18} />
            </button>
            <button
              type="button"
              className={styles.actionButton}
              onClick={onSetPaymentType}
              disabled={selectedCount === 0}
              aria-label="Set payment type"
            >
              <CreditCard size={18} />
            </button>
            <button
              type="button"
              className={styles.actionButton}
              onClick={onMoreActions}
              disabled={selectedCount === 0}
              aria-label="More actions"
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
