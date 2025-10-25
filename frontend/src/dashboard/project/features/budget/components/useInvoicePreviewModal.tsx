import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { uploadData } from "aws-amplify/storage";
import { v4 as uuid } from "uuid";
import { toast } from "react-toastify";

import useModalStack from "@/shared/utils/useModalStack";
import { useData } from "@/app/contexts/useData";
import type { UserLite } from "@/app/contexts/DataProvider";
import { slugify } from "@/shared/utils/slug";
import { useBudget } from "@/dashboard/project/features/budget/context/BudgetContext";
import type {
  BudgetItem,
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

  useEffect(() => {
    if (!isOpen) return;
    setOrganizationFields(organizationDefaults);
  }, [organizationDefaults, isOpen]);

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
  const { budgetItems: contextBudgetItems } = useBudget();
  const budgetItems = (itemsOverride ?? (contextBudgetItems as unknown as BudgetItem[])) as BudgetItem[];

  const [items, setItems] = useState<BudgetItem[]>([]);
  const [currentFileName, setCurrentFileName] = useState<string>("");
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    brandLogoKey,
    logoDataUrl,
    brandName,
    brandTagline,
    showSaved,
    isDirty,
    handleLogoSelect,
    handleLogoDrop,
    handleSaveHeader,
    setBrandName,
    setBrandTagline,
  } = useInvoiceBranding({
    isOpen,
    userData: userData as UserLite | null | undefined,
    setUserData: updateUserData,
  });

  const details = useInvoiceDetails({ isOpen, project, revision });
  const {
    invoiceDirty,
    setInvoiceDirty,
    invoiceNumber,
    issueDate,
    projectTitle,
    customerSummary,
    invoiceSummary,
    notes,
    depositReceived,
    taxRate,
    totalDue,
    setTotalDue,
    handleInvoiceNumberBlur,
    handleIssueDateBlur,
    handleProjectTitleBlur,
    handleCustomerSummaryBlur,
    handleInvoiceSummaryBlur,
    handleDepositBlur,
    handleTaxRateBlur,
    handleTotalDueBlur,
    handleNotesBlur,
  } = details;

  const grouping = useInvoiceGrouping({ items });
  const {
    groupField,
    groupValues,
    groupOptions,
    filteredItems,
    handleGroupFieldChange,
    handleToggleGroupValue,
    handleToggleAllGroupValues,
  } = grouping;

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
    groups.forEach((group) => {
      if (group) rows.push({ type: "group", group });
      items
        .filter((item) => String((item as BudgetItem)[groupField]).trim() === group)
        .forEach((item) => rows.push({ type: "item", item }));
    });
    return rows;
  }, [items, groupValues, groupField, groupOptions]);

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
    if (isDirty || invoiceDirty) {
      setShowUnsavedPrompt(true);
      return;
    }
    onRequestClose();
  }, [isDirty, invoiceDirty, onRequestClose]);

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
    buildInvoiceHtmlPayload,
  } = useInvoicePdfManager({
    project,
    brandName,
    brandTagline,
    brandLogoKey,
    logoDataUrl,
    invoiceNumber,
    issueDate,
    projectTitle,
    customerSummary,
    invoiceSummary,
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
    if (revision?.revision != null) {
      setCurrentFileName(`invoice-revision-${revision.revision}.html`);
    } else {
      setCurrentFileName("invoice.html");
    }
  }, [isOpen, revision]);

  const markInvoiceDirty = useCallback(() => setInvoiceDirty(true), [setInvoiceDirty]);

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

  const saveInvoice = useCallback(async () => {
    const html = buildInvoiceHtmlPayload();
    if (!html || !project?.projectId) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8;" });

    const unique = uuid().slice(0, 8);
    const date = new Date().toISOString().split("T")[0];
    const projectSlug = slugify(project.title || "project");
    const rev = revision?.revision ?? "0";
    const fileName = `${projectSlug}-${rev}-${date}-${unique}.html`;
    const key = `projects/${project.projectId}/invoices/${fileName}`;

    try {
      const uploadTask = uploadData({
        key,
        data: blob,
        options: {
          accessLevel: "guest",
          metadata: { friendlyName: fileName },
        },
      });
      await uploadTask.result;
      setInvoiceDirty(false);
      setCurrentFileName(fileName);
      toast.success("Invoice saved");
    } catch (error) {
      console.error("Failed to save invoice", error);
    }
  }, [
    buildInvoiceHtmlPayload,
    project,
    revision,
    setInvoiceDirty,
  ]);

  const handleSaveClick = useCallback(() => {
    if (invoiceDirty) {
      void saveInvoice();
    } else {
      toast.info("Invoice already saved");
    }
  }, [invoiceDirty, saveInvoice]);

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
    currentFileName,
    handleSaveClick,
    handleSavePdf,
    handlePreviewPdf,
    currentPage,
    setCurrentPage,
    pages,
    groupField,
    handleGroupFieldChange,
    groupOptions,
    groupValues,
    handleToggleGroupValue,
    handleToggleAllGroupValues,
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
    brandName,
    handleBrandNameBlur,
    brandTagline,
    handleBrandTaglineBlur,
    invoiceNumber,
    handleInvoiceNumberBlur,
    issueDate,
    handleIssueDateBlur,
    projectTitle,
    handleProjectTitleBlur,
    customerSummary,
    handleCustomerSummaryBlur,
    invoiceSummary,
    handleInvoiceSummaryBlur,
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
  };
}

export default useInvoicePreviewModal;
