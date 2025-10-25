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
import type {
  GroupField,
  OrganizationInfoLine,
  ProjectLike,
  RowData,
} from "./invoicePreviewTypes";
import { formatCurrency, formatPercent } from "./invoicePreviewUtils";

interface InvoicePreviewContentProps {
  invoiceRef: React.RefObject<HTMLDivElement>;
  previewRef: React.RefObject<HTMLDivElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  allowSave: boolean;
  onSaveInvoice: () => void;
  groupFields: Array<{ label: string; value: GroupField }>;
  groupField: GroupField;
  onGroupFieldChange: (value: GroupField) => void;
  groupOptions: string[];
  groupValues: string[];
  onToggleGroupValue: (value: string) => void;
  onToggleAllGroupValues: (checked: boolean) => void;
  pages: RowData[][];
  selectedPages: number[];
  onTogglePage: (index: number) => void;
  onToggleAllPages: (checked: boolean) => void;
  isDirty: boolean;
  onSaveHeader: () => void;
  showSaved: boolean;
  logoDataUrl: string | null;
  brandLogoKey: string;
  onLogoSelect: React.ChangeEventHandler<HTMLInputElement>;
  onLogoDrop: React.DragEventHandler<HTMLDivElement>;
  brandName: string;
  onBrandNameBlur: (value: string) => void;
  brandTagline: string;
  onBrandTaglineBlur: (value: string) => void;
  project?: ProjectLike | null;
  invoiceNumber: string;
  onInvoiceNumberBlur: (value: string) => void;
  issueDate: string;
  onIssueDateBlur: (value: string) => void;
  projectName: string;
  onProjectNameBlur: (value: string) => void;
  customerSummary: string;
  onCustomerSummaryBlur: (value: string) => void;
  rowsData: RowData[];
  organizationLines: OrganizationInfoLine[];
  organizationName: string;
  onOrganizationNameBlur: (value: string) => void;
  organizationAddress: string;
  onOrganizationAddressBlur: (value: string) => void;
  organizationPhone: string;
  onOrganizationPhoneBlur: (value: string) => void;
  organizationEmail: string;
  onOrganizationEmailBlur: (value: string) => void;
  currentPage: number;
  totalPages: number;
  subtotal: number;
  depositReceived: number;
  onDepositBlur: (value: string) => void;
  taxRate: number;
  taxAmount: number;
  onTaxRateBlur: (value: string) => void;
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
  | "invoiceNumber"
  | "issueDate"
  | "projectName"
  | "customerSummary"
  | "organizationName"
  | "organizationAddress"
  | "organizationPhone"
  | "organizationEmail";

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
  groupFields,
  groupField,
  onGroupFieldChange,
  groupOptions,
  groupValues,
  onToggleGroupValue,
  onToggleAllGroupValues,
  pages,
  selectedPages,
  onTogglePage,
  onToggleAllPages,
  isDirty,
  onSaveHeader,
  showSaved,
  logoDataUrl,
  brandLogoKey,
  onLogoSelect,
  onLogoDrop,
  brandName,
  onBrandNameBlur,
  brandTagline,
  onBrandTaglineBlur,
  project,
  invoiceNumber,
  onInvoiceNumberBlur,
  issueDate,
  onIssueDateBlur,
  projectName,
  onProjectNameBlur,
  customerSummary,
  onCustomerSummaryBlur,
  rowsData,
  organizationLines,
  organizationName,
  onOrganizationNameBlur,
  organizationAddress,
  onOrganizationAddressBlur,
  organizationPhone,
  onOrganizationPhoneBlur,
  organizationEmail,
  onOrganizationEmailBlur,
  currentPage,
  subtotal,
  depositReceived,
  onDepositBlur,
  taxRate,
  taxAmount,
  onTaxRateBlur,
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

  const pdfBrandName = useMemo(() => brandName.trim(), [brandName]);
  const pdfBrandTagline = useMemo(() => brandTagline.trim(), [brandTagline]);
  const [formDraft, setFormDraft] = useState<FormDraftState>(() => ({
    brandName,
    brandTagline,
    invoiceNumber,
    issueDate,
    projectName,
    customerSummary,
    organizationName,
    organizationAddress,
    organizationPhone,
    organizationEmail,
  }));
  const [notesDraft, setNotesDraft] = useState<string>(() => htmlToPlainText(notes));
  const [depositInput, setDepositInput] = useState<string>(() => formatNumberInput(depositReceived));
  const [taxRateInput, setTaxRateInput] = useState<string>(() => formatNumberInput(taxRate));
  const [totalDueInput, setTotalDueInput] = useState<string>(() => formatNumberInput(totalDue));
  const [hasDraftChanges, setHasDraftChanges] = useState(false);

  const formattedTaxRate = useMemo(() => formatPercent(taxRate), [taxRate]);

  const committedValues = useMemo(
    () => ({
      brandName,
      brandTagline,
      invoiceNumber,
      issueDate,
      projectName,
      customerSummary,
      organizationName,
      organizationAddress,
      organizationPhone,
      organizationEmail,
      notes,
      depositReceived,
      taxRate,
      totalDue,
    }),
    [
      brandName,
      brandTagline,
      customerSummary,
      organizationAddress,
      organizationEmail,
      organizationName,
      organizationPhone,
      depositReceived,
      taxRate,
      invoiceNumber,
      issueDate,
      projectName,
      notes,
      totalDue,
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
      invoiceNumber: committedValues.invoiceNumber,
      issueDate: committedValues.issueDate,
      projectName: committedValues.projectName,
      customerSummary: committedValues.customerSummary,
      organizationName: committedValues.organizationName,
      organizationAddress: committedValues.organizationAddress,
      organizationPhone: committedValues.organizationPhone,
      organizationEmail: committedValues.organizationEmail,
    });
    setNotesDraft(htmlToPlainText(committedValues.notes));
    setDepositInput(formatNumberInput(committedValues.depositReceived));
    setTaxRateInput(formatNumberInput(committedValues.taxRate));
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

  const handleTaxRateChange = useCallback((value: string) => {
    setHasDraftChanges(true);
    setTaxRateInput(value);
  }, []);

  const handleTotalDueChange = useCallback((value: string) => {
    setHasDraftChanges(true);
    setTotalDueInput(value);
  }, []);

  const {
    brandName: draftBrandName,
    brandTagline: draftBrandTagline,
    invoiceNumber: draftInvoiceNumber,
    issueDate: draftIssueDate,
    projectName: draftProjectName,
    customerSummary: draftCustomerSummary,
    organizationName: draftOrganizationName,
    organizationAddress: draftOrganizationAddress,
    organizationPhone: draftOrganizationPhone,
    organizationEmail: draftOrganizationEmail,
  } = formDraft;

  const handleApplyUpdates = useCallback(() => {
    onBrandNameBlur(draftBrandName);
    onBrandTaglineBlur(draftBrandTagline);
    onInvoiceNumberBlur(draftInvoiceNumber);
    onIssueDateBlur(draftIssueDate);
    onProjectNameBlur(draftProjectName);
    onCustomerSummaryBlur(draftCustomerSummary);
    onOrganizationNameBlur(draftOrganizationName);
    onOrganizationAddressBlur(draftOrganizationAddress);
    onOrganizationPhoneBlur(draftOrganizationPhone);
    onOrganizationEmailBlur(draftOrganizationEmail);
    onNotesBlur(plainTextToHtml(notesDraft));
    onDepositBlur(depositInput);
    onTaxRateBlur(taxRateInput);
    onTotalDueBlur(totalDueInput);
    setHasDraftChanges(false);
  }, [
    draftBrandName,
    draftBrandTagline,
    draftCustomerSummary,
    draftInvoiceNumber,
    draftIssueDate,
    draftProjectName,
    draftOrganizationAddress,
    draftOrganizationEmail,
    draftOrganizationName,
    draftOrganizationPhone,
    depositInput,
    taxRateInput,
    notesDraft,
    onBrandNameBlur,
    onBrandTaglineBlur,
    onCustomerSummaryBlur,
    onDepositBlur,
    onTaxRateBlur,
    onInvoiceNumberBlur,
    onIssueDateBlur,
    onProjectNameBlur,
    onNotesBlur,
    onOrganizationAddressBlur,
    onOrganizationEmailBlur,
    onOrganizationNameBlur,
    onOrganizationPhoneBlur,
    onTotalDueBlur,
    totalDueInput,
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
    []
  );

  const renderHeader = useCallback(() => {
    const displayBrandName = pdfBrandName;
    const displayBrandTagline = pdfBrandTagline;
    const displayInvoiceNumber = invoiceNumber || "0000";
    const displayIssueDate = issueDate || new Date().toLocaleDateString();
    const displayProjectName = projectName || project?.title || "";
    const draftBilledToLines = draftCustomerSummary
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const fallbackBilledToLines = [
      project?.clientName || "Client name",
      project?.clientAddress || project?.address || "Client address",
      project?.clientEmail || "",
      project?.clientPhone || "",
    ].filter(Boolean);
    const billedToLines = draftBilledToLines.length ? draftBilledToLines : fallbackBilledToLines;
    const linesToRender = billedToLines.length ? billedToLines : ["Client details"];

    return (
      <div className="invoice-top">
        <header className="invoice-header">
          <div className="header-top">
            <div className="brand-section">
              <div className="logo-upload">
                {logoSrc ? <img src={logoSrc} alt="Company logo" /> : <span>Upload Logo</span>}
              </div>
              {displayBrandName ? <div className="brand-name">{displayBrandName}</div> : null}
              {displayBrandTagline ? <div className="brand-tagline">{displayBrandTagline}</div> : null}
            </div>

            <div className="invoice-title">Invoice</div>
          </div>

          <hr className="header-divider" />

          <div className="header-bottom">
            <div className="bill-to">
              <strong>Billed To:</strong>
              {linesToRender.map((line, index) => (
                <div key={`bill-to-${index}`}>{line}</div>
              ))}
            </div>

            <div className="invoice-meta">
              <div>
                Invoice #: <span>{displayInvoiceNumber}</span>
              </div>
              {displayProjectName ? <div>{displayProjectName}</div> : null}
              <div>
                Issue date: <span>{displayIssueDate}</span>
              </div>
            </div>
          </div>
        </header>
      </div>
    );
  }, [
    invoiceNumber,
    issueDate,
    logoSrc,
    pdfBrandName,
    pdfBrandTagline,
    project,
    projectName,
    draftCustomerSummary,
  ]);

  const pdfDocument = useMemo(
    () => (
      <PdfInvoice
        brandName={pdfBrandName}
        brandTagline={pdfBrandTagline}
        brandLogoKey={brandLogoKey}
        logoDataUrl={logoDataUrl}
        project={project}
        invoiceNumber={invoiceNumber}
        issueDate={issueDate}
        projectName={projectName}
        customerSummary={customerSummary}
        rows={rowsData}
        subtotal={subtotal}
        depositReceived={depositReceived}
        taxRate={taxRate}
        taxAmount={taxAmount}
        totalDue={totalDue}
        notes={notes}
        organizationLines={organizationLines}
      />
    ),
    [
      brandLogoKey,
      depositReceived,
      invoiceNumber,
      issueDate,
      logoDataUrl,
      notes,
      organizationLines,
      customerSummary,
      pdfBrandName,
      pdfBrandTagline,
      project,
      projectName,
      rowsData,
      subtotal,
      taxAmount,
      taxRate,
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
        .invoice-page{width:min(100%,210mm);max-width:210mm;min-height:297mm;box-shadow:0 2px 6px rgba(0,0,0,0.15);margin:0 auto 20px;padding:20px 20px 60px;box-sizing:border-box;position:relative;overflow-x:hidden;display:flex;flex-direction:column;}
        .invoice-header{display:flex;flex-direction:column;gap:12px;}
        .header-top{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;}
        .brand-section{display:flex;flex-direction:column;align-items:flex-start;gap:12px;}
        .logo-upload{width:100px;height:100px;border:1px dashed #ccc;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;}
        .logo-upload img{max-width:100%;max-height:100%;object-fit:contain;}
        .brand-name{font-size:1.1rem;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;}
        .invoice-title{font-size:3rem;color:#FA3356;font-weight:800;text-align:right;margin-left:auto;text-transform:uppercase;letter-spacing:0.14em;}
        .header-divider{border:none;border-top:1px solid #e5e5e5;margin:8px 0 4px;}
        .header-bottom{display:flex;justify-content:space-between;align-items:flex-start;gap:32px;font-size:0.85rem;}
        .bill-to{flex:1;display:flex;flex-direction:column;gap:2px;}
        .invoice-meta{min-width:180px;text-align:right;font-size:0.85rem;display:flex;flex-direction:column;gap:4px;}
        .items-table-wrapper{flex:1 0 auto;}
        .items-table{width:100%;border-collapse:collapse;margin-top:20px;box-sizing:border-box;}
        .items-table th,.items-table td{border:1px solid #ddd;padding:8px;font-size:0.85rem;text-align:left;}
        .items-table th{background:#f5f5f5;font-weight:bold;}
        .group-header td{font-weight:bold;background:#fafafa;}
        .totals{margin-top:50px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;font-size:0.95rem;}
        .totals-row{display:flex;gap:6px;align-items:baseline;}
        .totals-divider{height:1px;background:#ddd;width:60%;align-self:flex-end;margin:4px 0;}
        .payment-footer{margin-top:40px;padding-top:16px;border-top:1px solid #ddd;display:grid;grid-template-columns:repeat(3,1fr);gap:32px;align-items:flex-start;}
        .payment-info-column{display:flex;flex-direction:column;gap:0.5rem;}
        .payment-info-title{font-size:0.95rem;font-weight:600;margin-bottom:0.5rem;}
        .payment-info-body{font-size:0.9rem;line-height:1.5;}
        .payment-info-body p{margin:0 0 0.5rem;}
        .payment-spacer-column{min-height:1px;}
        .organization-info-column{display:flex;flex-direction:column;gap:0.25rem;}
        .organization-line{font-size:0.9rem;line-height:1.5;color:#1a1a1a;}
        .organization-name{font-weight:600;margin-bottom:0.25rem;}
        .organization-placeholder{color:#9a9a9a;}
        .pageNumber{position:absolute;bottom:16px;left:0;right:0;text-align:center;font-family:'Roboto',Arial,sans-serif;font-size:0.85rem;color:#666;font-weight:normal;pointer-events:none;user-select:none;}
        @media print{
          .invoice-container{width:210mm;max-width:210mm;padding:20px;}
          .invoice-page{width:210mm;max-width:210mm;height:297mm;min-height:auto;box-shadow:none;margin:0;page-break-after:always;padding:20px 20px 50px;}
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
            <div className="totals-row totals-subtotal">
              Subtotal: <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="totals-row totals-deposit">
              Deposit received: <span>{formatCurrency(depositReceived)}</span>
            </div>
            <div className="totals-row totals-tax">
              Tax ({formattedTaxRate}%): <span>{formatCurrency(taxAmount)}</span>
            </div>
            <div className="totals-divider" aria-hidden="true" />
            <div className="totals-row totals-total">
              <strong>
                Total Due: <span>{formatCurrency(totalDue)}</span>
              </strong>
            </div>
          </div>

          <div className="payment-footer">
            <div className="payment-info-column">
              <div className="payment-info-title">Payment Information</div>
              <div className="payment-info-body" dangerouslySetInnerHTML={{ __html: notes }} />
            </div>
            <div className="payment-spacer-column" aria-hidden="true" />
            <div className="organization-info-column">
              {organizationLines.map((line) => {
                const classes = [
                  "organization-line",
                  line.isBold ? "organization-name" : "",
                  line.isPlaceholder ? "organization-placeholder" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <div key={line.id} className={classes}>
                    {line.text}
                  </div>
                );
              })}
            </div>
          </div>
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
          </div>
        </div>

        <div className={styles.pdfFormPane}>
          <div className={styles.formSection}>
            <div className={styles.formSectionHeader}>
              <span className={styles.formSectionTitle}>Organization</span>
              <span className={styles.helperText}>
                Update your organization details to see them reflected immediately in the PDF.
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
              <label htmlFor="invoice-brand-name">Organization name</label>
              <input
                id="invoice-brand-name"
                className={styles.textInput}
                value={draftBrandName}
                placeholder={project?.company || "Your organization name"}
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

            {isDirty ? (
              <button
                type="button"
                className={styles.headerSaveButton}
                onClick={onSaveHeader}
              >
                Save as my default invoice header
              </button>
            ) : null}
            {showSaved ? (
              <div className={styles.savedMsg} role="status">
                Header info saved! Future invoices will use this by default.
              </div>
            ) : null}
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
                <label htmlFor="invoice-project-name">Project</label>
                <input
                  id="invoice-project-name"
                  className={styles.textInput}
                  value={draftProjectName}
                  placeholder={project?.title || "Project name"}
                  onChange={(e) => updateDraftField("projectName", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className={styles.formSection}>
            <div className={styles.formSectionHeader}>
              <span className={styles.formSectionTitle}>Billed to</span>
              <span className={styles.helperText}>
                Prefilled from the client profile. Update any line to override final PDF.
              </span>
            </div>
            <div className={styles.formRow}>
              <label htmlFor="invoice-customer-summary">Client details</label>
              <textarea
                id="invoice-customer-summary"
                className={styles.textArea}
                value={draftCustomerSummary}
                onChange={(e) => updateDraftField("customerSummary", e.target.value)}
              />
            </div>
          </div>

          <div className={styles.formSection}>
            <div className={styles.formSectionHeader}>
              <span className={styles.formSectionTitle}>Grouping</span>
              <span className={styles.helperText}>
                Group By options are applied directly to the PDF preview and export.
              </span>
            </div>

            <div className={styles.formRow}>
              <label htmlFor="invoice-group-field">Group By:</label>
              <select
                id="invoice-group-field"
                className={styles.selectInput}
                value={groupField}
                onChange={(event) => onGroupFieldChange(event.target.value as GroupField)}
              >
                {groupFields.map((field) => (
                  <option key={field.value} value={field.value}>
                    {field.label}
                  </option>
                ))}
              </select>
            </div>

            {groupOptions.length > 0 ? (
              <div className={styles.groupSelect} role="group" aria-label="Groups">
                <label className={styles.groupItem}>
                  <input
                    type="checkbox"
                    checked={groupValues.length === groupOptions.length}
                    onChange={(event) => onToggleAllGroupValues(event.target.checked)}
                  />
                  Select All
                </label>
                {groupOptions.map((value) => (
                  <label key={value} className={styles.groupItem}>
                    <input
                      type="checkbox"
                      checked={groupValues.includes(value)}
                      onChange={() => onToggleGroupValue(value)}
                    />
                    {value}
                  </label>
                ))}
              </div>
            ) : (
              <div className={styles.helperText}>
                No groups available for the selected field.
              </div>
            )}
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
                <label htmlFor="invoice-tax-rate">Tax rate (%)</label>
                <input
                  id="invoice-tax-rate"
                  className={styles.textInput}
                  value={taxRateInput}
                  onChange={(e) => handleTaxRateChange(e.target.value)}
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
              <span className={styles.formSectionTitle}>Payment Information</span>
            </div>
            <div className={styles.formRow}>
              <label htmlFor="invoice-organization-name">Organization name</label>
              <input
                id="invoice-organization-name"
                className={styles.textInput}
                value={draftOrganizationName}
                placeholder="Your organization name"
                onChange={(e) => updateDraftField("organizationName", e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="invoice-organization-address">Address & Bank Information</label>
              <textarea
                id="invoice-organization-address"
                className={styles.textArea}
                value={draftOrganizationAddress}
                placeholder="Add your mailing address"
                onChange={(e) => updateDraftField("organizationAddress", e.target.value)}
                rows={3}
              />
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formRow}>
                <label htmlFor="invoice-organization-phone">Phone</label>
                <input
                  id="invoice-organization-phone"
                  className={styles.textInput}
                  value={draftOrganizationPhone}
                  placeholder="Add your phone number"
                  onChange={(e) => updateDraftField("organizationPhone", e.target.value)}
                  type="tel"
                />
              </div>
              <div className={styles.formRow}>
                <label htmlFor="invoice-organization-email">Email</label>
                <input
                  id="invoice-organization-email"
                  className={styles.textInput}
                  value={draftOrganizationEmail}
                  placeholder="Add your email address"
                  onChange={(e) => updateDraftField("organizationEmail", e.target.value)}
                  type="email"
                />
              </div>
            </div>
            <div className={styles.formRow}>
              <textarea
                id="invoice-notes"
                className={styles.textAreaLarge}
                value={notesDraft}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Bank name, account number, payment instructions"
              />
              <span className={styles.helperText}>
                Supports multi-line content. Line breaks are mirrored in the PDF footer.
              </span>
          </div>
        </div>

        {pages.length > 0 ? (
          <div className={styles.formSection}>
            <div className={styles.formSectionHeader}>
              <span className={styles.formSectionTitle}>Pages</span>
              <span className={styles.helperText}>
                Choose which pages to include when generating PDFs or saving HTML copies.
              </span>
            </div>
            <div className={styles.groupSelect} role="group" aria-label="Pages">
              <label className={styles.groupItem}>
                <input
                  type="checkbox"
                  checked={selectedPages.length === pages.length}
                  onChange={(event) => onToggleAllPages(event.target.checked)}
                />
                Select All Pages
              </label>
              {pages.map((_, index) => (
                <label key={index} className={styles.groupItem}>
                  <input
                    type="checkbox"
                    checked={selectedPages.includes(index)}
                    onChange={() => onTogglePage(index)}
                  />
                  Page {index + 1}
                </label>
              ))}
            </div>
          </div>
        ) : null}

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
