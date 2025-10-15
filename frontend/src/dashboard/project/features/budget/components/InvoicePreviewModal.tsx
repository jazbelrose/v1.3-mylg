import React, {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import Modal from "@/shared/ui/ModalWithStack";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faChevronRight,
  faDownload,
  faSave,
  faTrash,
  faXmark,
  faFilePdf,
} from "@fortawesome/free-solid-svg-icons";
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
import styles from "./invoice-preview-modal.module.css";
import useModalStack from "@/shared/utils/useModalStack";
import { useBudget } from "@/dashboard/project/features/budget/context/BudgetContext";
import { UserLite } from "@/app/contexts/DataProvider";

// ---------- Types ----------
interface RevisionLike {
  revision?: number;
  [k: string]: unknown;
}

interface ProjectLike {
  projectId?: string;
  title?: string;
  company?: string;
  clientName?: string;
  clientAddress?: string;
  clientPhone?: string;
  clientEmail?: string;
  invoiceBrandName?: string;
  invoiceBrandAddress?: string;
  invoiceBrandPhone?: string;
  address?: string;
  [k: string]: unknown;
}

interface InvoicePreviewModalProps {
  isOpen: boolean;
  onRequestClose: () => void;
  revision: RevisionLike;
  project?: ProjectLike | null;
  showSidebar?: boolean;
  allowSave?: boolean;
}

type GroupField = "invoiceGroup" | "areaGroup" | "category";

interface BudgetItem {
  budgetItemId?: string;
  description?: string;
  quantity?: number | string;
  unit?: string;
  itemFinalCost?: number | string;
  invoiceGroup?: string;
  areaGroup?: string;
  category?: string;
  [k: string]: unknown;
}

type RowData =
  | { type: "group"; group: string }
  | { type: "item"; item: BudgetItem };

interface SavedInvoice {
  name: string;
  url: string;
}

// ---------- Utils ----------
const formatCurrency = (val: number | string | null | undefined): string => {
  const num =
    typeof val === "number"
      ? val
      : parseFloat(String(val ?? "").replace(/[$,]/g, ""));
  if (Number.isNaN(num)) return (val as string) || "";
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

const groupFields: Array<{ label: string; value: GroupField }> = [
  { label: "Invoice Group", value: "invoiceGroup" },
  { label: "Area Group", value: "areaGroup" },
  { label: "Category", value: "category" },
];

const DEFAULT_NOTES_HTML = "<p>Notes...</p>";

// ---------- Component ----------
const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  isOpen,
  onRequestClose,
  revision,
  project,
  showSidebar = true,
  allowSave = true,
}) => {
  // data
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [groupField, setGroupField] = useState<GroupField>("invoiceGroup");
  const [groupValues, setGroupValues] = useState<string[]>([]);
  const { userData, setUserData } = useData();
  const { budgetItems } = useBudget();

  // layout/refs
  const invoiceRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  // pagination
  const [currentPage, setCurrentPage] = useState(0);
  const [pages, setPages] = useState<RowData[][]>([]);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const currentRows = pages[currentPage] || [];

  // branding/header
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [brandName, setBrandName] = useState("");
  const [brandAddress, setBrandAddress] = useState("");
  const [brandPhone, setBrandPhone] = useState("");
  const [brandTagline, setBrandTagline] = useState("");
  const [brandLogoKey, setBrandLogoKey] = useState("");
  const [useProjectAddress, setUseProjectAddress] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // invoice meta
  const [invoiceDirty, setInvoiceDirty] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("0000");
  const [issueDate, setIssueDate] = useState<string>(
    () => new Date().toLocaleDateString()
  );
  const [dueDate, setDueDate] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [projectTitle, setProjectTitle] = useState(
    project?.title || "Project Title"
  );
  const [customerSummary, setCustomerSummary] = useState("Customer");
  const [invoiceSummary, setInvoiceSummary] = useState("Invoice Details");
  const [paymentSummary, setPaymentSummary] = useState("Payment");
  const [notes, setNotes] = useState(DEFAULT_NOTES_HTML);
  const [depositReceived, setDepositReceived] = useState<number>(0);
  const [totalDue, setTotalDue] = useState<number>(0);

  // saved invoices
  const [savedInvoices, setSavedInvoices] = useState<SavedInvoice[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(
    () => new Set()
  );
  const [currentFileName, setCurrentFileName] = useState<string>("");

  // delete confirm
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);

  // logo file input
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // modal stack (keep focus/scroll behavior)
  useModalStack(isOpen);

  // ---------- Handlers ----------
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

  const fetchInvoiceFiles = useCallback(async (): Promise<SavedInvoice[]> => {
    if (!project?.projectId) return [];
    const prefix = `projects/${project.projectId}/invoices/`;
    try {
      const res = await list({ prefix, options: { accessLevel: "guest" } });
      return (res.items || [])
        .filter((item) => item.key && !String(item.key).endsWith("/"))
        .map((item) => {
          const rawKey = String(item.key);
          const storageKey = rawKey.startsWith("public/")
            ? rawKey
            : `public/${rawKey}`;
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

      setBrandLogoKey(
        q(".invoice-header img")?.getAttribute("src") || ""
      );
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

      // Try to infer grouping field from headers
      const parsedGroups = Array.from(
        doc.querySelectorAll(".group-header td")
      ).map((td) => (td.textContent || "").trim());
      if (parsedGroups.length) {
        const candidate = (groupFields.map((g) => g.value) as GroupField[]).find(
          (field) => {
            const opts = Array.from(
              new Set(
                items
                  .map((it) => (String((it as BudgetItem)[field] || "")).trim())
                  .filter(Boolean)
              )
            );
            return parsedGroups.every((g) => opts.includes(g));
          }
        );
        if (candidate) setGroupField(candidate);
        setGroupValues(parsedGroups);
      }

      setInvoiceDirty(false);
      setCurrentFileName(url.split("/").pop() || "");
    } catch (err) {
      console.error("Failed to load invoice", err);
    }
  };

  // ---------- Effects ----------
  // Initialize branding each time the modal opens
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

  // Reset invoice fields on open / project change
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

  // Is header dirty vs saved branding?
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

  // Load items
  useEffect(() => {
    if (!isOpen) return;
    const arr = Array.isArray(budgetItems) ? (budgetItems as BudgetItem[]) : [];
    setItems(arr);
    if (arr.length && !arr.some((i) => i.invoiceGroup)) {
      setGroupField("category");
      setGroupValues([]);
    }
  }, [isOpen, budgetItems]);

  // Load saved invoices
  useEffect(() => {
    if (!isOpen || !project?.projectId) return;
    fetchInvoiceFiles()
      .then((files) => setSavedInvoices(Array.isArray(files) ? files : []))
      .catch((err) => console.error("Failed to fetch invoices", err));
  }, [isOpen, project?.projectId, fetchInvoiceFiles]);

  // Maintain selected group values present in items
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
  }, [items, groupField]); // eslint-disable-line react-hooks/exhaustive-deps

  const groupOptions = Array.from(
    new Set(
      items
        .map((it) => String((it as BudgetItem)[groupField] || "").trim())
        .filter(Boolean)
    )
  );

  const filtered = groupValues.length === 0
    ? items
    : items.filter((it) => groupValues.includes(String((it as BudgetItem)[groupField]).trim()));

  const subtotal = filtered.reduce((sum, it) => {
    const amt = parseFloat(String(it.itemFinalCost ?? 0)) || 0;
    return sum + amt;
  }, 0);

  // total due ties to subtotal and deposit
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

  // Calculate page splits by measuring a hidden full page
  useLayoutEffect(() => {
    if (!invoiceRef.current) return;
    const pageHeight = 1122; // ~A4 at 96dpi
    const top = invoiceRef.current.querySelector(".invoice-top") as HTMLElement | null;
    const thead = invoiceRef.current.querySelector(".items-table thead") as HTMLElement | null;
    const totals = invoiceRef.current.querySelector(".totals") as HTMLElement | null;
    const notes = invoiceRef.current.querySelector(".notes") as HTMLElement | null;
    const footer = invoiceRef.current.querySelector(".footer") as HTMLElement | null;

    const topHeight = (top?.offsetHeight || 0) + (thead?.offsetHeight || 0);
    const bottomHeight =
      (totals?.offsetHeight || 0) +
      (notes?.offsetHeight || 0) +
      (footer?.offsetHeight || 0);

    const rowEls = Array.from(
      invoiceRef.current.querySelectorAll(".items-table tbody tr")
    ) as HTMLElement[];

    let available = pageHeight - topHeight;
    const pagesAccum: RowData[][] = [];
    let current: RowData[] = [];

    rowEls.forEach((row, idx) => {
      const rowHeight = row.offsetHeight;
      const isLast = idx === rowEls.length - 1;
      const needed = rowHeight + (isLast ? bottomHeight : 0);
      if (needed > available && current.length) {
        pagesAccum.push(current);
        current = [];
        available = pageHeight - topHeight;
      }
      current.push(rowsData[idx]);
      available -= rowHeight;
    });

    if (current.length) pagesAccum.push(current);

    const same =
      pages.length === pagesAccum.length &&
      pages.every((p, i) => p.length === pagesAccum[i].length);

    if (!same) setPages(pagesAccum);
  }, [rowsData]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelectedPages(pages.map((_, i) => i));
    setCurrentPage(0);
  }, [pages]);

  useEffect(() => {
    if (!isOpen) {
      setShowUnsavedPrompt(false);
    }
  }, [isOpen]);

  // ---------- Build / Export / Save ----------
  const buildInvoiceHtml = (): string => {
    if (!previewRef.current) return "";
    const style = (document.getElementById("invoice-preview-styles")?.innerHTML || "");
    const pageIndexes =
      selectedPages.length > 0 ? selectedPages : pages.map((_, i) => i);

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
        const headerAddress = useProjectAddress
          ? project?.address || "Address"
          : brandAddress || "Address";
        const headerPhone = brandPhone || "Phone";
        const headerTag = brandTagline || "";
        const logoSrc = logoDataUrl || (brandLogoKey ? getFileUrl(brandLogoKey) : "");

        const invNum = invoiceNumber || "";
        const issue = issueDate || "";
        const due = dueDate || "";
        const service = serviceDate || "";

        const billContact = project?.clientName || "Client Name";
        const billCompany = project?.invoiceBrandName || "Client Company";
        const billAddress =
          project?.invoiceBrandAddress || project?.clientAddress || "Client Address";
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
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>${style}</style></head><body>${htmlPages}</body></html>`;
    return html;
  };

  const exportHtml = () => {
    const html = buildInvoiceHtml();
    if (!html) return;
    const file =
      revision?.revision != null
        ? `invoice-revision-${revision.revision}.html`
        : "invoice.html";
    const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
    saveAs(blob, file);
  };

  const exportPdf = () => {
    const html = buildInvoiceHtml();
    if (!html) return;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const frameDoc = iframe.contentWindow?.document;
    if (!frameDoc) {
      document.body.removeChild(iframe);
      return;
    }

    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 0);
    };
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

      // If a new data URL logo is present, upload it to public S3
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

  // ---------- Render ----------
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
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Invoice Preview</div>
          <button className={styles.iconButton} onClick={handleAttemptClose} aria-label="Close">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className={styles.currentFileRow}>
          <div className={styles.fileName}>{currentFileName || "Unsaved Invoice"}</div>
          <div className={styles.buttonGroup}>
            {allowSave && (
              <button
                className={styles.iconButton}
                onClick={handleSaveClick}
                aria-label="Save invoice"
              >
                <FontAwesomeIcon icon={faSave} />
              </button>
            )}
            <button
              className={styles.iconButton}
              onClick={exportPdf}
              aria-label="Download PDF"
            >
              <FontAwesomeIcon icon={faFilePdf} />
            </button>
            <button
              className={styles.iconButton}
              onClick={exportHtml}
              aria-label="Download HTML"
            >
              <FontAwesomeIcon icon={faDownload} />
            </button>
          </div>
        </div>

        <div className={styles.modalBody}>
          {items.length === 0 ? (
            <div className={styles.emptyPlaceholder}>No budget line items available</div>
          ) : (
            <Fragment>
              <div className={styles.navControls}>
                <button
                  className={styles.navButton}
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  aria-label="Previous Page"
                >
                  <FontAwesomeIcon icon={faChevronLeft} />
                </button>
                <span>
                  Page {currentPage + 1} of {pages.length || 1}
                </span>
                <button
                  className={styles.navButton}
                  onClick={() =>
                    setCurrentPage((p) => Math.min(p + 1, Math.max(0, pages.length - 1)))
                  }
                  disabled={currentPage >= Math.max(0, pages.length - 1)}
                  aria-label="Next Page"
                >
                  <FontAwesomeIcon icon={faChevronRight} />
                </button>
              </div>

              <div
                className={styles.contentRow}
                style={showSidebar ? undefined : { minWidth: "850px" }}
              >
                {showSidebar && (
                  <div className={styles.sidebar}>
                    {/* Grouping */}
                    <label htmlFor="group-field-select">Group By:&nbsp;</label>
                    <select
                      id="group-field-select"
                      value={groupField}
                      onChange={(e) => {
                        setGroupField(e.target.value as GroupField);
                        setGroupValues([]);
                      }}
                    >
                      {groupFields.map((g) => (
                        <option key={g.value} value={g.value}>
                          {g.label}
                        </option>
                      ))}
                    </select>

                    <div className={styles.groupSelect} role="group" aria-label="Groups">
                      <label className={styles.groupItem}>
                        <input
                          type="checkbox"
                          checked={groupValues.length === groupOptions.length}
                          onChange={(e) =>
                            setGroupValues(e.target.checked ? groupOptions : [])
                          }
                        />
                        Select All
                      </label>
                      {groupOptions.map((val) => (
                        <label key={val} className={styles.groupItem}>
                          <input
                            type="checkbox"
                            checked={groupValues.includes(val)}
                            onChange={() =>
                              setGroupValues((prev) =>
                                prev.includes(val)
                                  ? prev.filter((v) => v !== val)
                                  : [...prev, val]
                              )
                            }
                          />
                          {val}
                        </label>
                      ))}
                    </div>

                    {/* Page selection */}
                    <div className={styles.pageSelect} role="group" aria-label="Pages">
                      <label className={styles.groupItem}>
                        <input
                          type="checkbox"
                          checked={selectedPages.length === pages.length}
                          onChange={(e) =>
                            setSelectedPages(
                              e.target.checked ? pages.map((_, i) => i) : []
                            )
                          }
                        />
                        Select All Pages
                      </label>
                      {pages.map((_, idx) => (
                        <label key={idx} className={styles.groupItem}>
                          <input
                            type="checkbox"
                            checked={selectedPages.includes(idx)}
                            onChange={() =>
                              setSelectedPages((prev) =>
                                prev.includes(idx)
                                  ? prev.filter((p) => p !== idx)
                                  : [...prev, idx]
                              )
                            }
                          />
                          Page {idx + 1}
                        </label>
                      ))}
                    </div>

                    {/* Saved invoices */}
                    {savedInvoices.length > 0 && (
                      <div className={styles.invoiceList}>
                        <div className={styles.listHeader}>Saved Invoices</div>
                        <label className={styles.groupItem}>
                          <input
                            type="checkbox"
                            checked={selectedInvoices.size === savedInvoices.length}
                            onChange={(e) => selectAllInvoices(e.target.checked)}
                          />
                          Select All
                        </label>
                        {savedInvoices.map((inv, idx) => (
                          <div key={idx} className={styles.invoiceRow}>
                            <input
                              type="checkbox"
                              checked={selectedInvoices.has(inv.url)}
                              onChange={() => toggleInvoiceSelect(inv.url)}
                            />
                            <button
                              type="button"
                              className={styles.linkButton}
                              onClick={() => loadInvoice(inv.url)}
                              title="Load invoice"
                            >
                              {inv.name}
                            </button>
                            <button
                              className={styles.iconButton}
                              onClick={() => {
                                setSelectedInvoices(new Set([inv.url]));
                                setIsConfirmingDelete(true);
                              }}
                              aria-label="Delete invoice"
                              title="Delete"
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </button>
                          </div>
                        ))}
                        {selectedInvoices.size > 0 && (
                          <button
                            className={styles.iconButton}
                            onClick={() => setIsConfirmingDelete(true)}
                            aria-label="Delete selected invoices"
                          >
                            <FontAwesomeIcon icon={faTrash} /> Delete Selected
                          </button>
                        )}
                      </div>
                    )}

                    {/* Save default header */}
                    {isDirty && (
                      <button className={styles.saveButton} onClick={handleSaveHeader}>
                        Save as my default invoice header
                      </button>
                    )}
                    {showSaved && (
                      <div className={styles.savedMsg} role="status">
                        Header info saved! Future invoices will use this by default.
                      </div>
                    )}
                  </div>
                )}

                {/* Preview */}
                <div className={styles.previewWrapper} ref={previewRef}>
                  {/* Styles used for export */}
                  <style id="invoice-preview-styles">{`
                    @page { margin: 0; }
                    body { margin: 0; }
                    .invoice-container{background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;width:min(100%,210mm);max-width:210mm;box-sizing:border-box;margin:0 auto;padding:20px;overflow-x:hidden;}
                    .invoice-page{width:min(100%,210mm);max-width:210mm;min-height:297mm;box-shadow:0 2px 6px rgba(0,0,0,0.15);margin:0 auto 20px;padding:20px;box-sizing:border-box;position:relative;overflow-x:hidden;display:flex;flex-direction:column;}
                    .invoice-header{display:flex;align-items:flex-start;gap:20px;}
                    .logo-upload{width:100px;height:100px;border:1px dashed #ccc;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;}
                    .logo-upload img{max-width:100%;max-height:100%;}
                    .company-block{flex:1;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;}
                    .company-info{display:flex;flex-direction:column;margin-top:10px;}
                    .brand-name{font-size:1.2rem;font-weight:bold;}
                    .brand-tagline,.brand-address,.brand-phone{font-size:0.7rem;}
                    .invoice-meta{text-align:right;font-size:0.85rem;}
                    .billing-info{margin-top:20px;display:flex;justify-content:space-between;gap:20px;font-size:0.85rem;}
                    .invoice-title{font-size:2rem;color:#FA3356;font-weight:bold;text-align:right;margin-left:auto;}
                    .project-title{font-size:1.5rem;font-weight:bold;text-align:center;margin:10px 0;}
                    .summary{display:flex;justify-content:space-between;gap:10px;margin-bottom:10px;}
                    .summary>div{flex:1;}
                    .summary-divider{border:0;border-top:1px solid #ccc;margin-bottom:10px;}
                    .items-table-wrapper{flex:1 0 auto;}
                    .items-table{width:100%;border-collapse:collapse;margin-top:20px;box-sizing:border-box;}
                    .items-table th,.items-table td{border:1px solid #ddd;padding:8px;}
                    .items-table th{background:#f5f5f5;text-align:left;}
                    .group-header{background:#fafafa;font-weight:bold;}
                    .bottom-block{margin-top:auto;margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;margin-bottom:40px;}
                    .totals{margin-top:20px;margin-left:auto;}
                    .notes{margin-top:20px;}
                    .footer{margin-top:40px;font-size:0.9rem;color:#666;}
                    .pageNumber{position:absolute;bottom:10px;left:0;right:0;text-align:center;font-family:'Roboto',Arial,sans-serif;font-size:0.85rem;color:#666;font-weight:normal;pointer-events:none;user-select:none;}
                    @media screen and (max-width:768px){
                      .invoice-container{padding:16px;width:100%;}
                      .invoice-page{padding:16px;width:100%;min-height:auto;}
                      .invoice-header{flex-direction:column;align-items:flex-start;gap:12px;}
                      .company-block{flex-direction:column;align-items:flex-start;gap:8px;width:100%;}
                      .invoice-meta{text-align:left;width:100%;}
                      .billing-info{flex-direction:column;align-items:flex-start;gap:12px;font-size:0.82rem;}
                      .invoice-title{margin-left:0;text-align:left;font-size:1.6rem;}
                      .summary{flex-direction:column;gap:12px;}
                      .items-table th,.items-table td{padding:6px;font-size:0.85rem;}
                      .bottom-block{margin-bottom:28px;}
                    }
                    @media screen and (max-width:480px){
                      .invoice-page{padding:12px;}
                      .invoice-header{gap:10px;}
                      .brand-name{font-size:1.05rem;}
                      .invoice-title{font-size:1.4rem;}
                      .company-info,.billing-info{font-size:0.78rem;}
                      .summary{gap:10px;}
                      .items-table th,.items-table td{padding:5px;font-size:0.78rem;}
                      .bottom-block{margin-bottom:24px;}
                    }
                    @media print{
                      .invoice-container{width:210mm;max-width:210mm;padding:20px;}
                      .invoice-page{width:210mm;max-width:210mm;height:297mm;min-height:auto;box-shadow:none;margin:0;page-break-after:always;}
                      .invoice-page:last-child{page-break-after:auto;}
                    }
                  `}</style>

                  {/* Hidden full layout (for measuring pagination) */}
                  <div
                    className="invoice-page invoice-container"
                    ref={invoiceRef}
                    data-preview-role="measure"
                    style={{ position: "absolute", visibility: "hidden", pointerEvents: "none" }}
                  >
                    <div className="invoice-top">
                      <header className="invoice-header">
                        <div
                          className="logo-upload"
                          onClick={() => fileInputRef.current?.click()}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={handleLogoDrop}
                          aria-label="Company logo"
                        >
                          {logoDataUrl || brandLogoKey ? (
                            <img src={logoDataUrl || getFileUrl(brandLogoKey || '')} alt="Company logo" />
                          ) : (
                            <span>Upload Logo</span>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            ref={fileInputRef}
                            style={{ display: "none" }}
                            onChange={handleLogoSelect}
                          />
                        </div>

                        <div className="company-block">
                          <div className="company-info">
                            <div
                              className="brand-name"
                              contentEditable
                              suppressContentEditableWarning
                              aria-label="Company Name"
                              onBlur={(e) => {
                                setBrandName(e.currentTarget.textContent || "");
                                setInvoiceDirty(true);
                              }}
                            >
                              {brandName || "Your Business Name"}
                            </div>

                            <div
                              className="brand-tagline"
                              contentEditable
                              suppressContentEditableWarning
                              aria-label="Tagline"
                              onBlur={(e) => {
                                setBrandTagline(e.currentTarget.textContent || "");
                                setInvoiceDirty(true);
                              }}
                            >
                              {brandTagline || "Tagline"}
                            </div>

                            <div
                              className="brand-address"
                              contentEditable
                              suppressContentEditableWarning
                              aria-label="Company Address"
                              onBlur={(e) => {
                                setBrandAddress(e.currentTarget.textContent || "");
                                setInvoiceDirty(true);
                              }}
                            >
                              {useProjectAddress
                                ? project?.address || "Project Address"
                                : brandAddress || "Business Address"}
                            </div>

                            <div
                              className="brand-phone"
                              contentEditable
                              suppressContentEditableWarning
                              aria-label="Company Phone"
                              onBlur={(e) => {
                                setBrandPhone(e.currentTarget.textContent || "");
                                setInvoiceDirty(true);
                              }}
                            >
                              {brandPhone || "Phone Number"}
                            </div>

                            {project?.address && (
                              <label style={{ fontSize: "0.8rem" }}>
                                <input
                                  type="checkbox"
                                  checked={useProjectAddress}
                                  onChange={(e) => setUseProjectAddress(e.target.checked)}
                                />{" "}
                                Use project address
                              </label>
                            )}
                          </div>

                          <div className="invoice-meta">
                            <div>
                              Invoice #:{" "}
                              <span
                                contentEditable
                                suppressContentEditableWarning
                                onBlur={(e) => {
                                  setInvoiceNumber(e.currentTarget.textContent || "");
                                  setInvoiceDirty(true);
                                }}
                              >
                                {invoiceNumber}
                              </span>
                            </div>
                            <div>
                              Issue date:{" "}
                              <span
                                contentEditable
                                suppressContentEditableWarning
                                onBlur={(e) => {
                                  setIssueDate(e.currentTarget.textContent || "");
                                  setInvoiceDirty(true);
                                }}
                              >
                                {issueDate}
                              </span>
                            </div>
                            <div>
                              Due date:{" "}
                              <input
                                type="date"
                                className={styles.metaInput}
                                value={dueDate}
                                onChange={(e) => {
                                  setDueDate(e.target.value);
                                  setInvoiceDirty(true);
                                }}
                              />
                            </div>
                            <div>
                              Service date:{" "}
                              <input
                                type="date"
                                className={styles.metaInput}
                                value={serviceDate}
                                onChange={(e) => {
                                  setServiceDate(e.target.value);
                                  setInvoiceDirty(true);
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </header>
                    </div>

                    <h1
                      className="project-title"
                      contentEditable
                      suppressContentEditableWarning
                      aria-label="Project Title"
                      onBlur={(e) => {
                        setProjectTitle(e.currentTarget.textContent || "");
                        setInvoiceDirty(true);
                      }}
                    >
                      {projectTitle}
                    </h1>

                    <div className="summary">
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        aria-label="Customer Summary"
                        onBlur={(e) => {
                          setCustomerSummary(e.currentTarget.textContent || "");
                          setInvoiceDirty(true);
                        }}
                      >
                        {customerSummary}
                      </div>
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        aria-label="Invoice Details"
                        onBlur={(e) => {
                          setInvoiceSummary(e.currentTarget.textContent || "");
                          setInvoiceDirty(true);
                        }}
                      >
                        {invoiceSummary}
                      </div>
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        aria-label="Payment"
                        onBlur={(e) => {
                          setPaymentSummary(e.currentTarget.textContent || "");
                          setInvoiceDirty(true);
                        }}
                      >
                        {paymentSummary}
                      </div>
                    </div>

                    <hr className="summary-divider" />

                    <div className="items-table-wrapper">
                      <table className="items-table">
                        <thead>
                          <tr>
                            <th>Description</th>
                            <th>QTY</th>
                            <th>Unit</th>
                            <th>Unit Price</th>
                            <th>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rowsData.map((row, idx) =>
                            row.type === "group" ? (
                              <tr className="group-header" key={`g-${idx}`}>
                                <td colSpan={5}>{row.group}</td>
                              </tr>
                            ) : (
                              <tr key={row.item.budgetItemId || `row-${idx}`}>
                                <td>{row.item.description || ""}</td>
                                <td>{row.item.quantity || ""}</td>
                                <td>{row.item.unit || ""}</td>
                                <td>
                                  {formatCurrency(
                                    (parseFloat(String(row.item.itemFinalCost || 0)) || 0) /
                                      (parseFloat(String(row.item.quantity || 1)) || 1)
                                  )}
                                </td>
                                <td>
                                  {formatCurrency(
                                    parseFloat(String(row.item.itemFinalCost || 0)) || 0
                                  )}
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="bottom-block">
                      <div className="totals">
                        <div>
                          Subtotal: <span>{formatCurrency(subtotal)}</span>
                        </div>
                        <div>
                          Deposit received:
                          <span
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={(e) => {
                              setDepositReceived(
                                parseFloat(
                                  (e.currentTarget.textContent || "").replace(/[$,]/g, "")
                                ) || 0
                              );
                              setInvoiceDirty(true);
                            }}
                          >
                            {formatCurrency(depositReceived)}
                          </span>
                        </div>
                        <div>
                          <strong>
                            Total Due:
                            <span
                              contentEditable
                              suppressContentEditableWarning
                              onBlur={(e) => {
                                setTotalDue(
                                  parseFloat(
                                    (e.currentTarget.textContent || "").replace(/[$,]/g, "")
                                  ) || 0
                                );
                                setInvoiceDirty(true);
                              }}
                            >
                              {formatCurrency(totalDue)}
                            </span>
                          </strong>
                        </div>
                      </div>

                      <div
                        className="notes"
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => {
                          setNotes(e.currentTarget.innerHTML || "");
                          setInvoiceDirty(true);
                        }}
                        dangerouslySetInnerHTML={{ __html: notes }}
                      />

                      <div className="footer" contentEditable suppressContentEditableWarning>
                        {project?.company || "Company Name"}
                      </div>
                    </div>
                  </div>

                  {/* Visible paginated preview */}
                  {pages[currentPage] && (
                    <div className={styles.previewViewport}>
                      <div className="invoice-page invoice-container">
                      <div className="invoice-top">
                        <header className="invoice-header">
                          <div
                            className="logo-upload"
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={handleLogoDrop}
                            aria-label="Company logo"
                          >
                            {logoDataUrl || brandLogoKey ? (
                              <img src={logoDataUrl || getFileUrl(brandLogoKey || '')} alt="Company logo" />
                            ) : (
                              <span>Upload Logo</span>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              ref={fileInputRef}
                              style={{ display: "none" }}
                              onChange={handleLogoSelect}
                            />
                          </div>

                          <div className="company-block">
                            <div className="company-info">
                              <div
                                className="brand-name"
                                contentEditable
                                suppressContentEditableWarning
                                aria-label="Company Name"
                                onBlur={(e) => {
                                  setBrandName(e.currentTarget.textContent || "");
                                  setInvoiceDirty(true);
                                }}
                              >
                                {brandName || "Your Business Name"}
                              </div>
                              <div
                                className="brand-tagline"
                                contentEditable
                                suppressContentEditableWarning
                                aria-label="Tagline"
                                onBlur={(e) => {
                                  setBrandTagline(e.currentTarget.textContent || "");
                                  setInvoiceDirty(true);
                                }}
                              >
                                {brandTagline || "Tagline"}
                              </div>
                              <div
                                className="brand-address"
                                contentEditable
                                suppressContentEditableWarning
                                aria-label="Company Address"
                                onBlur={(e) => {
                                  setBrandAddress(e.currentTarget.textContent || "");
                                  setInvoiceDirty(true);
                                }}
                              >
                                {useProjectAddress
                                  ? project?.address || "Project Address"
                                  : brandAddress || "Business Address"}
                              </div>
                              <div
                                className="brand-phone"
                                contentEditable
                                suppressContentEditableWarning
                                aria-label="Company Phone"
                                onBlur={(e) => {
                                  setBrandPhone(e.currentTarget.textContent || "");
                                  setInvoiceDirty(true);
                                }}
                              >
                                {brandPhone || "Phone Number"}
                              </div>
                              {project?.address && (
                                <label style={{ fontSize: "0.8rem" }}>
                                  <input
                                    type="checkbox"
                                    checked={useProjectAddress}
                                    onChange={(e) => setUseProjectAddress(e.target.checked)}
                                  />{" "}
                                  Use project address
                                </label>
                              )}
                            </div>

                            <div className="invoice-meta">
                              <div>
                                Invoice #:{" "}
                                <span
                                  contentEditable
                                  suppressContentEditableWarning
                                  onBlur={(e) => {
                                    setInvoiceNumber(e.currentTarget.textContent || "");
                                    setInvoiceDirty(true);
                                  }}
                                >
                                  {invoiceNumber}
                                </span>
                              </div>
                              <div>
                                Issue date:{" "}
                                <span
                                  contentEditable
                                  suppressContentEditableWarning
                                  onBlur={(e) => {
                                    setIssueDate(e.currentTarget.textContent || "");
                                    setInvoiceDirty(true);
                                  }}
                                >
                                  {issueDate}
                                </span>
                              </div>
                              <div>
                                Due date:{" "}
                                <input
                                  type="date"
                                  className={styles.metaInput}
                                  value={dueDate}
                                  onChange={(e) => {
                                    setDueDate(e.target.value);
                                    setInvoiceDirty(true);
                                  }}
                                />
                              </div>
                              <div>
                                Service date:{" "}
                                <input
                                  type="date"
                                  className={styles.metaInput}
                                  value={serviceDate}
                                  onChange={(e) => {
                                    setServiceDate(e.target.value);
                                    setInvoiceDirty(true);
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </header>
                      </div>

                      <h1
                        className="project-title"
                        contentEditable
                        suppressContentEditableWarning
                        aria-label="Project Title"
                        onBlur={(e) => {
                          setProjectTitle(e.currentTarget.textContent || "");
                          setInvoiceDirty(true);
                        }}
                      >
                        {projectTitle}
                      </h1>

                      <div className="summary">
                        <div
                          contentEditable
                          suppressContentEditableWarning
                          aria-label="Customer Summary"
                          onBlur={(e) => {
                            setCustomerSummary(e.currentTarget.textContent || "");
                            setInvoiceDirty(true);
                          }}
                        >
                          {customerSummary}
                        </div>
                        <div
                          contentEditable
                          suppressContentEditableWarning
                          aria-label="Invoice Details"
                          onBlur={(e) => {
                            setInvoiceSummary(e.currentTarget.textContent || "");
                            setInvoiceDirty(true);
                          }}
                        >
                          {invoiceSummary}
                        </div>
                        <div
                          contentEditable
                          suppressContentEditableWarning
                          aria-label="Payment"
                          onBlur={(e) => {
                            setPaymentSummary(e.currentTarget.textContent || "");
                            setInvoiceDirty(true);
                          }}
                        >
                          {paymentSummary}
                        </div>
                      </div>

                      <hr className="summary-divider" />

                      <div className="items-table-wrapper">
                        <table className="items-table">
                          <thead>
                            <tr>
                              <th>Description</th>
                              <th>QTY</th>
                              <th>Unit</th>
                              <th>Unit Price</th>
                              <th>Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {currentRows.map((row, idx2) =>
                              row.type === "group" ? (
                                <tr
                                  className="group-header"
                                  key={`g-${currentPage}-${idx2}`}
                                >
                                  <td colSpan={5}>{row.group}</td>
                                </tr>
                              ) : (
                                <tr key={row.item.budgetItemId || `r-${currentPage}-${idx2}`}>
                                  <td>{row.item.description || ""}</td>
                                  <td>{row.item.quantity || ""}</td>
                                  <td>{row.item.unit || ""}</td>
                                  <td>
                                    {formatCurrency(
                                      (parseFloat(String(row.item.itemFinalCost || 0)) || 0) /
                                        (parseFloat(String(row.item.quantity || 1)) || 1)
                                    )}
                                  </td>
                                  <td>
                                    {formatCurrency(
                                      parseFloat(String(row.item.itemFinalCost || 0)) || 0
                                    )}
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>

                      {currentPage === Math.max(0, pages.length - 1) && (
                        <div className="bottom-block">
                          <div className="totals">
                            <div>
                              Subtotal: <span>{formatCurrency(subtotal)}</span>
                            </div>
                            <div>
                              Deposit received:
                              <span
                                contentEditable
                                suppressContentEditableWarning
                                onBlur={(e) => {
                                  setDepositReceived(
                                    parseFloat(
                                      (e.currentTarget.textContent || "").replace(/[$,]/g, "")
                                    ) || 0
                                  );
                                  setInvoiceDirty(true);
                                }}
                              >
                                {formatCurrency(depositReceived)}
                              </span>
                            </div>
                            <div>
                              <strong>
                                Total Due:
                                <span
                                  contentEditable
                                  suppressContentEditableWarning
                                  onBlur={(e) => {
                                    setTotalDue(
                                      parseFloat(
                                        (e.currentTarget.textContent || "").replace(/[$,]/g, "")
                                      ) || 0
                                    );
                                    setInvoiceDirty(true);
                                  }}
                                >
                                  {formatCurrency(totalDue)}
                                </span>
                              </strong>
                            </div>
                          </div>

                            <div
                              className="notes"
                              contentEditable
                              suppressContentEditableWarning
                              onBlur={(e) => {
                                setNotes(e.currentTarget.innerHTML || "");
                                setInvoiceDirty(true);
                              }}
                              dangerouslySetInnerHTML={{ __html: notes }}
                            />

                          <div className="footer" contentEditable suppressContentEditableWarning>
                            {project?.company || "Company Name"}
                          </div>
                        </div>
                      )}
                      </div>
                    </div>
                  )}
                </div>
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











