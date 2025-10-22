import React, { Fragment, useMemo } from "react";

import PDFPreview from "@/dashboard/project/components/Shared/PDFPreview";
import { getFileUrl } from "@/shared/utils/api";

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
  onDepositChange: (value: string) => void;
  totalDue: number;
  onTotalDueChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  pdfPreviewUrl: string | null;
  onClosePdfPreview: () => void;
  pdfUrl: string | null;
}

const htmlToTextareaValue = (html: string): string => {
  if (!html) return "";
  return html
    .replace(/<\/?p[^>]*>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const textareaValueToHtml = (value: string): string => {
  if (!value) return "";
  const paragraphs = value
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => para.replace(/\n/g, "<br/>").trim());
  if (!paragraphs.length) {
    return "";
  }
  return paragraphs.map((para) => `<p>${para}</p>`).join("");
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
  onClosePdfPreview,
  pdfUrl,
}) => {
  const logoSrc = logoDataUrl || (brandLogoKey ? getFileUrl(brandLogoKey) : "");
  const notesTextareaValue = useMemo(() => htmlToTextareaValue(notes), [notes]);

  const renderMeasureHeader = () => (
    <div className="invoice-top">
      <header className="invoice-header">
        <div className="logo-upload" aria-label="Company logo">
          {logoSrc ? <img src={logoSrc} alt="Company logo" /> : null}
        </div>

        <div className="company-block">
          <div className="company-info">
            <div className="brand-name">{brandName || project?.company || "Your Business Name"}</div>
            {brandTagline ? <div className="brand-tagline">{brandTagline}</div> : null}
            <div className="brand-address">
              {useProjectAddress ? project?.address || "Project Address" : brandAddress || "Business Address"}
            </div>
            {brandPhone ? <div className="brand-phone">{brandPhone}</div> : null}
          </div>

          <div className="invoice-meta">
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
    </div>
  );

  const renderMeasureSummary = (rows: RowData[], rowsKeyPrefix: string) => (
    <Fragment>
      <h1 className="project-title">{projectTitle}</h1>

      <div className="summary">
        <div>{customerSummary}</div>
        <div>{invoiceSummary}</div>
        <div>{paymentSummary}</div>
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
                  <td>{formatCurrency(parseFloat(String(row.item.itemFinalCost || 0)) || 0)}</td>
                </tr>
              )
            )}
          </tbody>
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

      <div
        className="invoice-page invoice-container"
        ref={invoiceRef}
        data-preview-role="measure"
        style={{ position: "absolute", visibility: "hidden", pointerEvents: "none" }}
      >
        {renderMeasureHeader()}

        {renderMeasureSummary(rowsData, "measure")}

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
      </div>

      <div className={styles.editorLayout}>
        <div className={styles.pdfPane}>
          {pdfUrl ? (
            <PDFPreview
              url={pdfUrl}
              page={Math.max(1, currentPage + 1)}
              className={styles.pdfCanvas}
            />
          ) : (
            <div className={styles.pdfPlaceholder}>Generating PDF preview…</div>
          )}
          <div className={styles.pageIndicator}>
            Page {currentPage + 1} of {totalPages || 1}
          </div>
        </div>

        <div className={styles.editorPane}>
          <section className={styles.editorSection}>
            <h3 className={styles.sectionTitle}>Branding</h3>
            <div className={styles.logoUploadArea}>
              <div
                className={styles.logoDropZone}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onLogoDrop}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
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
            </div>

            <label className={styles.formField}>
              <span>Brand name</span>
              <input
                className={styles.textInput}
                type="text"
                value={brandName}
                placeholder={project?.company || "Your Business Name"}
                onChange={(e) => onBrandNameChange(e.target.value)}
              />
            </label>

            <label className={styles.formField}>
              <span>Tagline</span>
              <input
                className={styles.textInput}
                type="text"
                value={brandTagline}
                placeholder="Tagline"
                onChange={(e) => onBrandTaglineChange(e.target.value)}
              />
            </label>

            <label className={styles.formField}>
              <span>Address</span>
              <textarea
                className={styles.textArea}
                value={useProjectAddress ? project?.address || "" : brandAddress}
                placeholder="Business Address"
                onChange={(e) => onBrandAddressChange(e.target.value)}
                disabled={useProjectAddress}
              />
            </label>

            {project?.address ? (
              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  checked={useProjectAddress}
                  onChange={(e) => onToggleProjectAddress(e.target.checked)}
                />
                Use project address
              </label>
            ) : null}

            <label className={styles.formField}>
              <span>Phone</span>
              <input
                className={styles.textInput}
                type="text"
                value={brandPhone}
                placeholder="Phone Number"
                onChange={(e) => onBrandPhoneChange(e.target.value)}
              />
            </label>
          </section>

          <section className={styles.editorSection}>
            <h3 className={styles.sectionTitle}>Invoice details</h3>
            <div className={styles.formGrid}>
              <label className={styles.formField}>
                <span>Invoice #</span>
                <input
                  className={styles.textInput}
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => onInvoiceNumberChange(e.target.value)}
                />
              </label>

              <label className={styles.formField}>
                <span>Issue date</span>
                <input
                  className={styles.textInput}
                  type="text"
                  value={issueDate}
                  onChange={(e) => onIssueDateChange(e.target.value)}
                />
              </label>

              <label className={styles.formField}>
                <span>Due date</span>
                <input
                  className={styles.textInput}
                  type="date"
                  value={dueDate}
                  onChange={(e) => onDueDateChange(e.target.value)}
                />
              </label>

              <label className={styles.formField}>
                <span>Service date</span>
                <input
                  className={styles.textInput}
                  type="date"
                  value={serviceDate}
                  onChange={(e) => onServiceDateChange(e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className={styles.editorSection}>
            <h3 className={styles.sectionTitle}>Summaries</h3>
            <label className={styles.formField}>
              <span>Project title</span>
              <input
                className={styles.textInput}
                type="text"
                value={projectTitle}
                onChange={(e) => onProjectTitleChange(e.target.value)}
              />
            </label>

            <label className={styles.formField}>
              <span>Customer summary</span>
              <textarea
                className={styles.textArea}
                value={customerSummary}
                onChange={(e) => onCustomerSummaryChange(e.target.value)}
                rows={3}
              />
            </label>

            <label className={styles.formField}>
              <span>Invoice summary</span>
              <textarea
                className={styles.textArea}
                value={invoiceSummary}
                onChange={(e) => onInvoiceSummaryChange(e.target.value)}
                rows={3}
              />
            </label>

            <label className={styles.formField}>
              <span>Payment summary</span>
              <textarea
                className={styles.textArea}
                value={paymentSummary}
                onChange={(e) => onPaymentSummaryChange(e.target.value)}
                rows={3}
              />
            </label>
          </section>

          <section className={styles.editorSection}>
            <h3 className={styles.sectionTitle}>Totals &amp; notes</h3>
            <div className={styles.formGrid}>
              <label className={styles.formField}>
                <span>Subtotal</span>
                <input
                  className={styles.textInput}
                  type="text"
                  value={formatCurrency(subtotal)}
                  readOnly
                />
              </label>

              <label className={styles.formField}>
                <span>Deposit received</span>
                <input
                  className={styles.textInput}
                  type="text"
                  value={formatCurrency(depositReceived)}
                  onChange={(e) => onDepositChange(e.target.value)}
                />
              </label>

              <label className={styles.formField}>
                <span>Total due</span>
                <input
                  className={styles.textInput}
                  type="text"
                  value={formatCurrency(totalDue)}
                  onChange={(e) => onTotalDueChange(e.target.value)}
                />
              </label>
            </div>

            <label className={styles.formField}>
              <span>Notes</span>
              <textarea
                className={styles.textArea}
                value={notesTextareaValue}
                placeholder="Notes..."
                onChange={(e) => onNotesChange(textareaValueToHtml(e.target.value))}
                rows={6}
              />
            </label>
          </section>
        </div>
      </div>
    </div>
  );
};

export default InvoicePreviewContent;

