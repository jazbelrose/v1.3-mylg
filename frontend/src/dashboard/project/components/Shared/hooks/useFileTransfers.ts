import { useCallback, useEffect, useMemo, useRef, startTransition } from "react";
import type React from "react";
import { uploadData, list } from "aws-amplify/storage";
import {
  EDIT_PROJECT_URL,
  ZIP_FILES_URL,
  apiFetch,
  fileUrlsToKeys,
  getFileUrl,
  normalizeFileUrl,
  projectFileDeleteUrl,
} from "../../../../../shared/utils/api";
import { deleteHqFiles } from "../../../../../hq/lib/hqApi";
import { notify, notifyLoading, updateNotification } from "../../../../../shared/ui/ToastNotifications";
import pLimit from "../../../../../shared/utils/pLimit";
import type { Message } from "../../../../../app/contexts/DataProvider";
import type { FileItem, Project } from "../../FileManager/FileManagerTypes";
import { getFileKind } from "../../FileManager/FileManagerUtils";
import { downloadViaAnchor } from "../../../../../shared/utils/download";
import { useFileListCache } from "../../FileManager/hooks/useFileListCache";
import { filesPerf } from "../../FileManager/hooks/useFilesPerf";
import { 
  processDroppedItems, 
  type DroppedFile,
  type FolderDropResult,
} from "../../FileManager/utils/folderDrop";
import {
  startBatch,
  updateItemProgress,
  completeItem,
  failItem,
  type TransferBatch,
} from "../../FileManager/hooks/useFileTransferStore";
import { useFileLifecycleIntegration } from "./useFileLifecycleIntegration";

interface UseFileTransfersParams {
  activeProject: Project;
  folderKey: string;
  selectedItems: Set<string>;
  setSelectedFiles: React.Dispatch<React.SetStateAction<FileItem[]>>;
  setSelectedItems: React.Dispatch<React.SetStateAction<Set<string>>>;
  setIsSelectMode: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoading: (value: boolean) => void;
  setIsConfirmingDelete: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDragging: (value: boolean) => void;
  setLocalActiveProject: React.Dispatch<React.SetStateAction<Project>>;
  removeReferences: (urls: string[], messages: Message[]) => Promise<void>;
  projectMessages: Record<string, Message[]>;
  canDelete: boolean;
  /** When provided, operates in org mode instead of project mode */
  orgId?: string;
  /** Callback to create a custom folder when dropping a folder at root (uploads) */
  onFolderDropAtRoot?: (folderName: string) => Promise<void>;
}

export const useFileTransfers = ({
  activeProject,
  folderKey,
  selectedItems,
  setSelectedFiles,
  setSelectedItems,
  setIsSelectMode,
  setIsLoading,
  setIsConfirmingDelete,
  setIsDragging,
  setLocalActiveProject,
  removeReferences,
  projectMessages,
  canDelete,
  orgId,
  onFolderDropAtRoot,
}: UseFileTransfersParams) => {
  // Determine if we're in org mode
  const isOrgMode = Boolean(orgId);
  
  // File lifecycle integration for tracking deletions
  const { trackFileDeletion } = useFileLifecycleIntegration();
  
  // Track drag enter/leave count to prevent flickering
  // (child elements trigger enter/leave events too)
  const dragCounterRef = useRef(0);
  const uploadQueue = useMemo(() => pLimit(3), []);
  const editQueue = useMemo(() => pLimit(1), []);
  const pendingUpdateRef = useRef<Array<{ fileName: string; url: string }> | null>(null);
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // File list cache for stale-while-revalidate
  const fileCache = useFileListCache();

  const normalizeFiles = useCallback((files: FileItem[] = []) => {
    return files.map((f) => ({
      ...f,
      lastModified: f.lastModified ? new Date(f.lastModified).getTime() : 0,
      kind: getFileKind(f.fileName),
    }));
  }, []);

  const updateFolderFiles = useCallback(
    (projectId: string, updatedFiles: Array<{ fileName: string; url: string }>) =>
      editQueue(async () => {
        const apiUrl = `${EDIT_PROJECT_URL}/${projectId}`;
        const payload: Record<string, unknown> = { [folderKey]: updatedFiles };
        await apiFetch(apiUrl, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }),
    [folderKey, editQueue]
  );

  const scheduleFolderUpdate = useCallback(
    (filesPayload: Array<{ fileName: string; url: string }>) => {
      if (folderKey === "uploads") return;
      pendingUpdateRef.current = filesPayload;

      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = setTimeout(() => {
        const pending = pendingUpdateRef.current;
        pendingUpdateRef.current = null;
        if (pending && activeProject?.projectId && !isOrgMode) {
          updateFolderFiles(activeProject.projectId as string, pending).catch((err: unknown) =>
            console.error("Error updating files:", err)
          );
        }
      }, 500);
    },
    [folderKey, activeProject?.projectId, updateFolderFiles, isOrgMode]
  );

  const fetchS3Files = useCallback(async (skipCache = false): Promise<FileItem[]> => {
    // In org mode, use orgId; otherwise use projectId
    const entityId = isOrgMode ? orgId : (activeProject?.projectId as string | undefined);
    if (!entityId) return [];
    
    const cacheKey = isOrgMode ? `org:${entityId}` : entityId;
    
    // Check cache first (unless skip requested)
    if (!skipCache) {
      const cached = fileCache.getCached(cacheKey, folderKey);
      if (cached && !fileCache.isStale(cacheKey, folderKey)) {
        filesPerf.mark('fetchS3Files:cache-hit', { entityId, folderKey, fileCount: cached.files.length });
        startTransition(() => {
          setSelectedFiles(cached.files);
        });
        setIsLoading(false);
        filesPerf.measure('fetchS3Files:cache-hit');
        return cached.files;
      }
      
      // Show cached data immediately while refreshing (stale-while-revalidate)
      if (cached) {
        startTransition(() => {
          setSelectedFiles(cached.files);
        });
        setIsLoading(false); // Don't show loading for background refresh
      }
    }
    
    filesPerf.mark('fetchS3Files:api-start', { entityId, folderKey });
    
    // Build S3 prefixes based on mode
    // For org mode, include both uploads and chat_uploads for backwards compatibility
    const prefixes = isOrgMode
      ? [`orgs/${entityId}/uploads/`, `orgs/${entityId}/chat_uploads/`]
      : folderKey === "uploads"
        ? ["uploads/", "lexical/", "chat_uploads/"].map((dir) => `projects/${entityId}/${dir}`)
        : [`projects/${entityId}/${folderKey}/`];

    try {
      setIsLoading(true);
      const lists = await Promise.all(prefixes.map((prefix) => list({ prefix, options: { accessLevel: "guest" } })));

      const files: FileItem[] = lists
        .flatMap((res: { items?: unknown[] }) => res?.items || [])
        .filter((item: unknown) => {
          const key = (item as { key?: string }).key;
          if (!key || key.endsWith("/")) return false;
          // Filter out auto-generated renditions (thumbnails and embeds)
          // These are stored in parallel folders like uploads_thumbnails/ and uploads_embed/
          if (/_thumbnails\/|_embed\//.test(key)) return false;
          return true;
        })
        .map((item: unknown) => {
          const key = (item as { key: string }).key;
          const name: string = key.split("/").pop()!;
          const fullKey = key.startsWith("public/") ? key : `public/${key}`;
          const url = getFileUrl(fullKey);
          return {
            fileName: name,
            url: normalizeFileUrl(url),
            key: fullKey,  // S3 key for file operations (move, rename, delete)
            lastModified: (item as { lastModified?: string | Date }).lastModified
              ? new Date((item as { lastModified?: string | Date }).lastModified!).getTime()
              : 0,
            kind: getFileKind(name),
          };
        });

      const merged = Array.from(new Map(files.map((f) => [f.url, f])).values());
      
      // Update cache
      fileCache.setCache(cacheKey, folderKey, merged);
      
      // Use startTransition to prevent blocking UI when processing large file lists
      startTransition(() => {
        setSelectedFiles(merged);
      });
      filesPerf.measure('fetchS3Files:api-start');
      filesPerf.mark('fetchS3Files:complete', { fileCount: merged.length });
      filesPerf.measure('fetchS3Files:complete');
      
      return merged;
    } catch (err) {
      console.error("Error listing S3 files:", err);
      notify("warning", "Could not load files from storage.");
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [activeProject?.projectId, folderKey, setIsLoading, setSelectedFiles, fileCache, isOrgMode, orgId]);

  const loadFiles = useCallback(async (forceRefresh = false) => {
    filesPerf.mark('loadFiles:start');
    const files = await fetchS3Files(forceRefresh);
    if (!files.length && !isOrgMode) {
      const rawFiles = (activeProject?.[folderKey] as FileItem[]) || [];
      const normalized = normalizeFiles(rawFiles);
      startTransition(() => {
        setSelectedFiles(normalized);
      });
      filesPerf.measure('loadFiles:start');
      return normalized;
    }
    filesPerf.measure('loadFiles:start');
    return files;
  }, [fetchS3Files, activeProject, folderKey, normalizeFiles, setSelectedFiles]);

  const initiateDownload = (url: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const getZippedFiles = useCallback(async (fileUrls: string[]): Promise<string> => {
    const fileKeys = fileUrlsToKeys(fileUrls);
    const response = await apiFetch<{ zipFileUrl: string }>(ZIP_FILES_URL, {
      method: "POST",
      body: JSON.stringify({ fileKeys }),
      headers: { "Content-Type": "application/json" },
    });
    return response.zipFileUrl;
  }, []);

  /**
   * Upload a single file to S3 with progress tracking
   * Uses pLimit queue for concurrent upload control
   * @param entityId - Project or org ID
   * @param file - File to upload
   * @param relativePath - Optional relative path for folder uploads (e.g., "subfolder/")
   * @param batchId - Optional batch ID for transfer status tracking
   */
  const uploadFileToS3 = useCallback(
    (entityId: string, file: File, relativePath?: string, batchId?: string) =>
      uploadQueue(async () => {
        // Build the S3 key with optional relative path for folder structure
        const pathPrefix = relativePath || '';
        const filename = isOrgMode
          ? `orgs/${entityId}/uploads/${pathPrefix}${file.name}`
          : `projects/${entityId}/${folderKey}/${pathPrefix}${file.name}`;
        
        const uploadTask = uploadData({
          key: filename,
          data: file,
          options: { 
            accessLevel: "guest",
            // Progress callback for real-time updates
            onProgress: (progress: { transferredBytes: number; totalBytes: number }) => {
              if (batchId && progress.totalBytes > 0) {
                const percent = Math.round((progress.transferredBytes / progress.totalBytes) * 100);
                // Use startTransition for non-blocking progress updates
                startTransition(() => {
                  updateItemProgress(batchId, file.name, percent, progress.transferredBytes);
                });
              }
            },
          },
        });

        await uploadTask.result;
        
        // Mark as complete in transfer store
        if (batchId) {
          completeItem(batchId, file.name);
        }

        const storageKey = filename.startsWith("public/") ? filename : `public/${filename}`;
        const fileUrl = getFileUrl(storageKey);
        return { fileName: file.name, url: normalizeFileUrl(fileUrl), relativePath: pathPrefix };
      }),
    [folderKey, uploadQueue, isOrgMode]
  );

  /**
   * Upload files with transfer status tracking
   * Supports both flat file lists and folder structures
   * Uses non-blocking updates for premium UX during large uploads
   */
  const uploadFiles = useCallback(
    async (files: File[], droppedFiles?: DroppedFile[], folderName?: string) => {
      // Use droppedFiles if provided (from folder drop), otherwise wrap regular files
      const filesToUpload: DroppedFile[] = droppedFiles || files.map(f => ({
        file: f,
        relativePath: '',
        fullPath: f.name,
      }));
      
      if (!filesToUpload.length) {
        return;
      }
      
      // In org mode, use orgId; otherwise use projectId
      const entityId = isOrgMode ? orgId : (activeProject?.projectId as string | undefined);
      if (!entityId) {
        notify("error", isOrgMode ? "Unable to determine the organization." : "Unable to determine the active project. Please refresh and try again.");
        return;
      }

      // Start batch in transfer store for status tracking
      // This provides immediate visual feedback
      const batchId = startBatch(
        'upload',
        filesToUpload.map(df => ({
          fileName: df.file.name,
          relativePath: df.relativePath,
          totalBytes: df.file.size,
        })),
        folderName
      );

      // Create placeholders with blob URLs for instant preview
      const placeholders: (FileItem | null)[] = filesToUpload.map((df) => ({
        fileName: df.relativePath ? `${df.relativePath}${df.file.name}` : df.file.name,
        url: URL.createObjectURL(df.file),
        lastModified: df.file.lastModified || Date.now(),
        kind: getFileKind(df.file.name),
        isUploading: true, // Mark as uploading for potential UI treatment
      }));

      // Add placeholders immediately using startTransition for non-blocking update
      startTransition(() => {
        setSelectedFiles((prev) => [...prev, ...(placeholders as FileItem[])]);
      });

      // Upload files concurrently (pLimit controls max concurrent uploads)
      await Promise.all(
        filesToUpload.map((df, idx) =>
          uploadFileToS3(entityId, df.file, df.relativePath, batchId)
            .then((info) => {
              const oldUrl = placeholders[idx]!.url;
              placeholders[idx]!.url = info.url;
              // Remove temporary uploading flag
              delete placeholders[idx]!.isUploading;
              // Update fileName to include path if it was a folder upload
              if (info.relativePath) {
                placeholders[idx]!.fileName = `${info.relativePath}${df.file.name}`;
              }
              if (oldUrl.startsWith("blob:")) URL.revokeObjectURL(oldUrl);
            })
            .catch((error) => {
              console.error("Upload failed:", error);
              failItem(batchId, df.file.name, error?.message || 'Upload failed');
              const oldUrl = placeholders[idx]?.url;
              if (oldUrl && oldUrl.startsWith("blob:")) URL.revokeObjectURL(oldUrl);
              placeholders[idx] = null;
            })
        )
      );

      const completed = placeholders.filter(Boolean) as FileItem[];

      // Use startTransition for final state update - non-blocking
      let finalFiles: FileItem[] = [];
      startTransition(() => {
        setSelectedFiles((prev) => {
          const names = new Set(placeholders.map((p) => p?.fileName).filter(Boolean) as string[]);
          finalFiles = [...prev.filter((f) => !names.has(f.fileName)), ...completed];
          return finalFiles;
        });
      });

      // Only update local project state in project mode
      if (!isOrgMode && folderKey !== "uploads") {
        startTransition(() => {
          setLocalActiveProject((prev: Project) => ({ ...prev, [folderKey]: finalFiles }));
        });
      }

      // Background task: update project API (don't block UI)
      if (!isOrgMode && folderKey !== "uploads") {
        const payload = finalFiles.map((f) => ({ fileName: f.fileName, url: f.url }));
        updateFolderFiles(entityId, payload).catch((error) => {
          console.error("Error updating file metadata:", error);
          // Don't show notification for background task failures
        });
      }
      
      // Invalidate cache so next open gets fresh data
      const cacheKey = isOrgMode ? `org:${entityId}` : entityId;
      fileCache.invalidate(cacheKey, folderKey);
      
      // Background refresh - use startTransition so it doesn't block
      startTransition(() => {
        fetchS3Files(true).catch(() => {/* ignore */});
      });
    },
    [
      activeProject.projectId,
      folderKey,
      setIsLoading,
      setLocalActiveProject,
      setSelectedFiles,
      updateFolderFiles,
      uploadFileToS3,
      fileCache,
      isOrgMode,
      orgId,
      fetchS3Files,
    ]
  );

  const handleFileSelect: React.ChangeEventHandler<HTMLInputElement> = useCallback(
    async (event) => {
      const files = Array.from(event.target.files || []);
      if (!files.length) {
        event.target.value = "";
        return;
      }
      
      // Check if this is a folder upload (webkitdirectory input)
      // Files from folder input have webkitRelativePath like "FolderName/SubFolder/file.jpg"
      const firstFile = files[0] as File & { webkitRelativePath?: string };
      const isFolderUpload = Boolean(firstFile?.webkitRelativePath && firstFile.webkitRelativePath.includes('/'));
      
      if (isFolderUpload) {
        // Extract folder name from the first file's relative path
        const folderName = firstFile.webkitRelativePath?.split('/')[0] || undefined;
        
        // Convert files to DroppedFile format with relative paths
        const droppedFiles: DroppedFile[] = files.map((file) => {
          const f = file as File & { webkitRelativePath?: string };
          const relativePath = f.webkitRelativePath || '';
          // relativePath is like "FolderName/SubFolder/file.jpg"
          // We want to keep the full path structure including the folder name
          const pathParts = relativePath.split('/');
          // Remove the filename to get just the folder path
          pathParts.pop();
          const folderPath = pathParts.length > 0 ? `${pathParts.join('/')}/` : '';
          
          return {
            file,
            relativePath: folderPath,
            fullPath: relativePath,
          };
        });
        
        await uploadFiles(files, droppedFiles, folderName);
      } else {
        await uploadFiles(files);
      }
      event.target.value = "";
    },
    [uploadFiles]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      // Set dragging state on dragover to keep it active
      setIsDragging(true);
    },
    [setIsDragging]
  );

  const handleDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragCounterRef.current++;
      if (dragCounterRef.current === 1) {
        setIsDragging(true);
      }
    },
    [setIsDragging]
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setIsDragging(false);
      }
    },
    [setIsDragging]
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      // Reset drag counter and state
      dragCounterRef.current = 0;
      setIsDragging(false);
      
      // Process dropped items - supports both files and folders
      try {
        const dropResult = await processDroppedItems(event.dataTransfer);
        
        if (dropResult.files.length === 0) {
          return;
        }
        
        if (dropResult.isFolderDrop) {
          // If dropping a folder at root ("uploads" or "All Files"), create a custom folder first
          if (folderKey === "uploads" && dropResult.folderName && onFolderDropAtRoot) {
            await onFolderDropAtRoot(dropResult.folderName);
          }
          
          // Folder drop - pass DroppedFile[] with relative paths preserved
          await uploadFiles(
            dropResult.files.map(df => df.file),
            dropResult.files,
            dropResult.folderName
          );
        } else {
          // Regular file drop
          await uploadFiles(dropResult.files.map(df => df.file));
        }
        
        if (folderKey === "uploads") {
          await fetchS3Files();
        }
      } catch (error) {
        console.error("Error processing dropped items:", error);
        notify("error", "Failed to process dropped items");
      }
    },
    [fetchS3Files, folderKey, setIsDragging, uploadFiles, onFolderDropAtRoot]
  );

  const handleBulkDownload = useCallback(async () => {
    const fileUrls = Array.from(selectedItems);
    if (fileUrls.length === 0) {
      notify("warning", "No files selected for download.");
      return;
    }
    const notificationId = notifyLoading("Preparing archive...");
    try {
      const zipFileUrl = await getZippedFiles(fileUrls);
      updateNotification(notificationId, "success", "Archive ready! Downloading now...");
      initiateDownload(zipFileUrl);
      setSelectedItems(new Set());
      setIsSelectMode(false);
    } catch (error) {
      console.error("Error during bulk download:", error);
      updateNotification(notificationId, "error", "Failed to prepare archive. Try again.");
    }
  }, [getZippedFiles, selectedItems, setIsSelectMode, setSelectedItems]);

  const handleDelete = useCallback(() => {
    if (!canDelete) {
      notify("error", "Only authorized users can delete files.");
      return;
    }
    setIsConfirmingDelete(true);
  }, [canDelete, setIsConfirmingDelete]);

  const performDelete = useCallback(async () => {
    const fileUrlsToDelete = Array.from(selectedItems);
    if (!fileUrlsToDelete.length) return;
    const fileKeysToDelete = fileUrlsToKeys(fileUrlsToDelete);
    
    console.log("[FileManager] performDelete:", {
      isOrgMode,
      orgId,
      projectId: activeProject?.projectId,
      fileUrlsToDelete,
      fileKeysToDelete,
    });
    
    // In org mode, we don't need a projectId
    if (!isOrgMode && !activeProject?.projectId) return;
    const projectId = activeProject?.projectId as string;
    setIsConfirmingDelete(false);

    // In project mode, remove message references
    if (!isOrgMode && projectId) {
      const messages = projectMessages[projectId] || [];
      await removeReferences(fileUrlsToDelete, messages);
    }

    const notificationId = notifyLoading("Deleting files...");
    try {
      // Use project delete endpoint (works for both - S3 keys are passed directly)
      // For org mode, the keys are already in orgs/{orgId}/uploads/ format
      if (!isOrgMode && projectId) {
        await apiFetch(projectFileDeleteUrl(projectId), {
          method: "POST",
          body: JSON.stringify({
            fileKeys: fileKeysToDelete,
          }),
          headers: { "Content-Type": "application/json" },
        });
      } else if (isOrgMode && orgId) {
        // Use the dedicated HQ files delete endpoint
        const deleteResponse = await deleteHqFiles(orgId, fileKeysToDelete);
        console.log("[FileManager] HQ delete response:", deleteResponse);
        
        // Check if delete actually succeeded
        if (!deleteResponse.ok || deleteResponse.errors?.length > 0) {
          console.error("[FileManager] HQ delete errors:", deleteResponse.errors);
          throw new Error(deleteResponse.errors?.[0]?.message || "Delete failed on server");
        }
      }

      let remaining: FileItem[] = [];
      setSelectedFiles((prev) => {
        remaining = prev.filter((u) => !fileUrlsToDelete.includes(u.url));
        return remaining;
      });

      // Only update project state in project mode
      if (!isOrgMode) {
        if (folderKey !== "uploads") {
          setLocalActiveProject((prev: Project) => ({ ...prev, [folderKey]: remaining }));
        }
        scheduleFolderUpdate(remaining.map((u) => ({ fileName: u.fileName, url: u.url })));
      }

      setSelectedItems(new Set());
      setIsSelectMode(false);
      updateNotification(notificationId, "success", "Files deleted successfully");
      
      // Invalidate cache so next open gets fresh data
      const entityId = isOrgMode ? `org:${orgId}` : projectId;
      fileCache.invalidate(entityId, folderKey);

      // Track deletion in File Lifecycle system (fire and forget)
      // This enables sync across users and proper file lifecycle management
      trackFileDeletion(fileKeysToDelete).catch((err) => {
        console.warn('[FileLifecycle] Failed to track deletion:', err);
      });

      // Note: We DON'T call fetchS3Files here because:
      // 1. Local state is already correct (we filtered out deleted files above)
      // 2. S3 is eventually consistent - might still return deleted files briefly
      // 3. Cache is invalidated so next time files are loaded they'll be fresh
    } catch (error) {
      console.error("Error during deletion:", error);
      updateNotification(notificationId, "error", "Failed to delete selected files. Please try again.");
    }
  }, [
    activeProject,
    folderKey,
    isOrgMode,
    orgId,
    projectMessages,
    removeReferences,
    scheduleFolderUpdate,
    selectedItems,
    setIsConfirmingDelete,
    setIsSelectMode,
    setLocalActiveProject,
    setSelectedFiles,
    setSelectedItems,
    fileCache,
    trackFileDeletion,
  ]);

  const handleDeleteSingle = useCallback(
    (url: string) => {
      setSelectedItems(new Set([url]));
      handleDelete();
    },
    [handleDelete, setSelectedItems]
  );

  const handleDownloadSingle = useCallback(async (file: FileItem) => {
    try {
      // Force blob for signed/cross-origin URLs for reliable download behavior
      await downloadViaAnchor(file.url, file.fileName, { forceBlob: true });
    } catch (err) {
      console.error("Download failed", err);
      notify("error", "Could not download file.");
    }
  }, []);

  /**
   * Download an entire folder as a ZIP
   * @param folderPrefix - The folder prefix to download (e.g., "MyFolder/")
   * @param folderDisplayName - Display name for notifications
   */
  const handleFolderDownload = useCallback(async (folderPrefix: string, folderDisplayName: string) => {
    const entityId = isOrgMode ? orgId : (activeProject?.projectId as string | undefined);
    if (!entityId) {
      notify("error", "Unable to determine the project.");
      return;
    }
    
    // Start a download batch for status tracking
    const batchId = startBatch('download', [{ fileName: folderDisplayName }], folderDisplayName);
    
    try {
      // Build the S3 prefix for the folder
      const s3Prefix = isOrgMode
        ? `orgs/${entityId}/uploads/${folderPrefix}`
        : `projects/${entityId}/${folderKey}/${folderPrefix}`;
      
      // List all files in the folder
      const result = await list({ prefix: s3Prefix, options: { accessLevel: "guest" } });
      const fileKeys = (result.items || [])
        .filter((item: { key?: string }) => item.key && !item.key.endsWith("/"))
        .map((item: { key: string }) => {
          const key = item.key;
          return key.startsWith("public/") ? key : `public/${key}`;
        });
      
      if (fileKeys.length === 0) {
        failItem(batchId, folderDisplayName, "Folder is empty");
        notify("warning", "Folder is empty.");
        return;
      }
      
      // Create zip and download
      const fileUrls = fileKeys.map((key: string) => getFileUrl(key));
      const zipFileUrl = await getZippedFiles(fileUrls);
      
      completeItem(batchId, folderDisplayName);
      initiateDownload(zipFileUrl);
    } catch (error) {
      console.error("Error downloading folder:", error);
      failItem(batchId, folderDisplayName, "Download failed");
      notify("error", "Failed to download folder.");
    }
  }, [activeProject?.projectId, folderKey, getZippedFiles, isOrgMode, orgId]);

  /**
   * Delete an entire folder and all its contents
   * @param folderPrefix - The folder prefix to delete (e.g., "MyFolder/")
   * @param folderDisplayName - Display name for notifications
   */
  const handleFolderDelete = useCallback(async (folderPrefix: string, folderDisplayName: string) => {
    if (!canDelete) {
      notify("error", "Only authorized users can delete files.");
      return;
    }
    
    const entityId = isOrgMode ? orgId : (activeProject?.projectId as string | undefined);
    if (!entityId) {
      notify("error", "Unable to determine the project.");
      return;
    }
    
    // Start a delete batch for status tracking
    const batchId = startBatch('delete', [{ fileName: folderDisplayName }], folderDisplayName);
    
    try {
      // Build the S3 prefix for the folder
      const s3Prefix = isOrgMode
        ? `orgs/${entityId}/uploads/${folderPrefix}`
        : `projects/${entityId}/${folderKey}/${folderPrefix}`;
      
      // List all files in the folder
      const result = await list({ prefix: s3Prefix, options: { accessLevel: "guest" } });
      const items = (result.items || []).filter((item: { key?: string }) => item.key && !item.key.endsWith("/"));
      
      if (items.length === 0) {
        completeItem(batchId, folderDisplayName);
        notify("info", "Folder was already empty.");
        return;
      }
      
      const fileKeys = items.map((item: { key: string }) => {
        const key = item.key;
        return key.startsWith("public/") ? key : `public/${key}`;
      });
      
      // Delete all files
      if (!isOrgMode) {
        await apiFetch(projectFileDeleteUrl(entityId), {
          method: "POST",
          body: JSON.stringify({ fileKeys }),
          headers: { "Content-Type": "application/json" },
        });
      } else {
        const deleteResponse = await deleteHqFiles(entityId, fileKeys);
        if (!deleteResponse.ok || deleteResponse.errors?.length > 0) {
          throw new Error(deleteResponse.errors?.[0]?.message || "Delete failed");
        }
      }
      
      // Update local state - remove files that match the folder prefix
      setSelectedFiles((prev) => {
        return prev.filter((f) => {
          // Check if file belongs to this folder
          const fileKey = f.key || f.url;
          return !fileKey.includes(folderPrefix);
        });
      });
      
      completeItem(batchId, folderDisplayName);
      notify("success", `Folder "${folderDisplayName}" deleted.`);
      
      // Invalidate cache
      const cacheKey = isOrgMode ? `org:${entityId}` : entityId;
      fileCache.invalidate(cacheKey, folderKey);
    } catch (error) {
      console.error("Error deleting folder:", error);
      failItem(batchId, folderDisplayName, "Delete failed");
      notify("error", "Failed to delete folder.");
    }
  }, [activeProject?.projectId, canDelete, fileCache, folderKey, isOrgMode, orgId, setSelectedFiles]);

  useEffect(
    () => () => {
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
    },
    []
  );

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  return {
    loadFiles,
    fetchS3Files,
    uploadFiles,
    handleFileSelect,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleBulkDownload,
    handleDelete,
    performDelete,
    handleDeleteSingle,
    handleDownloadSingle,
    handleFolderDownload,
    handleFolderDelete,
    /** Invalidate cache for a specific folder */
    invalidateCache: fileCache.invalidate,
  };
};

export type UseFileTransfersReturn = ReturnType<typeof useFileTransfers>;









