import React from "react";
import { toast } from "react-toastify";
import { ChevronDown } from "lucide-react";

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
  bio?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
};

type Draft = {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  company: string;
  occupation: string;
  thumbnail: string; // S3 key, URL, or empty string
  bio: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
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
    bio: String(userData.bio ?? ""),
    addressLine1: String(userData.addressLine1 ?? ""),
    addressLine2: String(userData.addressLine2 ?? ""),
    city: String(userData.city ?? ""),
    region: String(userData.region ?? ""),
    postalCode: String(userData.postalCode ?? ""),
    country: String(userData.country ?? ""),
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
    (baseline.thumbnail || "") !== (draft.thumbnail || "") ||
    baseline.bio !== draft.bio ||
    baseline.addressLine1 !== draft.addressLine1 ||
    baseline.addressLine2 !== draft.addressLine2 ||
    baseline.city !== draft.city ||
    baseline.region !== draft.region ||
    baseline.postalCode !== draft.postalCode ||
    baseline.country !== draft.country
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

  const [isMobile, setIsMobile] = React.useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(max-width: 767px)").matches;
  });

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const q = window.matchMedia("(max-width: 767px)");
    const update = (event: MediaQueryList | MediaQueryListEvent) => setIsMobile(event.matches);
    update(q);
    if (typeof q.addEventListener === "function") {
      q.addEventListener("change", update);
      return () => q.removeEventListener("change", update);
    }
    q.addListener(update);
    return () => q.removeListener(update);
  }, []);


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
  const roleLabel = userData.role ? `Role: ${String(userData.role).replace(/^./, (c) => c.toUpperCase())}` : "";

  const aboutMaxChars = 280;
  const aboutChars = draft.bio.length;

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
        bio: draft.bio,
        addressLine1: draft.addressLine1,
        addressLine2: draft.addressLine2,
        city: draft.city,
        region: draft.region,
        postalCode: draft.postalCode,
        country: draft.country,
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
      <div className={styles.profilePanelContainer}>
        <div className={styles.profileGrid}>
          <article className={styles.card}>
            <header className={styles.cardHeader}>
              <div>
                <div className={styles.cardTitle}>Avatar</div>
                <div className={styles.cardSubtitle}>Photo and presence.</div>
              </div>
            </header>
            <div className={styles.cardBody}>
              <div className={styles.avatarCardBody}>
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
            </div>
          </article>

          <article className={styles.card}>
            <header className={styles.cardHeader}>
              <div>
                <div className={styles.cardTitle}>Identity</div>
                <div className={styles.cardSubtitle}>Your core account details.</div>
              </div>
              <div className={[styles.identityHeaderRight, styles.desktopOnly].join(" ")}>
                {userData.role ? (
                  <span
                    className={[styles.pill, styles.pillMuted].join(" ")}
                    title={ROLE_DESCRIPTIONS[roleKey] || ""}
                    aria-label={roleLabel}
                  >
                    {roleLabel}
                  </span>
                ) : null}
                <div className={styles.actionsRow}>
                  <button type="button" className={styles.secondaryButton} onClick={cancel} disabled={saveState !== "dirty"}>
                    Cancel
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={() => void save()} disabled={!canSave}>
                    {saveState === "saving" ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            </header>

            <div className={styles.cardBody}>
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
          </article>

          <article className={[styles.card, styles.cardSpan2].join(" ")}>
            <header className={styles.cardHeader}>
              <div>
                <div className={styles.cardTitle}>About</div>
                <div className={styles.cardSubtitle}>Short bio shown to teammates (optional).</div>
              </div>
              <div className={styles.textMeta} aria-label="Bio character count">
                {aboutChars}/{aboutMaxChars}
              </div>
            </header>
            <div className={styles.cardBody}>
              <label className={styles.field}>
                <span className={styles.label}>Bio</span>
                <textarea
                  className={styles.textarea}
                  value={draft.bio}
                  onChange={(e) => setDraft({ ...draft, bio: e.target.value.slice(0, aboutMaxChars) })}
                  placeholder="A sentence or two about you…"
                  rows={5}
                />
              </label>
            </div>
          </article>

          {isMobile ? (
            <details className={[styles.card, styles.cardSpan2, styles.addressAccordion].join(" ")} key="address-mobile">
              <summary className={styles.addressSummary}>
                <span className={styles.addressSummaryLeft}>
                  <span className={styles.addressSummaryTitle}>Address</span>
                  <span className={styles.addressSummarySubtitle}>Optional</span>
                </span>
                <ChevronDown size={18} className={styles.addressChevron} aria-hidden />
              </summary>
              <div className={styles.cardBody}>
                <div className={styles.addressTopRow}>
                  <label className={styles.field}>
                    <span className={styles.label}>Address line 1</span>
                    <input
                      className={styles.input}
                      value={draft.addressLine1}
                      onChange={(e) => setDraft({ ...draft, addressLine1: e.target.value })}
                      autoComplete="address-line1"
                      placeholder="Street address"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Address line 2</span>
                    <input
                      className={styles.input}
                      value={draft.addressLine2}
                      onChange={(e) => setDraft({ ...draft, addressLine2: e.target.value })}
                      autoComplete="address-line2"
                      placeholder="Apt, suite, unit (optional)"
                    />
                  </label>
                </div>
                <div className={styles.addressBottomRow}>
                  <label className={styles.field}>
                    <span className={styles.label}>City</span>
                    <input
                      className={styles.input}
                      value={draft.city}
                      onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                      autoComplete="address-level2"
                      placeholder="City"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>State / Region</span>
                    <input
                      className={styles.input}
                      value={draft.region}
                      onChange={(e) => setDraft({ ...draft, region: e.target.value })}
                      autoComplete="address-level1"
                      placeholder="State / Region"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Zip / Postal</span>
                    <input
                      className={styles.input}
                      value={draft.postalCode}
                      onChange={(e) => setDraft({ ...draft, postalCode: e.target.value })}
                      autoComplete="postal-code"
                      placeholder="Zip / Postal"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Country</span>
                    <input
                      className={styles.input}
                      value={draft.country}
                      onChange={(e) => setDraft({ ...draft, country: e.target.value })}
                      autoComplete="country-name"
                      placeholder="Country"
                    />
                  </label>
                </div>
              </div>
            </details>
          ) : (
            <article className={[styles.card, styles.cardSpan2].join(" ")}>
              <header className={styles.cardHeader}>
                <div>
                  <div className={styles.cardTitle}>Address</div>
                  <div className={styles.cardSubtitle}>Physical address (optional).</div>
                </div>
              </header>
              <div className={styles.cardBody}>
                <div className={styles.addressTopRow}>
                  <label className={styles.field}>
                    <span className={styles.label}>Address line 1</span>
                    <input
                      className={styles.input}
                      value={draft.addressLine1}
                      onChange={(e) => setDraft({ ...draft, addressLine1: e.target.value })}
                      autoComplete="address-line1"
                      placeholder="Street address"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Address line 2</span>
                    <input
                      className={styles.input}
                      value={draft.addressLine2}
                      onChange={(e) => setDraft({ ...draft, addressLine2: e.target.value })}
                      autoComplete="address-line2"
                      placeholder="Apt, suite, unit (optional)"
                    />
                  </label>
                </div>
                <div className={styles.addressBottomRow}>
                  <label className={styles.field}>
                    <span className={styles.label}>City</span>
                    <input
                      className={styles.input}
                      value={draft.city}
                      onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                      autoComplete="address-level2"
                      placeholder="City"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>State / Region</span>
                    <input
                      className={styles.input}
                      value={draft.region}
                      onChange={(e) => setDraft({ ...draft, region: e.target.value })}
                      autoComplete="address-level1"
                      placeholder="State / Region"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Zip / Postal</span>
                    <input
                      className={styles.input}
                      value={draft.postalCode}
                      onChange={(e) => setDraft({ ...draft, postalCode: e.target.value })}
                      autoComplete="postal-code"
                      placeholder="Zip / Postal"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Country</span>
                    <input
                      className={styles.input}
                      value={draft.country}
                      onChange={(e) => setDraft({ ...draft, country: e.target.value })}
                      autoComplete="country-name"
                      placeholder="Country"
                    />
                  </label>
                </div>
              </div>
            </article>
          )}
        </div>

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

      <AvatarPickerModal
        open={isAvatarOpen}
        onClose={() => setIsAvatarOpen(false)}
        userId={userData.userId}
        onSaved={handleAvatarSaved}
      />
    </>
  );
}
