import { useCallback, useEffect, useState } from "react";
import { list } from "aws-amplify/storage";
import { toast } from "react-toastify";

import {
  apiFetch,
  fileUrlsToKeys,
  getFileUrl,
  projectFileDeleteUrl,
} from "@/shared/utils/api";
import type { InvoicePreviewModalProps, SavedInvoice } from "./invoicePreviewTypes";

interface UseSavedInvoicesOptions {
  project: InvoicePreviewModalProps["project"];
  isOpen: boolean;
}

interface UseSavedInvoicesResult {
  savedInvoices: SavedInvoice[];
  setSavedInvoices: React.Dispatch<React.SetStateAction<SavedInvoice[]>>;
  selectedInvoices: Set<string>;
  setSelectedInvoices: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleInvoiceSelect: (url: string) => void;
  selectAllInvoices: (checked: boolean) => void;
  handleDeleteInvoice: (url: string) => void;
  handleDeleteSelectedInvoices: () => void;
  performDeleteInvoices: () => Promise<void>;
  isConfirmingDelete: boolean;
  setIsConfirmingDelete: React.Dispatch<React.SetStateAction<boolean>>;
  refreshInvoices: () => Promise<void>;
}

export function useSavedInvoices({
  project,
  isOpen,
}: UseSavedInvoicesOptions): UseSavedInvoicesResult {
  const [savedInvoices, setSavedInvoices] = useState<SavedInvoice[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(() => new Set());
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const fetchInvoiceFiles = useCallback(async (): Promise<SavedInvoice[]> => {
    if (!project?.projectId) return [];
    const prefix = `projects/${project.projectId}/invoices/`;
    try {
      const response = await list({ prefix, options: { accessLevel: "guest" } });
      return (response.items || [])
        .filter((item) => item.key && !String(item.key).endsWith("/"))
        .map((item) => {
          const rawKey = String(item.key);
          const storageKey = rawKey.startsWith("public/") ? rawKey : `public/${rawKey}`;
          return {
            name: rawKey.split("/").pop() || "",
            url: getFileUrl(storageKey),
          };
        });
    } catch (error) {
      console.error("Failed to list invoice files", error);
      return [];
    }
  }, [project?.projectId]);

  const refreshInvoices = useCallback(async () => {
    const files = await fetchInvoiceFiles();
    setSavedInvoices(Array.isArray(files) ? files : []);
  }, [fetchInvoiceFiles]);

  useEffect(() => {
    if (!isOpen || !project?.projectId) return;
    refreshInvoices().catch((error) => console.error("Failed to fetch invoices", error));
  }, [isOpen, project?.projectId, refreshInvoices]);

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
        setSelectedInvoices(new Set(savedInvoices.map((invoice) => invoice.url)));
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
  }, [selectedInvoices.size]);

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
        body: JSON.stringify({ fileKeys }),
      });
      setSavedInvoices((prev) => prev.filter((invoice) => !fileUrls.includes(invoice.url)));
      setSelectedInvoices(new Set());
      toast.update(toastId, {
        render: "Invoices deleted.",
        type: "success",
        isLoading: false,
        autoClose: 3000,
      });
    } catch (error) {
      console.error("Failed to delete invoices", error);
      toast.update(toastId, {
        render: "Failed to delete invoices.",
        type: "error",
        isLoading: false,
        autoClose: 3000,
      });
    }
  }, [project, selectedInvoices]);

  return {
    savedInvoices,
    setSavedInvoices,
    selectedInvoices,
    setSelectedInvoices,
    toggleInvoiceSelect,
    selectAllInvoices,
    handleDeleteInvoice,
    handleDeleteSelectedInvoices,
    performDeleteInvoices,
    isConfirmingDelete,
    setIsConfirmingDelete,
    refreshInvoices,
  };
}

export type { UseSavedInvoicesResult };
