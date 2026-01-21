/**
 * useFileTransferStore - Global store for tracking file transfer operations
 * 
 * Tracks uploads, downloads, and deletions with progress and status.
 * Uses a subscription pattern for efficient updates without re-rendering entire tree.
 */

import { useSyncExternalStore, useCallback } from 'react';

export type TransferType = 'upload' | 'download' | 'delete';
export type TransferStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'cancelled';

export interface TransferItem {
  id: string;
  type: TransferType;
  fileName: string;
  /** For folder uploads, this is the relative path */
  relativePath?: string;
  /** Progress 0-100 for uploads with XHR progress */
  progress: number;
  /** Bytes transferred (for uploads) */
  bytesTransferred?: number;
  /** Total bytes (for uploads) */
  totalBytes?: number;
  status: TransferStatus;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

export interface TransferBatch {
  id: string;
  type: TransferType;
  items: TransferItem[];
  /** Overall progress 0-100 */
  progress: number;
  /** Total files in batch */
  totalFiles: number;
  /** Completed files */
  completedFiles: number;
  /** Failed files */
  failedFiles: number;
  status: TransferStatus;
  startedAt: number;
  completedAt?: number;
  /** For folder uploads, the folder name */
  folderName?: string;
}

interface TransferStore {
  batches: Map<string, TransferBatch>;
  activeBatchId: string | null;
  listeners: Set<() => void>;
}

// Global store instance
const store: TransferStore = {
  batches: new Map(),
  activeBatchId: null,
  listeners: new Set(),
};

// Notify all listeners of state change
function notifyListeners() {
  store.listeners.forEach((listener) => listener());
}

// Get snapshot for useSyncExternalStore
function getSnapshot(): Map<string, TransferBatch> {
  return store.batches;
}

// Subscribe for useSyncExternalStore
function subscribe(listener: () => void): () => void {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Start a new transfer batch
 */
export function startBatch(
  type: TransferType,
  files: Array<{ fileName: string; relativePath?: string; totalBytes?: number }>,
  folderName?: string
): string {
  const batchId = generateId();
  const now = Date.now();

  const items: TransferItem[] = files.map((file) => ({
    id: generateId(),
    type,
    fileName: file.fileName,
    relativePath: file.relativePath,
    progress: 0,
    totalBytes: file.totalBytes,
    status: 'pending',
    startedAt: now,
  }));

  const batch: TransferBatch = {
    id: batchId,
    type,
    items,
    progress: 0,
    totalFiles: files.length,
    completedFiles: 0,
    failedFiles: 0,
    status: 'pending',
    startedAt: now,
    folderName,
  };

  store.batches.set(batchId, batch);
  store.activeBatchId = batchId;
  notifyListeners();

  return batchId;
}

/**
 * Update progress for a specific file in a batch
 */
export function updateItemProgress(
  batchId: string,
  fileName: string,
  progress: number,
  bytesTransferred?: number
): void {
  const batch = store.batches.get(batchId);
  if (!batch) return;

  const item = batch.items.find((i) => i.fileName === fileName);
  if (!item) return;

  item.progress = progress;
  item.bytesTransferred = bytesTransferred;
  if (item.status === 'pending') {
    item.status = 'in-progress';
  }

  // Recalculate batch progress
  const totalProgress = batch.items.reduce((sum, i) => sum + i.progress, 0);
  batch.progress = Math.round(totalProgress / batch.items.length);
  batch.status = 'in-progress';

  store.batches.set(batchId, { ...batch });
  notifyListeners();
}

/**
 * Mark a file as completed
 */
export function completeItem(batchId: string, fileName: string): void {
  const batch = store.batches.get(batchId);
  if (!batch) return;

  const item = batch.items.find((i) => i.fileName === fileName);
  if (!item) return;

  item.progress = 100;
  item.status = 'completed';
  item.completedAt = Date.now();

  batch.completedFiles += 1;

  // Recalculate batch progress
  batch.progress = Math.round((batch.completedFiles / batch.totalFiles) * 100);

  // Check if batch is complete
  if (batch.completedFiles + batch.failedFiles === batch.totalFiles) {
    batch.status = batch.failedFiles > 0 ? 'completed' : 'completed';
    batch.completedAt = Date.now();
    
    // Clear active batch after completion
    if (store.activeBatchId === batchId) {
      store.activeBatchId = null;
    }
  }

  store.batches.set(batchId, { ...batch });
  notifyListeners();
}

/**
 * Mark a file as failed
 */
export function failItem(batchId: string, fileName: string, error: string): void {
  const batch = store.batches.get(batchId);
  if (!batch) return;

  const item = batch.items.find((i) => i.fileName === fileName);
  if (!item) return;

  item.status = 'failed';
  item.error = error;
  item.completedAt = Date.now();

  batch.failedFiles += 1;

  // Check if batch is complete
  if (batch.completedFiles + batch.failedFiles === batch.totalFiles) {
    batch.status = 'completed';
    batch.completedAt = Date.now();
    
    // Clear active batch after completion
    if (store.activeBatchId === batchId) {
      store.activeBatchId = null;
    }
  }

  store.batches.set(batchId, { ...batch });
  notifyListeners();
}

/**
 * Cancel a batch
 */
export function cancelBatch(batchId: string): void {
  const batch = store.batches.get(batchId);
  if (!batch) return;

  batch.status = 'cancelled';
  batch.completedAt = Date.now();
  batch.items.forEach((item) => {
    if (item.status === 'pending' || item.status === 'in-progress') {
      item.status = 'cancelled';
      item.completedAt = Date.now();
    }
  });

  if (store.activeBatchId === batchId) {
    store.activeBatchId = null;
  }

  store.batches.set(batchId, { ...batch });
  notifyListeners();
}

/**
 * Clear completed batches (older than 5 seconds)
 */
export function clearCompletedBatches(): void {
  const now = Date.now();
  const CLEAR_DELAY = 5000;

  for (const [id, batch] of store.batches) {
    if (
      (batch.status === 'completed' || batch.status === 'cancelled') &&
      batch.completedAt &&
      now - batch.completedAt > CLEAR_DELAY
    ) {
      store.batches.delete(id);
    }
  }

  notifyListeners();
}

/**
 * Clear a specific batch
 */
export function clearBatch(batchId: string): void {
  store.batches.delete(batchId);
  if (store.activeBatchId === batchId) {
    store.activeBatchId = null;
  }
  notifyListeners();
}

/**
 * Get active batches (not completed/cancelled)
 */
export function getActiveBatches(): TransferBatch[] {
  return Array.from(store.batches.values()).filter(
    (b) => b.status === 'pending' || b.status === 'in-progress'
  );
}

/**
 * Get all batches for display
 */
export function getAllBatches(): TransferBatch[] {
  return Array.from(store.batches.values()).sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * Hook to subscribe to transfer store updates
 */
export function useFileTransferStore() {
  const batches = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const activeBatches = useCallback(() => {
    return Array.from(batches.values()).filter(
      (b) => b.status === 'pending' || b.status === 'in-progress'
    );
  }, [batches]);

  const allBatches = useCallback(() => {
    return Array.from(batches.values()).sort((a, b) => b.startedAt - a.startedAt);
  }, [batches]);

  const hasActiveTransfers = Array.from(batches.values()).some(
    (b) => b.status === 'pending' || b.status === 'in-progress'
  );

  return {
    batches,
    activeBatches,
    allBatches,
    hasActiveTransfers,
    startBatch,
    updateItemProgress,
    completeItem,
    failItem,
    cancelBatch,
    clearBatch,
    clearCompletedBatches,
  };
}
