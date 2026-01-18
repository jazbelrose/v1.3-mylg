/**
 * FolderPickerModal - Modal for selecting a destination folder
 * 
 * Used for Move operations in FileManager V2.
 * Shows folder tree on left, destination preview on right.
 */

import React, { useState, useMemo, useCallback } from 'react';
import Modal from '@/shared/ui/ModalWithStack';
import { Folder, FolderOpen, ChevronRight, ChevronDown, X, ArrowRight } from 'lucide-react';
import styles from './folder-picker-modal.module.css';

export interface FolderPickerFolder {
  key: string;
  name: string;
  parentKey?: string;
  children?: FolderPickerFolder[];
}

export interface FolderPickerModalProps {
  isOpen: boolean;
  onRequestClose: () => void;
  onSelect: (folderKey: string, folderName: string) => void;
  folders: FolderPickerFolder[];
  currentFolder: string;
  itemCount: number;
  itemNames?: string[];
  title?: string;
}

interface FolderNodeProps {
  folder: FolderPickerFolder;
  level: number;
  selectedKey: string | null;
  expandedKeys: Set<string>;
  onSelect: (folder: FolderPickerFolder) => void;
  onToggle: (key: string) => void;
  disabledKey?: string;
}

const FolderNode: React.FC<FolderNodeProps> = ({
  folder,
  level,
  selectedKey,
  expandedKeys,
  onSelect,
  onToggle,
  disabledKey,
}) => {
  const hasChildren = folder.children && folder.children.length > 0;
  const isExpanded = expandedKeys.has(folder.key);
  const isSelected = selectedKey === folder.key;
  const isDisabled = folder.key === disabledKey;

  const handleClick = () => {
    if (!isDisabled) {
      onSelect(folder);
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(folder.key);
  };

  return (
    <>
      <div
        className={`${styles.folderNode} ${isSelected ? styles.folderNodeSelected : ''} ${isDisabled ? styles.folderNodeDisabled : ''}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleClick();
          }
        }}
      >
        {hasChildren ? (
          <button
            className={styles.expandButton}
            onClick={handleToggle}
            type="button"
            aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className={styles.expandPlaceholder} />
        )}
        
        <span className={styles.folderIcon}>
          {isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}
        </span>
        
        <span className={styles.folderName}>{folder.name}</span>
      </div>

      {hasChildren && isExpanded && (
        <div className={styles.folderChildren}>
          {folder.children!.map((child) => (
            <FolderNode
              key={child.key}
              folder={child}
              level={level + 1}
              selectedKey={selectedKey}
              expandedKeys={expandedKeys}
              onSelect={onSelect}
              onToggle={onToggle}
              disabledKey={disabledKey}
            />
          ))}
        </div>
      )}
    </>
  );
};

export const FolderPickerModal: React.FC<FolderPickerModalProps> = ({
  isOpen,
  onRequestClose,
  onSelect,
  folders,
  currentFolder,
  itemCount,
  itemNames = [],
  title = 'Move to folder',
}) => {
  const [selectedFolder, setSelectedFolder] = useState<FolderPickerFolder | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set(['uploads']));

  // Build folder tree from flat list
  const folderTree = useMemo(() => {
    // If folders are already nested, return as is
    if (folders.some(f => f.children)) {
      return folders;
    }
    
    // Otherwise, build tree from flat list
    const rootFolders: FolderPickerFolder[] = [];
    const folderMap = new Map<string, FolderPickerFolder>();
    
    // First pass: create map
    folders.forEach(f => {
      folderMap.set(f.key, { ...f, children: [] });
    });
    
    // Second pass: build tree
    folders.forEach(f => {
      const folder = folderMap.get(f.key)!;
      if (f.parentKey && folderMap.has(f.parentKey)) {
        folderMap.get(f.parentKey)!.children!.push(folder);
      } else {
        rootFolders.push(folder);
      }
    });
    
    return rootFolders;
  }, [folders]);

  const handleFolderSelect = useCallback((folder: FolderPickerFolder) => {
    setSelectedFolder(folder);
  }, []);

  const handleToggle = useCallback((key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (selectedFolder) {
      onSelect(selectedFolder.key, selectedFolder.name);
      onRequestClose();
    }
  }, [selectedFolder, onSelect, onRequestClose]);

  const displayedItems = useMemo(() => {
    if (itemNames.length === 0) {
      return `${itemCount} item${itemCount !== 1 ? 's' : ''}`;
    }
    if (itemNames.length <= 3) {
      return itemNames.join(', ');
    }
    return `${itemNames.slice(0, 2).join(', ')} and ${itemNames.length - 2} more`;
  }, [itemCount, itemNames]);

  const canMove = selectedFolder && selectedFolder.key !== currentFolder;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      className={styles.modal}
      overlayClassName={styles.overlay}
      contentLabel={title}
    >
      <div className={styles.container}>
        {/* Header */}
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button
            className={styles.closeButton}
            onClick={onRequestClose}
            type="button"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </header>

        {/* Content */}
        <div className={styles.content}>
          {/* Left: Folder Tree */}
          <div className={styles.treePanel}>
            <div className={styles.treePanelHeader}>Select destination</div>
            <div className={styles.treeContent}>
              {folderTree.map((folder) => (
                <FolderNode
                  key={folder.key}
                  folder={folder}
                  level={0}
                  selectedKey={selectedFolder?.key ?? null}
                  expandedKeys={expandedKeys}
                  onSelect={handleFolderSelect}
                  onToggle={handleToggle}
                  disabledKey={currentFolder}
                />
              ))}
            </div>
          </div>

          {/* Right: Preview */}
          <div className={styles.previewPanel}>
            <div className={styles.previewPanelHeader}>Preview</div>
            <div className={styles.previewContent}>
              <div className={styles.previewItem}>
                <span className={styles.previewLabel}>Moving:</span>
                <span className={styles.previewValue}>{displayedItems}</span>
              </div>
              
              <div className={styles.previewArrow}>
                <ArrowRight size={24} />
              </div>
              
              <div className={styles.previewItem}>
                <span className={styles.previewLabel}>To:</span>
                <span className={styles.previewValue}>
                  {selectedFolder ? (
                    <span className={styles.destinationFolder}>
                      <Folder size={16} />
                      {selectedFolder.name}
                    </span>
                  ) : (
                    <span className={styles.noSelection}>Select a folder</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onRequestClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.confirmButton}
            onClick={handleConfirm}
            disabled={!canMove}
          >
            Move {itemCount > 1 ? `${itemCount} items` : ''}
          </button>
        </footer>
      </div>
    </Modal>
  );
};

export default FolderPickerModal;
