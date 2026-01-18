/**
 * GridTile - Memoized grid tile component for virtualized rendering
 * 
 * Features:
 * - React.memo with custom comparison for performance
 * - Stable callbacks via refs
 * - Minimal re-renders on selection change
 * - Optimized for react-window virtualization
 */

import React, { memo, useCallback, useRef } from 'react';
import { Check, Folder, MoreHorizontal } from 'lucide-react';
import { FileThumb } from '@/shared/ui/FileThumb';
import styles from './file-manager-v2.module.css';

export interface GridTileItem {
  id: string;
  fileName: string;
  url: string;
  thumbnailUrl?: string;
  mimeType?: string;
  isFolder?: boolean;
}

export interface GridTileProps {
  item: GridTileItem;
  index: number;
  isSelected: boolean;
  onSelect: (url: string, index: number, event?: React.MouseEvent) => void;
  onClick: (item: GridTileItem, index: number, event?: React.MouseEvent) => void;
  onDoubleClick?: (item: GridTileItem, index: number) => void;
  onFolderClick?: (folderKey: string) => void;
  onContextMenu?: (e: React.MouseEvent, item: GridTileItem) => void;
  onActionSheet?: (item: GridTileItem) => void;
  selectionMode?: 'none' | 'single' | 'multi';
  style?: React.CSSProperties;
}

// Double-click detection per tile
const DOUBLE_CLICK_THRESHOLD = 300;

function GridTileComponent({
  item,
  index,
  isSelected,
  onSelect,
  onClick,
  onDoubleClick,
  onFolderClick,
  onContextMenu,
  onActionSheet,
  selectionMode = 'none',
  style,
}: GridTileProps) {
  const lastClickRef = useRef<number>(0);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Prevent browser text selection on shift+click
      if (e.shiftKey) {
        e.preventDefault();
      }

      const now = Date.now();
      const isDoubleClick = now - lastClickRef.current < DOUBLE_CLICK_THRESHOLD;
      lastClickRef.current = now;

      if (isDoubleClick && onDoubleClick && !item.isFolder) {
        onDoubleClick(item, index);
        return;
      }

      if (item.isFolder && onFolderClick) {
        onFolderClick(item.id);
      } else if (e.shiftKey || e.ctrlKey || e.metaKey || selectionMode === 'multi') {
        onSelect(item.url, index, e);
      } else {
        onClick(item, index, e);
      }
    },
    [item, index, onSelect, onClick, onDoubleClick, onFolderClick, selectionMode]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onContextMenu?.(e, item);
    },
    [item, onContextMenu]
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

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(item.url, index);
    },
    [item.url, index, onSelect]
  );

  return (
    <div
      style={style}
      className={`${styles.gridItem} ${isSelected ? styles.gridItemSelected : ''}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      tabIndex={0}
      role="button"
      aria-selected={isSelected}
    >
      {/* Selection checkbox */}
      <div className={styles.gridItemCheckbox} onClick={handleCheckboxClick}>
        {isSelected && <Check size={12} />}
      </div>

      {/* Actions button */}
      <button
        type="button"
        className={styles.gridItemActions}
        onClick={handleActionsClick}
        aria-label="More actions"
      >
        <MoreHorizontal size={14} />
      </button>

      {/* Thumbnail */}
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
}

// Custom comparison for memo - only re-render when necessary
function areEqual(prev: GridTileProps, next: GridTileProps): boolean {
  // Always re-render if selection changes
  if (prev.isSelected !== next.isSelected) return false;
  
  // Re-render if item identity changes
  if (prev.item.url !== next.item.url) return false;
  if (prev.item.id !== next.item.id) return false;
  if (prev.item.fileName !== next.item.fileName) return false;
  if (prev.item.thumbnailUrl !== next.item.thumbnailUrl) return false;
  
  // Re-render if position changes (for virtualization)
  if (prev.index !== next.index) return false;
  if (prev.style?.top !== next.style?.top) return false;
  if (prev.style?.left !== next.style?.left) return false;
  
  // Selection mode change
  if (prev.selectionMode !== next.selectionMode) return false;
  
  return true;
}

export const GridTile = memo(GridTileComponent, areEqual);
export default GridTile;
