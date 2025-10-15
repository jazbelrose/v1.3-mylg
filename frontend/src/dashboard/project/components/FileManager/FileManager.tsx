import { forwardRef, useCallback, useImperativeHandle, useMemo } from "react";
import Modal from "../../../../shared/ui/ModalWithStack";
import ConfirmModal from "@/shared/ui/ConfirmModal";
import { FileText, Download, Layout, Upload as UploadIcon, PenTool } from "lucide-react";
import { useData } from "@/app/contexts/useData";
import { useSocket } from "@/app/contexts/useSocket";
import styles from "./file-manager.module.css";
import FileManagerToolbar from "./FileManagerToolbar";
import FileManagerContent from "./FileManagerContent";
import FileManagerFooter from "./FileManagerFooter";
import FilePreviewModal from "./FilePreviewModal";
import { useFileManagerState } from "../Shared/hooks/useFileManagerState";
import { useFileMessenger } from "../Shared/hooks/useFileMessenger";
import { useFileTransfers } from "../Shared/hooks/useFileTransfers";
import type { Message } from "@/app/contexts/DataProvider";
import type { FileManagerProps, FileManagerRef, FolderOption } from "./FileManagerTypes";
import { apiFetch, EDIT_PROJECT_URL } from "@/shared/utils/api";
import { notify } from "@/shared/ui/ToastNotifications";

export type { FileManagerProps, FileManagerRef, FileItem } from "./FileManagerTypes";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

const SYSTEM_FOLDERS: FolderOption[] = [
  { key: "drawings", name: "Drawings" },
  { key: "invoices", name: "Documents" },
  { key: "downloads", name: "Downloads" },
];

const ROOT_FOLDER: FolderOption = { key: "uploads", name: "Project Files" };

const sanitizeFolderKey = (name: string, existingKeys: Set<string>): string => {
  const fallback = "folder";
  const cleaned = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-\s_]+/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const base = cleaned || fallback;
  let candidate = base;
  let counter = 2;

  while (existingKeys.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }

  return candidate;
};

const getFolderIcon = (key: string, size = 24) => {
  switch (key) {
    case "uploads":
      return <UploadIcon size={size} />;
    case "invoices":
      return <FileText size={size} />;
    case "downloads":
      return <Download size={size} />;
    case "floorplans":
      return <Layout size={size} />;
    default:
      return <PenTool size={size} />;
  }
};

const FileManagerComponent = forwardRef<FileManagerRef, FileManagerProps>(
  (
    {
      folder = "uploads",
      displayName,
      style,
      showTrigger = true,
      isOpen,
      onRequestClose,
    }: FileManagerProps,
    ref
  ) => {
    const {
      activeProject,
      user,
      isAdmin,
      isBuilder,
      isDesigner,
      projectMessages = {},
      setProjectMessages = () => {},
    } = useData();
    const { ws } = useSocket() || {};

    const canUpload = isAdmin || isBuilder || isDesigner || folder === "uploads";
    const canDelete = isAdmin || isBuilder || isDesigner;

    const state = useFileManagerState({
      folder,
      displayName,
      isOpen,
      onRequestClose,
      activeProject,
    });

    const {
      fileInputRef,
      scrollerRef,
      folderKey,
      setFolderKey,
      renderedName,
      setSelectedFiles,
      isFilesModalOpen,
      setFilesModalOpen,
      closeFilesModal,
      isImageModalOpen,
      selectedImage,
      currentIndex,
      selectedItems,
      setSelectedItems,
      isSelectMode,
      setIsSelectMode,
      toggleSelectMode,
      isConfirmingDelete,
      setIsConfirmingDelete,
      isDragging,
      setIsDragging,
      isLoading,
      setIsLoading,
      searchTerm,
      setSearchTerm,
      viewMode,
      toggleViewMode,
      layoutIconToUse,
      sortOption,
      setSortOption,
      filterOption,
      setFilterOption,
      filterOptionsList,
      displayedFiles,
      handleSelectionChange,
      handleSelectAll,
      isSelected,
      handleFileClick,
      closeImageModal,
      selectedFilesCount,
      localActiveProject,
      setLocalActiveProject,
      handleTouchStart,
      handleTouchMove,
      handleTouchEnd,
      sortOptionsList,
      customFolders,
      addCustomFolder,
    } = state;

    const { removeReferences } = useFileMessenger({
      activeProject: activeProject || {},
      localActiveProject,
      setLocalActiveProject,
      setProjectMessages,
      user,
      ws,
    });

    const folderDisplayList = useMemo(() => {
      const seen = new Set<string>();
      return [...SYSTEM_FOLDERS, ...customFolders].filter((folder) => {
        if (seen.has(folder.key)) return false;
        seen.add(folder.key);
        return true;
      });
    }, [customFolders]);

    const activeFolderName = useMemo(() => {
      if (folderKey === ROOT_FOLDER.key) return ROOT_FOLDER.name;
      return folderDisplayList.find((folder) => folder.key === folderKey)?.name || folderKey;
    }, [folderDisplayList, folderKey]);

    const canCreateFolder = canUpload;

    const {
      loadFiles,
      handleFileSelect,
      handleDragOver,
      handleDragLeave,
      handleDrop,
      handleBulkDownload,
      handleDelete,
      performDelete,
      handleDeleteSingle,
      handleDownloadSingle,
    } = useFileTransfers({
      activeProject: activeProject || {},
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
      projectMessages: projectMessages as Record<string, Message[]>,
      canDelete,
    });

    const handleCreateFolder = useCallback(async () => {
      if (typeof window === "undefined") return;
      const projectId = (activeProject?.projectId as string | undefined) ?? undefined;
      if (!projectId) {
        notify("error", "You need an active project to create folders.");
        return;
      }

      const inputName = window.prompt("New folder name", "");
      const trimmed = inputName?.trim();
      if (!trimmed) return;

      const existingKeys = new Set<string>([ROOT_FOLDER.key, ...folderDisplayList.map((folder) => folder.key)]);
      const folderKeyValue = sanitizeFolderKey(trimmed, existingKeys);
      const newFolder: FolderOption = { key: folderKeyValue, name: trimmed };
      const updatedCustomFolders = Array.from(
        new Map<string, FolderOption>([...customFolders, newFolder].map((folder) => [folder.key, folder])).values()
      );

      addCustomFolder(newFolder);
      setFolderKey(newFolder.key);
      setSelectedFiles([]);
      setSelectedItems(new Set());
      setIsSelectMode(false);

      try {
        await apiFetch(`${EDIT_PROJECT_URL}/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customFolders: updatedCustomFolders,
            [newFolder.key]: [],
          }),
        });
        notify("success", `Folder "${newFolder.name}" created.`);
      } catch (error) {
        console.error("Error creating folder", error);
        notify("error", "Unable to create folder. Please try again.");
      }
    }, [
      activeProject?.projectId,
      addCustomFolder,
      customFolders,
      folderDisplayList,
      setFolderKey,
      setSelectedFiles,
      setSelectedItems,
      setIsSelectMode,
    ]);

    const openFilesModal = useCallback(async () => {
      setFilesModalOpen(true);
      await loadFiles();
    }, [loadFiles, setFilesModalOpen]);

    useImperativeHandle(ref, () => ({
      open: openFilesModal,
      close: closeFilesModal,
    }));

    return (
      <>
        {showTrigger && (
          <div
            className={`dashboard-item files files-shared-style ${styles.fileManager}`}
            onClick={() => void openFilesModal()}
            style={style}
          >
            <div className={styles.fileManagerInner}>
              <span className={styles.icon}>{getFolderIcon(folderKey)}</span>
              <span>{renderedName}</span>
            </div>
            <span className={styles.arrow}>&gt;</span>
          </div>
        )}

        <Modal
          isOpen={isFilesModalOpen}
          onRequestClose={closeFilesModal}
          contentLabel="Files Modal"
          shouldCloseOnOverlayClick={!isConfirmingDelete}
          style={{ overlay: { pointerEvents: isConfirmingDelete ? "none" : "auto" } }}
          className={{
            base: styles.fileModalContent,
            afterOpen: styles.fileModalContentAfterOpen,
            beforeClose: styles.fileModalContentBeforeClose,
          }}
          overlayClassName={{
            base: styles.fileModalOverlay,
            afterOpen: styles.fileModalOverlayAfterOpen,
            beforeClose: styles.fileModalOverlayBeforeClose,
          }}
          closeTimeoutMS={300}
        >
          <FileManagerToolbar
            folderKey={folderKey}
            activeFolderName={activeFolderName}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            filterOption={filterOption}
            filterOptions={filterOptionsList}
            onFilterChange={setFilterOption}
            sortOption={sortOption}
            sortOptions={sortOptionsList}
            onSortChange={setSortOption}
            onToggleView={toggleViewMode}
            layoutIcon={layoutIconToUse}
            onClose={closeFilesModal}
            renderFolderIcon={getFolderIcon}
            onCreateFolder={handleCreateFolder}
            canCreateFolder={canCreateFolder}
          />

          <FileManagerContent
            scrollerRef={scrollerRef}
            isDragging={isDragging}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            isLoading={isLoading}
            displayedFiles={displayedFiles}
            isSelectMode={isSelectMode}
            onSelectAll={handleSelectAll}
            selectedItems={selectedItems}
            selectedFilesCount={selectedFilesCount}
            viewMode={viewMode}
            onFileClick={handleFileClick}
            onSelectionChange={handleSelectionChange}
            isSelected={isSelected}
            onDownloadSingle={handleDownloadSingle}
            onDeleteSingle={handleDeleteSingle}
            canDelete={canDelete}
            folderKey={folderKey}
            folders={folderDisplayList}
            onFolderOpen={setFolderKey}
            onBackToRoot={() => setFolderKey(ROOT_FOLDER.key)}
            renderFolderIcon={getFolderIcon}
          />

          <FileManagerFooter
            selectedFilesCount={selectedFilesCount}
            canUpload={canUpload}
            canDelete={canDelete}
            isSelectMode={isSelectMode}
            fileInputRef={fileInputRef}
            onFileSelect={handleFileSelect}
            onToggleSelectMode={toggleSelectMode}
            onBulkDownload={handleBulkDownload}
            onDeleteSelected={handleDelete}
            onCancelSelection={() => {
              setIsSelectMode(false);
              setSelectedItems(new Set());
            }}
          />
        </Modal>

        <ConfirmModal
          isOpen={isConfirmingDelete}
          onRequestClose={() => setIsConfirmingDelete(false)}
          onConfirm={performDelete}
          message="Are you sure you want to delete the selected files?"
          className={{
            base: styles.confirmContent,
            afterOpen: styles.confirmContentAfterOpen,
            beforeClose: styles.confirmContentBeforeClose,
          }}
          overlayClassName={{
            base: styles.confirmOverlay,
            afterOpen: styles.confirmOverlayAfterOpen,
            beforeClose: styles.confirmOverlayBeforeClose,
          }}
        />

        <FilePreviewModal
          isOpen={isImageModalOpen}
          onRequestClose={closeImageModal}
          displayedFiles={displayedFiles}
          currentIndex={currentIndex}
          selectedImage={selectedImage}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </>
    );
  }
);

FileManagerComponent.displayName = "FileManagerComponent";

export default FileManagerComponent;









