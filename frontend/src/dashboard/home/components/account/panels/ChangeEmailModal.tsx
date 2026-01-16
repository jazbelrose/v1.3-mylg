import React from "react";
import { Mail, X } from "lucide-react";
import { toast } from "react-toastify";

import Modal from "@/shared/ui/ModalWithStack";
import { useAuth } from "@/app/contexts/useAuth";
import styles from "./accountPanels.module.css";

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function mapCognitoEmailError(err: unknown): string {
  const error = err as { message?: string; name?: string };
  switch (error?.name) {
    case "AliasExistsException":
    case "UsernameExistsException":
      return "That email is already in use.";
    case "InvalidParameterException":
      return "Please enter a valid email address.";
    case "NotAuthorizedException":
      return "Please sign in again to change your email.";
    case "LimitExceededException":
      return "Too many attempts. Please wait a minute and try again.";
    default:
      return error?.message || "Failed to start email change.";
  }
}

export type ChangeEmailModalProps = {
  open: boolean;
  currentEmail?: string;
  onClose: () => void;
  onVerificationStarted: (newEmail: string) => void;
};

export default function ChangeEmailModal({
  open,
  currentEmail,
  onClose,
  onVerificationStarted,
}: ChangeEmailModalProps) {
  const { updateUserCognitoAttributes } = useAuth();
  const [newEmail, setNewEmail] = React.useState("");
  const [confirmEmail, setConfirmEmail] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  const normalizedCurrent = (currentEmail ?? "").trim().toLowerCase();
  const normalizedNew = newEmail.trim().toLowerCase();
  const normalizedConfirm = confirmEmail.trim().toLowerCase();

  const matches = normalizedNew.length > 0 && normalizedNew === normalizedConfirm;
  const canSubmit =
    open &&
    !isSaving &&
    isLikelyEmail(newEmail) &&
    matches &&
    normalizedNew !== normalizedCurrent;

  React.useEffect(() => {
    if (!open) return;
    if (typeof document === "undefined") return;
    const root = document.getElementById("root");
    if (root) {
      Modal.setAppElement(root);
    } else {
      Modal.setAppElement("body");
    }
  }, [open]);

  React.useEffect(() => {
    if (open) return;
    setNewEmail("");
    setConfirmEmail("");
    setIsSaving(false);
  }, [open]);

  const submit = async () => {
    if (!canSubmit) return;
    setIsSaving(true);
            {isSaving ? "Sending…" : "Send code"}
      const next = newEmail.trim();
      await updateUserCognitoAttributes({ email: next });
      toast.success("Verification code sent to your new email.");
      onVerificationStarted(next);
    } catch (err) {
      toast.error(mapCognitoEmailError(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onRequestClose={() => (!isSaving ? onClose() : undefined)}
      contentLabel="Change email"
      closeTimeoutMS={220}
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
      shouldCloseOnOverlayClick={!isSaving}
      shouldCloseOnEsc={!isSaving}
    >
      <div className={styles.modalShell}>
        <header className={styles.modalHeader}>
          <div className={styles.modalHeaderText}>
            <div className={styles.modalTitle}>Change email</div>
            <div className={styles.modalSubtitle}>
              We'll send a verification code to your new email.
            </div>
          </div>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onClose}
            aria-label="Close"
            disabled={isSaving}
          >
            <X size={18} />
          </button>
        </header>

        <div className={styles.modalBody}>
          <div className={styles.fieldsGridSingle}>
            <label className={styles.field}>
              <span className={styles.label}>New email</span>
              <input
                className={styles.input}
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
                inputMode="email"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Confirm new email</span>
              <input
                className={styles.input}
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
                inputMode="email"
              />
              {!matches && confirmEmail.trim().length > 0 ? (
                <span
                  className={styles.helper}
                  style={{ color: "rgba(255, 140, 140, 0.92)" }}
                >
                  Emails do not match.
                </span>
              ) : null}
              {normalizedNew === normalizedCurrent && normalizedNew.length > 0 ? (
                <span className={styles.helper}>
                  That's already your current email.
                </span>
              ) : null}
            </label>
          </div>
        </div>

        <footer className={styles.modalActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void submit()}
            disabled={!canSubmit}
          >
            <Mail size={16} aria-hidden />
            {isSaving ? "Sending5" : "Send code"}
          </button>
        </footer>
      </div>
    </Modal>
  );
}
