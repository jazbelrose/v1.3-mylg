// FileManager Components Barrel Export
// V2 is now the only version - exported as both FileManagerV2 and FileManager for compatibility
export { default as FileManagerV2 } from './FileManagerV2';
export { default as FileManager } from './FileManagerV2';  // Alias for backward compatibility

// V2 Components
export { FolderTree } from './FolderTree';
export type { FolderTreeProps, FolderTreeItem } from './FolderTree';
export { Breadcrumb } from './Breadcrumb';
export type { BreadcrumbProps, BreadcrumbSegment } from './Breadcrumb';
export { ContextMenu } from './ContextMenu';
export type { ContextMenuProps, ContextMenuAction, ContextMenuItem } from './ContextMenu';
export { ActionSheet } from './ActionSheet';
export type { ActionSheetProps } from './ActionSheet';
export { QuickLookModal } from './QuickLookModal';
export type { QuickLookModalProps } from './QuickLookModal';
export { BulkActionBar } from './BulkActionBar';
export type { BulkActionBarProps } from './BulkActionBar';
export { FileInspector } from './FileInspector';
export type { FileInspectorProps, FileDetails } from './FileInspector';
export { FileListView } from './FileListView';
export type { FileListViewProps, FileListItem, SortField, SortDirection } from './FileListView';
export { FileGridView } from './FileGridView';
export type { FileGridViewProps, GridItem } from './FileGridView';
export { FolderPickerModal } from './FolderPickerModal';
export type { FolderPickerModalProps, FolderPickerFolder } from './FolderPickerModal';

// Hooks
export { useLongPress } from './hooks/useLongPress';
export type { UseLongPressOptions, LongPressHandlers } from './hooks/useLongPress';

// Types and Utils
export * from './FileManagerTypes';
export * from './FileManagerUtils';