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
import { getFileUrl } from "@/shared/utils/api";

import type {
  BudgetItem,
  InvoicePreviewModalProps,
  RowData,
} from "./invoicePreviewTypes";
import { useInvoiceBranding } from "./useInvoiceBranding";
import { useInvoiceDetails } from "./useInvoiceDetails";
import { useInvoiceGrouping } from "./useInvoiceGrouping";
import { useInvoiceLayout } from "./useInvoiceLayout";
import { useSavedInvoices } from "./useSavedInvoices";
import { parseSavedInvoice } from "./parseSavedInvoice";
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
  } = useInvoiceBranding({
    isOpen,
    userData: userData as UserLite | null | undefined,
    setUserData: updateUserData,
  });
  const organizationName = (userData as UserLite | null | undefined)?.company || "";

  const details = useInvoiceDetails({ isOpen, project, revision });
  const {
    invoiceDirty,
    setInvoiceDirty,
    invoiceNumber,
    issueDate,
    dueDate,
    serviceDate,
    projectTitle,
    customerSummary,
    invoiceSummary,
    paymentSummary,
    notes,
    depositReceived,
    totalDue,
    setTotalDue,
    handleInvoiceNumberBlur,
    handleIssueDateBlur,
    handleDueDateChange,
    handleServiceDateChange,
    handleProjectTitleBlur,
    handleCustomerSummaryBlur,
    handleInvoiceSummaryBlur,
    handlePaymentSummaryBlur,
    handleDepositBlur,
    handleTotalDueBlur,
    handleNotesBlur,
    setInvoiceNumber,
    setIssueDate,
    setDueDate,
    setServiceDate,
    setProjectTitle,
    setCustomerSummary,
    setInvoiceSummary,
    setPaymentSummary,
    setDepositReceived,
    setNotes,
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
  } = grouping;

  const subtotal = useMemo(
    () =>
      filteredItems.reduce((sum, item) => {
        const amount = parseFloat(String(item.itemFinalCost ?? 0)) || 0;
        return sum + amount;
      }, 0),
    [filteredItems]
  );

  useEffect(() => {
    setTotalDue(subtotal - depositReceived);
  }, [subtotal, depositReceived, setTotalDue]);

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

  const {
    savedInvoices,
    setSavedInvoices,
    selectedInvoices,
    toggleInvoiceSelect,
    selectAllInvoices,
    handleDeleteInvoice,
    handleDeleteSelectedInvoices,
    performDeleteInvoices,
    isConfirmingDelete,
    setIsConfirmingDelete,
    refreshInvoices,
  } = useSavedInvoices({ project, isOpen });

  const closeDeleteConfirm = useCallback(() => setIsConfirmingDelete(false), [setIsConfirmingDelete]);

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
    useOrganizationAddress,
    brandName,
    brandTagline,
    brandAddress,
    brandPhone,
    brandLogoKey,
    logoDataUrl,
    organizationAddress,
    invoiceNumber,
    issueDate,
    dueDate,
    serviceDate,
    projectTitle,
    customerSummary,
    invoiceSummary,
    paymentSummary,
    rowsData,
    subtotal,
    depositReceived,
    totalDue,
    notes,
    revision,
    pages,
    selectedPages,
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

  const handleBrandAddressBlur = useCallback(
    (value: string) => {
      setBrandAddress(value);
      markInvoiceDirty();
    },
    [setBrandAddress, markInvoiceDirty]
  );

  const handleBrandPhoneBlur = useCallback(
    (value: string) => {
      setBrandPhone(value);
      markInvoiceDirty();
    },
    [setBrandPhone, markInvoiceDirty]
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
      const storageKey = key.startsWith("public/") ? key : `public/${key}`;
      const url = getFileUrl(storageKey);
      setSavedInvoices((prev) => {
        const next = prev.filter((invoice) => invoice.url !== url);
        return [...next, { name: fileName, url }];
      });
      setInvoiceDirty(false);
      setCurrentFileName(fileName);
      await refreshInvoices();
    } catch (error) {
      console.error("Failed to save invoice", error);
    }
  }, [
    buildInvoiceHtmlPayload,
    project,
    revision,
    setSavedInvoices,
    setInvoiceDirty,
    refreshInvoices,
  ]);

  const handleSaveClick = useCallback(() => {
    if (invoiceDirty) {
      void saveInvoice();
    } else {
      toast.info("Invoice already saved");
    }
  }, [invoiceDirty, saveInvoice]);

  const loadInvoice = useCallback(
    async (url: string) => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch");
        const text = await response.text();
        const parsed = parseSavedInvoice(text, items);
        if (!parsed) return;

        setBrandLogoKey(parsed.brandLogoKey);
        setLogoDataUrl(null);
        setBrandName(parsed.brandName);
        setBrandAddress(parsed.brandAddress);
        setBrandPhone(parsed.brandPhone);
        setBrandTagline(parsed.brandTagline);

        setInvoiceNumber(parsed.invoiceNumber);
        setIssueDate(parsed.issueDate);
        setDueDate(parsed.dueDate);
        setServiceDate(parsed.serviceDate);
        setProjectTitle(parsed.projectTitle);
        setCustomerSummary(parsed.customerSummary);
        setInvoiceSummary(parsed.invoiceSummary);
        setPaymentSummary(parsed.paymentSummary);
        setNotes(parsed.notes);
        setDepositReceived(parsed.depositReceived);
        setTotalDue(parsed.totalDue);

        if (parsed.groupField) setGroupField(parsed.groupField);
        setGroupValues(parsed.groupValues);

        setInvoiceDirty(false);
        setCurrentFileName(url.split("/").pop() || "");
      } catch (error) {
        console.error("Failed to load invoice", error);
      }
    }, [
      items,
      setBrandLogoKey,
      setLogoDataUrl,
      setBrandName,
      setBrandAddress,
      setBrandPhone,
      setBrandTagline,
      setInvoiceNumber,
      setIssueDate,
      setDueDate,
      setServiceDate,
      setProjectTitle,
      setCustomerSummary,
      setInvoiceSummary,
      setPaymentSummary,
      setNotes,
      setDepositReceived,
      setTotalDue,
      setGroupField,
      setGroupValues,
      setInvoiceDirty,
    ]);

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
    savedInvoices,
    selectedInvoices,
    toggleInvoiceSelect,
    selectAllInvoices,
    loadInvoice,
    handleDeleteInvoice,
    handleDeleteSelectedInvoices,
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
    brandAddress,
    handleBrandAddressBlur,
    brandPhone,
    handleBrandPhoneBlur,
    organizationAddress,
    useOrganizationAddress,
    handleToggleOrganizationAddress,
    organizationName,
    invoiceNumber,
    handleInvoiceNumberBlur,
    issueDate,
    handleIssueDateBlur,
    dueDate,
    handleDueDateChange,
    serviceDate,
    handleServiceDateChange,
    projectTitle,
    handleProjectTitleBlur,
    customerSummary,
    handleCustomerSummaryBlur,
    invoiceSummary,
    handleInvoiceSummaryBlur,
    paymentSummary,
    handlePaymentSummaryBlur,
    rowsData,
    subtotal,
    depositReceived,
    handleDepositBlur,
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
    isConfirmingDelete,
    closeDeleteConfirm,
    performDeleteInvoices,
  };
}

export default useInvoicePreviewModal;
