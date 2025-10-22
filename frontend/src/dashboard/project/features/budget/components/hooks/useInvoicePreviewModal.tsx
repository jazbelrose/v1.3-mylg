import type React from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { pdf as createPdf } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import { uploadData, list } from "aws-amplify/storage";
import { apiFetch, fileUrlsToKeys, getFileUrl, projectFileDeleteUrl } from "@/shared/utils/api";
import { v4 as uuid } from "uuid";
import { useData } from "@/app/contexts/useData";
import { slugify } from "@/shared/utils/slug";
import { toast } from "react-toastify";
import useModalStack from "@/shared/utils/useModalStack";
import { useBudget } from "@/dashboard/project/features/budget/context/BudgetContext";

import PdfInvoice from "../PdfInvoice";
import type {
  BudgetItem,
  GroupField,
  InvoicePreviewModalProps,
  RowData,
  SavedInvoice,
} from "../invoicePreviewTypes";
import { buildInvoiceHtml as buildInvoiceHtmlDocument } from "../utils/invoiceHtmlBuilder";
import { parseInvoiceHtml } from "../utils/invoiceHtmlParser";
import { useInvoiceBrandingState } from "./useInvoiceBrandingState";

const groupFields: Array<{ label: string; value: GroupField }> = [
  { label: "Invoice Group", value: "invoiceGroup" },
  { label: "Area Group", value: "areaGroup" },
  { label: "Category", value: "category" },
];

const DEFAULT_NOTES_HTML = "<p>Notes...</p>";

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
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [groupField, setGroupField] = useState<GroupField>("invoiceGroup");
  const [groupValues, setGroupValues] = useState<string[]>([]);
  const { userData, setUserData } = useData();
  const { budgetItems: contextBudgetItems } = useBudget();
  const budgetItems = (itemsOverride ?? (contextBudgetItems as unknown as BudgetItem[])) as BudgetItem[];

  const invoiceRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const pdfPreviewUrlRef = useRef<string | null>(null);

  const [currentPage, setCurrentPage] = useState(0);
  const [pages, setPages] = useState<RowData[][]>([]);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const currentRows = pages[currentPage] || [];

  const [invoiceDirty, setInvoiceDirty] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("0000");
  const [issueDate, setIssueDate] = useState<string>(() => new Date().toLocaleDateString());
  const [dueDate, setDueDate] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [projectTitle, setProjectTitle] = useState(project?.title || "Project Title");
  const [customerSummary, setCustomerSummary] = useState("Customer");
  const [invoiceSummary, setInvoiceSummary] = useState("Invoice Details");
  const [paymentSummary, setPaymentSummary] = useState("Payment");
  const [notes, setNotes] = useState(DEFAULT_NOTES_HTML);
  const [depositReceived, setDepositReceived] = useState<number>(0);
  const [totalDue, setTotalDue] = useState<number>(0);

  const [savedInvoices, setSavedInvoices] = useState<SavedInvoice[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(() => new Set());
  const [currentFileName, setCurrentFileName] = useState<string>("");

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useModalStack(isOpen);

  const markInvoiceDirty = useCallback(() => setInvoiceDirty(true), []);

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

  const fetchInvoiceFiles = useCallback(async (): Promise<SavedInvoice[]> => {
    if (!project?.projectId) return [];
    const prefix = `projects/${project.projectId}/invoices/`;
    try {
      const res = await list({ prefix, options: { accessLevel: "guest" } });
      return (res.items || [])
        .filter((item) => item.key && !String(item.key).endsWith("/"))
        .map((item) => {
          const rawKey = String(item.key);
          const storageKey = rawKey.startsWith("public/") ? rawKey : `public/${rawKey}`;
          return {
            name: rawKey.split("/").pop() || "",
            url: getFileUrl(storageKey),
          };
        });
    } catch (err) {
      console.error("Failed to list invoice files", err);
      return [];
    }
  }, [project?.projectId]);

  const toggleInvoiceSelect = (url: string) => {
    setSelectedInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const selectAllInvoices = (checked: boolean) => {
    if (checked) {
      setSelectedInvoices(new Set(savedInvoices.map((i) => i.url)));
    } else {
      setSelectedInvoices(new Set());
    }
  };

  const handleDeleteInvoice = (url: string) => {
    setSelectedInvoices(new Set([url]));
    setIsConfirmingDelete(true);
  };

  const handleDeleteSelectedInvoices = () => {
    if (selectedInvoices.size > 0) {
      setIsConfirmingDelete(true);
    }
  };

  const performDeleteInvoices = useCallback(async () => {
    const fileUrls = Array.from(selectedInvoices);
    const fileKeys = fileUrlsToKeys(fileUrls);
    if (!fileKeys.length || !project?.projectId) return;
    const { projectId } = project;
    setIsConfirmingDelete(false);
    const toastId = toast.loading("Deleting invoices...");
    try {
      await apiFetch(projectFileDeleteUrl(projectId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileKeys,
        }),
      });
      setSavedInvoices((prev) => prev.filter((inv) => !fileUrls.includes(inv.url)));
      setSelectedInvoices(new Set());
      toast.update(toastId, {
        render: "Invoices deleted.",
        type: "success",
        isLoading: false,
        autoClose: 3000,
      });
    } catch (err) {
      console.error("Failed to delete invoices", err);
      toast.update(toastId, {
        render: "Failed to delete invoices.",
        type: "error",
        isLoading: false,
        autoClose: 3000,
      });
    }
  }, [project, selectedInvoices]);

  const loadInvoice = useCallback(
    async (url: string) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch");
        const text = await res.text();
        const parsed = parseInvoiceHtml(text, items, groupFields.map((g) => g.value as GroupField));
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
        if (parsed.groupValues.length) setGroupValues(parsed.groupValues);

        setInvoiceDirty(false);
        setCurrentFileName(url.split("/").pop() || "");
      } catch (err) {
        console.error("Failed to load invoice", err);
      }
    },
    [
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
      setCurrentFileName,
    ]
  );

  useEffect(() => {
    if (!isOpen) return;
    setInvoiceNumber("0000");
    setIssueDate(new Date().toLocaleDateString());
    setDueDate("");
    setServiceDate("");
    setProjectTitle(project?.title || "Project Title");
    setCustomerSummary(project?.clientName || "Customer");
    setInvoiceSummary("Invoice Details");
    setPaymentSummary("Payment");
    setNotes(DEFAULT_NOTES_HTML);
    setDepositReceived(0);
    setInvoiceDirty(true);

    if (revision?.revision != null) {
      setCurrentFileName(`invoice-revision-${revision.revision}.html`);
    } else {
      setCurrentFileName("invoice.html");
    }
  }, [isOpen, project, revision]);

  useEffect(() => {
    if (!isOpen) return;
    const arr = Array.isArray(budgetItems) ? (budgetItems as BudgetItem[]) : [];
    setItems(arr);
    if (arr.length && !arr.some((i) => i.invoiceGroup)) {
      setGroupField("category");
      setGroupValues([]);
    }
  }, [isOpen, budgetItems]);

  useEffect(() => {
    if (!isOpen || !project?.projectId) return;
    fetchInvoiceFiles()
      .then((files) => setSavedInvoices(Array.isArray(files) ? files : []))
      .catch((err) => console.error("Failed to fetch invoices", err));
  }, [isOpen, project?.projectId, fetchInvoiceFiles]);

  useEffect(() => {
    const vals = Array.from(
      new Set(
        items
          .map((it) => String((it as BudgetItem)[groupField] || "").trim())
          .filter(Boolean)
      )
    );
    if (groupValues.length === 0) {
      setGroupValues(vals);
    } else {
      const filteredVals = groupValues.filter((v) => vals.includes(v));
      if (filteredVals.length !== groupValues.length) {
        setGroupValues(filteredVals);
      }
    }
  }, [items, groupField, groupValues]);

  const groupOptions = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .map((it) => String((it as BudgetItem)[groupField] || "").trim())
            .filter(Boolean)
        )
      ),
    [items, groupField]
  );

  const filtered = useMemo(
    () =>
      groupValues.length === 0
        ? items
        : items.filter((it) => groupValues.includes(String((it as BudgetItem)[groupField]).trim())),
    [groupValues, items, groupField]
  );

  const subtotal = useMemo(
    () =>
      filtered.reduce((sum, it) => {
        const amt = parseFloat(String(it.itemFinalCost ?? 0)) || 0;
        return sum + amt;
      }, 0),
    [filtered]
  );

  useEffect(() => {
    const dep = parseFloat(String(depositReceived)) || 0;
    setTotalDue(subtotal - dep);
  }, [subtotal, depositReceived]);

  const rowsData: RowData[] = useMemo(() => {
    const groups = groupValues.length === 0 ? groupOptions : groupValues;
    const arr: RowData[] = [];
    groups.forEach((grp) => {
      if (grp) arr.push({ type: "group", group: grp });
      items
        .filter((it) => String((it as BudgetItem)[groupField]).trim() === grp)
        .forEach((it) => arr.push({ type: "item", item: it }));
    });
    return arr;
  }, [items, groupValues, groupField, groupOptions]);

  useLayoutEffect(() => {
    if (!invoiceRef.current) return;
    const pageHeight = 1122;
    const pageNumberHeight = 40;
    const top = invoiceRef.current.querySelector(".invoice-top") as HTMLElement | null;
    const thead = invoiceRef.current.querySelector(".items-table thead") as HTMLElement | null;
    const totals = invoiceRef.current.querySelector(".totals") as HTMLElement | null;
    const notesEl = invoiceRef.current.querySelector(".notes") as HTMLElement | null;
    const footer = invoiceRef.current.querySelector(".footer") as HTMLElement | null;
    const bottomBlock = invoiceRef.current.querySelector(".bottom-block") as HTMLElement | null;

    const getTotalHeight = (el: HTMLElement | null) => {
      if (!el) return 0;
      const style = window.getComputedStyle(el);
      const marginTop = parseFloat(style.marginTop || "0");
      const marginBottom = parseFloat(style.marginBottom || "0");
      return el.offsetHeight + marginTop + marginBottom;
    };

    const topHeight = (top?.offsetHeight || 0) + (thead?.offsetHeight || 0);
    const bottomHeight =
      getTotalHeight(bottomBlock) ||
      getTotalHeight(totals) + getTotalHeight(notesEl) + getTotalHeight(footer);
    const staticHeights = topHeight + pageNumberHeight;

    const rowEls = Array.from(
      invoiceRef.current.querySelectorAll(".items-table tbody tr")
    ) as HTMLElement[];

    let available = Math.max(pageHeight - staticHeights, 0);
    const pagesAccum: RowData[][] = [];
    let current: RowData[] = [];

    rowEls.forEach((row, idx) => {
      const rowHeight = row.offsetHeight;
      const data = rowsData[idx];
      const isLast = idx === rowEls.length - 1;
      const nextRow = rowEls[idx + 1];
      const nextData = rowsData[idx + 1];
      const isGroupHeader = row.classList.contains("group-header");
      const bundleHeight =
        isGroupHeader && nextRow && nextData?.type === "item"
          ? rowHeight + nextRow.offsetHeight
          : rowHeight;
      const needed = bundleHeight + (isLast ? bottomHeight : 0);
      if (needed > available && current.length) {
        pagesAccum.push(current);
        current = [];
        available = Math.max(pageHeight - staticHeights, 0);
      }
      current.push(data);
      available -= rowHeight;
    });

    if (current.length) pagesAccum.push(current);

    setPages((prevPages) => {
      const same =
        prevPages.length === pagesAccum.length &&
        prevPages.every((p, i) => p.length === pagesAccum[i].length);
      return same ? prevPages : pagesAccum;
    });
  }, [rowsData]);

  useEffect(() => {
    setSelectedPages(pages.map((_, i) => i));
    setCurrentPage(0);
  }, [pages]);

  const closePdfPreview = useCallback(() => {
    if (pdfPreviewUrlRef.current) {
      URL.revokeObjectURL(pdfPreviewUrlRef.current);
      pdfPreviewUrlRef.current = null;
    }
    setPdfPreviewUrl(null);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setShowUnsavedPrompt(false);
      closePdfPreview();
    }
  }, [isOpen, closePdfPreview]);

  useEffect(() => () => closePdfPreview(), [closePdfPreview]);

  const buildPdfInvoiceElement = useCallback(() => {
    const addressForPdf = useProjectAddress ? project?.address || "" : brandAddress;
    return (
      <PdfInvoice
        brandName={brandName || project?.company || ""}
        brandTagline={brandTagline}
        brandAddress={addressForPdf}
        brandPhone={brandPhone}
        brandLogoKey={brandLogoKey}
        logoDataUrl={logoDataUrl}
        project={project}
        invoiceNumber={invoiceNumber}
        issueDate={issueDate}
        dueDate={dueDate}
        serviceDate={serviceDate}
        projectTitle={projectTitle}
        customerSummary={customerSummary}
        invoiceSummary={invoiceSummary}
        paymentSummary={paymentSummary}
        rows={rowsData}
        subtotal={subtotal}
        depositReceived={depositReceived}
        totalDue={totalDue}
        notes={notes}
      />
    );
  }, [
    brandAddress,
    brandLogoKey,
    brandName,
    brandPhone,
    brandTagline,
    customerSummary,
    depositReceived,
    dueDate,
    invoiceNumber,
    invoiceSummary,
    issueDate,
    logoDataUrl,
    notes,
    paymentSummary,
    project,
    projectTitle,
    rowsData,
    serviceDate,
    subtotal,
    totalDue,
    useProjectAddress,
  ]);

  const renderPdfBlob = useCallback(async (): Promise<Blob | null> => {
    try {
      const instance = createPdf(buildPdfInvoiceElement());
      const blob = await instance.toBlob();
      return blob;
    } catch (err) {
      console.error("Failed to generate invoice PDF", err);
      toast.error("Unable to build invoice PDF");
      return null;
    }
  }, [buildPdfInvoiceElement]);

  const handleSavePdf = useCallback(async () => {
    const blob = await renderPdfBlob();
    if (!blob) return;
    const file =
      revision?.revision != null
        ? `invoice-revision-${revision.revision}.pdf`
        : "invoice.pdf";
    saveAs(blob, file);
  }, [renderPdfBlob, revision]);

  const handlePreviewPdf = useCallback(async () => {
    const blob = await renderPdfBlob();
    if (!blob) return;
    closePdfPreview();
    const objectUrl = URL.createObjectURL(blob);
    pdfPreviewUrlRef.current = objectUrl;
    setPdfPreviewUrl(objectUrl);
  }, [renderPdfBlob, closePdfPreview]);

  const buildInvoiceHtml = useCallback(
    () =>
      buildInvoiceHtmlDocument({
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
        notes,
        depositReceived,
        totalDue,
        subtotal,
      }),
    [
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
      notes,
      depositReceived,
      totalDue,
      subtotal,
    ]
  );

  const saveInvoice = useCallback(async () => {
    const html = buildInvoiceHtml();
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
        const next = prev.filter((inv) => inv.url !== url);
        return [...next, { name: fileName, url }];
      });
      setInvoiceDirty(false);
      setCurrentFileName(fileName);
    } catch (err) {
      console.error("Failed to save invoice", err);
    }
  }, [buildInvoiceHtml, project, revision]);

  const handleSaveClick = useCallback(() => {
    if (invoiceDirty) saveInvoice();
    else toast.info("Invoice already saved");
  }, [invoiceDirty, saveInvoice]);

  const handleGroupFieldChange = (field: GroupField) => {
    setGroupField(field);
    setGroupValues([]);
  };

  const handleToggleGroupValue = (val: string) => {
    setGroupValues((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
    );
  };

  const handleToggleAllGroupValues = (checked: boolean) => {
    setGroupValues(checked ? groupOptions : []);
  };

  const handleTogglePage = (idx: number) => {
    setSelectedPages((prev) =>
      prev.includes(idx) ? prev.filter((p) => p !== idx) : [...prev, idx]
    );
  };

  const handleToggleAllPages = (checked: boolean) => {
    setSelectedPages(checked ? pages.map((_, i) => i) : []);
  };

  const handleInvoiceNumberBlur = (value: string) => {
    setInvoiceNumber(value);
    setInvoiceDirty(true);
  };
  const handleIssueDateBlur = (value: string) => {
    setIssueDate(value);
    setInvoiceDirty(true);
  };
  const handleDueDateChange = (value: string) => {
    setDueDate(value);
    setInvoiceDirty(true);
  };
  const handleServiceDateChange = (value: string) => {
    setServiceDate(value);
    setInvoiceDirty(true);
  };
  const handleProjectTitleBlur = (value: string) => {
    setProjectTitle(value);
    setInvoiceDirty(true);
  };
  const handleCustomerSummaryBlur = (value: string) => {
    setCustomerSummary(value);
    setInvoiceDirty(true);
  };
  const handleInvoiceSummaryBlur = (value: string) => {
    setInvoiceSummary(value);
    setInvoiceDirty(true);
  };
  const handlePaymentSummaryBlur = (value: string) => {
    setPaymentSummary(value);
    setInvoiceDirty(true);
  };
  const handleDepositBlur = (value: string) => {
    const parsed = parseFloat(value.replace(/[$,]/g, "")) || 0;
    setDepositReceived(parsed);
    setInvoiceDirty(true);
  };
  const handleTotalDueBlur = (value: string) => {
    const parsed = parseFloat(value.replace(/[$,]/g, "")) || 0;
    setTotalDue(parsed);
    setInvoiceDirty(true);
  };
  const handleNotesBlur = (value: string) => {
    setNotes(value);
    setInvoiceDirty(true);
  };

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
    itemsLength: items.length,
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
      onInvoiceNumberBlur: handleInvoiceNumberBlur,
      issueDate,
      onIssueDateBlur: handleIssueDateBlur,
      dueDate,
      onDueDateChange: handleDueDateChange,
      serviceDate,
      onServiceDateChange: handleServiceDateChange,
      projectTitle,
      onProjectTitleBlur: handleProjectTitleBlur,
      customerSummary,
      onCustomerSummaryBlur: handleCustomerSummaryBlur,
      invoiceSummary,
      onInvoiceSummaryBlur: handleInvoiceSummaryBlur,
      paymentSummary,
      onPaymentSummaryBlur: handlePaymentSummaryBlur,
      rowsData,
      currentRows,
      currentPage,
      totalPages: pages.length,
      subtotal,
      depositReceived,
      onDepositBlur: handleDepositBlur,
      totalDue,
      onTotalDueBlur: handleTotalDueBlur,
      notes,
      onNotesBlur: handleNotesBlur,
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
      onRequestClose: () => setIsConfirmingDelete(false),
      onConfirm: performDeleteInvoices,
    },
  };
}
