import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEye,
  faFilePdf,
  faPenToSquare,
  faSave,
} from "@fortawesome/free-solid-svg-icons";

import styles from "./invoice-preview-modal.module.css";

interface InvoiceFileActionsProps {
  fileName: string;
  allowSave: boolean;
  onSave: () => void;
  onSavePdf: () => void;
  onPreviewPdf: () => void;
  onToggleEditing: () => void;
  isEditing: boolean;
}

const InvoiceFileActions: React.FC<InvoiceFileActionsProps> = ({
  fileName,
  allowSave,
  onSave,
  onSavePdf,
  onPreviewPdf,
  onToggleEditing,
  isEditing,
}) => (
  <div className={styles.currentFileRow}>
    <div className={styles.fileName}>{fileName || "Unsaved Invoice"}</div>
    <div className={styles.buttonGroup}>
      <button
        className={styles.iconButton}
        onClick={onToggleEditing}
        aria-label={isEditing ? "Hide editing overlay" : "Show editing overlay"}
      >
        <FontAwesomeIcon icon={faPenToSquare} />
      </button>
      {allowSave && (
        <button
          className={styles.iconButton}
          onClick={onSave}
          aria-label="Save invoice"
        >
          <FontAwesomeIcon icon={faSave} />
        </button>
      )}
      <button
        className={styles.iconButton}
        onClick={onSavePdf}
        aria-label="Save PDF"
      >
        <FontAwesomeIcon icon={faFilePdf} />
      </button>
      <button
        className={styles.iconButton}
        onClick={onPreviewPdf}
        aria-label="Preview PDF"
      >
        <FontAwesomeIcon icon={faEye} />
      </button>
    </div>
  </div>
);

export default InvoiceFileActions;
