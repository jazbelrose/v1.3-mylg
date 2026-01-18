/**
 * OptimizedFileGrid - High-performance virtualized grid with subscription-based selection
 * 
 * Key performance improvements:
 * - Selection state is NOT in cellProps (doesn't cause all cells to re-render)
 * - Each tile subscribes to its own selection state via useSyncExternalStore
 * - Stable callback refs prevent cellProps recreation
 * - Memoized column/row calculations
 */

import React, { memo, useMemo, useRef, useEffect, type CSSProperties, type ReactElement } from 'react';
import { Grid } from 'react-window';
import { OptimizedGridTile, type OptimizedGridTileItem } from './OptimizedGridTile';
import type { SelectionStore } from './hooks/useSelectionStore';
import styles from './file-manager-v2.module.css';

export interface OptimizedFileGridProps {
  items: OptimizedGridTileItem[];
  selectionStore: SelectionStore;
  onSelectionChange: (url: string, index: number, event?: React.MouseEvent) => void;
  onItemClick: (item: OptimizedGridTileItem, index: number, event?: React.MouseEvent) => void;
  onItemDoubleClick?: (item: OptimizedGridTileItem, index: number) => void;
  onFolderClick?: (folderKey: string) => void;
  onContextMenu?: (e: React.MouseEvent, item: OptimizedGridTileItem) => void;
  onActionSheet?: (item: OptimizedGridTileItem) => void;
  selectionMode?: 'none' | 'single' | 'multi';
  containerWidth: number;
  containerHeight: number;
  emptyMessage?: string;
}

// Grid dimensions
const TILE_WIDTH = 130;
const TILE_HEIGHT = 140;
const GAP = 16;
const MIN_COLUMNS = 2;

// Cell props - NO selection state here!
interface CellData {
  items: OptimizedGridTileItem[];
  selectionStore: SelectionStore;
  columnCount: number;
  columnWidth: number;
  onSelectionChange: (url: string, index: number, event?: React.MouseEvent) => void;
  onItemClick: (item: OptimizedGridTileItem, index: number, event?: React.MouseEvent) => void;
  onItemDoubleClick?: (item: OptimizedGridTileItem, index: number) => void;
  onFolderClick?: (folderKey: string) => void;
  onContextMenu?: (e: React.MouseEvent, item: OptimizedGridTileItem) => void;
  onActionSheet?: (item: OptimizedGridTileItem) => void;
  selectionMode: 'none' | 'single' | 'multi';
}

// Cell renderer - delegates to OptimizedGridTile which handles its own selection
function CellRenderer({
  columnIndex,
  rowIndex,
  style,
  items,
  selectionStore,
  columnCount,
  columnWidth,
  onSelectionChange,
  onItemClick,
  onItemDoubleClick,
  onFolderClick,
  onContextMenu,
  onActionSheet,
  selectionMode,
}: {
  ariaAttributes: { 'aria-colindex': number; role: 'gridcell' };
  columnIndex: number;
  rowIndex: number;
  style: CSSProperties;
} & CellData): ReactElement | null {
  const index = rowIndex * columnCount + columnIndex;
  
  if (index >= items.length) {
    return null;
  }
  
  const item = items[index];
  
  const adjustedStyle: CSSProperties = {
    ...style,
    left: (style.left as number) + GAP / 2,
    top: (style.top as number) + GAP / 2,
    width: columnWidth - GAP,
    height: TILE_HEIGHT,
  };
  
  return (
    <OptimizedGridTile
      item={item}
      index={index}
      selectionStore={selectionStore}
      onSelect={onSelectionChange}
      onClick={onItemClick}
      onDoubleClick={onItemDoubleClick}
      onFolderClick={onFolderClick}
      onContextMenu={onContextMenu}
      onActionSheet={onActionSheet}
      selectionMode={selectionMode}
      style={adjustedStyle}
    />
  );
}

function OptimizedFileGridComponent({
  items,
  selectionStore,
  onSelectionChange,
  onItemClick,
  onItemDoubleClick,
  onFolderClick,
  onContextMenu,
  onActionSheet,
  selectionMode = 'none',
  containerWidth,
  containerHeight,
  emptyMessage = 'No files in this folder',
}: OptimizedFileGridProps) {
  // Memoized layout calculations
  const columnCount = useMemo(() => {
    const availableWidth = containerWidth - GAP;
    const cols = Math.floor(availableWidth / (TILE_WIDTH + GAP));
    return Math.max(cols, MIN_COLUMNS);
  }, [containerWidth]);

  const rowCount = useMemo(() => {
    return Math.ceil(items.length / columnCount);
  }, [items.length, columnCount]);

  const columnWidth = useMemo(() => {
    return (containerWidth - GAP) / columnCount;
  }, [containerWidth, columnCount]);

  // Stable callback refs
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onItemClickRef = useRef(onItemClick);
  const onItemDoubleClickRef = useRef(onItemDoubleClick);
  const onFolderClickRef = useRef(onFolderClick);
  const onContextMenuRef = useRef(onContextMenu);
  const onActionSheetRef = useRef(onActionSheet);
  
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
    onItemClickRef.current = onItemClick;
    onItemDoubleClickRef.current = onItemDoubleClick;
    onFolderClickRef.current = onFolderClick;
    onContextMenuRef.current = onContextMenu;
    onActionSheetRef.current = onActionSheet;
  });

  // Stable handlers (never change reference)
  const stableOnSelectionChange = useMemo(() => 
    (url: string, index: number, event?: React.MouseEvent) => onSelectionChangeRef.current(url, index, event),
  []);
  const stableOnItemClick = useMemo(() => 
    (item: OptimizedGridTileItem, index: number, event?: React.MouseEvent) => onItemClickRef.current(item, index, event),
  []);
  const stableOnItemDoubleClick = useMemo(() => 
    (item: OptimizedGridTileItem, index: number) => onItemDoubleClickRef.current?.(item, index),
  []);
  const stableOnFolderClick = useMemo(() => 
    (folderKey: string) => onFolderClickRef.current?.(folderKey),
  []);
  const stableOnContextMenu = useMemo(() => 
    (e: React.MouseEvent, item: OptimizedGridTileItem) => onContextMenuRef.current?.(e, item),
  []);
  const stableOnActionSheet = useMemo(() => 
    (item: OptimizedGridTileItem) => onActionSheetRef.current?.(item),
  []);

  // Cell props - NO selectedItems here! Selection is handled via subscription
  const cellProps = useMemo<CellData>(() => ({
    items,
    selectionStore,
    columnCount,
    columnWidth,
    onSelectionChange: stableOnSelectionChange,
    onItemClick: stableOnItemClick,
    onItemDoubleClick: stableOnItemDoubleClick,
    onFolderClick: stableOnFolderClick,
    onContextMenu: stableOnContextMenu,
    onActionSheet: stableOnActionSheet,
    selectionMode,
  }), [
    items,
    selectionStore,
    columnCount,
    columnWidth,
    stableOnSelectionChange,
    stableOnItemClick,
    stableOnItemDoubleClick,
    stableOnFolderClick,
    stableOnContextMenu,
    stableOnActionSheet,
    selectionMode,
  ]);

  if (items.length === 0) {
    return (
      <div className={styles.listEmpty}>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <Grid<CellData>
      className={styles.virtualizedGrid}
      style={{ width: containerWidth, height: containerHeight }}
      columnCount={columnCount}
      columnWidth={columnWidth}
      rowCount={rowCount}
      rowHeight={TILE_HEIGHT + GAP}
      cellComponent={CellRenderer}
      cellProps={cellProps}
      overscanCount={2}
    />
  );
}

export const OptimizedFileGrid = memo(OptimizedFileGridComponent);
export default OptimizedFileGrid;
