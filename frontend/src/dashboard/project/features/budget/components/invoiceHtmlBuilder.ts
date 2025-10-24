import { formatCurrency } from "./invoicePreviewUtils";
import { getFileUrl } from "@/shared/utils/api";
import type { InvoicePreviewModalProps, RowData } from "./invoicePreviewTypes";

interface InvoiceHtmlBuilderOptions {
  pages: RowData[][];
  selectedPages: number[];
  brandName: string;
  brandLogoKey: string;
  logoDataUrl: string | null;
  project: InvoicePreviewModalProps["project"];
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  serviceDate: string;
  projectTitle: string;
  notes: string;
  depositReceived: number;
  subtotal: number;
  totalDue: number;
}

export function buildInvoiceHtml(options: InvoiceHtmlBuilderOptions): string {
  const {
    pages,
    selectedPages,
    brandName,
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
  } = options;
  const style = document.getElementById("invoice-preview-styles")?.innerHTML || "";
  const pageIndexes = selectedPages.length > 0 ? selectedPages : pages.map((_, index) => index);

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
      const logoSrc = logoDataUrl || (brandLogoKey ? getFileUrl(brandLogoKey) : "");

      const invNum = invoiceNumber || "0000";
      const issue = issueDate || new Date().toLocaleDateString();
      const due = dueDate || "";
      const service = serviceDate || "";

      const billContact = project?.clientName || "Client Name";
      const billCompany = project?.invoiceBrandName || "Client Company";
      const billAddress = project?.invoiceBrandAddress || project?.clientAddress || "Client Address";
      const billPhone = project?.invoiceBrandPhone || project?.clientPhone || "";
      const billEmail = project?.clientEmail || "";

      const projTitle = projectTitle || project?.title || "";
      const projTitleMeta = projectTitle || project?.title || "";
      const notesText = notes || "";

      const deposit = formatCurrency(depositReceived);
      const total = formatCurrency(totalDue);

      const logoHtml = logoSrc
        ? `<img src="${logoSrc}" alt="logo" />`
        : `<span>Upload Logo</span>`;

      const totalsHtml =
        idx === pages.length - 1
          ? `<div class="bottom-block">
               <div class="totals">
                 <div>Subtotal: <span>${formatCurrency(subtotal)}</span></div>
                 <div>Deposit received: <span>${deposit}</span></div>
                 <div><strong>Total Due: <span>${total}</span></strong></div>
               </div>
               <div class="notes">${notesText}</div>
               <div class="footer">${projTitle}</div>
             </div>`
          : "";

      const headerDetailsHtml = idx === 0
        ? `<div class="header-bottom">
                <div class="bill-to">
                  <strong>Billed To:</strong>
                  <div>${billContact}</div>
                  <div>${billCompany}</div>
                  <div>${billAddress}</div>
                  ${billPhone ? `<div>${billPhone}</div>` : ""}
                  ${billEmail ? `<div>${billEmail}</div>` : ""}
                </div>
                <div class="invoice-meta">
                  ${invNum ? `<div>Invoice #: <span>${invNum}</span></div>` : ""}
                  ${projTitleMeta ? `<div>${projTitleMeta}</div>` : ""}
                  ${issue ? `<div>Issue date: <span>${issue}</span></div>` : ""}
                  ${due ? `<div>Due date: <span>${due}</span></div>` : ""}
                  ${service ? `<div>Service date: <span>${service}</span></div>` : ""}
                </div>
              </div>
              <hr class="invoice-divider" />`
        : "";

      return `
        <div class="invoice-page invoice-container">
          <div class="invoice-top">
            <div class="invoice-header">
              <div class="header-top">
                <div class="brand-section">
                  <div class="logo-upload">${logoHtml}</div>
                  ${headerName ? `<div class="brand-name">${headerName}</div>` : ""}
                </div>
                <div class="invoice-title">INVOICE</div>
              </div>
              <hr class="invoice-divider" />
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
