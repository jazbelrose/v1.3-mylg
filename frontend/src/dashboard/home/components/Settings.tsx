import React, { useEffect, useMemo, useRef, useState, ChangeEvent } from "react";
import { useData } from "@/app/contexts/useData";
import { uploadData } from "aws-amplify/storage";
import { updatePassword } from "aws-amplify/auth";

import { toast } from "react-toastify";
import { updateUserProfile } from "@/shared/utils/api";
import PaymentsSection from "@/dashboard/home/components/paymentsection";
import { HelpCircle, User as UserIcon } from "lucide-react";
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

  const { firstName, lastName, company, email, phoneNumber, occupation } = formData;

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
  const roleHelpButtonRef = useRef<HTMLButtonElement | null>(null);
  const isHoveringRoleTooltip = useRef<boolean>(false);

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
  const roleTooltipId = "account-role-tooltip";

  const avatarSrc = useMemo(() => {
    if (localPreview) {
      return localPreview;
    }

    return resolveStoredFileUrl(formData.thumbnail || undefined, userData?.thumbnailUrl as string | undefined);
  }, [formData.thumbnail, localPreview, userData?.thumbnailUrl]);

  useEffect(() => {
    if (
      isRoleTooltipOpen &&
      roleTooltipRef.current &&
      document.activeElement === roleHelpButtonRef.current
    ) {
      roleTooltipRef.current.focus();
    }
  }, [isRoleTooltipOpen]);

  useEffect(() => {
    setIsRoleTooltipOpen(false);
    isHoveringRoleTooltip.current = false;
  }, [roleKey]);

  const closeRoleTooltip = () => setIsRoleTooltipOpen(false);

  const toggleRoleTooltip = () => {
    setIsRoleTooltipOpen((prev) => {
      if (isHoveringRoleTooltip.current && prev) {
        return prev;
      }

      return !prev;
    });
  };

  const handleRoleTooltipKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeRoleTooltip();
    }
  };

  return (
    <section className="accountPage" aria-labelledby="account-info-title">
      <div className="accountCard">
        <div className="section">
          <h2 id="account-info-title">Account Info</h2>

          <div className="headerRow">
            <div className="avatarStack">
              <span className="avatarLabel" id="profile-picture-label">
                Profile picture
              </span>
              <label
                htmlFor="account-avatar"
                className="avatarUpload"
                aria-label="Update profile picture"
                role="button"
              >
                <div className="avatar" aria-hidden="true">
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="" className="avatarImage" />
                  ) : (
                    <UserIcon className="avatarPlaceholder" aria-hidden="true" />
                  )}
                  <span className="avatarAffordance" aria-hidden="true">
                    ＋
                  </span>
                </div>
                <input
                  type="file"
                  id="account-avatar"
                  className="avatarInput"
                  accept="image/*"
                  onChange={handleThumbnailChange}
                  aria-labelledby="profile-picture-label"
                />
              </label>
            </div>

            <div className="headerMeta">
              <div
                className="badgeCluster"
                onMouseEnter={() => {
                  isHoveringRoleTooltip.current = true;
                  setIsRoleTooltipOpen(true);
                }}
                onMouseLeave={() => {
                  isHoveringRoleTooltip.current = false;
                  closeRoleTooltip();
                }}
              >
                <div className="badgeRow">
                  {roleKey ? (
                    <span className="badgeAdmin" role="status">
                      {userData?.role}
                    </span>
                  ) : null}
                  {ROLE_DESCRIPTIONS[roleKey] ? (
                    <button
                      ref={roleHelpButtonRef}
                      type="button"
                      className="badgeHelp"
                      aria-label="What does this role mean?"
                      aria-expanded={isRoleTooltipOpen}
                      aria-controls={roleTooltipId}
                      aria-describedby={isRoleTooltipOpen ? roleTooltipId : undefined}
                      onClick={toggleRoleTooltip}
                      onFocus={() => setIsRoleTooltipOpen(true)}
                      onBlur={closeRoleTooltip}
                      onKeyDown={handleRoleTooltipKeyDown}
                    >
                      <HelpCircle size={18} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                {ROLE_DESCRIPTIONS[roleKey] ? (
                  <div
                    id={roleTooltipId}
                    ref={roleTooltipRef}
                    role="tooltip"
                    tabIndex={-1}
                    className={`roleTooltip${isRoleTooltipOpen ? " is-visible" : ""}`}
                    aria-hidden={!isRoleTooltipOpen}
                  >
                    {ROLE_DESCRIPTIONS[roleKey]}
                  </div>
                ) : null}
              </div>
              <p className="headerName">
                {[firstName, lastName].filter(Boolean).join(" ") || userData?.email || ""}
              </p>
              <p className="headerEmail">{userData?.email}</p>
            </div>
          </div>

          <form className="form" onSubmit={handleSubmit} noValidate>
            <div>
              <label className="formLabel" htmlFor="firstName">
                First Name
              </label>
              <input
                id="firstName"
                className="input"
                aria-label="First Name"
                value={firstName}
                autoComplete="given-name"
                onChange={(event) => setFormData((prev) => ({ ...prev, firstName: event.target.value }))}
              />
            </div>

            <div>
              <label className="formLabel" htmlFor="lastName">
                Last Name
              </label>
              <input
                id="lastName"
                className="input"
                aria-label="Last Name"
                value={lastName}
                autoComplete="family-name"
                onChange={(event) => setFormData((prev) => ({ ...prev, lastName: event.target.value }))}
              />
            </div>

            <div className="span-2">
              <label className="formLabel" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="input"
                aria-label="Email"
                type="email"
                value={email}
                autoComplete="email"
                onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
              />
            </div>

            <div>
              <label className="formLabel" htmlFor="phoneNumber">
                Phone Number
              </label>
              <input
                id="phoneNumber"
                className="input"
                aria-label="Phone Number"
                type="tel"
                value={phoneNumber}
                autoComplete="tel"
                onChange={(event) => setFormData((prev) => ({ ...prev, phoneNumber: event.target.value }))}
              />
            </div>

            <div>
              <label className="formLabel" htmlFor="company">
                Organization
              </label>
              <input
                id="company"
                className="input"
                aria-label="Organization"
                value={company}
                autoComplete="organization"
                onChange={(event) => setFormData((prev) => ({ ...prev, company: event.target.value }))}
              />
            </div>

            <div className="span-2">
              <label className="formLabel" htmlFor="occupation">
                Occupation
              </label>
              <input
                id="occupation"
                className="input"
                aria-label="Occupation"
                value={occupation}
                autoComplete="organization-title"
                onChange={(event) => setFormData((prev) => ({ ...prev, occupation: event.target.value }))}
              />
            </div>

            <div className="formActions span-2">
              <button type="submit" className="saveButton" disabled={isSaving || !isFormDirty}>
                {isSaving ? "Saving..." : showSavedWindow ? "Saved. Nice." : "Save"}
              </button>
            </div>

            <div className="formEndSpacer span-2" aria-hidden="true" />
          </form>
        </div>

        <div className="section">
          <h3 className="sectionTitle">Security</h3>
          <button
            type="button"
            className="passwordToggle"
            onClick={() => setShowPasswordFields((previous) => !previous)}
          >
            {showPasswordFields ? "Hide password fields" : "Change Password"}
          </button>

          {showPasswordFields && (
            <div className="passwordGrid">
              <div>
                <label className="formLabel" htmlFor="oldPassword">
                  Current Password
                </label>
                <input
                  id="oldPassword"
                  type="password"
                  className="input"
                  aria-label="Current Password"
                  value={oldPassword}
                  onChange={(event) => setOldPassword(event.target.value)}
                />
              </div>
              <div>
                <label className="formLabel" htmlFor="newPassword">
                  New Password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  className="input"
                  aria-label="New Password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </div>
              <div>
                <label className="formLabel" htmlFor="confirmNewPassword">
                  Confirm New Password
                </label>
                <input
                  id="confirmNewPassword"
                  type="password"
                  className="input"
                  aria-label="Confirm New Password"
                  value={confirmNewPassword}
                  onChange={(event) => setConfirmNewPassword(event.target.value)}
                />
              </div>
              {passwordChangeStatus && (
                <div className="passwordStatus span-2" role="status">
                  {passwordChangeStatus}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="accountPayments">
        <PaymentsSection
          lastInvoiceDate={userData?.invoices?.[0]?.date}
          lastInvoiceAmount={
            typeof userData?.invoices?.[0]?.amount === "number"
              ? userData.invoices[0].amount.toLocaleString("en-US", { style: "currency", currency: "USD" })
              : String(userData?.invoices?.[0]?.amount || "N/A")
          }
          invoiceList={[]}
        />
      </div>
    </section>
  );
};

export default Settings;












