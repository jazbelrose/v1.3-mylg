import React, { Fragment, useMemo } from "react";

import { getFileUrl } from "@/shared/utils/api";
import PDFPreview from "@/dashboard/project/components/Shared/PDFPreview";

import styles from "./invoice-preview-modal.module.css";
import type { ProjectLike, RowData } from "./invoicePreviewTypes";
import { formatCurrency, htmlToPlainText } from "./invoicePreviewUtils";

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
  currentRows: RowData[];
  currentPage: number;
  totalPages: number;
  subtotal: number;
  depositReceived: number;
  onDepositChange: (value: string) => void;
  totalDue: number;
  onTotalDueChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  invoicePdfUrl: string | null;
  pdfPreviewUrl: string | null;
  onClosePdfPreview: () => void;
}

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
  currentRows,
  currentPage,
  totalPages,
  subtotal,
  depositReceived,
  onDepositChange,
  totalDue,
  onTotalDueChange,
  notes,
  onNotesChange,
  invoicePdfUrl,
  pdfPreviewUrl,
  onClosePdfPreview,
}) => {
  const logoSrc = useMemo(
    () => logoDataUrl || (brandLogoKey ? getFileUrl(brandLogoKey) : ""),
    [logoDataUrl, brandLogoKey]
  );
  const projectAddress = project?.address || "";
  const notesPlain = useMemo(() => htmlToPlainText(notes), [notes]);

  const brandDisplayName = brandName || project?.company || "Your Business Name";
  const brandDisplayAddress = useProjectAddress
    ? projectAddress || "Project Address"
    : brandAddress || "Business Address";
  const brandDisplayPhone = brandPhone || "Phone Number";
  const brandDisplayTagline = brandTagline || "";

  const billContact = project?.clientName || "Client Name";
  const billCompany = project?.invoiceBrandName || "Client Company";
  const billAddress = project?.invoiceBrandAddress || project?.clientAddress || "Client Address";
  const billPhone = project?.invoiceBrandPhone || project?.clientPhone || "";
  const billEmail = project?.clientEmail || "";

  const renderHiddenHeader = () => (
    <div className="invoice-top">
      <header className="invoice-header">
        <div className="logo-upload" aria-label="Company logo">
          {logoSrc ? <img src={logoSrc} alt="Company logo" /> : <span>Upload Logo</span>}
        </div>

        <div className="company-block">
          <div className="company-info">
            <div className="brand-name">{brandDisplayName}</div>
            {brandDisplayTagline ? <div className="brand-tagline">{brandDisplayTagline}</div> : null}
            <div className="brand-address">{brandDisplayAddress}</div>
            <div className="brand-phone">{brandDisplayPhone}</div>
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

      <div className="billing-info">
        <div>
          <strong>Bill To:</strong>
          <div>{billContact}</div>
          <div>{billCompany}</div>
          <div>{billAddress}</div>
          {billPhone ? <div>{billPhone}</div> : null}
          {billEmail ? <div>{billEmail}</div> : null}
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
  );

  const renderSummaryTable = (rows: RowData[], rowsKeyPrefix: string) => (
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

      <div className={styles.pdfPane}>
        {invoicePdfUrl ? (
          <PDFPreview
            url={invoicePdfUrl}
            page={Math.max(1, currentPage + 1)}
            className={styles.pdfCanvas}
          />
        ) : (
          <div className={styles.pdfPlaceholder}>Generating PDF preview…</div>
        )}
      </div>

      <div className={styles.editorPane}>
        <section className={styles.formSection}>
          <h3>Branding</h3>
          <div
            className={styles.logoDropZone}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onLogoDrop}
          >
            {logoSrc ? <img src={logoSrc} alt="Company logo" /> : <span>Upload Logo</span>}
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={onLogoSelect}
            />
          </div>

          <label className={styles.formLabel}>
            Brand name
            <input
              type="text"
              className={styles.input}
              value={brandName}
              placeholder={project?.company || "Your Business Name"}
              onChange={(e) => onBrandNameChange(e.target.value)}
            />
          </label>

          <label className={styles.formLabel}>
            Tagline
            <input
              type="text"
              className={styles.input}
              value={brandTagline}
              placeholder="Tagline"
              onChange={(e) => onBrandTaglineChange(e.target.value)}
            />
          </label>

          <label className={styles.formLabel}>
            Address
            <textarea
              className={styles.textarea}
              value={useProjectAddress ? projectAddress : brandAddress}
              placeholder="Business Address"
              onChange={(e) => onBrandAddressChange(e.target.value)}
              disabled={useProjectAddress}
              rows={3}
            />
          </label>

          {projectAddress ? (
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={useProjectAddress}
                onChange={(e) => onToggleProjectAddress(e.target.checked)}
              />
              Use project address
            </label>
          ) : null}

          <label className={styles.formLabel}>
            Phone
            <input
              type="text"
              className={styles.input}
              value={brandPhone}
              placeholder="Phone Number"
              onChange={(e) => onBrandPhoneChange(e.target.value)}
            />
          </label>
        </section>

        <section className={styles.formSection}>
          <h3>Invoice details</h3>
          <div className={styles.twoColumnRow}>
            <label className={styles.formLabel}>
              Invoice #
              <input
                type="text"
                className={styles.input}
                value={invoiceNumber}
                onChange={(e) => onInvoiceNumberChange(e.target.value)}
              />
            </label>
            <label className={styles.formLabel}>
              Issue date
              <input
                type="text"
                className={styles.input}
                value={issueDate}
                onChange={(e) => onIssueDateChange(e.target.value)}
              />
            </label>
          </div>

          <div className={styles.twoColumnRow}>
            <label className={styles.formLabel}>
              Due date
              <input
                type="date"
                className={styles.input}
                value={dueDate}
                onChange={(e) => onDueDateChange(e.target.value)}
              />
            </label>
            <label className={styles.formLabel}>
              Service date
              <input
                type="date"
                className={styles.input}
                value={serviceDate}
                onChange={(e) => onServiceDateChange(e.target.value)}
              />
            </label>
          </div>
        </section>

        <section className={styles.formSection}>
          <h3>Summaries</h3>
          <label className={styles.formLabel}>
            Project title
            <input
              type="text"
              className={styles.input}
              value={projectTitle}
              placeholder="Project Title"
              onChange={(e) => onProjectTitleChange(e.target.value)}
            />
          </label>
          <label className={styles.formLabel}>
            Customer summary
            <textarea
              className={styles.textarea}
              value={customerSummary}
              onChange={(e) => onCustomerSummaryChange(e.target.value)}
              rows={3}
            />
          </label>
          <label className={styles.formLabel}>
            Invoice summary
            <textarea
              className={styles.textarea}
              value={invoiceSummary}
              onChange={(e) => onInvoiceSummaryChange(e.target.value)}
              rows={3}
            />
          </label>
          <label className={styles.formLabel}>
            Payment summary
            <textarea
              className={styles.textarea}
              value={paymentSummary}
              onChange={(e) => onPaymentSummaryChange(e.target.value)}
              rows={3}
            />
          </label>
        </section>

        <section className={styles.formSection}>
          <h3>Totals</h3>
          <div className={styles.twoColumnRow}>
            <label className={styles.formLabel}>
              Subtotal
              <input
                type="text"
                className={styles.input}
                value={formatCurrency(subtotal)}
                readOnly
              />
            </label>
            <label className={styles.formLabel}>
              Deposit received
              <input
                type="text"
                className={styles.input}
                value={formatCurrency(depositReceived)}
                onChange={(e) => onDepositChange(e.target.value)}
              />
            </label>
          </div>
          <label className={styles.formLabel}>
            Total due
            <input
              type="text"
              className={styles.input}
              value={formatCurrency(totalDue)}
              onChange={(e) => onTotalDueChange(e.target.value)}
            />
          </label>
        </section>

        <section className={styles.formSection}>
          <h3>Notes</h3>
          <textarea
            className={styles.textarea}
            rows={6}
            value={notesPlain}
            placeholder="Notes..."
            onChange={(e) => onNotesChange(e.target.value)}
          />
        </section>
      </div>

      <div className={styles.hiddenInvoice} aria-hidden="true">
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
        <div className="invoice-container">
          <div className="invoice-page" ref={invoiceRef} data-preview-role="measure">
            {renderHiddenHeader()}
            {renderSummaryTable(rowsData, "measure")}
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

        <div className="invoice-container">
          <div className="invoice-page">
            {renderHiddenHeader()}
            {renderSummaryTable(currentRows, `page-${currentPage}`)}
            {currentPage === Math.max(0, totalPages - 1) ? (
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
            ) : null}

            <div className="pageNumber">Page {currentPage + 1} of {totalPages || 1}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoicePreviewContent;
