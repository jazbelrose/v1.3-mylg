import React from "react";

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
  onDepositChange: (value: string) => void;
  totalDue: number;
  onTotalDueChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  pdfPreviewUrl: string | null;
  onClosePdfPreview: () => void;
  livePdfUrl: string | null;
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
  livePdfUrl,
}) => {
  const logoSrc = logoDataUrl || (brandLogoKey ? getFileUrl(brandLogoKey) : "");

  const displayedBrandName = brandName || project?.company || "Your Business Name";
  const displayedAddress = useProjectAddress
    ? project?.address || "Project Address"
    : brandAddress || "Business Address";
  const displayedPhone = brandPhone || "Phone Number";
  const displayedTagline = brandTagline || "Tagline";

  const billToContact = project?.clientName || "Client Name";
  const billToCompany = project?.invoiceBrandName || "Client Company";
  const billToAddress =
    project?.invoiceBrandAddress || project?.clientAddress || "Client Address";
  const billToPhone = project?.invoiceBrandPhone || project?.clientPhone || "";
  const billToEmail = project?.clientEmail || "";

  const formattedSubtotal = formatCurrency(subtotal);
  const formattedDeposit = formatCurrency(depositReceived);
  const formattedTotal = formatCurrency(totalDue);

  const trimmedNotes = (notes || "").trim();
  const notesMarkup = {
    __html: trimmedNotes
      ? trimmedNotes.startsWith("<")
        ? trimmedNotes
        : `<p>${trimmedNotes}</p>`
      : "",
  };

  const handleInputChange = (
    handler: (value: string) => void
  ): React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement> =>
    (event) => handler(event.target.value);

  const measurementRows = rowsData.map((row, idx) => {
    if (row.type === "group") {
      return (
        <tr className="group-header" key={`group-${idx}`}>
          <td colSpan={5}>{row.group}</td>
        </tr>
      );
    }

    const quantity = row.item.quantity ?? "";
    const amount = parseFloat(String(row.item.itemFinalCost || 0)) || 0;
    const qtyNumber = parseFloat(String(row.item.quantity || 1)) || 1;
    const unitPrice = qtyNumber === 0 ? 0 : amount / qtyNumber;

    return (
      <tr key={row.item.budgetItemId || `row-${idx}`}>
        <td>{row.item.description || ""}</td>
        <td>{quantity || ""}</td>
        <td>{row.item.unit || ""}</td>
        <td>{formatCurrency(unitPrice)}</td>
        <td>{formatCurrency(amount)}</td>
      </tr>
    );
  });

  const currentPageLabel = Math.max(1, Math.min(currentPage + 1, Math.max(totalPages, 1)));
  const totalPageLabel = Math.max(totalPages, 1);

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

      <div className={styles.previewLayout}>
        <div className={styles.editorPanel}>
          <section className={styles.editorSection}>
            <h3 className={styles.editorHeading}>Brand</h3>
            <div
              className={styles.logoDropzone}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={onLogoDrop}
            >
              {logoSrc ? (
                <img src={logoSrc} alt="Company logo" />
              ) : (
                <span>Upload Logo</span>
              )}
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={onLogoSelect}
              />
            </div>
            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Company name</span>
              <input
                type="text"
                value={brandName}
                placeholder={project?.company || "Your Business Name"}
                onChange={handleInputChange(onBrandNameChange)}
              />
            </label>
            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Tagline</span>
              <input
                type="text"
                value={brandTagline}
                placeholder="Tagline"
                onChange={handleInputChange(onBrandTaglineChange)}
              />
            </label>
            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Address</span>
              <textarea
                value={brandAddress}
                placeholder="Business Address"
                onChange={handleInputChange(onBrandAddressChange)}
                rows={3}
              />
            </label>
            {project?.address ? (
              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  checked={useProjectAddress}
                  onChange={(event) => onToggleProjectAddress(event.target.checked)}
                />
                Use project address ({project.address})
              </label>
            ) : null}
            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Phone</span>
              <input
                type="text"
                value={brandPhone}
                placeholder="Phone Number"
                onChange={handleInputChange(onBrandPhoneChange)}
              />
            </label>
          </section>

          <section className={styles.editorSection}>
            <h3 className={styles.editorHeading}>Invoice details</h3>
            <div className={styles.inlineFields}>
              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Invoice #</span>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={handleInputChange(onInvoiceNumberChange)}
                />
              </label>
              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Issue date</span>
                <input
                  type="text"
                  value={issueDate}
                  onChange={handleInputChange(onIssueDateChange)}
                  placeholder="MM/DD/YYYY"
                />
              </label>
            </div>
            <div className={styles.inlineFields}>
              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Due date</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={handleInputChange(onDueDateChange)}
                />
              </label>
              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Service date</span>
                <input
                  type="date"
                  value={serviceDate}
                  onChange={handleInputChange(onServiceDateChange)}
                />
              </label>
            </div>
          </section>

          <section className={styles.editorSection}>
            <h3 className={styles.editorHeading}>Summaries</h3>
            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Project title</span>
              <input
                type="text"
                value={projectTitle}
                placeholder="Project Title"
                onChange={handleInputChange(onProjectTitleChange)}
              />
            </label>
            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Customer summary</span>
              <textarea
                value={customerSummary}
                onChange={handleInputChange(onCustomerSummaryChange)}
                rows={3}
              />
            </label>
            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Invoice summary</span>
              <textarea
                value={invoiceSummary}
                onChange={handleInputChange(onInvoiceSummaryChange)}
                rows={3}
              />
            </label>
            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Payment summary</span>
              <textarea
                value={paymentSummary}
                onChange={handleInputChange(onPaymentSummaryChange)}
                rows={3}
              />
            </label>
          </section>

          <section className={styles.editorSection}>
            <h3 className={styles.editorHeading}>Totals</h3>
            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Deposit received</span>
              <input
                type="text"
                value={
                  Number.isFinite(depositReceived)
                    ? String(depositReceived)
                    : ""
                }
                placeholder="0.00"
                onChange={handleInputChange(onDepositChange)}
              />
            </label>
            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Total due</span>
              <input
                type="text"
                value={Number.isFinite(totalDue) ? String(totalDue) : ""}
                placeholder="0.00"
                onChange={handleInputChange(onTotalDueChange)}
              />
            </label>
            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Notes</span>
              <textarea
                value={notes}
                onChange={handleInputChange(onNotesChange)}
                rows={4}
              />
            </label>
          </section>
        </div>

        <div className={styles.pdfPanel}>
          {livePdfUrl ? (
            <PDFPreview
              url={livePdfUrl}
              page={Math.max(1, currentPage + 1)}
              className={styles.pdfLiveCanvas}
              scale={1.2}
            />
          ) : (
            <div className={styles.pdfPlaceholder}>Invoice PDF preview will appear here.</div>
          )}
          <div className={styles.pageIndicator}>
            Page {currentPageLabel} of {totalPageLabel}
          </div>
        </div>
      </div>

      <div className={styles.measurementRoot} aria-hidden="true">
        <div className="invoice-page invoice-container" ref={invoiceRef}>
          <div className="invoice-top">
            <header className="invoice-header">
              <div className="logo-upload">
                {logoSrc ? (
                  <img src={logoSrc} alt="Company logo" />
                ) : (
                  <span>Logo</span>
                )}
              </div>
              <div className="company-info">
                <div className="brand-name">{displayedBrandName}</div>
                <div className="brand-tagline">{displayedTagline}</div>
                <div className="brand-address">{displayedAddress}</div>
                <div className="brand-phone">{displayedPhone}</div>
              </div>
              <div className="invoice-meta">
                <div className="invoice-title">INVOICE</div>
                <div>Invoice #: {invoiceNumber}</div>
                <div>Issue date: {issueDate}</div>
                <div>Due date: {dueDate}</div>
                <div>Service date: {serviceDate}</div>
              </div>
            </header>

            <div className="billing-info">
              <div>
                <strong>Bill To:</strong>
                <div>{billToContact}</div>
                <div>{billToCompany}</div>
                <div>{billToAddress}</div>
                {billToPhone ? <div>{billToPhone}</div> : null}
                {billToEmail ? <div>{billToEmail}</div> : null}
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
              <tbody>{measurementRows}</tbody>
            </table>
          </div>

          <div className="bottom-block">
            <div className="totals">
              <div>
                Subtotal: <span>{formattedSubtotal}</span>
              </div>
              <div>
                Deposit received: <span>{formattedDeposit}</span>
              </div>
              <div>
                <strong>
                  Total Due: <span>{formattedTotal}</span>
                </strong>
              </div>
            </div>
            <div className="notes" dangerouslySetInnerHTML={notesMarkup} />
            <div className="footer">{projectTitle}</div>
          </div>

          <div className="pageNumber">
            Page {currentPageLabel} of {totalPageLabel}
          </div>
        </div>
      </div>

      <style id="invoice-preview-styles">{`
        @page { margin: 0; }
        body { margin: 0; }
        .invoice-container{background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;width:min(100%,210mm);max-width:210mm;box-sizing:border-box;margin:0 auto;padding:20px;overflow-x:hidden;}
        .invoice-page{width:min(100%,210mm);max-width:210mm;min-height:297mm;box-shadow:0 2px 6px rgba(0,0,0,0.15);margin:0 auto 20px;padding:20px 20px 60px;box-sizing:border-box;position:relative;overflow-x:hidden;display:flex;flex-direction:column;}
        .invoice-header{display:flex;align-items:flex-start;gap:20px;}
        .logo-upload{width:100px;height:100px;border:1px dashed #ccc;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;}
        .logo-upload img{max-width:100%;max-height:100%;}
        .company-info{flex:1;display:flex;flex-direction:column;margin-top:10px;gap:4px;}
        .brand-name{font-size:1.2rem;font-weight:bold;}
        .brand-tagline,.brand-address,.brand-phone{font-size:0.7rem;}
        .invoice-meta{text-align:right;font-size:0.85rem;display:flex;flex-direction:column;gap:4px;}
        .billing-info{margin-top:20px;display:flex;justify-content:space-between;gap:20px;font-size:0.85rem;}
        .invoice-title{font-size:2rem;color:#FA3356;font-weight:bold;text-align:right;margin-left:auto;}
        .project-title{font-size:1.5rem;font-weight:bold;text-align:center;margin:10px 0;}
        .summary{display:flex;justify-content:space-between;gap:10px;margin-bottom:10px;}
        .summary>div{flex:1;}
        .summary-divider{border:0;border-top:1px solid #ccc;margin-bottom:10px;}
        .items-table-wrapper{flex:1 0 auto;}
        .items-table{width:100%;border-collapse:collapse;margin-top:20px;box-sizing:border-box;}
        .items-table th,.items-table td{border:1px solid #ddd;padding:8px;font-size:0.85rem;}
        .items-table th{background:#f5f5f5;font-weight:bold;text-align:left;}
        .items-table td{text-align:left;}
        .items-table td:nth-child(2),.items-table td:nth-child(3),.items-table td:nth-child(4),.items-table td:nth-child(5){text-align:right;}
        .group-header td{background:#fafafa;font-weight:bold;}
        .bottom-block{margin-top:20px;display:flex;flex-direction:column;gap:12px;}
        .totals{align-self:flex-end;min-width:200px;display:flex;flex-direction:column;gap:6px;text-align:right;}
        .totals span{font-weight:bold;}
        .notes{font-size:0.85rem;line-height:1.4;}
        .footer{font-size:0.75rem;color:#555;}
        .pageNumber{position:absolute;bottom:20px;right:20px;font-size:0.75rem;color:#555;}
      `}</style>
    </div>
  );
};

export default InvoicePreviewContent;
