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
  dueDate: string;
  serviceDate: string;
  projectTitle: string;
  customerSummary: string;
  invoiceSummary: string;
  paymentSummary: string;
  notes: string;
  depositReceived: number;
  totalDue: number;
  setTotalDue: React.Dispatch<React.SetStateAction<number>>;
  handleInvoiceNumberBlur: (value: string) => void;
  handleIssueDateBlur: (value: string) => void;
  handleDueDateChange: (value: string) => void;
  handleServiceDateChange: (value: string) => void;
  handleProjectTitleBlur: (value: string) => void;
  handleCustomerSummaryBlur: (value: string) => void;
  handleInvoiceSummaryBlur: (value: string) => void;
  handlePaymentSummaryBlur: (value: string) => void;
  handleDepositBlur: (value: string) => void;
  handleTotalDueBlur: (value: string) => void;
  handleNotesBlur: (value: string) => void;
  setInvoiceNumber: React.Dispatch<React.SetStateAction<string>>;
  setIssueDate: React.Dispatch<React.SetStateAction<string>>;
  setDueDate: React.Dispatch<React.SetStateAction<string>>;
  setServiceDate: React.Dispatch<React.SetStateAction<string>>;
  setProjectTitle: React.Dispatch<React.SetStateAction<string>>;
  setCustomerSummary: React.Dispatch<React.SetStateAction<string>>;
  setInvoiceSummary: React.Dispatch<React.SetStateAction<string>>;
  setPaymentSummary: React.Dispatch<React.SetStateAction<string>>;
  setDepositReceived: React.Dispatch<React.SetStateAction<number>>;
  setNotes: React.Dispatch<React.SetStateAction<string>>;
}

export function useInvoiceDetails({
  isOpen,
  project,
  revision,
}: UseInvoiceDetailsOptions): UseInvoiceDetailsResult {
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

  const handleDueDateChange = useCallback(
    (value: string) => {
      setDueDate(value);
      markDirty();
    },
    [markDirty]
  );

  const handleServiceDateChange = useCallback(
    (value: string) => {
      setServiceDate(value);
      markDirty();
    },
    [markDirty]
  );

  const handleProjectTitleBlur = useCallback(
    (value: string) => {
      setProjectTitle(value);
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

  const handleInvoiceSummaryBlur = useCallback(
    (value: string) => {
      setInvoiceSummary(value);
      markDirty();
    },
    [markDirty]
  );

  const handlePaymentSummaryBlur = useCallback(
    (value: string) => {
      setPaymentSummary(value);
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
  };
}

export type { UseInvoiceDetailsResult };
