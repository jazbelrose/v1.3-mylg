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
}: UseFileTransfersParams) => {
  // Determine if we're in org mode
  const isOrgMode = Boolean(orgId);
  
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
    const prefixes = isOrgMode
      ? [`orgs/${entityId}/uploads/`]
      : folderKey === "uploads"
        ? ["uploads/", "lexical/", "chat_uploads/"].map((dir) => `projects/${entityId}/${dir}`)
        : [`projects/${entityId}/${folderKey}/`];

    try {
      setIsLoading(true);
      const lists = await Promise.all(prefixes.map((prefix) => list({ prefix, options: { accessLevel: "guest" } })));

      const files: FileItem[] = lists
        .flatMap((res: { items?: unknown[] }) => res?.items || [])
        .filter((item: unknown) => (item as { key?: string }).key && !(item as { key?: string }).key!.endsWith("/"))
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

  const uploadFileToS3 = useCallback(
    (entityId: string, file: File) =>
      uploadQueue(async () => {
        // In org mode, use orgs/ prefix; otherwise use projects/ prefix
        const filename = isOrgMode
          ? `orgs/${entityId}/uploads/${file.name}`
          : `projects/${entityId}/${folderKey}/${file.name}`;
        const uploadTask = uploadData({
          key: filename,
          data: file,
          options: { accessLevel: "guest" },
        });

        await uploadTask.result;

        const storageKey = filename.startsWith("public/") ? filename : `public/${filename}`;
        const fileUrl = getFileUrl(storageKey);
        return { fileName: file.name, url: normalizeFileUrl(fileUrl) };
      }),
    [folderKey, uploadQueue, isOrgMode]
  );

  const uploadFiles = useCallback(
    async (files: File[]) => {
      setIsLoading(true);
      if (!files.length) {
        setIsLoading(false);
        return;
      }
      // In org mode, use orgId; otherwise use projectId
      const entityId = isOrgMode ? orgId : (activeProject?.projectId as string | undefined);
      if (!entityId) {
        notify("error", isOrgMode ? "Unable to determine the organization." : "Unable to determine the active project. Please refresh and try again.");
        setIsLoading(false);
        return;
      }

      const notificationId = notifyLoading("Uploading files...");

      const placeholders: (FileItem | null)[] = files.map((file) => ({
        fileName: file.name,
        url: URL.createObjectURL(file),
        lastModified: file.lastModified || Date.now(),
        kind: getFileKind(file.name),
      }));

      setSelectedFiles((prev) => [...prev, ...(placeholders as FileItem[])]);

      await Promise.all(
        files.map((file, idx) =>
          uploadFileToS3(entityId, file)
            .then((info) => {
              const oldUrl = placeholders[idx]!.url;
              placeholders[idx]!.url = info.url;
              if (oldUrl.startsWith("blob:")) URL.revokeObjectURL(oldUrl);
            })
            .catch((error) => {
              console.error("Upload failed:", error);
              notify("error", `Upload failed for ${file.name}`);
              const oldUrl = placeholders[idx]?.url;
              if (oldUrl && oldUrl.startsWith("blob:")) URL.revokeObjectURL(oldUrl);
              placeholders[idx] = null;
            })
        )
      );

      const completed = placeholders.filter(Boolean) as FileItem[];

      let finalFiles: FileItem[] = [];
      setSelectedFiles((prev) => {
        const names = new Set(placeholders.map((p) => p?.fileName).filter(Boolean) as string[]);
        finalFiles = [...prev.filter((f) => !names.has(f.fileName)), ...completed];
        return finalFiles;
      });

      // Only update local project state in project mode
      if (!isOrgMode && folderKey !== "uploads") {
        setLocalActiveProject((prev: Project) => ({ ...prev, [folderKey]: finalFiles }));
      }

      updateNotification(notificationId, "success", "Files uploaded successfully");

      // Only update project API in project mode
      if (!isOrgMode && folderKey !== "uploads") {
        const payload = finalFiles.map((f) => ({ fileName: f.fileName, url: f.url }));
        try {
          await updateFolderFiles(entityId, payload);
        } catch (error) {
          console.error("Error updating file metadata:", error);
          notify("warning", "Files uploaded but metadata update failed");
        }
      }
      
      // Invalidate cache so next open gets fresh data
      const cacheKey = isOrgMode ? `org:${entityId}` : entityId;
      fileCache.invalidate(cacheKey, folderKey);
      
      setIsLoading(false);
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
    ]
  );

  const handleFileSelect: React.ChangeEventHandler<HTMLInputElement> = useCallback(
    async (event) => {
      const files = Array.from(event.target.files || []);
      await uploadFiles(files);
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
      const files = Array.from(event.dataTransfer.files || []);
      await uploadFiles(files);
      if (folderKey === "uploads") {
        await fetchS3Files();
      }
    },
    [fetchS3Files, folderKey, setIsDragging, uploadFiles]
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
        await deleteHqFiles(orgId, fileKeysToDelete);
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
  };
};

export type UseFileTransfersReturn = ReturnType<typeof useFileTransfers>;









