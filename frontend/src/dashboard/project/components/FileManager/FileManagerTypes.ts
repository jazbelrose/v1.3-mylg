import type React from "react";

export type FileSelectionMode = 'none' | 'single' | 'multi';

export interface FileManagerProps {
  folder?: string;
  displayName?: string;
  style?: React.CSSProperties;
  showTrigger?: boolean;
  isOpen?: boolean;
  onRequestClose?: () => void;
  selectionMode?: FileSelectionMode;
  onFileSelect?: (files: FileItem[]) => void;
  fileTypeFilter?: 'images' | 'all';
}

export interface FileItem {
  fileName: string;
  url: string;
  lastModified?: number;
  size?: number;
  kind?: string;
  [key: string]: unknown;
}

/**
 * FileNode - Extended file/folder type for modern file manager
 * This type aligns with the API expectations defined in the spec
 */
export interface FileNode {
  id: string;
  parentId: string | null;
  name: string;
  isFolder: boolean;
  mimeType?: string;
  ext?: string;
  sizeBytes?: number;
  updatedAt: string;
  createdAt: string;
  uploadedBy?: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  path?: string[];
  thumbnailUrl?: string;
  previewUrl?: string;
  downloadUrl?: string;
}

export interface FolderOption {
  key: string;
  name: string;
}

export type ViewMode = "grid" | "list";

export type SortOption =
  | "name-asc"
  | "name-desc"
  | "date-asc"
  | "date-desc"
  | "kind-asc"
  | "kind-desc";

export type FilterValue = "all" | string;

export type Project = Record<string, unknown>;

export interface FileManagerRef {
  open: () => Promise<void> | void;
  close: () => void;
}









