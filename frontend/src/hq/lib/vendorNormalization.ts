import type { HqTransaction } from "@/hq/types";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

// Display name cleaning: aim for a short, stable vendor label.
export function cleanVendorLabel(input: {
  vendor?: string;
  counterparty?: string;
  rawDescription?: string;
}): string {
  const raw = String(input.vendor || input.counterparty || input.rawDescription || "").trim();
  if (!raw) return "Unknown";

  let value = normalizeWhitespace(raw);

  // Strip common noise / auth phrases.
  value = value
    .replace(/\b(PURCHASE|RECURRING\s+PAYMENT)\s+AUTHORIZED\s+ON\b/i, "")
    .replace(/\bAUTHORIZED\s+ON\b/i, "")
    .replace(/\bONLINE\s+TRANSFER\b/i, "")
    .replace(/\bPOS\b/i, "")
    .replace(/\bDEBIT\b/i, "")
    .replace(/\bCREDIT\b/i, "")
    .replace(/\bCARD\s+\d{4}\b/i, "")
    .replace(/\bREF\s*#\s*[A-Z0-9-]+\b/i, "")
    .replace(/\bFED#\s*[A-Z0-9-]+\b/i, "")
    .replace(/\b\d{4,}\b/g, "");

  value = normalizeWhitespace(value);

  // A few ultra-common vendor normalizations.
  value = value.replace(/^AMAZON\s+MKTPLCE\*?.*$/i, "Amazon");
  value = value.replace(/^SQ\s*\*\s*/i, "");

  value = normalizeWhitespace(value);
  return value.length > 60 ? `${value.slice(0, 57)}…` : value;
}

export function normalizeVendorKey(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co)\b\.?/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getVendorKeyForTxn(txn: Pick<HqTransaction, "vendor" | "counterparty" | "rawDescription">): {
  vendorLabel: string;
  vendorKey: string;
} {
  const vendorLabel = cleanVendorLabel(txn);
  const vendorKey = normalizeVendorKey(vendorLabel);
  return { vendorLabel, vendorKey: vendorKey || "unknown" };
}
