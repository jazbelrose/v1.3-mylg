import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { getFileUrl } from "@/shared/utils/api";

import InvoiceDocument from "./InvoiceDocument";
import { invoiceStyles } from "./invoiceStyles";
import type { InvoicePreviewModalProps, RowData } from "./invoicePreviewTypes";

interface InvoiceDocumentOptions {
  pages: RowData[][];
  selectedPages: number[];
  rowsData: RowData[];
  brandName: string;
  brandTagline: string;
  brandAddress: string;
  brandPhone: string;
  brandLogoKey: string;
  logoDataUrl: string | null;
  useProjectAddress: boolean;
  project: InvoicePreviewModalProps["project"];
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
  subtotal: number;
  totalDue: number;
}

function resolvePageIndexes(pages: RowData[][], selectedPages: number[]): number[] {
  if (selectedPages.length > 0) {
    return [...selectedPages].sort((a, b) => a - b);
  }
  if (pages.length > 0) {
    return pages.map((_, index) => index);
  }
  return [0];
}

function resolveLogoSrc(brandLogoKey: string, logoDataUrl: string | null): string {
  if (logoDataUrl) return logoDataUrl;
  if (brandLogoKey) return getFileUrl(brandLogoKey);
  return "";
}

export function buildInvoiceDocumentMarkup({
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
}: InvoiceDocumentOptions): string {
  const logoSrc = resolveLogoSrc(brandLogoKey, logoDataUrl);
  const pageIndexes = resolvePageIndexes(pages, selectedPages);
  const pageCount = pageIndexes.length;
  const safeNotes = notes?.trim() ? notes : "";

  return pageIndexes
    .map((pageIndex, orderIndex) => {
      const pageRows = pages[pageIndex] ?? rowsData;
      const showTotals = orderIndex === pageCount - 1;
      const showNotes = showTotals;

      return renderToStaticMarkup(
        <InvoiceDocument
          logoSrc={logoSrc}
          brandName={brandName}
          brandTagline={brandTagline}
          brandAddress={brandAddress}
          brandPhone={brandPhone}
          useProjectAddress={useProjectAddress}
          project={project}
          invoiceNumber={invoiceNumber}
          issueDate={issueDate}
          dueDate={dueDate}
          serviceDate={serviceDate}
          projectTitle={projectTitle}
          customerSummary={customerSummary}
          invoiceSummary={invoiceSummary}
          paymentSummary={paymentSummary}
          rows={pageRows}
          subtotal={subtotal}
          depositReceived={depositReceived}
          totalDue={totalDue}
          notesHtml={showNotes ? safeNotes : ""}
          pageIndex={orderIndex}
          pageCount={pageCount}
          showTotals={showTotals}
          showNotes={showNotes}
          footerText={project?.company || ""}
        />
      );
    })
    .join("");
}

export function buildInvoiceHtml(options: InvoiceDocumentOptions): string {
  const markup = buildInvoiceDocumentMarkup(options);
  const title = options.invoiceNumber ? `Invoice ${options.invoiceNumber}` : "Invoice";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>${invoiceStyles}</style></head><body>${markup}</body></html>`;
}

export type { InvoiceDocumentOptions };
