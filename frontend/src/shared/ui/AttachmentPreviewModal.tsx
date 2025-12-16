import React from "react";
import { createPortal } from "react-dom";

import styles from "./attachment-preview-modal.module.css";
import PDFPreview from "@/dashboard/project/components/Shared/PDFPreview";

export type AttachmentPreviewItem = {
  id?: string;
  fileName: string;
  url: string;
  mimeType?: string;
};

function isPdfAttachment(attachment: AttachmentPreviewItem | null | undefined): boolean {
  if (!attachment) return false;
  const normalizedMime = (attachment.mimeType || "").toLowerCase();
  if (normalizedMime === "application/pdf") return true;
  const extension = attachment.fileName.split(".").pop()?.toLowerCase();
  return extension === "pdf";
}

interface AttachmentPreviewModalProps {
  attachment: AttachmentPreviewItem | null;
  isOpen: boolean;
  onRequestClose: () => void;
}

const AttachmentPreviewModal: React.FC<AttachmentPreviewModalProps> = ({
  attachment,
  isOpen,
  onRequestClose,
}) => {
  if (!isOpen || !attachment) return null;
  const previewTitle = attachment.fileName;
  const isPdf = isPdfAttachment(attachment);

  return createPortal(
    <div className={styles.overlay} role="presentation" onClick={onRequestClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={`Preview ${previewTitle}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.title}>{previewTitle}</p>
            <p className={styles.subtitle}>{isPdf ? "PDF preview" : "Image preview"}</p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Close preview"
            onClick={onRequestClose}
          >
            &times;
          </button>
        </header>
        <div className={styles.preview}>
          {isPdf ? (
            <PDFPreview
              url={attachment.url}
              className={styles.pdfPreview}
              title={previewTitle}
            />
          ) : (
            <img src={attachment.url} alt={previewTitle} className={styles.image} />
          )}
        </div>
        <div className={styles.actions}>
          <a
            className={styles.downloadButton}
            href={attachment.url}
            download={attachment.fileName}
            target="_blank"
            rel="noreferrer"
          >
            Download file
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default AttachmentPreviewModal;
