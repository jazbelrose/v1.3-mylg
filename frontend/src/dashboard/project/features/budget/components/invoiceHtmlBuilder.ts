import { formatCurrency } from "./invoicePreviewUtils";
import { getFileUrl } from "@/shared/utils/api";
import type { InvoicePreviewModalProps, RowData } from "./invoicePreviewTypes";

interface InvoiceHtmlBuilderOptions {
  pages: RowData[][];
  selectedPages: number[];
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

export function buildInvoiceHtml({
  pages,
  selectedPages,
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
}: InvoiceHtmlBuilderOptions): string {
  const style = document.getElementById("invoice-preview-styles")?.innerHTML || "";
  const pageIndexes = selectedPages.length > 0 ? selectedPages : pages.map((_, index) => index);

  const totalPageCount = pageIndexes.length;

  const htmlPages = pageIndexes
    .map((pageIndex, orderIndex) => {
      const pageRows = pages[pageIndex] || [];
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

      const headerName = brandName || project?.company || "Company Name";
      const headerAddress = useProjectAddress ? project?.address || "Address" : brandAddress || "Address";
      const headerPhone = brandPhone || "Phone";
      const headerTag = brandTagline || "";
      const logoSrc = logoDataUrl || (brandLogoKey ? getFileUrl(brandLogoKey) : "");

      const invNum = invoiceNumber || "";
      const issue = issueDate || "";
      const due = dueDate || "";
      const service = serviceDate || "";

      const billContact = project?.clientName || "Client Name";
      const billCompany = project?.invoiceBrandName || "Client Company";
      const billAddress = project?.invoiceBrandAddress || project?.clientAddress || "Client Address";
      const billPhone = project?.invoiceBrandPhone || project?.clientPhone || "";
      const billEmail = project?.clientEmail || "";

      const projTitle = projectTitle || "";
      const custSum = customerSummary || "";
      const invSum = invoiceSummary || "";
      const paySum = paymentSummary || "";
      const notesText = notes || "";

      const deposit = formatCurrency(depositReceived);
      const total = formatCurrency(totalDue);

      const logoHtml = logoSrc
        ? `<img src="${logoSrc}" alt="logo" style="max-width:100px;max-height:100px" />`
        : "";

      const totalsHtml =
        pageIndex === pages.length - 1
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

      return `
        <div class="invoice-page invoice-container">
          <div class="invoice-top">
            <div class="invoice-header">
              <div>${logoHtml}</div>
              <div class="company-info">
                <div class="brand-name">${headerName}</div>
                ${headerTag ? `<div class="brand-tagline">${headerTag}</div>` : ""}
                <div class="brand-address">${headerAddress}</div>
                <div class="brand-phone">${headerPhone}</div>
              </div>
              <div class="invoice-title">INVOICE</div>
            </div>
            <div class="billing-info">
              <div>
                <strong>Bill To:</strong>
                <div>${billContact}</div>
                <div>${billCompany}</div>
                <div>${billAddress}</div>
                ${billPhone ? `<div>${billPhone}</div>` : ""}
                ${billEmail ? `<div>${billEmail}</div>` : ""}
              </div>
              <div>
                <div>Invoice #: <span>${invNum}</span></div>
                <div>Issue date: <span>${issue}</span></div>
                <div>Due date: <span>${due}</span></div>
                <div>Service date: <span>${service}</span></div>
              </div>
            </div>
          </div>
          <h1 class="project-title">${projTitle}</h1>
          <div class="summary"><div>${custSum}</div><div>${invSum}</div><div>${paySum}</div></div>
          <hr class="summary-divider" />
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
          <div class="pageNumber">Page ${orderIndex + 1} of ${totalPageCount}</div>
        </div>
      `;
    })
    .join("");

  const title = invoiceNumber ? `Invoice ${invoiceNumber}` : "Invoice";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>${style}</style></head><body>${htmlPages}</body></html>`;
}
