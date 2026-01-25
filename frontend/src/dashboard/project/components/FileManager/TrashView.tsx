/**
 * TrashView - Display and manage deleted files
 * 
 * Features:
 * - List deleted files with restore deadline
 * - Restore individual files
 * - Empty trash (permanent delete)
 * - Show time remaining until permanent deletion
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Trash2, RotateCcw, AlertTriangle, Clock, File as FileIcon, Image, Video, Music, Archive } from 'lucide-react';
import { useFileLifecycle } from '@/shared/contexts/FileLifecycleContext';
import { restoreFile } from '@/shared/api/fileLifecycleApi';
import { notify } from '@/shared/ui/ToastNotifications';
import type { FileRecord } from '@/shared/types/fileLifecycle';
import styles from './file-manager-v2.module.css';

interface TrashViewProps {
  projectId?: string;
  orgId?: string;
  onFileRestored?: (file: FileRecord) => void;
}

/**
 * Get file type icon based on mime type
 */
function getFileIcon(mimeType?: string): React.ReactNode {
  if (!mimeType) return <FileIcon size={24} strokeWidth={1.5} />;
  
  if (mimeType.startsWith('image/')) return <Image size={24} strokeWidth={1.5} />;
  if (mimeType.startsWith('video/')) return <Video size={24} strokeWidth={1.5} />;
  if (mimeType.startsWith('audio/')) return <Music size={24} strokeWidth={1.5} />;
  if (mimeType.includes('zip') || mimeType.includes('archive')) return <Archive size={24} strokeWidth={1.5} />;
  
  return <FileIcon size={24} strokeWidth={1.5} />;
}

/**
 * Format time remaining until permanent deletion
 */
function formatTimeRemaining(deletedAt?: string): string {
  if (!deletedAt) return 'Unknown';
  
  const deleted = new Date(deletedAt);
  const hardDeleteAt = new Date(deleted.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
  const now = new Date();
  const diff = hardDeleteAt.getTime() - now.getTime();
  
  if (diff <= 0) return 'Expiring soon';
  
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} left`;
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} left`;
  return 'Less than 1 hour';
}

/**
 * Format file size
 */
function formatSize(bytes?: number): string {
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

export function TrashView({ projectId, orgId, onFileRestored }: TrashViewProps) {
  const { getDeletedFiles, fetchFiles } = useFileLifecycle();
  const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set());
  
  const deletedFiles = useMemo(() => getDeletedFiles(), [getDeletedFiles]);
  
  const handleRestore = useCallback(async (file: FileRecord) => {
    const scope = projectId ? `project#${projectId}` : orgId ? `org#${orgId}` : null;
    if (!scope) {
      notify.error('Cannot restore file: unknown scope');
      return;
    }
    
    setRestoringIds(prev => new Set(prev).add(file.fileId));
    
    try {
      const restored = await restoreFile(scope, file.fileId);
      notify.success(`Restored "${file.filename}"`);
      
      // Refresh files list
      await fetchFiles(true);
      
      onFileRestored?.(restored);
    } catch (error) {
      console.error('Failed to restore file:', error);
      notify.error(`Failed to restore "${file.filename}"`);
    } finally {
      setRestoringIds(prev => {
        const next = new Set(prev);
        next.delete(file.fileId);
        return next;
      });
    }
  }, [projectId, orgId, fetchFiles, onFileRestored]);
  
  if (deletedFiles.length === 0) {
    return (
      <div className={styles.trashEmptyState}>
        <Trash2 size={48} strokeWidth={1} style={{ opacity: 0.3 }} />
        <h3>Trash is empty</h3>
        <p>Deleted files will appear here for 30 days before being permanently removed.</p>
      </div>
    );
  }
  
  return (
    <div className={styles.trashView}>
      <div className={styles.trashHeader}>
        <div className={styles.trashTitle}>
          <Trash2 size={20} strokeWidth={1.5} />
          <span>Trash</span>
          <span className={styles.trashCount}>({deletedFiles.length} file{deletedFiles.length === 1 ? '' : 's'})</span>
        </div>
        <div className={styles.trashInfo}>
          <AlertTriangle size={14} strokeWidth={1.5} />
          <span>Files are permanently deleted after 30 days</span>
        </div>
      </div>
      
      <div className={styles.trashList}>
        {deletedFiles.map((file) => {
          const isRestoring = restoringIds.has(file.fileId);
          
          return (
            <div key={file.fileId} className={styles.trashItem}>
              <div className={styles.trashItemIcon}>
                {getFileIcon(file.mimeType)}
              </div>
              
              <div className={styles.trashItemInfo}>
                <div className={styles.trashItemName}>{file.filename}</div>
                <div className={styles.trashItemMeta}>
                  <span className={styles.trashItemSize}>{formatSize(file.size)}</span>
                  <span className={styles.trashItemTime}>
                    <Clock size={12} strokeWidth={1.5} />
                    {formatTimeRemaining(file.deletedAt)}
                  </span>
                </div>
              </div>
              
              <button
                className={styles.trashRestoreButton}
                onClick={() => handleRestore(file)}
                disabled={isRestoring}
                title="Restore file"
              >
                <RotateCcw size={16} strokeWidth={1.5} className={isRestoring ? styles.spinning : ''} />
                <span>{isRestoring ? 'Restoring...' : 'Restore'}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TrashView;
