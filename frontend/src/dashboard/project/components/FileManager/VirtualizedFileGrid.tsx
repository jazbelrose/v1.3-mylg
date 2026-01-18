/**
 * VirtualizedFileGrid - High-performance virtualized grid for files
 * 
 * Features:
 * - Uses react-window v2 for efficient rendering of large lists
 * - Only renders visible items + buffer
 * - Memoized tiles with GridTile component
 * - Smooth scrolling with overscan
 * - Responsive column count
 * - Selection state via ref to avoid full grid re-renders
 */

import React, { memo, useMemo, useRef, useEffect, type CSSProperties, type ReactElement } from 'react';
import { Grid } from 'react-window';
import { GridTile, GridTileItem } from './GridTile';
import styles from './file-manager-v2.module.css';

export interface VirtualizedFileGridProps {
  items: GridTileItem[];
  selectedItems: Set<string>;
  onSelectionChange: (url: string, index: number, event?: React.MouseEvent) => void;
  onItemClick: (item: GridTileItem, index: number, event?: React.MouseEvent) => void;
  onItemDoubleClick?: (item: GridTileItem, index: number) => void;
  onFolderClick?: (folderKey: string) => void;
  onContextMenu?: (e: React.MouseEvent, item: GridTileItem) => void;
  onActionSheet?: (item: GridTileItem) => void;
  selectionMode?: 'none' | 'single' | 'multi';
  containerWidth: number;
  containerHeight: number;
  emptyMessage?: string;
}

// Grid tile dimensions
const TILE_WIDTH = 130;
const TILE_HEIGHT = 140;
const GAP = 16;
const MIN_COLUMNS = 2;

// Cell props that will be passed via cellProps
interface CellData {
  items: GridTileItem[];
  selectedItems: Set<string>;
  columnCount: number;
  onSelectionChange: (url: string, index: number, event?: React.MouseEvent) => void;
  onItemClick: (item: GridTileItem, index: number, event?: React.MouseEvent) => void;
  onItemDoubleClick?: (item: GridTileItem, index: number) => void;
  onFolderClick?: (folderKey: string) => void;
  onContextMenu?: (e: React.MouseEvent, item: GridTileItem) => void;
  onActionSheet?: (item: GridTileItem) => void;
  selectionMode: 'none' | 'single' | 'multi';
  columnWidth: number;
}

// Cell renderer component for react-window v2
// Note: In v2, cellProps are spread directly onto props (not as a 'data' property)
function CellRenderer({
  columnIndex,
  rowIndex,
  style,
  items,
  selectedItems,
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
    return null; // Empty cell in last row
  }
  
  const item = items[index];
  const isSelected = selectedItems.has(item.url);
  
  // Adjust style for gap
  const adjustedStyle: CSSProperties = {
    ...style,
    left: (style.left as number) + GAP / 2,
    top: (style.top as number) + GAP / 2,
    width: columnWidth - GAP,
    height: TILE_HEIGHT,
  };
  
  return (
    <GridTile
      item={item}
      index={index}
      isSelected={isSelected}
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

function VirtualizedFileGridComponent({
  items,
  selectedItems,
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
}: VirtualizedFileGridProps) {
  // Calculate column count based on container width
  const columnCount = useMemo(() => {
    const availableWidth = containerWidth - GAP;
    const cols = Math.floor(availableWidth / (TILE_WIDTH + GAP));
    return Math.max(cols, MIN_COLUMNS);
  }, [containerWidth]);

  // Calculate row count
  const rowCount = useMemo(() => {
    return Math.ceil(items.length / columnCount);
  }, [items.length, columnCount]);

  // Calculate actual column width to fill container
  const columnWidth = useMemo(() => {
    return (containerWidth - GAP) / columnCount;
  }, [containerWidth, columnCount]);

  // Stable callback refs to prevent cellProps recreation
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

  // Stable handlers that delegate to refs
  const stableOnSelectionChange = useMemo(() => 
    (url: string, index: number, event?: React.MouseEvent) => onSelectionChangeRef.current(url, index, event),
  []);
  const stableOnItemClick = useMemo(() => 
    (item: GridTileItem, index: number, event?: React.MouseEvent) => onItemClickRef.current(item, index, event),
  []);
  const stableOnItemDoubleClick = useMemo(() => 
    (item: GridTileItem, index: number) => onItemDoubleClickRef.current?.(item, index),
  []);
  const stableOnFolderClick = useMemo(() => 
    (folderKey: string) => onFolderClickRef.current?.(folderKey),
  []);
  const stableOnContextMenu = useMemo(() => 
    (e: React.MouseEvent, item: GridTileItem) => onContextMenuRef.current?.(e, item),
  []);
  const stableOnActionSheet = useMemo(() => 
    (item: GridTileItem) => onActionSheetRef.current?.(item),
  []);

  // Cell props for the grid - using stable handlers to minimize re-creation
  const cellProps = useMemo<CellData>(() => ({
    items,
    selectedItems,
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
    selectedItems,
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

export const VirtualizedFileGrid = memo(VirtualizedFileGridComponent);
export default VirtualizedFileGrid;
