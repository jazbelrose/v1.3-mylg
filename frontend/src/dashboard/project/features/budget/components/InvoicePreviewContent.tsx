import React, { Fragment, useMemo } from "react";

import { getFileUrl } from "@/shared/utils/api";
import PDFPreview from "@/dashboard/project/components/Shared/PDFPreview";

import styles from "./invoice-preview-modal.module.css";
import type { ProjectLike, RowData } from "./invoicePreviewTypes";
import { formatCurrency } from "./invoicePreviewUtils";

interface InvoicePreviewContentProps {
  invoiceRef: React.RefObject<HTMLDivElement>;
  previewRef: React.RefObject<HTMLDivElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  logoDataUrl: string | null;
  brandLogoKey: string;
  onLogoSelect: React.ChangeEventHandler<HTMLInputElement>;
  onLogoDrop: React.DragEventHandler<HTMLDivElement>;
  brandName: string;
  onBrandNameBlur: (value: string) => void;
  brandTagline: string;
  onBrandTaglineBlur: (value: string) => void;
  brandAddress: string;
  onBrandAddressBlur: (value: string) => void;
  brandPhone: string;
  onBrandPhoneBlur: (value: string) => void;
  useProjectAddress: boolean;
  onToggleProjectAddress: (checked: boolean) => void;
  project?: ProjectLike | null;
  invoiceNumber: string;
  onInvoiceNumberBlur: (value: string) => void;
  issueDate: string;
  onIssueDateBlur: (value: string) => void;
  dueDate: string;
  onDueDateChange: (value: string) => void;
  serviceDate: string;
  onServiceDateChange: (value: string) => void;
  projectTitle: string;
  onProjectTitleBlur: (value: string) => void;
  customerSummary: string;
  onCustomerSummaryBlur: (value: string) => void;
  invoiceSummary: string;
  onInvoiceSummaryBlur: (value: string) => void;
  paymentSummary: string;
  onPaymentSummaryBlur: (value: string) => void;
  rowsData: RowData[];
  currentPage: number;
  subtotal: number;
  depositReceived: number;
  onDepositBlur: (value: string) => void;
  totalDue: number;
  onTotalDueBlur: (value: string) => void;
  notes: string;
  onNotesBlur: (value: string) => void;
  inlinePdfUrl: string | null;
  pdfPreviewUrl: string | null;
  onClosePdfPreview: () => void;
}

const extractPlainText = (input: string): string => {
  if (!input) return "";
  if (typeof window === "undefined") {
    return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const div = window.document.createElement("div");
  div.innerHTML = input;
  return div.textContent || div.innerText || "";
};

const wrapNotesHtml = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return "";
  return lines.map((line) => `<p>${line}</p>`).join("");
};

const renderRows = (rows: RowData[], rowsKeyPrefix: string) => (
  <tbody>
    {rows.map((row, idx) =>
      row.type === "group" ? (
        <tr className="group-header" key={`g-${rowsKeyPrefix}-${idx}`}>
          <td colSpan={5}>{row.group}</td>
        </tr>
      ) : (
        <tr key={row.item.budgetItemId || `row-${rowsKeyPrefix}-${idx}`}>
          <td>{row.item.description || ""}</td>
          <td>{row.item.quantity || ""}</td>
          <td>{row.item.unit || ""}</td>
          <td>
            {formatCurrency(
              (parseFloat(String(row.item.itemFinalCost || 0)) || 0) /
                (parseFloat(String(row.item.quantity || 1)) || 1)
            )}
          </td>
          <td>
            {formatCurrency(parseFloat(String(row.item.itemFinalCost || 0)) || 0)}
          </td>
        </tr>
      )
    )}
  </tbody>
);

const InvoicePreviewContent: React.FC<InvoicePreviewContentProps> = ({
  invoiceRef,
  previewRef,
  fileInputRef,
  logoDataUrl,
  brandLogoKey,
  onLogoSelect,
  onLogoDrop,
  brandName,
  onBrandNameBlur,
  brandTagline,
  onBrandTaglineBlur,
  brandAddress,
  onBrandAddressBlur,
  brandPhone,
  onBrandPhoneBlur,
  useProjectAddress,
  onToggleProjectAddress,
  project,
  invoiceNumber,
  onInvoiceNumberBlur,
  issueDate,
  onIssueDateBlur,
  dueDate,
  onDueDateChange,
  serviceDate,
  onServiceDateChange,
  projectTitle,
  onProjectTitleBlur,
  customerSummary,
  onCustomerSummaryBlur,
  invoiceSummary,
  onInvoiceSummaryBlur,
  paymentSummary,
  onPaymentSummaryBlur,
  rowsData,
  currentPage,
  subtotal,
  depositReceived,
  onDepositBlur,
  totalDue,
  onTotalDueBlur,
  notes,
  onNotesBlur,
  inlinePdfUrl,
  pdfPreviewUrl,
  onClosePdfPreview,
}) => {
  const logoSrc = logoDataUrl || (brandLogoKey ? getFileUrl(brandLogoKey) : "");

  const brandAddressText = useProjectAddress
    ? project?.address || ""
    : brandAddress;

  const billingContact = project?.clientName || "Client Name";
  const billingCompany = project?.invoiceBrandName || "Client Company";
  const billingAddress =
    project?.invoiceBrandAddress || project?.clientAddress || "Client Address";
  const billingPhone = project?.invoiceBrandPhone || project?.clientPhone || "";
  const billingEmail = project?.clientEmail || "";

  const notesPlain = useMemo(() => extractPlainText(notes), [notes]);

  const handleNotesChange: React.ChangeEventHandler<HTMLTextAreaElement> = (e) => {
    onNotesBlur(wrapNotesHtml(e.target.value));
  };

  const renderHeader = () => (
    <div className="invoice-top">
      <div className="invoice-header">
        <div className="logo-upload">
          {logoSrc ? <img src={logoSrc} alt="Company logo" /> : <span>Upload Logo</span>}
        </div>
        <div className="company-block">
          <div className="company-info">
            <div className="brand-name">{brandName || project?.company || "Your Business Name"}</div>
            <div className="brand-tagline">{brandTagline || "Tagline"}</div>
            <div className="brand-address">{brandAddressText || "Business Address"}</div>
            <div className="brand-phone">{brandPhone || "Phone Number"}</div>
          </div>
          <div className="invoice-meta">
            <div className="invoice-title">Invoice</div>
            <div>
              Invoice #: <span>{invoiceNumber}</span>
            </div>
            <div>
              Issue date: <span>{issueDate}</span>
            </div>
            <div>
              Due date: <span>{dueDate}</span>
            </div>
            <div>
              Service date: <span>{serviceDate}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="billing-info">
        <div>
          <div className="billing-header">Bill To</div>
          <div>{billingContact}</div>
          <div>{billingCompany}</div>
          <div>{billingAddress}</div>
          {billingPhone ? <div>{billingPhone}</div> : null}
          {billingEmail ? <div>{billingEmail}</div> : null}
        </div>
        <div className="summary">
          <div>
            <div className="summary-header">Customer Summary</div>
            <div>{customerSummary}</div>
          </div>
          <div>
            <div className="summary-header">Invoice Summary</div>
            <div>{invoiceSummary}</div>
          </div>
          <div>
            <div className="summary-header">Payment Summary</div>
            <div>{paymentSummary}</div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSummary = (rows: RowData[], rowsKeyPrefix: string) => (
    <Fragment>
      <h1 className="project-title">{projectTitle}</h1>

      <div className="summary">
        <div className="summary-column">
          <div className="summary-header">Customer Summary</div>
          <div>{customerSummary}</div>
        </div>
        <div className="summary-column">
          <div className="summary-header">Invoice Summary</div>
          <div>{invoiceSummary}</div>
        </div>
        <div className="summary-column">
          <div className="summary-header">Payment Summary</div>
          <div>{paymentSummary}</div>
        </div>
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
          {renderRows(rows, rowsKeyPrefix)}
        </table>
      </div>
    </Fragment>
  );

  return (
    <div className={styles.previewWrapper} ref={previewRef}>
      {pdfPreviewUrl ? (
        <div className={styles.pdfPreviewOverlay}>
          <div className={styles.pdfPreviewHeader}>
            <span>PDF Preview</span>
            <button type="button" onClick={onClosePdfPreview}>
              Close
            </button>
          </div>
          <div className={styles.pdfPreviewCanvasWrapper}>
            <PDFPreview
              url={pdfPreviewUrl}
              page={Math.max(1, currentPage + 1)}
              className={styles.pdfPreviewCanvas}
            />
          </div>
        </div>
      ) : null}

      <div className={styles.pdfEditorLayout}>
        <div className={styles.pdfCanvasPanel}>
          {inlinePdfUrl ? (
            <PDFPreview
              url={inlinePdfUrl}
              page={Math.max(1, currentPage + 1)}
              className={styles.inlinePdfCanvas}
              scale={1.2}
            />
          ) : (
            <div className={styles.pdfPlaceholder} role="status">
              Generating PDF preview…
            </div>
          )}

          <div
            className={styles.logoDropZone}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onLogoDrop}
          >
            {logoSrc ? (
              <img src={logoSrc} alt="Invoice logo" />
            ) : (
              <span>Upload Logo</span>
            )}
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={onLogoSelect}
            />
          </div>
        </div>

        <div className={styles.pdfFormPanel}>
          <section>
            <h3>Brand Details</h3>
            <label>
              <span>Business name</span>
              <input
                value={brandName}
                onChange={(e) => onBrandNameBlur(e.target.value)}
                placeholder="Your Business Name"
              />
            </label>
            <label>
              <span>Tagline</span>
              <input
                value={brandTagline}
                onChange={(e) => onBrandTaglineBlur(e.target.value)}
                placeholder="Tagline"
              />
            </label>
            <label>
              <span>Business address</span>
              <textarea
                value={brandAddress}
                onChange={(e) => onBrandAddressBlur(e.target.value)}
                placeholder="Business Address"
                disabled={useProjectAddress}
              />
            </label>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={useProjectAddress}
                onChange={(e) => onToggleProjectAddress(e.target.checked)}
                disabled={!project?.address}
              />
              Use project address ({project?.address || "None"})
            </label>
            <label>
              <span>Phone</span>
              <input
                value={brandPhone}
                onChange={(e) => onBrandPhoneBlur(e.target.value)}
                placeholder="Phone Number"
              />
            </label>
          </section>

          <section>
            <h3>Invoice Details</h3>
            <label>
              <span>Invoice number</span>
              <input
                value={invoiceNumber}
                onChange={(e) => onInvoiceNumberBlur(e.target.value)}
              />
            </label>
            <label>
              <span>Issue date</span>
              <input
                value={issueDate}
                onChange={(e) => onIssueDateBlur(e.target.value)}
              />
            </label>
            <label>
              <span>Due date</span>
              <input
                value={dueDate}
                onChange={(e) => onDueDateChange(e.target.value)}
              />
            </label>
            <label>
              <span>Service date</span>
              <input
                value={serviceDate}
                onChange={(e) => onServiceDateChange(e.target.value)}
              />
            </label>
            <label>
              <span>Project title</span>
              <input
                value={projectTitle}
                onChange={(e) => onProjectTitleBlur(e.target.value)}
                placeholder="Project Title"
              />
            </label>
          </section>

          <section>
            <h3>Summaries</h3>
            <label>
              <span>Customer summary</span>
              <textarea
                value={customerSummary}
                onChange={(e) => onCustomerSummaryBlur(e.target.value)}
              />
            </label>
            <label>
              <span>Invoice summary</span>
              <textarea
                value={invoiceSummary}
                onChange={(e) => onInvoiceSummaryBlur(e.target.value)}
              />
            </label>
            <label>
              <span>Payment summary</span>
              <textarea
                value={paymentSummary}
                onChange={(e) => onPaymentSummaryBlur(e.target.value)}
              />
            </label>
          </section>

          <section>
            <h3>Totals & Notes</h3>
            <div className={styles.numberFields}>
              <label>
                <span>Subtotal</span>
                <input value={formatCurrency(subtotal)} readOnly />
              </label>
              <label>
                <span>Deposit received</span>
                <input
                  value={depositReceived ? depositReceived.toString() : ""}
                  onChange={(e) => onDepositBlur(e.target.value)}
                />
              </label>
              <label>
                <span>Total due</span>
                <input
                  value={totalDue ? totalDue.toString() : ""}
                  onChange={(e) => onTotalDueBlur(e.target.value)}
                />
              </label>
            </div>
            <label>
              <span>Notes</span>
              <textarea value={notesPlain} onChange={handleNotesChange} />
            </label>
          </section>
        </div>
      </div>

      <div className={styles.hiddenInvoicePreview} ref={invoiceRef} aria-hidden>
        <style id="invoice-preview-styles">{`
        @page { margin: 0; }
        body { margin: 0; }
        .invoice-container{background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;width:min(100%,210mm);max-width:210mm;box-sizing:border-box;margin:0 auto;padding:20px;overflow-x:hidden;}
        .invoice-page{width:min(100%,210mm);max-width:210mm;min-height:297mm;box-shadow:0 2px 6px rgba(0,0,0,0.15);margin:0 auto 20px;padding:20px 20px 60px;box-sizing:border-box;position:relative;overflow-x:hidden;display:flex;flex-direction:column;}
        .invoice-header{display:flex;align-items:flex-start;gap:20px;}
        .logo-upload{width:100px;height:100px;border:1px dashed #ccc;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .logo-upload img{max-width:100%;max-height:100%;object-fit:contain;}
        .company-block{flex:1;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;}
        .company-info{display:flex;flex-direction:column;margin-top:10px;}
        .brand-name{font-size:1.2rem;font-weight:bold;}
        .brand-tagline,.brand-address,.brand-phone{font-size:0.7rem;}
        .invoice-meta{text-align:right;font-size:0.85rem;}
        .billing-info{margin-top:20px;display:flex;justify-content:space-between;gap:20px;font-size:0.85rem;}
        .invoice-title{font-size:2rem;color:#FA3356;font-weight:bold;text-align:right;margin-left:auto;}
        .project-title{font-size:1.5rem;font-weight:bold;text-align:center;margin:10px 0;}
        .summary{display:flex;justify-content:space-between;gap:10px;margin-bottom:10px;}
        .summary>div{flex:1;}
        .summary-column{display:flex;flex-direction:column;gap:4px;}
        .items-table-wrapper{flex:1 0 auto;}
        .items-table{width:100%;border-collapse:collapse;margin-top:20px;box-sizing:border-box;}
        .items-table th,.items-table td{border:1px solid #ddd;padding:8px;text-align:left;font-size:0.85rem;}
        .items-table th:nth-child(2),.items-table th:nth-child(3),.items-table th:nth-child(4),.items-table th:nth-child(5),
        .items-table td:nth-child(2),.items-table td:nth-child(3),.items-table td:nth-child(4),.items-table td:nth-child(5){text-align:right;}
        .items-table .group-header td{background:#f5f5f5;font-weight:bold;}
        .bottom-block{margin-top:20px;display:flex;flex-direction:column;gap:16px;}
        .totals{align-self:flex-end;min-width:200px;display:flex;flex-direction:column;gap:6px;}
        .totals span{font-weight:bold;}
        .notes{font-size:0.85rem;line-height:1.4;}
        .footer{font-size:0.75rem;color:#666;}
        .pageNumber{position:absolute;bottom:20px;right:20px;font-size:0.75rem;color:#666;}
        .summary-divider{border:0;border-top:1px solid #ccc;margin-bottom:10px;}
      `}</style>
        <div className="invoice-container" data-preview-role="measure">
          <div className="invoice-page">
            {renderHeader()}
            {renderSummary(rowsData, "measure")}
            <div className="bottom-block">
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
              <div className="notes" dangerouslySetInnerHTML={{ __html: notes || "" }} />
              <div className="footer">{project?.company || "Company Name"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoicePreviewContent;
