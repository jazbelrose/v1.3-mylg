import React from "react";

import PDFPreview from "@/dashboard/project/components/Shared/PDFPreview";
import { getFileUrl } from "@/shared/utils/api";
import { formatCurrency } from "./invoicePreviewUtils";

import InvoiceNavControls from "./InvoiceNavControls";
import styles from "./invoice-preview-modal.module.css";

interface InvoicePreviewContentProps {
  pdfUrl: string | null;
  isPdfLoading: boolean;
  currentPage: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
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
  projectAddress?: string | null;
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
  subtotal: number;
  depositReceived: number;
  onDepositChange: (value: string) => void;
  totalDue: number;
  onTotalDueChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  onNotesBlur?: () => void;
}

const InvoicePreviewContent: React.FC<InvoicePreviewContentProps> = ({
  pdfUrl,
  isPdfLoading,
  currentPage,
  totalPages,
  onPrevPage,
  onNextPage,
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
  projectAddress,
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
  subtotal,
  depositReceived,
  onDepositChange,
  totalDue,
  onTotalDueChange,
  notes,
  onNotesChange,
  onNotesBlur,
}) => {
  const logoSrc = logoDataUrl || (brandLogoKey ? getFileUrl(brandLogoKey) : "");

  return (
    <div className={styles.previewWrapper}>
      <div className={styles.pdfColumn}>
        <div className={styles.pdfViewport}>
          {pdfUrl ? (
            <PDFPreview
              url={pdfUrl}
              className={styles.pdfCanvas}
              page={Math.max(1, currentPage + 1)}
            />
          ) : (
            <div className={styles.pdfPlaceholder}>
              {isPdfLoading ? "Rendering invoice…" : "PDF preview unavailable"}
            </div>
          )}
        </div>
        <InvoiceNavControls
          currentPage={currentPage}
          totalPages={totalPages}
          onPrev={onPrevPage}
          onNext={onNextPage}
        />
      </div>

      <div className={styles.editorColumn}>
        <section className={styles.editorSection}>
          <h3>Branding</h3>
          <div className={styles.fieldRow}>
            <label htmlFor="invoice-logo">Logo</label>
            <div
              className={styles.logoDropzone}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onLogoDrop}
              role="button"
              tabIndex={0}
            >
              {logoSrc ? <img src={logoSrc} alt="Company logo" /> : <span>Upload logo</span>}
              <input
                id="invoice-logo"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onLogoSelect}
                style={{ display: "none" }}
              />
            </div>
          </div>
          <label className={styles.fieldColumn}>
            Company name
            <input
              type="text"
              value={brandName}
              onChange={(e) => onBrandNameChange(e.target.value)}
            />
          </label>
          <label className={styles.fieldColumn}>
            Tagline
            <input
              type="text"
              value={brandTagline}
              onChange={(e) => onBrandTaglineChange(e.target.value)}
            />
          </label>
          <label className={styles.fieldColumn}>
            Address
            <textarea
              value={brandAddress}
              onChange={(e) => onBrandAddressChange(e.target.value)}
              rows={2}
            />
          </label>
          <label className={styles.fieldColumn}>
            Phone
            <input
              type="text"
              value={brandPhone}
              onChange={(e) => onBrandPhoneChange(e.target.value)}
            />
          </label>
          {projectAddress ? (
            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={useProjectAddress}
                onChange={(e) => onToggleProjectAddress(e.target.checked)}
              />
              Use project address ({projectAddress})
            </label>
          ) : null}
        </section>

        <section className={styles.editorSection}>
          <h3>Invoice details</h3>
          <div className={styles.fieldGrid}>
            <label>
              Invoice #
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => onInvoiceNumberChange(e.target.value)}
              />
            </label>
            <label>
              Issue date
              <input
                type="date"
                value={issueDate}
                onChange={(e) => onIssueDateChange(e.target.value)}
              />
            </label>
            <label>
              Due date
              <input type="date" value={dueDate} onChange={(e) => onDueDateChange(e.target.value)} />
            </label>
            <label>
              Service date
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => onServiceDateChange(e.target.value)}
              />
            </label>
          </div>
        </section>

        <section className={styles.editorSection}>
          <h3>Summaries</h3>
          <label className={styles.fieldColumn}>
            Project title
            <input
              type="text"
              value={projectTitle}
              onChange={(e) => onProjectTitleChange(e.target.value)}
            />
          </label>
          <label className={styles.fieldColumn}>
            Customer summary
            <textarea
              value={customerSummary}
              onChange={(e) => onCustomerSummaryChange(e.target.value)}
              rows={3}
            />
          </label>
          <label className={styles.fieldColumn}>
            Invoice summary
            <textarea
              value={invoiceSummary}
              onChange={(e) => onInvoiceSummaryChange(e.target.value)}
              rows={3}
            />
          </label>
          <label className={styles.fieldColumn}>
            Payment summary
            <textarea
              value={paymentSummary}
              onChange={(e) => onPaymentSummaryChange(e.target.value)}
              rows={3}
            />
          </label>
        </section>

        <section className={styles.editorSection}>
          <h3>Totals</h3>
          <div className={styles.fieldGrid}>
            <label>
              Subtotal
              <input type="text" value={formatCurrency(subtotal)} readOnly />
            </label>
            <label>
              Deposit received
              <input
                type="text"
                value={depositReceived.toString()}
                onChange={(e) => onDepositChange(e.target.value)}
              />
            </label>
            <label>
              Total due
              <input
                type="text"
                value={totalDue.toString()}
                onChange={(e) => onTotalDueChange(e.target.value)}
              />
            </label>
          </div>
        </section>

        <section className={styles.editorSection}>
          <h3>Notes</h3>
          <div
            className={styles.notesEditor}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => onNotesChange(e.currentTarget.innerHTML)}
            onBlur={onNotesBlur}
            dangerouslySetInnerHTML={{ __html: notes }}
          />
        </section>
      </div>
    </div>
  );
};

export default InvoicePreviewContent;
