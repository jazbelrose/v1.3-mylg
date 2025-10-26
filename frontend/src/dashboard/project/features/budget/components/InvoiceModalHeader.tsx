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

  const possibleNames = [
    (revision as { revisionName?: string | null }).revisionName,
    (revision as { name?: string | null }).name,
    (revision as { title?: string | null }).title,
  ];

  const normalized = possibleNames
    .map((candidate) => (typeof candidate === "string" ? candidate.trim() : ""))
    .find((value) => value.length > 0);

  return normalized ?? null;
};

const getRevisionNumber = (revision?: InvoicePreviewModalProps["revision"]): number | null => {
  if (!revision) return null;

  const possibleNumbers = [
    (revision as { revision?: number | null }).revision,
    (revision as { clientRevisionId?: number | null }).clientRevisionId,
  ];

  const firstNumber = possibleNumbers.find((value) => typeof value === "number");
  return typeof firstNumber === "number" ? firstNumber : null;
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
