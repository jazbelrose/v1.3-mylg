import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useData } from "@/app/contexts/useData";
import useModalStack from "@/shared/utils/useModalStack";
import { useBudget } from "@/dashboard/project/features/budget/context/BudgetContext";

import type {
  BudgetItem,
  GroupField,
  InvoicePreviewModalProps,
  RowData,
  SavedInvoice,
} from "../invoicePreviewTypes";
import type { parseInvoiceHtml } from "../utils/invoiceHtmlParser";
import { useInvoiceBrandingState } from "./useInvoiceBrandingState";
import { useInvoiceFields } from "./useInvoiceFields";
import { useInvoiceGrouping } from "./useInvoiceGrouping";
import { useInvoicePdf } from "./useInvoicePdf";
import { useInvoiceSavedInvoices } from "./useInvoiceSavedInvoices";

const groupFields: Array<{ label: string; value: GroupField }> = [
  { label: "Invoice Group", value: "invoiceGroup" },
  { label: "Area Group", value: "areaGroup" },
  { label: "Category", value: "category" },
];

type ParsedInvoiceData = NonNullable<ReturnType<typeof parseInvoiceHtml>>;

export interface InvoicePreviewModalViewModel {
  allowSave: boolean;
  showSidebar: boolean;
  modal: {
    isOpen: boolean;
    onRequestClose: () => void;
  };
  header: {
    onClose: () => void;
  };
  fileActions: {
    fileName: string;
    onSave: () => void;
    onSavePdf: () => void;
    onPreviewPdf: () => void;
  };
  itemsLength: number;
  pagesLength: number;
  navControls: {
    currentPage: number;
    setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  };
  sidebar?: {
    groupFields: typeof groupFields;
    groupField: GroupField;
    onGroupFieldChange: (field: GroupField) => void;
    groupOptions: string[];
    groupValues: string[];
    onToggleGroupValue: (val: string) => void;
    onToggleAllGroupValues: (checked: boolean) => void;
    pages: RowData[][];
    selectedPages: number[];
    onTogglePage: (idx: number) => void;
    onToggleAllPages: (checked: boolean) => void;
    savedInvoices: SavedInvoice[];
    selectedInvoices: Set<string>;
    onToggleInvoice: (url: string) => void;
    onSelectAllInvoices: (checked: boolean) => void;
    onLoadInvoice: (url: string) => Promise<void>;
    onDeleteInvoice: (url: string) => void;
    onDeleteSelected: () => void;
    isDirty: boolean;
    onSaveHeader: () => Promise<void>;
    showSaved: boolean;
  };
  preview: {
    invoiceRef: React.MutableRefObject<HTMLDivElement | null>;
    previewRef: React.MutableRefObject<HTMLDivElement | null>;
    fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
    logoDataUrl: string | null;
    brandLogoKey: string;
    onLogoSelect: React.ChangeEventHandler<HTMLInputElement>;
    onLogoDrop: React.DragEventHandler<HTMLDivElement>;
    brandName: string;
    onBrandNameBlur: (value: string) => void;
    brandTagline: string;
    onBrandTaglineBlur: (value: string) => void;
    brandAddress: string;
    onBrandAddressBlur: (value: string) => void;
    brandPhone: string;
    onBrandPhoneBlur: (value: string) => void;
    useProjectAddress: boolean;
    onToggleProjectAddress: (checked: boolean) => void;
    project: InvoicePreviewModalProps["project"];
    invoiceNumber: string;
    onInvoiceNumberBlur: (value: string) => void;
    issueDate: string;
    onIssueDateBlur: (value: string) => void;
    dueDate: string;
    onDueDateChange: (value: string) => void;
    serviceDate: string;
    onServiceDateChange: (value: string) => void;
    projectTitle: string;
    onProjectTitleBlur: (value: string) => void;
    customerSummary: string;
    onCustomerSummaryBlur: (value: string) => void;
    invoiceSummary: string;
    onInvoiceSummaryBlur: (value: string) => void;
    paymentSummary: string;
    onPaymentSummaryBlur: (value: string) => void;
    rowsData: RowData[];
    currentRows: RowData[];
    currentPage: number;
    totalPages: number;
    subtotal: number;
    depositReceived: number;
    onDepositBlur: (value: string) => void;
    totalDue: number;
    onTotalDueBlur: (value: string) => void;
    notes: string;
    onNotesBlur: (value: string) => void;
    pdfPreviewUrl: string | null;
    onClosePdfPreview: () => void;
  };
  unsavedPrompt: {
    isVisible: boolean;
    onStay: () => void;
    onConfirmLeave: () => void;
  };
  confirmDelete: {
    isOpen: boolean;
    onRequestClose: () => void;
    onConfirm: () => Promise<void>;
  };
}

export function useInvoicePreviewModal({
  isOpen,
  onRequestClose,
  revision,
  project,
  showSidebar = true,
  allowSave = true,
  itemsOverride = null,
}: InvoicePreviewModalProps): InvoicePreviewModalViewModel {
  const { userData, setUserData } = useData();
  const { budgetItems: contextBudgetItems } = useBudget();
  const budgetItems = (itemsOverride ?? (contextBudgetItems as unknown as BudgetItem[])) as BudgetItem[];

  const invoiceRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);

  useModalStack(isOpen);

  const {
    items,
    groupField,
    groupValues,
    groupOptions,
    rowsData,
    pages,
    selectedPages,
    currentPage,
    setCurrentPage,
    currentRows,
    subtotal,
    handleGroupFieldChange,
    handleToggleGroupValue,
    handleToggleAllGroupValues,
    handleTogglePage,
    handleToggleAllPages,
    applyGroupingFromInvoice,
  } = useInvoiceGrouping({
    isOpen,
    invoiceRef,
    budgetItems,
  });

  const {
    invoiceDirty,
    markInvoiceDirty,
    setInvoiceDirty,
    currentFileName,
    setCurrentFileName,
    invoiceNumber,
    onInvoiceNumberBlur,
    issueDate,
    onIssueDateBlur,
    dueDate,
    onDueDateChange,
    serviceDate,
    onServiceDateChange,
    projectTitle,
    onProjectTitleBlur,
    customerSummary,
    onCustomerSummaryBlur,
    invoiceSummary,
    onInvoiceSummaryBlur,
    paymentSummary,
    onPaymentSummaryBlur,
    notes,
    onNotesBlur,
    depositReceived,
    onDepositBlur,
    totalDue,
    onTotalDueBlur,
    applyInvoiceData,
  } = useInvoiceFields({ project, revision, isOpen, subtotal });

  const {
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
    showSaved,
    isDirty,
    handleLogoSelect,
    handleLogoDrop,
    handleBrandNameBlur,
    handleBrandTaglineBlur,
    handleBrandAddressBlur,
    handleBrandPhoneBlur,
    handleToggleProjectAddress,
    handleSaveHeader,
  } = useInvoiceBrandingState({
    isOpen,
    userData,
    setUserData,
    markInvoiceDirty,
  });

  const {
    pdfPreviewUrl,
    closePdfPreview,
    handlePreviewPdf,
    handleSavePdf,
    buildInvoiceHtml,
  } = useInvoicePdf({
    isOpen,
    revision,
    previewRef,
    selectedPages,
    pages,
    brandName,
    project,
    useProjectAddress,
    brandAddress,
    brandPhone,
    brandTagline,
    logoDataUrl,
    brandLogoKey,
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
  });

  const handleParsedInvoice = useCallback(
    (parsed: ParsedInvoiceData) => {
      setBrandLogoKey(parsed.brandLogoKey);
      setLogoDataUrl(null);
      setBrandName(parsed.brandName);
      setBrandAddress(parsed.brandAddress);
      setBrandPhone(parsed.brandPhone);
      setBrandTagline(parsed.brandTagline);
      applyInvoiceData(parsed);
      applyGroupingFromInvoice(parsed.groupField, parsed.groupValues);
    },
    [
      applyGroupingFromInvoice,
      applyInvoiceData,
      setBrandAddress,
      setBrandLogoKey,
      setBrandName,
      setBrandPhone,
      setBrandTagline,
      setLogoDataUrl,
    ]
  );

  const {
    savedInvoices,
    selectedInvoices,
    toggleInvoiceSelect,
    selectAllInvoices,
    handleDeleteInvoice,
    handleDeleteSelectedInvoices,
    isConfirmingDelete,
    closeConfirmDelete,
    performDeleteInvoices,
    loadInvoice,
    handleSaveClick,
  } = useInvoiceSavedInvoices({
    isOpen,
    project,
    revision,
    items,
    availableGroupFields: groupFields.map((g) => g.value),
    invoiceDirty,
    setInvoiceDirty,
    buildInvoiceHtml,
    onInvoiceLoaded: handleParsedInvoice,
    setCurrentFileName,
  });

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

  useEffect(() => {
    if (!isOpen) {
      setShowUnsavedPrompt(false);
    }
  }, [isOpen]);

  const itemsLength = items.length;

  return {
    allowSave,
    showSidebar,
    modal: {
      isOpen,
      onRequestClose: handleAttemptClose,
    },
    header: {
      onClose: handleAttemptClose,
    },
    fileActions: {
      fileName: currentFileName,
      onSave: handleSaveClick,
      onSavePdf: handleSavePdf,
      onPreviewPdf: handlePreviewPdf,
    },
    itemsLength,
    pagesLength: pages.length,
    navControls: {
      currentPage,
      setCurrentPage,
    },
    sidebar: showSidebar
      ? {
          groupFields,
          groupField,
          onGroupFieldChange: handleGroupFieldChange,
          groupOptions,
          groupValues,
          onToggleGroupValue: handleToggleGroupValue,
          onToggleAllGroupValues: handleToggleAllGroupValues,
          pages,
          selectedPages,
          onTogglePage: handleTogglePage,
          onToggleAllPages: handleToggleAllPages,
          savedInvoices,
          selectedInvoices,
          onToggleInvoice: toggleInvoiceSelect,
          onSelectAllInvoices: selectAllInvoices,
          onLoadInvoice: loadInvoice,
          onDeleteInvoice: handleDeleteInvoice,
          onDeleteSelected: handleDeleteSelectedInvoices,
          isDirty,
          onSaveHeader: handleSaveHeader,
          showSaved,
        }
      : undefined,
    preview: {
      invoiceRef,
      previewRef,
      fileInputRef,
      logoDataUrl,
      brandLogoKey,
      onLogoSelect: handleLogoSelect,
      onLogoDrop: handleLogoDrop,
      brandName,
      onBrandNameBlur: handleBrandNameBlur,
      brandTagline,
      onBrandTaglineBlur: handleBrandTaglineBlur,
      brandAddress,
      onBrandAddressBlur: handleBrandAddressBlur,
      brandPhone,
      onBrandPhoneBlur: handleBrandPhoneBlur,
      useProjectAddress,
      onToggleProjectAddress: handleToggleProjectAddress,
      project,
      invoiceNumber,
      onInvoiceNumberBlur,
      issueDate,
      onIssueDateBlur,
      dueDate,
      onDueDateChange,
      serviceDate,
      onServiceDateChange,
      projectTitle,
      onProjectTitleBlur,
      customerSummary,
      onCustomerSummaryBlur,
      invoiceSummary,
      onInvoiceSummaryBlur,
      paymentSummary,
      onPaymentSummaryBlur,
      rowsData,
      currentRows,
      currentPage,
      totalPages: pages.length,
      subtotal,
      depositReceived,
      onDepositBlur,
      totalDue,
      onTotalDueBlur,
      notes,
      onNotesBlur,
      pdfPreviewUrl,
      onClosePdfPreview: closePdfPreview,
    },
    unsavedPrompt: {
      isVisible: showUnsavedPrompt,
      onStay: handleStayOpen,
      onConfirmLeave: handleConfirmLeave,
    },
    confirmDelete: {
      isOpen: isConfirmingDelete,
      onRequestClose: closeConfirmDelete,
      onConfirm: performDeleteInvoices,
    },
  };
}
