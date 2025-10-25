import { useCallback, useEffect, useState } from "react";

import { DEFAULT_NOTES_HTML } from "./invoicePreviewConstants";
import type { InvoicePreviewModalProps } from "./invoicePreviewTypes";

interface UseInvoiceDetailsOptions {
  isOpen: boolean;
  project: InvoicePreviewModalProps["project"];
  revision: InvoicePreviewModalProps["revision"];
}

interface UseInvoiceDetailsResult {
  invoiceDirty: boolean;
  setInvoiceDirty: React.Dispatch<React.SetStateAction<boolean>>;
  invoiceNumber: string;
  issueDate: string;
  projectName: string;
  customerSummary: string;
  notes: string;
  depositReceived: number;
  taxRate: number;
  totalDue: number;
  setTotalDue: React.Dispatch<React.SetStateAction<number>>;
  handleInvoiceNumberBlur: (value: string) => void;
  handleIssueDateBlur: (value: string) => void;
  handleProjectNameBlur: (value: string) => void;
  handleCustomerSummaryBlur: (value: string) => void;
  handleDepositBlur: (value: string) => void;
  handleTaxRateBlur: (value: string) => void;
  handleTotalDueBlur: (value: string) => void;
  handleNotesBlur: (value: string) => void;
  setInvoiceNumber: React.Dispatch<React.SetStateAction<string>>;
  setIssueDate: React.Dispatch<React.SetStateAction<string>>;
  setProjectName: React.Dispatch<React.SetStateAction<string>>;
  setCustomerSummary: React.Dispatch<React.SetStateAction<string>>;
  setDepositReceived: React.Dispatch<React.SetStateAction<number>>;
  setTaxRate: React.Dispatch<React.SetStateAction<number>>;
  setNotes: React.Dispatch<React.SetStateAction<string>>;
}

const buildClientSummary = (
  project: InvoicePreviewModalProps["project"]
): string => {
  if (!project) return "Client details";

  const parts = [
    project.clientName,
    project.clientAddress || project.address,
    project.clientEmail,
    project.clientPhone,
  ].filter((value): value is string => Boolean(value && value.trim()));

  if (parts.length === 0) return "Client details";

  return parts.join("\n");
};

export function useInvoiceDetails({
  isOpen,
  project,
  revision,
}: UseInvoiceDetailsOptions): UseInvoiceDetailsResult {
  const [invoiceDirty, setInvoiceDirty] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("0000");
  const [issueDate, setIssueDate] = useState<string>(() => new Date().toLocaleDateString());
  const [projectName, setProjectName] = useState<string>(() => project?.title || "");
  const [customerSummary, setCustomerSummary] = useState(() => buildClientSummary(project));
  const [notes, setNotes] = useState(DEFAULT_NOTES_HTML);
  const [depositReceived, setDepositReceived] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(0);
  const [totalDue, setTotalDue] = useState<number>(0);

  useEffect(() => {
    if (!isOpen) return;
    setInvoiceNumber("0000");
    setIssueDate(new Date().toLocaleDateString());
    setProjectName(project?.title || "");
    setCustomerSummary(buildClientSummary(project));
    setNotes(DEFAULT_NOTES_HTML);
    setDepositReceived(0);
    setTaxRate(0);
    setInvoiceDirty(true);
  }, [isOpen, project]);

  useEffect(() => {
    if (!isOpen) return;
    if (revision?.revision != null) {
      setInvoiceNumber((prev) => prev || "0000");
    }
  }, [isOpen, revision?.revision]);

  const markDirty = useCallback(() => setInvoiceDirty(true), []);

  const handleInvoiceNumberBlur = useCallback(
    (value: string) => {
      setInvoiceNumber(value);
      markDirty();
    },
    [markDirty]
  );

  const handleIssueDateBlur = useCallback(
    (value: string) => {
      setIssueDate(value);
      markDirty();
    },
    [markDirty]
  );

  const handleProjectNameBlur = useCallback(
    (value: string) => {
      setProjectName(value);
      markDirty();
    },
    [markDirty]
  );

  const handleCustomerSummaryBlur = useCallback(
    (value: string) => {
      setCustomerSummary(value);
      markDirty();
    },
    [markDirty]
  );

  const handleDepositBlur = useCallback(
    (value: string) => {
      const parsed = parseFloat(value.replace(/[$,]/g, "")) || 0;
      setDepositReceived(parsed);
      markDirty();
    },
    [markDirty]
  );

  const handleTaxRateBlur = useCallback(
    (value: string) => {
      const parsed = parseFloat(value.replace(/[%,$\s]/g, "")) || 0;
      setTaxRate(parsed);
      markDirty();
    },
    [markDirty]
  );

  const handleTotalDueBlur = useCallback(
    (value: string) => {
      const parsed = parseFloat(value.replace(/[$,]/g, "")) || 0;
      setTotalDue(parsed);
      markDirty();
    },
    [markDirty]
  );

  const handleNotesBlur = useCallback(
    (value: string) => {
      setNotes(value);
      markDirty();
    },
    [markDirty]
  );

  return {
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
    setInvoiceNumber,
    setIssueDate,
    setProjectName,
    setCustomerSummary,
    setDepositReceived,
    setTaxRate,
    setNotes,
  };
}

export type { UseInvoiceDetailsResult };
