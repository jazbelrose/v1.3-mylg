import type React from "react";

export interface FileManagerProps {
  folder?: string;
  displayName?: string;
  style?: React.CSSProperties;
  showTrigger?: boolean;
  isOpen?: boolean;
  onRequestClose?: () => void;
}

export interface FileItem {
  fileName: string;
  url: string;
  lastModified?: number;
  size?: number;
  kind?: string;
  [key: string]: unknown;
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









