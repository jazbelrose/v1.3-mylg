import React from "react";
import { toast } from "react-toastify";
import { HelpCircle } from "lucide-react";

import { useData } from "@/app/contexts/useData";
import { updateUserProfile } from "@/shared/utils/api";
import { resolveStoredFileUrl } from "@/shared/utils/media";
import AvatarPickerModal, { type AvatarPickerResult } from "./AvatarPickerModal";
import styles from "./accountPanels.module.css";

export type ProfileSaveState = "clean" | "dirty" | "saving" | "saved";

type UserData = Record<string, unknown> & {
  userId: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  email?: string;
  phoneNumber?: string;
  thumbnail?: string;
  thumbnailUrl?: string;
  occupation?: string;
  role?: string;
};

type Draft = {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  company: string;
  occupation: string;
  thumbnail: string; // S3 key, URL, or empty string
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: "Full administrative access",
  designer: "Create and manage designs",
  builder: "Manage build tasks",
  vendor: "Vendor access to supply orders",
  client: "View project progress",
};

function initialsFromUser(userData: UserData | null): string {
  const a = (userData?.firstName?.trim()?.[0] || "").toUpperCase();
  const b = (userData?.lastName?.trim()?.[0] || "").toUpperCase();
  const both = `${a}${b}`.trim();
  if (both) return both;
  const e = (userData?.email?.trim()?.[0] || "").toUpperCase();
  return e || "U";
}

function draftFromUser(userData: UserData): Draft {
  return {
    firstName: userData.firstName?.trim() || "",
    lastName: userData.lastName?.trim() || "",
    phoneNumber: userData.phoneNumber?.trim() || "",
    company: userData.company?.trim() || "",
    occupation: userData.occupation?.trim() || "",
    thumbnail: userData.thumbnail?.trim() || "",
  };
}

function isDraftDirty(userData: UserData, draft: Draft): boolean {
  const baseline = draftFromUser(userData);
  return (
    baseline.firstName !== draft.firstName ||
    baseline.lastName !== draft.lastName ||
    baseline.phoneNumber !== draft.phoneNumber ||
    baseline.company !== draft.company ||
    baseline.occupation !== draft.occupation ||
    (baseline.thumbnail || "") !== (draft.thumbnail || "")
  );
}

type AccountProfilePanelProps = {
  onSaveStateChange?: (state: ProfileSaveState) => void;
};

export default function AccountProfilePanel({ onSaveStateChange }: AccountProfilePanelProps) {
  const { refreshUser } = useData() as { refreshUser?: (force?: boolean) => Promise<void> };
  const { userData, setUserData, toggleSettingsUpdated } = useData() as {
    userData?: UserData;
    setUserData?: (u: UserData) => void;
    toggleSettingsUpdated?: () => void;
  };

  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [isAvatarOpen, setIsAvatarOpen] = React.useState(false);
  const [avatarLocalPreview, setAvatarLocalPreview] = React.useState<string | null>(null);
  const [saveState, setSaveState] = React.useState<ProfileSaveState>("clean");

  React.useEffect(() => {
    if (!userData) return;
    setDraft((prev) => {
      if (!prev) return draftFromUser(userData);
      if (saveState === "dirty" || saveState === "saving") return prev;
      return draftFromUser(userData);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData?.userId]);

  React.useEffect(() => {
    if (!userData || !draft) return;
    const dirty = isDraftDirty(userData, draft);
    const next: ProfileSaveState = saveState === "saving" ? "saving" : dirty ? "dirty" : "clean";
    if (next !== saveState) setSaveState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, userData]);

  React.useEffect(() => {
    onSaveStateChange?.(saveState);
  }, [onSaveStateChange, saveState]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!userData || !draft) return;
    window.hasUnsavedChanges = () => saveState === "dirty" || saveState === "saving";
    return () => {
      delete window.hasUnsavedChanges;
    };
  }, [draft, saveState, userData]);

  React.useEffect(() => {
    return () => {
      if (avatarLocalPreview) URL.revokeObjectURL(avatarLocalPreview);
    };
  }, [avatarLocalPreview]);

  const avatarSrc = React.useMemo(() => {
    if (avatarLocalPreview) return avatarLocalPreview;
    if (draft?.thumbnail) return resolveStoredFileUrl(draft.thumbnail, userData?.thumbnailUrl ?? null, { cacheBust: Date.now() });
    return resolveStoredFileUrl(userData?.thumbnail ?? "", userData?.thumbnailUrl ?? null);
  }, [avatarLocalPreview, draft?.thumbnail, userData?.thumbnail, userData?.thumbnailUrl]);

  if (!userData || !draft) {
    return (
      <div className={styles.card} role="status" aria-label="Loading profile">
        <div className={styles.cardHeader}>
          <div>
            <div className={styles.cardTitle}>Profile</div>
            <div className={styles.cardSubtitle}>Loading your account details…</div>
          </div>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.helper}>Please wait.</div>
        </div>
      </div>
    );
  }

  const canSave = saveState === "dirty" && draft.firstName.trim() && draft.lastName.trim();
  const roleKey = (userData.role || "").toLowerCase();
  const showRemove = Boolean(draft.thumbnail || userData.thumbnail);

  const cancel = () => {
    setDraft(draftFromUser(userData));
    if (avatarLocalPreview) URL.revokeObjectURL(avatarLocalPreview);
    setAvatarLocalPreview(null);
    toast.info("Changes discarded.");
  };

  const save = async () => {
    if (!canSave) return;
    setSaveState("saving");
    try {
      const updatedUserData: UserData = {
        ...userData,
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        phoneNumber: draft.phoneNumber.trim(),
        company: draft.company.trim(),
        occupation: draft.occupation.trim(),
        thumbnail: draft.thumbnail.trim(),
      };

      await updateUserProfile(updatedUserData as any);
      const thumbnailUrl = resolveStoredFileUrl(updatedUserData.thumbnail) || undefined;
      setUserData?.({ ...updatedUserData, thumbnailUrl });
      toggleSettingsUpdated?.();
      await refreshUser?.(true);

      setSaveState("saved");
      toast.success("Saved ✓");
      window.setTimeout(() => setSaveState((prev) => (prev === "saved" ? "clean" : prev)), 2000);
    } catch (err) {
      console.error("Failed to update profile:", err);
      toast.error("Could not save changes.");
      setSaveState("dirty");
    }
  };

  const handleAvatarSaved = (result: AvatarPickerResult) => {
    if (avatarLocalPreview) URL.revokeObjectURL(avatarLocalPreview);
    setAvatarLocalPreview(result.previewUrl);
    setDraft((prev) => (prev ? { ...prev, thumbnail: result.key } : prev));
    setIsAvatarOpen(false);
  };

  const removeAvatar = () => {
    setDraft((prev) => (prev ? { ...prev, thumbnail: "" } : prev));
    if (avatarLocalPreview) URL.revokeObjectURL(avatarLocalPreview);
    setAvatarLocalPreview(null);
  };

  return (
    <>
      <article className={styles.card}>
        <header className={styles.cardHeader}>
          <div>
            <div className={styles.cardTitle}>Profile</div>
            <div className={styles.cardSubtitle}>Your identity and preferences.</div>
          </div>
          <div className={[styles.actionsRow, styles.desktopOnly].join(" ")}>
            <button type="button" className={styles.secondaryButton} onClick={cancel} disabled={saveState !== "dirty"}>
              Cancel
            </button>
            <button type="button" className={styles.primaryButton} onClick={() => void save()} disabled={!canSave}>
              {saveState === "saving" ? "Saving…" : "Save changes"}
            </button>
          </div>
        </header>

        <div className={styles.cardBody}>
          <div className={styles.twoCol}>
            <div className={styles.avatarBlock}>
              <div className={styles.avatarSquircle} aria-label="Avatar">
                {avatarSrc ? <img src={avatarSrc} alt="" /> : initialsFromUser(userData)}
              </div>
              <div className={styles.avatarActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => setIsAvatarOpen(true)}>
                  Change photo
                </button>
                {showRemove ? (
                  <button
                    type="button"
                    className={[styles.textButton, styles.textButtonDanger].join(" ")}
                    onClick={removeAvatar}
                  >
                    Remove
                  </button>
                ) : null}
                <div className={styles.helper}>Recommended 512×512+. Square images look best.</div>
              </div>
            </div>

            <div className={styles.fieldsGrid}>
              <label className={styles.field}>
                <span className={styles.label}>First name</span>
                <input
                  className={styles.input}
                  value={draft.firstName}
                  onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
                  placeholder="First name"
                  autoComplete="given-name"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Last name</span>
                <input
                  className={styles.input}
                  value={draft.lastName}
                  onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
                  placeholder="Last name"
                  autoComplete="family-name"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Email</span>
                <input className={styles.input} value={userData.email ?? ""} disabled readOnly />
                <span className={styles.helper}>Email is managed by your sign-in provider.</span>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Phone</span>
                <input
                  className={styles.input}
                  value={draft.phoneNumber}
                  onChange={(e) => setDraft({ ...draft, phoneNumber: e.target.value })}
                  placeholder="(555) 555-5555"
                  autoComplete="tel"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Company</span>
                <input
                  className={styles.input}
                  value={draft.company}
                  onChange={(e) => setDraft({ ...draft, company: e.target.value })}
                  placeholder="Company"
                  autoComplete="organization"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Occupation</span>
                <input
                  className={styles.input}
                  value={draft.occupation}
                  onChange={(e) => setDraft({ ...draft, occupation: e.target.value })}
                  placeholder="Designer, PM, Builder…"
                />
              </label>
            </div>
          </div>

          {userData.role ? (
            <div className={styles.helper} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.86)" }}>Role:</span>
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.9)",
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "capitalize",
                }}
                title={ROLE_DESCRIPTIONS[roleKey] || ""}
              >
                {userData.role}
              </span>
              <span title={ROLE_DESCRIPTIONS[roleKey] || ""} aria-label="Role help">
                <HelpCircle size={14} style={{ opacity: 0.7 }} />
              </span>
            </div>
          ) : null}

          <div className={styles.mobileSaveBar}>
            <div className={styles.mobileSaveBarInner}>
              <button type="button" className={styles.secondaryButton} onClick={cancel} disabled={saveState !== "dirty"}>
                Cancel
              </button>
              <button type="button" className={styles.primaryButton} onClick={() => void save()} disabled={!canSave}>
                {saveState === "saving" ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </article>

      <AvatarPickerModal
        open={isAvatarOpen}
        onClose={() => setIsAvatarOpen(false)}
        userId={userData.userId}
        onSaved={handleAvatarSaved}
      />
    </>
  );
}
