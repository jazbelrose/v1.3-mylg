import React from "react";
import { ChevronDown } from "lucide-react";

import { useOrg } from "@/app/contexts/useOrg";
import { useData } from "@/app/contexts/useData";
import AccountNav, { type AccountPanelKey } from "./AccountNav";
import AccountProfilePanel, { type ProfileSaveState } from "./panels/AccountProfilePanel";
import AccountPaymentsPanel from "./panels/AccountPaymentsPanel";
import styles from "./accountPage.module.css";

type ProfileHeaderMeta = {
  saveState: ProfileSaveState;
  canSave: boolean;
  role?: string;
};

export default function AccountPage() {
  const { orgs, activeOrgId, setActiveOrgId, isLoading: orgsLoading } = useOrg();
  const { userData } = useData() as { userData?: { role?: string } };
  const [panel, setPanel] = React.useState<AccountPanelKey>("profile");
  const [profileSaveState, setProfileSaveState] = React.useState<ProfileSaveState>("clean");
  const [profileCanSave, setProfileCanSave] = React.useState(false);

  const profileRef = React.useRef<{ save: () => Promise<void>; cancel: () => void } | null>(null);

  const orgLabel = React.useMemo(() => {
    if (orgsLoading) return "Loading…";
    const match = orgs.find((o) => o.orgId === activeOrgId);
    return match?.name?.trim() || match?.orgId || "Organization";
  }, [activeOrgId, orgs, orgsLoading]);

  const headerMeta: ProfileHeaderMeta = React.useMemo(
    () => ({ saveState: profileSaveState, canSave: profileCanSave, role: userData?.role }),
    [profileCanSave, profileSaveState, userData?.role]
  );

  const onCancelProfile = React.useCallback(() => {
    profileRef.current?.cancel();
  }, []);

  const onSaveProfile = React.useCallback(() => {
    void profileRef.current?.save();
  }, []);

  React.useEffect(() => {
    if (panel !== "profile") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key?.toLowerCase?.() || "";
      const isSave = key === "s" && (event.metaKey || event.ctrlKey);
      if (!isSave) return;
      if (headerMeta.saveState !== "dirty") return;
      event.preventDefault();
      if (headerMeta.canSave) onSaveProfile();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [headerMeta.canSave, headerMeta.saveState, onSaveProfile, panel]);

  React.useEffect(() => {
    if (panel !== "profile") return;
    const shouldWarn = profileSaveState === "dirty" || profileSaveState === "saving";
    if (!shouldWarn) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [panel, profileSaveState]);

  return (
    <div className={[styles.shell, "noise-surface"].join(" ")}>
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <div className={styles.headerCopy}>
              <h1 className={styles.title}>Account</h1>
              <p className={styles.subtitle}>Profile and preferences</p>
            </div>

            <div className={styles.headerRight}>
              {headerMeta.role ? (
                <span className={styles.rolePill} title={String(headerMeta.role)}>
                  Role: {String(headerMeta.role).replace(/^./, (c) => c.toUpperCase())}
                </span>
              ) : null}
              {panel === "profile" && profileSaveState !== "clean" ? (
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
                        : null}
                </div>
              ) : null}
              <div className={styles.orgPicker} aria-label="Organization">
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
          </div>

          <div className={styles.headerTabs}>
            <AccountNav value={panel} onChange={setPanel} />
            {panel === "profile" ? (
              <div className={styles.headerActions} aria-label="Profile actions">
                <button
                  type="button"
                  className={styles.headerSecondaryButton}
                  onClick={onCancelProfile}
                  disabled={headerMeta.saveState !== "dirty"}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.headerPrimaryButton}
                  onClick={onSaveProfile}
                  disabled={!headerMeta.canSave || headerMeta.saveState !== "dirty"}
                >
                  {headerMeta.saveState === "saving" ? "Saving…" : "Save changes"}
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <div className={styles.body}>
          <section className={styles.content} aria-label="Account content">
            {panel === "profile" ? (
              <AccountProfilePanel
                ref={profileRef}
                onSaveStateChange={setProfileSaveState}
                onMetaChange={(meta) => setProfileCanSave(meta.canSave)}
              />
            ) : null}
            {panel === "payments" ? <AccountPaymentsPanel /> : null}
          </section>

          {panel === "profile" && profileSaveState === "dirty" ? (
            <div className={styles.mobileActionBar} aria-label="Mobile profile actions">
              <button
                type="button"
                className={styles.headerSecondaryButton}
                onClick={onCancelProfile}
                disabled={profileSaveState !== "dirty"}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.headerPrimaryButton}
                onClick={onSaveProfile}
                disabled={!profileCanSave}
              >
                Save
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
