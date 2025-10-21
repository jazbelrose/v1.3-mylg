import React, { useCallback, useEffect, useId, useRef, useState, ChangeEvent } from "react";
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
  const roleTooltipRef = useRef<HTMLDivElement | null>(null);
  const roleTooltipButtonRef = useRef<HTMLButtonElement | null>(null);
  const roleTooltipId = useId();
  const passwordSectionId = useId();

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

  const closeRoleTooltip = useCallback(() => {
    setIsRoleTooltipOpen(false);
  }, []);

  const handleTogglePasswordFields = useCallback(() => {
    setShowPasswordFields((prev) => {
      if (prev) {
        setOldPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
        setPasswordChangeStatus("");
      }
      return !prev;
    });
  }, []);

  useEffect(() => {
    if (!isRoleTooltipOpen) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !roleTooltipRef.current?.contains(target) &&
        !roleTooltipButtonRef.current?.contains(target)
      ) {
        closeRoleTooltip();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRoleTooltip();
        roleTooltipButtonRef.current?.focus();
      }
      if (event.key === "Tab") {
        event.preventDefault();
        roleTooltipRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeRoleTooltip, isRoleTooltipOpen]);

  useEffect(() => {
    if (isRoleTooltipOpen) {
      requestAnimationFrame(() => {
        roleTooltipRef.current?.focus();
      });
    }
  }, [isRoleTooltipOpen]);

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

  return (
    <div className="settings-content">
      <div className="settings-container">
        <section className="account-card squircle" aria-labelledby="account-info-heading">
          <header className="settings-header">
            <div className="settings-identity">
              <UserProfilePicture
                thumbnail={thumbnail}
                thumbnailUrl={userData?.thumbnailUrl as string | undefined}
                localPreview={localPreview || undefined}
                onChange={handleThumbnailChange}
                hideLabel
              />
              <div className="settings-header-text">
                <span className="settings-header-eyebrow">Account</span>
                <h2 id="account-info-heading" className="settings-title">
                  Account Info
                </h2>
                <div className="role-display">
                  <span className={`role-badge role-${roleKey}`}>
                    {userData?.role}
                  </span>
                  <button
                    type="button"
                    className="role-info-button"
                    aria-expanded={isRoleTooltipOpen}
                    aria-controls={roleTooltipId}
                    onClick={() => setIsRoleTooltipOpen((prev) => !prev)}
                    ref={roleTooltipButtonRef}
                    aria-label={`Learn about the ${userData?.role ?? 'current'} role`}
                  >
                    <HelpCircle size={18} className="role-info" aria-hidden="true" focusable="false" />
                  </button>
                  {isRoleTooltipOpen && (
                    <div
                      id={roleTooltipId}
                      className="role-tooltip"
                      role="dialog"
                      aria-label={`${userData?.role ?? 'Account'} role details`}
                      ref={roleTooltipRef}
                      tabIndex={-1}
                      onKeyDown={(event) => {
                        if (event.key === 'Tab') {
                          event.preventDefault();
                        }
                      }}
                    >
                      <p>{ROLE_DESCRIPTIONS[roleKey]}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="settings-header-actions">
              <button
                type="button"
                className="settings-quick-action"
                onClick={handleTogglePasswordFields}
              >
                {showPasswordFields ? 'Cancel password update' : 'Change password'}
              </button>
            </div>
          </header>

          <form className="account-form" onSubmit={handleSubmit} aria-labelledby="account-info-heading">
            <div className="account-form-grid">
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
              <section className="account-password-section" aria-labelledby={passwordSectionId}>
                <h3 id={passwordSectionId} className="account-subheading">
                  Update password
                </h3>
                <div className="account-password-grid">
                  <div className="form-group">
                    <label htmlFor="oldPassword">Current password</label>
                    <input
                      id="oldPassword"
                      type="password"
                      className="modal-input-password"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      placeholder="Current password"
                      aria-label="Current password"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="newPassword">New password</label>
                    <input
                      id="newPassword"
                      type="password"
                      className="modal-input-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password"
                      aria-label="New password"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="confirmNewPassword">Confirm new password</label>
                    <input
                      id="confirmNewPassword"
                      type="password"
                      className="modal-input-password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Confirm new password"
                      aria-label="Confirm new password"
                    />
                  </div>
                </div>
                {passwordChangeStatus && (
                  <p className="account-password-status" role="status">
                    {passwordChangeStatus}
                  </p>
                )}
              </section>
            )}

            <div className="form-footer">
              <button
                type="submit"
                className="modal-submit-button settings primary"
                disabled={isSaving || !isFormDirty}
              >
                {isSaving ? "Saving..." : showSavedWindow ? "Saved. Nice." : "Save"}
              </button>
            </div>
          </form>

          <hr className="section-divider" />

          <PaymentsSection
            lastInvoiceDate={userData?.invoices?.[0]?.date}
            lastInvoiceAmount={
              typeof userData?.invoices?.[0]?.amount === "number"
                ? userData.invoices[0].amount.toLocaleString("en-US", { style: "currency", currency: "USD" })
                : String(userData?.invoices?.[0]?.amount || "N/A")
            }
            invoiceList={[]}
          />
        </section>
      </div>
    </div>
  );
};

export default Settings;












