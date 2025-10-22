import React, { Fragment, useEffect, useMemo, useState } from "react";
import { BlobProvider } from "@react-pdf/renderer";

import { getFileUrl } from "@/shared/utils/api";
import PDFPreview from "@/dashboard/project/components/Shared/PDFPreview";

import styles from "./invoice-preview-modal.module.css";
import PdfInvoice from "./PdfInvoice";
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
  totalPages: number;
  subtotal: number;
  depositReceived: number;
  onDepositBlur: (value: string) => void;
  totalDue: number;
  onTotalDueBlur: (value: string) => void;
  notes: string;
  onNotesBlur: (value: string) => void;
  pdfPreviewUrl: string | null;
  onClosePdfPreview: () => void;
}

const htmlToPlainText = (html: string): string => {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const plainTextToHtml = (text: string): string => {
  if (!text) return "";

  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${block.replace(/\n/g, "<br/>")}</p>`);

  return blocks.join("");
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
  totalPages,
  subtotal,
  depositReceived,
  onDepositBlur,
  totalDue,
  onTotalDueBlur,
  notes,
  onNotesBlur,
  pdfPreviewUrl,
  onClosePdfPreview,
}) => {
  const logoSrc = logoDataUrl || (brandLogoKey ? getFileUrl(brandLogoKey) : "");
  const [notesEditorValue, setNotesEditorValue] = useState(() => htmlToPlainText(notes));

  useEffect(() => {
    setNotesEditorValue(htmlToPlainText(notes));
  }, [notes]);

  const addressForPreview = useMemo(
    () => (useProjectAddress ? project?.address || "" : brandAddress),
    [useProjectAddress, project, brandAddress]
  );

  const pdfDocument = useMemo(
    () => (
      <PdfInvoice
        brandName={brandName || project?.company || ""}
        brandTagline={brandTagline}
        brandAddress={addressForPreview}
        brandPhone={brandPhone}
        brandLogoKey={brandLogoKey}
        logoDataUrl={logoDataUrl}
        project={project}
        invoiceNumber={invoiceNumber}
        issueDate={issueDate}
        dueDate={dueDate}
        serviceDate={serviceDate}
        projectTitle={projectTitle}
        customerSummary={customerSummary}
        invoiceSummary={invoiceSummary}
        paymentSummary={paymentSummary}
        rows={rowsData}
        subtotal={subtotal}
        depositReceived={depositReceived}
        totalDue={totalDue}
        notes={notes}
      />
    ),
    [
      addressForPreview,
      brandLogoKey,
      brandName,
      brandPhone,
      brandTagline,
      customerSummary,
      depositReceived,
      dueDate,
      invoiceNumber,
      invoiceSummary,
      issueDate,
      logoDataUrl,
      notes,
      paymentSummary,
      project,
      projectTitle,
      rowsData,
      serviceDate,
      subtotal,
      totalDue,
    ]
  );

  const handleNotesEditorBlur = () => {
    onNotesBlur(plainTextToHtml(notesEditorValue));
  };

  const renderHeader = () => {
    const displayedAddress =
      addressForPreview ||
      (useProjectAddress
        ? project?.address || "Project Address"
        : brandAddress || "Business Address");
    const displayedPhone = brandPhone || "Phone Number";

    return (
      <div className="invoice-top">
        <header className="invoice-header">
          <div className="logo-upload" aria-label="Company logo">
            {logoSrc ? <img src={logoSrc} alt="Company logo" /> : <span>Upload Logo</span>}
          </div>

          <div className="company-block">
            <div className="company-info">
              <div className="brand-name">{brandName || project?.company || "Your Business Name"}</div>
              {brandTagline ? <div className="brand-tagline">{brandTagline}</div> : null}
              <div className="brand-address">{displayedAddress}</div>
              {displayedPhone ? <div className="brand-phone">{displayedPhone}</div> : null}
            </div>

            <div className="invoice-meta">
              <div>
                Invoice #: <span>{invoiceNumber || "0000"}</span>
              </div>
              <div>
                Issue date: <span>{issueDate}</span>
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
      </div>
    );
  };

  const renderSummary = (rows: RowData[], rowsKeyPrefix: string) => (
    <Fragment>
      <h1 className="project-title">{projectTitle || project?.title || "Project Title"}</h1>

      <div className="summary">
        <div>{customerSummary || "Customer"}</div>
        <div>{invoiceSummary || "Invoice Details"}</div>
        <div>{paymentSummary || "Payment"}</div>
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
                  <td>
                    {formatCurrency(
                      parseFloat(String(row.item.itemFinalCost || 0)) || 0
                    )}
                  </td>
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
      <style id="invoice-preview-styles">{`
        @page { margin: 0; }
        body { margin: 0; }
        .invoice-container{background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;width:min(100%,210mm);max-width:210mm;box-sizing:border-box;margin:0 auto;padding:20px;overflow-x:hidden;}
        .invoice-page{width:min(100%,210mm);max-width:210mm;min-height:297mm;box-shadow:0 2px 6px rgba(0,0,0,0.15);margin:0 auto 20px;padding:20px 20px 60px;box-sizing:border-box;position:relative;overflow-x:hidden;display:flex;flex-direction:column;}
        .invoice-header{display:flex;align-items:flex-start;gap:20px;}
        .logo-upload{width:100px;height:100px;border:1px dashed #ccc;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;}
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
        @media screen and (max-width:768px){
          .invoice-container{padding:16px;width:100%;}
          .invoice-page{padding:16px 16px 56px;width:100%;min-height:auto;}
          .invoice-header{flex-direction:column;align-items:flex-start;gap:12px;}
          .company-block{flex-direction:column;align-items:flex-start;gap:8px;width:100%;}
          .invoice-meta{text-align:left;width:100%;}
          .billing-info{flex-direction:column;align-items:flex-start;gap:12px;font-size:0.82rem;}
          .invoice-title{margin-left:0;text-align:left;font-size:1.6rem;}
          .summary{flex-direction:column;gap:12px;}
          .items-table th,.items-table td{padding:6px;font-size:0.85rem;}
          .bottom-block{margin-bottom:28px;}
        }
        @media screen and (max-width:480px){
          .invoice-page{padding:12px 12px 52px;}
          .invoice-header{gap:10px;}
          .brand-name{font-size:1.05rem;}
          .invoice-title{font-size:1.4rem;}
          .company-info,.billing-info{font-size:0.78rem;}
          .summary{gap:10px;}
          .items-table th,.items-table td{padding:5px;font-size:0.78rem;}
          .bottom-block{margin-bottom:24px;}
        }
        @media print{
          .invoice-container{width:210mm;max-width:210mm;padding:20px;}
          .invoice-page{width:210mm;max-width:210mm;height:297mm;min-height:auto;box-shadow:none;margin:0;page-break-after:always;padding:20px 20px 60px;}
          .invoice-page:last-child{page-break-after:auto;}
        }
      `}</style>

      <div
        className="invoice-page invoice-container"
        ref={invoiceRef}
        data-preview-role="measure"
        style={{ position: "absolute", visibility: "hidden", pointerEvents: "none" }}
      >
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
                Total Due:
                <span>{formatCurrency(totalDue)}</span>
              </strong>
            </div>
          </div>

          <div className="notes" dangerouslySetInnerHTML={{ __html: notes }} />

          <div className="footer">{project?.company || "Company Name"}</div>
        </div>
      </div>

      <div className={styles.pdfEditorLayout}>
        <div className={styles.pdfViewerPane}>
          <BlobProvider document={pdfDocument}>
            {({ url, loading }) => (
              <div className={styles.pdfViewerViewport}>
                {loading ? (
                  <div className={styles.pdfLoading}>Generating PDF preview…</div>
                ) : url ? (
                  <PDFPreview
                    url={url}
                    page={Math.max(1, currentPage + 1)}
                    className={styles.pdfCanvas}
                  />
                ) : (
                  <div className={styles.pdfLoading}>Unable to load PDF preview</div>
                )}
              </div>
            )}
          </BlobProvider>
          <div className={styles.pageNumberRow}>
            <div className="pageNumber">Page {currentPage + 1} of {totalPages || 1}</div>
          </div>
        </div>

        <div className={styles.editorPanel}>
          <section className={styles.editorSection} aria-labelledby="invoice-brand-heading">
            <h3 id="invoice-brand-heading" className={styles.sectionHeading}>
              Brand details
            </h3>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="invoice-logo-upload">
                Logo
              </label>
              <div
                id="invoice-logo-upload"
                className={styles.logoDropzone}
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
                {logoSrc ? <img src={logoSrc} alt="Uploaded logo" /> : <span>Click or drop an image</span>}
              </div>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={onLogoSelect}
              />
            </div>

            <label className={styles.fieldLabel} htmlFor="brand-name-input">
              Company name
              <input
                id="brand-name-input"
                className={styles.textInput}
                value={brandName}
                onChange={(e) => onBrandNameBlur(e.target.value)}
                placeholder="Your Business Name"
              />
            </label>

            <label className={styles.fieldLabel} htmlFor="brand-tagline-input">
              Tagline
              <input
                id="brand-tagline-input"
                className={styles.textInput}
                value={brandTagline}
                onChange={(e) => onBrandTaglineBlur(e.target.value)}
                placeholder="Tagline"
              />
            </label>

            <label className={styles.fieldLabel} htmlFor="brand-address-input">
              Company address
              <textarea
                id="brand-address-input"
                className={styles.textArea}
                value={useProjectAddress ? project?.address || "" : brandAddress}
                onChange={(e) => onBrandAddressBlur(e.target.value)}
                placeholder="Business Address"
                disabled={useProjectAddress}
              />
            </label>

            <label className={styles.fieldLabel} htmlFor="brand-phone-input">
              Phone number
              <input
                id="brand-phone-input"
                className={styles.textInput}
                value={brandPhone}
                onChange={(e) => onBrandPhoneBlur(e.target.value)}
                placeholder="Phone Number"
              />
            </label>

            {project?.address ? (
              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  checked={useProjectAddress}
                  onChange={(e) => onToggleProjectAddress(e.target.checked)}
                />
                Use project address ({project.address})
              </label>
            ) : null}
          </section>

          <section className={styles.editorSection} aria-labelledby="invoice-metadata-heading">
            <h3 id="invoice-metadata-heading" className={styles.sectionHeading}>
              Invoice details
            </h3>
            <div className={styles.inlineFields}>
              <label className={styles.fieldLabel} htmlFor="invoice-number-input">
                Invoice number
                <input
                  id="invoice-number-input"
                  className={styles.textInput}
                  value={invoiceNumber}
                  onChange={(e) => onInvoiceNumberBlur(e.target.value)}
                />
              </label>

              <label className={styles.fieldLabel} htmlFor="issue-date-input">
                Issue date
                <input
                  id="issue-date-input"
                  className={styles.textInput}
                  value={issueDate}
                  onChange={(e) => onIssueDateBlur(e.target.value)}
                  placeholder="MM/DD/YYYY"
                />
              </label>
            </div>

            <div className={styles.inlineFields}>
              <label className={styles.fieldLabel} htmlFor="due-date-input">
                Due date
                <input
                  id="due-date-input"
                  className={styles.textInput}
                  type="date"
                  value={dueDate}
                  onChange={(e) => onDueDateChange(e.target.value)}
                />
              </label>

              <label className={styles.fieldLabel} htmlFor="service-date-input">
                Service date
                <input
                  id="service-date-input"
                  className={styles.textInput}
                  type="date"
                  value={serviceDate}
                  onChange={(e) => onServiceDateChange(e.target.value)}
                />
              </label>
            </div>

            <label className={styles.fieldLabel} htmlFor="project-title-input">
              Project title
              <input
                id="project-title-input"
                className={styles.textInput}
                value={projectTitle}
                onChange={(e) => onProjectTitleBlur(e.target.value)}
                placeholder="Project Title"
              />
            </label>
          </section>

          <section className={styles.editorSection} aria-labelledby="invoice-summary-heading">
            <h3 id="invoice-summary-heading" className={styles.sectionHeading}>
              Summaries
            </h3>
            <label className={styles.fieldLabel} htmlFor="customer-summary-input">
              Customer summary
              <textarea
                id="customer-summary-input"
                className={styles.textArea}
                value={customerSummary}
                onChange={(e) => onCustomerSummaryBlur(e.target.value)}
              />
            </label>

            <label className={styles.fieldLabel} htmlFor="invoice-summary-input">
              Invoice summary
              <textarea
                id="invoice-summary-input"
                className={styles.textArea}
                value={invoiceSummary}
                onChange={(e) => onInvoiceSummaryBlur(e.target.value)}
              />
            </label>

            <label className={styles.fieldLabel} htmlFor="payment-summary-input">
              Payment summary
              <textarea
                id="payment-summary-input"
                className={styles.textArea}
                value={paymentSummary}
                onChange={(e) => onPaymentSummaryBlur(e.target.value)}
              />
            </label>
          </section>

          <section className={styles.editorSection} aria-labelledby="invoice-totals-heading">
            <h3 id="invoice-totals-heading" className={styles.sectionHeading}>
              Totals
            </h3>
            <label className={styles.fieldLabel} htmlFor="deposit-input">
              Deposit received
              <input
                id="deposit-input"
                className={styles.textInput}
                type="number"
                step="0.01"
                value={depositReceived.toString()}
                onChange={(e) => onDepositBlur(e.target.value)}
              />
            </label>

            <label className={styles.fieldLabel} htmlFor="total-due-input">
              Total due
              <input
                id="total-due-input"
                className={styles.textInput}
                type="number"
                step="0.01"
                value={totalDue.toString()}
                onChange={(e) => onTotalDueBlur(e.target.value)}
              />
            </label>
          </section>

          <section className={styles.editorSection} aria-labelledby="invoice-notes-heading">
            <h3 id="invoice-notes-heading" className={styles.sectionHeading}>
              Notes
            </h3>
            <textarea
              id="invoice-notes-input"
              className={styles.textArea}
              value={notesEditorValue}
              onChange={(e) => setNotesEditorValue(e.target.value)}
              onBlur={handleNotesEditorBlur}
              placeholder="Add notes that will appear at the end of the invoice"
            />
          </section>
        </div>
      </div>
    </div>
  );
};

export default InvoicePreviewContent;
