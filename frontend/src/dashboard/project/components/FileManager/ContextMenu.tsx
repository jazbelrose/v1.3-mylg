/**
 * ContextMenu - Right-click context menu for files and folders
 * 
 * Features:
 * - Positioned at cursor
 * - Keyboard navigation
 * - Closes on click outside
 * - Uses createPortal for proper z-index above modals
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Eye,
  Download,
  Link,
  Edit3,
  Folder,
  Trash2,
  Copy,
  FileUp,
  FolderPlus,
  ExternalLink,
  Info,
  Pin,
  PinOff,
} from 'lucide-react';
import styles from './file-manager-v2.module.css';

export type ContextMenuAction =
  | 'open'
  | 'preview'
  | 'download'
  | 'download-folder'
  | 'copy-link'
  | 'rename'
  | 'move'
  | 'delete'
  | 'delete-folder'
  | 'details'
  | 'new-folder'
  | 'upload'
  | 'duplicate'
  | 'pin'
  | 'unpin';

export interface ContextMenuItem {
  action: ContextMenuAction;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  dividerAfter?: boolean;
}

export interface ContextMenuProps {
  /** X position */
  x: number;
  /** Y position */
  y: number;
  /** Whether menu is visible */
  isOpen: boolean;
  /** Close callback */
  onClose: () => void;
  /** Action callback */
  onAction: (action: ContextMenuAction) => void;
  /** Type of context */
  contextType: 'file' | 'folder' | 'empty';
  /** Whether user can delete */
  canDelete?: boolean;
  /** Whether user can upload */
  canUpload?: boolean;
  /** Whether the file is already pinned (for toggle behavior) */
  isFilePinned?: boolean;
}

const FILE_MENU_ITEMS: ContextMenuItem[] = [
  { action: 'open', label: 'Open', icon: <Eye size={14} /> },
  { action: 'preview', label: 'Preview', icon: <ExternalLink size={14} />, dividerAfter: true },
  { action: 'pin', label: 'Pin to Activity', icon: <Pin size={14} /> },
  { action: 'download', label: 'Download', icon: <Download size={14} /> },
  { action: 'copy-link', label: 'Copy Link', icon: <Link size={14} />, dividerAfter: true },
  { action: 'rename', label: 'Rename', icon: <Edit3 size={14} /> },
  { action: 'move', label: 'Move to…', icon: <Folder size={14} /> },
  { action: 'duplicate', label: 'Duplicate', icon: <Copy size={14} />, dividerAfter: true },
  { action: 'details', label: 'View Details', icon: <Info size={14} />, dividerAfter: true },
  { action: 'delete', label: 'Delete', icon: <Trash2 size={14} />, danger: true },
];

const FOLDER_MENU_ITEMS: ContextMenuItem[] = [
  { action: 'open', label: 'Open', icon: <Eye size={14} />, dividerAfter: true },
  { action: 'download-folder', label: 'Download Folder', icon: <Download size={14} /> },
  { action: 'copy-link', label: 'Copy Link', icon: <Link size={14} />, dividerAfter: true },
  { action: 'rename', label: 'Rename', icon: <Edit3 size={14} /> },
  { action: 'move', label: 'Move to…', icon: <Folder size={14} />, dividerAfter: true },
  { action: 'new-folder', label: 'New Folder Inside', icon: <FolderPlus size={14} /> },
  { action: 'upload', label: 'Upload Files Here', icon: <FileUp size={14} />, dividerAfter: true },
  { action: 'delete-folder', label: 'Delete Folder', icon: <Trash2 size={14} />, danger: true },
];

const EMPTY_MENU_ITEMS: ContextMenuItem[] = [
  { action: 'new-folder', label: 'New Folder', icon: <FolderPlus size={14} /> },
  { action: 'upload', label: 'Upload Files', icon: <FileUp size={14} /> },
];

export function ContextMenu({
  x,
  y,
  isOpen,
  onClose,
  onAction,
  contextType,
  canDelete = true,
  canUpload = true,
  isFilePinned = false,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = React.useState(0);

  // Get menu items based on context type
  const menuItems = React.useMemo(() => {
    let items: ContextMenuItem[];
    switch (contextType) {
      case 'folder':
        items = FOLDER_MENU_ITEMS;
        break;
      case 'empty':
        items = EMPTY_MENU_ITEMS;
        break;
      default:
        // For files, replace pin/unpin based on current state
        items = FILE_MENU_ITEMS.map(item => {
          if (item.action === 'pin') {
            return isFilePinned
              ? { action: 'unpin' as const, label: 'Unpin from Activity', icon: <PinOff size={14} /> }
              : item;
          }
          return item;
        });
    }

    // Filter based on permissions
    return items.filter((item) => {
      if ((item.action === 'delete' || item.action === 'delete-folder') && !canDelete) return false;
      if ((item.action === 'upload' || item.action === 'new-folder') && !canUpload) return false;
      return true;
    });
  }, [contextType, canDelete, canUpload, isFilePinned]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  // Focus first item on open
  useEffect(() => {
    if (isOpen) {
      setFocusedIndex(0);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((prev) => (prev + 1) % menuItems.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((prev) => (prev - 1 + menuItems.length) % menuItems.length);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          const item = menuItems[focusedIndex];
          if (item && !item.disabled) {
            onAction(item.action);
            onClose();
          }
          break;
      }
    },
    [menuItems, focusedIndex, onAction, onClose]
  );

  const handleItemClick = useCallback(
    (item: ContextMenuItem) => {
      if (item.disabled) return;
      onAction(item.action);
      onClose();
    },
    [onAction, onClose]
  );

  if (!isOpen) return null;

  // Adjust position to stay within viewport
  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - menuItems.length * 36 - 20);

  const menu = (
    <div
      ref={menuRef}
      className={styles.contextMenu}
      style={{ left: adjustedX, top: adjustedY }}
      role="menu"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      {menuItems.map((item, index) => (
        <React.Fragment key={item.action}>
          <button
            type="button"
            className={`${styles.contextMenuItem} ${item.danger ? styles.contextMenuItemDanger : ''} ${focusedIndex === index ? styles.contextMenuItemFocused : ''}`}
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
            role="menuitem"
            tabIndex={focusedIndex === index ? 0 : -1}
          >
            <span className={styles.contextMenuIcon}>{item.icon}</span>
            <span className={styles.contextMenuLabel}>{item.label}</span>
          </button>
          {item.dividerAfter && <div className={styles.contextMenuDivider} />}
        </React.Fragment>
      ))}
    </div>
  );

  // Portal to body to ensure it appears above modals
  return createPortal(menu, document.body);
}

export default ContextMenu;
