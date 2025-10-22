import React, { useMemo } from "react";

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
  onBrandNameChange: (value: string) => void;
  brandTagline: string;
  onBrandTaglineChange: (value: string) => void;
  brandAddress: string;
  onBrandAddressChange: (value: string) => void;
  brandPhone: string;
  onBrandPhoneChange: (value: string) => void;
  useProjectAddress: boolean;
  onToggleProjectAddress: (checked: boolean) => void;
  project?: ProjectLike | null;
  invoiceNumber: string;
  onInvoiceNumberChange: (value: string) => void;
  issueDate: string;
  onIssueDateChange: (value: string) => void;
  dueDate: string;
  onDueDateChange: (value: string) => void;
  serviceDate: string;
  onServiceDateChange: (value: string) => void;
  projectTitle: string;
  onProjectTitleChange: (value: string) => void;
  customerSummary: string;
  onCustomerSummaryChange: (value: string) => void;
  invoiceSummary: string;
  onInvoiceSummaryChange: (value: string) => void;
  paymentSummary: string;
  onPaymentSummaryChange: (value: string) => void;
  rowsData: RowData[];
  currentPage: number;
  totalPages: number;
  subtotal: number;
  depositReceived: number;
  onDepositChange: (value: number) => void;
  totalDue: number;
  onTotalDueChange: (value: number) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  pdfPreviewUrl: string | null;
  isPdfLoading: boolean;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const htmlToPlainText = (html: string): string => {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>(\n)?/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const plainTextToHtml = (text: string): string => {
  if (!text) return "";
  return text
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
};

const InvoicePreviewContent: React.FC<InvoicePreviewContentProps> = ({
  invoiceRef,
  previewRef,
  fileInputRef,
  logoDataUrl,
  brandLogoKey,
  onLogoSelect,
  onLogoDrop,
  brandName,
  onBrandNameChange,
  brandTagline,
  onBrandTaglineChange,
  brandAddress,
  onBrandAddressChange,
  brandPhone,
  onBrandPhoneChange,
  useProjectAddress,
  onToggleProjectAddress,
  project,
  invoiceNumber,
  onInvoiceNumberChange,
  issueDate,
  onIssueDateChange,
  dueDate,
  onDueDateChange,
  serviceDate,
  onServiceDateChange,
  projectTitle,
  onProjectTitleChange,
  customerSummary,
  onCustomerSummaryChange,
  invoiceSummary,
  onInvoiceSummaryChange,
  paymentSummary,
  onPaymentSummaryChange,
  rowsData,
  currentPage,
  totalPages,
  subtotal,
  depositReceived,
  onDepositChange,
  totalDue,
  onTotalDueChange,
  notes,
  onNotesChange,
  pdfPreviewUrl,
  isPdfLoading,
}) => {
  const logoSrc = logoDataUrl || (brandLogoKey ? getFileUrl(brandLogoKey) : "");
  const brandDisplayName = brandName || project?.company || "Your Business Name";
  const brandTaglineDisplay = brandTagline || "Tagline";
  const brandAddressDisplay = useProjectAddress
    ? project?.address || "Address"
    : brandAddress || "Address";
  const brandPhoneDisplay = brandPhone || "Phone";

  const billToName = project?.clientName || "Client Name";
  const billToCompany = project?.invoiceBrandName || project?.company || "Client Company";
  const billToAddress = project?.invoiceBrandAddress || project?.clientAddress || "Client Address";
  const billToPhone = project?.invoiceBrandPhone || project?.clientPhone || "";
  const billToEmail = project?.clientEmail || "";

  const notesPlainText = useMemo(() => htmlToPlainText(notes), [notes]);

  const renderSummary = (rows: RowData[], key: string) => (
    <div key={key} className="items-table-wrapper">
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
              <tr key={`${key}-group-${idx}`} className="group-header">
                <td colSpan={5}>{row.group}</td>
              </tr>
            ) : (
              <tr key={`${key}-item-${idx}`}>
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
  );

  return (
    <div className={styles.previewWrapper} ref={previewRef}>
      <style id="invoice-preview-styles">{`
        @page { margin: 0; }
        body { margin: 0; }
        .invoice-container{background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;width:min(100%,210mm);max-width:210mm;box-sizing:border-box;margin:0 auto;padding:20px;overflow-x:hidden;}
        .invoice-page{width:min(100%,210mm);max-width:210mm;min-height:297mm;box-shadow:0 2px 6px rgba(0,0,0,0.15);margin:0 auto 20px;padding:20px 20px 60px;box-sizing:border-box;position:relative;overflow-x:hidden;display:flex;flex-direction:column;}
        .invoice-header{display:flex;align-items:flex-start;gap:20px;}
        .logo-upload{width:100px;height:100px;border:1px dashed #ccc;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .logo-upload img{max-width:100%;max-height:100%;}
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
        .summary-divider{border:0;border-top:1px solid #ccc;margin-bottom:10px;}
        .items-table-wrapper{flex:1 0 auto;}
        .items-table{width:100%;border-collapse:collapse;margin-top:20px;box-sizing:border-box;}
        .items-table th,.items-table td{border:1px solid #ddd;padding:8px;}
        .items-table th{background:#f5f5f5;text-align:left;}
        .group-header{background:#fafafa;font-weight:bold;}
        .bottom-block{margin-top:auto;margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;margin-bottom:40px;}
        .totals{margin-top:20px;margin-left:auto;}
        .notes{margin-top:20px;}
        .footer{margin-top:40px;font-size:0.9rem;color:#666;}
        .pageNumber{position:absolute;bottom:10px;left:0;right:0;text-align:center;font-family:'Roboto',Arial,sans-serif;font-size:0.85rem;color:#666;font-weight:normal;pointer-events:none;user-select:none;}
      `}</style>

      <div
        className="invoice-page invoice-container"
        ref={invoiceRef}
        data-preview-role="measure"
        style={{ position: "absolute", visibility: "hidden", pointerEvents: "none" }}
      >
        <div className="invoice-top">
          <header className="invoice-header">
            <div className="logo-upload" aria-label="Company logo">
              {logoSrc ? <img src={logoSrc} alt="Company logo" /> : <span>Upload Logo</span>}
            </div>

            <div className="company-block">
              <div className="company-info">
                <div className="brand-name">{brandDisplayName}</div>
                <div className="brand-tagline">{brandTaglineDisplay}</div>
                <div className="brand-address">{brandAddressDisplay}</div>
                <div className="brand-phone">{brandPhoneDisplay}</div>
              </div>

              <div className="invoice-meta">
                <div className="invoice-title">INVOICE</div>
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
          </header>

          <div className="billing-info">
            <div>
              <strong>Bill To:</strong>
              <div>{billToName}</div>
              <div>{billToCompany}</div>
              <div>{billToAddress}</div>
              {billToPhone ? <div>{billToPhone}</div> : null}
              {billToEmail ? <div>{billToEmail}</div> : null}
            </div>
            <div>
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

        <h1 className="project-title">{projectTitle}</h1>

        <div className="summary">
          <div>{customerSummary}</div>
          <div>{invoiceSummary}</div>
          <div>{paymentSummary}</div>
        </div>

        <hr className="summary-divider" />

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

          <div className="notes" dangerouslySetInnerHTML={{ __html: notes }} />

          <div className="footer">{project?.company || "Company Name"}</div>
        </div>

        <div className="pageNumber">Page {currentPage + 1} of {totalPages || 1}</div>
      </div>

      <div className={styles.pdfEditorLayout}>
        <div className={styles.pdfPane}>
          {isPdfLoading ? (
            <div className={styles.pdfPlaceholder}>Generating PDF…</div>
          ) : pdfPreviewUrl ? (
            <PDFPreview
              url={pdfPreviewUrl}
              page={Math.max(1, currentPage + 1)}
              className={styles.pdfCanvas}
            />
          ) : (
            <div className={styles.pdfPlaceholder}>Unable to render PDF</div>
          )}
          <div className={styles.pageIndicator}>
            Page {currentPage + 1} of {totalPages || 1}
          </div>
        </div>

        <div className={styles.editorPane}>
          <section className={styles.formSection}>
            <h3>Brand</h3>
            <div className={styles.logoEditor}>
              <div
                className={styles.logoDrop}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onLogoDrop}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    fileInputRef.current?.click();
                  }
                }}
              >
                {logoSrc ? <img src={logoSrc} alt="Company logo" /> : <span>Upload Logo</span>}
              </div>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={onLogoSelect}
              />
              <button type="button" className={styles.secondaryButton} onClick={() => fileInputRef.current?.click()}>
                Choose Logo
              </button>
            </div>

            <label className={styles.formField} htmlFor="brand-name-input">
              <span>Brand Name</span>
              <input
                id="brand-name-input"
                value={brandName}
                onChange={(e) => onBrandNameChange(e.target.value)}
                placeholder={project?.company || "Brand Name"}
              />
            </label>

            <label className={styles.formField} htmlFor="brand-tagline-input">
              <span>Tagline</span>
              <input
                id="brand-tagline-input"
                value={brandTagline}
                onChange={(e) => onBrandTaglineChange(e.target.value)}
                placeholder="Tagline"
              />
            </label>

            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={useProjectAddress}
                onChange={(e) => onToggleProjectAddress(e.target.checked)}
              />
              Use project address
            </label>

            <label className={styles.formField} htmlFor="brand-address-input">
              <span>Address</span>
              <textarea
                id="brand-address-input"
                value={brandAddress}
                onChange={(e) => onBrandAddressChange(e.target.value)}
                placeholder="Brand address"
                disabled={useProjectAddress}
                rows={3}
              />
              {useProjectAddress ? (
                <small className={styles.helperText}>
                  Using project address: {project?.address || "Address"}
                </small>
              ) : null}
            </label>

            <label className={styles.formField} htmlFor="brand-phone-input">
              <span>Phone</span>
              <input
                id="brand-phone-input"
                value={brandPhone}
                onChange={(e) => onBrandPhoneChange(e.target.value)}
                placeholder="Phone"
              />
            </label>
          </section>

          <section className={styles.formSection}>
            <h3>Invoice Details</h3>
            <label className={styles.formField} htmlFor="invoice-number-input">
              <span>Invoice Number</span>
              <input
                id="invoice-number-input"
                value={invoiceNumber}
                onChange={(e) => onInvoiceNumberChange(e.target.value)}
                placeholder="0000"
              />
            </label>

            <label className={styles.formField} htmlFor="issue-date-input">
              <span>Issue Date</span>
              <input
                id="issue-date-input"
                value={issueDate}
                onChange={(e) => onIssueDateChange(e.target.value)}
                placeholder="MM/DD/YYYY"
              />
            </label>

            <label className={styles.formField} htmlFor="due-date-input">
              <span>Due Date</span>
              <input
                id="due-date-input"
                value={dueDate}
                onChange={(e) => onDueDateChange(e.target.value)}
                placeholder="MM/DD/YYYY"
              />
            </label>

            <label className={styles.formField} htmlFor="service-date-input">
              <span>Service Date</span>
              <input
                id="service-date-input"
                value={serviceDate}
                onChange={(e) => onServiceDateChange(e.target.value)}
                placeholder="MM/DD/YYYY"
              />
            </label>
          </section>

          <section className={styles.formSection}>
            <h3>Summaries</h3>
            <label className={styles.formField} htmlFor="project-title-input">
              <span>Project Title</span>
              <input
                id="project-title-input"
                value={projectTitle}
                onChange={(e) => onProjectTitleChange(e.target.value)}
                placeholder="Project Title"
              />
            </label>

            <label className={styles.formField} htmlFor="customer-summary-input">
              <span>Customer Summary</span>
              <textarea
                id="customer-summary-input"
                value={customerSummary}
                onChange={(e) => onCustomerSummaryChange(e.target.value)}
                rows={3}
              />
            </label>

            <label className={styles.formField} htmlFor="invoice-summary-input">
              <span>Invoice Summary</span>
              <textarea
                id="invoice-summary-input"
                value={invoiceSummary}
                onChange={(e) => onInvoiceSummaryChange(e.target.value)}
                rows={3}
              />
            </label>

            <label className={styles.formField} htmlFor="payment-summary-input">
              <span>Payment Summary</span>
              <textarea
                id="payment-summary-input"
                value={paymentSummary}
                onChange={(e) => onPaymentSummaryChange(e.target.value)}
                rows={3}
              />
            </label>
          </section>

          <section className={styles.formSection}>
            <h3>Totals &amp; Notes</h3>
            <div className={styles.formRow}>
              <label className={styles.formField} htmlFor="deposit-input">
                <span>Deposit Received</span>
                <input
                  id="deposit-input"
                  type="number"
                  step="0.01"
                  value={Number.isFinite(depositReceived) ? depositReceived : 0}
                  onChange={(e) => {
                    const { value } = e.target;
                    onDepositChange(value === "" ? 0 : parseFloat(value));
                  }}
                />
              </label>

              <label className={styles.formField} htmlFor="total-due-input">
                <span>Total Due</span>
                <input
                  id="total-due-input"
                  type="number"
                  step="0.01"
                  value={Number.isFinite(totalDue) ? totalDue : 0}
                  onChange={(e) => {
                    const { value } = e.target;
                    onTotalDueChange(value === "" ? 0 : parseFloat(value));
                  }}
                />
              </label>
            </div>

            <label className={styles.formField} htmlFor="notes-input">
              <span>Notes</span>
              <textarea
                id="notes-input"
                value={notesPlainText}
                onChange={(e) => onNotesChange(plainTextToHtml(e.target.value))}
                rows={4}
                placeholder="Notes..."
              />
            </label>
          </section>
        </div>
      </div>
    </div>
  );
};

export default InvoicePreviewContent;
