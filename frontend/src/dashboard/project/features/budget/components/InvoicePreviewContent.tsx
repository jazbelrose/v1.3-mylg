import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getFileUrl } from "@/shared/utils/api";
import PDFPreview from "@/dashboard/project/components/Shared/PDFPreview";

import InvoiceDocument from "./InvoiceDocument";
import { invoiceStyles } from "./invoiceStyles";
import styles from "./invoice-preview-modal.module.css";
import type { ProjectLike, RowData } from "./invoicePreviewTypes";
import { formatCurrency } from "./invoicePreviewUtils";

interface InvoicePreviewContentProps {
  invoiceRef: React.RefObject<HTMLDivElement>;
  previewRef: React.RefObject<HTMLDivElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  pages: RowData[][];
  selectedPages: number[];
  allowSave: boolean;
  onSaveInvoice: () => void;
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

type FormDraftField =
  | "brandName"
  | "brandTagline"
  | "brandAddress"
  | "brandPhone"
  | "invoiceNumber"
  | "issueDate"
  | "dueDate"
  | "serviceDate"
  | "projectTitle"
  | "customerSummary"
  | "invoiceSummary"
  | "paymentSummary";

type FormDraftState = Record<FormDraftField, string>;

const htmlToPlainText = (input: string): string => {
  if (!input) return "";
  return input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<\/?[^>]+(>|$)/g, "")
    .trim();
};

const plainTextToHtml = (input: string): string => {
  if (!input.trim()) return "<p></p>";
  return input
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
    .join("");
};

const formatNumberInput = (value: number): string => {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(2);
};

const InvoicePreviewContent: React.FC<InvoicePreviewContentProps> = ({
  invoiceRef,
  previewRef,
  fileInputRef,
  pages,
  selectedPages,
  allowSave,
  onSaveInvoice,
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
  const logoSrc = useMemo(() => {
    if (logoDataUrl) return logoDataUrl;
    if (brandLogoKey) return getFileUrl(brandLogoKey);
    return "";
  }, [brandLogoKey, logoDataUrl]);

  const [formDraft, setFormDraft] = useState<FormDraftState>(() => ({
    brandName,
    brandTagline,
    brandAddress,
    brandPhone,
    invoiceNumber,
    issueDate,
    dueDate,
    serviceDate,
    projectTitle,
    customerSummary,
    invoiceSummary,
    paymentSummary,
  }));
  const [useProjectAddressDraft, setUseProjectAddressDraft] = useState<boolean>(useProjectAddress);
  const [notesDraft, setNotesDraft] = useState<string>(() => htmlToPlainText(notes));
  const [depositInput, setDepositInput] = useState<string>(() => formatNumberInput(depositReceived));
  const [totalDueInput, setTotalDueInput] = useState<string>(() => formatNumberInput(totalDue));
  const [hasDraftChanges, setHasDraftChanges] = useState(false);

  const committedValues = useMemo(
    () => ({
      brandName,
      brandTagline,
      brandAddress,
      brandPhone,
      invoiceNumber,
      issueDate,
      dueDate,
      serviceDate,
      projectTitle,
      customerSummary,
      invoiceSummary,
      paymentSummary,
      useProjectAddress,
      notes,
      depositReceived,
      totalDue,
    }),
    [
      brandAddress,
      brandName,
      brandPhone,
      brandTagline,
      customerSummary,
      depositReceived,
      dueDate,
      invoiceNumber,
      invoiceSummary,
      issueDate,
      notes,
      paymentSummary,
      projectTitle,
      serviceDate,
      totalDue,
      useProjectAddress,
    ]
  );

  const committedSnapshot = useMemo(() => JSON.stringify(committedValues), [committedValues]);
  const committedSnapshotRef = useRef(committedSnapshot);
  const hasDraftChangesRef = useRef(hasDraftChanges);

  useEffect(() => {
    hasDraftChangesRef.current = hasDraftChanges;
  }, [hasDraftChanges]);

  useEffect(() => {
    if (committedSnapshot === committedSnapshotRef.current) return;
    if (hasDraftChangesRef.current) return;
    committedSnapshotRef.current = committedSnapshot;
    setFormDraft({
      brandName: committedValues.brandName,
      brandTagline: committedValues.brandTagline,
      brandAddress: committedValues.brandAddress,
      brandPhone: committedValues.brandPhone,
      invoiceNumber: committedValues.invoiceNumber,
      issueDate: committedValues.issueDate,
      dueDate: committedValues.dueDate,
      serviceDate: committedValues.serviceDate,
      projectTitle: committedValues.projectTitle,
      customerSummary: committedValues.customerSummary,
      invoiceSummary: committedValues.invoiceSummary,
      paymentSummary: committedValues.paymentSummary,
    });
    setUseProjectAddressDraft(committedValues.useProjectAddress);
    setNotesDraft(htmlToPlainText(committedValues.notes));
    setDepositInput(formatNumberInput(committedValues.depositReceived));
    setTotalDueInput(formatNumberInput(committedValues.totalDue));
  }, [committedSnapshot, committedValues]);

  const updateDraftField = useCallback((field: FormDraftField, value: string) => {
    setHasDraftChanges(true);
    setFormDraft((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleNotesChange = useCallback((value: string) => {
    setHasDraftChanges(true);
    setNotesDraft(value);
  }, []);

  const handleDepositChange = useCallback((value: string) => {
    setHasDraftChanges(true);
    setDepositInput(value);
  }, []);

  const handleTotalDueChange = useCallback((value: string) => {
    setHasDraftChanges(true);
    setTotalDueInput(value);
  }, []);

  const handleProjectAddressDraftChange = useCallback((checked: boolean) => {
    setHasDraftChanges(true);
    setUseProjectAddressDraft(checked);
  }, []);

  const {
    brandName: draftBrandName,
    brandTagline: draftBrandTagline,
    brandAddress: draftBrandAddress,
    brandPhone: draftBrandPhone,
    invoiceNumber: draftInvoiceNumber,
    issueDate: draftIssueDate,
    dueDate: draftDueDate,
    serviceDate: draftServiceDate,
    projectTitle: draftProjectTitle,
    customerSummary: draftCustomerSummary,
    invoiceSummary: draftInvoiceSummary,
    paymentSummary: draftPaymentSummary,
  } = formDraft;

  const handleApplyUpdates = useCallback(() => {
    onBrandNameBlur(draftBrandName);
    onBrandTaglineBlur(draftBrandTagline);
    onBrandAddressBlur(draftBrandAddress);
    onBrandPhoneBlur(draftBrandPhone);
    onToggleProjectAddress(useProjectAddressDraft);
    onInvoiceNumberBlur(draftInvoiceNumber);
    onIssueDateBlur(draftIssueDate);
    onDueDateChange(draftDueDate);
    onServiceDateChange(draftServiceDate);
    onProjectTitleBlur(draftProjectTitle);
    onCustomerSummaryBlur(draftCustomerSummary);
    onInvoiceSummaryBlur(draftInvoiceSummary);
    onPaymentSummaryBlur(draftPaymentSummary);
    onNotesBlur(plainTextToHtml(notesDraft));
    onDepositBlur(depositInput);
    onTotalDueBlur(totalDueInput);
    setHasDraftChanges(false);
  }, [
    draftBrandAddress,
    draftBrandName,
    draftBrandPhone,
    draftBrandTagline,
    draftCustomerSummary,
    draftDueDate,
    draftInvoiceNumber,
    draftInvoiceSummary,
    draftIssueDate,
    draftPaymentSummary,
    draftProjectTitle,
    draftServiceDate,
    depositInput,
    notesDraft,
    onBrandAddressBlur,
    onBrandNameBlur,
    onBrandPhoneBlur,
    onBrandTaglineBlur,
    onCustomerSummaryBlur,
    onDepositBlur,
    onDueDateChange,
    onInvoiceNumberBlur,
    onInvoiceSummaryBlur,
    onIssueDateBlur,
    onNotesBlur,
    onPaymentSummaryBlur,
    onProjectTitleBlur,
    onServiceDateChange,
    onTotalDueBlur,
    totalDueInput,
    useProjectAddressDraft,
    onToggleProjectAddress,
  ]);

  const handleSaveButtonClick = useCallback(() => {
    if (hasDraftChanges) return;
    onSaveInvoice();
  }, [hasDraftChanges, onSaveInvoice]);

  const handleLogoDropInternal: React.DragEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      event.preventDefault();
      onLogoDrop(event);
    },
    [onLogoDrop]
  );

  const handleLogoZoneClick = useCallback(() => {
    fileInputRef.current?.click();
  }, [fileInputRef]);

  const handleLogoZoneKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        fileInputRef.current?.click();
      }
    },
    [fileInputRef]
  );

  const previewPageIndexes = useMemo(() => {
    if (pages.length === 0) return [];
    const indexes =
      selectedPages.length > 0 ? selectedPages : pages.map((_, index) => index);
    return indexes
      .filter((index) => index >= 0 && index < pages.length)
      .sort((a, b) => a - b);
  }, [pages, selectedPages]);

  const previewPages = useMemo(() => {
    if (pages.length === 0) return [rowsData];
    const indexes =
      previewPageIndexes.length > 0
        ? previewPageIndexes
        : pages.map((_, index) => index);
    const mapped = indexes.map((index) => pages[index] ?? []);
    return mapped.length > 0 ? mapped : [rowsData];
  }, [pages, previewPageIndexes, rowsData]);

  const pageCount = previewPages.length;
  const footerText = project?.company || "";
  const notesHtml = notes?.trim() ? notes : "";

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

      <style id="invoice-preview-styles">{invoiceStyles}</style>

      <div
        ref={invoiceRef}
        style={{ position: "absolute", visibility: "hidden", pointerEvents: "none" }}
      >
        <InvoiceDocument
          logoSrc={logoSrc}
          brandName={brandName}
          brandTagline={brandTagline}
          brandAddress={brandAddress}
          brandPhone={brandPhone}
          useProjectAddress={useProjectAddress}
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
          notesHtml={notesHtml}
          pageIndex={0}
          pageCount={1}
          showTotals
          showNotes
          footerText={footerText}
          data-preview-role="measure"
        />
      </div>

      <div className={styles.pdfEditor}>
        <div className={styles.pdfViewerPane}>
          <div className={styles.invoicePreviewScroll}>
            {previewPages.map((pageRows, index) => (
              <InvoiceDocument
                key={`preview-page-${index}`}
                logoSrc={logoSrc}
                brandName={brandName}
                brandTagline={brandTagline}
                brandAddress={brandAddress}
                brandPhone={brandPhone}
                useProjectAddress={useProjectAddress}
                project={project}
                invoiceNumber={invoiceNumber}
                issueDate={issueDate}
                dueDate={dueDate}
                serviceDate={serviceDate}
                projectTitle={projectTitle}
                customerSummary={customerSummary}
                invoiceSummary={invoiceSummary}
                paymentSummary={paymentSummary}
                rows={pageRows}
                subtotal={subtotal}
                depositReceived={depositReceived}
                totalDue={totalDue}
                notesHtml={index === pageCount - 1 ? notesHtml : ""}
                pageIndex={index}
                pageCount={pageCount}
                showTotals={index === pageCount - 1}
                showNotes={index === pageCount - 1}
                footerText={footerText}
              />
            ))}
          </div>
          <div className={styles.viewerMeta}></div>
        </div>

        <div className={styles.pdfFormPane}>
          <div className={styles.formSection}>
            <div className={styles.formSectionHeader}>
              <span className={styles.formSectionTitle}>Brand</span>
              <span className={styles.helperText}>
                Update your branding to see it reflected immediately in the PDF.
              </span>
            </div>

            <div
              className={styles.logoDropzone}
              role="button"
              tabIndex={0}
              onClick={handleLogoZoneClick}
              onKeyDown={handleLogoZoneKeyDown}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleLogoDropInternal}
            >
              {logoSrc ? (
                <img src={logoSrc} alt="Uploaded logo" className={styles.logoImage} />
              ) : (
                <span className={styles.logoEmpty}>Click or drop an image</span>
              )}
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={onLogoSelect}
              />
            </div>

            <div className={styles.formRow}>
              <label htmlFor="invoice-brand-name">Brand name</label>
              <input
                id="invoice-brand-name"
                className={styles.textInput}
                value={draftBrandName}
                placeholder={project?.company || "Your business name"}
                onChange={(e) => updateDraftField("brandName", e.target.value)}
              />
            </div>

            <div className={styles.formRow}>
              <label htmlFor="invoice-brand-tagline">Tagline</label>
              <input
                id="invoice-brand-tagline"
                className={styles.textInput}
                value={draftBrandTagline}
                placeholder="Optional tagline"
                onChange={(e) => updateDraftField("brandTagline", e.target.value)}
              />
            </div>

            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={useProjectAddressDraft}
                onChange={(e) => handleProjectAddressDraftChange(e.target.checked)}
              />
              Use project address{project?.address ? ` (${project.address})` : ""}
            </label>

            <div className={styles.formRow}>
              <label htmlFor="invoice-brand-address">Brand address</label>
              <textarea
                id="invoice-brand-address"
                className={styles.textArea}
                value={draftBrandAddress}
                placeholder="Business address"
                onChange={(e) => updateDraftField("brandAddress", e.target.value)}
                disabled={useProjectAddressDraft}
              />
              {useProjectAddressDraft ? (
                <span className={styles.helperText}>
                  Using the project address. Uncheck above to edit your saved address.
                </span>
              ) : null}
            </div>

            <div className={styles.formRow}>
              <label htmlFor="invoice-brand-phone">Phone</label>
              <input
                id="invoice-brand-phone"
                className={styles.textInput}
                value={draftBrandPhone}
                placeholder="(123) 456-7890"
                onChange={(e) => updateDraftField("brandPhone", e.target.value)}
              />
            </div>
          </div>

          <div className={styles.formSection}>
            <div className={styles.formSectionHeader}>
              <span className={styles.formSectionTitle}>Invoice Details</span>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formRow}>
                <label htmlFor="invoice-number">Invoice #</label>
                <input
                  id="invoice-number"
                  className={styles.textInput}
                  value={draftInvoiceNumber}
                  onChange={(e) => updateDraftField("invoiceNumber", e.target.value)}
                />
              </div>
              <div className={styles.formRow}>
                <label htmlFor="invoice-issue-date">Issue date</label>
                <input
                  id="invoice-issue-date"
                  className={styles.textInput}
                  value={draftIssueDate}
                  onChange={(e) => updateDraftField("issueDate", e.target.value)}
                />
              </div>
              <div className={styles.formRow}>
                <label htmlFor="invoice-due-date">Due date</label>
                <input
                  id="invoice-due-date"
                  className={styles.textInput}
                  value={draftDueDate}
                  placeholder="Optional"
                  onChange={(e) => updateDraftField("dueDate", e.target.value)}
                />
              </div>
              <div className={styles.formRow}>
                <label htmlFor="invoice-service-date">Service date</label>
                <input
                  id="invoice-service-date"
                  className={styles.textInput}
                  value={draftServiceDate}
                  placeholder="Optional"
                  onChange={(e) => updateDraftField("serviceDate", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className={styles.formSection}>
            <div className={styles.formSectionHeader}>
              <span className={styles.formSectionTitle}>Summaries</span>
              <span className={styles.helperText}>
                These rich text blocks populate the top of the PDF.
              </span>
            </div>
            <div className={styles.formRow}>
              <label htmlFor="invoice-project-title">Project title</label>
              <input
                id="invoice-project-title"
                className={styles.textInput}
                value={draftProjectTitle}
                onChange={(e) => updateDraftField("projectTitle", e.target.value)}
              />
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formRow}>
                <label htmlFor="invoice-customer-summary">Customer</label>
                <textarea
                  id="invoice-customer-summary"
                  className={styles.textArea}
                  value={draftCustomerSummary}
                  onChange={(e) => updateDraftField("customerSummary", e.target.value)}
                />
              </div>
              <div className={styles.formRow}>
                <label htmlFor="invoice-summary">Invoice details</label>
                <textarea
                  id="invoice-summary"
                  className={styles.textArea}
                  value={draftInvoiceSummary}
                  onChange={(e) => updateDraftField("invoiceSummary", e.target.value)}
                />
              </div>
              <div className={styles.formRow}>
                <label htmlFor="invoice-payment-summary">Payment</label>
                <textarea
                  id="invoice-payment-summary"
                  className={styles.textArea}
                  value={draftPaymentSummary}
                  onChange={(e) => updateDraftField("paymentSummary", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className={styles.formSection}>
            <div className={styles.formSectionHeader}>
              <span className={styles.formSectionTitle}>Totals</span>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formRow}>
                <label htmlFor="invoice-subtotal">Subtotal</label>
                <input
                  id="invoice-subtotal"
                  className={styles.textInput}
                  value={formatCurrency(subtotal)}
                  readOnly
                />
              </div>
              <div className={styles.formRow}>
                <label htmlFor="invoice-deposit">Deposit received</label>
                <input
                  id="invoice-deposit"
                  className={styles.textInput}
                  value={depositInput}
                  onChange={(e) => handleDepositChange(e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div className={styles.formRow}>
                <label htmlFor="invoice-total-due">Total due</label>
                <input
                  id="invoice-total-due"
                  className={styles.textInput}
                  value={totalDueInput}
                  onChange={(e) => handleTotalDueChange(e.target.value)}
                  inputMode="decimal"
                />
              </div>
            </div>
          </div>

          <div className={styles.formSection}>
            <div className={styles.formSectionHeader}>
              <span className={styles.formSectionTitle}>Notes</span>
            </div>
            <div className={styles.formRow}>
              <textarea
                id="invoice-notes"
                className={styles.textAreaLarge}
                value={notesDraft}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Additional notes for your client"
              />
              <span className={styles.helperText}>
                Supports multi-line content. Line breaks are mirrored into the PDF.
              </span>
            </div>
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              className={`${styles.formActionButton} ${styles.updateButton}`}
              onClick={handleApplyUpdates}
              disabled={!hasDraftChanges}
            >
              Update
            </button>
            {allowSave ? (
              <button
                type="button"
                className={`${styles.formActionButton} ${styles.saveButton}`}
                onClick={handleSaveButtonClick}
                disabled={hasDraftChanges}
                title={hasDraftChanges ? "Apply updates before saving" : undefined}
              >
                Save
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoicePreviewContent;
