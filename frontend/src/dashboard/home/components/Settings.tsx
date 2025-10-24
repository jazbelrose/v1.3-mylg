import React, { useEffect, useState, ChangeEvent } from "react";
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
  organizationAddress?: string;
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
  organizationAddress: string;
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
    organizationAddress: userData?.organizationAddress || "",
    email: userData?.email || "",
    phoneNumber: userData?.phoneNumber || "",
    thumbnail: userData?.thumbnail || "",
    occupation: userData?.occupation || "",
  });

  const { firstName, lastName, company, organizationAddress, email, phoneNumber, occupation, thumbnail } =
    formData;

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
      organizationAddress: userData?.organizationAddress || "",
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
      organizationAddress: userData?.organizationAddress || "",
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
        organizationAddress: formData.organizationAddress,
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
    <>
      <div className="settings-content">
        <div className="settings-container">
          <h2 className="section-heading">Account Info</h2>

          <form onSubmit={handleSubmit}>
            <div className="settings-row">
              <UserProfilePicture
                thumbnail={thumbnail}
                thumbnailUrl={userData?.thumbnailUrl as string | undefined}
                localPreview={localPreview || undefined}
                onChange={handleThumbnailChange}
              />
              <div className="role-display">
                <span
                  className={`role-badge role-${roleKey}`}
                  title={ROLE_DESCRIPTIONS[roleKey]}
                >
                  {userData?.role}
                </span>
                <span title={ROLE_DESCRIPTIONS[roleKey]}>
                  <HelpCircle size={14} className="role-info" />
                </span>
              </div>
            </div>

            <div className="field-grid">
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
              <div className="form-group">
                <label htmlFor="organizationAddress">Organization Address</label>
                <textarea
                  id="organizationAddress"
                  className="modal-input settings"
                  value={organizationAddress}
                  onChange={(e) => setFormData((p) => ({ ...p, organizationAddress: e.target.value }))}
                  rows={3}
                />
              </div>
              <EditableTextField
                id="occupation"
                label="Occupation"
                value={occupation}
                onChange={(v: string) => setFormData((p) => ({ ...p, occupation: v }))}
              />
            </div>

            <div className="password-section">
              <button
                type="button"
                className="modal-submit-button secondary password-toggle"
                onClick={() => setShowPasswordFields((p) => !p)}
              >
                Change Password
              </button>

              {showPasswordFields && (
                <div className="form-group form-group-password">
                  <label htmlFor="password">Password Change</label>
                  <input
                    type="password"
                    className="modal-input-password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="Old Password"
                  />
                  <input
                    type="password"
                    className="modal-input-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New Password"
                  />
                  <input
                    type="password"
                    className="modal-input-password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Confirm New Password"
                  />
                  {passwordChangeStatus && <div>{passwordChangeStatus}</div>}
                </div>
              )}
            </div>

            <div className="save-row">
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
              typeof userData?.invoices?.[0]?.amount === 'number'
                ? userData.invoices[0].amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
                : String(userData?.invoices?.[0]?.amount || 'N/A')
            }
            invoiceList={[]}
          />
        </div>
      </div>
    </>
  );
};

export default Settings;












