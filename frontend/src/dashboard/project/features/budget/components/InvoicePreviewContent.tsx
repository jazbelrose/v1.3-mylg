import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { pdf as createPdf } from "@react-pdf/renderer";

import { getFileUrl } from "@/shared/utils/api";
import PDFPreview from "@/dashboard/project/components/Shared/PDFPreview";

import PdfInvoice from "./PdfInvoice";
import styles from "./invoice-preview-modal.module.css";
import type { ProjectLike, RowData } from "./invoicePreviewTypes";
import { formatCurrency } from "./invoicePreviewUtils";

interface InvoicePreviewContentProps {
  invoiceRef: React.RefObject<HTMLDivElement>;
  previewRef: React.RefObject<HTMLDivElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
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

  const pdfBrandName = useMemo(
    () => brandName || project?.company || "",
    [brandName, project]
  );
  const pdfBrandAddress = useMemo(
    () => (useProjectAddress ? project?.address || "" : brandAddress),
    [brandAddress, project, useProjectAddress]
  );

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

  const renderSummary = useCallback(
    (rows: RowData[], rowsKeyPrefix: string) => (
      <>
        <h1 className="project-title">{projectTitle || "Project Title"}</h1>

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
                      {formatCurrency(parseFloat(String(row.item.itemFinalCost || 0)) || 0)}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </>
    ),
    [customerSummary, invoiceSummary, paymentSummary, projectTitle]
  );

  const renderHeader = useCallback(() => {
    const displayBrandName = pdfBrandName || "Your Business Name";
    const displayTagline = brandTagline || "Tagline";
    const displayAddress = useProjectAddress
      ? project?.address || "Project Address"
      : brandAddress || "Business Address";
    const displayPhone = brandPhone || "Phone Number";
    const displayInvoiceNumber = invoiceNumber || "0000";
    const displayIssueDate = issueDate || new Date().toLocaleDateString();

    return (
      <div className="invoice-top">
        <header className="invoice-header">
          <div className="logo-upload">
            {logoSrc ? <img src={logoSrc} alt="Company logo" /> : <span>Upload Logo</span>}
          </div>

          <div className="company-block">
            <div className="company-info">
              <div className="brand-name">{displayBrandName}</div>
              {displayTagline ? <div className="brand-tagline">{displayTagline}</div> : null}
              {displayAddress ? <div className="brand-address">{displayAddress}</div> : null}
              {displayPhone ? <div className="brand-phone">{displayPhone}</div> : null}
              {project?.address ? (
                <div className="brand-toggle">
                  {useProjectAddress ? "Using project address" : "Using saved address"}
                </div>
              ) : null}
            </div>

            <div className="invoice-meta">
              <div className="invoice-title">Invoice</div>
              <div>
                Invoice #: <span>{displayInvoiceNumber}</span>
              </div>
              <div>
                Issue date: <span>{displayIssueDate}</span>
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

        <div className="billing-info">
          <div>
            <strong>Bill To:</strong>
            <div>{project?.clientName || "Client name"}</div>
            <div>{project?.clientAddress || "Client address"}</div>
            <div>{project?.clientEmail || ""}</div>
            <div>{project?.clientPhone || ""}</div>
          </div>
          <div>
            <strong>Project:</strong>
            <div>{project?.title || "Project Title"}</div>
            <div>{project?.projectId ? `ID: ${project.projectId}` : ""}</div>
          </div>
        </div>
      </div>
    );
  }, [
    brandAddress,
    brandPhone,
    brandTagline,
    dueDate,
    invoiceNumber,
    issueDate,
    logoSrc,
    pdfBrandName,
    project,
    serviceDate,
    useProjectAddress,
  ]);

  const pdfDocument = useMemo(
    () => (
      <PdfInvoice
        brandName={pdfBrandName}
        brandTagline={brandTagline}
        brandAddress={pdfBrandAddress}
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
      brandLogoKey,
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
      pdfBrandAddress,
      pdfBrandName,
      project,
      projectTitle,
      rowsData,
      serviceDate,
      subtotal,
      totalDue,
    ]
  );

  const isBrowser = typeof window !== "undefined";
  const inlinePdfUrlRef = useRef<string | null>(null);
  const [inlinePdfUrl, setInlinePdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isBrowser) return undefined;
    let cancelled = false;

    const renderPdf = async () => {
      try {
        const instance = createPdf(pdfDocument);
        const blob = await instance.toBlob();
        if (cancelled) return;
        const nextUrl = URL.createObjectURL(blob);
        if (inlinePdfUrlRef.current) {
          URL.revokeObjectURL(inlinePdfUrlRef.current);
        }
        inlinePdfUrlRef.current = nextUrl;
        setInlinePdfUrl(nextUrl);
      } catch (error) {
        console.error("Failed to render inline invoice preview", error);
        if (!cancelled) {
          setInlinePdfUrl(null);
        }
      }
    };

    void renderPdf();

    return () => {
      cancelled = true;
    };
  }, [isBrowser, pdfDocument]);

  useEffect(
    () => () => {
      if (inlinePdfUrlRef.current) {
        URL.revokeObjectURL(inlinePdfUrlRef.current);
        inlinePdfUrlRef.current = null;
      }
    },
    []
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
        .invoice-page{width:min(100%,210mm);max-width:210mm;min-height:297mm;box-shadow:0 2px 6px rgba(0,0,0,0.15);margin:0 auto 20px;padding:20px 20px 90px;box-sizing:border-box;position:relative;overflow-x:hidden;display:flex;flex-direction:column;}
        .invoice-header{display:flex;align-items:flex-start;gap:20px;}
        .logo-upload{width:100px;height:100px;border:1px dashed #ccc;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;}
        .logo-upload img{max-width:100%;max-height:100%;object-fit:contain;}
        .company-block{flex:1;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;}
        .company-info{display:flex;flex-direction:column;margin-top:10px;}
        .brand-name{font-size:1.2rem;font-weight:bold;}
        .brand-tagline,.brand-address,.brand-phone{font-size:0.7rem;}
        .brand-toggle{font-size:0.65rem;color:#666;margin-top:4px;}
        .invoice-meta{text-align:right;font-size:0.85rem;}
        .billing-info{margin-top:20px;display:flex;justify-content:space-between;gap:20px;font-size:0.85rem;}
        .invoice-title{font-size:2rem;color:#FA3356;font-weight:bold;text-align:right;margin-left:auto;}
        .project-title{font-size:1.5rem;font-weight:bold;text-align:center;margin:10px 0;}
        .summary{display:flex;justify-content:space-between;gap:10px;margin-bottom:10px;}
        .summary>div{flex:1;}
        .summary-divider{border:0;border-top:1px solid #ccc;margin-bottom:10px;}
        .items-table-wrapper{flex:1 0 auto;}
        .items-table{width:100%;border-collapse:collapse;margin-top:20px;box-sizing:border-box;}
        .items-table th,.items-table td{border:1px solid #ddd;padding:8px;font-size:0.85rem;text-align:left;}
        .items-table th{background:#f5f5f5;font-weight:bold;}
        .group-header td{font-weight:bold;background:#fafafa;}
        .totals{margin-top:20px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;font-size:0.95rem;}
        .totals div{display:flex;gap:6px;align-items:baseline;}
        .notes{margin-top:20px;font-size:0.9rem;line-height:1.5;}
        .notes p{margin:0 0 0.5rem;}
        .footer{font-size:0.9rem;color:#666;}
        .page-footer{position:absolute;left:20px;right:20px;bottom:20px;display:flex;flex-direction:column;gap:4px;align-items:center;}
        .pageNumber{font-family:'Roboto',Arial,sans-serif;font-size:0.85rem;color:#666;font-weight:normal;pointer-events:none;user-select:none;}
        @media print{
          .invoice-container{width:210mm;max-width:210mm;padding:20px;}
          .invoice-page{width:210mm;max-width:210mm;height:297mm;min-height:auto;box-shadow:none;margin:0;page-break-after:always;padding:20px 20px 90px;}
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
              Deposit received:
              <span>{formatCurrency(depositReceived)}</span>
            </div>
            <div>
              <strong>
                Total Due: <span>{formatCurrency(totalDue)}</span>
              </strong>
            </div>
          </div>

          <div className="notes" dangerouslySetInnerHTML={{ __html: notes }} />
        </div>

        <div className="page-footer">
          <div className="footer">{project?.company || "Company Name"}</div>
          <div className="pageNumber">Page 1 of 1</div>
        </div>
      </div>

      <div className={styles.pdfEditor}>
        <div className={styles.pdfViewerPane}>
          {inlinePdfUrl ? (
            <iframe src={inlinePdfUrl} title="Invoice PDF preview" className={styles.pdfIframe} />
          ) : (
            <div className={styles.pdfFallback}>
              {isBrowser
                ? "Rendering PDF preview…"
                : "PDF preview available once the dashboard runs in a browser."}
            </div>
          )}
          <div className={styles.viewerMeta}>
            Page {currentPage + 1} of {totalPages || 1}
          </div>
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
