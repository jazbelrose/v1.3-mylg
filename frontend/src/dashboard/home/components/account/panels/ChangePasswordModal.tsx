import React from "react";
import { updatePassword } from "aws-amplify/auth";
import { Eye, EyeOff, X } from "lucide-react";
import { toast } from "react-toastify";

import Modal from "@/shared/ui/ModalWithStack";
import { validatePasswordAgainstTypicalCognitoPolicy } from "@/shared/utils/passwordValidation";
import styles from "./accountPanels.module.css";

function mapCognitoPasswordError(err: unknown): string {
  const error = err as { message?: string; name?: string };
  switch (error?.name) {
    case "NotAuthorizedException":
      return "Current password is incorrect.";
    case "InvalidPasswordException":
      return error?.message || "New password is too weak.";
    case "LimitExceededException":
      return "Too many attempts. Please wait a minute and try again.";
    default:
      return error?.message || "Failed to update password.";
  }
}

export type ChangePasswordModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmNewPassword, setConfirmNewPassword] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  const [showCurrent, setShowCurrent] = React.useState(false);
  const [showNew, setShowNew] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);

  const [newFocused, setNewFocused] = React.useState(false);

  const missing = React.useMemo(() => validatePasswordAgainstTypicalCognitoPolicy(newPassword), [newPassword]);
  const matches = newPassword.length > 0 && newPassword === confirmNewPassword;

  const canSubmit =
    !isSaving &&
    currentPassword.trim().length > 0 &&
    newPassword.trim().length > 0 &&
    confirmNewPassword.trim().length > 0 &&
    matches &&
    missing.length === 0;

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
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setIsSaving(false);
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setNewFocused(false);
  }, [open]);

  const submit = async () => {
    if (!canSubmit) return;
    setIsSaving(true);
    try {
      await updatePassword({ oldPassword: currentPassword, newPassword });
      toast.success("Password updated");
      onClose();
    } catch (err) {
      toast.error(mapCognitoPasswordError(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onRequestClose={() => (!isSaving ? onClose() : undefined)}
      contentLabel="Change password"
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
            <div className={styles.modalTitle}>Change password</div>
            <div className={styles.modalSubtitle}>Update your password for this account.</div>
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
              <span className={styles.label}>Current password</span>
              <div className={styles.passwordField}>
                <input
                  className={[styles.input, styles.passwordInput].join(" ")}
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Current password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className={styles.passwordEye}
                  onClick={() => setShowCurrent((v) => !v)}
                  aria-label={showCurrent ? "Hide current password" : "Show current password"}
                >
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>New password</span>
              <div className={styles.passwordField}>
                <input
                  className={[styles.input, styles.passwordInput].join(" ")}
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onFocus={() => setNewFocused(true)}
                  onBlur={() => setNewFocused(false)}
                  placeholder="New password"
                  autoComplete="new-password"
                  minLength={8}
                />
                <button
                  type="button"
                  className={styles.passwordEye}
                  onClick={() => setShowNew((v) => !v)}
                  aria-label={showNew ? "Hide new password" : "Show new password"}
                >
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {newFocused || newPassword.length > 0 ? (
                <span className={styles.helper}>
                  {missing.length ? `Password rules: needs ${missing.join(", ")}.` : "Password rules: looks good."}
                </span>
              ) : null}
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Confirm new password</span>
              <div className={styles.passwordField}>
                <input
                  className={[styles.input, styles.passwordInput].join(" ")}
                  type={showConfirm ? "text" : "password"}
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className={styles.passwordEye}
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {!matches && confirmNewPassword.length > 0 ? (
                <span className={styles.helper} style={{ color: "rgba(255, 140, 140, 0.92)" }}>
                  Passwords do not match.
                </span>
              ) : null}
            </label>
          </div>
        </div>

        <footer className={styles.modalActions}>
          <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button type="button" className={styles.primaryButton} onClick={() => void submit()} disabled={!canSubmit}>
            {isSaving ? "Updating…" : "Update password"}
          </button>
        </footer>
      </div>
    </Modal>
  );
}
