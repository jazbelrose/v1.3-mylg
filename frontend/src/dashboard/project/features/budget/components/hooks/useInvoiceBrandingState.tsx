import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { uploadData } from "aws-amplify/storage";

import { updateUserProfile, fileUrlsToKeys } from "@/shared/utils/api";
import type { UserLite } from "@/app/contexts/DataProvider";

interface UseInvoiceBrandingStateOptions {
  isOpen: boolean;
  userData: unknown;
  setUserData: (user: UserLite) => void;
  markInvoiceDirty: () => void;
}

interface UseInvoiceBrandingStateResult {
  logoDataUrl: string | null;
  setLogoDataUrl: (value: string | null) => void;
  brandName: string;
  setBrandName: (value: string) => void;
  brandAddress: string;
  setBrandAddress: (value: string) => void;
  brandPhone: string;
  setBrandPhone: (value: string) => void;
  brandTagline: string;
  setBrandTagline: (value: string) => void;
  brandLogoKey: string;
  setBrandLogoKey: (value: string) => void;
  useProjectAddress: boolean;
  setUseProjectAddress: (value: boolean) => void;
  showSaved: boolean;
  setShowSaved: (value: boolean) => void;
  isDirty: boolean;
  setIsDirty: (value: boolean) => void;
  handleLogoSelect: React.ChangeEventHandler<HTMLInputElement>;
  handleLogoDrop: React.DragEventHandler<HTMLDivElement>;
  handleBrandNameBlur: (value: string) => void;
  handleBrandTaglineBlur: (value: string) => void;
  handleBrandAddressBlur: (value: string) => void;
  handleBrandPhoneBlur: (value: string) => void;
  handleToggleProjectAddress: (checked: boolean) => void;
  handleSaveHeader: () => Promise<void>;
}

export function useInvoiceBrandingState({
  isOpen,
  userData,
  setUserData,
  markInvoiceDirty,
}: UseInvoiceBrandingStateOptions): UseInvoiceBrandingStateResult {
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [brandName, setBrandName] = useState("");
  const [brandAddress, setBrandAddress] = useState("");
  const [brandPhone, setBrandPhone] = useState("");
  const [brandTagline, setBrandTagline] = useState("");
  const [brandLogoKey, setBrandLogoKey] = useState("");
  const [useProjectAddress, setUseProjectAddress] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const data = (userData || {}) as {
      brandLogoKey?: string;
      brandLogoUrl?: string;
      brandName?: string;
      company?: string;
      brandAddress?: string;
      brandPhone?: string;
      brandTagline?: string;
    };
    let logoKey = data.brandLogoKey || "";
    if (!logoKey && data.brandLogoUrl) {
      logoKey = fileUrlsToKeys([data.brandLogoUrl])[0] || "";
    }
    setBrandLogoKey(logoKey);
    setBrandName(data.brandName || data.company || "");
    setBrandAddress(data.brandAddress || "");
    setBrandPhone(data.brandPhone || "");
    setBrandTagline(data.brandTagline || "");
    setLogoDataUrl(null);
    setUseProjectAddress(false);
    setShowSaved(false);
    setIsDirty(false);
  }, [isOpen, userData]);

  useEffect(() => {
    const data = (userData || {}) as {
      brandLogoKey?: string;
      brandLogoUrl?: string;
      brandName?: string;
      company?: string;
      brandAddress?: string;
      brandPhone?: string;
      brandTagline?: string;
    };
    const currentKey = data.brandLogoKey || (data.brandLogoUrl ? fileUrlsToKeys([data.brandLogoUrl])[0] : "");
    const dirty =
      (brandLogoKey || "") !== currentKey ||
      (brandName || "") !== (data.brandName || data.company || "") ||
      (brandAddress || "") !== (data.brandAddress || "") ||
      (brandPhone || "") !== (data.brandPhone || "") ||
      (brandTagline || "") !== (data.brandTagline || "");
    setIsDirty(dirty);
  }, [brandLogoKey, brandName, brandAddress, brandPhone, brandTagline, userData]);

  const handleLogoSelect: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setLogoDataUrl(reader.result as string);
      setIsDirty(true);
    };
    reader.readAsDataURL(file);
  };

  const handleLogoDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setLogoDataUrl(reader.result as string);
      setIsDirty(true);
    };
    reader.readAsDataURL(file);
  };

  const handleBrandNameBlur = (value: string) => {
    setBrandName(value);
    markInvoiceDirty();
  };
  const handleBrandTaglineBlur = (value: string) => {
    setBrandTagline(value);
    markInvoiceDirty();
  };
  const handleBrandAddressBlur = (value: string) => {
    setBrandAddress(value);
    markInvoiceDirty();
  };
  const handleBrandPhoneBlur = (value: string) => {
    setBrandPhone(value);
    markInvoiceDirty();
  };

  const handleToggleProjectAddress = (checked: boolean) => {
    setUseProjectAddress(checked);
  };

  const handleSaveHeader = useCallback(async () => {
    try {
      let uploadedKey = brandLogoKey;

      if (logoDataUrl && logoDataUrl.startsWith("data:") && (userData as { userId?: string })?.userId) {
        const res = await fetch(logoDataUrl);
        const blob = await res.blob();
        const ext = blob.type.split("/").pop() || "png";
        const file = new File([blob], `logo.${ext}`, { type: blob.type });
        const filename = `userBranding/${(userData as { userId?: string })?.userId}/${file.name}`;
        const uploadTask = uploadData({
          key: filename,
          data: file,
          options: { accessLevel: "guest" },
        });
        await uploadTask.result;
        uploadedKey = filename.startsWith("public/") ? filename : `public/${filename}`;
      }

      const updated = {
        ...(userData as UserLite),
        brandLogoKey: uploadedKey,
        brandName,
        brandAddress,
        brandPhone,
        brandTagline,
      } as UserLite;

      await updateUserProfile(updated);
      setUserData(updated);
      setBrandLogoKey(uploadedKey);
      setLogoDataUrl(null);
      setShowSaved(true);
      setIsDirty(false);
    } catch (err) {
      console.error("Failed to save header", err);
    }
  }, [
    brandAddress,
    brandLogoKey,
    brandName,
    brandPhone,
    brandTagline,
    logoDataUrl,
    setUserData,
    userData,
  ]);

  return {
    logoDataUrl,
    setLogoDataUrl,
    brandName,
    setBrandName,
    brandAddress,
    setBrandAddress,
    brandPhone,
    setBrandPhone,
    brandTagline,
    setBrandTagline,
    brandLogoKey,
    setBrandLogoKey,
    useProjectAddress,
    setUseProjectAddress,
    showSaved,
    setShowSaved,
    isDirty,
    setIsDirty,
    handleLogoSelect,
    handleLogoDrop,
    handleBrandNameBlur,
    handleBrandTaglineBlur,
    handleBrandAddressBlur,
    handleBrandPhoneBlur,
    handleToggleProjectAddress,
    handleSaveHeader,
  };
}
