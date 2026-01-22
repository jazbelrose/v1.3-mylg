/**
 * FolderTree - Left sidebar navigation tree
 * 
 * Features:
 * - Clean section headers (not clickable pills)
 * - Folder list with subtle selection indicator
 * - Supports custom and system folders
 */

import React, { useState, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  Download,
  Upload,
  Star,
  Clock,
  Users,
  PenTool,
  Layout,
  Plus,
  Files,
  StickyNote,
} from 'lucide-react';
import styles from './file-manager-v2.module.css';

export interface FolderTreeItem {
  key: string;
  name: string;
  icon?: React.ReactNode;
  children?: FolderTreeItem[];
  isSystem?: boolean;
  fileCount?: number;
}

export interface FolderTreeProps {
  /** Currently selected folder key */
  currentFolder: string;
  /** Callback when folder is selected */
  onFolderSelect: (key: string) => void;
  /** Root folder */
  rootFolder: FolderTreeItem;
  /** System folders (Drawings, Documents, Downloads) */
  systemFolders: FolderTreeItem[];
  /** Custom folders created by user */
  customFolders: FolderTreeItem[];
  /** Pinned folders */
  pinnedFolders?: FolderTreeItem[];
  /** Recent folders */
  recentFolders?: FolderTreeItem[];
  /** Whether user can create folders */
  canCreateFolder?: boolean;
  /** Create folder callback */
  onCreateFolder?: () => void;
  /** Collapsed state (for responsive) */
  isCollapsed?: boolean;
  /** Toggle collapsed state */
  onToggleCollapse?: () => void;
}

const getFolderIcon = (key: string, isOpen: boolean = false, size = 15): React.ReactNode => {
  switch (key) {
    case 'uploads':
      return <Files size={size} strokeWidth={1.5} />;
    case 'invoices':
    case 'documents':
      return <FileText size={size} strokeWidth={1.5} />;
    case 'downloads':
      return <Download size={size} strokeWidth={1.5} />;
    case 'drawings':
      return <PenTool size={size} strokeWidth={1.5} />;
    case 'floorplans':
      return <Layout size={size} strokeWidth={1.5} />;
    case 'notes':
      return <StickyNote size={size} strokeWidth={1.5} />;
    default:
      return isOpen ? <FolderOpen size={size} strokeWidth={1.5} /> : <Folder size={size} strokeWidth={1.5} />;
  }
};

// Export getFolderIcon for use in other components (e.g., folder tiles)
export { getFolderIcon };

interface TreeItemProps {
  item: FolderTreeItem;
  isSelected: boolean;
  onSelect: (key: string) => void;
  depth: number;
  isCollapsed?: boolean;
}

function TreeItem({ item, isSelected, onSelect, depth, isCollapsed }: TreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = item.children && item.children.length > 0;

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

  const handleSelect = useCallback(() => {
    onSelect(item.key);
    if (hasChildren && !isExpanded) {
      setIsExpanded(true);
    }
  }, [onSelect, item.key, hasChildren, isExpanded]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect();
    } else if (e.key === 'ArrowRight' && hasChildren && !isExpanded) {
      e.preventDefault();
      setIsExpanded(true);
    } else if (e.key === 'ArrowLeft' && isExpanded) {
      e.preventDefault();
      setIsExpanded(false);
    }
  }, [handleSelect, hasChildren, isExpanded]);

  if (isCollapsed) {
    // Collapsed view - just icon
    return (
      <button
        type="button"
        className={`${styles.treeItemCollapsed} ${isSelected ? styles.treeItemSelected : ''}`}
        onClick={handleSelect}
        title={item.name}
        aria-label={item.name}
      >
        {item.icon || getFolderIcon(item.key, isSelected)}
      </button>
    );
  }

  return (
    <div className={styles.treeItemWrapper}>
      <div
        className={`${styles.treeItem} ${isSelected ? styles.treeItemSelected : ''}`}
        style={{ paddingLeft: `${14 + depth * 16}px` }}
        onClick={handleSelect}
        onKeyDown={handleKeyDown}
        role="treeitem"
        tabIndex={0}
        aria-selected={isSelected}
        aria-expanded={hasChildren ? isExpanded : undefined}
      >
        {hasChildren && (
          <button
            type="button"
            className={styles.treeItemChevron}
            onClick={handleToggle}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <ChevronDown size={12} strokeWidth={1.5} /> : <ChevronRight size={12} strokeWidth={1.5} />}
          </button>
        )}
        <span className={styles.treeItemIcon}>
          {item.icon || getFolderIcon(item.key, isSelected || isExpanded)}
        </span>
        <span className={styles.treeItemLabel}>{item.name}</span>
        {typeof item.fileCount === 'number' && (
          <span className={styles.treeItemCount}>{item.fileCount}</span>
        )}
      </div>
      {hasChildren && isExpanded && (
        <div className={styles.treeItemChildren} role="group">
          {item.children!.map((child) => (
            <TreeItem
              key={child.key}
              item={child}
              isSelected={false}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderTree({
  currentFolder,
  onFolderSelect,
  rootFolder,
  systemFolders,
  customFolders,
  pinnedFolders = [],
  recentFolders = [],
  canCreateFolder = false,
  onCreateFolder,
  isCollapsed = false,
  onToggleCollapse,
}: FolderTreeProps) {
  // Combine all folders for a cleaner structure
  const hasFolders = systemFolders.length > 0 || customFolders.length > 0;
  
  return (
    <nav
      className={`${styles.folderTree} ${isCollapsed ? styles.folderTreeCollapsed : ''}`}
      role="tree"
      aria-label="Folder navigation"
    >
      {/* All Files (root) - styled as a regular item, not a header */}
      <div className={styles.treeSection}>
        <TreeItem
          item={{ ...rootFolder, name: 'All Files' }}
          isSelected={currentFolder === rootFolder.key}
          onSelect={onFolderSelect}
          depth={0}
          isCollapsed={isCollapsed}
        />
      </div>

      {/* Folders section */}
      {hasFolders && (
        <div className={styles.treeSection}>
          {!isCollapsed && (
            <div className={styles.treeSectionLabel}>
              <span>Folders</span>
            </div>
          )}
          {/* System folders first */}
          {systemFolders.map((folder) => (
            <TreeItem
              key={folder.key}
              item={folder}
              isSelected={currentFolder === folder.key}
              onSelect={onFolderSelect}
              depth={0}
              isCollapsed={isCollapsed}
            />
          ))}
          {/* Custom folders */}
          {customFolders.map((folder) => (
            <TreeItem
              key={folder.key}
              item={folder}
              isSelected={currentFolder === folder.key}
              onSelect={onFolderSelect}
              depth={0}
              isCollapsed={isCollapsed}
            />
          ))}
        </div>
      )}

      {/* Pinned */}
      {pinnedFolders.length > 0 && (
        <div className={styles.treeSection}>
          {!isCollapsed && (
            <div className={styles.treeSectionLabel}>
              <Star size={11} strokeWidth={1.5} /> Pinned
            </div>
          )}
          {pinnedFolders.map((folder) => (
            <TreeItem
              key={folder.key}
              item={folder}
              isSelected={currentFolder === folder.key}
              onSelect={onFolderSelect}
              depth={0}
              isCollapsed={isCollapsed}
            />
          ))}
        </div>
      )}

      {/* Recents */}
      {recentFolders.length > 0 && (
        <div className={styles.treeSection}>
          {!isCollapsed && (
            <div className={styles.treeSectionLabel}>
              <Clock size={11} strokeWidth={1.5} /> Recent
            </div>
          )}
          {recentFolders.map((folder) => (
            <TreeItem
              key={folder.key}
              item={folder}
              isSelected={currentFolder === folder.key}
              onSelect={onFolderSelect}
              depth={0}
              isCollapsed={isCollapsed}
            />
          ))}
        </div>
      )}

    </nav>
  );
}

export default FolderTree;
