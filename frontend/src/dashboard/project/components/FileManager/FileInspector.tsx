/**
 * FileInspector - Right panel showing file details and actions
 * 
 * Features:
 * - Preview area (image/thumbnail or type tile)
 * - Metadata display
 * - Quick actions
 */

import React from 'react';
import {
  Download,
  Link,
  Folder,
  Trash2,
  X,
  Edit3,
  Calendar,
  HardDrive,
  User,
  FileType,
} from 'lucide-react';
import { FileThumb } from '@/shared/ui/FileThumb';
import styles from './file-manager-v2.module.css';

export interface FileDetails {
  fileName: string;
  url: string;
  thumbnailUrl?: string;
  mimeType?: string;
  extension?: string;
  sizeBytes?: number;
  createdAt?: string;
  updatedAt?: string;
  uploadedBy?: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  path?: string[];
}

export interface FileInspectorProps {
  /** File details to display */
  file: FileDetails | null;
  /** Close inspector callback */
  onClose: () => void;
  /** Download callback */
  onDownload: () => void;
  /** Copy link callback */
  onCopyLink: () => void;
  /** Move callback */
  onMove?: () => void;
  /** Delete callback */
  onDelete?: () => void;
  /** Rename callback */
  onRename?: () => void;
  /** Whether user can edit/delete */
  canEdit?: boolean;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes === 0) return '—';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function getExtension(fileName?: string): string {
  if (!fileName) return '';
  return fileName.split('.').pop()?.toLowerCase() || '';
}

export function FileInspector({
  file,
  onClose,
  onDownload,
  onCopyLink,
  onMove,
  onDelete,
  onRename,
  canEdit = false,
}: FileInspectorProps) {
  if (!file) return null;

  const ext = getExtension(file.fileName);

  return (
    <aside className={styles.inspector} aria-label="File details">
      {/* Header */}
      <div className={styles.inspectorHeader}>
        <h3 className={styles.inspectorTitle}>Details</h3>
        <button
          type="button"
          className={styles.inspectorClose}
          onClick={onClose}
          aria-label="Close inspector"
        >
          <X size={16} />
        </button>
      </div>

      {/* Preview */}
      <div className={styles.inspectorPreview}>
        <FileThumb
          url={file.url}
          thumbnailUrl={file.thumbnailUrl}
          fileName={file.fileName}
          mimeType={file.mimeType}
          extension={file.extension || ext}
          size="lg"
        />
      </div>

      {/* File Name */}
      <div className={styles.inspectorFileName}>
        {file.fileName}
        {canEdit && onRename && (
          <button
            type="button"
            className={styles.inspectorEditBtn}
            onClick={onRename}
            aria-label="Rename file"
          >
            <Edit3 size={12} />
          </button>
        )}
      </div>

      {/* Metadata */}
      <div className={styles.inspectorMeta}>
        <div className={styles.inspectorMetaItem}>
          <FileType size={14} className={styles.inspectorMetaIcon} />
          <span className={styles.inspectorMetaLabel}>Type</span>
          <span className={styles.inspectorMetaValue}>
            {file.mimeType || ext.toUpperCase() || '—'}
          </span>
        </div>

        <div className={styles.inspectorMetaItem}>
          <HardDrive size={14} className={styles.inspectorMetaIcon} />
          <span className={styles.inspectorMetaLabel}>Size</span>
          <span className={styles.inspectorMetaValue}>
            {formatFileSize(file.sizeBytes)}
          </span>
        </div>

        <div className={styles.inspectorMetaItem}>
          <Calendar size={14} className={styles.inspectorMetaIcon} />
          <span className={styles.inspectorMetaLabel}>Modified</span>
          <span className={styles.inspectorMetaValue}>
            {formatDate(file.updatedAt || file.createdAt)}
          </span>
        </div>

        {file.uploadedBy && (
          <div className={styles.inspectorMetaItem}>
            <User size={14} className={styles.inspectorMetaIcon} />
            <span className={styles.inspectorMetaLabel}>Uploaded by</span>
            <span className={styles.inspectorMetaValue}>
              {file.uploadedBy.name}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className={styles.inspectorActions}>
        <button
          type="button"
          className={`${styles.inspectorAction} ${styles.inspectorActionPrimary}`}
          onClick={onDownload}
        >
          <Download size={14} />
          <span>Download</span>
        </button>

        <button
          type="button"
          className={styles.inspectorAction}
          onClick={onCopyLink}
        >
          <Link size={14} />
          <span>Copy Link</span>
        </button>

        {onMove && canEdit && (
          <button
            type="button"
            className={styles.inspectorAction}
            onClick={onMove}
          >
            <Folder size={14} />
            <span>Move</span>
          </button>
        )}

        {onDelete && canEdit && (
          <button
            type="button"
            className={`${styles.inspectorAction} ${styles.inspectorActionDanger}`}
            onClick={onDelete}
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
        )}
      </div>
    </aside>
  );
}

export default FileInspector;
