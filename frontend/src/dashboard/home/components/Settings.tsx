import React, { useCallback, useEffect, useRef, useState, ChangeEvent } from "react";
import { useData } from "@/app/contexts/useData";
import { uploadData } from "aws-amplify/storage";
import { updatePassword } from "aws-amplify/auth";

import { toast } from "react-toastify";
import { updateUserProfile } from "@/shared/utils/api";
import PaymentsSection from "@/dashboard/home/components/paymentsection";
import EditableTextField from "@/shared/ui/EditableTextField";
import UserProfilePicture from "@/shared/ui/UserProfilePicture";
import { HelpCircle } from "lucide-react";
import { resolveStoredFileUrl } from "@/shared/utils/media";

type RoleKey = "admin" | "designer" | "builder" | "vendor" | "client" | "";

interface UserData extends Record<string, unknown> {
  userId: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  email?: string;
  phoneNumber?: string;
  thumbnail?: string;
  occupation?: string;
  role?: string;
  invoices?: { date?: string; amount?: number }[];
}

interface FormDataShape {
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phoneNumber: string;
  thumbnail: string;
  occupation: string;
}

const Settings: React.FC = () => {
  // Contexts (loosely typed to ease drop-in)
  const { refreshUser } = useData() as { refreshUser: (force?: boolean) => Promise<void> };
  const { userData, setUserData, toggleSettingsUpdated } = useData() as {
    userData: UserData;
    setUserData: (u: UserData) => void;
    toggleSettingsUpdated: () => void;
  };

  const [formData, setFormData] = useState<FormDataShape>({
    firstName: userData?.firstName || "",
    lastName: userData?.lastName || "",
    company: userData?.company || "",
    email: userData?.email || "",
    phoneNumber: userData?.phoneNumber || "",
    thumbnail: userData?.thumbnail || "",
    occupation: userData?.occupation || "",
  });

  const { firstName, lastName, company, email, phoneNumber, occupation, thumbnail } = formData;

  const [oldPassword, setOldPassword] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>("");
  const [passwordChangeStatus, setPasswordChangeStatus] = useState<string>("");
  const [showPasswordFields, setShowPasswordFields] = useState<boolean>(false);
  const [showSavedWindow, setShowSavedWindow] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isFormDirty, setIsFormDirty] = useState<boolean>(false);

  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [uploadedKey, setUploadedKey] = useState<string | null>(null);
  const [isRoleTooltipOpen, setIsRoleTooltipOpen] = useState<boolean>(false);

  const passwordCurrentRef = useRef<HTMLInputElement | null>(null);
  const roleTooltipRef = useRef<HTMLDivElement | null>(null);
  const roleInfoButtonRef = useRef<HTMLButtonElement | null>(null);

  const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
    admin: "Full administrative access",
    designer: "Create and manage designs",
    builder: "Manage build tasks",
    vendor: "Vendor access to supply orders",
    client: "View project progress",
    "": "",
  };

  useEffect(() => {
    if (showSavedWindow) {
      const timeoutId = setTimeout(() => setShowSavedWindow(false), 3000);
      return () => clearTimeout(timeoutId);
    }
  }, [showSavedWindow]);

  // Refresh form when userData changes
  useEffect(() => {
    setFormData({
      firstName: userData?.firstName || "",
      lastName: userData?.lastName || "",
      company: userData?.company || "",
      email: userData?.email || "",
      phoneNumber: userData?.phoneNumber || "",
      occupation: userData?.occupation || "",
      thumbnail: userData?.thumbnail ? `${userData.thumbnail}?t=${Date.now()}` : "",
    });
  }, [userData]);

  const handleFileUpload = async (userId: string, file: File): Promise<string> => {
    try {
      const filename = `userData-thumbnails/${userId}/${file.name}`;
      await uploadData({
        key: filename,
        data: file,
        options: { accessLevel: "guest" },
      });
      return filename;
    } catch (error) {
      console.error("Error uploading thumbnail:", error);
      toast.error("Failed to upload image");
      throw error;
    }
  };

  const handleThumbnailChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewURL = URL.createObjectURL(file);
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(previewURL);
    setIsFormDirty(true);

    try {
      const uploaded = await handleFileUpload(userData.userId, file);
      setUploadedKey(uploaded);
      setFormData((prev) => ({ ...prev, thumbnail: `${uploaded}?t=${Date.now()}` }));

      console.log("Uploaded key stored:", uploaded);
    } catch {
      // already toasted inside handleFileUpload
    } finally {
      // reset input value to allow re-uploading same file if needed
      e.target.value = "";
    }
  };

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const checkIfFormIsDirty = () => {
    const initialValues: Omit<FormDataShape, "thumbnail"> = {
      firstName: userData?.firstName || "",
      lastName: userData?.lastName || "",
      company: userData?.company || "",
      email: userData?.email || "",
      phoneNumber: userData?.phoneNumber || "",
      occupation: userData?.occupation || "",
    };

    const profileDirty = (Object.keys(initialValues) as Array<keyof typeof initialValues>).some(
      (key) => formData[key] !== initialValues[key]
    );

    const passwordDirty =
      oldPassword.trim() !== "" || newPassword.trim() !== "" || confirmNewPassword.trim() !== "";

    setIsFormDirty(profileDirty || passwordDirty || Boolean(uploadedKey));
  };

  useEffect(() => {
    checkIfFormIsDirty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, oldPassword, newPassword, confirmNewPassword, uploadedKey]);

  useEffect(() => {
    if (showPasswordFields) {
      passwordCurrentRef.current?.focus();
    }
  }, [showPasswordFields]);

  const closeRoleTooltip = useCallback(() => {
    setIsRoleTooltipOpen(false);
    roleInfoButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isRoleTooltipOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        roleTooltipRef.current &&
        !roleTooltipRef.current.contains(target) &&
        !roleInfoButtonRef.current?.contains(target)
      ) {
        closeRoleTooltip();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRoleTooltip();
        return;
      }

      if (event.key === "Tab" && roleTooltipRef.current) {
        const focusable = roleTooltipRef.current.querySelectorAll<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
        );

        if (!focusable.length) {
          event.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const activeElement = document.activeElement;

        if (event.shiftKey) {
          if (activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else if (activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    const firstFocusable = roleTooltipRef.current.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
    );
    firstFocusable?.focus();

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeRoleTooltip, isRoleTooltipOpen]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);

    let passwordChangeError = false;

    // Password change flow if fields provided
    if (oldPassword && newPassword && confirmNewPassword) {
      if (newPassword !== confirmNewPassword) {
        setPasswordChangeStatus("New passwords do not match.");
        passwordChangeError = true;
      } else {
        try {
          await updatePassword({
            oldPassword,
            newPassword,
          });
          setPasswordChangeStatus("Password successfully changed.");
        } catch (error) {
           
          console.error("Error changing password:", error);
          setPasswordChangeStatus("Failed to change password. Please try again.");
          toast.error("Failed to change password");
          passwordChangeError = true;
        }
      }
    }

    if (passwordChangeError) {
      setIsSaving(false);
      return;
    }

    try {
      const updatedUserData: UserData = {
        ...userData,
        ...formData,
        thumbnail: uploadedKey || formData.thumbnail.split("?")[0],
      };

      await updateUserProfile(updatedUserData);
      const thumbnailUrl = resolveStoredFileUrl(updatedUserData.thumbnail) || undefined;
      setUserData({
        ...updatedUserData,
        thumbnailUrl,
      });
      toggleSettingsUpdated();
      setShowSavedWindow(true);
      toast.success("Saved. Nice.");
      setIsFormDirty(false);
      setUploadedKey(null);

      // Refresh user session/profile
      await refreshUser(true);

      // Reset password fields
      setOldPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordChangeStatus("");
    } catch (error) {
       
      console.error("Failed to update user profile:", error);
      toast.error("Failed to update profile");
    }

    setIsSaving(false);
  };

  const roleKey = ((userData?.role || "").toLowerCase() as RoleKey) || "";
  const roleLabel = userData?.role?.trim() || "Member";
  const roleDescription = ROLE_DESCRIPTIONS[roleKey] || "Personal workspace permissions";

  const handlePasswordToggle = () => {
    setShowPasswordFields((prev) => {
      if (prev) {
        setOldPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
        setPasswordChangeStatus("");
      }
      return !prev;
    });
  };

  const handleRoleTooltipToggle = () => {
    setIsRoleTooltipOpen((prev) => !prev);
  };

  return (
    <section
      className="settings-content account-settings-page"
      aria-labelledby="account-settings-heading"
    >
      <div className="settings-container account-settings-card">
        <form
          onSubmit={handleSubmit}
          className="account-settings-form"
          aria-labelledby="account-settings-heading"
        >
          <header className="account-settings-header">
            <div className="account-settings-identity">
              <UserProfilePicture
                thumbnail={thumbnail}
                thumbnailUrl={userData?.thumbnailUrl as string | undefined}
                localPreview={localPreview || undefined}
                onChange={handleThumbnailChange}
              />
              <div className="account-settings-heading-group">
                <p className="account-settings-eyebrow">Account</p>
                <h2 id="account-settings-heading" className="account-settings-title">
                  Account Info
                </h2>
                <div className="account-settings-role">
                  <span className={`account-settings-role-badge role-${roleKey || "default"}`}>
                    {roleLabel}
                  </span>
                  <div className="account-settings-role-popover">
                    <button
                      type="button"
                      className="account-settings-role-info"
                      onClick={handleRoleTooltipToggle}
                      aria-expanded={isRoleTooltipOpen}
                      aria-controls="account-role-tooltip"
                      ref={roleInfoButtonRef}
                    >
                      <HelpCircle size={18} aria-hidden="true" />
                      <span className="sr-only">View role permissions</span>
                    </button>
                    {isRoleTooltipOpen && (
                      <div
                        id="account-role-tooltip"
                        className="account-settings-tooltip"
                        role="dialog"
                        aria-modal="false"
                        aria-label="Role permissions"
                        ref={roleTooltipRef}
                      >
                        <p className="account-settings-tooltip__text">{roleDescription}</p>
                        <button
                          type="button"
                          className="account-settings-tooltip__close"
                          onClick={closeRoleTooltip}
                        >
                          Got it
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="account-settings-actions">
              <button
                type="button"
                className="account-settings-action-button"
                onClick={handlePasswordToggle}
                aria-expanded={showPasswordFields}
                aria-controls="password-fields"
              >
                Change Password
              </button>
            </div>
          </header>

          <div className="account-settings-field-grid">
            <EditableTextField
              id="firstName"
              label="First Name"
              value={firstName}
              onChange={(v: string) => setFormData((p) => ({ ...p, firstName: v }))}
            />
            <EditableTextField
              id="lastName"
              label="Last Name"
              value={lastName}
              onChange={(v: string) => setFormData((p) => ({ ...p, lastName: v }))}
            />
            <EditableTextField
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={(v: string) => setFormData((p) => ({ ...p, email: v }))}
            />
            <EditableTextField
              id="phoneNumber"
              label="Phone Number"
              type="tel"
              value={phoneNumber}
              onChange={(v: string) => setFormData((p) => ({ ...p, phoneNumber: v }))}
            />
            <EditableTextField
              id="company"
              label="Organization"
              value={company}
              onChange={(v: string) => setFormData((p) => ({ ...p, company: v }))}
            />
            <EditableTextField
              id="occupation"
              label="Occupation"
              value={occupation}
              onChange={(v: string) => setFormData((p) => ({ ...p, occupation: v }))}
            />
          </div>

          {showPasswordFields && (
            <section
              className="account-settings-password"
              id="password-fields"
              aria-label="Change password"
            >
              <h3 className="account-settings-section-title">Update password</h3>
              <div className="account-settings-password-grid">
                <div className="account-settings-password-field">
                  <label htmlFor="old-password" className="account-field__label">
                    Current password
                  </label>
                  <input
                    id="old-password"
                    ref={passwordCurrentRef}
                    type="password"
                    className="account-settings-input"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    aria-label="Current password"
                    autoComplete="current-password"
                  />
                </div>
                <div className="account-settings-password-field">
                  <label htmlFor="new-password" className="account-field__label">
                    New password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    className="account-settings-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    aria-label="New password"
                    autoComplete="new-password"
                  />
                </div>
                <div className="account-settings-password-field">
                  <label htmlFor="confirm-password" className="account-field__label">
                    Confirm new password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    className="account-settings-input"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    aria-label="Confirm new password"
                    autoComplete="new-password"
                  />
                </div>
              </div>
              {passwordChangeStatus && (
                <div className="account-settings-password-status" role="status">
                  {passwordChangeStatus}
                </div>
              )}
            </section>
          )}

          <div className="account-settings-footer">
            <button
              type="submit"
              className="account-settings-save"
              disabled={isSaving || !isFormDirty}
            >
              {isSaving ? "Saving..." : showSavedWindow ? "Saved. Nice." : "Save"}
            </button>
          </div>
        </form>

        <div className="account-settings-divider" role="presentation" />

        <PaymentsSection
          lastInvoiceDate={userData?.invoices?.[0]?.date}
          lastInvoiceAmount={
            typeof userData?.invoices?.[0]?.amount === "number"
              ? userData.invoices[0].amount.toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                })
              : String(userData?.invoices?.[0]?.amount || "N/A")
          }
          invoiceList={[]}
        />
      </div>
    </section>
  );
};

export default Settings;












