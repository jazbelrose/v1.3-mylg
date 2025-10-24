import { useCallback, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { toast } from "react-toastify";

import { buildInvoiceDocumentMarkup, buildInvoiceHtml } from "./invoiceHtmlBuilder";
import { invoiceStyles } from "./invoiceStyles";
import type { InvoicePreviewModalProps, RowData } from "./invoicePreviewTypes";

declare global {
  interface Window {
    html2pdf?: any;
  }
}

const HTML2PDF_CDN = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";

interface UseInvoicePdfManagerOptions {
  project: InvoicePreviewModalProps["project"];
  useProjectAddress: boolean;
  brandName: string;
  brandTagline: string;
  brandAddress: string;
  brandPhone: string;
  brandLogoKey: string;
  logoDataUrl: string | null;
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
  useProjectAddress,
  brandName,
  brandTagline,
  brandAddress,
  brandPhone,
  brandLogoKey,
  logoDataUrl,
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

  const html2pdfPromiseRef = useRef<Promise<any> | null>(null);

  const ensureHtml2Pdf = useCallback(async () => {
    if (typeof window === "undefined") {
      toast.error("PDF generation is only available in a browser");
      return null;
    }

    if (window.html2pdf) return window.html2pdf;

    if (!html2pdfPromiseRef.current) {
      html2pdfPromiseRef.current = new Promise((resolve, reject) => {
        let scriptElement: HTMLScriptElement | null = null;

        const cleanup = () => {
          if (scriptElement) {
            scriptElement.removeEventListener("load", onLoad);
            scriptElement.removeEventListener("error", onError);
          }
        };

        const onLoad = () => {
          cleanup();
          if (window.html2pdf) {
            resolve(window.html2pdf);
          } else {
            reject(new Error("html2pdf failed to initialize"));
          }
        };

        const onError = () => {
          cleanup();
          scriptElement?.remove();
          reject(new Error("Failed to load html2pdf.js"));
        };

        const existing = document.querySelector<HTMLScriptElement>("script[data-html2pdf]");
        if (existing) {
          scriptElement = existing;
          if (existing.dataset.loaded === "true") {
            onLoad();
            return;
          }
          existing.addEventListener("load", onLoad, { once: true });
          existing.addEventListener("error", onError, { once: true });
          return;
        }

        scriptElement = document.createElement("script");
        scriptElement.src = HTML2PDF_CDN;
        scriptElement.async = true;
        scriptElement.dataset.html2pdf = "true";
        scriptElement.addEventListener(
          "load",
          () => {
            scriptElement!.dataset.loaded = "true";
            onLoad();
          },
          { once: true }
        );
        scriptElement.addEventListener("error", onError, { once: true });
        (document.body || document.head || document.documentElement).appendChild(scriptElement);
      })
        .catch((error) => {
          console.error("Failed to load html2pdf.js", error);
          toast.error("Unable to load PDF rendering support");
          html2pdfPromiseRef.current = null;
          return null;
        });
    }

    return html2pdfPromiseRef.current;
  }, []);

  const renderPdfBlob = useCallback(async (): Promise<Blob | null> => {
    const html2pdf = await ensureHtml2Pdf();
    if (!html2pdf) return null;

    const markup = buildInvoiceDocumentMarkup({
      pages,
      selectedPages,
      rowsData,
      brandName,
      brandTagline,
      brandAddress,
      brandPhone,
      brandLogoKey,
      logoDataUrl,
      useProjectAddress,
      project,
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
      subtotal,
      totalDue,
    });

    const container = document.createElement("div");
    container.setAttribute("data-invoice-pdf", "true");
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.style.top = "0";
    container.style.width = "210mm";
    container.style.backgroundColor = "#ffffff";
    container.innerHTML = `<style>${invoiceStyles}</style>${markup}`;
    document.body.appendChild(container);

    try {
      const pdfWorker = (html2pdf as any)()
        .set({
          margin: 0,
          pagebreak: { mode: ["css", "legacy"] },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
        })
        .from(container);

      const blob = await pdfWorker.outputPdf("blob");
      return blob as Blob;
    } catch (error) {
      console.error("Failed to generate invoice PDF", error);
      toast.error("Unable to build invoice PDF");
      return null;
    } finally {
      document.body.removeChild(container);
    }
  }, [
    ensureHtml2Pdf,
    pages,
    selectedPages,
    rowsData,
    brandName,
    brandTagline,
    brandAddress,
    brandPhone,
    brandLogoKey,
    logoDataUrl,
    useProjectAddress,
    project,
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
    subtotal,
    totalDue,
  ]);

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
      rowsData,
      brandName,
      brandTagline,
      brandAddress,
      brandPhone,
      brandLogoKey,
      logoDataUrl,
      useProjectAddress,
      project,
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
      subtotal,
      totalDue,
    });
  }, [
    pages,
    selectedPages,
    rowsData,
    brandName,
    brandTagline,
    brandAddress,
    brandPhone,
    brandLogoKey,
    logoDataUrl,
    useProjectAddress,
    project,
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
