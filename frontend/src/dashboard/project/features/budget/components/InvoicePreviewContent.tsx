import React, { Fragment, useEffect, useMemo, useRef } from "react";

import { getFileUrl } from "@/shared/utils/api";
import PDFPreview from "@/dashboard/project/components/Shared/PDFPreview";

import styles from "./invoice-preview-modal.module.css";
import type { ProjectLike, RowData } from "./invoicePreviewTypes";
import { formatCurrency } from "./invoicePreviewUtils";

interface InvoicePreviewContentProps {
  invoiceRef: React.RefObject<HTMLDivElement>;
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
  pdfUrl: string | null;
  isGeneratingPdf: boolean;
}

const InvoicePreviewContent: React.FC<InvoicePreviewContentProps> = ({
  invoiceRef,
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
  pdfUrl,
  isGeneratingPdf,
}) => {
  const logoSrc = useMemo(
    () => logoDataUrl || (brandLogoKey ? getFileUrl(brandLogoKey) : ""),
    [brandLogoKey, logoDataUrl]
  );
  const notesEditorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!notesEditorRef.current) return;
    const el = notesEditorRef.current;
    if (el.innerHTML !== notes) {
      el.innerHTML = notes || "";
    }
  }, [notes]);

  const effectiveAddress = useMemo(
    () => (useProjectAddress ? project?.address || "" : brandAddress),
    [brandAddress, project, useProjectAddress]
  );

  const handleNotesInput = (event: React.FormEvent<HTMLDivElement>) => {
    onNotesChange(event.currentTarget.innerHTML);
  };

  const renderHeader = () => (
    <div className="invoice-top">
      <header className="invoice-header">
        <div className="logo-upload" aria-label="Company logo">
          {logoSrc ? <img src={logoSrc} alt="Company logo" /> : <span>Upload Logo</span>}
        </div>

        <div className="company-block">
          <div className="company-info">
            <div className="brand-name">{brandName || project?.company || "Your Business Name"}</div>

            <div className="brand-tagline">{brandTagline || "Tagline"}</div>

            <div className="brand-address">
              {effectiveAddress || (useProjectAddress ? "Project Address" : "Business Address")}
            </div>

            <div className="brand-phone">{brandPhone || "Phone Number"}</div>
          </div>

          <div className="invoice-meta">
            <div>Invoice #: {invoiceNumber}</div>
            <div>Issue date: {issueDate}</div>
            <div>Due date: {dueDate}</div>
            <div>Service date: {serviceDate}</div>
          </div>
        </div>
      </header>
    </div>
  );

  const renderSummary = (rows: RowData[], rowsKeyPrefix: string) => (
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
    <div className={styles.previewWrapper}>
      <div className={styles.previewLayout}>
        <div className={styles.formColumn}>
          <section className={styles.formSection}>
            <h3 className={styles.sectionTitle}>Branding</h3>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Logo</label>
              <div
                className={`${styles.logoInput} logo-upload`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onLogoDrop}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
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
                className={styles.hiddenFileInput}
                onChange={onLogoSelect}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="invoice-brand-name">
                Company Name
              </label>
              <input
                id="invoice-brand-name"
                className={styles.textInput}
                value={brandName}
                placeholder={project?.company || "Your Business Name"}
                onChange={(e) => onBrandNameChange(e.target.value)}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="invoice-brand-tagline">
                Tagline
              </label>
              <input
                id="invoice-brand-tagline"
                className={styles.textInput}
                value={brandTagline}
                placeholder="Tagline"
                onChange={(e) => onBrandTaglineChange(e.target.value)}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="invoice-brand-phone">
                Phone
              </label>
              <input
                id="invoice-brand-phone"
                className={styles.textInput}
                value={brandPhone}
                placeholder="Phone Number"
                onChange={(e) => onBrandPhoneChange(e.target.value)}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="invoice-brand-address">
                Address
              </label>
              <textarea
                id="invoice-brand-address"
                className={styles.textArea}
                value={effectiveAddress}
                placeholder={useProjectAddress ? project?.address || "Project Address" : "Business Address"}
                onChange={(e) => onBrandAddressChange(e.target.value)}
                disabled={useProjectAddress}
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
          </section>

          <section className={styles.formSection}>
            <h3 className={styles.sectionTitle}>Invoice details</h3>
            <div className={styles.inlineFields}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor="invoice-number">
                  Invoice #
                </label>
                <input
                  id="invoice-number"
                  className={styles.textInput}
                  value={invoiceNumber}
                  onChange={(e) => onInvoiceNumberChange(e.target.value)}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor="invoice-issue-date">
                  Issue date
                </label>
                <input
                  id="invoice-issue-date"
                  className={styles.textInput}
                  value={issueDate}
                  onChange={(e) => onIssueDateChange(e.target.value)}
                />
              </div>
            </div>
            <div className={styles.inlineFields}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor="invoice-due-date">
                  Due date
                </label>
                <input
                  id="invoice-due-date"
                  type="date"
                  className={styles.textInput}
                  value={dueDate}
                  onChange={(e) => onDueDateChange(e.target.value)}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor="invoice-service-date">
                  Service date
                </label>
                <input
                  id="invoice-service-date"
                  type="date"
                  className={styles.textInput}
                  value={serviceDate}
                  onChange={(e) => onServiceDateChange(e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className={styles.formSection}>
            <h3 className={styles.sectionTitle}>Summary</h3>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="invoice-project-title">
                Project Title
              </label>
              <input
                id="invoice-project-title"
                className={styles.textInput}
                value={projectTitle}
                onChange={(e) => onProjectTitleChange(e.target.value)}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="invoice-customer-summary">
                Customer Summary
              </label>
              <textarea
                id="invoice-customer-summary"
                className={styles.textArea}
                value={customerSummary}
                onChange={(e) => onCustomerSummaryChange(e.target.value)}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="invoice-summary">
                Invoice Details
              </label>
              <textarea
                id="invoice-summary"
                className={styles.textArea}
                value={invoiceSummary}
                onChange={(e) => onInvoiceSummaryChange(e.target.value)}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="invoice-payment-summary">
                Payment Summary
              </label>
              <textarea
                id="invoice-payment-summary"
                className={styles.textArea}
                value={paymentSummary}
                onChange={(e) => onPaymentSummaryChange(e.target.value)}
              />
            </div>
          </section>

          <section className={styles.formSection}>
            <h3 className={styles.sectionTitle}>Totals</h3>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Subtotal</label>
              <div className={styles.readonlyValue}>{formatCurrency(subtotal)}</div>
            </div>
            <div className={styles.inlineFields}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor="invoice-deposit">
                  Deposit received
                </label>
                <input
                  id="invoice-deposit"
                  type="number"
                  step="0.01"
                  className={styles.textInput}
                  value={Number.isFinite(depositReceived) ? depositReceived : ""}
                  onChange={(e) => onDepositChange(e.target.value)}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor="invoice-total-due">
                  Total due
                </label>
                <input
                  id="invoice-total-due"
                  type="number"
                  step="0.01"
                  className={styles.textInput}
                  value={Number.isFinite(totalDue) ? totalDue : ""}
                  onChange={(e) => onTotalDueChange(e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className={styles.formSection}>
            <h3 className={styles.sectionTitle}>Notes</h3>
            <div
              ref={notesEditorRef}
              className={styles.richTextInput}
              contentEditable
              suppressContentEditableWarning
              aria-label="Invoice notes"
              onInput={handleNotesInput}
            />
          </section>
        </div>

        <div className={styles.previewColumn}>
          <div className={styles.previewHeader}>
            <span>Invoice preview</span>
            <span>
              Page {Math.max(1, currentPage + 1)} of {Math.max(totalPages, 1)}
            </span>
          </div>
          <div className={styles.previewCanvasWrapper}>
            {pdfUrl ? (
              <PDFPreview
                url={pdfUrl}
                page={Math.max(1, currentPage + 1)}
                className={styles.pdfPreviewCanvas}
              />
            ) : (
              <div className={styles.previewPlaceholder}>
                {isGeneratingPdf ? "Generating PDF preview…" : "PDF preview unavailable"}
              </div>
            )}
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

      <div className={styles.hiddenInvoice} ref={invoiceRef} aria-hidden="true">
        <div className="invoice-page invoice-container" data-preview-role="measure">
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

            <div className="notes" dangerouslySetInnerHTML={{ __html: notes }} />

            <div className="footer">{project?.company || "Company Name"}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoicePreviewContent;
