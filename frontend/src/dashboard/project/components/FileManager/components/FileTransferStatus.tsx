/**
 * FileTransferStatus - Visual status bar for file transfer operations
 * 
 * Shows active uploads, downloads, and deletions with progress bars,
 * file counts, and action buttons.
 */

import React, { useEffect, useState } from 'react';
import { 
  Upload, 
  Download, 
  Trash2, 
  X, 
  CheckCircle, 
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Folder,
  FileIcon,
} from 'lucide-react';
import { 
  useFileTransferStore, 
  type TransferBatch,
  type TransferItem,
  type TransferType,
} from '../hooks/useFileTransferStore';
import styles from './file-transfer-status.module.css';

interface FileTransferStatusProps {
  /** Position within the FileManager */
  position?: 'bottom' | 'floating';
  /** Auto-hide after completion (ms). 0 = never */
  autoHideDelay?: number;
}

export const FileTransferStatus: React.FC<FileTransferStatusProps> = ({
  position = 'bottom',
  autoHideDelay = 3000,
}) => {
  const { allBatches, hasActiveTransfers, cancelBatch, clearBatch, clearCompletedBatches } = useFileTransferStore();
  const batches = allBatches();
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(false);

  // Show when there are batches, auto-hide completed after delay
  useEffect(() => {
    if (batches.length > 0) {
      setVisible(true);
    }

    if (!hasActiveTransfers && batches.length > 0 && autoHideDelay > 0) {
      const timer = setTimeout(() => {
        clearCompletedBatches();
        if (batches.length === 0) {
          setVisible(false);
        }
      }, autoHideDelay);
      return () => clearTimeout(timer);
    }
  }, [batches.length, hasActiveTransfers, autoHideDelay, clearCompletedBatches]);

  if (!visible || batches.length === 0) {
    return null;
  }

  const getTypeIcon = (type: TransferType) => {
    switch (type) {
      case 'upload':
        return <Upload size={14} />;
      case 'download':
        return <Download size={14} />;
      case 'delete':
        return <Trash2 size={14} />;
    }
  };

  const getTypeLabel = (type: TransferType, count: number) => {
    const plural = count !== 1;
    switch (type) {
      case 'upload':
        return plural ? 'Uploading files' : 'Uploading file';
      case 'download':
        return plural ? 'Downloading files' : 'Downloading file';
      case 'delete':
        return plural ? 'Deleting files' : 'Deleting file';
    }
  };

  const getStatusClass = (batch: TransferBatch) => {
    if (batch.status === 'completed' && batch.failedFiles === 0) return styles.statusSuccess;
    if (batch.status === 'completed' && batch.failedFiles > 0) return styles.statusWarning;
    if (batch.status === 'failed' || batch.status === 'cancelled') return styles.statusError;
    return styles.statusActive;
  };

  const formatProgress = (batch: TransferBatch) => {
    if (batch.status === 'completed') {
      if (batch.failedFiles > 0) {
        return `${batch.completedFiles} of ${batch.totalFiles} completed, ${batch.failedFiles} failed`;
      }
      return `${batch.totalFiles} ${batch.totalFiles === 1 ? 'file' : 'files'} completed`;
    }
    return `${batch.completedFiles} of ${batch.totalFiles}`;
  };

  // Summarize active transfers
  const activeUploads = batches.filter(b => b.type === 'upload' && (b.status === 'pending' || b.status === 'in-progress'));
  const activeDownloads = batches.filter(b => b.type === 'download' && (b.status === 'pending' || b.status === 'in-progress'));
  const activeDeletes = batches.filter(b => b.type === 'delete' && (b.status === 'pending' || b.status === 'in-progress'));

  const totalActiveFiles = [...activeUploads, ...activeDownloads, ...activeDeletes]
    .reduce((sum, b) => sum + (b.totalFiles - b.completedFiles - b.failedFiles), 0);

  const overallProgress = hasActiveTransfers
    ? Math.round(
        batches
          .filter(b => b.status === 'pending' || b.status === 'in-progress')
          .reduce((sum, b) => sum + b.progress, 0) /
        Math.max(1, activeUploads.length + activeDownloads.length + activeDeletes.length)
      )
    : 100;

  return (
    <div className={`${styles.container} ${styles[position]}`}>
      {/* Summary bar */}
      <div className={styles.summaryBar} onClick={() => setExpanded(!expanded)}>
        <div className={styles.summaryLeft}>
          {activeUploads.length > 0 && (
            <span className={styles.summaryBadge}>
              <Upload size={12} />
              {activeUploads.reduce((sum, b) => sum + b.totalFiles, 0)}
            </span>
          )}
          {activeDownloads.length > 0 && (
            <span className={styles.summaryBadge}>
              <Download size={12} />
              {activeDownloads.reduce((sum, b) => sum + b.totalFiles, 0)}
            </span>
          )}
          {activeDeletes.length > 0 && (
            <span className={styles.summaryBadge}>
              <Trash2 size={12} />
              {activeDeletes.reduce((sum, b) => sum + b.totalFiles, 0)}
            </span>
          )}
          {!hasActiveTransfers && batches.length > 0 && (
            <span className={styles.summaryComplete}>
              <CheckCircle size={12} />
              Transfer complete
            </span>
          )}
        </div>

        <div className={styles.summaryCenter}>
          {hasActiveTransfers && (
            <>
              <div className={styles.progressBar}>
                <div 
                  className={styles.progressFill} 
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
              <span className={styles.progressText}>{overallProgress}%</span>
            </>
          )}
        </div>

        <div className={styles.summaryRight}>
          <button 
            type="button" 
            className={styles.expandBtn}
            aria-label={expanded ? 'Collapse details' : 'Expand details'}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          {!hasActiveTransfers && (
            <button
              type="button"
              className={styles.dismissBtn}
              onClick={(e) => {
                e.stopPropagation();
                batches.forEach(b => clearBatch(b.id));
                setVisible(false);
              }}
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className={styles.detailsPanel}>
          {batches.map((batch) => (
            <div key={batch.id} className={`${styles.batchItem} ${getStatusClass(batch)}`}>
              <div className={styles.batchHeader}>
                <span className={styles.batchIcon}>
                  {batch.folderName ? <Folder size={14} /> : getTypeIcon(batch.type)}
                </span>
                <span className={styles.batchTitle}>
                  {batch.folderName 
                    ? `${batch.folderName} (${batch.totalFiles} files)`
                    : getTypeLabel(batch.type, batch.totalFiles)
                  }
                </span>
                <span className={styles.batchProgress}>
                  {formatProgress(batch)}
                </span>
                {(batch.status === 'pending' || batch.status === 'in-progress') && (
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => cancelBatch(batch.id)}
                    aria-label="Cancel"
                  >
                    <X size={12} />
                  </button>
                )}
                {batch.status === 'completed' && (
                  <button
                    type="button"
                    className={styles.clearBtn}
                    onClick={() => clearBatch(batch.id)}
                    aria-label="Clear"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Progress bar for active batches */}
              {(batch.status === 'pending' || batch.status === 'in-progress') && (
                <div className={styles.batchProgressBar}>
                  <div 
                    className={styles.batchProgressFill}
                    style={{ width: `${batch.progress}%` }}
                  />
                </div>
              )}

              {/* File list (show first 5, then count) */}
              {batch.items.length <= 5 ? (
                <ul className={styles.fileList}>
                  {batch.items.map((item) => (
                    <FileItemRow key={item.id} item={item} />
                  ))}
                </ul>
              ) : (
                <>
                  <ul className={styles.fileList}>
                    {batch.items.slice(0, 3).map((item) => (
                      <FileItemRow key={item.id} item={item} />
                    ))}
                  </ul>
                  <div className={styles.moreFiles}>
                    +{batch.items.length - 3} more files
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const FileItemRow: React.FC<{ item: TransferItem }> = ({ item }) => {
  const getStatusIcon = () => {
    switch (item.status) {
      case 'completed':
        return <CheckCircle size={12} className={styles.itemSuccess} />;
      case 'failed':
        return <AlertCircle size={12} className={styles.itemError} />;
      case 'cancelled':
        return <X size={12} className={styles.itemCancelled} />;
      default:
        return null;
    }
  };

  return (
    <li className={styles.fileItem}>
      <FileIcon size={12} />
      <span className={styles.fileName}>
        {item.relativePath ? `${item.relativePath}${item.fileName}` : item.fileName}
      </span>
      {item.status === 'in-progress' && (
        <span className={styles.itemProgress}>{item.progress}%</span>
      )}
      {getStatusIcon()}
    </li>
  );
};

export default FileTransferStatus;
