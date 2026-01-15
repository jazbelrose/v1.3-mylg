import React from "react";
import { updatePassword } from "aws-amplify/auth";
import { toast } from "react-toastify";

import { validatePasswordAgainstTypicalCognitoPolicy } from "@/shared/utils/passwordValidation";
import styles from "./accountPanels.module.css";

function mapCognitoPasswordError(err: unknown): string {
  const error = err as { message?: string; name?: string };
  switch (error?.name) {
    case "NotAuthorizedException":
      return "Old password is incorrect.";
    case "InvalidPasswordException":
      return error?.message || "New password is too weak.";
    case "LimitExceededException":
      return "Too many attempts. Please wait a minute and try again.";
    default:
      return error?.message || "Failed to update password.";
  }
}

export default function AccountSecurityPanel() {
  const [oldPassword, setOldPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmNewPassword, setConfirmNewPassword] = React.useState("");
  const [status, setStatus] = React.useState<{ kind: "idle" | "error" | "success"; message?: string }>({
    kind: "idle",
  });
  const [isSaving, setIsSaving] = React.useState(false);

  const missing = React.useMemo(() => validatePasswordAgainstTypicalCognitoPolicy(newPassword), [newPassword]);
  const matches = newPassword.length > 0 && newPassword === confirmNewPassword;

  const canSubmit =
    !isSaving &&
    oldPassword.trim().length > 0 &&
    newPassword.trim().length > 0 &&
    confirmNewPassword.trim().length > 0 &&
    matches &&
    missing.length === 0;

  const submit = async () => {
    if (!canSubmit) return;
    setIsSaving(true);
    setStatus({ kind: "idle" });
    try {
      await updatePassword({ oldPassword, newPassword });
      toast.success("Password updated");
      setStatus({ kind: "success", message: "Password updated." });
      setOldPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      const msg = mapCognitoPasswordError(err);
      toast.error(msg);
      setStatus({ kind: "error", message: msg });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <div>
          <div className={styles.cardTitle}>Change password</div>
          <div className={styles.cardSubtitle}>Update your password for this account.</div>
        </div>
      </header>

      <div className={styles.cardBody}>
        <div className={styles.fieldsGridSingle}>
          <label className={styles.field}>
            <span className={styles.label}>Old password</span>
            <input
              className={styles.input}
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Old password"
              autoComplete="current-password"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>New password</span>
            <input
              className={styles.input}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              autoComplete="new-password"
              minLength={8}
            />
            <span className={styles.helper}>
              Password rules: {missing.length ? `needs ${missing.join(", ")}.` : "looks good."}
            </span>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Confirm new password</span>
            <input
              className={styles.input}
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
            />
            {!matches && confirmNewPassword.length > 0 ? (
              <span className={styles.helper} style={{ color: "rgba(255, 140, 140, 0.92)" }}>
                New passwords do not match.
              </span>
            ) : null}
          </label>
        </div>

        {status.kind !== "idle" ? (
          <div
            className={styles.helper}
            role={status.kind === "error" ? "alert" : "status"}
            style={{ color: status.kind === "error" ? "rgba(255, 140, 140, 0.92)" : "rgba(45, 212, 191, 0.95)" }}
          >
            {status.message}
          </div>
        ) : null}

        <div className={styles.actionsRow}>
          <button type="button" className={styles.primaryButton} onClick={() => void submit()} disabled={!canSubmit}>
            {isSaving ? "Updating…" : "Update password"}
          </button>
        </div>
      </div>
    </article>
  );
}

