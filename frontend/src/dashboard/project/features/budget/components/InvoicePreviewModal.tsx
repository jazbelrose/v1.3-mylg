import React, {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { pdf as createPdf } from "@react-pdf/renderer";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import pdfWorkerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
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

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

const groupFields: Array<{ label: string; value: GroupField }> = [
  { label: "Invoice Group", value: "invoiceGroup" },
  { label: "Area Group", value: "areaGroup" },
  { label: "Category", value: "category" },
];

const DEFAULT_NOTES_HTML = "<p>Notes...</p>";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

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

  const pdfPreviewUrlRef = useRef<string | null>(null);

  const [currentPage, setCurrentPage] = useState(0);
  const [pdfPageCount, setPdfPageCount] = useState(1);
  const [isPdfRendering, setIsPdfRendering] = useState(false);

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
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

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
      const items = (res.items || []).filter((item) => item.key && !String(item.key).endsWith("/"));

      const pdfEntries = new Map<
        string,
        { name: string; key: string; url: string; metadataKey: string | null; metadataUrl: string | null }
      >();
      const metadataMap = new Map<string, { key: string; url: string }>();
      const htmlInvoices: SavedInvoice[] = [];

      items.forEach((item) => {
        const rawKey = String(item.key);
        const fileName = rawKey.split("/").pop() || "";
        const storageKey = rawKey.startsWith("public/") ? rawKey : `public/${rawKey}`;
        const fileUrl = getFileUrl(storageKey);

        if (fileName.toLowerCase().endsWith(".json")) {
          const base = fileName.slice(0, -5);
          metadataMap.set(base, { key: storageKey, url: fileUrl });
          return;
        }

        if (fileName.toLowerCase().endsWith(".pdf")) {
          const base = fileName.slice(0, -4);
          pdfEntries.set(base, {
            name: fileName,
            key: storageKey,
            url: fileUrl,
            metadataKey: null,
            metadataUrl: null,
          });
          return;
        }

        if (fileName.toLowerCase().endsWith(".html")) {
          htmlInvoices.push({
            name: fileName,
            url: fileUrl,
            key: storageKey,
            type: "html",
            metadataKey: null,
            metadataUrl: null,
          });
        }
      });

      metadataMap.forEach((meta, base) => {
        const entry = pdfEntries.get(base);
        if (entry) {
          entry.metadataKey = meta.key;
          entry.metadataUrl = meta.url;
        }
      });

      const pdfInvoices: SavedInvoice[] = Array.from(pdfEntries.values()).map((entry) => ({
        name: entry.name,
        url: entry.url,
        key: entry.key,
        type: "pdf",
        metadataKey: entry.metadataKey,
        metadataUrl: entry.metadataUrl,
      }));

      const combined = [...pdfInvoices, ...htmlInvoices];
      combined.sort((a, b) => a.name.localeCompare(b.name));
      return combined;
    } catch (err) {
      console.error("Failed to list invoice files", err);
      return [];
    }
  }, [project?.projectId]);

  const toggleInvoiceSelect = (invoice: SavedInvoice) => {
    const key = invoice.key;
    setSelectedInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllInvoices = (checked: boolean) => {
    if (checked) {
      setSelectedInvoices(new Set(savedInvoices.map((i) => i.key)));
    } else {
      setSelectedInvoices(new Set());
    }
  };

  const handleDeleteInvoice = (invoice: SavedInvoice) => {
    setSelectedInvoices(new Set([invoice.key]));
    setIsConfirmingDelete(true);
  };

  const handleDeleteSelectedInvoices = () => {
    if (selectedInvoices.size > 0) {
      setIsConfirmingDelete(true);
    }
  };

  const performDeleteInvoices = async () => {
    if (selectedInvoices.size === 0 || !project?.projectId) return;
    const keysToDelete = new Set<string>();
    selectedInvoices.forEach((key) => {
      keysToDelete.add(key);
      const match = savedInvoices.find((inv) => inv.key === key);
      if (match?.metadataKey) {
        keysToDelete.add(match.metadataKey);
      }
    });
    const fileKeys = Array.from(keysToDelete);
    if (!fileKeys.length) return;
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
      setSavedInvoices((prev) => prev.filter((inv) => !keysToDelete.has(inv.key)));
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

  const loadInvoice = async (invoice: SavedInvoice) => {
    try {
      if (invoice.type === "pdf") {
        if (!invoice.metadataUrl) {
          toast.error("Saved invoice metadata is missing");
          return;
        }
        const res = await fetch(invoice.metadataUrl);
        if (!res.ok) throw new Error("Failed to fetch metadata");
        const metadata = (await res.json()) as {
          version?: number;
          brandLogoKey?: string;
          brandName?: string;
          brandAddress?: string;
          brandPhone?: string;
          brandTagline?: string;
          useProjectAddress?: boolean;
          invoiceNumber?: string;
          issueDate?: string;
          dueDate?: string;
          serviceDate?: string;
          projectTitle?: string;
          customerSummary?: string;
          invoiceSummary?: string;
          paymentSummary?: string;
          depositReceived?: number;
          totalDue?: number;
          notes?: string;
          groupField?: GroupField;
          groupValues?: string[];
        };

        setBrandLogoKey(metadata.brandLogoKey || "");
        setLogoDataUrl(null);
        setBrandName(metadata.brandName || "");
        setBrandAddress(metadata.brandAddress || "");
        setBrandPhone(metadata.brandPhone || "");
        setBrandTagline(metadata.brandTagline || "");
        setUseProjectAddress(Boolean(metadata.useProjectAddress));

        setInvoiceNumber(metadata.invoiceNumber || "");
        setIssueDate(metadata.issueDate || "");
        setDueDate(metadata.dueDate || "");
        setServiceDate(metadata.serviceDate || "");

        setProjectTitle(metadata.projectTitle || "");
        setCustomerSummary(metadata.customerSummary || "");
        setInvoiceSummary(metadata.invoiceSummary || "");
        setPaymentSummary(metadata.paymentSummary || "");

        setDepositReceived(Number(metadata.depositReceived) || 0);
        setTotalDue(Number(metadata.totalDue) || 0);
        setNotes(metadata.notes || DEFAULT_NOTES_HTML);

        if (metadata.groupField) setGroupField(metadata.groupField);
        if (Array.isArray(metadata.groupValues)) setGroupValues(metadata.groupValues);
      } else {
        const res = await fetch(invoice.url);
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
        setUseProjectAddress(false);

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
      }

      setInvoiceDirty(false);
      setIsDirty(false);
      setShowSaved(false);
      setCurrentFileName(invoice.name);
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
  }, [items, groupField, groupValues]);

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

  const closePdfPreview = useCallback(() => {
    if (pdfPreviewUrlRef.current) {
      URL.revokeObjectURL(pdfPreviewUrlRef.current);
      pdfPreviewUrlRef.current = null;
    }
    setPdfPreviewUrl(null);
  }, []);

  const countPdfPages = useCallback(async (blob: Blob): Promise<number> => {
    try {
      const task = pdfjsLib.getDocument({ data: await blob.arrayBuffer() });
      const pdf = await task.promise;
      const total = pdf?.numPages || 1;
      await task.destroy();
      return Math.max(total || 1, 1);
    } catch (err) {
      console.error('Failed to count invoice PDF pages', err);
      return 1;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setShowUnsavedPrompt(false);
      closePdfPreview();
      setPdfPageCount(1);
      setCurrentPage(0);
      return;
    }

    let cancelled = false;
    setIsPdfRendering(true);

    (async () => {
      const blob = await renderPdfBlob();
      if (!blob || cancelled) {
        setIsPdfRendering(false);
        return;
      }

      closePdfPreview();
      const objectUrl = URL.createObjectURL(blob);
      pdfPreviewUrlRef.current = objectUrl;
      setPdfPreviewUrl(objectUrl);

      const totalPages = await countPdfPages(blob);
      if (!cancelled) {
        setPdfPageCount(totalPages);
        setCurrentPage((prev) => Math.min(prev, Math.max(totalPages - 1, 0)));
        setIsPdfRendering(false);
      }
    })().catch((err) => {
      console.error('Failed to render invoice preview', err);
      if (!cancelled) {
        setIsPdfRendering(false);
        setPdfPageCount(1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, renderPdfBlob, closePdfPreview, countPdfPages]);

  useEffect(() => () => closePdfPreview(), [closePdfPreview]);

  const handleSavePdf = useCallback(async () => {
    const blob = await renderPdfBlob();
    if (!blob) return;
    const file =
      revision?.revision != null
        ? `invoice-revision-${revision.revision}.pdf`
        : 'invoice.pdf';
    saveAs(blob, file);
  }, [renderPdfBlob, revision]);

  const handlePreviewPdf = useCallback(async () => {
    const blob = await renderPdfBlob();
    if (!blob) return;
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 30_000);
  }, [renderPdfBlob]);

  const saveInvoice = async () => {
    const blob = await renderPdfBlob();
    if (!blob || !project?.projectId) return;

    const metadata = {
      version: 1,
      brandLogoKey,
      brandName,
      brandAddress,
      brandPhone,
      brandTagline,
      useProjectAddress,
      invoiceNumber,
      issueDate,
      dueDate,
      serviceDate,
      projectTitle,
      customerSummary,
      invoiceSummary,
      paymentSummary,
      depositReceived,
      totalDue,
      notes,
      groupField,
      groupValues: Array.from(groupValues),
    };

    const metadataBlob = new Blob([JSON.stringify(metadata)], {
      type: "application/json",
    });

    const unique = uuid().slice(0, 8);
    const date = new Date().toISOString().split("T")[0];
    const projectSlug = slugify(project.title || "project");
    const rev = revision?.revision ?? "0";
    const baseName = `${projectSlug}-${rev}-${date}-${unique}`;
    const fileName = `${baseName}.pdf`;
    const metadataFileName = `${baseName}.json`;
    const pdfKey = `projects/${project.projectId}/invoices/${fileName}`;
    const metadataKey = `projects/${project.projectId}/invoices/${metadataFileName}`;

    try {
      const uploadPdf = uploadData({
        key: pdfKey,
        data: blob,
        options: {
          accessLevel: "guest",
          metadata: { friendlyName: fileName },
        },
      });
      const uploadMetadata = uploadData({
        key: metadataKey,
        data: metadataBlob,
        options: { accessLevel: "guest" },
      });

      await Promise.all([uploadPdf.result, uploadMetadata.result]);

      const pdfStorageKey = pdfKey.startsWith("public/") ? pdfKey : `public/${pdfKey}`;
      const metadataStorageKey = metadataKey.startsWith("public/") ? metadataKey : `public/${metadataKey}`;
      const url = getFileUrl(pdfStorageKey);
      const metadataUrl = getFileUrl(metadataStorageKey);

      setSavedInvoices((prev) => {
        const filtered = prev.filter((inv) => inv.key !== pdfStorageKey);
        return [...filtered, {
          name: fileName,
          url,
          key: pdfStorageKey,
          type: "pdf",
          metadataKey: metadataStorageKey,
          metadataUrl,
        }].sort((a, b) => a.name.localeCompare(b.name));
      });
      setInvoiceDirty(false);
      setCurrentFileName(fileName);
    } catch (err) {
      console.error("Failed to save invoice", err);
      toast.error("Failed to save invoice PDF");
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
    setInvoiceDirty(true);
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
                    savedInvoices={savedInvoices}
                    selectedInvoiceKeys={selectedInvoices}
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
                  pdfUrl={pdfPreviewUrl}
                  isPdfLoading={isPdfRendering}
                  currentPage={currentPage}
                  totalPages={pdfPageCount}
                  onPrevPage={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  onNextPage={() =>
                    setCurrentPage((p) =>
                      pdfPageCount > 0 ? Math.min(p + 1, Math.max(0, pdfPageCount - 1)) : 0
                    )
                  }
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
                  projectAddress={project?.address || null}
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
                  subtotal={subtotal}
                  depositReceived={depositReceived}
                  onDepositChange={handleDepositChange}
                  totalDue={totalDue}
                  onTotalDueChange={handleTotalDueChange}
                  notes={notes}
                  onNotesChange={handleNotesChange}
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
