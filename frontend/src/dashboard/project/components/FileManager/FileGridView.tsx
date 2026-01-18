/**
 * FileGridView - Grid view for files (optional view mode)
 * 
 * Features:
 * - Compact, dense tiles
 * - Folder tiles are smaller than current oversized blocks
 * - File tiles show thumbnail or type tile
 * - Selection checkboxes
 */

import React, { useCallback } from 'react';
import { Check, Folder } from 'lucide-react';
import { FileThumb } from '@/shared/ui/FileThumb';
import styles from './file-manager-v2.module.css';

export interface GridItem {
  id: string;
  fileName: string;
  url: string;
  thumbnailUrl?: string;
  mimeType?: string;
  isFolder?: boolean;
}

export interface FileGridViewProps {
  /** Items to display */
  items: GridItem[];
  /** Selected item URLs */
  selectedItems: Set<string>;
  /** Selection change callback */
  onSelectionChange: (url: string, index: number, event?: React.MouseEvent) => void;
  /** Item click callback (open/preview) */
  onItemClick: (item: GridItem, index: number, event?: React.MouseEvent) => void;
  /** Folder click callback */
  onFolderClick?: (folderKey: string) => void;
  /** Context menu callback */
  onContextMenu?: (e: React.MouseEvent, item: GridItem) => void;
  /** Selection mode */
  selectionMode?: 'none' | 'single' | 'multi';
  /** Empty state message */
  emptyMessage?: string;
}

export function FileGridView({
  items,
  selectedItems,
  onSelectionChange,
  onItemClick,
  onFolderClick,
  onContextMenu,
  selectionMode = 'none',
  emptyMessage = 'No files in this folder',
}: FileGridViewProps) {
  const handleClick = useCallback(
    (item: GridItem, index: number, e: React.MouseEvent) => {
      if (item.isFolder && onFolderClick) {
        onFolderClick(item.id);
      } else if (e.shiftKey || e.ctrlKey || e.metaKey || selectionMode === 'multi') {
        onSelectionChange(item.url, index, e);
      } else {
        onItemClick(item, index, e);
      }
    },
    [onItemClick, onFolderClick, onSelectionChange, selectionMode]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, item: GridItem) => {
      e.preventDefault();
      onContextMenu?.(e, item);
    },
    [onContextMenu]
  );

  if (items.length === 0) {
    return (
      <div className={styles.listEmpty}>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={styles.gridContainer}>
      {items.map((item, index) => {
        const isSelected = selectedItems.has(item.url);

        return (
          <div
            key={item.url || item.id}
            className={`${styles.gridItem} ${isSelected ? styles.gridItemSelected : ''}`}
            onClick={(e) => handleClick(item, index, e)}
            onContextMenu={(e) => handleContextMenu(e, item)}
            tabIndex={0}
            role="button"
            aria-selected={isSelected}
          >
            {/* Selection checkbox */}
            <div
              className={styles.gridItemCheckbox}
              onClick={(e) => {
                e.stopPropagation();
                onSelectionChange(item.url, index);
              }}
            >
              {isSelected && <Check size={12} />}
            </div>

            {/* Thumbnail area */}
            <div className={styles.gridItemThumb}>
              {item.isFolder ? (
                <div className={styles.gridFolderIcon}>
                  <Folder size={32} />
                </div>
              ) : (
                <FileThumb
                  url={item.url}
                  thumbnailUrl={item.thumbnailUrl}
                  fileName={item.fileName}
                  mimeType={item.mimeType}
                  size="md"
                />
              )}
            </div>

            {/* File name */}
            <div className={styles.gridItemName} title={item.fileName}>
              {item.fileName}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default FileGridView;
