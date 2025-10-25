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
  invoiceSummary: string;
  paymentSummary: string;
  notes: string;
  depositReceived: number;
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
  const customerSummary = summaryDivs[0]?.textContent || "";
  const invoiceSummary = summaryDivs[1]?.textContent || "";
  const paymentSummary = summaryDivs[2]?.textContent || "";

  const totals = page.querySelectorAll(".totals span");
  const depositReceived = totals.length >= 2 ? parseMoney(totals[1]?.textContent || "") : 0;
  const totalDue = totals.length >= 3 ? parseMoney(totals[2]?.textContent || "") : 0;

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
    invoiceSummary,
    paymentSummary,
    notes,
    depositReceived,
    totalDue,
    groupValues: parsedGroups,
    groupField: detectedGroupField,
  };
}

export type { ParsedInvoiceData };
