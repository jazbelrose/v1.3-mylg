import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDownload,
  faFilePdf,
  faSave,
} from "@fortawesome/free-solid-svg-icons";

import styles from "./invoice-preview-modal.module.css";

interface InvoiceFileActionsProps {
  fileName: string;
  allowSave: boolean;
  onSave: () => void;
  onExportPdf: () => void;
  onExportHtml: () => void;
}

const InvoiceFileActions: React.FC<InvoiceFileActionsProps> = ({
  fileName,
  allowSave,
  onSave,
  onExportPdf,
  onExportHtml,
}) => (
  <div className={styles.currentFileRow}>
    <div className={styles.fileName}>{fileName || "Unsaved Invoice"}</div>
    <div className={styles.buttonGroup}>
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
        onClick={onExportPdf}
        aria-label="Download PDF"
      >
        <FontAwesomeIcon icon={faFilePdf} />
      </button>
      <button
        className={styles.iconButton}
        onClick={onExportHtml}
        aria-label="Download HTML"
      >
        <FontAwesomeIcon icon={faDownload} />
      </button>
    </div>
  </div>
);

export default InvoiceFileActions;
