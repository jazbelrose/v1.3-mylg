import React, { useState, useEffect } from "react";
import Modal from "@/shared/ui/ModalWithStack";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faTrash,
  faClone,
  faPlus,
  faFileCsv,
  faFileInvoice,
  faUser,
  faPen,
} from "@fortawesome/free-solid-svg-icons";
import { saveAs } from "file-saver";
import { fetchBudgetItems } from "@/shared/utils/api";
import InvoicePreviewModal from "@/dashboard/project/features/budget/components/InvoicePreviewModal";
import ConfirmModal from "@/shared/ui/ConfirmModal";
import styles from "./revision-modal.module.css";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

type Revision = {
  budgetId: string;
  revision: number;
  clientRevisionId?: number | null;
};

type Project = {
  title?: string;
};

type RevisionModalProps = {
  isOpen: boolean;
  onRequestClose?: () => void;
  revisions?: Revision[];
  activeRevision: number | null;
  onSwitch?: (revision: number) => void;
  onDuplicate?: (revision: number | null) => void;
  onCreateNew?: () => void;
  onDelete?: (revision: Revision) => void;
  onSetClient?: (revision: number) => void;
  isAdmin?: boolean;
  activeProject?: Project | null;
};

type BudgetItem = {
  elementKey?: string;
  title?: string;
  category?: string;
  quantity?: number | string;
  itemBudgetedCost?: number | string;
  itemFinalCost?: number | string;
  vendor?: string;
  notes?: string;
  // allow unknowns
  [k: string]: unknown;
};

const RevisionModal: React.FC<RevisionModalProps> = ({
  isOpen,
  onRequestClose,
  revisions = [],
  activeRevision,
  onSwitch,
  onDuplicate,
  onCreateNew,
  onDelete,
  onSetClient,
  isAdmin = false,
  activeProject = null,
}) => {
  const [selected, setSelected] = useState<number | null>(activeRevision);
  const [deleteTarget, setDeleteTarget] = useState<Revision | null>(null);
  const [previewRevision, setPreviewRevision] = useState<Revision | null>(null);

  const handleClose = () => {
    if (previewRevision) setPreviewRevision(null);
    onRequestClose?.();
  };

  useEffect(() => {
    setSelected(activeRevision);
  }, [activeRevision]);

  const handleSwitch = async () => {
    if (onSwitch && selected != null) await onSwitch(selected);
  };

  const handleSetClient = async () => {
    if (onSetClient && selected != null) await onSetClient(selected);
  };

  const confirmDelete = () => {
    if (deleteTarget && onDelete) onDelete(deleteTarget);
    setDeleteTarget(null);
  };

  const exportCsv = async (rev: Revision) => {
    if (!rev?.budgetId) return;
    try {
      const items = (await fetchBudgetItems(
        rev.budgetId,
        rev.revision
      )) as BudgetItem[];
      if (!Array.isArray(items)) return;

      const fields = [
        "elementKey",
        "title",
        "category",
        "quantity",
        "itemBudgetedCost",
        "itemFinalCost",
        "vendor",
        "notes",
      ] as const;

      const header = fields.join(",");
      const rows = items.map((it) =>
        fields
          .map((f) => {
            const raw = it[f] != null ? String(it[f]) : "";
            return `"${raw.replace(/"/g, '""')}"`;
          })
          .join(",")
      );

      const csvContent = [header, ...rows].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      saveAs(blob, `revision-${rev.revision}.csv`);
    } catch (err) {
      console.error("CSV export failed", err);
    }
  };

  const exportInvoice = (rev: Revision) => {
    setPreviewRevision(rev);
  };

  const selectedLabel = selected != null ? `Rev.${selected}` : "Revision";

  return (
    <>
      <Modal
        isOpen={isOpen}
        onRequestClose={handleClose}
        contentLabel="Manage Revisions"
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
          <div className={styles.modalTitle}>Manage Revisions</div>
          <button
            type="button"
            className={styles.iconButton}
            onClick={handleClose}
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className={styles.modalList}>
          {revisions.map((rev) => {
            const isActive = rev.revision === activeRevision;
            const isClient = rev.clientRevisionId === rev.revision;

            return (
              <div
                key={rev.revision}
                className={`${styles.revRow} ${isActive ? styles.activeRow : ""}`}
              >
                <label className={styles.revLabel}>
                  <input
                    type="radio"
                    name="revision"
                    value={rev.revision}
                    checked={selected === rev.revision}
                    onChange={() => setSelected(rev.revision)}
                  />
                  <span className={styles.revName}>{`Rev.${rev.revision}`}</span>

                  {isClient && (
                    <span className={styles.clientBadge}>
                      <FontAwesomeIcon icon={faUser} /> Client Version
                    </span>
                  )}

                  {isAdmin && isActive && (
                    <span className={styles.editingBadge}>
                      <FontAwesomeIcon icon={faPen} /> Editing
                    </span>
                  )}
                </label>

                {isAdmin && (
                  <div className={styles.revActions}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => exportCsv(rev)}
                      aria-label="Export CSV"
                      title="Export CSV"
                    >
                      <FontAwesomeIcon icon={faFileCsv} />
                    </button>

                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => exportInvoice(rev)}
                      aria-label="Export Invoice"
                      title="Export Invoice"
                    >
                      <FontAwesomeIcon icon={faFileInvoice} />
                    </button>

                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.deleteButton}`}
                      onClick={() => setDeleteTarget(rev)}
                      aria-label="Delete revision"
                      title="Delete revision"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className={styles.modalFooter}>
          {isAdmin && (
            <button
              type="button"
              className="modal-button secondary"
              onClick={handleSwitch}
              aria-label={`Edit ${selectedLabel}`}
            >
              {`Edit ${selectedLabel}`}
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              className="modal-button"
              onClick={() => onDuplicate?.(selected ?? null)}
              aria-label="Duplicate revision"
              title="Duplicate revision"
            >
              <FontAwesomeIcon icon={faClone} /> Duplicate
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              className="modal-button"
              onClick={handleSetClient}
              aria-label={`Set ${selectedLabel} as client version`}
            >
              {`Set ${selectedLabel} as Client Version`}
            </button>
          )}

          <button
            type="button"
            className="modal-button"
            onClick={() => onCreateNew?.()}
            aria-label="New blank revision"
          >
            <FontAwesomeIcon icon={faPlus} /> New
          </button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onRequestClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        message={`Delete this revision? Type "${activeProject?.title || ""}" to confirm.`}
        confirmText={activeProject?.title || ""}
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
      />

      {previewRevision && (
        <InvoicePreviewModal
          isOpen={!!previewRevision}
          onRequestClose={() => setPreviewRevision(null)}
          revision={previewRevision}
          project={activeProject}
        />
      )}
    </>
  );
};

export default RevisionModal;











