import React, { Fragment, useMemo } from "react";

import { getFileUrl } from "@/shared/utils/api";
import PDFPreview from "@/dashboard/project/components/Shared/PDFPreview";

import styles from "./invoice-preview-modal.module.css";
import type { ProjectLike, RowData } from "./invoicePreviewTypes";
import { formatCurrency } from "./invoicePreviewUtils";

const htmlToPlainText = (html: string): string => {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>(\r?\n)?/gi, "\n")
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
  const normalized = text.replace(/\r\n?/g, "\n");
  const paragraphs = normalized.split(/\n{2,}/).map((block) => block.trim());
  return paragraphs
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("<br />")
    )
    .map((block) => `<p>${block || ""}</p>`)
    .join("");
};

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
  pdfPreviewUrl: string | null;
  isRenderingPdf: boolean;
  onPdfDocumentLoad: (totalPages: number) => void;
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
  pdfPreviewUrl,
  isRenderingPdf,
  onPdfDocumentLoad,
}) => {
  const logoSrc = useMemo(() => {
    if (logoDataUrl) return logoDataUrl;
    if (!brandLogoKey) return "";
    return getFileUrl(brandLogoKey);
  }, [brandLogoKey, logoDataUrl]);

  const notesPlain = useMemo(() => htmlToPlainText(notes), [notes]);
  const depositInputValue = useMemo(
    () => (Number.isFinite(depositReceived) ? String(depositReceived) : ""),
    [depositReceived]
  );
  const totalDueInputValue = useMemo(
    () => (Number.isFinite(totalDue) ? String(totalDue) : ""),
    [totalDue]
  );

  const handleLogoClick = () => fileInputRef.current?.click();

  const handleLogoKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const renderHiddenHeader = () => (
    <div className="invoice-top">
      <header className="invoice-header">
        <div className="logo-upload">
          {logoSrc ? <img src={logoSrc} alt="Company logo" /> : <span>Upload Logo</span>}
        </div>

        <div className="company-block">
          <div className="company-info">
            <div className="brand-name">{brandName || project?.company || "Your Business Name"}</div>
            <div className="brand-tagline">{brandTagline || "Tagline"}</div>
            <div className="brand-address">
              {useProjectAddress ? project?.address || "Project Address" : brandAddress || "Business Address"}
            </div>
            <div className="brand-phone">{brandPhone || "Phone Number"}</div>
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

      <div className="invoice-title">INVOICE</div>

      <div className="billing-info">
        <div>
          <strong>Bill to</strong>
          <div>{project?.clientName || "Client Name"}</div>
          <div>{project?.invoiceBrandName || "Client Company"}</div>
          <div>{project?.invoiceBrandAddress || project?.clientAddress || "Client Address"}</div>
          {project?.invoiceBrandPhone || project?.clientPhone ? (
            <div>{project?.invoiceBrandPhone || project?.clientPhone}</div>
          ) : null}
          {project?.clientEmail ? <div>{project.clientEmail}</div> : null}
        </div>
        <div>
          <div>Invoice #: <span>{invoiceNumber}</span></div>
          <div>Issue date: <span>{issueDate}</span></div>
          <div>Due date: <span>{dueDate}</span></div>
          <div>Service date: <span>{serviceDate}</span></div>
        </div>
      </div>
    </div>
  );

  const renderHiddenSummary = (rows: RowData[], rowsKeyPrefix: string) => (
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

  const hiddenPreview = (
    <div className={styles.hiddenPreview} ref={previewRef} aria-hidden>
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

      <div className="invoice-page invoice-container" ref={invoiceRef} data-preview-role="measure">
        {renderHiddenHeader()}

        {renderHiddenSummary(rowsData, "measure")}

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

      <div className="invoice-container">
        <div className="invoice-page">
          {renderHiddenHeader()}

          {renderHiddenSummary(currentRows, `page-${currentPage}`)}

          {currentPage === Math.max(0, totalPages - 1) && (
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
          )}

          <div className="pageNumber">Page {currentPage + 1} of {totalPages || 1}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={styles.previewWrapper}>
      <div className={styles.previewLayout}>
        <section className={styles.editorPanel}>
          <h2 className={styles.sectionTitle}>Invoice Details</h2>

          <div className={styles.editorGroup}>
            <div
              className={styles.logoDropZone}
              role="button"
              tabIndex={0}
              onClick={handleLogoClick}
              onKeyDown={handleLogoKeyDown}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onLogoDrop}
            >
              {logoSrc ? <img src={logoSrc} alt="Uploaded logo preview" /> : <span>Upload Logo</span>}
            </div>
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={onLogoSelect}
            />
            {project?.address ? (
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={useProjectAddress}
                  onChange={(e) => onToggleProjectAddress(e.target.checked)}
                />
                Use project address
              </label>
            ) : null}
          </div>

          <div className={styles.editorGrid}>
            <label>
              Company name
              <input value={brandName} onChange={(e) => onBrandNameChange(e.target.value)} />
            </label>
            <label>
              Tagline
              <input value={brandTagline} onChange={(e) => onBrandTaglineChange(e.target.value)} />
            </label>
            <label>
              Address
              <textarea
                value={useProjectAddress ? project?.address || "" : brandAddress}
                onChange={(e) => onBrandAddressChange(e.target.value)}
                disabled={useProjectAddress}
              />
            </label>
            <label>
              Phone
              <input value={brandPhone} onChange={(e) => onBrandPhoneChange(e.target.value)} />
            </label>
          </div>

          <div className={styles.editorGrid}>
            <label>
              Invoice #
              <input value={invoiceNumber} onChange={(e) => onInvoiceNumberChange(e.target.value)} />
            </label>
            <label>
              Issue date
              <input value={issueDate} onChange={(e) => onIssueDateChange(e.target.value)} />
            </label>
            <label>
              Due date
              <input type="date" value={dueDate} onChange={(e) => onDueDateChange(e.target.value)} />
            </label>
            <label>
              Service date
              <input type="date" value={serviceDate} onChange={(e) => onServiceDateChange(e.target.value)} />
            </label>
          </div>

          <div className={styles.editorGrid}>
            <label className={styles.gridFull}>
              Project title
              <input value={projectTitle} onChange={(e) => onProjectTitleChange(e.target.value)} />
            </label>
            <label>
              Customer summary
              <textarea value={customerSummary} onChange={(e) => onCustomerSummaryChange(e.target.value)} />
            </label>
            <label>
              Invoice summary
              <textarea value={invoiceSummary} onChange={(e) => onInvoiceSummaryChange(e.target.value)} />
            </label>
            <label>
              Payment summary
              <textarea value={paymentSummary} onChange={(e) => onPaymentSummaryChange(e.target.value)} />
            </label>
          </div>

          <div className={styles.editorGrid}>
            <label>
              Deposit received
              <input value={depositInputValue} onChange={(e) => onDepositChange(e.target.value)} />
            </label>
            <label>
              Total due
              <input value={totalDueInputValue} onChange={(e) => onTotalDueChange(e.target.value)} />
            </label>
          </div>

          <label className={styles.gridFull}>
            Notes
            <textarea
              value={notesPlain}
              onChange={(e) => onNotesChange(plainTextToHtml(e.target.value))}
              rows={6}
            />
          </label>
        </section>

        <section className={styles.pdfPanel}>
          <div className={styles.pdfHeader}>
            <h2>PDF Preview</h2>
            {isRenderingPdf ? <span className={styles.pdfStatus}>Generating…</span> : null}
          </div>

          <div className={styles.pdfCanvasWrapper}>
            {pdfPreviewUrl ? (
              <PDFPreview
                url={pdfPreviewUrl}
                page={Math.max(1, currentPage + 1)}
                className={styles.pdfPreviewCanvas}
                onDocumentLoad={({ totalPages }) => onPdfDocumentLoad(totalPages)}
              />
            ) : (
              <div className={styles.pdfPlaceholder}>PDF preview unavailable</div>
            )}
          </div>
        </section>
      </div>

      {hiddenPreview}
    </div>
  );
};

export default InvoicePreviewContent;
