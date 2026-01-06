import React from "react";
import Modal from "@/shared/ui/ModalWithStack";
import { toast } from "react-toastify";
import { createHqAccount, fetchHqSummary } from "@/hq/lib/hqApi";
import { hydrateHqState, readHqState } from "@/hq/lib/hqStore";
import type { HqAccount } from "@/hq/types";
import styles from "./AddAccountModal.module.css";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

type AddAccountModalProps = {
  orgId: string;
  isOpen: boolean;
  onRequestClose: () => void;
  onCreated?: (account: HqAccount) => void;
};

const AddAccountModal: React.FC<AddAccountModalProps> = ({
  orgId,
  isOpen,
  onRequestClose,
  onCreated,
}) => {
  const [accountName, setAccountName] = React.useState("");
  const [institution, setInstitution] = React.useState("");
  const [accountMask, setAccountMask] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!isOpen) return;
    setAccountName("");
    setInstitution("");
    setAccountMask("");
    setNotes("");
  }, [isOpen]);

  const canSave = accountName.trim().length > 1 && institution.trim().length > 1;

  const handleSave = React.useCallback(async () => {
    if (!canSave) return;
    try {
      const account = await createHqAccount(orgId, {
        name: accountName.trim(),
        institution: institution.trim(),
        accountMask: accountMask.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      // Refresh summary to ensure local cache matches server.
      const summary = await fetchHqSummary(orgId);
      const prev = readHqState(orgId);
      hydrateHqState(orgId, { ...prev, accounts: summary.accounts, importRuns: summary.importRuns });

      toast.success("Account added.");
      onCreated?.(account);
      onRequestClose();
    } catch (err) {
      console.error(err);
      toast.error("Could not add account.");
    }
  }, [accountMask, accountName, canSave, institution, notes, onCreated, onRequestClose, orgId]);

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      contentLabel="Add account"
      closeTimeoutMS={200}
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
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Add account</div>
          <div className={styles.subtitle}>Creates an account + optional mask. Add an anchor next.</div>
        </div>
        <button type="button" className={styles.closeButton} onClick={onRequestClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className={styles.body}>
        <label className={styles.field}>
          <span>Account name</span>
          <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="WF Checking" />
        </label>
        <label className={styles.field}>
          <span>Institution</span>
          <input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Wells Fargo" />
        </label>
        <label className={styles.field}>
          <span>Last 4 (optional)</span>
          <input value={accountMask} onChange={(e) => setAccountMask(e.target.value)} placeholder="1234" />
        </label>
        <label className={styles.field}>
          <span>Notes (optional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Operating, taxes, etc." />
        </label>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.secondaryButton} onClick={onRequestClose}>
          Cancel
        </button>
        <button type="button" className={styles.primaryButton} onClick={handleSave} disabled={!canSave}>
          Add account
        </button>
      </div>
    </Modal>
  );
};

export default AddAccountModal;

