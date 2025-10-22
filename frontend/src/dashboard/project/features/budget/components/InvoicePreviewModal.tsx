import React, {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { pdf as createPdf } from "@react-pdf/renderer";
import { createPortal } from "react-dom";
import Modal from "@/shared/ui/ModalWithStack";
import { saveAs } from "file-saver";
import { uploadData, list } from "aws-amplify/storage";
import {
  updateUserProfile,
  apiFetch,
  fileUrlsToKeys,
  getFileUrl,
  projectFileDeleteUrl,
} from "@/shared/utils/api";
import { v4 as uuid } from "uuid";
import { useData } from "@/app/contexts/useData";
import { slugify } from "@/shared/utils/slug";
import ConfirmModal from "@/shared/ui/ConfirmModal";
import { toast } from "react-toastify";
import useModalStack from "@/shared/utils/useModalStack";
import { useBudget } from "@/dashboard/project/features/budget/context/BudgetContext";
import { UserLite } from "@/app/contexts/DataProvider";

import InvoiceModalHeader from "./InvoiceModalHeader";
import InvoiceFileActions from "./InvoiceFileActions";
import InvoiceNavControls from "./InvoiceNavControls";
import InvoiceSidebar from "./InvoiceSidebar";
import InvoicePreviewContent from "./InvoicePreviewContent";
import PdfInvoice from "./PdfInvoice";
import styles from "./invoice-preview-modal.module.css";
import type {
  BudgetItem,
  GroupField,
  InvoicePreviewModalProps,
  RowData,
  SavedInvoice,
} from "./invoicePreviewTypes";
import { formatCurrency } from "./invoicePreviewUtils";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

const groupFields: Array<{ label: string; value: GroupField }> = [
  { label: "Invoice Group", value: "invoiceGroup" },
  { label: "Area Group", value: "areaGroup" },
  { label: "Category", value: "category" },
];

const DEFAULT_NOTES_HTML = "<p>Notes...</p>";

const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  isOpen,
  onRequestClose,
  revision,
  project,
  showSidebar = true,
  allowSave = true,
  itemsOverride = null,
}) => {
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [groupField, setGroupField] = useState<GroupField>("invoiceGroup");
  const [groupValues, setGroupValues] = useState<string[]>([]);
  const { userData, setUserData } = useData();
  const { budgetItems: contextBudgetItems } = useBudget();
  const budgetItems = (itemsOverride ?? (contextBudgetItems as unknown as BudgetItem[])) as BudgetItem[];

  const invoiceRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const pdfPreviewUrlRef = useRef<string | null>(null);
  const livePdfUrlRef = useRef<string | null>(null);

  const [currentPage, setCurrentPage] = useState(0);
  const [pages, setPages] = useState<RowData[][]>([]);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);

  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [brandName, setBrandName] = useState("");
  const [brandAddress, setBrandAddress] = useState("");
  const [brandPhone, setBrandPhone] = useState("");
  const [brandTagline, setBrandTagline] = useState("");
  const [brandLogoKey, setBrandLogoKey] = useState("");
  const [useProjectAddress, setUseProjectAddress] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

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
  const [overlayPdfUrl, setOverlayPdfUrl] = useState<string | null>(null);
  const [livePdfUrl, setLivePdfUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useModalStack(isOpen);

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

  const performDeleteInvoices = async () => {
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
  };

  const loadInvoice = async (url: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      const text = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      const page = doc.querySelector(".invoice-page");
      if (!page) return;

      const q = (sel: string) => page.querySelector(sel);

      setBrandLogoKey(q(".invoice-header img")?.getAttribute("src") || "");
      setLogoDataUrl(null);
      setBrandName(q(".brand-name")?.textContent || "");
      setBrandAddress(q(".brand-address")?.textContent || "");
      setBrandPhone(q(".brand-phone")?.textContent || "");
      setBrandTagline(q(".brand-tagline")?.textContent || "");

      const infoSpans = page.querySelectorAll(".billing-info > div:last-child span");
      setInvoiceNumber(infoSpans[0]?.textContent || "");
      setIssueDate(infoSpans[1]?.textContent || "");
      setDueDate(infoSpans[2]?.textContent || "");
      setServiceDate(infoSpans[3]?.textContent || "");

      setProjectTitle(q(".project-title")?.textContent || "");

      const summaryDivs = page.querySelectorAll(".summary > div");
      setCustomerSummary(summaryDivs[0]?.textContent || "");
      setInvoiceSummary(summaryDivs[1]?.textContent || "");
      setPaymentSummary(summaryDivs[2]?.textContent || "");

      const totals = page.querySelectorAll(".totals span");
      const parseMoney = (v: string | null) =>
        parseFloat(String(v || "").replace(/[$,]/g, "")) || 0;

      if (totals.length >= 3) {
        setDepositReceived(parseMoney(totals[1]?.textContent));
        setTotalDue(parseMoney(totals[2]?.textContent));
      }

      const notesEl = q(".notes");
      if (notesEl) setNotes(notesEl.innerHTML || "");

      const parsedGroups = Array.from(
        doc.querySelectorAll(".group-header td")
      ).map((td) => (td.textContent || "").trim());
      if (parsedGroups.length) {
        const candidate = (groupFields.map((g) => g.value) as GroupField[]).find((field) => {
          const opts = Array.from(
            new Set(
              items
                .map((it) => (String((it as BudgetItem)[field] || "")).trim())
                .filter(Boolean)
            )
          );
          return parsedGroups.every((g) => opts.includes(g));
        });
        if (candidate) setGroupField(candidate);
        setGroupValues(parsedGroups);
      }

      setInvoiceDirty(false);
      setCurrentFileName(url.split("/").pop() || "");
    } catch (err) {
      console.error("Failed to load invoice", err);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const u = (userData || {}) as {
      brandLogoKey?: string;
      brandLogoUrl?: string;
      brandName?: string;
      company?: string;
      brandAddress?: string;
      brandPhone?: string;
      brandTagline?: string;
    };
    let logoKey = u.brandLogoKey || "";
    if (!logoKey && u.brandLogoUrl) {
      logoKey = fileUrlsToKeys([u.brandLogoUrl])[0] || "";
    }
    setBrandLogoKey(logoKey);
    setBrandName(u.brandName || u.company || "");
    setBrandAddress(u.brandAddress || "");
    setBrandPhone(u.brandPhone || "");
    setBrandTagline(u.brandTagline || "");
    setLogoDataUrl(null);
    setUseProjectAddress(false);
    setShowSaved(false);
    setIsDirty(false);
  }, [isOpen, userData]);

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
    const u = (userData || {}) as {
      brandLogoKey?: string;
      brandLogoUrl?: string;
      brandName?: string;
      company?: string;
      brandAddress?: string;
      brandPhone?: string;
      brandTagline?: string;
    };
    const currentKey = u.brandLogoKey || (u.brandLogoUrl ? fileUrlsToKeys([u.brandLogoUrl])[0] : "");
    const dirty =
      (brandLogoKey || "") !== currentKey ||
      (brandName || "") !== (u.brandName || u.company || "") ||
      (brandAddress || "") !== (u.brandAddress || "") ||
      (brandPhone || "") !== (u.brandPhone || "") ||
      (brandTagline || "") !== (u.brandTagline || "");
    setIsDirty(dirty);
  }, [brandLogoKey, brandName, brandAddress, brandPhone, brandTagline, userData]);

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
  }, [items, groupField]);

  const groupOptions = Array.from(
    new Set(
      items
        .map((it) => String((it as BudgetItem)[groupField] || "").trim())
        .filter(Boolean)
    )
  );

  const filtered =
    groupValues.length === 0
      ? items
      : items.filter((it) => groupValues.includes(String((it as BudgetItem)[groupField]).trim()));

  const subtotal = filtered.reduce((sum, it) => {
    const amt = parseFloat(String(it.itemFinalCost ?? 0)) || 0;
    return sum + amt;
  }, 0);

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

    const same =
      pages.length === pagesAccum.length &&
      pages.every((p, i) => p.length === pagesAccum[i].length);

    if (!same) setPages(pagesAccum);
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
    setOverlayPdfUrl(null);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setShowUnsavedPrompt(false);
      closePdfPreview();
      if (livePdfUrlRef.current) {
        URL.revokeObjectURL(livePdfUrlRef.current);
        livePdfUrlRef.current = null;
      }
      setLivePdfUrl(null);
    }
  }, [isOpen, closePdfPreview]);

  useEffect(() => () => closePdfPreview(), [closePdfPreview]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const timer: ReturnType<typeof setTimeout> = setTimeout(async () => {
      const blob = await renderPdfBlob();
      if (!blob || cancelled) return;
      const objectUrl = URL.createObjectURL(blob);
      if (cancelled) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      if (livePdfUrlRef.current) {
        URL.revokeObjectURL(livePdfUrlRef.current);
      }
      livePdfUrlRef.current = objectUrl;
      setLivePdfUrl(objectUrl);
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, renderPdfBlob]);

  useEffect(
    () => () => {
      if (livePdfUrlRef.current) {
        URL.revokeObjectURL(livePdfUrlRef.current);
        livePdfUrlRef.current = null;
      }
    },
    []
  );

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
    setOverlayPdfUrl(objectUrl);
  }, [renderPdfBlob, closePdfPreview]);

  const buildInvoiceHtml = (): string => {
    if (!previewRef.current) return "";
    const style = document.getElementById("invoice-preview-styles")?.innerHTML || "";
    const pageIndexes = selectedPages.length > 0 ? selectedPages : pages.map((_, i) => i);

    const htmlPages = pageIndexes
      .map((idx) => {
        const pageRows = pages[idx] || [];
        const rowsHtml = pageRows
          .map((row) =>
            row.type === "group"
              ? `<tr class="group-header"><td colSpan="5">${row.group}</td></tr>`
              : `<tr>
                   <td>${row.item.description || ""}</td>
                   <td>${row.item.quantity || ""}</td>
                   <td>${row.item.unit || ""}</td>
                   <td>${formatCurrency(
                     (parseFloat(String(row.item.itemFinalCost || 0)) || 0) /
                       (parseFloat(String(row.item.quantity || 1)) || 1)
                   )}</td>
                   <td>${formatCurrency(
                     parseFloat(String(row.item.itemFinalCost || 0)) || 0
                   )}</td>
                 </tr>`
          )
          .join("");

        const headerName = brandName || project?.company || "Company Name";
        const headerAddress = useProjectAddress ? project?.address || "Address" : brandAddress || "Address";
        const headerPhone = brandPhone || "Phone";
        const headerTag = brandTagline || "";
        const logoSrc = logoDataUrl || (brandLogoKey ? getFileUrl(brandLogoKey) : "");

        const invNum = invoiceNumber || "";
        const issue = issueDate || "";
        const due = dueDate || "";
        const service = serviceDate || "";

        const billContact = project?.clientName || "Client Name";
        const billCompany = project?.invoiceBrandName || "Client Company";
        const billAddress = project?.invoiceBrandAddress || project?.clientAddress || "Client Address";
        const billPhone = project?.invoiceBrandPhone || project?.clientPhone || "";
        const billEmail = project?.clientEmail || "";

        const projTitle = projectTitle || "";
        const custSum = customerSummary || "";
        const invSum = invoiceSummary || "";
        const paySum = paymentSummary || "";
        const notesText = notes || "";

        const deposit = formatCurrency(depositReceived);
        const total = formatCurrency(totalDue);

        const logoHtml = logoSrc
          ? `<img src="${logoSrc}" alt="logo" style="max-width:100px;max-height:100px" />`
          : "";

        const totalsHtml =
          idx === pages.length - 1
            ? `<div class="bottom-block">
                 <div class="totals">
                   <div>Subtotal: <span>${formatCurrency(subtotal)}</span></div>
                   <div>Deposit received: <span>${deposit}</span></div>
                   <div><strong>Total Due: <span>${total}</span></strong></div>
                 </div>
                 <div class="notes">${notesText}</div>
                 <div class="footer">${projTitle}</div>
               </div>`
            : "";

        return `
          <div class="invoice-page invoice-container">
            <div class="invoice-top">
              <div class="invoice-header">
                <div>${logoHtml}</div>
                <div class="company-info">
                  <div class="brand-name">${headerName}</div>
                  ${headerTag ? `<div class="brand-tagline">${headerTag}</div>` : ""}
                  <div class="brand-address">${headerAddress}</div>
                  <div class="brand-phone">${headerPhone}</div>
                </div>
                <div class="invoice-title">INVOICE</div>
              </div>
              <div class="billing-info">
                <div>
                  <strong>Bill To:</strong>
                  <div>${billContact}</div>
                  <div>${billCompany}</div>
                  <div>${billAddress}</div>
                  ${billPhone ? `<div>${billPhone}</div>` : ""}
                  ${billEmail ? `<div>${billEmail}</div>` : ""}
                </div>
                <div>
                  <div>Invoice #: <span>${invNum}</span></div>
                  <div>Issue date: <span>${issue}</span></div>
                  <div>Due date: <span>${due}</span></div>
                  <div>Service date: <span>${service}</span></div>
                </div>
              </div>
            </div>
            <h1 class="project-title">${projTitle}</h1>
            <div class="summary"><div>${custSum}</div><div>${invSum}</div><div>${paySum}</div></div>
            <hr class="summary-divider" />
            <div class="items-table-wrapper">
              <table class="items-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>QTY</th>
                    <th>Unit</th>
                    <th>Unit Price</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>
            </div>
            ${totalsHtml}
            <div class="pageNumber">Page ${idx + 1} of ${pages.length}</div>
          </div>
        `;
      })
      .join("");

    const title = invoiceNumber ? `Invoice ${invoiceNumber}` : "Invoice";
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>${style}</style></head><body>${htmlPages}</body></html>`;
  };

  const saveInvoice = async () => {
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
  };

  const handleSaveClick = () => {
    if (invoiceDirty) saveInvoice();
    else toast.info("Invoice already saved");
  };

  const handleSaveHeader = async () => {
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
        ...userData,
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
  };

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

  const handleBrandNameChange = (value: string) => {
    setBrandName(value);
    setInvoiceDirty(true);
  };
  const handleBrandTaglineChange = (value: string) => {
    setBrandTagline(value);
    setInvoiceDirty(true);
  };
  const handleBrandAddressChange = (value: string) => {
    setBrandAddress(value);
    setInvoiceDirty(true);
  };
  const handleBrandPhoneChange = (value: string) => {
    setBrandPhone(value);
    setInvoiceDirty(true);
  };
  const handleToggleProjectAddress = (checked: boolean) => {
    setUseProjectAddress(checked);
  };
  const handleInvoiceNumberChange = (value: string) => {
    setInvoiceNumber(value);
    setInvoiceDirty(true);
  };
  const handleIssueDateChange = (value: string) => {
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
  const handleProjectTitleChange = (value: string) => {
    setProjectTitle(value);
    setInvoiceDirty(true);
  };
  const handleCustomerSummaryChange = (value: string) => {
    setCustomerSummary(value);
    setInvoiceDirty(true);
  };
  const handleInvoiceSummaryChange = (value: string) => {
    setInvoiceSummary(value);
    setInvoiceDirty(true);
  };
  const handlePaymentSummaryChange = (value: string) => {
    setPaymentSummary(value);
    setInvoiceDirty(true);
  };
  const handleDepositChange = (value: string) => {
    const parsed = parseFloat(value.replace(/[$,]/g, "")) || 0;
    setDepositReceived(parsed);
    setInvoiceDirty(true);
  };
  const handleTotalDueChange = (value: string) => {
    const parsed = parseFloat(value.replace(/[$,]/g, "")) || 0;
    setTotalDue(parsed);
    setInvoiceDirty(true);
  };
  const handleNotesChange = (value: string) => {
    setNotes(value);
    setInvoiceDirty(true);
  };

  return (
    <Fragment>
      <Modal
        isOpen={isOpen}
        onRequestClose={handleAttemptClose}
        contentLabel="Invoice Preview"
        closeTimeoutMS={300}
        className={{
          base: styles.modalContent,
          afterOpen: styles.modalContentAfterOpen,
          beforeClose: styles.modalContentBeforeClose,
        }}
        overlayClassName={{
          base: styles.modalOverlay,
          afterOpen: styles.modalOverlayAfterOpen,
          beforeClose: styles.modalOverlayBeforeClose,
        }}
      >
        <InvoiceModalHeader onClose={handleAttemptClose} />

        <InvoiceFileActions
          fileName={currentFileName}
          allowSave={allowSave}
          onSave={handleSaveClick}
          onSavePdf={handleSavePdf}
          onPreviewPdf={handlePreviewPdf}
        />

        <div className={styles.modalBody}>
          {items.length === 0 ? (
            <div className={styles.emptyPlaceholder}>No budget line items available</div>
          ) : (
            <Fragment>
              <InvoiceNavControls
                currentPage={currentPage}
                totalPages={pages.length}
                onPrev={() => setCurrentPage((p) => Math.max(0, p - 1))}
                onNext={() =>
                  setCurrentPage((p) => Math.min(p + 1, Math.max(0, pages.length - 1)))
                }
              />

              <div
                className={styles.contentRow}
                style={showSidebar ? undefined : { minWidth: "850px" }}
              >
                {showSidebar && (
                  <InvoiceSidebar
                    groupFields={groupFields}
                    groupField={groupField}
                    onGroupFieldChange={handleGroupFieldChange}
                    groupOptions={groupOptions}
                    groupValues={groupValues}
                    onToggleGroupValue={handleToggleGroupValue}
                    onToggleAllGroupValues={handleToggleAllGroupValues}
                    pages={pages}
                    selectedPages={selectedPages}
                    onTogglePage={handleTogglePage}
                    onToggleAllPages={handleToggleAllPages}
                    savedInvoices={savedInvoices}
                    selectedInvoices={selectedInvoices}
                    onToggleInvoice={toggleInvoiceSelect}
                    onSelectAllInvoices={selectAllInvoices}
                    onLoadInvoice={loadInvoice}
                    onDeleteInvoice={handleDeleteInvoice}
                    onDeleteSelected={handleDeleteSelectedInvoices}
                    isDirty={isDirty}
                    onSaveHeader={handleSaveHeader}
                    showSaved={showSaved}
                  />
                )}

                <InvoicePreviewContent
                  invoiceRef={invoiceRef}
                  previewRef={previewRef}
                  fileInputRef={fileInputRef}
                  logoDataUrl={logoDataUrl}
                  brandLogoKey={brandLogoKey}
                  onLogoSelect={handleLogoSelect}
                  onLogoDrop={handleLogoDrop}
                  brandName={brandName}
                  onBrandNameChange={handleBrandNameChange}
                  brandTagline={brandTagline}
                  onBrandTaglineChange={handleBrandTaglineChange}
                  brandAddress={brandAddress}
                  onBrandAddressChange={handleBrandAddressChange}
                  brandPhone={brandPhone}
                  onBrandPhoneChange={handleBrandPhoneChange}
                  useProjectAddress={useProjectAddress}
                  onToggleProjectAddress={handleToggleProjectAddress}
                  project={project}
                  invoiceNumber={invoiceNumber}
                  onInvoiceNumberChange={handleInvoiceNumberChange}
                  issueDate={issueDate}
                  onIssueDateChange={handleIssueDateChange}
                  dueDate={dueDate}
                  onDueDateChange={handleDueDateChange}
                  serviceDate={serviceDate}
                  onServiceDateChange={handleServiceDateChange}
                  projectTitle={projectTitle}
                  onProjectTitleChange={handleProjectTitleChange}
                  customerSummary={customerSummary}
                  onCustomerSummaryChange={handleCustomerSummaryChange}
                  invoiceSummary={invoiceSummary}
                  onInvoiceSummaryChange={handleInvoiceSummaryChange}
                  paymentSummary={paymentSummary}
                  onPaymentSummaryChange={handlePaymentSummaryChange}
                  rowsData={rowsData}
                  currentPage={currentPage}
                  totalPages={pages.length}
                  subtotal={subtotal}
                  depositReceived={depositReceived}
                  onDepositChange={handleDepositChange}
                  totalDue={totalDue}
                  onTotalDueChange={handleTotalDueChange}
                  notes={notes}
                  onNotesChange={handleNotesChange}
                  livePdfUrl={livePdfUrl}
                  pdfPreviewUrl={overlayPdfUrl}
                  onClosePdfPreview={closePdfPreview}
                />
              </div>
            </Fragment>
          )}
        </div>
      </Modal>

      {showUnsavedPrompt &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={styles.unsavedOverlay}
            role="dialog"
            aria-modal="true"
            aria-label="Unsaved invoice changes"
          >
            <div className={styles.unsavedDialog}>
              <p>This invoice has unsaved changes. Leave Anyway?</p>
              <div className={styles.unsavedActions}>
                <button
                  type="button"
                  className={styles.unsavedButton}
                  onClick={handleStayOpen}
                >
                  Stay
                </button>
                <button
                  type="button"
                  className={`${styles.unsavedButton} ${styles.unsavedButtonPrimary}`}
                  onClick={handleConfirmLeave}
                >
                  Leave Anyway
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      <ConfirmModal
        isOpen={isConfirmingDelete}
        onRequestClose={() => setIsConfirmingDelete(false)}
        onConfirm={performDeleteInvoices}
        message="Delete selected invoices?"
        className={{
          base: styles.confirmModalContent,
          afterOpen: styles.confirmModalContentAfterOpen,
          beforeClose: styles.confirmModalContentBeforeClose,
        }}
        overlayClassName={{
          base: styles.modalOverlay,
          afterOpen: styles.modalOverlayAfterOpen,
          beforeClose: styles.modalOverlayBeforeClose,
        }}
      />
    </Fragment>
  );
};

export default InvoicePreviewModal;
