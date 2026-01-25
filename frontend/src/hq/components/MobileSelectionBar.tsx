/**
 * MobileSelectionBar - Floating action bar for multi-selection mode
 * =============================================================================
 * Shows when 1+ rows are selected on mobile, provides quick bulk actions.
 * =============================================================================
 */
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Tag, CreditCard, MoreHorizontal } from "lucide-react";
import styles from "./MobileSelectionBar.module.css";

interface MobileSelectionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onSetCategory: () => void;
  onSetPaymentType: () => void;
  onMoreActions: () => void;
}

export default function MobileSelectionBar({
  selectedCount,
  onClearSelection,
  onSetCategory,
  onSetPaymentType,
  onMoreActions,
}: MobileSelectionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          className={styles.bar}
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
          <div className={styles.left}>
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClearSelection}
              aria-label="Clear selection"
            >
              <X size={18} />
            </button>
            <span className={styles.count}>{selectedCount} selected</span>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={onSetCategory}
              aria-label="Set category"
            >
              <Tag size={18} />
            </button>
            <button
              type="button"
              className={styles.actionButton}
              onClick={onSetPaymentType}
              aria-label="Set payment type"
            >
              <CreditCard size={18} />
            </button>
            <button
              type="button"
              className={styles.actionButton}
              onClick={onMoreActions}
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
