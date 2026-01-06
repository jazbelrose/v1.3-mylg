import React from "react";
import Modal from "@/shared/ui/ModalWithStack";
import { toast } from "react-toastify";
import { patchHqAccount, fetchHqSummary } from "@/hq/lib/hqApi";
import { hydrateHqState, readHqState } from "@/hq/lib/hqStore";
import { HQ_DEFAULT_TIME_ZONE, todayIsoDateInTimeZone } from "@/hq/lib/hqDate";
import type { HqAccount } from "@/hq/types";
import styles from "./SetAnchorModal.module.css";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

type SetAnchorModalProps = {
  orgId: string;
  isOpen: boolean;
  onRequestClose: () => void;
  account: HqAccount;
};

const SetAnchorModal: React.FC<SetAnchorModalProps> = ({
  orgId,
  isOpen,
  onRequestClose,
  account,
}) => {
  const [anchorDate, setAnchorDate] = React.useState("");
  const [anchorBalance, setAnchorBalance] = React.useState(
    typeof account.anchorBalance === "number" ? String(account.anchorBalance) : ""
  );

  React.useEffect(() => {
    if (!isOpen) return;
    setAnchorDate(todayIsoDateInTimeZone(new Date(), HQ_DEFAULT_TIME_ZONE));
    setAnchorBalance(typeof account.anchorBalance === "number" ? String(account.anchorBalance) : "");
  }, [account.anchorBalance, isOpen]);

  const parsedBalance = React.useMemo(() => {
    const cleaned = anchorBalance.replace(/[$,]/g, "").trim();
    if (!cleaned) return null;
    const num = Number(cleaned);
    if (!Number.isFinite(num)) return null;
    return Math.round(num * 100) / 100;
  }, [anchorBalance]);

  const canSave = Boolean(anchorDate) && typeof parsedBalance === "number";

  const handleSave = React.useCallback(async () => {
    if (!canSave) return;
    const parsedBalanceValue = typeof parsedBalance !== "number" ? null : parsedBalance;

    try {
      await patchHqAccount(orgId, account.accountId, {
        anchorDate,
        anchorBalance: parsedBalanceValue,
      });

      const summary = await fetchHqSummary(orgId);
      const prev = readHqState(orgId);
      hydrateHqState(orgId, { ...prev, accounts: summary.accounts, importRuns: summary.importRuns });

      toast.success("Balance anchor saved.");
      onRequestClose();
    } catch (err) {
      console.error(err);
      toast.error("Could not save anchor.");
    }
  }, [account.accountId, anchorDate, canSave, onRequestClose, orgId, parsedBalance]);

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      contentLabel="Set balance anchor"
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
          <div className={styles.title}>Balance anchor</div>
          <div className={styles.subtitle}>
            Enter the ending balance today so HQ can compute a daily balance curve from your imported transactions.
          </div>
        </div>
        <button type="button" className={styles.closeButton} onClick={onRequestClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.accountPill}>
          {account.name ?? account.accountName} · {account.institution}
        </div>
        <label className={styles.field}>
          <span>Anchor date (America/Los_Angeles)</span>
          <input type="text" value={anchorDate} readOnly />
        </label>
        <label className={styles.field}>
          <span>Ending balance today</span>
          <input value={anchorBalance} onChange={(e) => setAnchorBalance(e.target.value)} placeholder="12345.67" />
        </label>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.secondaryButton} onClick={onRequestClose}>
          Cancel
        </button>
        <button type="button" className={styles.primaryButton} onClick={handleSave} disabled={!canSave}>
          Save anchor
        </button>
      </div>
    </Modal>
  );
};

export default SetAnchorModal;

