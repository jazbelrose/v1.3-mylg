/**
 * OptimizedListRow - List row cells for virtualized table
 * 
 * Returns TD cells for use with react-virtuoso's TableVirtuoso.
 * The parent TableRow component handles selection styling.
 * 
 * This component:
 * - Subscribes to scroll state for thumbnail optimization
 * - Handles click/double-click/context menu events
 * - Is memoized to prevent unnecessary re-renders
 */

import React, { memo, useCallback, useRef } from 'react';
import { Download, MoreHorizontal, Folder } from 'lucide-react';
import { FileThumb } from '@/shared/ui/FileThumb';
import { getFileTypeInfo } from '@/shared/ui/FileThumb/FileIconByType';
import type { SelectionStore } from './hooks/useSelectionStore';
import { useIsScrolling } from './contexts/ScrollingContext';
import { isThumbLoaded, getStableCacheKey } from './utils/thumbnailCache';
import styles from './file-manager-v2.module.css';

const DOUBLE_CLICK_THRESHOLD = 300;

export interface ListRowItem {
  id: string;
  fileName: string;
  url: string;
  thumbnailUrl?: string;
  mimeType?: string;
  isFolder?: boolean;
  sizeBytes?: number;
  updatedAt?: string;
  uploadedBy?: {
    id: string;
    name: string;
  };
  kind?: string;
}

export interface OptimizedListRowProps {
  item: ListRowItem;
  index: number;
  selectionStore: SelectionStore;
  onSelect: (url: string, index: number, event?: React.MouseEvent) => void;
  onClick: (item: ListRowItem, index: number, event?: React.MouseEvent) => void;
  onDoubleClick?: (item: ListRowItem, index: number) => void;
  onFolderClick?: (folderKey: string) => void;
  onContextMenu?: (e: React.MouseEvent, item: ListRowItem) => void;
  onActionSheet?: (item: ListRowItem) => void;
  onDownload: (item: ListRowItem) => void;
  onRename?: (item: ListRowItem, newName: string) => void;
  canRename?: boolean;
  editingId?: string | null;
  editValue?: string;
  onEditValueChange?: (value: string) => void;
  onCommitRename?: (item: ListRowItem) => void;
  onCancelRename?: () => void;
  editInputRef?: React.RefObject<HTMLInputElement>;
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
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function getExtension(fileName?: string): string {
  if (!fileName) return '';
  return fileName.split('.').pop()?.toLowerCase() || '';
}

function OptimizedListRowComponent({
  item,
  index,
  onSelect,
  onClick,
  onDoubleClick,
  onFolderClick,
  onContextMenu,
  onActionSheet,
  onDownload,
  editingId,
  editValue = '',
  onEditValueChange,
  onCommitRename,
  onCancelRename,
  editInputRef,
}: OptimizedListRowProps) {
  // Subscribe to scroll state for thumbnail optimization
  const isScrolling = useIsScrolling();
  
  const lastClickRef = useRef<number>(0);
  const isEditing = editingId === item.id;
  const ext = getExtension(item.fileName);
  const typeInfo = getFileTypeInfo(item.mimeType, ext);

  // Handle row click (on name cell)
  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      if (isEditing) return;
      
      if (e.shiftKey) {
        e.preventDefault();
      }

      const now = Date.now();
      const isDoubleClick = now - lastClickRef.current < DOUBLE_CLICK_THRESHOLD;
      lastClickRef.current = now;

      if (isDoubleClick) {
        if (item.isFolder && onFolderClick) {
          onFolderClick(item.id);
        } else if (onDoubleClick) {
          onDoubleClick(item, index);
        }
        return;
      }

      if (item.isFolder && onFolderClick) {
        onFolderClick(item.id);
      } else if (e.shiftKey || e.ctrlKey || e.metaKey) {
        onSelect(item.url, index, e);
      } else {
        onClick(item, index, e);
      }
    },
    [item, index, onSelect, onClick, onDoubleClick, onFolderClick, isEditing]
  );

  const handleRowContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (isEditing) return;
      e.preventDefault();
      onContextMenu?.(e, item);
    },
    [item, onContextMenu, isEditing]
  );

  const handleActionsClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if ('ontouchstart' in window && onActionSheet) {
        onActionSheet(item);
      } else if (onContextMenu) {
        onContextMenu(e, item);
      }
    },
    [item, onContextMenu, onActionSheet]
  );

  const handleDownloadClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDownload(item);
    },
    [item, onDownload]
  );

  // Render thumbnail with scroll optimization
  const renderThumbnail = () => {
    if (item.isFolder) {
      return <Folder size={20} className={styles.listFolderIcon} />;
    }
    
    const cacheKey = getStableCacheKey(item.url, item.id);
    const alreadyLoaded = isThumbLoaded(cacheKey);
    
    // During scroll, show placeholder if thumbnail hasn't loaded
    if (isScrolling && !alreadyLoaded) {
      return (
        <div className={styles.listThumbPlaceholder}>
          <div className={styles.listThumbPlaceholderIcon} />
        </div>
      );
    }
    
    return (
      <FileThumb
        url={item.url}
        thumbnailUrl={item.thumbnailUrl}
        fileName={item.fileName}
        mimeType={item.mimeType}
        size="sm"
        cacheKey={cacheKey}
      />
    );
  };

  // Return TD cells - the parent VirtualizedListView's TableRow handles the TR wrapper
  return (
    <>
      <td 
        className={styles.listTdName}
        onClick={handleRowClick}
        onContextMenu={handleRowContextMenu}
      >
        <div className={styles.listNameCell}>
          {renderThumbnail()}
          {isEditing ? (
            <input
              ref={editInputRef}
              type="text"
              className={styles.listRenameInput}
              value={editValue}
              onChange={(e) => onEditValueChange?.(e.target.value)}
              onBlur={() => onCommitRename?.(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onCommitRename?.(item);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancelRename?.();
                }
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className={styles.listFileName}>{item.fileName}</span>
          )}
        </div>
      </td>
      <td className={styles.listTd} onClick={handleRowClick}>
        {item.isFolder ? (
          <span className={styles.listType}>Folder</span>
        ) : (
          <span
            className={styles.listType}
            style={{ color: typeInfo.color }}
          >
            {ext.toUpperCase() || '—'}
          </span>
        )}
      </td>
      <td className={styles.listTd} onClick={handleRowClick}>
        {item.isFolder ? '—' : formatFileSize(item.sizeBytes)}
      </td>
      <td className={styles.listTd} onClick={handleRowClick}>
        {formatDate(item.updatedAt)}
      </td>
      <td className={styles.listTdActions}>
        <div className={styles.listRowActions}>
          {!item.isFolder && (
            <button
              type="button"
              className={styles.listActionBtn}
              onClick={handleDownloadClick}
              aria-label="Download"
            >
              <Download size={14} />
            </button>
          )}
          <button
            type="button"
            className={styles.listActionBtn}
            onClick={handleActionsClick}
            aria-label="More actions"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      </td>
    </>
  );
}

// Custom comparison function for memo
function areEqual(prev: OptimizedListRowProps, next: OptimizedListRowProps): boolean {
  // Item identity
  if (prev.item.url !== next.item.url) return false;
  if (prev.item.id !== next.item.id) return false;
  if (prev.item.fileName !== next.item.fileName) return false;
  if (prev.item.thumbnailUrl !== next.item.thumbnailUrl) return false;
  if (prev.item.sizeBytes !== next.item.sizeBytes) return false;
  if (prev.item.updatedAt !== next.item.updatedAt) return false;
  if (prev.item.isFolder !== next.item.isFolder) return false;
  
  // Position
  if (prev.index !== next.index) return false;
  
  // Editing state
  if (prev.editingId !== next.editingId) return false;
  if (prev.editValue !== next.editValue) return false;
  
  // Note: We DON'T compare callbacks because they should be stable refs
  
  return true;
}

export const OptimizedListRow = memo(OptimizedListRowComponent, areEqual);
export default OptimizedListRow;
