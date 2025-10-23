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
  brandTagline: string;
  brandAddress: string;
  brandPhone: string;
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
    padding: 32,
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.4,
    color: "#1a1a1a",
  },
  header: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 16,
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
  companyInfo: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  brandName: {
    fontSize: 14,
    fontWeight: 700,
  },
  brandTagline: {
    fontSize: 9,
    color: "#555555",
  },
  invoiceMeta: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4,
    fontSize: 9,
  },
  invoiceTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "#FA3356",
    marginBottom: 3,
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
    borderRightWidth: 1,
    borderRightColor: "#dddddd",
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
    borderRightWidth: 1,
    borderRightColor: "#f0f0f0",
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
    fontSize: 10,
    color: "#666666",
  },
  pageFooter: {
    position: "absolute",
    left: 32,
    right: 32,
    bottom: 32,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
  },
  pageNumber: {
    textAlign: "center",
    fontSize: 9,
    color: "#666666",
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

const PdfInvoice: React.FC<PdfInvoiceProps> = ({
  brandName,
  brandTagline,
  brandAddress,
  brandPhone,
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
}) => {
  const rowSegments = useMemo(() => groupRowsForPdf(rows), [rows]);
  const notesText = useMemo(() => toPlainText(notes), [notes]);
  const logoSrc = useMemo(() => getLogoSrc(logoDataUrl, brandLogoKey), [logoDataUrl, brandLogoKey]);

  const renderItemRow = (item: BudgetItem, key: string | number) => {
    const quantity = parseFloat(String(item.quantity ?? "")) || 0;
    const amount = parseFloat(String(item.itemFinalCost ?? "")) || 0;
    const unitPrice = quantity ? amount / quantity : amount;

    return (
      <View key={key} style={styles.tableRow} wrap>
        <Text style={[styles.tableCell, styles.descriptionColumn]}>{item.description || ""}</Text>
        <Text style={[styles.tableCell, styles.numericColumn]}>{quantity ? quantity.toString() : ""}</Text>
        <Text style={[styles.tableCell, styles.numericColumn]}>{item.unit || ""}</Text>
        <Text style={[styles.tableCell, styles.numericColumn]}>{formatCurrency(unitPrice)}</Text>
        <Text style={[styles.tableCell, styles.numericColumn]}>{formatCurrency(amount)}</Text>
      </View>
    );
  };

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} fixed>
          {logoSrc ? (
            <Image src={logoSrc} style={styles.logo} />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Text style={styles.logoPlaceholderText}>Upload Logo</Text>
            </View>
          )}

          <View style={styles.companyInfo}>
            <Text style={styles.brandName}>{brandName || project?.company || ""}</Text>
            {brandTagline ? <Text style={styles.brandTagline}>{brandTagline}</Text> : null}
            {brandAddress ? <Text>{brandAddress}</Text> : null}
            {brandPhone ? <Text>{brandPhone}</Text> : null}
          </View>

          <View style={styles.invoiceMeta}>
            <Text style={styles.invoiceTitle}>Invoice</Text>
            <Text>Invoice #: {invoiceNumber}</Text>
            <Text>Issue date: {issueDate}</Text>
            {dueDate ? <Text>Due date: {dueDate}</Text> : null}
            {serviceDate ? <Text>Service date: {serviceDate}</Text> : null}
          </View>
        </View>

        <Text style={styles.projectTitle}>{projectTitle}</Text>

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

        <View style={styles.pageFooter}>
          {project?.company ? <Text style={styles.footer}>{project.company}</Text> : null}

          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
            fixed
          />
        </View>
      </Page>
    </Document>
  );
};

export default PdfInvoice;
