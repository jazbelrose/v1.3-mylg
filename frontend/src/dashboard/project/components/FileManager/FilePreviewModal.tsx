import type React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload, faXmark } from "@fortawesome/free-solid-svg-icons";
import Modal from "../../../../shared/ui/ModalWithStack";
import { fileUrlsToKeys, getFileUrl } from "../../../../shared/utils/api";
import PDFPreview from "../Shared/PDFPreview";
import type { FileItem } from "./FileManagerTypes";
import { getFilePreviewIcon, isPreviewableImage } from "./FileManagerUtils";
import styles from "./file-manager.module.css";

interface FilePreviewModalProps {
  isOpen: boolean;
  onRequestClose: () => void;
  displayedFiles: FileItem[];
  currentIndex: number | null;
  selectedImage: string | null;
  onTouchStart: (event: React.TouchEvent) => void;
  onTouchMove: (event: React.TouchEvent) => void;
  onTouchEnd: () => void;
}

export const FilePreviewModal = ({
  isOpen,
  onRequestClose,
  displayedFiles,
  currentIndex,
  selectedImage,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: FilePreviewModalProps) => {
  const currentFile = currentIndex !== null ? displayedFiles[currentIndex] : undefined;
  const extension = currentFile?.fileName.split(".").pop()?.toLowerCase();
  const downloadUrl = selectedImage ? getFileUrl(fileUrlsToKeys([selectedImage])[0]) : "";

  const renderContent = () => {
    if (!currentFile) return null;
    if (isPreviewableImage(currentFile)) {
      return (
        <img
          src={selectedImage ? getFileUrl(fileUrlsToKeys([selectedImage])[0]) : ""}
          alt="Selected"
          onError={(e) => {
            (e.target as HTMLImageElement).src = selectedImage || "";
          }}
          className={styles.fullImage}
        />
      );
    }
    if (extension === "pdf") {
      return (
        <PDFPreview url={selectedImage ?? ""} className={styles.pdfPreview} title={currentFile.fileName} />
      );
    }
    return (
      <div className={styles.filePlaceholder}>
        <div className={styles.placeholderIcon}>{getFilePreviewIcon(extension)}</div>
        <div className={styles.imageInfo}>{currentFile.fileName}</div>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      contentLabel="Image Preview Modal"
      className={{
        base: styles.imageModalContent,
        afterOpen: styles.imageModalContentAfterOpen,
        beforeClose: styles.imageModalContentBeforeClose,
      }}
      overlayClassName={{
        base: styles.imageModalOverlay,
        afterOpen: styles.imageModalOverlayAfterOpen,
        beforeClose: styles.imageModalOverlayBeforeClose,
      }}
      closeTimeoutMS={300}
    >
      {selectedImage && currentFile && (
        <div className={styles.imageWrapper} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          {renderContent()}

          <div className={styles.imageTopBar}>
            <button onClick={onRequestClose} className={styles.iconButton} aria-label="Close image">
              <FontAwesomeIcon icon={faXmark} />
            </button>
            <a href={downloadUrl} download className={styles.iconButton} aria-label="Download image">
              <FontAwesomeIcon icon={faDownload} />
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default FilePreviewModal;









