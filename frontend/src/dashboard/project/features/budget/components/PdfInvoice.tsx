import React, { useMemo } from "react";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import type { BudgetItem, ProjectLike, RowData } from "./invoicePreviewTypes";
import { formatCurrency } from "./invoicePreviewUtils";
import { getFileUrl } from "@/shared/utils/api";

interface PdfInvoiceProps {
  brandName: string;
  brandLogoKey: string;
  logoDataUrl: string | null;
  project?: ProjectLike | null;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  serviceDate: string;
  projectTitle: string;
  customerSummary: string;
  invoiceSummary: string;
  paymentSummary: string;
  rows: RowData[];
  subtotal: number;
  depositReceived: number;
  totalDue: number;
  notes: string;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 64,
    paddingBottom: 80,
    paddingLeft: 32,
    paddingRight: 32,
    fontFamily: "Helvetica",
    fontSize: 10,
   
    color: "#1a1a1a",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginBottom: 16,
  },
  headerTop: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },
  brandSection: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 10,
    flexShrink: 0,
  },
  logo: {
    width: 72,
    height: 72,
    objectFit: "contain",
  },
  logoPlaceholder: {
    width: 72,
    height: 72,
    borderWidth: 1,
    borderColor: "#cccccc",
    justifyContent: "center",
    alignItems: "center",
  },
  logoPlaceholderText: {
    fontSize: 8,
    color: "#777777",
  },
  brandName: {
    fontSize: 14,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  invoiceMeta: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4,
    fontSize: 9,
    textAlign: "right",
  },
  invoiceTitle: {
    fontSize: 26,
    fontWeight: 800,
    color: "#FA3356",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  headerDivider: {
    height: 1,
    backgroundColor: "#dddddd",
    width: "100%",
  },
  headerBottom: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 28,
    fontSize: 9,
  },
  billTo: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  billToLabel: {
    fontWeight: 700,
    marginBottom: 2,
  },
  summary: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  summaryColumn: {
    flex: 1,
  },
  projectTitle: {
    fontSize: 16,
    fontWeight: 700,
    textAlign: "center",
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: "#dddddd",
    marginBottom: 12,
  },
  table: {
    display: "flex",
    flexDirection: "column",
    borderWidth: 1,
    borderColor: "#dddddd",
    borderLeftWidth: 0,
    borderRightWidth: 0,
  },
  tableHeader: {
    display: "flex",
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    borderBottomWidth: 1,
    borderBottomColor: "#dddddd",
    fontWeight: 700,
  },
  tableHeaderCell: {
    padding: 6,
    // no vertical border in header
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
  descriptionColumn: {
    flexGrow: 2.6,
    flexShrink: 1,
    flexBasis: 0,
  },
  numericColumn: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    textAlign: "right",
  },
  tableRow: {
    display: "flex",
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
  },
  tableCell: {
    padding: 6,
    // no vertical borders on body cells
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
  groupRow: {
    backgroundColor: "#fafafa",
    fontWeight: 700,
  },
  totals: {
    alignSelf: "flex-end",
    marginTop: 16,
    minWidth: 200,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  totalRow: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  totalLabel: {
    fontSize: 10,
  },
  totalValue: {
    fontSize: 10,
    fontWeight: 700,
  },
  notes: {
    marginTop: 16,
    fontSize: 10,
    lineHeight: 1.5,
  },
  footer: {
    marginTop: 24,
    fontSize: 10,
    color: "#666666",
  },
  pageNumber: {
    position: 'absolute',
    fontSize: 10,
    bottom: 30,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: 'grey',
  },

});

type PdfRowSegment =
  | { type: "group"; group: string }
  | { type: "groupWithItem"; group: string; item: BudgetItem | null }
  | { type: "item"; item: BudgetItem };

const groupRowsForPdf = (rows: RowData[]): PdfRowSegment[] => {
  const segments: PdfRowSegment[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.type === "group") {
      const next = rows[i + 1];
      if (next && next.type === "item") {
        segments.push({ type: "groupWithItem", group: row.group, item: next.item });
        i += 1;
      } else {
        segments.push({ type: "group", group: row.group });
      }
    } else {
      segments.push({ type: "item", item: row.item });
    }
  }
  return segments;
};

const toPlainText = (html: string): string => {
  if (!html) return "";
  return html
    .replace(/<br\s*\/>/gi, "\n")
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

const getLogoSrc = (logoDataUrl: string | null, brandLogoKey: string): string => {
  if (logoDataUrl) return logoDataUrl;
  if (!brandLogoKey) return "";
  return getFileUrl(brandLogoKey);
};

const PdfInvoice: React.FC<PdfInvoiceProps> = (props) => {
  const {
    brandName,
    brandLogoKey,
    logoDataUrl,
    project,
    invoiceNumber,
    issueDate,
    dueDate,
    serviceDate,
    projectTitle,
    customerSummary,
    invoiceSummary,
    paymentSummary,
    rows,
    subtotal,
    depositReceived,
    totalDue,
    notes,
  } = props;
  const rowSegments = useMemo(() => groupRowsForPdf(rows), [rows]);
  const notesText = useMemo(() => toPlainText(notes), [notes]);
  const logoSrc = useMemo(() => getLogoSrc(logoDataUrl, brandLogoKey), [logoDataUrl, brandLogoKey]);

  const renderItemRow = (item: BudgetItem, key: string | number) => {
    const quantity = parseFloat(String(item.quantity ?? "")) || 0;
    const amount = parseFloat(String(item.itemFinalCost ?? "")) || 0;
    const unitPrice = quantity ? amount / quantity : amount;

    return (
      <View key={key} style={styles.tableRow} wrap={false}>
        <Text style={[styles.tableCell, styles.descriptionColumn]}>{item.description || ""}</Text>
        <Text style={[styles.tableCell, styles.numericColumn]}>{quantity ? quantity.toString() : ""}</Text>
        <Text style={[styles.tableCell, styles.numericColumn]}>{item.unit || ""}</Text>
        <Text style={[styles.tableCell, styles.numericColumn]}>{formatCurrency(unitPrice)}</Text>
        <Text style={[styles.tableCell, styles.numericColumn]}>{formatCurrency(amount)}</Text>
      </View>
    );
  };

  const displayBrandName = brandName.trim();
  const billedToName = project?.clientName || "Client name";
  const billedToCompany = project?.invoiceBrandName || "";
  const billedToAddress = project?.invoiceBrandAddress || project?.clientAddress || "Client address";
  const billedToEmail = project?.clientEmail || "";
  const billedToPhone = project?.invoiceBrandPhone || project?.clientPhone || "";
  const projectTitleForMeta = projectTitle || project?.title || "";
  const displayProjectTitle = projectTitle || project?.title || "Project Title";
  const displayInvoiceNumber = invoiceNumber || "0000";
  const displayIssueDate = issueDate || new Date().toLocaleDateString();

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <View style={styles.headerTop}>
            <View style={styles.brandSection}>
              {logoSrc ? (
                <Image src={logoSrc} style={styles.logo} />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Text style={styles.logoPlaceholderText}>Upload Logo</Text>
                </View>
              )}

              {displayBrandName ? <Text style={styles.brandName}>{displayBrandName}</Text> : null}
            </View>

            <Text style={styles.invoiceTitle}>Invoice</Text>
          </View>

          <View style={styles.headerDivider} />

          <View style={styles.headerBottom}>
            <View style={styles.billTo}>
              <Text style={styles.billToLabel}>Billed To:</Text>
              <Text>{billedToName}</Text>
              {billedToCompany ? <Text>{billedToCompany}</Text> : null}
              <Text>{billedToAddress}</Text>
              {billedToEmail ? <Text>{billedToEmail}</Text> : null}
              {billedToPhone ? <Text>{billedToPhone}</Text> : null}
            </View>

            <View style={styles.invoiceMeta}>
              <Text>Invoice #: {displayInvoiceNumber}</Text>
              {projectTitleForMeta ? <Text>{projectTitleForMeta}</Text> : null}
              <Text>Issue date: {displayIssueDate}</Text>
              {dueDate ? <Text>Due date: {dueDate}</Text> : null}
              {serviceDate ? <Text>Service date: {serviceDate}</Text> : null}
            </View>
          </View>

          <View style={styles.headerDivider} />
        </View>

        <Text style={styles.projectTitle}>{displayProjectTitle}</Text>

        <View style={styles.summary}>
          <View style={styles.summaryColumn}>
            <Text>{customerSummary}</Text>
          </View>
          <View style={styles.summaryColumn}>
            <Text>{invoiceSummary}</Text>
          </View>
          <View style={styles.summaryColumn}>
            <Text>{paymentSummary}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.table}>
          <View style={styles.tableHeader} fixed>
            <Text style={[styles.tableHeaderCell, styles.descriptionColumn]}>Description</Text>
            <Text style={[styles.tableHeaderCell, styles.numericColumn]}>QTY</Text>
            <Text style={[styles.tableHeaderCell, styles.numericColumn]}>Unit</Text>
            <Text style={[styles.tableHeaderCell, styles.numericColumn]}>Unit Price</Text>
            <Text style={[styles.tableHeaderCell, styles.numericColumn]}>Amount</Text>
          </View>

          {rowSegments.map((segment, index) => {
            if (segment.type === "group") {
              return (
                <View key={`g-${segment.group}-${index}`} style={[styles.tableRow, styles.groupRow]} wrap={false}>
                  <Text style={[styles.tableCell, styles.descriptionColumn]}>{segment.group}</Text>
                  <Text style={[styles.tableCell, styles.numericColumn]} />
                  <Text style={[styles.tableCell, styles.numericColumn]} />
                  <Text style={[styles.tableCell, styles.numericColumn]} />
                  <Text style={[styles.tableCell, styles.numericColumn]} />
                </View>
              );
            }

            if (segment.type === "groupWithItem") {
              const groupKey = `gi-${segment.group}-${index}`;
              return (
                <View key={groupKey} wrap={false}>
                  <View style={[styles.tableRow, styles.groupRow]}>
                    <Text style={[styles.tableCell, styles.descriptionColumn]}>{segment.group}</Text>
                    <Text style={[styles.tableCell, styles.numericColumn]} />
                    <Text style={[styles.tableCell, styles.numericColumn]} />
                    <Text style={[styles.tableCell, styles.numericColumn]} />
                    <Text style={[styles.tableCell, styles.numericColumn]} />
                  </View>
                  {segment.item ? renderItemRow(segment.item, `${groupKey}-item`) : null}
                </View>
              );
            }

            return renderItemRow(segment.item, `i-${index}`);
          })}
        </View>

        <View style={styles.totals} wrap={false}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Deposit received</Text>
            <Text style={styles.totalValue}>{formatCurrency(depositReceived)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Due</Text>
            <Text style={styles.totalValue}>{formatCurrency(totalDue)}</Text>
          </View>
        </View>

        {notesText ? <Text style={styles.notes}>{notesText}</Text> : null}

        {project?.company ? <Text style={styles.footer}>{project.company}</Text> : null}

        
            <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => (
        `${pageNumber} / ${totalPages}`
      )} fixed />
        
      </Page>
    </Document>
  );
};

export default PdfInvoice;
