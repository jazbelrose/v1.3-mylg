import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChangeEventHandler, DragEventHandler } from "react";
import { uploadData } from "aws-amplify/storage";
import { toast } from "react-toastify";

import useModalStack from "@/shared/utils/useModalStack";
import { useData } from "@/app/contexts/useData";
import type { UserLite } from "@/app/contexts/DataProvider";
import { useBudget } from "@/dashboard/project/features/budget/context/BudgetContext";
import { updateBudgetItem } from "@/shared/utils/api";
import type {
  BudgetItem,
  GroupDisplayMode,
  GroupField,
  InvoiceDetailsPayload,
  InvoicePreviewModalProps,
  OrganizationInfoFields,
  OrganizationInfoLine,
  RowData,
} from "./invoicePreviewTypes";
import { useInvoiceBranding } from "./useInvoiceBranding";
import { useInvoiceDetails } from "./useInvoiceDetails";
import { useInvoiceGrouping } from "./useInvoiceGrouping";
import { useInvoiceLayout } from "./useInvoiceLayout";
import { useInvoicePdfManager } from "./useInvoicePdfManager";
import type { UseInvoicePreviewModalResult } from "./useInvoicePreviewModal.types";

export function useInvoicePreviewModal({
  isOpen,
  onRequestClose,
  revision,
  project,
  itemsOverride = null,
  onInvoiceSaved,
}: InvoicePreviewModalProps): UseInvoicePreviewModalResult {
  useModalStack(isOpen);

  const { userData, setUserData } = useData();
  const organizationDefaults = useMemo<OrganizationInfoFields>(() => {
    const settings = (userData || {}) as Partial<UserLite> & {
      companyAddress?: string;
      companyCity?: string;
      companyState?: string;
      companyZip?: string;
    };

    const trimValue = (value?: string | null) =>
      typeof value === "string" ? value.trim() : "";

    const companyName = trimValue(settings.company);
    const fullName = [trimValue(settings.firstName), trimValue(settings.lastName)]
      .filter(Boolean)
      .join(" ");
    const displayName = companyName || fullName;

    const street = trimValue(settings.companyAddress);
    const city = trimValue(settings.companyCity);
    const state = trimValue(settings.companyState);
    const zip = trimValue(settings.companyZip);

    const cityState = [city, state].filter(Boolean).join(", ");
    const locality = [cityState, zip].filter(Boolean).join(" ").trim();
    const addressParts = [street, locality].filter(Boolean);
    const address = addressParts.join(", ");

    const phone = trimValue(settings.phoneNumber);
    const email = trimValue(settings.email);

    return {
      name: displayName,
      address,
      phone,
      email,
    };
  }, [userData]);
  const [organizationFields, setOrganizationFields] = useState<OrganizationInfoFields>(organizationDefaults);

  const organizationLines = useMemo<OrganizationInfoLine[]>(() => {
    const name = organizationFields.name.trim();
    const address = organizationFields.address.trim();
    const phone = organizationFields.phone.trim();
    const email = organizationFields.email.trim();

    const hasAnyValue = Boolean(name || address || phone || email);

    if (!hasAnyValue) {
      return [
        {
          id: "organization-placeholder-name",
          text: "Your organization name",
          isPlaceholder: true,
        },
        {
          id: "organization-placeholder-address",
          text: "Add your mailing address",
          isPlaceholder: true,
        },
        {
          id: "organization-placeholder-phone",
          text: "Add your phone number",
          isPlaceholder: true,
        },
        {
          id: "organization-placeholder-email",
          text: "Add your email address",
          isPlaceholder: true,
        },
      ];
    }

    const addressLines = (() => {
      if (!address) return [];

      const normalized = address.replace(/\r\n?/g, "\n");
      const newlineParts = normalized
        .split("\n")
        .map((part) => part.trim())
        .filter(Boolean);
      if (newlineParts.length > 0) {
        return newlineParts;
      }

      const firstCommaIndex = normalized.indexOf(",");
      if (firstCommaIndex === -1) {
        return [normalized.trim()].filter(Boolean);
      }

      const lineOne = normalized.slice(0, firstCommaIndex).trim();
      const lineTwo = normalized.slice(firstCommaIndex + 1).trim();
      return [lineOne, lineTwo].filter(Boolean);
    })();

    const lines: OrganizationInfoLine[] = [];

    if (name) {
      lines.push({ id: "organization-name", text: name, isPlaceholder: false, isBold: true });
    }

    addressLines.forEach((line, index) => {
      lines.push({
        id: `organization-address-${index}`,
        text: line,
        isPlaceholder: false,
      });
    });

    if (phone) {
      lines.push({ id: "organization-phone", text: phone, isPlaceholder: false });
    }

    if (email) {
      lines.push({ id: "organization-email", text: email, isPlaceholder: false });
    }

    return lines;
  }, [organizationFields]);

  const updateOrganizationField = useCallback(
    (field: keyof OrganizationInfoFields, value: string) => {
      setOrganizationFields((prev) => ({ ...prev, [field]: value.trim() }));
    },
    []
  );
  const updateUserData = useCallback(
    (user: UserLite) => {
      setUserData(user);
    },
    [setUserData]
  );
  const { budgetHeader: contextBudgetHeader, budgetItems: contextBudgetItems, setBudgetHeader } =
    useBudget();
  const budgetItems = (itemsOverride ?? (contextBudgetItems as unknown as BudgetItem[])) as BudgetItem[];
  const resolvedInvoiceDetails = useMemo<InvoiceDetailsPayload | null>(() => {
    const fromRevision = (revision as { invoiceDetails?: InvoiceDetailsPayload | null } | null)
      ?.invoiceDetails;
    if (fromRevision && typeof fromRevision === "object") {
      return fromRevision as InvoiceDetailsPayload;
    }
    const fromContext = (contextBudgetHeader as { invoiceDetails?: InvoiceDetailsPayload | null } | null)
      ?.invoiceDetails;
    if (fromContext && typeof fromContext === "object") {
      return fromContext as InvoiceDetailsPayload;
    }
    return null;
  }, [contextBudgetHeader, revision]);

  const initialBranding = useMemo(
    () =>
      resolvedInvoiceDetails
        ? {
            brandLogoKey: resolvedInvoiceDetails.brandLogoKey || "",
            brandLogoDataUrl: resolvedInvoiceDetails.brandLogoDataUrl || null,
            brandName: resolvedInvoiceDetails.brandName ?? "",
            brandTagline: resolvedInvoiceDetails.brandTagline ?? "",
          }
        : null,
    [resolvedInvoiceDetails],
  );

  useEffect(() => {
    if (!isOpen) return;
    const base: OrganizationInfoFields = {
      name: organizationDefaults.name?.trim() ?? "",
      address: organizationDefaults.address?.trim() ?? "",
      phone: organizationDefaults.phone?.trim() ?? "",
      email: organizationDefaults.email?.trim() ?? "",
    };

    const invoiceOrg = resolvedInvoiceDetails?.organization;
    if (invoiceOrg) {
      setOrganizationFields({
        name:
          typeof invoiceOrg.name === "string"
            ? invoiceOrg.name.trim()
            : base.name,
        address:
          typeof invoiceOrg.address === "string"
            ? invoiceOrg.address.trim()
            : base.address,
        phone:
          typeof invoiceOrg.phone === "string"
            ? invoiceOrg.phone.trim()
            : base.phone,
        email:
          typeof invoiceOrg.email === "string"
            ? invoiceOrg.email.trim()
            : base.email,
      });
    } else {
      setOrganizationFields(base);
    }
  }, [isOpen, organizationDefaults, resolvedInvoiceDetails]);

  const [items, setItems] = useState<BudgetItem[]>([]);
  const [hasSavedInvoice, setHasSavedInvoice] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    brandLogoKey,
    logoDataUrl,
    brandName,
    brandTagline,
    showSaved,
    isDirty,
    handleLogoSelect: brandingHandleLogoSelect,
    handleLogoDrop: brandingHandleLogoDrop,
    handleSaveHeader,
    setBrandLogoKey,
    setLogoDataUrl,
    setBrandName,
    setBrandTagline,
  } = useInvoiceBranding({
    isOpen,
    userData: userData as UserLite | null | undefined,
    setUserData: updateUserData,
    initialBranding,
  });

  const details = useInvoiceDetails({
    isOpen,
    project,
    revision,
    invoiceDetails: resolvedInvoiceDetails,
  });
  const {
    invoiceDirty,
    setInvoiceDirty,
    invoiceNumber,
    issueDate,
    projectName,
    customerSummary,
    notes,
    depositReceived,
    taxRate,
    totalDue,
    setTotalDue,
    handleInvoiceNumberBlur,
    handleIssueDateBlur,
    handleProjectNameBlur,
    handleCustomerSummaryBlur,
    handleDepositBlur,
    handleTaxRateBlur,
    handleTotalDueBlur,
    handleNotesBlur,
  } = details;

  const grouping = useInvoiceGrouping({ items });
  const {
    groupField,
    setGroupField,
    groupValues,
    setGroupValues,
    groupOptions,
    filteredItems,
    handleGroupFieldChange,
    handleToggleGroupValue,
    handleToggleAllGroupValues,
    groupDisplayModes,
    setGroupDisplayModes,
    handleToggleGroupDisplayMode,
  } = grouping;

  useEffect(() => {
    if (!isOpen) return;
    const desiredField = resolvedInvoiceDetails?.groupField;
    const isValidField =
      desiredField === "invoiceGroup" ||
      desiredField === "areaGroup" ||
      desiredField === "category";
    if (!isValidField) return;

    setGroupField((current) => (current === desiredField ? current : desiredField));
  }, [isOpen, resolvedInvoiceDetails, setGroupField]);

  useEffect(() => {
    if (!isOpen) return;
    const storedValues = resolvedInvoiceDetails?.groupValues;
    if (!Array.isArray(storedValues)) return;

    if (storedValues.length === 0) {
      setGroupValues([]);
      return;
    }

    const normalized = storedValues
      .map((value) => String(value).trim())
      .filter((value) => value.length > 0 && groupOptions.includes(value));

    setGroupValues((prev) => {
      const sameLength = prev.length === normalized.length;
      const sameValues =
        sameLength && prev.every((value, index) => value === normalized[index]);
      return sameValues ? prev : normalized;
    });
  }, [groupOptions, isOpen, resolvedInvoiceDetails, setGroupValues]);

  useEffect(() => {
    if (!isOpen) return;
    const storedModes = resolvedInvoiceDetails?.groupDisplayModes;
    if (storedModes && typeof storedModes === "object") {
      setGroupDisplayModes(storedModes as Record<string, GroupDisplayMode>);
    } else {
      setGroupDisplayModes({});
    }
  }, [isOpen, resolvedInvoiceDetails, setGroupDisplayModes]);

  const subtotal = useMemo(
    () =>
      filteredItems.reduce((sum, item) => {
        const amount = parseFloat(String(item.itemFinalCost ?? 0)) || 0;
        return sum + amount;
      }, 0),
    [filteredItems]
  );

  const taxAmount = useMemo(() => {
    const amount = subtotal * (taxRate / 100);
    return Math.round(amount * 100) / 100;
  }, [subtotal, taxRate]);

  useEffect(() => {
    setTotalDue(subtotal - depositReceived + taxAmount);
  }, [subtotal, depositReceived, taxAmount, setTotalDue]);

  const rowsData: RowData[] = useMemo(() => {
    const groups = groupValues.length === 0 ? groupOptions : groupValues;
    const rows: RowData[] = [];
    // Separate UNCATEGORIZED (empty string) from regular groups
    const regularGroups = groups.filter((g) => g !== "");
    const hasUncategorized = groups.includes("");

    // Add grouped items (with group headers or rollups) for regular groups
    regularGroups.forEach((group) => {
      const groupItems = items.filter(
        (item) => String((item as BudgetItem)[groupField]).trim() === group
      );

      if (groupDisplayModes[group] === "ROLLED_UP") {
        // Emit a single rollup row for this group
        const total = groupItems.reduce((sum, item) => {
          const amount = parseFloat(String(item.itemFinalCost ?? 0)) || 0;
          return sum + amount;
        }, 0);
        rows.push({
          type: "rollup",
          group,
          total,
          itemCount: groupItems.length,
        });
      } else {
        // Emit group header + individual items (existing DETAILED behavior)
        if (group) rows.push({ type: "group", group });
        groupItems.forEach((item) => rows.push({ type: "item", item }));
      }
    });

    // Add UNCATEGORIZED items as standalone rows (no group header) at the bottom
    if (hasUncategorized) {
      items
        .filter((item) => String((item as BudgetItem)[groupField] || "").trim() === "")
        .forEach((item) => rows.push({ type: "item", item }));
    }
    return rows;
  }, [items, groupValues, groupField, groupOptions, groupDisplayModes]);

  const {
    invoiceRef,
    previewRef,
    pages,
    currentPage,
    setCurrentPage,
    selectedPages,
    handleTogglePage,
    handleToggleAllPages,
  } = useInvoiceLayout(rowsData);

  const handleAttemptClose = useCallback(() => {
    if (invoiceDirty || !hasSavedInvoice) {
      setShowUnsavedPrompt(true);
      return;
    }
    onRequestClose();
  }, [invoiceDirty, hasSavedInvoice, onRequestClose]);

  const handleConfirmLeave = useCallback(() => {
    setShowUnsavedPrompt(false);
    onRequestClose();
  }, [onRequestClose]);

  const handleStayOpen = useCallback(() => {
    setShowUnsavedPrompt(false);
  }, []);

  const {
    pdfPreviewUrl,
    closePdfPreview,
    handleSavePdf,
    handlePreviewPdf,
  } = useInvoicePdfManager({
    project,
    brandName,
    brandTagline,
    brandLogoKey,
    logoDataUrl,
    invoiceNumber,
    issueDate,
    projectName,
    customerSummary,
    rowsData,
    subtotal,
    depositReceived,
    taxRate,
    taxAmount,
    totalDue,
    notes,
    revision,
    pages,
    selectedPages,
    organizationLines,
  });

  useEffect(() => {
    if (!isOpen) {
      setShowUnsavedPrompt(false);
      closePdfPreview();
    }
  }, [isOpen, closePdfPreview]);

  useEffect(() => () => closePdfPreview(), [closePdfPreview]);

  useEffect(() => {
    if (!isOpen) return;
    const arr = Array.isArray(budgetItems) ? (budgetItems as BudgetItem[]) : [];
    setItems(arr);
  }, [isOpen, budgetItems]);

  useEffect(() => {
    if (!isOpen) return;
    setHasSavedInvoice(Boolean(resolvedInvoiceDetails));
    setLastSavedAt(resolvedInvoiceDetails?.savedAt ?? null);
  }, [isOpen, resolvedInvoiceDetails]);

  const markInvoiceDirty = useCallback(() => {
    setInvoiceDirty(true);
    setHasSavedInvoice(false);
    setLastSavedAt(null);
  }, [setInvoiceDirty, setHasSavedInvoice]);

  const handleLogoSelect = useCallback<ChangeEventHandler<HTMLInputElement>>(
    (event) => {
      brandingHandleLogoSelect(event);
      markInvoiceDirty();
    },
    [brandingHandleLogoSelect, markInvoiceDirty],
  );

  const handleLogoDrop = useCallback<DragEventHandler<HTMLDivElement>>(
    (event) => {
      brandingHandleLogoDrop(event);
      markInvoiceDirty();
    },
    [brandingHandleLogoDrop, markInvoiceDirty],
  );

  const handleLogoPickerSelect = useCallback(
    (logoKey: string) => {
      setBrandLogoKey(logoKey);
      setLogoDataUrl(null);
      markInvoiceDirty();
    },
    [setBrandLogoKey, setLogoDataUrl, markInvoiceDirty],
  );

  const handleLogoRemove = useCallback(() => {
    setBrandLogoKey("");
    setLogoDataUrl(null);
    markInvoiceDirty();
  }, [setBrandLogoKey, setLogoDataUrl, markInvoiceDirty]);

  const handleBrandNameBlur = useCallback(
    (value: string) => {
      setBrandName(value);
      markInvoiceDirty();
    },
    [setBrandName, markInvoiceDirty]
  );

  const handleBrandTaglineBlur = useCallback(
    (value: string) => {
      setBrandTagline(value);
      markInvoiceDirty();
    },
    [setBrandTagline, markInvoiceDirty]
  );

  const handleGroupFieldChangeWrapped = useCallback(
    (field: GroupField) => {
      handleGroupFieldChange(field);
      markInvoiceDirty();
    },
    [handleGroupFieldChange, markInvoiceDirty]
  );

  const handleToggleGroupValueWrapped = useCallback(
    (value: string) => {
      handleToggleGroupValue(value);
      markInvoiceDirty();
    },
    [handleToggleGroupValue, markInvoiceDirty]
  );

  const handleToggleAllGroupValuesWrapped = useCallback(
    (checked: boolean) => {
      handleToggleAllGroupValues(checked);
      markInvoiceDirty();
    },
    [handleToggleAllGroupValues, markInvoiceDirty]
  );

  const handleToggleGroupDisplayModeWrapped = useCallback(
    (group: string) => {
      handleToggleGroupDisplayMode(group);
      markInvoiceDirty();
    },
    [handleToggleGroupDisplayMode, markInvoiceDirty]
  );

  const saveInvoice = useCallback(async () => {
    const revisionBudgetItemId =
      (revision as { budgetItemId?: string } | null)?.budgetItemId ??
      (contextBudgetHeader as { budgetItemId?: string } | null)?.budgetItemId;
    const projectId =
      project?.projectId ??
      (revision as { projectId?: string } | null)?.projectId ??
      (contextBudgetHeader as { projectId?: string } | null)?.projectId;
    const revisionNumber = Number(
      (revision as { revision?: number | string } | null)?.revision ??
        (contextBudgetHeader as { revision?: number | string } | null)?.revision ??
        1,
    );

    if (!projectId || !revisionBudgetItemId) {
      toast.error("Cannot save invoice without project budget header details");
      return;
    }

    const organization: OrganizationInfoFields = {
      name: organizationFields.name.trim(),
      address: organizationFields.address.trim(),
      phone: organizationFields.phone.trim(),
      email: organizationFields.email.trim(),
    };

    // Upload logo to S3 if it's a data URL
    let finalBrandLogoKey = brandLogoKey;
    let finalBrandLogoDataUrl: string | null = null;
    
    if (logoDataUrl && logoDataUrl.startsWith("data:") && userData?.userId) {
      try {
        const res = await fetch(logoDataUrl);
        const blob = await res.blob();
        const ext = blob.type.split("/").pop() || "png";
        const file = new File([blob], `invoice-logo.${ext}`, { type: blob.type });
        const filename = `invoiceBranding/${userData.userId}/${revisionBudgetItemId}/${file.name}`;
        const uploadTask = uploadData({
          key: filename,
          data: file,
          options: { accessLevel: "guest" },
        });
        await uploadTask.result;
        finalBrandLogoKey = filename.startsWith("public/") ? filename : `public/${filename}`;
        setBrandLogoKey(finalBrandLogoKey);
        setLogoDataUrl(null); // Clear the data URL since we now have an S3 key
      } catch (error) {
        console.error("Failed to upload logo", error);
        // Fall back to using data URL if upload fails
        finalBrandLogoDataUrl = logoDataUrl;
      }
    } else {
      finalBrandLogoDataUrl = logoDataUrl && logoDataUrl.startsWith("data:") 
        ? logoDataUrl 
        : resolvedInvoiceDetails?.brandLogoDataUrl ?? null;
    }

    const invoiceDetails: InvoiceDetailsPayload = {
      invoiceNumber: invoiceNumber.trim(),
      issueDate: issueDate.trim(),
      projectName: projectName.trim(),
      customerSummary,
      notes,
      depositReceived,
      taxRate,
      taxAmount,
      subtotal,
      totalDue,
      brandLogoKey: finalBrandLogoKey || null,
      brandLogoDataUrl: finalBrandLogoDataUrl,
      brandName: brandName.trim(),
      brandTagline: brandTagline.trim(),
      organization,
      groupField,
      groupValues: groupValues.length > 0 ? [...groupValues] : [],
      groupDisplayModes: Object.keys(groupDisplayModes).length > 0 ? { ...groupDisplayModes } : undefined,
      savedAt: new Date().toISOString(),
    };

    try {
      await updateBudgetItem(projectId, revisionBudgetItemId, {
        invoiceDetails,
        invoiceFileKey: null,
        invoiceFileUrl: null,
        revision: revisionNumber,
      });

      setInvoiceDirty(false);
      setHasSavedInvoice(true);
      setLastSavedAt(invoiceDetails.savedAt);
      toast.success("Invoice saved");

      setBudgetHeader((prev) => {
        if (!prev || prev.budgetItemId !== revisionBudgetItemId) return prev;
        return {
          ...prev,
          invoiceDetails,
          invoiceFileKey: null,
          invoiceFileUrl: null,
        };
      });

      const nextRevision = {
        ...(revision ?? {}),
        invoiceDetails,
        invoiceFileKey: null,
        invoiceFileUrl: null,
      };

      onInvoiceSaved?.({
        revision: nextRevision,
        invoiceDetails,
      });
    } catch (error) {
      console.error("Failed to save invoice", error);
      toast.error("Failed to save invoice");
    }
  }, [
    brandLogoKey,
    brandName,
    brandTagline,
    contextBudgetHeader,
    customerSummary,
    groupField,
    groupDisplayModes,
    groupValues,
    invoiceNumber,
    issueDate,
    logoDataUrl,
    notes,
    onInvoiceSaved,
    organizationFields,
    project?.projectId,
    projectName,
    revision,
    resolvedInvoiceDetails,
    setBrandLogoKey,
    setBudgetHeader,
    setInvoiceDirty,
    setLogoDataUrl,
    subtotal,
    depositReceived,
    taxAmount,
    taxRate,
    totalDue,
    userData?.userId,
  ]);

  const handleSaveClick = useCallback(() => {
    if (invoiceDirty || !hasSavedInvoice) {
      void saveInvoice();
    } else {
      toast.info("Invoice already saved");
    }
  }, [hasSavedInvoice, invoiceDirty, saveInvoice]);

  const handleOrganizationNameBlur = useCallback(
    (value: string) => {
      updateOrganizationField("name", value);
      markInvoiceDirty();
    },
    [markInvoiceDirty, updateOrganizationField]
  );

  const handleOrganizationAddressBlur = useCallback(
    (value: string) => {
      updateOrganizationField("address", value);
      markInvoiceDirty();
    },
    [markInvoiceDirty, updateOrganizationField]
  );

  const handleOrganizationPhoneBlur = useCallback(
    (value: string) => {
      updateOrganizationField("phone", value);
      markInvoiceDirty();
    },
    [markInvoiceDirty, updateOrganizationField]
  );

  const handleOrganizationEmailBlur = useCallback(
    (value: string) => {
      updateOrganizationField("email", value);
      markInvoiceDirty();
    },
    [markInvoiceDirty, updateOrganizationField]
  );

  return {
    items,
    invoiceRef,
    previewRef,
    fileInputRef,
    handleSaveClick,
    handleSavePdf,
    handlePreviewPdf,
    currentPage,
    setCurrentPage,
    pages,
    groupField,
    handleGroupFieldChange: handleGroupFieldChangeWrapped,
    groupOptions,
    groupValues,
    handleToggleGroupValue: handleToggleGroupValueWrapped,
    handleToggleAllGroupValues: handleToggleAllGroupValuesWrapped,
    groupDisplayModes,
    handleToggleGroupDisplayMode: handleToggleGroupDisplayModeWrapped,
    selectedPages,
    handleTogglePage,
    handleToggleAllPages,
    isDirty,
    handleSaveHeader,
    showSaved,
    logoDataUrl,
    brandLogoKey,
    handleLogoSelect,
    handleLogoDrop,
    handleLogoPickerSelect,
    handleLogoRemove,
    brandName,
    handleBrandNameBlur,
    brandTagline,
    handleBrandTaglineBlur,
    invoiceNumber,
    handleInvoiceNumberBlur,
    issueDate,
    handleIssueDateBlur,
    projectName,
    handleProjectNameBlur,
    customerSummary,
    handleCustomerSummaryBlur,
    rowsData,
    organizationLines,
    organizationName: organizationFields.name,
    handleOrganizationNameBlur,
    organizationAddress: organizationFields.address,
    handleOrganizationAddressBlur,
    organizationPhone: organizationFields.phone,
    handleOrganizationPhoneBlur,
    organizationEmail: organizationFields.email,
    handleOrganizationEmailBlur,
    subtotal,
    depositReceived,
    handleDepositBlur,
    taxRate,
    handleTaxRateBlur,
    taxAmount,
    totalDue,
    handleTotalDueBlur,
    notes,
    handleNotesBlur,
    pdfPreviewUrl,
    closePdfPreview,
    showUnsavedPrompt,
    handleStayOpen,
    handleConfirmLeave,
    handleAttemptClose,
    hasSavedInvoice,
    lastSavedAt,
  };
}

export default useInvoicePreviewModal;
