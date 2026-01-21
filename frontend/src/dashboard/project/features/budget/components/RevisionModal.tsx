import React, { useCallback, useEffect, useRef, useState } from "react";
import Modal from "@/shared/ui/ModalWithStack";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClone,
  faEllipsisV,
  faFileCsv,
  faFileInvoice,
  faPen,
  faPlus,
  faStar,
  faTrash,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { saveAs } from "file-saver";
import { fetchBudgetItems } from "@/shared/utils/api";
import InvoicePreviewModal from "@/dashboard/project/features/budget/components/InvoicePreviewModal";
import ConfirmModal from "@/shared/ui/ConfirmModal";
import styles from "./revision-modal.module.css";
import type { InvoiceDetailsPayload, RevisionInvoiceSaveResult } from "./invoicePreviewTypes";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

type Revision = {
  budgetId: string;
  budgetItemId?: string;
  revision: number;
  clientRevisionId?: number | null;
  revisionName?: string | null;
  revisionNote?: string | null;
  invoiceFileKey?: string | null;
  invoiceFileUrl?: string | null;
  invoiceDetails?: InvoiceDetailsPayload | null;
};

type RevisionInvoiceAttachment = {
  invoiceDetails: InvoiceDetailsPayload;
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
  onRevisionNoteChange?: (revision: Revision, note: string) => void | Promise<void>;
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
  onRevisionNoteChange,
  onInvoiceSaved,
  isAdmin = false,
  activeProject = null,
}) => {
  const [selected, setSelected] = useState<number | null>(activeRevision);
  const [deleteTarget, setDeleteTarget] = useState<Revision | null>(null);
  const [previewRevision, setPreviewRevision] = useState<Revision | null>(null);
  const [previewItems, setPreviewItems] = useState<BudgetItem[] | null>(null);
  const [invoiceLoadingRevision, setInvoiceLoadingRevision] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<Revision | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [editingNote, setEditingNote] = useState<Revision | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [openMenuRevision, setOpenMenuRevision] = useState<number | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const noteInputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const invoiceFetchIdRef = useRef(0);

  const closeInvoicePreview = () => {
    setPreviewRevision(null);
    setPreviewItems(null);
    setInvoiceLoadingRevision(null);
  };

  const formatSavedAt = useCallback((value?: string | null): string | null => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, []);

  const resetRenameState = () => {
    setRenaming(null);
    setNameDraft("");
    setIsSavingName(false);
  };

  const resetNoteState = () => {
    setEditingNote(null);
    setNoteDraft("");
    setIsSavingNote(false);
  };

  const closeMenu = useCallback(() => {
    setOpenMenuRevision(null);
  }, []);

  const handleClose = () => {
    if (previewRevision) closeInvoicePreview();
    resetRenameState();
    resetNoteState();
    closeMenu();
    onRequestClose?.();
  };

  useEffect(() => {
    setSelected(activeRevision);
  }, [activeRevision]);

  useEffect(() => {
    if (!isOpen) {
      resetRenameState();
      resetNoteState();
      closeMenu();
    }
  }, [isOpen, closeMenu]);

  useEffect(() => {
    if (renaming) {
      setNameDraft(renaming.revisionName ?? "");
      nameInputRef.current?.focus();
    }
  }, [renaming]);

  useEffect(() => {
    if (editingNote) {
      setNoteDraft(editingNote.revisionNote ?? "");
      noteInputRef.current?.focus();
    }
  }, [editingNote]);

  // Close menu on outside click
  useEffect(() => {
    if (openMenuRevision === null) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuRevision, closeMenu]);

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

  const openInvoiceEditor = async (rev: Revision) => {
    if (!rev) return;

    invoiceFetchIdRef.current += 1;
    const requestId = invoiceFetchIdRef.current;

    closeInvoicePreview();

    if (!rev.budgetId) {
      setPreviewItems([]);
      setPreviewRevision(rev);
      return;
    }

    setInvoiceLoadingRevision(rev.revision);

    try {
      const items = (await fetchBudgetItems(rev.budgetId, rev.revision)) as BudgetItem[];
      if (requestId !== invoiceFetchIdRef.current) return;
      setPreviewItems(Array.isArray(items) ? items : []);
      setPreviewRevision(rev);
    } catch (error) {
      if (requestId === invoiceFetchIdRef.current) {
        console.error("Failed to load revision invoice items", error);
        setPreviewItems([]);
        setPreviewRevision(rev);
      }
    } finally {
      if (requestId === invoiceFetchIdRef.current) {
        setInvoiceLoadingRevision(null);
      }
    }
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

  const handleNoteToggle = (rev: Revision) => {
    const isSame =
      editingNote &&
      ((editingNote.budgetItemId && rev.budgetItemId && editingNote.budgetItemId === rev.budgetItemId) ||
        editingNote.revision === rev.revision);

    if (isSame) {
      resetNoteState();
    } else {
      closeMenu();
      setEditingNote(rev);
    }
  };

  const handleNoteSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!editingNote) return;
    if (!onRevisionNoteChange) {
      resetNoteState();
      return;
    }

    const trimmed = noteDraft.trim();
    if (trimmed === (editingNote.revisionNote ?? "")) {
      resetNoteState();
      return;
    }

    try {
      setIsSavingNote(true);
      await onRevisionNoteChange(editingNote, trimmed);
      resetNoteState();
    } catch (error) {
      console.error("Failed to update revision note", error);
      setIsSavingNote(false);
    }
  };

  const handleNoteKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      resetNoteState();
    }
  };

  const handleMenuToggle = (revision: number) => {
    setOpenMenuRevision((prev) => (prev === revision ? null : revision));
  };

  const handleInvoiceSavedInternal = (result: RevisionInvoiceSaveResult) => {
    if (!previewRevision) return;
    const invoice: RevisionInvoiceAttachment = {
      invoiceDetails: result.invoiceDetails,
    };
    onInvoiceSaved?.(previewRevision, invoice);
    setPreviewRevision((prev) =>
      prev ? { ...prev, invoiceDetails: result.invoiceDetails } : prev
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
                const hasInvoice = Boolean(rev.invoiceDetails);
                const savedTimestamp = formatSavedAt(rev.invoiceDetails?.savedAt);
                const isRenaming =
                  renaming &&
                  ((renaming.budgetItemId &&
                    rev.budgetItemId &&
                    renaming.budgetItemId === rev.budgetItemId) ||
                    renaming.revision === rev.revision);
                const isEditingNote =
                  editingNote &&
                  ((editingNote.budgetItemId &&
                    rev.budgetItemId &&
                    editingNote.budgetItemId === rev.budgetItemId) ||
                    editingNote.revision === rev.revision);
                const isMenuOpen = openMenuRevision === rev.revision;

                return (
                  <div
                    key={rev.revision}
                    className={`${styles.revRow} ${isActive ? styles.activeRow : ""} ${isClient ? styles.clientRow : ""}`}
                  >
                    {/* Single-line row: Radio + Name + Chips + Actions */}
                    <div className={styles.revHeader}>
                      <label className={styles.revLabel}>
                        <input
                          type="radio"
                          name="revision"
                          value={rev.revision}
                          checked={selected === rev.revision}
                          onChange={() => setSelected(rev.revision)}
                        />
                      </label>

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
                        <div className={styles.revContent}>
                          {/* Primary name (truncates) */}
                          <span className={styles.revPrimaryName}>
                            {rev.revisionName || `Revision ${rev.revision}`}
                          </span>

                          {/* Inline chips */}
                          <span className={styles.revChip}>Rev.{rev.revision}</span>

                          {isClient && (
                            <span className={styles.clientChip}>
                              <FontAwesomeIcon icon={faStar} />
                              Client
                            </span>
                          )}

                          {isActive && (
                            <span className={styles.editingChip}>Editing</span>
                          )}

                          {/* Timestamp (subtle) */}
                          {savedTimestamp && (
                            <span className={styles.revTimestamp}>
                              <span className={styles.timestampDot}>•</span>
                              {savedTimestamp}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Right-side actions */}
                      <div className={styles.revActions}>
                        {/* Set as Client action (for selected non-client revision) */}
                        {isAdmin && !isClient && selected === rev.revision && (
                          <button
                            type="button"
                            className={styles.setClientButton}
                            onClick={handleSetClient}
                            aria-label="Set as client version"
                          >
                            Set as Client
                          </button>
                        )}

                        {/* Overflow Menu */}
                        {isAdmin && (
                          <div className={styles.menuWrapper}>
                            <button
                              type="button"
                              className={styles.menuButton}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleMenuToggle(rev.revision);
                              }}
                              aria-label="More actions"
                              aria-expanded={isMenuOpen}
                            >
                              <FontAwesomeIcon icon={faEllipsisV} />
                            </button>

                            {isMenuOpen && (
                              <div ref={menuRef} className={styles.overflowMenu}>
                                <button
                                  type="button"
                                  className={styles.menuItem}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    closeMenu();
                                    handleRenameToggle(rev);
                                  }}
                                >
                                  <FontAwesomeIcon icon={faPen} />
                                  <span>Rename</span>
                                </button>

                                <button
                                  type="button"
                                  className={styles.menuItem}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    closeMenu();
                                    handleNoteToggle(rev);
                                  }}
                                >
                                  <FontAwesomeIcon icon={faPen} />
                                  <span>{rev.revisionNote ? "Edit note" : "Add note"}</span>
                                </button>

                                <button
                                  type="button"
                                  className={styles.menuItem}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    closeMenu();
                                    onDuplicate?.(rev.revision);
                                  }}
                                >
                                  <FontAwesomeIcon icon={faClone} />
                                  <span>Duplicate</span>
                                </button>

                                <div className={styles.menuDivider} />

                                <button
                                  type="button"
                                  className={styles.menuItem}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    closeMenu();
                                    void openInvoiceEditor(rev);
                                  }}
                                  disabled={invoiceLoadingRevision === rev.revision}
                                >
                                  <FontAwesomeIcon icon={faFileInvoice} />
                                  <span>Edit Invoice</span>
                                </button>

                                <button
                                  type="button"
                                  className={styles.menuItem}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    closeMenu();
                                    void exportCsv(rev);
                                  }}
                                >
                                  <FontAwesomeIcon icon={faFileCsv} />
                                  <span>Export CSV</span>
                                </button>

                                <div className={styles.menuDivider} />

                                <button
                                  type="button"
                                  className={`${styles.menuItem} ${styles.menuItemDanger}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    closeMenu();
                                    setDeleteTarget(rev);
                                  }}
                                >
                                  <FontAwesomeIcon icon={faTrash} />
                                  <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Revision Note */}
                    {isEditingNote ? (
                      <form
                        className={styles.noteForm}
                        onSubmit={handleNoteSubmit}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          ref={noteInputRef}
                          className={styles.noteInput}
                          value={noteDraft}
                          onChange={(event) => setNoteDraft(event.target.value)}
                          placeholder="Why this revision exists…"
                          onKeyDown={handleNoteKeyDown}
                          disabled={isSavingNote}
                          maxLength={140}
                        />
                        <div className={styles.noteActions}>
                          <button
                            type="submit"
                            className={styles.noteActionButton}
                            disabled={isSavingNote}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className={styles.noteActionButton}
                            onClick={(event) => {
                              event.stopPropagation();
                              resetNoteState();
                            }}
                            disabled={isSavingNote}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : rev.revisionNote ? (
                      <div className={styles.revisionNote}>
                        {rev.revisionNote}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className={styles.modalFooter}>
          {/* Tertiary: Close */}
          <button
            type="button"
            className={styles.footerButtonTertiary}
            onClick={handleClose}
            aria-label="Close"
          >
            Close
          </button>

          <div className={styles.footerRight}>
            {/* Secondary: Switch to selected */}
            {isAdmin && selected != null && selected !== activeRevision && (
              <button
                type="button"
                className={styles.footerButtonSecondary}
                onClick={handleSwitch}
                aria-label={`Edit ${selectedLabel}`}
              >
                Edit {selectedLabel}
              </button>
            )}

            {/* Primary: New Revision */}
            <button
              type="button"
              className={styles.footerButtonPrimary}
              onClick={() => onCreateNew?.()}
              aria-label="New revision"
            >
              <FontAwesomeIcon icon={faPlus} />
              <span>New Revision</span>
            </button>
          </div>
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
          onRequestClose={closeInvoicePreview}
          revision={previewRevision}
          project={activeProject}
          itemsOverride={previewItems ?? []}
          onInvoiceSaved={handleInvoiceSavedInternal}
        />
      )}
    </>
  );
};

export default RevisionModal;
