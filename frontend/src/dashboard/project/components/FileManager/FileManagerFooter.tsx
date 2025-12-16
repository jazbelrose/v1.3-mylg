import type React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faDownload, faTrash, faUpload, faXmark } from "@fortawesome/free-solid-svg-icons";
import styles from "./file-manager.module.css";

interface FileManagerFooterProps {
  selectedFilesCount: number;
  canUpload: boolean;
  canDelete: boolean;
  isSelectMode: boolean;
  selectionMode?: 'none' | 'single' | 'multi';
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileSelect: React.ChangeEventHandler<HTMLInputElement>;
  onToggleSelectMode: () => void;
  onConfirmSelection?: () => void;
  onBulkDownload: () => void;
  onDeleteSelected: () => void;
  onCancelSelection: () => void;
}

export const FileManagerFooter = ({
  selectedFilesCount,
  canUpload,
  canDelete,
  isSelectMode,
  selectionMode,
  fileInputRef,
  onFileSelect,
  onToggleSelectMode,
  onConfirmSelection,
  onBulkDownload,
  onDeleteSelected,
  onCancelSelection,
}: FileManagerFooterProps) => {
  const renderUploadControl = () =>
    canUpload ? (
      <>
        <input
          type="file"
          multiple
          onChange={onFileSelect}
          ref={fileInputRef}
          className={styles.hiddenInput}
        />
        <button
          className={styles.iconButton}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Upload files"
        >
          <FontAwesomeIcon icon={faUpload} /> Upload
        </button>
      </>
    ) : null;

  return (
    <div className={styles.modalFooter}>
      {selectedFilesCount === 0 ? (
        <>{renderUploadControl()}</>
      ) : isSelectMode ? (
        <>
          <button className={styles.iconButton} onClick={onBulkDownload} aria-label="Download selected">
            <FontAwesomeIcon icon={faDownload} />
          </button>
          {canDelete && (
            <button className={styles.iconButton} onClick={onDeleteSelected} aria-label="Delete selected">
              <FontAwesomeIcon icon={faTrash} />
            </button>
          )}
          <button className={styles.iconButton} onClick={onCancelSelection} aria-label="Cancel selection">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </>
      ) : (
        <>
          {selectionMode !== 'multi' && (
            <button className={styles.iconButton} onClick={onToggleSelectMode} aria-label="Select files">
              <FontAwesomeIcon icon={faCheck} /> Select
            </button>
          )}
          {renderUploadControl()}
        </>
      )}
    </div>
  );
};

export default FileManagerFooter;









