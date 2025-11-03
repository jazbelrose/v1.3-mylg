import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { uploadData } from "aws-amplify/storage";

import { updateUserProfile } from "@/shared/utils/api";
import type { UserLite } from "@/app/contexts/DataProvider";

interface BrandingSnapshot {
  brandLogoKey: string;
  brandName: string;
  brandTagline: string;
}

interface UseInvoiceBrandingOptions {
  isOpen: boolean;
  userData: UserLite | null | undefined;
  setUserData: (user: UserLite) => void;
  initialBranding?: Partial<BrandingSnapshot> | null;
}

interface UseInvoiceBrandingResult {
  brandLogoKey: string;
  logoDataUrl: string | null;
  brandName: string;
  brandTagline: string;
  showSaved: boolean;
  isDirty: boolean;
  handleLogoSelect: React.ChangeEventHandler<HTMLInputElement>;
  handleLogoDrop: React.DragEventHandler<HTMLDivElement>;
  handleSaveHeader: () => Promise<void>;
  setBrandLogoKey: React.Dispatch<React.SetStateAction<string>>;
  setLogoDataUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setBrandName: React.Dispatch<React.SetStateAction<string>>;
  setBrandTagline: React.Dispatch<React.SetStateAction<string>>;
  setShowSaved: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDirty: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useInvoiceBranding({
  isOpen,
  userData,
  setUserData,
  initialBranding = null,
}: UseInvoiceBrandingOptions): UseInvoiceBrandingResult {
  const [brandLogoKey, setBrandLogoKey] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [brandName, setBrandName] = useState("");
  const [brandTagline, setBrandTagline] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [baselineBranding, setBaselineBranding] = useState<BrandingSnapshot>({
    brandLogoKey: "",
    brandName: "",
    brandTagline: "",
  });

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
      brandName: data.brandName || "",
      brandTagline: data.brandTagline || "",
    };
  }, [userData]);

  useEffect(() => {
    if (!isOpen) return;
    const initial = initialBranding ?? {};
    const rawInitialKey =
      typeof initial.brandLogoKey === "string"
        ? initial.brandLogoKey
        : initial.brandLogoKey === null
        ? ""
        : undefined;
    const rawKey = rawInitialKey ?? currentUserBranding.brandLogoKey;

    let resolvedKey = rawKey || "";
    if (!resolvedKey && currentUserBranding.brandLogoUrl) {
      resolvedKey = currentUserBranding.brandLogoUrl.startsWith("public/")
        ? currentUserBranding.brandLogoUrl
        : `public/${currentUserBranding.brandLogoUrl}`;
    }

    const base: BrandingSnapshot = {
      brandLogoKey: resolvedKey,
      brandName:
        typeof initial.brandName === "string"
          ? initial.brandName
          : currentUserBranding.brandName,
      brandTagline:
        typeof initial.brandTagline === "string"
          ? initial.brandTagline
          : currentUserBranding.brandTagline,
    };

    setBrandLogoKey(resolvedKey);
    setBrandName(base.brandName);
    setBrandTagline(base.brandTagline);
    setLogoDataUrl(null);
    setShowSaved(false);
    setIsDirty(false);
    setBaselineBranding(base);
  }, [isOpen, currentUserBranding, initialBranding]);

  useEffect(() => {
    const normalize = (value: string | null | undefined) => (value ?? "").trim();
    const dirty =
      normalize(brandLogoKey) !== normalize(baselineBranding.brandLogoKey) ||
      normalize(brandName) !== normalize(baselineBranding.brandName) ||
      normalize(brandTagline) !== normalize(baselineBranding.brandTagline);
    setIsDirty(dirty);
  }, [
    brandLogoKey,
    brandName,
    brandTagline,
    baselineBranding,
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
  }, [brandLogoKey, brandName, brandTagline, logoDataUrl, setUserData, userData]);

  return {
    brandLogoKey,
    logoDataUrl,
    brandName,
    brandTagline,
    showSaved,
    isDirty,
    handleLogoSelect,
    handleLogoDrop,
    handleSaveHeader,
    setBrandLogoKey,
    setLogoDataUrl,
    setBrandName,
    setBrandTagline,
    setShowSaved,
    setIsDirty,
  };
}

export type { UseInvoiceBrandingResult };
