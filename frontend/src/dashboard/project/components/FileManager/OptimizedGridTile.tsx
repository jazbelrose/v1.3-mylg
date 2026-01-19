/**
 * OptimizedGridTile - Grid tile that subscribes to its own selection state
 * 
 * This component subscribes to the selection store directly instead of
 * receiving isSelected as a prop. This means:
 * - Parent doesn't re-render when selection changes
 * - Only the affected tile re-renders
 * - Much better performance for large grids
 * 
 * Also subscribes to scroll state to show placeholders during scroll
 * (reduces paint cost for smoother scrolling).
 */

import React, { memo, useCallback, useRef, useEffect } from 'react';
import { Check, Folder, MoreHorizontal, Image } from 'lucide-react';
import { FileThumb } from '@/shared/ui/FileThumb';
import type { SelectionStore } from './hooks/useSelectionStore';
import { useIsSelected } from './hooks/useSelectionStore';
import { useIsScrolling } from './contexts/ScrollingContext';
import { filesPerf } from './hooks/useFilesPerf';
import { isThumbLoaded, getStableCacheKey } from './utils/thumbnailCache';
import styles from './file-manager-v2.module.css';

const IS_DEV = import.meta.env.DEV;

export interface OptimizedGridTileItem {
  id: string;
  fileName: string;
  url: string;
  thumbnailUrl?: string;
  mimeType?: string;
  isFolder?: boolean;
}

export interface OptimizedGridTileProps {
  item: OptimizedGridTileItem;
  index: number;
  selectionStore: SelectionStore;
  onSelect: (url: string, index: number, event?: React.MouseEvent) => void;
  onClick: (item: OptimizedGridTileItem, index: number, event?: React.MouseEvent) => void;
  onDoubleClick?: (item: OptimizedGridTileItem, index: number) => void;
  onFolderClick?: (folderKey: string) => void;
  onContextMenu?: (e: React.MouseEvent, item: OptimizedGridTileItem) => void;
  onActionSheet?: (item: OptimizedGridTileItem) => void;
  selectionMode?: 'none' | 'single' | 'multi';
  style?: React.CSSProperties;
}

const DOUBLE_CLICK_THRESHOLD = 300;

function OptimizedGridTileComponent({
  item,
  index,
  selectionStore,
  onSelect,
  onClick,
  onDoubleClick,
  onFolderClick,
  onContextMenu,
  onActionSheet,
  selectionMode = 'none',
  style,
}: OptimizedGridTileProps) {
  // Track renders in dev mode
  useEffect(() => {
    if (IS_DEV) {
      filesPerf.countRender('Tile');
    }
  });
  
  // Subscribe to this item's selection state only
  // This component will ONLY re-render when THIS item's selection changes
  const isSelected = useIsSelected(selectionStore, item.url);
  
  // Subscribe to scroll state to show placeholders during scroll
  const isScrolling = useIsScrolling();
  
  const lastClickRef = useRef<number>(0);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
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
      className={`${styles.gridItem} ${isSelected ? styles.gridItemSelected : ''} ${isScrolling ? styles.gridItemScrolling : ''}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      tabIndex={0}
      role="button"
      aria-selected={isSelected}
    >
      <div className={styles.gridItemCheckbox} onClick={handleCheckboxClick}>
        {isSelected && <Check size={12} />}
      </div>

      <button
        type="button"
        className={styles.gridItemActions}
        onClick={handleActionsClick}
        aria-label="More actions"
      >
        <MoreHorizontal size={14} />
      </button>

      <div className={styles.gridItemThumb}>
        {item.isFolder ? (
          <div className={styles.gridFolderIcon}>
            <Folder size={32} />
          </div>
        ) : (() => {
          // Check if this thumbnail is already loaded (from cache)
          const cacheKey = getStableCacheKey(item.url, item.id);
          const alreadyLoaded = isThumbLoaded(cacheKey);
          
          // Only show placeholder during scroll if the image hasn't loaded yet
          // This prevents the "reloading" flash for already-seen images
          if (isScrolling && !alreadyLoaded) {
            return (
              <div className={styles.scrollPlaceholder}>
                <Image size={24} />
              </div>
            );
          }
          
          // Render the actual thumbnail (will use browser cache if already loaded)
          return (
            <FileThumb
              url={item.url}
              thumbnailUrl={item.thumbnailUrl}
              fileName={item.fileName}
              mimeType={item.mimeType}
              size="md"
              cacheKey={cacheKey}
            />
          );
        })()}
      </div>

      <div className={styles.gridItemName} title={item.fileName}>
        {item.fileName}
      </div>
    </div>
  );
}

// Custom comparison - now we can ignore selection since it's handled via subscription
function areEqual(prev: OptimizedGridTileProps, next: OptimizedGridTileProps): boolean {
  // Item identity
  if (prev.item.url !== next.item.url) return false;
  if (prev.item.id !== next.item.id) return false;
  if (prev.item.fileName !== next.item.fileName) return false;
  if (prev.item.thumbnailUrl !== next.item.thumbnailUrl) return false;
  
  // Position (for virtualization)
  if (prev.index !== next.index) return false;
  if (prev.style?.top !== next.style?.top) return false;
  if (prev.style?.left !== next.style?.left) return false;
  
  // Selection mode
  if (prev.selectionMode !== next.selectionMode) return false;
  
  // Note: We DON'T compare isSelected because each tile subscribes to its own state
  // Note: We DON'T compare callbacks because they're stable refs
  
  return true;
}

export const OptimizedGridTile = memo(OptimizedGridTileComponent, areEqual);
export default OptimizedGridTile;
