import React, { useEffect, useMemo, useState } from "react";
import Modal from "react-modal";
import { Mail } from "lucide-react";

import styles from "./organization.module.css";
import type { InviteRow, OrgRole } from "./types";
import { ORG_ROLE_LABELS } from "./stubData";

if (typeof document !== "undefined") {
  const el = document.getElementById("root");
  if (el) Modal.setAppElement(el);
}

export type InviteModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSend: (invite: Pick<InviteRow, "email" | "role">) => void;
};

export default function InviteModal({ isOpen, onClose, onSend }: InviteModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("designer");

  useEffect(() => {
    if (!isOpen) return;
    setEmail("");
    setRole("designer");
  }, [isOpen]);

  const canSend = useMemo(() => {
    const trimmed = email.trim();
    return trimmed.length > 3 && trimmed.includes("@");
  }, [email]);

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      contentLabel="Invite member"
      overlayClassName={styles.drawerOverlay}
      className={styles.drawer}
      shouldCloseOnOverlayClick
    >
      <div className={styles.drawerHeader}>
        <div className={styles.drawerHeaderLeft}>
          <div className={styles.avatar} aria-hidden>
            <Mail size={16} />
          </div>
          <div className={styles.drawerTitle}>
            <div className={styles.drawerName}>Invite</div>
            <div className={styles.drawerEmail}>Send an invite to join your organization</div>
          </div>
        </div>
        <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className={styles.drawerBody}>
        <div className={styles.section}>
          <div className={styles.sectionBody}>
            <div className={styles.field}>
              <div className={styles.label}>Email</div>
              <input
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                inputMode="email"
                autoFocus
              />
            </div>
            <div className={styles.field}>
              <div className={styles.label}>Role</div>
              <select className={styles.select} value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
                {Object.entries(ORG_ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.drawerFooter}>
        <button type="button" className={styles.secondaryButton} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={`${styles.primaryButton} ${!canSend ? styles.primaryButtonDisabled : ""}`}
          disabled={!canSend}
          onClick={() => onSend({ email: email.trim(), role })}
        >
          Send invite
        </button>
      </div>
    </Modal>
  );
}
