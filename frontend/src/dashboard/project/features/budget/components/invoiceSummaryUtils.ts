import type { InvoicePreviewModalProps } from "./invoicePreviewTypes";

export const DEFAULT_CUSTOMER_SUMMARY = "Customer";
export const DEFAULT_INVOICE_SUMMARY = "Invoice Details";

const normalizeSummaryValue = (value?: string | null) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

export const buildSummary = (
  values: Array<string | null | undefined>,
  fallback: string
) => {
  const normalized = values
    .map(normalizeSummaryValue)
    .map((value) => value.replace(/\r\n?/g, "\n"))
    .flatMap((value) => value.split("\n"))
    .map((part) => part.trim())
    .filter(Boolean);

  if (normalized.length === 0) return fallback;
  return normalized.join("\n");
};

export const getDefaultCustomerSummary = (
  project: InvoicePreviewModalProps["project"]
) =>
  buildSummary(
    [project?.clientName, project?.clientAddress, project?.clientPhone, project?.clientEmail],
    DEFAULT_CUSTOMER_SUMMARY
  );

export const getDefaultInvoiceSummary = (
  project: InvoicePreviewModalProps["project"]
) =>
  buildSummary(
    [project?.invoiceBrandName, project?.invoiceBrandAddress, project?.invoiceBrandPhone],
    DEFAULT_INVOICE_SUMMARY
  );

export const splitSummaryLines = (
  value: string | null | undefined,
  fallback: string
): string[] => {
  const normalized = normalizeSummaryValue(value)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((part) => part.trim())
    .filter(Boolean);

  if (normalized.length === 0) return [fallback];
  return normalized;
};
