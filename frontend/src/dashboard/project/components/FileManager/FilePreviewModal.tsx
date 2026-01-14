import type React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload, faXmark } from "@fortawesome/free-solid-svg-icons";
import Modal from "../../../../shared/ui/ModalWithStack";
import { fileUrlsToKeys, getFileUrl } from "../../../../shared/utils/api";
import PDFPreview from "../Shared/PDFPreview";
import TextFileViewer from "../../../../shared/ui/TextFileViewer";
import type { FileItem } from "./FileManagerTypes";
import { getFilePreviewIcon, isPreviewableImage } from "./FileManagerUtils";
import styles from "./file-manager.module.css";

interface FilePreviewModalProps {
  isOpen: boolean;
  onRequestClose: () => void;
  projectId: string;
  canEdit: boolean;
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
  projectId,
  canEdit,
  displayedFiles,
  currentIndex,
  selectedImage,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: FilePreviewModalProps) => {
  const currentFile = currentIndex !== null ? displayedFiles[currentIndex] : undefined;
  const extension = currentFile?.fileName.split(".").pop()?.toLowerCase();
  const resolvedUrl = (() => {
    if (!selectedImage) return "";
    if (selectedImage.startsWith("blob:")) return selectedImage;
    const [decodedKey] = fileUrlsToKeys([selectedImage]);
    return decodedKey ? getFileUrl(decodedKey) : selectedImage;
  })();
  const downloadUrl = resolvedUrl;
  const isTextLike = Boolean(extension && ["txt", "md", "markdown", "json", "log", "csv"].includes(extension));

  const renderContent = () => {
    if (!currentFile) return null;
    if (isPreviewableImage(currentFile)) {
      return (
        <img
          src={resolvedUrl}
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
    if (isTextLike && selectedImage && projectId) {
      return (
        <TextFileViewer
          projectId={projectId}
          fileUrl={selectedImage}
          fileName={currentFile.fileName}
          canEdit={canEdit}
          showTitle={false}
          showDownloadLink={false}
        />
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
            <div className={styles.imageTopBarTitle} title={currentFile.fileName}>{currentFile.fileName}</div>
            {downloadUrl ? (
              <a href={downloadUrl} download className={styles.iconButton} aria-label="Download file">
                <FontAwesomeIcon icon={faDownload} />
              </a>
            ) : (
              <span />
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default FilePreviewModal;









