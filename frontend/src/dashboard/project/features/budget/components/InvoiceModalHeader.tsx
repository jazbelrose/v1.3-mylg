import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

import styles from "./invoice-preview-modal.module.css";
import type { InvoicePreviewModalProps } from "./invoicePreviewTypes";

interface InvoiceModalHeaderProps {
  onClose: () => void;
  revision?: InvoicePreviewModalProps["revision"];
}

const normalizeRevisionName = (revision?: InvoicePreviewModalProps["revision"]): string | null => {
  if (!revision) return null;

  // BudgetHeader uses revisionName as the primary property
  const revisionName = (revision as { revisionName?: string | null }).revisionName;
  if (typeof revisionName === "string" && revisionName.trim().length > 0) {
    return revisionName.trim();
  }

  return null;
};

const getRevisionNumber = (revision?: InvoicePreviewModalProps["revision"]): number | null => {
  if (!revision) return null;

  // BudgetHeader uses clientRevisionId as the display number
  // Fall back to revision for internal tracking
  const clientRevisionId = (revision as { clientRevisionId?: number | null }).clientRevisionId;
  if (typeof clientRevisionId === "number") {
    return clientRevisionId;
  }

  const revisionNum = (revision as { revision?: number | null }).revision;
  if (typeof revisionNum === "number") {
    return revisionNum;
  }

  return null;
};

const buildModalTitle = (revision?: InvoicePreviewModalProps["revision"]): string => {
  const revisionNumber = getRevisionNumber(revision);
  const revisionName = normalizeRevisionName(revision);

  if (!revisionNumber && !revisionName) {
    return "Invoice Preview";
  }

  const labelParts = [] as string[];

  if (revisionNumber != null) {
    labelParts.push(`Rev ${revisionNumber}`);
  }

  if (revisionName) {
    labelParts.push(revisionName);
  }

  return `Invoice Preview · ${labelParts.join(" – ")}`;
};

const InvoiceModalHeader: React.FC<InvoiceModalHeaderProps> = ({ onClose, revision }) => (
  <div className={styles.modalHeader}>
    <div className={styles.modalTitle}>{buildModalTitle(revision)}</div>
    <button className={styles.iconButton} onClick={onClose} aria-label="Close">
      <FontAwesomeIcon icon={faXmark} />
    </button>
  </div>
);

export default InvoiceModalHeader;
