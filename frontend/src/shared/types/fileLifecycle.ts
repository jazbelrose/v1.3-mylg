/**
 * File Lifecycle Types
 * Canonical types for the file management system
 */

// ============================================================================
// FILE RECORD
// ============================================================================

export type FileStatus = 'UPLOADING' | 'READY' | 'FAILED' | 'DELETED';

export interface FileRecord {
  // Keys
  PK: string;                     // "project#<projectId>" | "org#<orgId>"
  fileId: string;                 // ULID
  
  // Storage
  storageKey: string;             // S3 key
  bucket: string;
  
  // Metadata
  filename: string;
  mimeType: string;
  size: number;
  checksum?: string;
  
  // Renditions
  thumbnailKey?: string;
  embedKey?: string;
  
  // Lifecycle
  status: FileStatus;
  
  // Audit
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  deletedAt?: string;
  deletedBy?: string;
  
  // Denormalized scope IDs
  projectId?: string;
  orgId?: string;
  
  // Computed URLs (enriched on read)
  url?: string;
  thumbnailUrl?: string;
  embedUrl?: string;
  
  // Reference count (enriched on read)
  refCount?: number;
}

// ============================================================================
// FILE REFERENCES
// ============================================================================

export type ContainerType = 
  | 'slide' 
  | 'message' 
  | 'task' 
  | 'budget' 
  | 'org' 
  | 'lexical' 
  | 'gallery' 
  | 'project' 
  | 'user';

export type UsageType = 
  | 'attachment' 
  | 'background' 
  | 'element' 
  | 'logo' 
  | 'thumbnail' 
  | 'invoice' 
  | 'avatar' 
  | 'page';

export interface FileRef {
  PK: string;                     // "file#<fileId>"
  SK: string;                     // "<containerType>#<containerId>"
  GSI1PK: string;
  GSI1SK: string;
  
  containerType: ContainerType;
  containerId: string;
  fileId: string;
  
  usageType?: UsageType;
  position?: number;
  
  // Denormalized file info
  filename: string;
  mimeType: string;
  thumbnailUrl?: string;
  
  createdAt: string;
  createdBy: string;
}

export interface GroupedRefs {
  [containerType: string]: {
    containerId: string;
    usageType?: UsageType;
    createdAt: string;
  }[];
}

// ============================================================================
// API RESPONSES
// ============================================================================

export interface ListFilesResponse {
  files: FileRecord[];
  cursor: string | null;
}

export interface CreateFileResponse {
  fileId: string;
  storageKey: string;
  uploadUrl: string;
}

export interface GetFileResponse {
  file: FileRecord & { refCount: number };
}

export interface GetRefsResponse {
  fileId: string;
  count: number;
  refs: FileRef[];
  grouped: GroupedRefs;
}

export interface DeleteFileResponse {
  message: string;
  fileId: string;
  refCount: number;
  canRestore: boolean;
  restoreDeadline: string;
}

// ============================================================================
// WEBSOCKET EVENTS
// ============================================================================

export interface FileCreatedEvent {
  action: 'fileCreated';
  projectId?: string;
  orgId?: string;
  conversationId: string;
  file: {
    fileId: string;
    filename: string;
    mimeType: string;
    size: number;
    status: FileStatus;
    storageKey: string;
    thumbnailUrl?: string;
    createdBy: string;
    createdAt: string;
  };
}

export interface FileUpdatedEvent {
  action: 'fileUpdated';
  projectId?: string;
  orgId?: string;
  conversationId: string;
  fileId: string;
  changes: Partial<{
    filename: string;
    status: FileStatus;
    thumbnailUrl: string;
    embedUrl: string;
  }>;
  updatedBy: string;
}

export interface FileDeletedEvent {
  action: 'fileDeleted';
  projectId?: string;
  orgId?: string;
  conversationId: string;
  fileId: string;
  deletedBy: string;
  deletedAt: string;
  refCount: number;
}

export interface FileRestoredEvent {
  action: 'fileRestored';
  projectId?: string;
  orgId?: string;
  conversationId: string;
  fileId: string;
  restoredBy: string;
}

export interface FileRefAddedEvent {
  action: 'fileRefAdded';
  projectId?: string;
  orgId?: string;
  conversationId: string;
  fileId: string;
  containerType: ContainerType;
  containerId: string;
  usageType?: UsageType;
  addedBy: string;
}

export interface FileRefRemovedEvent {
  action: 'fileRefRemovedEvent';
  projectId?: string;
  orgId?: string;
  conversationId: string;
  fileId: string;
  containerType: ContainerType;
  containerId: string;
  removedBy: string;
}

export type FileWebSocketEvent = 
  | FileCreatedEvent 
  | FileUpdatedEvent 
  | FileDeletedEvent 
  | FileRestoredEvent 
  | FileRefAddedEvent 
  | FileRefRemovedEvent;

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface UploadOptions {
  filename: string;
  mimeType: string;
  size: number;
  file: File;
  onProgress?: (progress: number) => void;
}

export interface FileUploadResult {
  fileId: string;
  storageKey: string;
  url: string;
  thumbnailUrl?: string;
}

// Type guards
export function isFileDeleted(file: FileRecord): boolean {
  return file.status === 'DELETED';
}

export function isFileReady(file: FileRecord): boolean {
  return file.status === 'READY';
}

export function isFileUploading(file: FileRecord): boolean {
  return file.status === 'UPLOADING';
}

export function isFileFailed(file: FileRecord): boolean {
  return file.status === 'FAILED';
}
