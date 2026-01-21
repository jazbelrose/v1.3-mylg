// FileManager Hooks
export { useLongPress } from './useLongPress';
export type { UseLongPressOptions, LongPressHandlers } from './useLongPress';

export { useSelectionStore, useIsSelected, useSelectionCount, useSelectedUrls } from './useSelectionStore';
export type { SelectionStore } from './useSelectionStore';

export { useFilesPerf, filesPerf } from './useFilesPerf';
export type { FilesPerf, PerfEntry } from './useFilesPerf';

export { useFileListCache } from './useFileListCache';

export { useScrollState } from './useScrollState';
export type { ScrollState, UseScrollStateOptions } from './useScrollState';

export { 
  useFileTransferStore,
  startBatch,
  updateItemProgress,
  completeItem,
  failItem,
  cancelBatch,
  clearBatch,
  clearCompletedBatches,
  getActiveBatches,
  getAllBatches,
} from './useFileTransferStore';
export type { 
  TransferType, 
  TransferStatus, 
  TransferItem, 
  TransferBatch,
} from './useFileTransferStore';