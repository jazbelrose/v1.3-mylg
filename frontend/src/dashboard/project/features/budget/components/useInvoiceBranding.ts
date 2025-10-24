import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { uploadData } from "aws-amplify/storage";

import { updateUserProfile } from "@/shared/utils/api";
import type { UserLite } from "@/app/contexts/DataProvider";

interface UseInvoiceBrandingOptions {
  isOpen: boolean;
  userData: UserLite | null | undefined;
  setUserData: (user: UserLite) => void;
}

interface UseInvoiceBrandingResult {
  brandLogoKey: string;
  logoDataUrl: string | null;
  brandName: string;
  brandTagline: string;
  brandAddress: string;
  brandPhone: string;
  organizationAddress: string;
  useOrganizationAddress: boolean;
  showSaved: boolean;
  isDirty: boolean;
  handleLogoSelect: React.ChangeEventHandler<HTMLInputElement>;
  handleLogoDrop: React.DragEventHandler<HTMLDivElement>;
  handleToggleOrganizationAddress: (checked: boolean) => void;
  handleSaveHeader: () => Promise<void>;
  setBrandLogoKey: React.Dispatch<React.SetStateAction<string>>;
  setLogoDataUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setBrandName: React.Dispatch<React.SetStateAction<string>>;
  setBrandTagline: React.Dispatch<React.SetStateAction<string>>;
  setBrandAddress: React.Dispatch<React.SetStateAction<string>>;
  setBrandPhone: React.Dispatch<React.SetStateAction<string>>;
  setUseOrganizationAddress: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSaved: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDirty: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useInvoiceBranding({
  isOpen,
  userData,
  setUserData,
}: UseInvoiceBrandingOptions): UseInvoiceBrandingResult {
  const [brandLogoKey, setBrandLogoKey] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [brandName, setBrandName] = useState("");
  const [brandTagline, setBrandTagline] = useState("");
  const [brandAddress, setBrandAddress] = useState("");
  const [brandPhone, setBrandPhone] = useState("");
  const [organizationAddress, setOrganizationAddress] = useState("");
  const [useOrganizationAddress, setUseOrganizationAddress] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // keep ref exported? not needed currently but ensures component can attach if desired later.
  void fileInputRef;

  const currentUserBranding = useMemo(() => {
    const data = (userData || {}) as Partial<UserLite> & {
      brandLogoUrl?: string;
    };
    const brandLogoFromUrl = data.brandLogoUrl ? data.brandLogoUrl : undefined;
    return {
      brandLogoKey: data.brandLogoKey || "",
      brandLogoUrl: brandLogoFromUrl || "",
      brandName: data.brandName || data.company || "",
      brandAddress: data.brandAddress || "",
      organizationAddress: data.organizationAddress || "",
      brandPhone: data.brandPhone || "",
      brandTagline: data.brandTagline || "",
    };
  }, [userData]);

  useEffect(() => {
    if (!isOpen) return;
    const {
      brandLogoKey: key,
      brandLogoUrl,
      brandName: name,
      brandAddress: address,
      organizationAddress: savedOrganizationAddress,
      brandPhone: phone,
      brandTagline: tagline,
    } = currentUserBranding;
    let resolvedKey = key;
    if (!resolvedKey && brandLogoUrl) {
      resolvedKey = brandLogoUrl.startsWith("public/")
        ? brandLogoUrl
        : `public/${brandLogoUrl}`;
    }
    setBrandLogoKey(resolvedKey);
    setBrandName(name);
    const nextBrandAddress = address || savedOrganizationAddress || "";
    setBrandAddress(nextBrandAddress);
    setBrandPhone(phone);
    setBrandTagline(tagline);
    setOrganizationAddress(savedOrganizationAddress || "");
    setLogoDataUrl(null);
    setUseOrganizationAddress(!address && Boolean(savedOrganizationAddress));
    setShowSaved(false);
    setIsDirty(false);
  }, [isOpen, currentUserBranding]);

  useEffect(() => {
    const baselineAddress =
      currentUserBranding.brandAddress || currentUserBranding.organizationAddress || "";
    const dirty =
      (brandLogoKey || "") !== (currentUserBranding.brandLogoKey || "") ||
      (brandName || "") !== (currentUserBranding.brandName || "") ||
      (brandAddress || "") !== baselineAddress ||
      (brandPhone || "") !== (currentUserBranding.brandPhone || "") ||
      (brandTagline || "") !== (currentUserBranding.brandTagline || "");
    setIsDirty(dirty);
  }, [
    brandAddress,
    brandLogoKey,
    brandName,
    brandPhone,
    brandTagline,
    currentUserBranding,
  ]);

  const handleLogoSelect: React.ChangeEventHandler<HTMLInputElement> = useCallback(
    (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        setLogoDataUrl(reader.result as string);
        setIsDirty(true);
      };
      reader.readAsDataURL(file);
    },
    []
  );

  const handleLogoDrop: React.DragEventHandler<HTMLDivElement> = useCallback((event) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setLogoDataUrl(reader.result as string);
      setIsDirty(true);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleToggleOrganizationAddress = useCallback(
    (checked: boolean) => {
      setUseOrganizationAddress(checked);
      if (checked) {
        setBrandAddress(organizationAddress || "");
      }
      setIsDirty(true);
    },
    [organizationAddress]
  );

  const handleSaveHeader = useCallback(async () => {
    try {
      let uploadedKey = brandLogoKey;
      if (logoDataUrl && logoDataUrl.startsWith("data:") && userData?.userId) {
        const res = await fetch(logoDataUrl);
        const blob = await res.blob();
        const ext = blob.type.split("/").pop() || "png";
        const file = new File([blob], `logo.${ext}`, { type: blob.type });
        const filename = `userBranding/${userData.userId}/${file.name}`;
        const uploadTask = uploadData({
          key: filename,
          data: file,
          options: { accessLevel: "guest" },
        });
        await uploadTask.result;
        uploadedKey = filename.startsWith("public/") ? filename : `public/${filename}`;
      }

      const updated = {
        ...(userData || {}),
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
    } catch (error) {
      console.error("Failed to save header", error);
      toast.error("Unable to save brand details");
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
    brandLogoKey,
    logoDataUrl,
    brandName,
    brandTagline,
    brandAddress,
    brandPhone,
    organizationAddress,
    useOrganizationAddress,
    showSaved,
    isDirty,
    handleLogoSelect,
    handleLogoDrop,
    handleToggleOrganizationAddress,
    handleSaveHeader,
    setBrandLogoKey,
    setLogoDataUrl,
    setBrandName,
    setBrandTagline,
    setBrandAddress,
    setBrandPhone,
    setUseOrganizationAddress,
    setShowSaved,
    setIsDirty,
  };
}

export type { UseInvoiceBrandingResult };
