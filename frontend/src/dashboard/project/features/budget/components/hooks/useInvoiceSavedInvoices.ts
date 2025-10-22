import { useCallback, useEffect, useState } from "react";
import { uploadData, list } from "aws-amplify/storage";
import { toast } from "react-toastify";
import { v4 as uuid } from "uuid";

import {
  apiFetch,
  fileUrlsToKeys,
  getFileUrl,
  projectFileDeleteUrl,
} from "@/shared/utils/api";
import { slugify } from "@/shared/utils/slug";

import type {
  BudgetItem,
  GroupField,
  InvoicePreviewModalProps,
  SavedInvoice,
} from "../invoicePreviewTypes";
import { parseInvoiceHtml } from "../utils/invoiceHtmlParser";

type ParsedInvoiceData = NonNullable<ReturnType<typeof parseInvoiceHtml>>;

interface UseInvoiceSavedInvoicesOptions {
  isOpen: boolean;
  project: InvoicePreviewModalProps["project"];
  revision: InvoicePreviewModalProps["revision"];
  items: BudgetItem[];
  availableGroupFields: GroupField[];
  invoiceDirty: boolean;
  setInvoiceDirty: (value: boolean) => void;
  buildInvoiceHtml: () => string | null;
  onInvoiceLoaded: (parsed: ParsedInvoiceData) => void;
  setCurrentFileName: (value: string) => void;
}

interface UseInvoiceSavedInvoicesResult {
  savedInvoices: SavedInvoice[];
  selectedInvoices: Set<string>;
  toggleInvoiceSelect: (url: string) => void;
  selectAllInvoices: (checked: boolean) => void;
  handleDeleteInvoice: (url: string) => void;
  handleDeleteSelectedInvoices: () => void;
  isConfirmingDelete: boolean;
  closeConfirmDelete: () => void;
  performDeleteInvoices: () => Promise<void>;
  loadInvoice: (url: string) => Promise<void>;
  handleSaveClick: () => void;
}

export function useInvoiceSavedInvoices({
  isOpen,
  project,
  revision,
  items,
  availableGroupFields,
  invoiceDirty,
  setInvoiceDirty,
  buildInvoiceHtml,
  onInvoiceLoaded,
  setCurrentFileName,
}: UseInvoiceSavedInvoicesOptions): UseInvoiceSavedInvoicesResult {
  const [savedInvoices, setSavedInvoices] = useState<SavedInvoice[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(() => new Set());
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

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

  useEffect(() => {
    if (!isOpen || !project?.projectId) return;
    fetchInvoiceFiles()
      .then((files) => setSavedInvoices(Array.isArray(files) ? files : []))
      .catch((err) => console.error("Failed to fetch invoices", err));
  }, [isOpen, project?.projectId, fetchInvoiceFiles]);

  const toggleInvoiceSelect = useCallback((url: string) => {
    setSelectedInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }, []);

  const selectAllInvoices = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedInvoices(new Set(savedInvoices.map((i) => i.url)));
      } else {
        setSelectedInvoices(new Set());
      }
    },
    [savedInvoices]
  );

  const handleDeleteInvoice = useCallback((url: string) => {
    setSelectedInvoices(new Set([url]));
    setIsConfirmingDelete(true);
  }, []);

  const handleDeleteSelectedInvoices = useCallback(() => {
    if (selectedInvoices.size > 0) {
      setIsConfirmingDelete(true);
    }
  }, [selectedInvoices]);

  const closeConfirmDelete = useCallback(() => {
    setIsConfirmingDelete(false);
  }, []);

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
        const parsed = parseInvoiceHtml(text, items, availableGroupFields);
        if (!parsed) return;

        onInvoiceLoaded(parsed);
        setInvoiceDirty(false);
        setCurrentFileName(url.split("/").pop() || "");
      } catch (err) {
        console.error("Failed to load invoice", err);
      }
    },
    [
      availableGroupFields,
      items,
      onInvoiceLoaded,
      setCurrentFileName,
      setInvoiceDirty,
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
  }, [buildInvoiceHtml, project, revision, setCurrentFileName, setInvoiceDirty]);

  const handleSaveClick = useCallback(() => {
    if (invoiceDirty) saveInvoice();
    else toast.info("Invoice already saved");
  }, [invoiceDirty, saveInvoice]);

  return {
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
  };
}
