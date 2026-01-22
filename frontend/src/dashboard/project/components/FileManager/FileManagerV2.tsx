/**
 * FileManagerV2 - Modern 3-panel file manager
 * 
 * Features:
 * - Left sidebar with folder tree navigation
 * - Main content area with list/grid view
 * - Right inspector panel for file details
 * - Breadcrumb navigation
 * - Bulk actions with ZIP download
 * - Context menus + touch action sheet
 * - Drag & drop upload
 * - Keyboard shortcuts (Shift, Ctrl/Cmd select, ESC clear, Space for Quick Look)
 * - Quick Look preview modal with navigation and zoom
 * - Long-press support for touch devices
 * - Responsive: collapsible sidebar, bottom sheet inspector on mobile
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Modal from '@/shared/ui/ModalWithStack';
import ConfirmModal from '@/shared/ui/ConfirmModal';
import {
  Search,
  List,
  Grid,
  Upload,
  Plus,
  FolderPlus,
  Folder,
  ChevronDown,
  X,
  PanelLeftClose,
  PanelLeft,
  PanelRightClose,
  PanelRight,
  Check,
  Menu,
  MoreHorizontal,
} from 'lucide-react';
import { useData } from '@/app/contexts/useData';
import { useSocket } from '@/app/contexts/useSocket';
import { FolderTree, FolderTreeItem, getFolderIcon } from './FolderTree';
import { Breadcrumb, BreadcrumbSegment } from './Breadcrumb';
import { ContextMenu, ContextMenuAction } from './ContextMenu';
import { ActionSheet } from './ActionSheet';
import { QuickLookModal } from './QuickLookModal';
import { BulkActionBar } from './BulkActionBar';
import { FileInspector, FileDetails } from './FileInspector';
import { FileListView, FileListItem, SortField, SortDirection } from './FileListView';
import { VirtualizedListView } from './VirtualizedListView';
import type { ListRowItem } from './OptimizedListRow';
import { FileGridView } from './FileGridView';
import { VirtualizedFileGrid, type VirtualizedFileGridProps } from './VirtualizedFileGrid';
import { OptimizedFileGrid } from './OptimizedFileGrid';
import { type GridTileItem } from './GridTile';
import { type OptimizedGridTileItem } from './OptimizedGridTile';
import { useSelectionStore } from './hooks/useSelectionStore';
import { PerfHUD } from './components/PerfHUD';
import { useFilesPerf } from './hooks/useFilesPerf';
import { useFileTransferStore } from './hooks/useFileTransferStore';
import { usePinnedAndRecent } from './hooks/usePinnedAndRecent';
import { FolderPickerModal, FolderPickerFolder } from './FolderPickerModal';
import { FileThumb } from '@/shared/ui/FileThumb';
import { FileTransferStatus } from './components/FileTransferStatus';
import { useFileManagerState } from '../Shared/hooks/useFileManagerState';
import { useFileMessenger } from '../Shared/hooks/useFileMessenger';
import { useFileTransfers } from '../Shared/hooks/useFileTransfers';
import type { Message } from '@/app/contexts/DataProvider';
import { useOrg } from '@/app/contexts/useOrg';
import type { FileManagerProps, FileManagerRef, FolderOption, FileItem, ViewMode } from './FileManagerTypes';
import { apiFetch, EDIT_PROJECT_URL, getFileUrl } from '@/shared/utils/api';
import { notify } from '@/shared/ui/ToastNotifications';
import { getFileKind, getThumbnailUrl, hasGeneratedThumbnail } from './FileManagerUtils';
import Dropdown from './Dropdown';
import styles from './file-manager-v2.module.css';
import legacyStyles from './file-manager.module.css';

export type { FileManagerProps, FileManagerRef, FileItem };

if (typeof document !== 'undefined') {
  Modal.setAppElement('#root');
}

const SYSTEM_FOLDERS: FolderOption[] = [
  { key: 'drawings', name: 'Drawings' },
  { key: 'invoices', name: 'Documents' },
  { key: 'downloads', name: 'Downloads' },
  { key: 'notes', name: 'Notes' },
];

const ROOT_FOLDER: FolderOption = { key: 'uploads', name: 'Project Files' };

const sanitizeFolderKey = (name: string, existingKeys: Set<string>): string => {
  const fallback = 'folder';
  const cleaned = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-\s_]+/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const base = cleaned || fallback;
  let candidate = base;
  let counter = 2;

  while (existingKeys.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }

  return candidate;
};

const FileManagerV2Component = forwardRef<FileManagerRef, FileManagerProps>(
  (
    {
      folder = 'uploads',
      displayName,
      style,
      showTrigger = true,
      isOpen,
      onRequestClose,
      selectionMode = 'none',
      onFileSelect,
      fileTypeFilter = 'all',
      orgId,
    },
    ref
  ) => {
    const {
      activeProject,
      user,
      isAdmin,
      isBuilder,
      isDesigner,
      projectMessages = {},
      setProjectMessages = () => {},
    } = useData();
    const { ws } = useSocket() || {};
    const { orgs, activeOrgBranding } = useOrg();

    // In org mode, everyone with access can upload/delete
    const isOrgMode = Boolean(orgId);

    // Get org info when in org mode
    const activeOrg = isOrgMode ? orgs.find(o => o.orgId === orgId) : null;
    const canUpload = isOrgMode || isAdmin || isBuilder || isDesigner || folder === 'uploads';
    const canDelete = isOrgMode || isAdmin || isBuilder || isDesigner;

    // State from shared hook
    const state = useFileManagerState({
      folder,
      displayName,
      isOpen,
      onRequestClose,
      activeProject,
      selectionMode,
      onFileSelect,
      fileTypeFilter,
    });

    const {
      fileInputRef,
      scrollerRef,
      folderKey,
      setFolderKey,
      renderedName,
      setSelectedFiles,
      isFilesModalOpen,
      setFilesModalOpen,
      closeFilesModal,
      onConfirmSelection,
      isImageModalOpen,
      selectedImage,
      currentIndex,
      selectedItems,
      setSelectedItems,
      isSelectMode,
      setIsSelectMode,
      toggleSelectMode,
      isConfirmingDelete,
      setIsConfirmingDelete,
      isDragging,
      setIsDragging,
      isLoading,
      setIsLoading,
      searchTerm,
      setSearchTerm,
      viewMode,
      toggleViewMode,
      sortOption,
      setSortOption,
      filterOption,
      setFilterOption,
      filterOptionsList,
      displayedFiles,
      handleSelectionChange,
      handleSelectAll,
      isSelected,
      handleFileClick,
      closeImageModal,
      selectedFilesCount,
      localActiveProject,
      setLocalActiveProject,
      handleTouchStart,
      handleTouchMove,
      handleTouchEnd,
      sortOptionsList,
      customFolders,
      addCustomFolder,
    } = state;

    // Pinned and recent files (persisted to localStorage)
    const {
      pinnedFiles,
      recentFiles,
      isPinned,
      togglePin,
      trackRecent,
    } = usePinnedAndRecent(activeProject?.projectId as string | undefined);

    // Local UI state
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const [inspectorFile, setInspectorFile] = useState<FileDetails | null>(null);
    const [contextMenu, setContextMenu] = useState<{
      x: number;
      y: number;
      file: FileItem | null;
      type: 'file' | 'folder' | 'empty';
    } | null>(null);
    const [isZipping, setIsZipping] = useState(false);
    const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
    
    // Folder upload input ref (separate from file input)
    const folderInputRef = useRef<HTMLInputElement>(null);
    
    // High-performance selection store for grid view
    // Uses subscription pattern so only affected tiles re-render
    const selectionStore = useSelectionStore();
    
    // Dev-only perf instrumentation
    const perf = useFilesPerf();
    const [gridRenderCount, setGridRenderCount] = useState(0);
    const [tileRenderCount, setTileRenderCount] = useState(0);
    
    // Track grid renders
    const trackGridRender = useCallback(() => {
      setGridRenderCount(c => c + 1);
      perf.countRender('Grid');
    }, [perf]);
    
    // Track tile renders (called by tiles)
    const trackTileRender = useCallback(() => {
      setTileRenderCount(c => c + 1);
      perf.countRender('Tile');
    }, [perf]);
    
    // Sync selection store with state when selectedItems changes (for bulk action bar, etc.)
    useEffect(() => {
      selectionStore.set(selectedItems);
    }, [selectedItems, selectionStore]);
    
    // Move modal state
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [moveTargetFiles, setMoveTargetFiles] = useState<FileItem[]>([]);
    
    // Rename state (for triggering from context menu)
    const [renameTargetId, setRenameTargetId] = useState<string | null>(null);

    // Quick Look preview modal state
    const [quickLookOpen, setQuickLookOpen] = useState(false);
    const [quickLookIndex, setQuickLookIndex] = useState(0);
    
    // Action sheet state (for touch devices)
    const [actionSheetOpen, setActionSheetOpen] = useState(false);
    const [actionSheetFile, setActionSheetFile] = useState<FileItem | null>(null);
    
    // Mobile drawer state
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
    
    // Track selected file index for keyboard navigation
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);
    
    // Search input ref for keyboard shortcut
    const searchInputRef = useRef<HTMLInputElement>(null);
    
    // Container size for virtualized grid
    const contentAreaRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const resizeObserverRef = useRef<ResizeObserver | null>(null);

    // Detect touch device
    const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

    // Convert sortOption to field and direction
    const [sortField, sortDirection] = useMemo((): [SortField, SortDirection] => {
      const parts = sortOption.split('-');
      const field = parts[0];
      const direction = parts[1] as SortDirection;
      if (field === 'kind') {
        return ['type', direction];
      }
      if (field === 'date') {
        return ['updated', direction];
      }
      return [field as SortField, direction];
    }, [sortOption]);

    // Open Quick Look for a file
    const openQuickLook = useCallback((index: number) => {
      if (index >= 0 && index < displayedFiles.length) {
        const file = displayedFiles[index];
        setQuickLookIndex(index);
        setQuickLookOpen(true);
        // Track as recently accessed
        if (file) {
          trackRecent({ url: file.url, fileName: file.fileName, folderKey });
        }
      }
    }, [displayedFiles, folderKey, trackRecent]);

    // RAF-throttled resize handling to prevent layout thrash
    const rafRef = useRef<number | null>(null);
    const pendingSizeRef = useRef<{ width: number; height: number } | null>(null);

    // Measure container size for virtualized grid
    useLayoutEffect(() => {
      // Create ResizeObserver once with RAF throttling
      if (!resizeObserverRef.current) {
        resizeObserverRef.current = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry) {
            const { width, height } = entry.contentRect;
            pendingSizeRef.current = { width, height };
            
            // Throttle via requestAnimationFrame
            if (!rafRef.current) {
              rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null;
                const pending = pendingSizeRef.current;
                if (!pending) return;
                
                setContainerSize((prev) => {
                  // Avoid unnecessary re-renders for tiny changes
                  if (Math.abs(prev.width - pending.width) < 2 && Math.abs(prev.height - pending.height) < 2) {
                    return prev;
                  }
                  return pending;
                });
              });
            }
          }
        });
      }
      
      return () => {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        resizeObserverRef.current?.disconnect();
        resizeObserverRef.current = null;
      };
    }, []);
    
    // Observe content area when ref is set
    useEffect(() => {
      if (!contentAreaRef.current || !resizeObserverRef.current) return;
      
      // Immediate measurement
      const rect = contentAreaRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ width: rect.width, height: rect.height });
      }
      
      resizeObserverRef.current.observe(contentAreaRef.current);
      
      return () => {
        resizeObserverRef.current?.disconnect();
      };
    }, [isFilesModalOpen]);

    // Keyboard shortcuts
    // Close upload menu when clicking outside
    useEffect(() => {
      if (!uploadMenuOpen) return;
      
      const handleClickOutside = () => setUploadMenuOpen(false);
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }, [uploadMenuOpen]);

    // Keyboard shortcuts
    useEffect(() => {
      if (!isFilesModalOpen) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        // Don't handle if Quick Look is open (it has its own handlers)
        if (quickLookOpen) return;
        
        // Don't handle if typing in an input
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

        // ESC to clear selection or close
        if (e.key === 'Escape') {
          if (uploadMenuOpen) {
            setUploadMenuOpen(false);
          } else if (actionSheetOpen) {
            setActionSheetOpen(false);
            setActionSheetFile(null);
          } else if (contextMenu) {
            setContextMenu(null);
          } else if (selectedItems.size > 0) {
            setSelectedItems(new Set());
          } else {
            closeFilesModal();
          }
          return;
        }

        // Spacebar to open Quick Look for selected/focused file
        if (e.key === ' ' || e.key === 'Space') {
          e.preventDefault();
          
          // If files are selected, preview the first selected
          if (selectedItems.size > 0) {
            const firstSelectedUrl = Array.from(selectedItems)[0];
            const index = displayedFiles.findIndex(f => f.url === firstSelectedUrl);
            if (index >= 0) {
              openQuickLook(index);
            }
          } else if (focusedIndex >= 0) {
            // Preview focused file
            openQuickLook(focusedIndex);
          }
          return;
        }

        // Enter to confirm selection or open file
        if (e.key === 'Enter') {
          if (selectionMode === 'multi' && selectedItems.size > 0) {
            onConfirmSelection();
          } else if (focusedIndex >= 0 && displayedFiles[focusedIndex]) {
            openQuickLook(focusedIndex);
          }
          return;
        }

        // Arrow keys for navigation
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusedIndex(prev => Math.min(prev + 1, displayedFiles.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusedIndex(prev => Math.max(prev - 1, 0));
          return;
        }

        // Ctrl/Cmd + A to select all
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
          e.preventDefault();
          handleSelectAll();
          return;
        }

        // Ctrl/Cmd + D or Ctrl/Cmd + Shift + A to deselect all
        if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || (e.shiftKey && e.key === 'A'))) {
          e.preventDefault();
          setSelectedItems(new Set());
          return;
        }

        // / to focus search (power-user shortcut)
        if (e.key === '/') {
          e.preventDefault();
          searchInputRef.current?.focus();
          return;
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [
      selectedItems.size,
      selectedItems,
      onConfirmSelection,
      closeFilesModal,
      selectionMode,
      contextMenu,
      actionSheetOpen,
      quickLookOpen,
      handleSelectAll,
      isFilesModalOpen,
      setSelectedItems,
      displayedFiles,
      focusedIndex,
      openQuickLook,
    ]);

    const { removeReferences } = useFileMessenger({
      activeProject: activeProject || {},
      localActiveProject,
      setLocalActiveProject,
      setProjectMessages,
      user,
      ws,
    });

    const folderDisplayList = useMemo(() => {
      const seen = new Set<string>();
      return [...SYSTEM_FOLDERS, ...customFolders].filter((folder) => {
        if (seen.has(folder.key)) return false;
        seen.add(folder.key);
        return true;
      });
    }, [customFolders]);

    // Convert displayedFiles to GridTileItem format for virtualized grid
    // Memoized with stable reference - only recreates when displayedFiles changes
    // Now includes thumbnail URLs for images (generated by image-thumbnails Lambda)
    // At root level, folders are shown first, then files
    const gridItems = useMemo<OptimizedGridTileItem[]>(() => {
      // Folder items at root level
      const folderItems: OptimizedGridTileItem[] =
        folderKey === 'uploads'
          ? folderDisplayList.map((folder) => ({
              id: folder.key,
              fileName: folder.name,
              url: `folder://${folder.key}`,
              isFolder: true,
              mimeType: 'folder',
            }))
          : [];

      // File items
      const fileItems = displayedFiles.map((file) => {
        // Generate thumbnail URL for images that have server-generated thumbnails
        const thumbUrl = hasGeneratedThumbnail(file.fileName) 
          ? getThumbnailUrl(file.url, folderKey)
          : undefined;
        
        return {
          id: file.url,
          fileName: file.fileName,
          url: file.url,
          thumbnailUrl: thumbUrl,
          mimeType: file.kind,
          isFolder: false,
        };
      });
      
      return [...folderItems, ...fileItems];
    }, [displayedFiles, folderKey, folderDisplayList]);

    // Folder items for list view - shown at root (All Files) level
    const folderListItems: ListRowItem[] = useMemo(
      () =>
        folderKey === 'uploads'
          ? folderDisplayList.map((folder) => ({
              id: folder.key,
              fileName: folder.name,
              url: `folder://${folder.key}`,
              isFolder: true,
              kind: 'Folder',
            }))
          : [],
      [folderKey, folderDisplayList]
    );

    const activeFolderName = useMemo(() => {
      if (folderKey === ROOT_FOLDER.key) return ROOT_FOLDER.name;
      return folderDisplayList.find((f) => f.key === folderKey)?.name || folderKey;
    }, [folderDisplayList, folderKey]);

    const canCreateFolder = canUpload;

    // Create folder programmatically (used for folder drops at root)
    // Defined before useFileTransfers so it can be passed as a callback
    const createFolderSilently = useCallback(async (folderName: string) => {
      const projectId = (activeProject?.projectId as string | undefined) ?? undefined;
      if (!projectId) {
        console.warn('[FileManager] Cannot create folder without projectId');
        return;
      }

      const existingKeys = new Set<string>([
        ROOT_FOLDER.key,
        ...folderDisplayList.map((f) => f.key),
      ]);
      const folderKeyValue = sanitizeFolderKey(folderName, existingKeys);
      const newFolder: FolderOption = { key: folderKeyValue, name: folderName };
      const updatedCustomFolders = Array.from(
        new Map<string, FolderOption>(
          [...customFolders, newFolder].map((f) => [f.key, f])
        ).values()
      );

      addCustomFolder(newFolder);

      try {
        await apiFetch(`${EDIT_PROJECT_URL}/${projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customFolders: updatedCustomFolders,
            [newFolder.key]: [],
          }),
        });
        notify('success', `Folder "${newFolder.name}" created.`);
      } catch (error) {
        console.error('Error creating folder', error);
        // Don't show error notification here as files are still uploading
      }
    }, [activeProject?.projectId, addCustomFolder, customFolders, folderDisplayList]);

    const {
      loadFiles,
      handleFileSelect,
      handleDragEnter,
      handleDragOver,
      handleDragLeave,
      handleDrop,
      handleBulkDownload,
      handleDelete,
      performDelete,
      handleDeleteSingle,
      handleDownloadSingle,
      handleFolderDownload,
      handleFolderDelete,
      invalidateCache,
    } = useFileTransfers({
      activeProject: activeProject || {},
      folderKey,
      selectedItems,
      setSelectedFiles,
      setSelectedItems,
      setIsSelectMode,
      setIsLoading,
      setIsConfirmingDelete,
      setIsDragging,
      setLocalActiveProject,
      removeReferences,
      projectMessages: projectMessages as Record<string, Message[]>,
      canDelete,
      orgId,
      onFolderDropAtRoot: createFolderSilently,
    });
    
    // Transfer status store for progress tracking
    const { hasActiveTransfers } = useFileTransferStore();

    // Wrap bulk download to track zipping state
    const handleBulkDownloadWithState = useCallback(async () => {
      setIsZipping(true);
      try {
        await handleBulkDownload();
      } finally {
        setIsZipping(false);
      }
    }, [handleBulkDownload]);

    // Create folder (interactive with prompt)
    const handleCreateFolder = useCallback(async () => {
      if (typeof window === 'undefined') return;
      const projectId = (activeProject?.projectId as string | undefined) ?? undefined;
      if (!projectId) {
        notify('error', 'You need an active project to create folders.');
        return;
      }

      const inputName = window.prompt('New folder name', '');
      const trimmed = inputName?.trim();
      if (!trimmed) return;

      const existingKeys = new Set<string>([
        ROOT_FOLDER.key,
        ...folderDisplayList.map((f) => f.key),
      ]);
      const folderKeyValue = sanitizeFolderKey(trimmed, existingKeys);
      const newFolder: FolderOption = { key: folderKeyValue, name: trimmed };
      const updatedCustomFolders = Array.from(
        new Map<string, FolderOption>(
          [...customFolders, newFolder].map((f) => [f.key, f])
        ).values()
      );

      addCustomFolder(newFolder);
      setFolderKey(newFolder.key);
      setSelectedFiles([]);
      setSelectedItems(new Set());
      setIsSelectMode(false);

      try {
        await apiFetch(`${EDIT_PROJECT_URL}/${projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customFolders: updatedCustomFolders,
            [newFolder.key]: [],
          }),
        });
        notify('success', `Folder "${newFolder.name}" created.`);
      } catch (error) {
        console.error('Error creating folder', error);
        notify('error', 'Unable to create folder. Please try again.');
      }
    }, [
      activeProject?.projectId,
      addCustomFolder,
      customFolders,
      folderDisplayList,
      setFolderKey,
      setSelectedFiles,
      setSelectedItems,
      setIsSelectMode,
    ]);

    // Handle bulk move (open modal)
    const handleBulkMove = useCallback(() => {
      const filesToMove = displayedFiles.filter((f) => selectedItems.has(f.url));
      if (filesToMove.length === 0) return;
      setMoveTargetFiles(filesToMove);
      setIsMoveModalOpen(true);
    }, [displayedFiles, selectedItems]);

    // Execute move operation
    const handleMoveConfirm = useCallback(
      async (targetFolderKey: string, targetFolderName: string) => {
        if (!activeProject?.projectId || moveTargetFiles.length === 0) return;

        const projectId = activeProject.projectId as string;
        const movedCount = moveTargetFiles.length;

        try {
          // Call the move API
          const response = await apiFetch(`${EDIT_PROJECT_URL}/${projectId}/files/move`, {
            method: 'POST',
            body: JSON.stringify({
              fileKeys: moveTargetFiles.map((f) => f.key),
              targetFolder: targetFolderKey,
            }),
          }) as { ok?: boolean; moved?: { oldKey: string; newKey: string }[]; errors?: { key: string; error: string }[]; error?: string };

          if (response.ok) {
            notify('success', `Moved ${movedCount} item${movedCount > 1 ? 's' : ''} to ${targetFolderName}`);
          } else {
            const errCount = response.errors?.length || 0;
            if (errCount > 0 && response.moved?.length > 0) {
              notify('warning', `Moved ${response.moved.length} items, ${errCount} failed`);
            } else {
              throw new Error(response.error || 'Move failed');
            }
          }

          setIsMoveModalOpen(false);
          setMoveTargetFiles([]);
          setSelectedItems(new Set());
          
          // Invalidate cache for BOTH source and target folders so UI updates immediately
          invalidateCache(projectId, folderKey);         // source folder
          invalidateCache(projectId, targetFolderKey);   // target folder
          
          // Reload files to reflect changes
          loadFiles(true);  // force refresh
        } catch (error) {
          console.error('Failed to move files:', error);
          notify('error', 'Failed to move files. Please try again.');
        }
      },
      [activeProject?.projectId, moveTargetFiles, loadFiles, setSelectedItems, invalidateCache, folderKey]
    );

    // Handle rename
    const handleRename = useCallback(
      async (file: FileItem, newName: string) => {
        if (!activeProject?.projectId) return;

        try {
          // Call the rename API
          const response = await apiFetch(`${EDIT_PROJECT_URL}/${activeProject.projectId}/files/rename`, {
            method: 'POST',
            body: JSON.stringify({
              oldKey: file.key,
              newName: newName,
            }),
          }) as { ok?: boolean; error?: string };

          if (!response.ok) {
            throw new Error(response.error || 'Rename failed');
          }

          notify('success', `Renamed to "${newName}"`);
          setRenameTargetId(null);
          
          // Reload files to reflect changes
          loadFiles();
        } catch (error) {
          console.error('Failed to rename file:', error);
          notify('error', 'Failed to rename file. Please try again.');
        }
      },
      [activeProject?.projectId, loadFiles]
    );

    // Open modal
    const openFilesModal = useCallback(async () => {
      setFilesModalOpen(true);
      await loadFiles();
    }, [loadFiles, setFilesModalOpen]);

    useImperativeHandle(ref, () => ({
      open: openFilesModal,
      close: closeFilesModal,
    }));

    // Build folder tree items
    const folderTreeRoot: FolderTreeItem = useMemo(
      () => ({
        key: ROOT_FOLDER.key,
        name: ROOT_FOLDER.name,
      }),
      []
    );

    const folderTreeSystem: FolderTreeItem[] = useMemo(
      () => SYSTEM_FOLDERS.map((f) => ({ key: f.key, name: f.name })),
      []
    );

    const folderTreeCustom: FolderTreeItem[] = useMemo(
      () => customFolders.map((f) => ({ key: f.key, name: f.name })),
      [customFolders]
    );

    // Folders for picker modal
    const folderPickerFolders: FolderPickerFolder[] = useMemo(() => {
      return [
        { key: ROOT_FOLDER.key, name: ROOT_FOLDER.name },
        ...SYSTEM_FOLDERS.map((f) => ({ key: f.key, name: f.name })),
        ...customFolders.map((f) => ({ key: f.key, name: f.name })),
      ];
    }, [customFolders]);

    // Breadcrumb segments
    const breadcrumbSegments: BreadcrumbSegment[] = useMemo(() => {
      if (folderKey === ROOT_FOLDER.key) return [];
      const folder = folderDisplayList.find((f) => f.key === folderKey);
      return folder ? [{ key: folder.key, name: folder.name }] : [];
    }, [folderKey, folderDisplayList]);

    // Context menu handlers
    const handleContextMenu = useCallback(
      (e: React.MouseEvent, file?: FileItem) => {
        e.preventDefault();
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          file: file || null,
          type: file ? (file.kind === 'folder' ? 'folder' : 'file') : 'empty',
        });
      },
      []
    );

    // Open action sheet for touch devices
    const handleActionSheet = useCallback((file: FileItem) => {
      setActionSheetFile(file);
      setActionSheetOpen(true);
    }, []);

    // Handle action from context menu or action sheet
    const handleContextMenuAction = useCallback(
      (action: ContextMenuAction) => {
        const file = contextMenu?.file || actionSheetFile;
        setContextMenu(null);
        setActionSheetOpen(false);
        setActionSheetFile(null);

        switch (action) {
          case 'open':
            if (file) {
              const index = displayedFiles.findIndex((f) => f.url === file.url);
              handleFileClick(file, index);
            }
            break;
          case 'preview':
            if (file) {
              const index = displayedFiles.findIndex((f) => f.url === file.url);
              if (index >= 0) {
                openQuickLook(index);
              }
            }
            break;
          case 'download':
            if (file) handleDownloadSingle(file);
            break;
          case 'copy-link':
            if (file?.url) {
              navigator.clipboard.writeText(file.url);
              notify('success', 'Link copied to clipboard');
            }
            break;
          case 'rename':
            if (file) {
              // Set the rename target - FileListView will pick this up
              setRenameTargetId(file.key as string);
            }
            break;
          case 'move':
            if (file) {
              setMoveTargetFiles([file]);
              setIsMoveModalOpen(true);
            }
            break;
          case 'delete':
            if (file) handleDeleteSingle(file.url);
            break;
          case 'details':
            if (file) {
              setInspectorFile({
                fileName: file.fileName,
                url: file.url,
                sizeBytes: file.size,
                updatedAt: file.lastModified
                  ? new Date(file.lastModified).toISOString()
                  : undefined,
                mimeType: file.kind,
              });
              setInspectorOpen(true);
            }
            break;
          case 'new-folder':
            handleCreateFolder();
            break;
          case 'upload':
            fileInputRef.current?.click();
            break;
          case 'download-folder':
            if (file) {
              // For folder downloads, file.fileName is the folder name
              const folderPrefix = `${file.fileName}/`;
              handleFolderDownload(folderPrefix, file.fileName);
            }
            break;
          case 'delete-folder':
            if (file) {
              const folderPrefix = `${file.fileName}/`;
              handleFolderDelete(folderPrefix, file.fileName);
            }
            break;
          case 'pin':
            if (file) {
              togglePin({ url: file.url, fileName: file.fileName, folderKey });
              notify('success', `Pinned "${file.fileName}"`);
            }
            break;
          case 'unpin':
            if (file) {
              togglePin({ url: file.url, fileName: file.fileName, folderKey });
              notify('success', `Unpinned "${file.fileName}"`);
            }
            break;
        }
      },
      [
        contextMenu,
        actionSheetFile,
        displayedFiles,
        handleFileClick,
        handleDownloadSingle,
        handleDeleteSingle,
        handleCreateFolder,
        handleFolderDownload,
        handleFolderDelete,
        fileInputRef,
        openQuickLook,
        togglePin,
        folderKey,
      ]
    );

    // Handle double-click/double-tap to open Quick Look
    const handleFileDoubleClick = useCallback(
      (file: FileItem, index: number) => {
        openQuickLook(index);
      },
      [openQuickLook]
    );

    // Quick Look handlers
    const handleQuickLookNavigate = useCallback((index: number) => {
      setQuickLookIndex(index);
    }, []);

    const handleQuickLookDownload = useCallback((file: FileItem) => {
      handleDownloadSingle(file);
    }, [handleDownloadSingle]);

    const handleQuickLookCopyLink = useCallback((file: FileItem) => {
      if (file.url) {
        navigator.clipboard.writeText(file.url);
        notify('success', 'Link copied to clipboard');
      }
    }, []);

    const handleQuickLookDelete = useCallback((file: FileItem) => {
      handleDeleteSingle(file.url);
    }, [handleDeleteSingle]);

    // Handle file click for inspector
    const handleFileClickWithInspector = useCallback(
      (file: FileItem, index: number, event?: React.MouseEvent) => {
        // If shift or ctrl/cmd key, handle selection
        if (event?.shiftKey || event?.ctrlKey || event?.metaKey) {
          handleSelectionChange(file.url, index, event);
          return;
        }

        // Update focused index for keyboard nav
        setFocusedIndex(index);

        // Otherwise, show in inspector and preview
        setInspectorFile({
          fileName: file.fileName,
          url: file.url,
          sizeBytes: file.size,
          updatedAt: file.lastModified
            ? new Date(file.lastModified).toISOString()
            : undefined,
          mimeType: file.kind,
        });
        setInspectorOpen(true);

        // Also trigger original file click for preview modal
        handleFileClick(file, index, event);
      },
      [handleFileClick, handleSelectionChange]
    );

    // Convert FileItem[] to FileListItem[] with progressive loading
    const LIST_BATCH_SIZE = 100;
    const [listItemCount, setListItemCount] = useState(LIST_BATCH_SIZE);
    
    // Reset list count when files change
    useEffect(() => {
      setListItemCount(LIST_BATCH_SIZE);
    }, [displayedFiles.length]);
    
    const visibleListFiles = useMemo(() => displayedFiles.slice(0, listItemCount), [displayedFiles, listItemCount]);
    const hasMoreListItems = displayedFiles.length > listItemCount;
    const remainingListCount = displayedFiles.length - listItemCount;
    
    const handleLoadMoreList = useCallback(() => {
      setListItemCount(prev => Math.min(prev + LIST_BATCH_SIZE, displayedFiles.length));
    }, [displayedFiles.length]);
    
    // For non-virtualized (legacy) list view
    const listItems: FileListItem[] = useMemo(
      () =>
        visibleListFiles.map((file) => ({
          id: file.url,
          fileName: file.fileName,
          url: file.url,
          mimeType: file.kind,
          sizeBytes: file.size,
          updatedAt: file.lastModified
            ? new Date(file.lastModified).toISOString()
            : undefined,
          kind: file.kind,
        })),
      [visibleListFiles]
    );
    
    // For virtualized list view - use ALL files (virtualization handles rendering)
    const virtualizedListItems: ListRowItem[] = useMemo(
      () =>
        displayedFiles.map((file) => ({
          id: file.url,
          fileName: file.fileName,
          url: file.url,
          key: file.key,  // S3 key for rename/move/delete operations
          thumbnailUrl: getThumbnailUrl(file.url) || undefined,
          mimeType: file.kind,
          sizeBytes: file.size,
          updatedAt: file.lastModified
            ? new Date(file.lastModified).toISOString()
            : undefined,
          kind: file.kind,
        })),
      [displayedFiles]
    );

    // Handle sort change from list view
    const handleSortChange = useCallback(
      (field: SortField) => {
        let newSort: string;
        const currentField = sortField;
        const currentDir = sortDirection;

        if (field === currentField) {
          // Toggle direction
          newSort = `${field === 'type' ? 'kind' : field === 'updated' ? 'date' : field}-${currentDir === 'asc' ? 'desc' : 'asc'}`;
        } else {
          // New field, default asc
          newSort = `${field === 'type' ? 'kind' : field === 'updated' ? 'date' : field}-asc`;
        }
        setSortOption(newSort as typeof sortOption);
      },
      [sortField, sortDirection, setSortOption]
    );

    // Virtualized grid callbacks - wrap to convert OptimizedGridTileItem to FileItem
    const handleVirtualGridItemClick = useCallback(
      (item: OptimizedGridTileItem, index: number, event?: React.MouseEvent) => {
        const file = displayedFiles[index];
        if (file) {
          handleFileClickWithInspector(file, index, event);
        }
      },
      [displayedFiles, handleFileClickWithInspector]
    );

    const handleVirtualGridDoubleClick = useCallback(
      (_item: OptimizedGridTileItem, index: number) => {
        openQuickLook(index);
      },
      [openQuickLook]
    );

    const handleVirtualGridContextMenu = useCallback(
      (e: React.MouseEvent, item: OptimizedGridTileItem) => {
        const file = displayedFiles.find((f) => f.url === item.url);
        handleContextMenu(e, file);
      },
      [displayedFiles, handleContextMenu]
    );

    const handleVirtualGridActionSheet = useCallback(
      (item: OptimizedGridTileItem) => {
        const file = displayedFiles.find((f) => f.url === item.url);
        if (file) handleActionSheet(file);
      },
      [displayedFiles, handleActionSheet]
    );

    // Track last click for double-click in grid view
    const lastGridClickRef = useRef<{ url: string; time: number } | null>(null);

    // Grid view (fallback for when virtualization isn't ready - progressive loading)
    const FALLBACK_BATCH_SIZE = 50;
    const [fallbackItemCount, setFallbackItemCount] = useState(FALLBACK_BATCH_SIZE);
    
    // Reset fallback count when files change
    useEffect(() => {
      setFallbackItemCount(FALLBACK_BATCH_SIZE);
    }, [displayedFiles.length]);
    
    const renderGridView = () => {
      // Build unified items list: folders first (at root), then files
      const allGridItems: Array<{ type: 'folder'; key: string; name: string } | { type: 'file'; file: FileItem; index: number }> = [];
      
      // Add folders at root level
      if (folderKey === 'uploads') {
        folderDisplayList.forEach((folder) => {
          allGridItems.push({ type: 'folder', key: folder.key, name: folder.name });
        });
      }
      
      // Add files
      displayedFiles.forEach((file, index) => {
        allGridItems.push({ type: 'file', file, index });
      });

      const itemsToRender = allGridItems.slice(0, fallbackItemCount);
      const hasMore = allGridItems.length > fallbackItemCount;
      const remainingCount = allGridItems.length - fallbackItemCount;
      
      const handleLoadMore = () => {
        setFallbackItemCount(prev => Math.min(prev + FALLBACK_BATCH_SIZE, allGridItems.length));
      };
      
      return (
      <div className={styles.gridContainer}>
        {itemsToRender.map((item) => {
          if (item.type === 'folder') {
            // Render folder tile
            return (
              <div
                key={`folder-${item.key}`}
                className={styles.gridItem}
                onClick={() => setFolderKey(item.key)}
                tabIndex={0}
                role="button"
                aria-label={`Open folder ${item.name}`}
              >
                <div className={styles.gridItemThumb}>
                  <div className={styles.gridFolderIcon}>
                    <Folder size={32} />
                  </div>
                </div>
                <div className={styles.gridItemName}>{item.name}</div>
              </div>
            );
          }
          
          // Render file tile
          const { file, index } = item;
          const isItemSelected = isSelected(file.url);
          return (
            <div
              key={file.url}
              className={`${styles.gridItem} ${isItemSelected ? styles.gridItemSelected : ''}`}
              onClick={(e) => {
                // Prevent browser text selection on shift+click
                if (e.shiftKey) {
                  e.preventDefault();
                }
                
                const now = Date.now();
                const isDoubleClick = lastGridClickRef.current?.url === file.url && now - lastGridClickRef.current.time < 300;
                
                if (isDoubleClick) {
                  // Double-click: open Quick Look
                  openQuickLook(index);
                  lastGridClickRef.current = null;
                  return;
                }
                
                lastGridClickRef.current = { url: file.url, time: now };
                
                if (e.shiftKey || e.ctrlKey || e.metaKey || selectionMode === 'multi') {
                  handleSelectionChange(file.url, index, e);
                } else {
                  handleFileClickWithInspector(file, index, e);
                }
              }}
              onContextMenu={(e) => handleContextMenu(e, file)}
              tabIndex={0}
              role="button"
              aria-selected={isItemSelected}
            >
              <div
                className={styles.gridItemCheckbox}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectionChange(file.url, index);
                }}
              >
                {isItemSelected && <Check size={12} />}
              </div>
              {/* Actions button */}
              <button
                type="button"
                className={styles.gridItemActions}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isTouchDevice) {
                    handleActionSheet(file);
                  } else {
                    handleContextMenu(e, file);
                  }
                }}
                aria-label="More actions"
              >
                <MoreHorizontal size={14} />
              </button>
              <div className={styles.gridItemThumb}>
                <FileThumb
                  url={file.url}
                  thumbnailUrl={hasGeneratedThumbnail(file.fileName) ? getThumbnailUrl(file.url, folderKey) : undefined}
                  fileName={file.fileName}
                  mimeType={file.kind}
                  size="md"
                />
              </div>
              <div className={styles.gridItemName}>{file.fileName}</div>
            </div>
          );
        })}
        {hasMore && (
          <button
            type="button"
            className={styles.loadMoreTile}
            onClick={handleLoadMore}
            aria-label={`Load ${Math.min(FALLBACK_BATCH_SIZE, remainingCount)} more files`}
          >
            <div className={styles.loadMoreContent}>
              <span className={styles.loadMoreCount}>+{remainingCount}</span>
              <span className={styles.loadMoreLabel}>Load More</span>
            </div>
          </button>
        )}
      </div>
    );
    };
    
    // Skeleton grid for loading state
    const renderGridSkeleton = () => (
      <div className={styles.gridContainer}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className={styles.skeletonGridItem}>
            <div className={styles.skeletonGridThumb} />
            <div className={styles.skeletonGridName} />
          </div>
        ))}
      </div>
    );

    return (
      <>
        {/* Trigger button (if showTrigger) */}
        {showTrigger && (
          <div
            className={`dashboard-item files files-shared-style ${legacyStyles.fileManager}`}
            onClick={() => void openFilesModal()}
            style={style}
          >
            <div className={legacyStyles.fileManagerInner}>
              <Upload size={20} />
              <span>{renderedName}</span>
            </div>
            <span className={legacyStyles.arrow}>&gt;</span>
          </div>
        )}

        {/* Main Modal */}
        <Modal
          isOpen={isFilesModalOpen}
          onRequestClose={closeFilesModal}
          contentLabel="File Manager"
          shouldCloseOnOverlayClick={!isConfirmingDelete && !contextMenu}
          style={{
            overlay: {
              pointerEvents: isConfirmingDelete ? 'none' : 'auto',
            },
          }}
          className={{
            base: legacyStyles.fileModalContent,
            afterOpen: legacyStyles.fileModalContentAfterOpen,
            beforeClose: legacyStyles.fileModalContentBeforeClose,
          }}
          overlayClassName={{
            base: legacyStyles.fileModalOverlay,
            afterOpen: legacyStyles.fileModalOverlayAfterOpen,
            beforeClose: legacyStyles.fileModalOverlayBeforeClose,
          }}
          closeTimeoutMS={300}
        >
          <div className={styles.fileManagerV2}>
            {/* TOOLBAR - Modern 3-zone layout */}
            <div className={styles.toolbar}>
              {/* LEFT ZONE: Project context + Breadcrumb */}
              <div className={styles.toolbarLeft}>
                {/* Sidebar toggle */}
                <button
                  type="button"
                  className={styles.toolbarBtn}
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  {sidebarCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
                </button>

                {/* Context Chip - Org or Project */}
                {isOrgMode ? (
                  <div className={styles.projectChip}>
                    {activeOrgBranding?.logoUrl ? (
                      <img 
                        src={activeOrgBranding.logoUrl} 
                        alt="" 
                        className={styles.projectChipAvatar}
                      />
                    ) : (
                      <div className={styles.projectChipAvatarPlaceholder}>
                        {(activeOrg?.name || 'O').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className={styles.projectChipName}>
                      {activeOrg?.name || 'Organization'}
                    </span>
                    <span className={styles.projectChipSeparator}>›</span>
                    <span className={styles.projectChipSection}>Files</span>
                  </div>
                ) : activeProject ? (
                  <div className={styles.projectChip}>
                    {(activeProject.thumbnails as string[])?.[0] ? (
                      <img 
                        src={getFileUrl((activeProject.thumbnails as string[])[0])} 
                        alt="" 
                        className={styles.projectChipAvatar}
                      />
                    ) : (
                      <div className={styles.projectChipAvatarPlaceholder}>
                        {((activeProject.title as string) || 'P').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className={styles.projectChipName}>
                      {(activeProject.title as string) || 'Project'}
                    </span>
                    <span className={styles.projectChipSeparator}>›</span>
                    <span className={styles.projectChipSection}>Files</span>
                  </div>
                ) : null}

                {/* Breadcrumb (only show subfolders) */}
                {breadcrumbSegments.length > 1 && (
                  <Breadcrumb
                    segments={breadcrumbSegments.slice(1)}
                    onNavigate={setFolderKey}
                    rootLabel=""
                  />
                )}
              </div>

              {/* CENTER ZONE: Search + Type Filter */}
              <div className={styles.toolbarCenter}>
                <div className={styles.searchWrapper}>
                  <Search size={14} className={styles.searchIcon} />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search files..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={styles.searchInput}
                  />
                </div>
                {/* Type filter - inline chip style */}
                <Dropdown
                  label="All types"
                  options={filterOptionsList}
                  value={filterOption}
                  onChange={setFilterOption}
                />
              </div>

              {/* RIGHT ZONE: View toggle → Details → New Folder → Upload → Close */}
              <div className={styles.toolbarRight}>
                {/* View toggle */}
                <button
                  type="button"
                  className={`${styles.toolbarBtn} ${viewMode === 'list' ? styles.active : ''}`}
                  onClick={toggleViewMode}
                  aria-label={viewMode === 'list' ? 'Switch to grid view' : 'Switch to list view'}
                  title={viewMode === 'list' ? 'Grid view' : 'List view'}
                >
                  {viewMode === 'list' ? <Grid size={18} /> : <List size={18} />}
                </button>

                {/* Details panel toggle - single button with state */}
                <button
                  type="button"
                  className={`${styles.toolbarBtn} ${inspectorOpen ? styles.active : ''}`}
                  onClick={() => setInspectorOpen(!inspectorOpen)}
                  aria-label={inspectorOpen ? 'Hide details' : 'Show details'}
                  title={inspectorOpen ? 'Hide details' : 'Show details'}
                >
                  {inspectorOpen ? <PanelRightClose size={18} /> : <PanelRight size={18} />}
                </button>

                {/* Divider before actions */}
                <span className={styles.toolbarDivider} aria-hidden="true" />

                {/* New Folder button */}
                {canCreateFolder && (
                  <button
                    type="button"
                    className={styles.toolbarBtn}
                    onClick={handleCreateFolder}
                    aria-label="New folder"
                    title="New Folder"
                  >
                    <FolderPlus size={18} />
                  </button>
                )}

                {/* Upload button with dropdown for files/folder */}
                {canUpload && (
                  <div className={styles.uploadDropdown}>
                    {/* Hidden file inputs */}
                    <input
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      ref={fileInputRef}
                      className={legacyStyles.hiddenInput}
                    />
                    {/* Hidden folder input for folder upload */}
                    <input
                      type="file"
                      webkitdirectory=""
                      directory=""
                      multiple
                      onChange={handleFileSelect}
                      ref={folderInputRef}
                      className={legacyStyles.hiddenInput}
                    />
                    
                    {/* Main upload button */}
                    <button
                      type="button"
                      className={styles.toolbarBtnUpload}
                      onClick={() => fileInputRef.current?.click()}
                      title="Upload files"
                    >
                      <Upload size={16} />
                      <span>Upload</span>
                    </button>
                    
                    {/* Dropdown toggle for folder upload */}
                    <button
                      type="button"
                      className={styles.uploadDropdownToggle}
                      onClick={() => setUploadMenuOpen(!uploadMenuOpen)}
                      aria-label="More upload options"
                      aria-expanded={uploadMenuOpen}
                    >
                      <ChevronDown size={14} />
                    </button>
                    
                    {/* Dropdown menu */}
                    {uploadMenuOpen && (
                      <div className={styles.uploadDropdownMenu}>
                        <button
                          type="button"
                          className={styles.uploadDropdownItem}
                          onClick={() => {
                            fileInputRef.current?.click();
                            setUploadMenuOpen(false);
                          }}
                        >
                          <Upload size={14} />
                          <span>Upload Files</span>
                        </button>
                        <button
                          type="button"
                          className={styles.uploadDropdownItem}
                          onClick={() => {
                            folderInputRef.current?.click();
                            setUploadMenuOpen(false);
                          }}
                        >
                          <Folder size={14} />
                          <span>Upload Folder</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Close divider */}
                <span className={styles.toolbarDivider} aria-hidden="true" />

                {/* Close button */}
                <button
                  type="button"
                  className={styles.toolbarBtnClose}
                  onClick={closeFilesModal}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* BODY */}
            <div className={styles.fileManagerBody}>
              {/* LEFT SIDEBAR */}
              {!sidebarCollapsed && (
                <FolderTree
                  currentFolder={folderKey}
                  onFolderSelect={(key) => {
                    // Handle pinned/recent file selection - open Quick Look
                    if (key.startsWith('pinned:') || key.startsWith('recent:')) {
                      const fileUrl = key.replace(/^(pinned|recent):/, '');
                      const fileIndex = displayedFiles.findIndex(f => f.url === fileUrl);
                      if (fileIndex >= 0) {
                        openQuickLook(fileIndex);
                      } else {
                        // File not in current view - try to find it globally
                        const pinnedFile = pinnedFiles.find(f => f.url === fileUrl);
                        const recentFile = recentFiles.find(f => f.url === fileUrl);
                        const file = pinnedFile || recentFile;
                        if (file?.folderKey) {
                          // Navigate to the folder containing this file
                          setFolderKey(file.folderKey);
                        }
                      }
                      return;
                    }
                    // Regular folder selection
                    setFolderKey(key);
                  }}
                  rootFolder={folderTreeRoot}
                  systemFolders={folderTreeSystem}
                  customFolders={folderTreeCustom}
                  pinnedFolders={pinnedFiles.map(f => ({
                    key: `pinned:${f.url}`,
                    name: f.fileName,
                  }))}
                  recentFolders={recentFiles.map(f => ({
                    key: `recent:${f.url}`,
                    name: f.fileName,
                  }))}
                  isCollapsed={sidebarCollapsed}
                />
              )}

              {/* MAIN PANE */}
              <div className={styles.mainPane}>
                <div
                  ref={(el) => {
                    // Combine refs - scrollerRef from state and contentAreaRef for sizing
                    if (scrollerRef) {
                      (scrollerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                    }
                    (contentAreaRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                  }}
                  className={`${styles.contentArea} ${isDragging ? styles.contentAreaDragging : ''}`}
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onContextMenu={(e) => {
                    // Only trigger if clicking on empty area
                    if (e.target === e.currentTarget) {
                      handleContextMenu(e);
                    }
                  }}
                >
                  {isDragging && (
                    <div className={styles.dropOverlay}>Drop files to upload</div>
                  )}

                  {isLoading ? (
                    <div className={styles.loadingState}>
                      {viewMode === 'grid' ? (
                        renderGridSkeleton()
                      ) : (
                        Array.from({ length: 8 }).map((_, i) => (
                          <div key={i} className={styles.skeletonRow}>
                            <div className={styles.skeletonThumb} />
                            <div className={`${styles.skeletonText} ${styles.skeletonTextWide}`} />
                            <div className={`${styles.skeletonText} ${styles.skeletonTextMedium}`} />
                            <div className={`${styles.skeletonText} ${styles.skeletonTextNarrow}`} />
                          </div>
                        ))
                      )}
                    </div>
                  ) : displayedFiles.length === 0 && folderListItems.length === 0 ? (
                    <div className={styles.emptyState}>
                      <Upload size={48} className={styles.emptyStateIcon} />
                      <h3 className={styles.emptyStateTitle}>No files yet</h3>
                      <p className={styles.emptyStateText}>
                        Drag and drop files here, or click Upload to add files.
                      </p>
                      <div className={styles.emptyStateActions}>
                        {canUpload && (
                          <button
                            type="button"
                            className={styles.toolbarBtnPrimary}
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <Upload size={16} />
                            <span>Upload Files</span>
                          </button>
                        )}
                        {canCreateFolder && (
                          <button
                            type="button"
                            className={styles.toolbarBtn}
                            onClick={handleCreateFolder}
                          >
                            <Plus size={16} />
                            <span>New Folder</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ) : viewMode === 'list' ? (
                    <VirtualizedListView
                      files={virtualizedListItems}
                      folders={folderListItems}
                      selectionStore={selectionStore}
                      onSelectionChange={handleSelectionChange}
                      onFileClick={(file, index, e) => {
                        // Adjust index for folders shown first
                        const adjustedIndex = index - folderListItems.length;
                        const originalFile = displayedFiles[adjustedIndex];
                        if (originalFile) {
                          handleFileClickWithInspector(originalFile, adjustedIndex, e);
                        }
                      }}
                      onFileDoubleClick={(file, index) => {
                        // Adjust index for folders shown first
                        const adjustedIndex = index - folderListItems.length;
                        const originalFile = displayedFiles[adjustedIndex];
                        if (originalFile) {
                          handleFileDoubleClick(originalFile, adjustedIndex);
                        }
                      }}
                      onFolderClick={(folderKey) => setFolderKey(folderKey)}
                      onDownload={(file) => {
                        const originalFile = displayedFiles.find((f) => f.url === file.url);
                        if (originalFile) handleDownloadSingle(originalFile);
                      }}
                      onContextMenu={(e, file) => {
                        const originalFile = displayedFiles.find((f) => f.url === file.url);
                        handleContextMenu(e, originalFile);
                      }}
                      onActionSheet={(file) => {
                        const originalFile = displayedFiles.find((f) => f.url === file.url);
                        if (originalFile) handleActionSheet(originalFile);
                      }}
                      onRename={(file, newName) => {
                        const originalFile = displayedFiles.find((f) => f.url === file.url);
                        if (originalFile) handleRename(originalFile, newName);
                      }}
                      canRename={!isOrgMode && !!activeProject?.projectId}
                      renameTargetId={renameTargetId}
                      onRenameComplete={() => setRenameTargetId(null)}
                      sortField={sortField}
                      sortDirection={sortDirection}
                      onSortChange={handleSortChange}
                      canDelete={canDelete}
                    />
                  ) : containerSize.width > 0 && containerSize.height > 0 ? (
                    <OptimizedFileGrid
                      items={gridItems}
                      selectionStore={selectionStore}
                      onSelectionChange={handleSelectionChange}
                      onItemClick={handleVirtualGridItemClick}
                      onItemDoubleClick={handleVirtualGridDoubleClick}
                      onFolderClick={(folderKey) => setFolderKey(folderKey)}
                      onContextMenu={handleVirtualGridContextMenu}
                      onActionSheet={handleVirtualGridActionSheet}
                      selectionMode={selectionMode}
                      containerWidth={containerSize.width}
                      containerHeight={containerSize.height}
                      emptyMessage="No files in this folder"
                    />
                  ) : (
                    renderGridView()
                  )}
                </div>

                {/* BULK ACTION BAR */}
                {selectedItems.size > 0 && (
                  <BulkActionBar
                    selectedCount={selectedItems.size}
                    onClearSelection={() => setSelectedItems(new Set())}
                    onDownload={() => {
                      const firstUrl = Array.from(selectedItems)[0];
                      const file = displayedFiles.find((f) => f.url === firstUrl);
                      if (file) handleDownloadSingle(file);
                    }}
                    onDownloadZip={handleBulkDownloadWithState}
                    onMove={handleBulkMove}
                    onDelete={handleDelete}
                    canDelete={canDelete}
                    isZipping={isZipping}
                    onCopyLink={
                      selectedItems.size === 1
                        ? () => {
                            const url = Array.from(selectedItems)[0];
                            navigator.clipboard.writeText(url);
                            notify('success', 'Link copied to clipboard');
                          }
                        : undefined
                    }
                  />
                )}

                {/* Selection mode bar for multi-selection */}
                {selectionMode === 'multi' && selectedItems.size > 0 && (
                  <div className={legacyStyles.selectionBar}>
                    <span>{selectedItems.size} selected</span>
                    <div className={legacyStyles.selectionActions}>
                      <button
                        type="button"
                        className={legacyStyles.secondaryButton}
                        onClick={() => setSelectedItems(new Set())}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        className={legacyStyles.primaryButton}
                        onClick={onConfirmSelection}
                      >
                        Insert {selectedItems.size} selected
                      </button>
                    </div>
                  </div>
                )}
                
                {/* File Transfer Status Bar - shows upload/download/delete progress */}
                <FileTransferStatus position="bottom" autoHideDelay={5000} />
              </div>

              {/* RIGHT INSPECTOR */}
              {inspectorOpen && inspectorFile && (
                <FileInspector
                  file={inspectorFile}
                  onClose={() => {
                    setInspectorOpen(false);
                    setInspectorFile(null);
                  }}
                  onDownload={() => {
                    const file = displayedFiles.find(
                      (f) => f.url === inspectorFile.url
                    );
                    if (file) handleDownloadSingle(file);
                  }}
                  onCopyLink={() => {
                    navigator.clipboard.writeText(inspectorFile.url);
                    notify('success', 'Link copied to clipboard');
                  }}
                  onDelete={
                    canDelete
                      ? () => handleDeleteSingle(inspectorFile.url)
                      : undefined
                  }
                  canEdit={canDelete}
                />
              )}
            </div>
          </div>

          {/* Context Menu (desktop right-click) - inside Modal to appear above it */}
          {contextMenu && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              isOpen={true}
              onClose={() => setContextMenu(null)}
              onAction={handleContextMenuAction}
              contextType={contextMenu.type}
              canDelete={canDelete}
              canUpload={canUpload}
              isFilePinned={contextMenu.file ? isPinned(contextMenu.file.url) : false}
            />
          )}

          {/* Action Sheet (mobile/tablet long-press or "..." button) */}
          <ActionSheet
            isOpen={actionSheetOpen}
            onClose={() => {
              setActionSheetOpen(false);
              setActionSheetFile(null);
            }}
            onAction={handleContextMenuAction}
            contextType={actionSheetFile ? (actionSheetFile.kind === 'folder' ? 'folder' : 'file') : 'file'}
            fileName={actionSheetFile?.fileName}
            canDelete={canDelete}
            canUpload={canUpload}
            isFilePinned={actionSheetFile ? isPinned(actionSheetFile.url) : false}
          />

          {/* Quick Look Preview Modal */}
          <QuickLookModal
            isOpen={quickLookOpen}
            onRequestClose={() => setQuickLookOpen(false)}
            files={displayedFiles}
            currentIndex={quickLookIndex}
            onNavigate={handleQuickLookNavigate}
            onDownload={handleQuickLookDownload}
            onCopyLink={handleQuickLookCopyLink}
            onDelete={canDelete ? handleQuickLookDelete : undefined}
            projectId={activeProject?.projectId as string | undefined}
            canEdit={canDelete}
          />
        </Modal>

        {/* Delete Confirmation Modal */}
        <ConfirmModal
          isOpen={isConfirmingDelete}
          onRequestClose={() => setIsConfirmingDelete(false)}
          onConfirm={performDelete}
          message="Are you sure you want to delete the selected files?"
          className={{
            base: legacyStyles.confirmContent,
            afterOpen: legacyStyles.confirmContentAfterOpen,
            beforeClose: legacyStyles.confirmContentBeforeClose,
          }}
          overlayClassName={{
            base: legacyStyles.confirmOverlay,
            afterOpen: legacyStyles.confirmOverlayAfterOpen,
            beforeClose: legacyStyles.confirmOverlayBeforeClose,
          }}
        />

        {/* Folder Picker Modal for Move */}
        <FolderPickerModal
          isOpen={isMoveModalOpen}
          onRequestClose={() => {
            setIsMoveModalOpen(false);
            setMoveTargetFiles([]);
          }}
          onSelect={handleMoveConfirm}
          folders={folderPickerFolders}
          currentFolder={folderKey}
          itemCount={moveTargetFiles.length}
          itemNames={moveTargetFiles.map((f) => f.fileName)}
          title="Move to folder"
        />
        
        {/* Dev-only performance HUD (Ctrl+Shift+P to toggle) */}
        <PerfHUD
          gridRenderCount={gridRenderCount}
          tileRenderCount={tileRenderCount}
          fileCount={displayedFiles.length + customFolders.length}
          filteredCount={gridItems.length}
        />
      </>
    );
  }
);

FileManagerV2Component.displayName = 'FileManagerV2Component';

export default FileManagerV2Component;