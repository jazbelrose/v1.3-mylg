import { useCallback, useEffect, useRef, useState } from "react";
import { pdf as createPdf } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import { toast } from "react-toastify";

import PdfInvoice from "../PdfInvoice";
import type {
  InvoicePreviewModalProps,
  RowData,
} from "../invoicePreviewTypes";
import { buildInvoiceHtml as buildInvoiceHtmlDocument } from "../utils/invoiceHtmlBuilder";

interface UseInvoicePdfOptions {
  isOpen: boolean;
  revision: InvoicePreviewModalProps["revision"];
  previewRef: React.MutableRefObject<HTMLDivElement | null>;
  selectedPages: number[];
  pages: RowData[][];
  brandName: string;
  project: InvoicePreviewModalProps["project"];
  useProjectAddress: boolean;
  brandAddress: string;
  brandPhone: string;
  brandTagline: string;
  logoDataUrl: string | null;
  brandLogoKey: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  serviceDate: string;
  projectTitle: string;
  customerSummary: string;
  invoiceSummary: string;
  paymentSummary: string;
  rowsData: RowData[];
  subtotal: number;
  depositReceived: number;
  totalDue: number;
  notes: string;
}

interface UseInvoicePdfResult {
  pdfPreviewUrl: string | null;
  closePdfPreview: () => void;
  handlePreviewPdf: () => Promise<void>;
  handleSavePdf: () => Promise<void>;
  buildInvoiceHtml: () => string | null;
}

export function useInvoicePdf({
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
}: UseInvoicePdfOptions): UseInvoicePdfResult {
  const pdfPreviewUrlRef = useRef<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  const closePdfPreview = useCallback(() => {
    if (pdfPreviewUrlRef.current) {
      URL.revokeObjectURL(pdfPreviewUrlRef.current);
      pdfPreviewUrlRef.current = null;
    }
    setPdfPreviewUrl(null);
  }, []);

  useEffect(() => {
    if (!isOpen) {
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

  const handleSavePdf = useCallback(async () => {
    const blob = await renderPdfBlob();
    if (!blob) return;
    const file =
      revision?.revision != null ? `invoice-revision-${revision.revision}.pdf` : "invoice.pdf";
    saveAs(blob, file);
  }, [renderPdfBlob, revision]);

  return {
    pdfPreviewUrl,
    closePdfPreview,
    handlePreviewPdf,
    handleSavePdf,
    buildInvoiceHtml,
  };
}
