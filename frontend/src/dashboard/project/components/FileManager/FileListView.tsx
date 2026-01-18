/**
 * FileListView - Dense list view for files (default view)
 * 
 * Features:
 * - Columns: Name, Type, Size, Updated, Owner, Actions
 * - Row hover states
 * - Sortable columns
 * - Selection support
 */

import React, { useCallback } from 'react';
import {
  Download,
  MoreHorizontal,
  Folder,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { FileThumb } from '@/shared/ui/FileThumb';
import { getFileTypeInfo } from '@/shared/ui/FileThumb/FileIconByType';
import styles from './file-manager-v2.module.css';

export interface FileListItem {
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

export type SortField = 'name' | 'type' | 'size' | 'updated';
export type SortDirection = 'asc' | 'desc';

export interface FileListViewProps {
  /** Files to display */
  files: FileListItem[];
  /** Folders to display (shown first) */
  folders?: FileListItem[];
  /** Selected file URLs */
  selectedItems: Set<string>;
  /** Selection change callback */
  onSelectionChange: (url: string, index: number, event?: React.MouseEvent) => void;
  /** File click callback (open/preview) */
  onFileClick: (file: FileListItem, index: number, event?: React.MouseEvent) => void;
  /** Folder click callback */
  onFolderClick?: (folderKey: string) => void;
  /** Download single file */
  onDownload: (file: FileListItem) => void;
  /** Context menu callback */
  onContextMenu?: (e: React.MouseEvent, file: FileListItem) => void;
  /** Delete single file */
  onDelete?: (file: FileListItem) => void;
  /** Current sort field */
  sortField?: SortField;
  /** Current sort direction */
  sortDirection?: SortDirection;
  /** Sort change callback */
  onSortChange?: (field: SortField) => void;
  /** Whether user can delete */
  canDelete?: boolean;
  /** Empty state message */
  emptyMessage?: string;
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

export function FileListView({
  files,
  folders = [],
  selectedItems,
  onSelectionChange,
  onFileClick,
  onFolderClick,
  onDownload,
  onContextMenu,
  onDelete,
  sortField = 'name',
  sortDirection = 'asc',
  onSortChange,
  canDelete = false,
  emptyMessage = 'No files in this folder',
}: FileListViewProps) {
  const handleRowClick = useCallback(
    (file: FileListItem, index: number, e: React.MouseEvent) => {
      if (file.isFolder && onFolderClick) {
        onFolderClick(file.id);
      } else if (e.shiftKey || e.ctrlKey || e.metaKey) {
        onSelectionChange(file.url, index, e);
      } else {
        onFileClick(file, index, e);
      }
    },
    [onFileClick, onFolderClick, onSelectionChange]
  );

  const handleRowDoubleClick = useCallback(
    (file: FileListItem, index: number, e: React.MouseEvent) => {
      if (file.isFolder && onFolderClick) {
        onFolderClick(file.id);
      } else {
        onFileClick(file, index, e);
      }
    },
    [onFileClick, onFolderClick]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, file: FileListItem) => {
      e.preventDefault();
      onContextMenu?.(e, file);
    },
    [onContextMenu]
  );

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp size={12} className={styles.sortIcon} />
    ) : (
      <ChevronDown size={12} className={styles.sortIcon} />
    );
  };

  const allItems = [...folders, ...files];

  if (allItems.length === 0) {
    return (
      <div className={styles.listEmpty}>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={styles.listContainer}>
      <table className={styles.listTable}>
        <thead>
          <tr>
            <th
              className={`${styles.listTh} ${styles.listThName}`}
              onClick={() => onSortChange?.('name')}
            >
              Name {renderSortIcon('name')}
            </th>
            <th
              className={styles.listTh}
              onClick={() => onSortChange?.('type')}
            >
              Type {renderSortIcon('type')}
            </th>
            <th
              className={styles.listTh}
              onClick={() => onSortChange?.('size')}
            >
              Size {renderSortIcon('size')}
            </th>
            <th
              className={styles.listTh}
              onClick={() => onSortChange?.('updated')}
            >
              Modified {renderSortIcon('updated')}
            </th>
            <th className={`${styles.listTh} ${styles.listThActions}`}>
              {/* Actions column - no header */}
            </th>
          </tr>
        </thead>
        <tbody>
          {allItems.map((item, index) => {
            const isSelected = selectedItems.has(item.url);
            const ext = getExtension(item.fileName);
            const typeInfo = getFileTypeInfo(item.mimeType, ext);

            return (
              <tr
                key={item.url || item.id}
                className={`${styles.listRow} ${isSelected ? styles.listRowSelected : ''}`}
                onClick={(e) => handleRowClick(item, index, e)}
                onDoubleClick={(e) => handleRowDoubleClick(item, index, e)}
                onContextMenu={(e) => handleContextMenu(e, item)}
                tabIndex={0}
                aria-selected={isSelected}
              >
                <td className={styles.listTdName}>
                  <div className={styles.listNameCell}>
                    {item.isFolder ? (
                      <Folder size={20} className={styles.listFolderIcon} />
                    ) : (
                      <FileThumb
                        url={item.url}
                        thumbnailUrl={item.thumbnailUrl}
                        fileName={item.fileName}
                        mimeType={item.mimeType}
                        size="sm"
                      />
                    )}
                    <span className={styles.listFileName}>{item.fileName}</span>
                  </div>
                </td>
                <td className={styles.listTd}>
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
                <td className={styles.listTd}>
                  {item.isFolder ? '—' : formatFileSize(item.sizeBytes)}
                </td>
                <td className={styles.listTd}>
                  {formatDate(item.updatedAt)}
                </td>
                <td className={styles.listTdActions}>
                  <div className={styles.listRowActions}>
                    {!item.isFolder && (
                      <button
                        type="button"
                        className={styles.listActionBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownload(item);
                        }}
                        aria-label="Download"
                      >
                        <Download size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.listActionBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        onContextMenu?.(e, item);
                      }}
                      aria-label="More actions"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default FileListView;
