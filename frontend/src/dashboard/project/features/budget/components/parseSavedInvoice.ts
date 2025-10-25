import { groupFields } from "./invoicePreviewConstants";
import type { BudgetItem, GroupField } from "./invoicePreviewTypes";

interface ParsedInvoiceData {
  brandLogoKey: string;
  brandName: string;
  brandTagline: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  serviceDate: string;
  projectTitle: string;
  customerSummary: string;
  paymentSummary: string;
  notes: string;
  depositReceived: number;
  taxRate: number;
  taxAmount: number;
  totalDue: number;
  groupValues: string[];
  groupField?: GroupField;
}

const parseMoney = (value: string | null) =>
  parseFloat(String(value || "").replace(/[$,]/g, "")) || 0;

export function parseSavedInvoice(html: string, items: BudgetItem[]): ParsedInvoiceData | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const page = doc.querySelector(".invoice-page");
  if (!page) return null;

  const q = (selector: string) => page.querySelector(selector);

  const brandLogoKey = q(".invoice-header img")?.getAttribute("src") || "";
  const brandName = q(".brand-name")?.textContent || "";
  const brandTagline = q(".brand-tagline")?.textContent || "";

  const infoSpans = page.querySelectorAll(".billing-info > div:last-child span");
  const invoiceNumber = infoSpans[0]?.textContent || "";
  const issueDate = infoSpans[1]?.textContent || "";
  const dueDate = infoSpans[2]?.textContent || "";
  const serviceDate = infoSpans[3]?.textContent || "";

  const projectTitleElement =
    q(".project-title") ||
    Array.from(page.querySelectorAll(".invoice-meta > div")).find((div) => {
      const text = (div.textContent || "").trim();
      return text.length > 0 && !text.includes(":");
    });
  const projectTitle = projectTitleElement?.textContent?.trim() || "";

  const summaryDivs = page.querySelectorAll(".summary > div");
  const summaryTexts = Array.from(summaryDivs).map((div) => div.textContent || "");
  const customerSummary = summaryTexts[0] || "";
  const paymentSummary = summaryTexts.slice(1).join("\n\n");

  const totalsContainer = page.querySelector(".totals");
  let depositReceived = 0;
  let taxRate = 0;
  let taxAmount = 0;
  let totalDue = 0;

  if (totalsContainer) {
    const depositEl = totalsContainer.querySelector('[data-row="deposit"] span');
    const taxEl = totalsContainer.querySelector('[data-row="tax"] span');
    const taxRow = totalsContainer.querySelector('[data-row="tax"]');
    const totalEl = totalsContainer.querySelector('[data-row="total"] span');

    if (depositEl) depositReceived = parseMoney(depositEl.textContent);
    if (taxEl) taxAmount = parseMoney(taxEl.textContent);
    if (taxRow?.getAttribute("data-rate")) {
      taxRate = parseFloat(taxRow.getAttribute("data-rate") || "0") || 0;
    } else if (taxRow?.textContent) {
      const match = taxRow.textContent.match(/Tax\s*\(([^)]+)%\)/i);
      if (match?.[1]) taxRate = parseFloat(match[1].replace(/[^0-9.-]/g, "")) || 0;
    }
    if (totalEl) totalDue = parseMoney(totalEl.textContent);
  }

  if (!totalsContainer) {
    const totals = page.querySelectorAll(".totals span");
    depositReceived = totals.length >= 2 ? parseMoney(totals[1]?.textContent || "") : 0;
    totalDue = totals.length >= 3 ? parseMoney(totals[2]?.textContent || "") : 0;
  }

  const notesElement = q(".payment-info-body");
  const notes = notesElement ? notesElement.innerHTML || "" : "";

  const parsedGroups = Array.from(doc.querySelectorAll(".group-header td")).map((td) =>
    (td.textContent || "").trim()
  );

  let detectedGroupField: GroupField | undefined;
  if (parsedGroups.length) {
    detectedGroupField = (groupFields.map((field) => field.value) as GroupField[]).find((field) => {
      const options = Array.from(
        new Set(
          items
            .map((item) => (String((item as BudgetItem)[field] || "")).trim())
            .filter(Boolean)
        )
      );
      return parsedGroups.every((group) => options.includes(group));
    });
  }

  return {
    brandLogoKey,
    brandName,
    brandTagline,
    invoiceNumber,
    issueDate,
    dueDate,
    serviceDate,
    projectTitle,
    customerSummary,
    paymentSummary,
    notes,
    depositReceived,
    taxRate,
    taxAmount,
    totalDue,
    groupValues: parsedGroups,
    groupField: detectedGroupField,
  };
}

export type { ParsedInvoiceData };
