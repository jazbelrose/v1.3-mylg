import React, { Fragment, useEffect, useMemo, useState } from "react";

import { pdf as createPdf } from "@react-pdf/renderer";

import { getFileUrl } from "@/shared/utils/api";
import PDFPreview from "@/dashboard/project/components/Shared/PDFPreview";
import PdfInvoice from "./PdfInvoice";

import styles from "./invoice-preview-modal.module.css";
import type { ProjectLike, RowData } from "./invoicePreviewTypes";
import { formatCurrency } from "./invoicePreviewUtils";

const useSyncedInput = (
  value: string
): [string, React.Dispatch<React.SetStateAction<string>>] => {
  const [internal, setInternal] = useState(value);
  useEffect(() => {
    setInternal(value);
  }, [value]);
  return [internal, setInternal];
};

const htmlToPlainText = (html: string): string => {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>(\s|&nbsp;)*/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r/g, "")
    .trim();
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const plainTextToHtml = (text: string): string => {
  if (!text) return "";
  return escapeHtml(text).replace(/\r?\n/g, "<br />");
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
  currentRows: RowData[];
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
  currentRows: _currentRows,
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

  const [brandNameInput, setBrandNameInput] = useSyncedInput(brandName);
  const [brandTaglineInput, setBrandTaglineInput] = useSyncedInput(brandTagline);
  const [brandAddressInput, setBrandAddressInput] = useSyncedInput(brandAddress);
  const [brandPhoneInput, setBrandPhoneInput] = useSyncedInput(brandPhone);
  const [invoiceNumberInput, setInvoiceNumberInput] = useSyncedInput(invoiceNumber);
  const [issueDateInput, setIssueDateInput] = useSyncedInput(issueDate);
  const [projectTitleInput, setProjectTitleInput] = useSyncedInput(projectTitle);
  const [customerSummaryInput, setCustomerSummaryInput] = useSyncedInput(customerSummary);
  const [invoiceSummaryInput, setInvoiceSummaryInput] = useSyncedInput(invoiceSummary);
  const [paymentSummaryInput, setPaymentSummaryInput] = useSyncedInput(paymentSummary);
  const [depositInput, setDepositInput] = useSyncedInput(formatCurrency(depositReceived));
  const [totalDueInput, setTotalDueInput] = useSyncedInput(formatCurrency(totalDue));
  const notesPlain = useMemo(() => htmlToPlainText(notes), [notes]);
  const [notesInput, setNotesInput] = useSyncedInput(notesPlain);

  const pdfElement = useMemo(
    () => (
      <PdfInvoice
        brandName={brandName || project?.company || ""}
        brandTagline={brandTagline}
        brandAddress={
          useProjectAddress ? project?.address || brandAddress : brandAddress
        }
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
      brandAddress,
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
      useProjectAddress,
    ]
  );

  const [livePdfUrl, setLivePdfUrl] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let isCancelled = false;
    let objectUrl: string | null = null;

    const generate = async () => {
      setIsGeneratingPdf(true);
      try {
        const instance = createPdf(pdfElement);
        const blob = await instance.toBlob();
        if (isCancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setLivePdfUrl(objectUrl);
      } catch (err) {
        if (!isCancelled) {
          console.error("Failed to generate invoice PDF preview", err);
          setLivePdfUrl(null);
        }
      } finally {
        if (!isCancelled) {
          setIsGeneratingPdf(false);
        }
      }
    };

    generate();

    return () => {
      isCancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [pdfElement]);

  const displayBrandName = brandName || project?.company || "Your Business Name";
  const displayBrandTagline = brandTagline || "Tagline";
  const displayBrandAddress = useProjectAddress
    ? project?.address || "Project Address"
    : brandAddress || "Business Address";
  const displayBrandPhone = brandPhone || "Phone Number";
  const displayProjectTitle = projectTitle || project?.title || "Project Title";
  const displayCustomerSummary = customerSummary || "Customer summary";
  const displayInvoiceSummary = invoiceSummary || "Invoice details";
  const displayPaymentSummary = paymentSummary || "Payment summary";

  const renderHeader = () => (
    <div className="invoice-top">
      <header className="invoice-header">
        <div className="logo-upload" aria-label="Company logo">
          {logoSrc ? (
            <img src={logoSrc} alt="Company logo" />
          ) : (
            <span>Upload Logo</span>
          )}
        </div>

        <div className="company-block">
          <div className="company-info">
            <div className="brand-name">{displayBrandName}</div>
            <div className="brand-tagline">{displayBrandTagline}</div>
            <div className="brand-address">{displayBrandAddress}</div>
            <div className="brand-phone">{displayBrandPhone}</div>
            {project?.address ? (
              <label style={{ fontSize: "0.8rem" }}>
                <input type="checkbox" checked={useProjectAddress} readOnly /> {" "}
                Use project address
              </label>
            ) : null}
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

  const renderSummary = (rows: RowData[], rowsKeyPrefix: string) => (
    <Fragment>
      <h1 className="project-title">{displayProjectTitle}</h1>

      <div className="summary">
        <div>{displayCustomerSummary}</div>
        <div>{displayInvoiceSummary}</div>
        <div>{displayPaymentSummary}</div>
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

  const handleNotesBlur = () => {
    if (notesInput === notesPlain) return;
    onNotesBlur(plainTextToHtml(notesInput));
  };

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
        .logo-upload{width:100px;height:100px;border:1px dashed #ccc;display:flex;align-items:center;justify-content:center;cursor:default;flex-shrink:0;overflow:hidden;}
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
                Total Due: <span>{formatCurrency(totalDue)}</span>
              </strong>
            </div>
          </div>

          <div className="notes" dangerouslySetInnerHTML={{ __html: notes }} />

          <div className="footer">{project?.company || "Company Name"}</div>
        </div>
      </div>

      <div className={styles.pdfEditorLayout}>
        <div className={styles.pdfCanvasColumn}>
          <div className={styles.pdfCanvasFrame}>
            {livePdfUrl ? (
              <PDFPreview
                url={livePdfUrl}
                page={Math.max(1, currentPage + 1)}
                className={styles.pdfPreviewCanvas}
                scale={1.2}
              />
            ) : (
              <div className={styles.pdfCanvasPlaceholder}>
                {isGeneratingPdf ? "Generating PDF preview…" : "PDF preview unavailable"}
              </div>
            )}
          </div>
          <div className={styles.pdfPageMeta}>
            Page {currentPage + 1} of {totalPages || 1}
          </div>
        </div>

        <div className={styles.pdfFormColumn}>
          <section className={styles.formSection}>
            <h3>Brand</h3>
            <div
              className={styles.logoPicker}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onLogoDrop}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" ||
                  event.key === " " ||
                  event.key === "Spacebar"
                ) {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
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
            <div className={styles.logoHint}>Click or drop an image to update your logo.</div>

            <div className={styles.formRow}>
              <label htmlFor="invoice-brand-name">Brand name</label>
              <input
                id="invoice-brand-name"
                className={styles.textInput}
                value={brandNameInput}
                placeholder={project?.company || "Your Business Name"}
                onChange={(e) => setBrandNameInput(e.target.value)}
                onBlur={() => onBrandNameBlur(brandNameInput)}
              />
            </div>

            <div className={styles.formRow}>
              <label htmlFor="invoice-brand-tagline">Tagline</label>
              <input
                id="invoice-brand-tagline"
                className={styles.textInput}
                value={brandTaglineInput}
                placeholder="Tagline"
                onChange={(e) => setBrandTaglineInput(e.target.value)}
                onBlur={() => onBrandTaglineBlur(brandTaglineInput)}
              />
            </div>

            <div className={styles.formRow}>
              <label htmlFor="invoice-brand-address">Address</label>
              <input
                id="invoice-brand-address"
                className={styles.textInput}
                value={brandAddressInput}
                placeholder={useProjectAddress ? project?.address || "Project Address" : "Business Address"}
                onChange={(e) => setBrandAddressInput(e.target.value)}
                onBlur={() => onBrandAddressBlur(brandAddressInput)}
                disabled={useProjectAddress}
              />
            </div>

            <div className={styles.formRow}>
              <label htmlFor="invoice-brand-phone">Phone</label>
              <input
                id="invoice-brand-phone"
                className={styles.textInput}
                value={brandPhoneInput}
                placeholder="Phone Number"
                onChange={(e) => setBrandPhoneInput(e.target.value)}
                onBlur={() => onBrandPhoneBlur(brandPhoneInput)}
              />
            </div>

            {project?.address ? (
              <label className={styles.toggleRow} htmlFor="invoice-use-project-address">
                <input
                  id="invoice-use-project-address"
                  type="checkbox"
                  checked={useProjectAddress}
                  onChange={(e) => onToggleProjectAddress(e.target.checked)}
                />
                Use project address
              </label>
            ) : null}
          </section>

          <section className={styles.formSection}>
            <h3>Invoice details</h3>
            <div className={styles.fieldGrid}>
              <div className={styles.formRow}>
                <label htmlFor="invoice-number">Invoice #</label>
                <input
                  id="invoice-number"
                  className={styles.textInput}
                  value={invoiceNumberInput}
                  onChange={(e) => setInvoiceNumberInput(e.target.value)}
                  onBlur={() => onInvoiceNumberBlur(invoiceNumberInput)}
                />
              </div>

              <div className={styles.formRow}>
                <label htmlFor="invoice-issue-date">Issue date</label>
                <input
                  id="invoice-issue-date"
                  className={styles.textInput}
                  value={issueDateInput}
                  placeholder="e.g. Jan 5, 2024"
                  onChange={(e) => setIssueDateInput(e.target.value)}
                  onBlur={() => onIssueDateBlur(issueDateInput)}
                />
              </div>

              <div className={styles.formRow}>
                <label htmlFor="invoice-due-date">Due date</label>
                <input
                  id="invoice-due-date"
                  type="date"
                  className={styles.textInput}
                  value={dueDate}
                  onChange={(e) => onDueDateChange(e.target.value)}
                />
              </div>

              <div className={styles.formRow}>
                <label htmlFor="invoice-service-date">Service date</label>
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
            <h3>Project summary</h3>
            <div className={styles.formRow}>
              <label htmlFor="invoice-project-title">Project title</label>
              <input
                id="invoice-project-title"
                className={styles.textInput}
                value={projectTitleInput}
                placeholder={project?.title || "Project Title"}
                onChange={(e) => setProjectTitleInput(e.target.value)}
                onBlur={() => onProjectTitleBlur(projectTitleInput)}
              />
            </div>

            <div className={styles.fieldGrid}>
              <div className={styles.formRow}>
                <label htmlFor="invoice-customer-summary">Customer summary</label>
                <textarea
                  id="invoice-customer-summary"
                  className={styles.textarea}
                  value={customerSummaryInput}
                  onChange={(e) => setCustomerSummaryInput(e.target.value)}
                  onBlur={() => onCustomerSummaryBlur(customerSummaryInput)}
                  rows={3}
                />
              </div>

              <div className={styles.formRow}>
                <label htmlFor="invoice-summary">Invoice details</label>
                <textarea
                  id="invoice-summary"
                  className={styles.textarea}
                  value={invoiceSummaryInput}
                  onChange={(e) => setInvoiceSummaryInput(e.target.value)}
                  onBlur={() => onInvoiceSummaryBlur(invoiceSummaryInput)}
                  rows={3}
                />
              </div>

              <div className={styles.formRow}>
                <label htmlFor="invoice-payment-summary">Payment summary</label>
                <textarea
                  id="invoice-payment-summary"
                  className={styles.textarea}
                  value={paymentSummaryInput}
                  onChange={(e) => setPaymentSummaryInput(e.target.value)}
                  onBlur={() => onPaymentSummaryBlur(paymentSummaryInput)}
                  rows={3}
                />
              </div>
            </div>
          </section>

          <section className={styles.formSection}>
            <h3>Totals</h3>
            <div className={styles.formRow}>
              <label>Subtotal</label>
              <div className={styles.readonlyValue}>{formatCurrency(subtotal)}</div>
            </div>

            <div className={styles.fieldGrid}>
              <div className={styles.formRow}>
                <label htmlFor="invoice-deposit">Deposit received</label>
                <input
                  id="invoice-deposit"
                  className={styles.textInput}
                  value={depositInput}
                  onChange={(e) => setDepositInput(e.target.value)}
                  onBlur={() => onDepositBlur(depositInput)}
                />
              </div>

              <div className={styles.formRow}>
                <label htmlFor="invoice-total-due">Total due</label>
                <input
                  id="invoice-total-due"
                  className={styles.textInput}
                  value={totalDueInput}
                  onChange={(e) => setTotalDueInput(e.target.value)}
                  onBlur={() => onTotalDueBlur(totalDueInput)}
                />
              </div>
            </div>
          </section>

          <section className={styles.formSection}>
            <h3>Notes</h3>
            <textarea
              id="invoice-notes"
              className={styles.textarea}
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              onBlur={handleNotesBlur}
              rows={4}
            />
          </section>
        </div>
      </div>
    </div>
  );
};

export default InvoicePreviewContent;
