/**
 * VirtualizedListView - High-performance virtualized list view for files
 * 
 * Uses react-virtuoso's TableVirtuoso for virtualization with:
 * - Subscription-based selection (no full re-renders on selection change)
 * - Scroll placeholder optimization
 * - Memoized row components
 * - Sticky table header
 * 
 * This replaces the non-virtualized FileListView for large file sets.
 */

import React, { useCallback, useState, useRef, useEffect, useMemo, forwardRef } from 'react';
import { TableVirtuoso, TableComponents } from 'react-virtuoso';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { OptimizedListRow, type ListRowItem } from './OptimizedListRow';
import type { SelectionStore } from './hooks/useSelectionStore';
import { useIsSelected } from './hooks/useSelectionStore';
import { useIsScrolling, setScrolling } from './contexts/ScrollingContext';
import styles from './file-manager-v2.module.css';

export type SortField = 'name' | 'type' | 'size' | 'updated';
export type SortDirection = 'asc' | 'desc';

export interface VirtualizedListViewProps {
  /** Files to display */
  files: ListRowItem[];
  /** Folders to display (shown first) */
  folders?: ListRowItem[];
  /** Selection store for subscription-based selection */
  selectionStore: SelectionStore;
  /** Selection change callback */
  onSelectionChange: (url: string, index: number, event?: React.MouseEvent) => void;
  /** File click callback (open/preview) */
  onFileClick: (file: ListRowItem, index: number, event?: React.MouseEvent) => void;
  /** Double-click callback for preview */
  onFileDoubleClick?: (file: ListRowItem, index: number) => void;
  /** Folder click callback */
  onFolderClick?: (folderKey: string) => void;
  /** Download single file */
  onDownload: (file: ListRowItem) => void;
  /** Context menu callback */
  onContextMenu?: (e: React.MouseEvent, file: ListRowItem) => void;
  /** Action sheet callback (for touch) */
  onActionSheet?: (file: ListRowItem) => void;
  /** Delete single file */
  onDelete?: (file: ListRowItem) => void;
  /** Rename file callback */
  onRename?: (file: ListRowItem, newName: string) => void;
  /** Current sort field */
  sortField?: SortField;
  /** Current sort direction */
  sortDirection?: SortDirection;
  /** Sort change callback */
  onSortChange?: (field: SortField) => void;
  /** Whether user can delete */
  canDelete?: boolean;
  /** Whether user can rename */
  canRename?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Container height (defaults to 100%) */
  height?: number | string;
}

// Debounce scroll end detection
let scrollEndTimer: ReturnType<typeof setTimeout> | null = null;

// Context to pass row props to TableRow component
interface RowContext {
  selectionStore: SelectionStore;
  editingId: string | null;
}

// Create a dummy selection store for fallback
const dummySelectionStore: SelectionStore = {
  getSelection: () => new Set(),
  getSnapshot: () => new Set(),
  isSelected: () => false,
  toggle: () => {},
  set: () => {},
  addRange: () => {},
  clear: () => {},
  selectAll: () => {},
  subscribe: () => () => {},
};

// Row wrapper component that subscribes to selection
const TableRowComponent = forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement> & { 
    item?: ListRowItem; 
    context?: RowContext;
    'data-index'?: number;
  }
>(({ item, context, style, ...props }, ref) => {
  // Subscribe to this row's selection state
  const store = context?.selectionStore ?? dummySelectionStore;
  const isSelected = useIsSelected(store, item?.url || '');
  const isScrolling = useIsScrolling();
  const isEditing = context?.editingId === item?.id;
  
  const className = `${styles.listRow} ${isSelected ? styles.listRowSelected : ''} ${isEditing ? styles.listRowEditing : ''} ${isScrolling ? styles.listRowScrolling : ''}`;
  
  return (
    <tr
      {...props}
      ref={ref}
      className={className}
      style={style}
      aria-selected={isSelected}
    />
  );
});
TableRowComponent.displayName = 'TableRowComponent';

export function VirtualizedListView({
  files,
  folders = [],
  selectionStore,
  onSelectionChange,
  onFileClick,
  onFileDoubleClick,
  onFolderClick,
  onDownload,
  onContextMenu,
  onActionSheet,
  onRename,
  sortField = 'name',
  sortDirection = 'asc',
  onSortChange,
  canRename = false,
  emptyMessage = 'No files in this folder',
  height = '100%',
}: VirtualizedListViewProps) {
  // Inline rename state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Combined items list
  const allItems = useMemo(() => [...folders, ...files], [folders, files]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      const lastDot = editValue.lastIndexOf('.');
      if (lastDot > 0) {
        editInputRef.current.setSelectionRange(0, lastDot);
      } else {
        editInputRef.current.select();
      }
    }
  }, [editingId, editValue]);

  const cancelRename = useCallback(() => {
    setEditingId(null);
    setEditValue('');
  }, []);

  const commitRename = useCallback((item: ListRowItem) => {
    const trimmedValue = editValue.trim();
    if (trimmedValue && trimmedValue !== item.fileName && onRename) {
      onRename(item, trimmedValue);
    }
    cancelRename();
  }, [editValue, onRename, cancelRename]);

  // Scroll state management
  const handleScroll = useCallback(() => {
    setScrolling(true);
    
    if (scrollEndTimer) {
      clearTimeout(scrollEndTimer);
    }
    
    scrollEndTimer = setTimeout(() => {
      setScrolling(false);
    }, 150);
  }, []);

  // Context for row components
  const rowContext = useMemo<RowContext>(() => ({
    selectionStore,
    editingId,
  }), [selectionStore, editingId]);

  const renderSortIcon = useCallback((field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp size={12} className={styles.sortIcon} />
    ) : (
      <ChevronDown size={12} className={styles.sortIcon} />
    );
  }, [sortField, sortDirection]);

  // Fixed header content
  const fixedHeaderContent = useCallback(() => (
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
  ), [onSortChange, renderSortIcon]);

  // Table components configuration
  const tableComponents = useMemo<TableComponents<ListRowItem, RowContext>>(() => ({
    Table: ({ style, ...props }) => (
      <table
        {...props}
        className={styles.listTable}
        style={{ ...style, tableLayout: 'fixed' }}
      />
    ),
    TableHead: forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
      ({ style, ...props }, ref) => (
        <thead
          {...props}
          ref={ref}
          className={styles.listThead}
          style={{ ...style, position: 'sticky', top: 0, zIndex: 1 }}
        />
      )
    ),
    TableBody: forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
      ({ ...props }, ref) => <tbody {...props} ref={ref} />
    ),
    TableRow: TableRowComponent,
  }), []);

  // Row content renderer - returns the TD cells
  const itemContent = useCallback((index: number, item: ListRowItem) => (
    <OptimizedListRow
      item={item}
      index={index}
      selectionStore={selectionStore}
      onSelect={onSelectionChange}
      onClick={onFileClick}
      onDoubleClick={onFileDoubleClick}
      onFolderClick={onFolderClick}
      onContextMenu={onContextMenu}
      onActionSheet={onActionSheet}
      onDownload={onDownload}
      onRename={onRename}
      canRename={canRename}
      editingId={editingId}
      editValue={editValue}
      onEditValueChange={setEditValue}
      onCommitRename={commitRename}
      onCancelRename={cancelRename}
      editInputRef={editInputRef}
    />
  ), [
    selectionStore,
    onSelectionChange,
    onFileClick,
    onFileDoubleClick,
    onFolderClick,
    onContextMenu,
    onActionSheet,
    onDownload,
    onRename,
    canRename,
    editingId,
    editValue,
    commitRename,
    cancelRename,
  ]);

  if (allItems.length === 0) {
    return (
      <div className={styles.listEmpty}>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={styles.virtualizedListContainer} style={{ height }}>
      <TableVirtuoso
        data={allItems}
        context={rowContext}
        onScroll={handleScroll}
        overscan={20}
        fixedHeaderContent={fixedHeaderContent}
        itemContent={itemContent}
        components={tableComponents}
      />
    </div>
  );
}

export default VirtualizedListView;
