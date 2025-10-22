import { useCallback, useEffect, useState } from "react";

import type { InvoicePreviewModalProps } from "../invoicePreviewTypes";
import type { parseInvoiceHtml } from "../utils/invoiceHtmlParser";

export const DEFAULT_NOTES_HTML = "<p>Notes...</p>";

type ParsedInvoiceData = NonNullable<ReturnType<typeof parseInvoiceHtml>>;

interface UseInvoiceFieldsOptions {
  project: InvoicePreviewModalProps["project"];
  revision: InvoicePreviewModalProps["revision"];
  isOpen: boolean;
  subtotal: number;
}

interface UseInvoiceFieldsResult {
  invoiceDirty: boolean;
  markInvoiceDirty: () => void;
  setInvoiceDirty: (value: boolean) => void;
  currentFileName: string;
  setCurrentFileName: (name: string) => void;
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
  notes: string;
  onNotesBlur: (value: string) => void;
  depositReceived: number;
  onDepositBlur: (value: string) => void;
  totalDue: number;
  onTotalDueBlur: (value: string) => void;
  applyInvoiceData: (parsed: ParsedInvoiceData) => void;
}

const INITIAL_INVOICE_NUMBER = "0000";

export function useInvoiceFields({
  project,
  revision,
  isOpen,
  subtotal,
}: UseInvoiceFieldsOptions): UseInvoiceFieldsResult {
  const [invoiceDirty, setInvoiceDirty] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState(INITIAL_INVOICE_NUMBER);
  const [issueDate, setIssueDate] = useState<string>(() => new Date().toLocaleDateString());
  const [dueDate, setDueDate] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [projectTitle, setProjectTitle] = useState(project?.title || "Project Title");
  const [customerSummary, setCustomerSummary] = useState(project?.clientName || "Customer");
  const [invoiceSummary, setInvoiceSummary] = useState("Invoice Details");
  const [paymentSummary, setPaymentSummary] = useState("Payment");
  const [notes, setNotes] = useState(DEFAULT_NOTES_HTML);
  const [depositReceived, setDepositReceived] = useState<number>(0);
  const [totalDue, setTotalDue] = useState<number>(0);
  const [currentFileName, setCurrentFileName] = useState<string>("");

  useEffect(() => {
    if (!isOpen) return;
    setInvoiceNumber(INITIAL_INVOICE_NUMBER);
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
    const dep = parseFloat(String(depositReceived)) || 0;
    setTotalDue(subtotal - dep);
  }, [subtotal, depositReceived]);

  const markInvoiceDirty = useCallback(() => setInvoiceDirty(true), []);

  const setInvoiceDirtyFlag = useCallback((value: boolean) => {
    setInvoiceDirty(value);
  }, []);

  const handleInvoiceNumberBlur = useCallback(
    (value: string) => {
      setInvoiceNumber(value);
      markInvoiceDirty();
    },
    [markInvoiceDirty]
  );

  const handleIssueDateBlur = useCallback(
    (value: string) => {
      setIssueDate(value);
      markInvoiceDirty();
    },
    [markInvoiceDirty]
  );

  const handleDueDateChange = useCallback(
    (value: string) => {
      setDueDate(value);
      markInvoiceDirty();
    },
    [markInvoiceDirty]
  );

  const handleServiceDateChange = useCallback(
    (value: string) => {
      setServiceDate(value);
      markInvoiceDirty();
    },
    [markInvoiceDirty]
  );

  const handleProjectTitleBlur = useCallback(
    (value: string) => {
      setProjectTitle(value);
      markInvoiceDirty();
    },
    [markInvoiceDirty]
  );

  const handleCustomerSummaryBlur = useCallback(
    (value: string) => {
      setCustomerSummary(value);
      markInvoiceDirty();
    },
    [markInvoiceDirty]
  );

  const handleInvoiceSummaryBlur = useCallback(
    (value: string) => {
      setInvoiceSummary(value);
      markInvoiceDirty();
    },
    [markInvoiceDirty]
  );

  const handlePaymentSummaryBlur = useCallback(
    (value: string) => {
      setPaymentSummary(value);
      markInvoiceDirty();
    },
    [markInvoiceDirty]
  );

  const handleDepositBlur = useCallback(
    (value: string) => {
      const parsed = parseFloat(value.replace(/[$,]/g, "")) || 0;
      setDepositReceived(parsed);
      markInvoiceDirty();
    },
    [markInvoiceDirty]
  );

  const handleTotalDueBlur = useCallback(
    (value: string) => {
      const parsed = parseFloat(value.replace(/[$,]/g, "")) || 0;
      setTotalDue(parsed);
      markInvoiceDirty();
    },
    [markInvoiceDirty]
  );

  const handleNotesBlur = useCallback(
    (value: string) => {
      setNotes(value);
      markInvoiceDirty();
    },
    [markInvoiceDirty]
  );

  const applyInvoiceData = useCallback(
    (parsed: ParsedInvoiceData) => {
      setInvoiceNumber(parsed.invoiceNumber || INITIAL_INVOICE_NUMBER);
      setIssueDate(parsed.issueDate || new Date().toLocaleDateString());
      setDueDate(parsed.dueDate || "");
      setServiceDate(parsed.serviceDate || "");
      setProjectTitle(parsed.projectTitle || project?.title || "Project Title");
      setCustomerSummary(parsed.customerSummary || project?.clientName || "Customer");
      setInvoiceSummary(parsed.invoiceSummary || "Invoice Details");
      setPaymentSummary(parsed.paymentSummary || "Payment");
      setNotes(parsed.notes || DEFAULT_NOTES_HTML);
      setDepositReceived(parsed.depositReceived || 0);
      setTotalDue(parsed.totalDue || 0);
      setInvoiceDirty(false);
    },
    [project?.clientName, project?.title]
  );

  return {
    invoiceDirty,
    markInvoiceDirty,
    setInvoiceDirty: setInvoiceDirtyFlag,
    currentFileName,
    setCurrentFileName,
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
    notes,
    onNotesBlur: handleNotesBlur,
    depositReceived,
    onDepositBlur: handleDepositBlur,
    totalDue,
    onTotalDueBlur: handleTotalDueBlur,
    applyInvoiceData,
  };
}
