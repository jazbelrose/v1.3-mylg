/**
 * ActionSheet - Bottom sheet for touch device actions (iOS-style)
 * 
 * Features:
 * - Slides up from bottom on mobile/tablet
 * - Shows same actions as context menu
 * - Swipe down to dismiss
 * - Backdrop click to dismiss
 * - Accessible with proper ARIA roles
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
  X,
} from 'lucide-react';
import type { ContextMenuAction, ContextMenuItem } from './ContextMenu';
import styles from './file-manager-v2.module.css';

export interface ActionSheetProps {
  /** Whether sheet is visible */
  isOpen: boolean;
  /** Close callback */
  onClose: () => void;
  /** Action callback */
  onAction: (action: ContextMenuAction) => void;
  /** Type of context */
  contextType: 'file' | 'folder' | 'empty';
  /** File name to display (optional) */
  fileName?: string;
  /** Whether user can delete */
  canDelete?: boolean;
  /** Whether user can upload */
  canUpload?: boolean;
}

const FILE_MENU_ITEMS: ContextMenuItem[] = [
  { action: 'preview', label: 'Quick Look', icon: <Eye size={20} /> },
  { action: 'open', label: 'Open', icon: <ExternalLink size={20} />, dividerAfter: true },
  { action: 'download', label: 'Download', icon: <Download size={20} /> },
  { action: 'copy-link', label: 'Copy Link', icon: <Link size={20} />, dividerAfter: true },
  { action: 'rename', label: 'Rename', icon: <Edit3 size={20} /> },
  { action: 'move', label: 'Move to…', icon: <Folder size={20} /> },
  { action: 'duplicate', label: 'Duplicate', icon: <Copy size={20} />, dividerAfter: true },
  { action: 'details', label: 'View Details', icon: <Info size={20} />, dividerAfter: true },
  { action: 'delete', label: 'Delete', icon: <Trash2 size={20} />, danger: true },
];

const FOLDER_MENU_ITEMS: ContextMenuItem[] = [
  { action: 'open', label: 'Open', icon: <Eye size={20} />, dividerAfter: true },
  { action: 'download-folder', label: 'Download Folder', icon: <Download size={20} /> },
  { action: 'copy-link', label: 'Copy Link', icon: <Link size={20} />, dividerAfter: true },
  { action: 'rename', label: 'Rename', icon: <Edit3 size={20} /> },
  { action: 'move', label: 'Move to…', icon: <Folder size={20} />, dividerAfter: true },
  { action: 'new-folder', label: 'New Folder Inside', icon: <FolderPlus size={20} /> },
  { action: 'upload', label: 'Upload Files Here', icon: <FileUp size={20} />, dividerAfter: true },
  { action: 'delete-folder', label: 'Delete Folder', icon: <Trash2 size={20} />, danger: true },
];

const EMPTY_MENU_ITEMS: ContextMenuItem[] = [
  { action: 'new-folder', label: 'New Folder', icon: <FolderPlus size={20} /> },
  { action: 'upload', label: 'Upload Files', icon: <FileUp size={20} /> },
];

export function ActionSheet({
  isOpen,
  onClose,
  onAction,
  contextType,
  fileName,
  canDelete = true,
  canUpload = true,
}: ActionSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);

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
        items = FILE_MENU_ITEMS;
    }

    // Filter based on permissions
    return items.filter((item) => {
      if ((item.action === 'delete' || item.action === 'delete-folder') && !canDelete) return false;
      if ((item.action === 'upload' || item.action === 'new-folder') && !canUpload) return false;
      return true;
    });
  }, [contextType, canDelete, canUpload]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Swipe to dismiss
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (startYRef.current === null || !sheetRef.current) return;

      const currentY = e.touches[0].clientY;
      const deltaY = currentY - startYRef.current;

      if (deltaY > 0) {
        // Swiping down
        sheetRef.current.style.transform = `translateY(${deltaY}px)`;
      }
    },
    []
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (startYRef.current === null || !sheetRef.current) return;

      const currentY = e.changedTouches[0].clientY;
      const deltaY = currentY - startYRef.current;

      // If swiped down more than 100px, close
      if (deltaY > 100) {
        onClose();
      } else {
        sheetRef.current.style.transform = '';
      }

      startYRef.current = null;
    },
    [onClose]
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

  const sheet = (
    <div className={styles.actionSheetOverlay} onClick={onClose}>
      <div
        ref={sheetRef}
        className={styles.actionSheet}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        role="dialog"
        aria-modal="true"
        aria-label="File actions"
      >
        {/* Handle indicator */}
        <div className={styles.actionSheetHandle} />

        {/* Header with file name */}
        {fileName && (
          <div className={styles.actionSheetHeader}>
            <span className={styles.actionSheetFileName}>{fileName}</span>
            <button
              type="button"
              className={styles.actionSheetClose}
              onClick={onClose}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        )}

        {/* Actions */}
        <div className={styles.actionSheetItems}>
          {menuItems.map((item) => (
            <React.Fragment key={item.action}>
              <button
                type="button"
                className={`${styles.actionSheetItem} ${item.danger ? styles.actionSheetItemDanger : ''}`}
                onClick={() => handleItemClick(item)}
                disabled={item.disabled}
              >
                <span className={styles.actionSheetIcon}>{item.icon}</span>
                <span className={styles.actionSheetLabel}>{item.label}</span>
              </button>
              {item.dividerAfter && <div className={styles.actionSheetDivider} />}
            </React.Fragment>
          ))}
        </div>

        {/* Cancel button */}
        <div className={styles.actionSheetCancel}>
          <button
            type="button"
            className={styles.actionSheetCancelBtn}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  // Portal to body
  return createPortal(sheet, document.body);
}

export default ActionSheet;
