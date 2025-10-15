import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faDownload, faTrash } from "@fortawesome/free-solid-svg-icons";
import { Upload } from "lucide-react";
import Spinner from "../../../../shared/ui/Spinner";
import type { FileItem, FolderOption, ViewMode } from "./FileManagerTypes";
import {
  getFilePreviewIcon,
  getThumbnailUrl,
  isPreviewableImage,
  truncateFileName,
} from "./FileManagerUtils";
import styles from "./file-manager.module.css";

interface FileManagerContentProps {
  scrollerRef: React.RefObject<HTMLDivElement>;
  isDragging: boolean;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  isLoading: boolean;
  displayedFiles: FileItem[];
  isSelectMode: boolean;
  onSelectAll: () => void;
  selectedItems: Set<string>;
  selectedFilesCount: number;
  viewMode: ViewMode;
  onFileClick: (file: FileItem, index: number) => void;
  onSelectionChange: (url: string) => void;
  isSelected: (url: string) => boolean;
  onDownloadSingle: (url: string) => void;
  onDeleteSingle: (url: string) => void;
  canDelete: boolean;
  folderKey: string;
  folders: FolderOption[];
  onFolderOpen: (key: string) => void;
  onBackToRoot: () => void;
  renderFolderIcon: (key: string, size?: number) => React.ReactNode;
}

const renderPreview = (file: FileItem, folderKey: string) => {
  const extension = file.fileName.split(".").pop()?.toLowerCase();
  if (isPreviewableImage(file)) {
    const thumbUrl = getThumbnailUrl(file.url, folderKey);
    return (
      <img
        src={thumbUrl}
        alt={file.fileName}
        className={styles.previewImage}
        onError={(e) => {
          (e.target as HTMLImageElement).src = file.url;
        }}
        loading="lazy"
      />
    );
  }

  const icon = getFilePreviewIcon(extension);
  return icon ?? null;
};

export const FileManagerContent = ({
  scrollerRef,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  isLoading,
  displayedFiles,
  isSelectMode,
  onSelectAll,
  selectedItems,
  selectedFilesCount,
  viewMode,
  onFileClick,
  onSelectionChange,
  isSelected,
  onDownloadSingle,
  onDeleteSingle,
  canDelete,
  folderKey,
  folders,
  onFolderOpen,
  onBackToRoot,
  renderFolderIcon,
}: FileManagerContentProps) => {
  return (
    <div
      ref={scrollerRef}
      className={`${styles.modalContentInner} ${isDragging ? styles.dragging : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragging && <div className={styles.dragOverlay}>Drop files to upload</div>}

      <div className={styles.folderSection}>
        <div className={styles.folderSectionHeader}>
          <h3>Folders</h3>
          {folderKey !== "uploads" && (
            <button className={styles.secondaryButton} onClick={onBackToRoot} type="button">
              Back to Project Files
            </button>
          )}
        </div>
        {folders.length === 0 ? (
          <div className={styles.emptyFoldersMessage}>No additional folders yet.</div>
        ) : (
          <div className={styles.folderGrid}>
            {folders.map((folder) => (
              <button
                type="button"
                key={folder.key}
                className={`${styles.folderTile} ${folderKey === folder.key ? styles.activeFolderTile : ""}`}
                onClick={() => onFolderOpen(folder.key)}
              >
                <span className={styles.folderIcon}>{renderFolderIcon(folder.key, 24)}</span>
                <span className={styles.folderLabel}>{folder.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading && (
        <div className={styles.loadingOverlay}>
          <Spinner style={{ position: "static" }} />
          <div className={styles.loadingMessage}>Loading files…</div>
        </div>
      )}

      {displayedFiles.length === 0 && !isLoading ? (
        <div className={styles.emptyMessage}>
          <Upload size={48} />
          <span>No files yet.</span>
        </div>
      ) : (
        <>
          {isSelectMode && (
            <div>
              <input
                type="checkbox"
                checked={selectedItems.size === selectedFilesCount && selectedFilesCount > 0}
                onChange={onSelectAll}
              />{" "}
              Select All
            </div>
          )}

          {viewMode === "grid" ? (
            <ul className={styles.fileGrid}>
              {displayedFiles.map((file, index) => (
                <li key={file.url} className={styles.fileItem}>
                  <div
                    onClick={() => {
                      if (isSelectMode) onSelectionChange(file.url);
                      else onFileClick(file, index);
                    }}
                    className={`${styles.filePreview} ${isSelectMode ? styles.clickable : ""}`}
                  >
                    {renderPreview(file, folderKey)}

                    {isSelectMode && (
                      <div className={`${styles.selectionOverlay} ${isSelected(file.url) ? styles.selected : ""}`}>
                        {isSelected(file.url) && (
                          <FontAwesomeIcon icon={faCheck} className={styles.checkIcon} />
                        )}
                      </div>
                    )}
                  </div>
                  <div className={styles.fileName} title={file.fileName}>
                    {truncateFileName(file.fileName)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <table className={styles.fileTable}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedFiles.map((file, index) => (
                  <tr key={file.url}>
                    <td onClick={() => onFileClick(file, index)}>{file.fileName}</td>
                    <td>
                      <button
                        className={styles.iconButton}
                        onClick={() => onDownloadSingle(file.url)}
                        aria-label="Download file"
                      >
                        <FontAwesomeIcon icon={faDownload} />
                      </button>
                      {canDelete && (
                        <button
                          className={styles.iconButton}
                          onClick={() => onDeleteSingle(file.url)}
                          aria-label="Delete file"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
};

export default FileManagerContent;









