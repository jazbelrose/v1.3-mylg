import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

import styles from "./invoice-preview-modal.module.css";

interface InvoiceModalHeaderProps {
  onClose: () => void;
}

const InvoiceModalHeader: React.FC<InvoiceModalHeaderProps> = ({ onClose }) => (
  <div className={styles.modalHeader}>
    <div className={styles.modalTitle}>Invoice Preview</div>
    <button
      className={styles.iconButton}
      onClick={onClose}
      aria-label="Close"
    >
      <FontAwesomeIcon icon={faXmark} />
    </button>
  </div>
);

export default InvoiceModalHeader;
