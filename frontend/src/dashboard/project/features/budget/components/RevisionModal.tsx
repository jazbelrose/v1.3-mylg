import React, { useEffect, useRef, useState } from "react";
import Modal from "@/shared/ui/ModalWithStack";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faClone,
  faFileCsv,
  faFileInvoice,
  faPen,
  faPlus,
  faTrash,
  faUser,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { saveAs } from "file-saver";
import { fetchBudgetItems, getFileUrl } from "@/shared/utils/api";
import InvoicePreviewModal from "@/dashboard/project/features/budget/components/InvoicePreviewModal";
import ConfirmModal from "@/shared/ui/ConfirmModal";
import styles from "./revision-modal.module.css";
import type { RevisionInvoiceSaveResult } from "./invoicePreviewTypes";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

type Revision = {
  budgetId: string;
  budgetItemId?: string;
  revision: number;
  clientRevisionId?: number | null;
  revisionName?: string | null;
  invoiceFileKey?: string | null;
  invoiceFileUrl?: string | null;
};

type RevisionInvoiceAttachment = {
  fileKey: string;
  fileUrl: string;
  fileName: string;
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
  onRename?: (revision: Revision, name: string) => void | Promise<void>;
  onInvoiceSaved?: (revision: Revision, invoice: RevisionInvoiceAttachment) => void | Promise<void>;
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
  onRename,
  onInvoiceSaved,
  isAdmin = false,
  activeProject = null,
}) => {
  const [selected, setSelected] = useState<number | null>(activeRevision);
  const [deleteTarget, setDeleteTarget] = useState<Revision | null>(null);
  const [previewRevision, setPreviewRevision] = useState<Revision | null>(null);
  const [renaming, setRenaming] = useState<Revision | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const resetRenameState = () => {
    setRenaming(null);
    setNameDraft("");
    setIsSavingName(false);
  };

  const handleClose = () => {
    if (previewRevision) setPreviewRevision(null);
    resetRenameState();
    onRequestClose?.();
  };

  useEffect(() => {
    setSelected(activeRevision);
  }, [activeRevision]);

  useEffect(() => {
    if (!isOpen) {
      resetRenameState();
    }
  }, [isOpen]);

  useEffect(() => {
    if (renaming) {
      setNameDraft(renaming.revisionName ?? "");
      nameInputRef.current?.focus();
    }
  }, [renaming]);

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
      const items = (await fetchBudgetItems(rev.budgetId, rev.revision)) as BudgetItem[];
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

  const openInvoiceEditor = (rev: Revision) => {
    setPreviewRevision(rev);
  };

  const computeInvoiceUrl = (rev: Revision): string | null => {
    const source = rev.invoiceFileUrl ?? rev.invoiceFileKey;
    if (!source) return null;
    if (source.startsWith("http")) return source;
    const key = source.startsWith("public/") ? source : `public/${source}`;
    return getFileUrl(key);
  };

  const handleInvoiceLinkClick = (rev: Revision) => {
    const url = computeInvoiceUrl(rev);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleRenameToggle = (rev: Revision) => {
    const isSame =
      renaming &&
      ((renaming.budgetItemId && rev.budgetItemId && renaming.budgetItemId === rev.budgetItemId) ||
        renaming.revision === rev.revision);

    if (isSame) {
      resetRenameState();
    } else {
      setRenaming(rev);
    }
  };

  const handleRenameSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!renaming) return;
    if (!onRename) {
      resetRenameState();
      return;
    }

    const trimmed = nameDraft.trim();
    if (trimmed === (renaming.revisionName ?? "")) {
      resetRenameState();
      return;
    }

    try {
      setIsSavingName(true);
      await onRename(renaming, trimmed);
      resetRenameState();
    } catch (error) {
      console.error("Failed to rename revision", error);
      setIsSavingName(false);
    }
  };

  const handleRenameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      resetRenameState();
    }
  };

  const handleInvoiceSavedInternal = (result: RevisionInvoiceSaveResult) => {
    if (!previewRevision) return;
    const invoice: RevisionInvoiceAttachment = {
      fileKey: result.fileKey,
      fileUrl: result.fileUrl,
      fileName: result.fileName,
    };
    onInvoiceSaved?.(previewRevision, invoice);
    setPreviewRevision((prev) =>
      prev ? { ...prev, invoiceFileKey: invoice.fileKey, invoiceFileUrl: invoice.fileUrl } : prev
    );
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
          <div className={styles.headerText}>
            <h2 className={styles.modalTitle}>Manage Revisions</h2>
            <p className={styles.modalSubtitle}>
              Switch between invoice versions, rename revisions, and attach files without
              leaving this workspace.
            </p>
          </div>

          <div className={styles.headerActions}>
            <span className={styles.revisionCountPill}>
              {revisions.length} {revisions.length === 1 ? "Revision" : "Revisions"}
            </span>
            <button
              type="button"
              className={styles.closeButton}
              onClick={handleClose}
              aria-label="Close"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.modalList}>
            {revisions.length === 0 ? (
              <div className={styles.emptyState}>
                No revisions yet. Create a new one to get started.
              </div>
            ) : (
              revisions.map((rev) => {
                const isActive = rev.revision === activeRevision;
                const isClient = rev.clientRevisionId === rev.revision;
                const invoiceUrl = computeInvoiceUrl(rev);
                const isRenaming =
                  renaming &&
                  ((renaming.budgetItemId &&
                    rev.budgetItemId &&
                    renaming.budgetItemId === rev.budgetItemId) ||
                    renaming.revision === rev.revision);

                return (
                  <div
                    key={rev.revision}
                    className={`${styles.revRow} ${isActive ? styles.activeRow : ""}`}
                  >
                    <div className={styles.revHeader}>
                      <label className={styles.revLabel}>
                        <input
                          type="radio"
                          name="revision"
                          value={rev.revision}
                          checked={selected === rev.revision}
                          onChange={() => setSelected(rev.revision)}
                        />
                        <span className={styles.revNumber}>{`Rev.${rev.revision}`}</span>
                      </label>

                      <div className={styles.revBadges}>
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
                      </div>

                      {isAdmin && (
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRenameToggle(rev);
                          }}
                          aria-label={isRenaming ? "Cancel rename" : "Rename revision"}
                          title={isRenaming ? "Cancel rename" : "Rename revision"}
                        >
                          <FontAwesomeIcon icon={faPen} />
                        </button>
                      )}
                    </div>

                    <div className={styles.revNameRow}>
                      {isRenaming ? (
                        <form
                          className={styles.renameForm}
                          onSubmit={handleRenameSubmit}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            ref={nameInputRef}
                            className={styles.renameInput}
                            value={nameDraft}
                            onChange={(event) => setNameDraft(event.target.value)}
                            placeholder="Add a descriptive name"
                            onKeyDown={handleRenameKeyDown}
                            disabled={isSavingName}
                          />
                          <div className={styles.renameActions}>
                            <button
                              type="submit"
                              className={styles.renameActionButton}
                              disabled={isSavingName}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className={styles.renameActionButton}
                              onClick={(event) => {
                                event.stopPropagation();
                                resetRenameState();
                              }}
                              disabled={isSavingName}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div
                          className={
                            rev.revisionName ? styles.revNameText : styles.revNamePlaceholder
                          }
                        >
                          {rev.revisionName || "Add a descriptive name"}
                        </div>
                      )}
                    </div>

                    <div className={styles.revFooter}>
                      <div className={styles.invoiceStatusWrapper}>
                        <span
                          className={
                            invoiceUrl ? styles.invoiceStatusReady : styles.invoiceStatusEmpty
                          }
                        >
                          {invoiceUrl ? "Invoice attached" : "No invoice attached"}
                        </span>
                        {invoiceUrl && (
                          <button
                            type="button"
                            className={styles.iconButton}
                            onClick={() => handleInvoiceLinkClick(rev)}
                            aria-label="Open saved invoice"
                            title="Open saved invoice"
                          >
                            <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                          </button>
                        )}
                      </div>

                      {isAdmin && (
                        <div className={styles.revActions}>
                          <button
                            type="button"
                            className={styles.iconButton}
                            onClick={() => openInvoiceEditor(rev)}
                            aria-label={invoiceUrl ? "Update invoice" : "Create invoice"}
                            title={invoiceUrl ? "Update invoice" : "Create invoice"}
                          >
                            <FontAwesomeIcon icon={faFileInvoice} />
                          </button>

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
                  </div>
                );
              })
            )}
          </div>
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
          onInvoiceSaved={handleInvoiceSavedInternal}
        />
      )}
    </>
  );
};

export default RevisionModal;
