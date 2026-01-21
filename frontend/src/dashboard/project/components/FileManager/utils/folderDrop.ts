/**
 * Folder Drop Utilities
 * 
 * Handles extracting files from dropped folders using the File System Access API
 * (via webkitGetAsEntry) for recursive folder traversal.
 */

export interface DroppedFile {
  file: File;
  /** Relative path within the folder (e.g., "subfolder/file.txt") */
  relativePath: string;
  /** Full path from drop root (e.g., "MyFolder/subfolder/file.txt") */
  fullPath: string;
}

export interface FolderDropResult {
  /** All files extracted from the drop */
  files: DroppedFile[];
  /** If a folder was dropped, its name */
  folderName?: string;
  /** Total size in bytes */
  totalSize: number;
  /** Whether this was a folder drop (vs just files) */
  isFolderDrop: boolean;
}

/**
 * Read all entries from a FileSystemDirectoryEntry
 */
async function readAllDirectoryEntries(
  dirReader: FileSystemDirectoryReader
): Promise<FileSystemEntry[]> {
  const entries: FileSystemEntry[] = [];
  
  // readEntries returns batches of entries, need to call repeatedly until empty
  let batch: FileSystemEntry[] = [];
  do {
    batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      dirReader.readEntries(resolve, reject);
    });
    entries.push(...batch);
  } while (batch.length > 0);
  
  return entries;
}

/**
 * Recursively read a directory entry and extract all files
 */
async function readDirectoryEntry(
  entry: FileSystemDirectoryEntry,
  path: string = ''
): Promise<DroppedFile[]> {
  const dirReader = entry.createReader();
  const entries = await readAllDirectoryEntries(dirReader);
  const files: DroppedFile[] = [];
  
  for (const childEntry of entries) {
    const childPath = path ? `${path}/${childEntry.name}` : childEntry.name;
    
    if (childEntry.isFile) {
      const fileEntry = childEntry as FileSystemFileEntry;
      try {
        const file = await new Promise<File>((resolve, reject) => {
          fileEntry.file(resolve, reject);
        });
        files.push({
          file,
          relativePath: path ? `${path}/` : '',
          fullPath: childPath,
        });
      } catch (err) {
        console.warn(`Could not read file: ${childPath}`, err);
      }
    } else if (childEntry.isDirectory) {
      const subFiles = await readDirectoryEntry(
        childEntry as FileSystemDirectoryEntry,
        childPath
      );
      files.push(...subFiles);
    }
  }
  
  return files;
}

/**
 * Read a file entry
 */
async function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

/**
 * Process a DataTransfer from a drop event and extract all files,
 * including files inside dropped folders.
 * 
 * @param dataTransfer - The DataTransfer object from the drop event
 * @returns Promise<FolderDropResult> - All extracted files with metadata
 */
export async function processDroppedItems(
  dataTransfer: DataTransfer
): Promise<FolderDropResult> {
  const items = dataTransfer.items;
  const files: DroppedFile[] = [];
  let folderName: string | undefined;
  let isFolderDrop = false;
  
  // Check if webkitGetAsEntry is supported
  const hasFileSystemAPI = items.length > 0 && 'webkitGetAsEntry' in items[0];
  
  if (!hasFileSystemAPI) {
    // Fallback: just use files directly (no folder support)
    const droppedFiles = Array.from(dataTransfer.files);
    return {
      files: droppedFiles.map((file) => ({
        file,
        relativePath: '',
        fullPath: file.name,
      })),
      totalSize: droppedFiles.reduce((sum, f) => sum + f.size, 0),
      isFolderDrop: false,
    };
  }
  
  // Process each item using File System API
  const promises: Promise<void>[] = [];
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== 'file') continue;
    
    const entry = item.webkitGetAsEntry?.();
    if (!entry) continue;
    
    if (entry.isDirectory) {
      isFolderDrop = true;
      // If dropping a single folder, capture its name
      if (items.length === 1) {
        folderName = entry.name;
      }
      
      promises.push(
        readDirectoryEntry(entry as FileSystemDirectoryEntry, entry.name)
          .then((dirFiles) => {
            files.push(...dirFiles);
          })
          .catch((err) => {
            console.error(`Error reading directory ${entry.name}:`, err);
          })
      );
    } else if (entry.isFile) {
      promises.push(
        readFileEntry(entry as FileSystemFileEntry)
          .then((file) => {
            files.push({
              file,
              relativePath: '',
              fullPath: file.name,
            });
          })
          .catch((err) => {
            console.error(`Error reading file ${entry.name}:`, err);
          })
      );
    }
  }
  
  await Promise.all(promises);
  
  const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);
  
  return {
    files,
    folderName,
    totalSize,
    isFolderDrop,
  };
}

/**
 * Check if a drop event contains folders
 */
export function hasDroppedFolders(dataTransfer: DataTransfer): boolean {
  const items = dataTransfer.items;
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== 'file') continue;
    
    const entry = item.webkitGetAsEntry?.();
    if (entry?.isDirectory) {
      return true;
    }
  }
  
  return false;
}

/**
 * Format bytes to human-readable size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}
