import type { BudgetItem, GroupField } from "../invoicePreviewTypes";

interface ParsedInvoiceData {
  brandLogoKey: string;
  brandName: string;
  brandAddress: string;
  brandPhone: string;
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
  groupField?: GroupField;
  groupValues: string[];
}

export function parseInvoiceHtml(
  html: string,
  items: BudgetItem[],
  availableGroupFields: GroupField[]
): ParsedInvoiceData | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const page = doc.querySelector(".invoice-page");
  if (!page) return null;

  const q = (sel: string) => page.querySelector(sel);

  const brandLogoKey = q(".invoice-header img")?.getAttribute("src") || "";
  const brandName = q(".brand-name")?.textContent || "";
  const brandAddress = q(".brand-address")?.textContent || "";
  const brandPhone = q(".brand-phone")?.textContent || "";
  const brandTagline = q(".brand-tagline")?.textContent || "";

  const infoSpans = page.querySelectorAll(".billing-info > div:last-child span");
  const invoiceNumber = infoSpans[0]?.textContent || "";
  const issueDate = infoSpans[1]?.textContent || "";
  const dueDate = infoSpans[2]?.textContent || "";
  const serviceDate = infoSpans[3]?.textContent || "";

  const projectTitle = q(".project-title")?.textContent || "";

  const summaryDivs = page.querySelectorAll(".summary > div");
  const customerSummary = summaryDivs[0]?.textContent || "";
  const invoiceSummary = summaryDivs[1]?.textContent || "";
  const paymentSummary = summaryDivs[2]?.textContent || "";

  const totals = page.querySelectorAll(".totals span");
  const parseMoney = (v: string | null) => parseFloat(String(v || "").replace(/[$,]/g, "")) || 0;
  const depositReceived = totals.length >= 2 ? parseMoney(totals[1]?.textContent) : 0;
  const totalDue = totals.length >= 3 ? parseMoney(totals[2]?.textContent) : 0;

  const notesEl = q(".notes");
  const notes = notesEl ? notesEl.innerHTML || "" : "";

  const parsedGroups = Array.from(doc.querySelectorAll(".group-header td")).map((td) =>
    (td.textContent || "").trim()
  );

  let groupField: GroupField | undefined;
  if (parsedGroups.length) {
    groupField = availableGroupFields.find((field) => {
      const opts = Array.from(
        new Set(
          items
            .map((it) => (String((it as BudgetItem)[field] || "")).trim())
            .filter(Boolean)
        )
      );
      return parsedGroups.every((g) => opts.includes(g));
    });
  }

  return {
    brandLogoKey,
    brandName,
    brandAddress,
    brandPhone,
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
    groupField,
    groupValues: parsedGroups,
  };
}
