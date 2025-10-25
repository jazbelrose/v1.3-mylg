import { formatCurrency, formatPercent } from "./invoicePreviewUtils";
import { getFileUrl } from "@/shared/utils/api";
import {
  DEFAULT_CUSTOMER_SUMMARY,
  DEFAULT_INVOICE_SUMMARY,
  splitSummaryLines,
} from "./invoiceSummaryUtils";
import type {
  InvoicePreviewModalProps,
  OrganizationInfoLine,
  RowData,
} from "./invoicePreviewTypes";

interface InvoiceHtmlBuilderOptions {
  pages: RowData[][];
  selectedPages: number[];
  brandName: string;
  brandTagline: string;
  brandLogoKey: string;
  logoDataUrl: string | null;
  project: InvoicePreviewModalProps["project"];
  invoiceNumber: string;
  issueDate: string;
  projectTitle: string;
  customerSummary: string;
  invoiceSummary: string;
  notes: string;
  depositReceived: number;
  taxRate: number;
  taxAmount: number;
  subtotal: number;
  totalDue: number;
  organizationLines: OrganizationInfoLine[];
}

export function buildInvoiceHtml(options: InvoiceHtmlBuilderOptions): string {
  const {
    pages,
    selectedPages,
    brandName,
    brandTagline,
    brandLogoKey,
    logoDataUrl,
    project,
    invoiceNumber,
    issueDate,
    projectTitle,
    customerSummary,
    invoiceSummary,
    notes,
    depositReceived,
    taxRate,
    taxAmount,
    subtotal,
    totalDue,
    organizationLines,
  } = options;
  const style = document.getElementById("invoice-preview-styles")?.innerHTML || "";
  const pageIndexes = selectedPages.length > 0 ? selectedPages : pages.map((_, index) => index);

  const escapeHtml = (input: string): string =>
    input
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const customerSummaryLines = splitSummaryLines(customerSummary, DEFAULT_CUSTOMER_SUMMARY);
  const invoiceSummaryLines = splitSummaryLines(invoiceSummary, DEFAULT_INVOICE_SUMMARY);

  const htmlPages = pageIndexes
    .map((idx) => {
      const pageRows = pages[idx] || [];
      const rowsHtml = pageRows
        .map((row) =>
          row.type === "group"
            ? `<tr class="group-header"><td colSpan="5">${row.group}</td></tr>`
            : `<tr>
                 <td>${row.item.description || ""}</td>
                 <td>${row.item.quantity || ""}</td>
                 <td>${row.item.unit || ""}</td>
                 <td>${formatCurrency(
                   (parseFloat(String(row.item.itemFinalCost || 0)) || 0) /
                     (parseFloat(String(row.item.quantity || 1)) || 1)
                 )}</td>
                 <td>${formatCurrency(parseFloat(String(row.item.itemFinalCost || 0)) || 0)}</td>
               </tr>`
        )
        .join("");

      const headerName = brandName.trim();
      const headerTagline = brandTagline.trim();
      const logoSrc = logoDataUrl || (brandLogoKey ? getFileUrl(brandLogoKey) : "");

      const invNum = invoiceNumber || "0000";
      const issue = issueDate || new Date().toLocaleDateString();

      const projTitleMeta = projectTitle || project?.title || "";
      const notesText = notes || "";
      const organizationHtmlLines = organizationLines
        .filter((line) => !line.isPlaceholder)
        .map((line) => {
          const classList = ["organization-line"];
          if (line.isBold) classList.push("organization-name");
          const classAttr = classList.join(" ");
          return `<div class="${classAttr}">${line.text}</div>`;
        })
        .join("");

      const deposit = formatCurrency(depositReceived);
      const taxDisplayRate = formatPercent(taxRate);
      const tax = formatCurrency(taxAmount);
      const total = formatCurrency(totalDue);

      const logoHtml = logoSrc
        ? `<img src="${logoSrc}" alt="logo" />`
        : `<span>Upload Logo</span>`;

      const organizationHtml = `<div class="organization-info-column">${organizationHtmlLines}</div>`;

      const totalsHtml =
        idx === pages.length - 1
          ? `<div class="bottom-block">
               <div class="totals">
                 <div class="totals-row totals-subtotal" data-row="subtotal">Subtotal: <span>${formatCurrency(subtotal)}</span></div>
                 <div class="totals-row totals-deposit" data-row="deposit">Deposit received: <span>${deposit}</span></div>
                 <div class="totals-row totals-tax" data-row="tax" data-rate="${taxRate}">Tax (${taxDisplayRate}%): <span>${tax}</span></div>
                 <div class="totals-divider" aria-hidden="true"></div>
                 <div class="totals-row totals-total" data-row="total"><strong>Total Due: <span>${total}</span></strong></div>
               </div>
               <div class="payment-footer">
               <div class="payment-info-column">
                  <div class="payment-info-title">Payment Information</div>
                  <div class="payment-info-body">${notesText}</div>
                </div>
                <div class="payment-spacer-column"></div>
                 ${organizationHtml}
              </div>
            </div>`
          : "";

      const customerSummaryHtml = customerSummaryLines
        .map((line) => `<div>${escapeHtml(line)}</div>`)
        .join("");
      const invoiceSummaryHtml = invoiceSummaryLines
        .map((line) => `<div>${escapeHtml(line)}</div>`)
        .join("");

      const headerDetailsHtml = idx === 0
        ? `<hr class="header-divider" />
            <div class="header-bottom">
                <div class="bill-to">
                  <strong>Billed To:</strong>
                  ${customerSummaryHtml}
                </div>
                <div class="invoice-meta">
                  ${invoiceSummaryHtml}
                  ${invNum ? `<div>Invoice #: <span>${invNum}</span></div>` : ""}
                  ${projTitleMeta ? `<div>${projTitleMeta}</div>` : ""}
                  ${issue ? `<div>Issue date: <span>${issue}</span></div>` : ""}
                </div>
              </div>`
        : "";

      return `
        <div class="invoice-page invoice-container">
          <div class="invoice-top">
            <div class="invoice-header">
              <div class="header-top">
                <div class="brand-section">
                  <div class="logo-upload">${logoHtml}</div>
                  ${headerName ? `<div class="brand-name">${headerName}</div>` : ""}
                  ${headerTagline ? `<div class="brand-tagline">${headerTagline}</div>` : ""}
                </div>
                <div class="invoice-title">INVOICE</div>
              </div>
              ${headerDetailsHtml}
            </div>
          </div>
          <div class="items-table-wrapper">
            <table class="items-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>QTY</th>
                  <th>Unit</th>
                  <th>Unit Price</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
          ${totalsHtml}
          <div class="pageNumber">Page ${idx + 1} of ${pages.length}</div>
        </div>
      `;
    })
    .join("");

  const title = invoiceNumber ? `Invoice ${invoiceNumber}` : "Invoice";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>${style}</style></head><body>${htmlPages}</body></html>`;
}
