import { useCallback, useRef, useState } from "react";
import { pdf as createPdf } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import { toast } from "react-toastify";

import PdfInvoice from "./PdfInvoice";
import { buildInvoiceHtml } from "./invoiceHtmlBuilder";
import type { InvoicePreviewModalProps, RowData } from "./invoicePreviewTypes";

interface UseInvoicePdfManagerOptions {
  project: InvoicePreviewModalProps["project"];
  brandName: string;
  brandTagline: string;
  brandLogoKey: string;
  logoDataUrl: string | null;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  serviceDate: string;
  projectTitle: string;
  rowsData: RowData[];
  subtotal: number;
  depositReceived: number;
  totalDue: number;
  notes: string;
  revision: InvoicePreviewModalProps["revision"];
  pages: RowData[][];
  selectedPages: number[];
}

interface UseInvoicePdfManagerResult {
  pdfPreviewUrl: string | null;
  closePdfPreview: () => void;
  handleSavePdf: () => void;
  handlePreviewPdf: () => void;
  buildInvoiceHtmlPayload: () => string;
}

export function useInvoicePdfManager({
  project,
  brandName,
  brandTagline,
  brandLogoKey,
  logoDataUrl,
  invoiceNumber,
  issueDate,
  dueDate,
  serviceDate,
  projectTitle,
  rowsData,
  subtotal,
  depositReceived,
  totalDue,
  notes,
  revision,
  pages,
  selectedPages,
}: UseInvoicePdfManagerOptions): UseInvoicePdfManagerResult {
  const pdfPreviewUrlRef = useRef<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  const closePdfPreview = useCallback(() => {
    if (pdfPreviewUrlRef.current) {
      URL.revokeObjectURL(pdfPreviewUrlRef.current);
      pdfPreviewUrlRef.current = null;
    }
    setPdfPreviewUrl(null);
  }, []);

  const buildPdfInvoiceElement = useCallback(() => {
    return (
      <PdfInvoice
        brandName={brandName || project?.company || ""}
        brandTagline={brandTagline}
        brandLogoKey={brandLogoKey}
        logoDataUrl={logoDataUrl}
        project={project}
        invoiceNumber={invoiceNumber}
        issueDate={issueDate}
        dueDate={dueDate}
        serviceDate={serviceDate}
        projectTitle={projectTitle}
        rows={rowsData}
        subtotal={subtotal}
        depositReceived={depositReceived}
        totalDue={totalDue}
        notes={notes}
      />
    );
  }, [
    brandLogoKey,
    brandName,
    brandTagline,
    depositReceived,
    dueDate,
    invoiceNumber,
    issueDate,
    logoDataUrl,
    notes,
    project,
    projectTitle,
    rowsData,
    serviceDate,
    subtotal,
    totalDue,
  ]);

  const renderPdfBlob = useCallback(async (): Promise<Blob | null> => {
    try {
      const instance = createPdf(buildPdfInvoiceElement());
      const blob = await instance.toBlob();
      return blob;
    } catch (error) {
      console.error("Failed to generate invoice PDF", error);
      toast.error("Unable to build invoice PDF");
      return null;
    }
  }, [buildPdfInvoiceElement]);

  const handleSavePdf = useCallback(() => {
    void (async () => {
      const blob = await renderPdfBlob();
      if (!blob) return;
      const file =
        revision?.revision != null ? `invoice-revision-${revision.revision}.pdf` : "invoice.pdf";
      saveAs(blob, file);
    })();
  }, [renderPdfBlob, revision]);

  const handlePreviewPdf = useCallback(() => {
    void (async () => {
      const blob = await renderPdfBlob();
      if (!blob) return;
      closePdfPreview();
      const objectUrl = URL.createObjectURL(blob);
      pdfPreviewUrlRef.current = objectUrl;
      setPdfPreviewUrl(objectUrl);
    })();
  }, [renderPdfBlob, closePdfPreview]);

  const buildInvoiceHtmlPayload = useCallback(() => {
    return buildInvoiceHtml({
      pages,
      selectedPages,
      brandName,
      brandTagline,
      brandLogoKey,
      logoDataUrl,
      project,
      invoiceNumber,
      issueDate,
      dueDate,
      serviceDate,
      projectTitle,
      notes,
      depositReceived,
      subtotal,
      totalDue,
    });
  }, [
    pages,
    selectedPages,
    brandName,
    brandTagline,
    brandLogoKey,
    logoDataUrl,
    project,
    invoiceNumber,
    issueDate,
    dueDate,
    serviceDate,
    projectTitle,
    notes,
    depositReceived,
    subtotal,
    totalDue,
  ]);

  return {
    pdfPreviewUrl,
    closePdfPreview,
    handleSavePdf,
    handlePreviewPdf,
    buildInvoiceHtmlPayload,
  };
}

export type { UseInvoicePdfManagerResult };
