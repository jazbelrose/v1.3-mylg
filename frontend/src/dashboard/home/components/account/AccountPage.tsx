import React from "react";
import { ChevronDown } from "lucide-react";

import { useOrg } from "@/app/contexts/useOrg";
import AccountNav, { type AccountPanelKey } from "./AccountNav";
import AccountProfilePanel, { type ProfileSaveState } from "./panels/AccountProfilePanel";
import AccountSecurityPanel from "./panels/AccountSecurityPanel";
import AccountPaymentsPanel from "./panels/AccountPaymentsPanel";
import styles from "./accountPage.module.css";

export default function AccountPage() {
  const { orgs, activeOrgId, setActiveOrgId, isLoading: orgsLoading } = useOrg();
  const [panel, setPanel] = React.useState<AccountPanelKey>("profile");
  const [profileSaveState, setProfileSaveState] = React.useState<ProfileSaveState>("clean");

  const orgLabel = React.useMemo(() => {
    if (orgsLoading) return "Loading…";
    const match = orgs.find((o) => o.orgId === activeOrgId);
    return match?.name?.trim() || match?.orgId || "Organization";
  }, [activeOrgId, orgs, orgsLoading]);

  return (
    <div className={[styles.shell, "noise-surface"].join(" ")}>
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <h1 className={styles.title}>Account</h1>
            <p className={styles.subtitle}>Profile and preferences</p>
          </div>

          <div className={styles.headerRight}>
            {panel === "profile" ? (
              <div
                className={[
                  styles.savePill,
                  profileSaveState === "dirty" ? styles.savePillDirty : "",
                  profileSaveState === "saving" ? styles.savePillSaving : "",
                  profileSaveState === "saved" ? styles.savePillSaved : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-live="polite"
              >
                {profileSaveState === "dirty"
                  ? "Unsaved"
                  : profileSaveState === "saving"
                    ? "Saving…"
                    : profileSaveState === "saved"
                      ? "Saved ✓"
                      : "Up to date"}
              </div>
            ) : null}
            <div className={styles.orgPicker} aria-label="Organization">
              <span className={styles.orgPill}>Org</span>
              <span className={styles.orgSelectWrap}>
                <select
                  className={styles.orgSelect}
                  value={activeOrgId ?? ""}
                  disabled={orgsLoading || orgs.length <= 1}
                  onChange={(e) => setActiveOrgId(e.target.value)}
                  aria-label="Select organization"
                >
                  {orgs.map((o) => (
                    <option key={o.orgId} value={o.orgId}>
                      {o.name?.trim() || o.orgId}
                    </option>
                  ))}
                  {!orgs.length ? <option value="">{orgLabel}</option> : null}
                </select>
                <ChevronDown size={16} className={styles.orgChevron} aria-hidden />
              </span>
            </div>
          </div>
        </header>

        <div className={styles.body}>
          <AccountNav value={panel} onChange={setPanel} />
          <section className={styles.content} aria-label="Account content">
            {panel === "profile" ? <AccountProfilePanel onSaveStateChange={setProfileSaveState} /> : null}
            {panel === "security" ? <AccountSecurityPanel /> : null}
            {panel === "payments" ? <AccountPaymentsPanel /> : null}
          </section>
        </div>
      </div>
    </div>
  );
}
