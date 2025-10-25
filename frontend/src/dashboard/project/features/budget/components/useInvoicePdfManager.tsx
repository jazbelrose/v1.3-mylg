import { useCallback, useRef, useState } from "react";
import { pdf as createPdf } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import { toast } from "react-toastify";

import PdfInvoice from "./PdfInvoice";
import { buildInvoiceHtml } from "./invoiceHtmlBuilder";
import type {
  InvoicePreviewModalProps,
  OrganizationInfoLine,
  RowData,
} from "./invoicePreviewTypes";

interface UseInvoicePdfManagerOptions {
  project: InvoicePreviewModalProps["project"];
  brandName: string;
  brandTagline: string;
  brandLogoKey: string;
  logoDataUrl: string | null;
  invoiceNumber: string;
  issueDate: string;
  projectName: string;
  projectTitle: string;
  customerSummary: string;
  rowsData: RowData[];
  subtotal: number;
  depositReceived: number;
  taxRate: number;
  taxAmount: number;
  totalDue: number;
  notes: string;
  revision: InvoicePreviewModalProps["revision"];
  pages: RowData[][];
  selectedPages: number[];
  organizationLines: OrganizationInfoLine[];
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
  projectName,
  projectTitle,
  customerSummary,
  rowsData,
  subtotal,
  depositReceived,
  taxRate,
  taxAmount,
  totalDue,
  notes,
  revision,
  pages,
  selectedPages,
  organizationLines,
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
        projectName={projectName}
        projectTitle={projectTitle}
        customerSummary={customerSummary}
        rows={rowsData}
        subtotal={subtotal}
        depositReceived={depositReceived}
        taxRate={taxRate}
        taxAmount={taxAmount}
        totalDue={totalDue}
        notes={notes}
        organizationLines={organizationLines}
      />
    );
  }, [
    brandLogoKey,
    brandName,
    brandTagline,
    customerSummary,
    depositReceived,
    invoiceNumber,
    issueDate,
    logoDataUrl,
    notes,
    organizationLines,
    taxAmount,
    taxRate,
    project,
    projectName,
    projectTitle,
    rowsData,
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
      projectName,
      projectTitle,
      customerSummary,
      notes,
      depositReceived,
      taxRate,
      taxAmount,
      subtotal,
      totalDue,
      organizationLines,
    });
  }, [
    pages,
    selectedPages,
    brandName,
    brandTagline,
    brandLogoKey,
    customerSummary,
    logoDataUrl,
    project,
    invoiceNumber,
    issueDate,
    projectName,
    projectTitle,
    notes,
    depositReceived,
    taxRate,
    taxAmount,
    subtotal,
    totalDue,
    organizationLines,
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
