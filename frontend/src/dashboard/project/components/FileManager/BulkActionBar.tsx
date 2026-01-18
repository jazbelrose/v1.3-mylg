/**
 * BulkActionBar - Sticky action bar for multi-select operations
 * 
 * Features:
 * - Shows selection count
 * - Download as ZIP
 * - Move, Delete, Share actions
 * - Clear selection
 */

import React from 'react';
import {
  Download,
  FileArchive,
  Folder,
  Trash2,
  Link,
  X,
  MoreHorizontal,
} from 'lucide-react';
import styles from './file-manager-v2.module.css';

export interface BulkActionBarProps {
  /** Number of selected items */
  selectedCount: number;
  /** Clear selection callback */
  onClearSelection: () => void;
  /** Download single files callback */
  onDownload: () => void;
  /** Download as ZIP callback */
  onDownloadZip: () => void;
  /** Move to folder callback */
  onMove?: () => void;
  /** Delete callback */
  onDelete: () => void;
  /** Copy link callback (if available) */
  onCopyLink?: () => void;
  /** Whether user can delete */
  canDelete?: boolean;
  /** Whether ZIP download is in progress */
  isZipping?: boolean;
}

export function BulkActionBar({
  selectedCount,
  onClearSelection,
  onDownload,
  onDownloadZip,
  onMove,
  onDelete,
  onCopyLink,
  canDelete = true,
  isZipping = false,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className={styles.bulkActionBar}>
      <div className={styles.bulkActionLeft}>
        <button
          type="button"
          className={styles.bulkActionClear}
          onClick={onClearSelection}
          aria-label="Clear selection"
        >
          <X size={14} />
        </button>
        <span className={styles.bulkActionCount}>
          {selectedCount} selected
        </span>
      </div>

      <div className={styles.bulkActionRight}>
        {/* Download individual files */}
        {selectedCount === 1 && (
          <button
            type="button"
            className={styles.bulkActionBtn}
            onClick={onDownload}
            title="Download"
          >
            <Download size={14} />
            <span className={styles.bulkActionLabel}>Download</span>
          </button>
        )}

        {/* Download as ZIP */}
        <button
          type="button"
          className={`${styles.bulkActionBtn} ${styles.bulkActionPrimary}`}
          onClick={onDownloadZip}
          disabled={isZipping}
          title="Download as ZIP"
        >
          <FileArchive size={14} />
          <span className={styles.bulkActionLabel}>
            {isZipping ? 'Zipping...' : 'Download ZIP'}
          </span>
        </button>

        {/* Move to folder */}
        {onMove && (
          <button
            type="button"
            className={styles.bulkActionBtn}
            onClick={onMove}
            title="Move to..."
          >
            <Folder size={14} />
            <span className={styles.bulkActionLabel}>Move</span>
          </button>
        )}

        {/* Copy link */}
        {onCopyLink && selectedCount === 1 && (
          <button
            type="button"
            className={styles.bulkActionBtn}
            onClick={onCopyLink}
            title="Copy link"
          >
            <Link size={14} />
            <span className={styles.bulkActionLabel}>Copy Link</span>
          </button>
        )}

        {/* Delete */}
        {canDelete && (
          <button
            type="button"
            className={`${styles.bulkActionBtn} ${styles.bulkActionDanger}`}
            onClick={onDelete}
            title="Delete"
          >
            <Trash2 size={14} />
            <span className={styles.bulkActionLabel}>Delete</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default BulkActionBar;
