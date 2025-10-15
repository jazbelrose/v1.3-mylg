import React, { useState, useRef } from "react";
import Modal from "@/shared/ui/ModalWithStack";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faUpload, faDownload } from "@fortawesome/free-solid-svg-icons";
import templateFile from "@/dashboard/project/features/budget/budget-template/budget-dynamo-template.csv?url"
import styles from "./budget-file-modal.module.css";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

type BudgetFileModalProps = {
  isOpen: boolean;
  onRequestClose: () => void;
  onFileSelected?: (file: File) => void;
};

const BudgetFileModal: React.FC<BudgetFileModalProps> = ({
  isOpen,
  onRequestClose,
  onFileSelected,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = (file?: File) => {
    if (file && onFileSelected) {
      onFileSelected(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    handleFile(file);
    // reset so the same file can be selected again
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      contentLabel="Budget File Modal"
      closeTimeoutMS={300}
      className={{
        base: styles.modalContent,
        afterOpen: styles.modalContentAfterOpen,
        beforeClose: styles.modalContentBeforeClose,
      }}
      overlayClassName={{
        base: styles.modalOverlay,
        afterOpen: styles.modalOverlayAfterOpen,
        beforeClose: styles.modalOverlayBeforeClose,
      }}
    >
      <div className={styles.modalHeader}>
        <div className={styles.modalTitle}>Budget Files</div>
        <button
          className={styles.iconButton}
          onClick={onRequestClose}
          aria-label="Close"
          type="button"
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div
        className={`${styles.modalContentInner} ${isDragging ? styles.dragging : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
        }}
      >
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className={styles.hiddenInput}
        />
        <p>Click or drag your budget file here</p>
      </div>

      <div className={styles.modalFooter}>
        <a href={templateFile as string} download className={styles.iconButton}>
          <FontAwesomeIcon icon={faDownload} /> Template
        </a>
        <button
          className={styles.iconButton}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Upload"
          type="button"
        >
          <FontAwesomeIcon icon={faUpload} /> Upload
        </button>
      </div>
    </Modal>
  );
};

export default BudgetFileModal;











