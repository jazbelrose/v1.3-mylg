import React from "react";

import type { ProjectLike, RowData } from "./invoicePreviewTypes";
import { formatCurrency } from "./invoicePreviewUtils";

interface InvoiceDocumentProps {
  logoSrc: string | null;
  brandName: string;
  brandTagline: string;
  brandAddress: string;
  brandPhone: string;
  useProjectAddress: boolean;
  project?: ProjectLike | null;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  serviceDate: string;
  projectTitle: string;
  customerSummary: string;
  invoiceSummary: string;
  paymentSummary: string;
  rows: RowData[];
  subtotal: number;
  depositReceived: number;
  totalDue: number;
  notesHtml: string;
  pageIndex: number;
  pageCount: number;
  showTotals: boolean;
  showNotes: boolean;
  footerText: string;
  className?: string;
  "data-preview-role"?: string;
}

const InvoiceDocument: React.FC<InvoiceDocumentProps> = ({
  logoSrc,
  brandName,
  brandTagline,
  brandAddress,
  brandPhone,
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
  rows,
  subtotal,
  depositReceived,
  totalDue,
  notesHtml,
  pageIndex,
  pageCount,
  showTotals,
  showNotes,
  footerText,
  className,
  "data-preview-role": dataPreviewRole,
}) => {
  const displayBrandName = brandName || project?.company || "Your Business Name";
  const displayTagline = brandTagline || "Tagline";
  const displayAddress = useProjectAddress
    ? project?.address || "Project Address"
    : brandAddress || "Business Address";
  const displayPhone = brandPhone || "Phone Number";
  const displayInvoiceNumber = invoiceNumber || "0000";
  const displayIssueDate = issueDate || new Date().toLocaleDateString();

  const billToName = project?.clientName || "Client name";
  const billToAddress = project?.clientAddress || "Client address";
  const billToEmail = project?.clientEmail || "";
  const billToPhone = project?.clientPhone || "";

  const projectDisplayTitle = projectTitle || "Project Title";
  const summaryCustomer = customerSummary || "Customer";
  const summaryInvoice = invoiceSummary || "Invoice Details";
  const summaryPayment = paymentSummary || "Payment";

  const footer = footerText || project?.company || "Company Name";

  return (
    <div
      className={`invoice-page invoice-container${className ? ` ${className}` : ""}`}
      data-preview-role={dataPreviewRole}
    >
      <div className="invoice-top">
        <header className="invoice-header">
          <div className="logo-upload">
            {logoSrc ? <img src={logoSrc} alt="Company logo" /> : <span>Upload Logo</span>}
          </div>

          <div className="company-block">
            <div className="company-info">
              <div className="brand-name">{displayBrandName}</div>
              {displayTagline ? <div className="brand-tagline">{displayTagline}</div> : null}
              {displayAddress ? <div className="brand-address">{displayAddress}</div> : null}
              {displayPhone ? <div className="brand-phone">{displayPhone}</div> : null}
              {project?.address ? (
                <div className="brand-toggle">
                  {useProjectAddress ? "Using project address" : "Using saved address"}
                </div>
              ) : null}
            </div>

            <div className="invoice-meta">
              <div className="invoice-title">Invoice</div>
              <div>
                Invoice #: <span>{displayInvoiceNumber}</span>
              </div>
              <div>
                Issue date: <span>{displayIssueDate}</span>
              </div>
              {dueDate ? (
                <div>
                  Due date: <span>{dueDate}</span>
                </div>
              ) : null}
              {serviceDate ? (
                <div>
                  Service date: <span>{serviceDate}</span>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className="billing-info">
          <div>
            <strong>Bill To:</strong>
            <div>{billToName}</div>
            <div>{billToAddress}</div>
            {billToEmail ? <div>{billToEmail}</div> : null}
            {billToPhone ? <div>{billToPhone}</div> : null}
          </div>
          <div>
            <strong>Project:</strong>
            <div>{project?.title || projectDisplayTitle}</div>
            {project?.projectId ? <div>{`ID: ${project.projectId}`}</div> : null}
          </div>
        </div>
      </div>

      <h1 className="project-title">{projectDisplayTitle}</h1>

      <div className="summary">
        <div>{summaryCustomer}</div>
        <div>{summaryInvoice}</div>
        <div>{summaryPayment}</div>
      </div>

      <hr className="summary-divider" />

      <div className="items-table-wrapper">
        <table className="items-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>QTY</th>
              <th>Unit</th>
              <th>Unit Price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) =>
              row.type === "group" ? (
                <tr className="group-header" key={`group-${idx}`}>
                  <td colSpan={5}>{row.group}</td>
                </tr>
              ) : (
                <tr key={row.item.budgetItemId || `row-${idx}`}>
                  <td>{row.item.description || ""}</td>
                  <td>{row.item.quantity || ""}</td>
                  <td>{row.item.unit || ""}</td>
                  <td>
                    {formatCurrency(
                      (parseFloat(String(row.item.itemFinalCost || 0)) || 0) /
                        (parseFloat(String(row.item.quantity || 1)) || 1)
                    )}
                  </td>
                  <td>{formatCurrency(parseFloat(String(row.item.itemFinalCost || 0)) || 0)}</td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      {showTotals || showNotes ? (
        <div className="bottom-block">
          {showTotals ? (
            <div className="totals">
              <div>
                Subtotal: <span>{formatCurrency(subtotal)}</span>
              </div>
              <div>
                Deposit received: <span>{formatCurrency(depositReceived)}</span>
              </div>
              <div>
                <strong>
                  Total Due: <span>{formatCurrency(totalDue)}</span>
                </strong>
              </div>
            </div>
          ) : null}

          {showNotes ? (
            <div className="notes" dangerouslySetInnerHTML={{ __html: notesHtml }} />
          ) : null}

          <div className="footer">{footer}</div>
        </div>
      ) : null}

      <div className="pageNumber">Page {pageIndex + 1} of {pageCount}</div>
    </div>
  );
};

export default InvoiceDocument;
