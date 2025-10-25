import React, { useMemo } from "react";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import type {
  BudgetItem,
  OrganizationInfoLine,
  ProjectLike,
  RowData,
} from "./invoicePreviewTypes";
import { formatCurrency, formatPercent } from "./invoicePreviewUtils";
import { getFileUrl } from "@/shared/utils/api";

interface PdfInvoiceProps {
  brandName: string;
  brandTagline: string;
  brandLogoKey: string;
  logoDataUrl: string | null;
  project?: ProjectLike | null;
  invoiceNumber: string;
  issueDate: string;
  projectName: string;
  customerSummary: string;
  rows: RowData[];
  subtotal: number;
  depositReceived: number;
  taxRate: number;
  taxAmount: number;
  totalDue: number;
  notes: string;
  organizationLines: OrganizationInfoLine[];
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
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
    marginBottom: 8,
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
    fontSize: 12,
    fontWeight: 400,
    
    letterSpacing: -1,
  },
  brandTagline: {
    fontSize: 10,
    color: "#4d4d4d",
    letterSpacing: -1,
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
    fontSize: 60,
    fontWeight: 800,
    color: "#000000",
    
    letterSpacing: -2,
  },
  headerRuleContainer: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  headerRule: {
    height: 1,
    backgroundColor: "#dddddd",
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
    
  },
  divider: {
    height: 1,
    backgroundColor: "#dddddd",
    marginBottom: 18,
  },
  table: {
    display: "flex",
    flexDirection: "column",
    borderWidth: 1,
    borderColor: "#dddddd",
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  tableHeader: {
    display: "flex",
    flexDirection: "row",
    backgroundColor: "#ffffff",
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
  summarySection: {
    marginTop: 16,
    display: "flex",
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  totals: {
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
  summaryDivider: {
    height: 1,
    backgroundColor: "#dddddd",
    marginTop: 6,
    marginBottom: 6,
    width: "60%",
    alignSelf: "flex-end",
  },
  paymentFooter: {
    marginTop: 32,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#dddddd",
  },
  paymentFooterContent: {
    display: "flex",
    flexDirection: "row",
    gap: 24,
  },
  paymentInfoColumn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  paymentInfoTitle: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "capitalize",
    marginBottom: 6,
  },
  paymentInfoLine: {
    fontSize: 10,
    lineHeight: 1.5,
  },
  paymentSpacerColumn: {
    flex: 0.3,
  },
  organizationColumn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  organizationLine: {
    fontSize: 10,
    lineHeight: 1.5,
  },
  organizationName: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 4,
  },
  organizationPlaceholder: {
    color: "#999999",
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
    brandTagline,
    brandLogoKey,
    logoDataUrl,
    project,
    invoiceNumber,
    issueDate,
    projectName,
    customerSummary,
    rows,
    subtotal,
    depositReceived,
    taxRate,
    taxAmount,
    totalDue,
    notes,
    organizationLines,
  } = props;
  const rowSegments = useMemo(() => groupRowsForPdf(rows), [rows]);
  const paymentInformationText = useMemo(() => toPlainText(notes), [notes]);
  const logoSrc = useMemo(() => getLogoSrc(logoDataUrl, brandLogoKey), [logoDataUrl, brandLogoKey]);
  const paymentInformationLines = useMemo(
    () =>
      paymentInformationText
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean),
    [paymentInformationText]
  );
  
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
  const displayBrandTagline = brandTagline.trim();
  const billedToLinesFromSummary = customerSummary
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const fallbackBilledToLines = [
    project?.clientName || "Client name",
    project?.invoiceBrandName || "",
    project?.invoiceBrandAddress || project?.clientAddress || "Client address",
    project?.clientEmail || "",
    project?.invoiceBrandPhone || project?.clientPhone || "",
  ].filter(Boolean);
  const billedToLines = billedToLinesFromSummary.length ? billedToLinesFromSummary : fallbackBilledToLines;
  const linesToRender = billedToLines.length ? billedToLines : ["Client details"];
  const projectNameForMeta = projectName || project?.title || "";
  const displayInvoiceNumber = invoiceNumber || "0000";
  const displayIssueDate = issueDate || new Date().toLocaleDateString();
  const organizationLinesToDisplay = organizationLines.filter((line) => !line.isPlaceholder);

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
              {displayBrandTagline ? (
                <Text style={styles.brandTagline}>{displayBrandTagline}</Text>
              ) : null}
            </View>

            <Text style={styles.invoiceTitle}>Invoice</Text>
          </View>

          <View
            render={({ pageNumber, totalPages }) =>
              pageNumber === 1 ? (
                <View style={styles.headerRuleContainer}>
                  <View style={styles.headerRule} />
                  <View style={styles.headerBottom}>
                    <View style={styles.billTo}>
                      <Text style={styles.billToLabel}>Billed To:</Text>
                      {linesToRender.map((line, index) => (
                        <Text key={`bill-to-${index}`}>{line}</Text>
                      ))}
                    </View>

                    <View style={styles.invoiceMeta}>
                      <Text>Invoice #: {displayInvoiceNumber}</Text>
                      {projectNameForMeta ? <Text>{projectNameForMeta}</Text> : null}
                      <Text>Issue date: {displayIssueDate}</Text>
                    </View>
                  </View>
                </View>
              ) : null
            }
          />
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

        <View style={styles.summarySection} wrap={false}>
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatCurrency(subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Deposit received</Text>
              <Text style={styles.totalValue}>{formatCurrency(depositReceived)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{`Tax (${formatPercent(taxRate)}%)`}</Text>
              <Text style={styles.totalValue}>{formatCurrency(taxAmount)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Due</Text>
              <Text style={styles.totalValue}>{formatCurrency(totalDue)}</Text>
            </View>
          </View>
        </View>
        <View
          style={styles.paymentFooter}
          render={({ pageNumber, totalPages }) =>
            pageNumber === totalPages ? (
              <View style={styles.paymentFooterContent}>
                <View style={styles.paymentInfoColumn}>
                  <Text style={styles.paymentInfoTitle}>Payment Information</Text>
                  {paymentInformationLines.map((line, index) => (
                    <Text key={`payment-line-${index}`} style={styles.paymentInfoLine}>
                      {line}
                    </Text>
                  ))}
                </View>
                <View style={styles.paymentSpacerColumn} />
                <View style={styles.organizationColumn}>
                  {organizationLinesToDisplay.map((line) => (
                    <Text
                      key={line.id}
                      style={[
                        styles.organizationLine,
                        line.isBold ? styles.organizationName : null,
                        line.isPlaceholder ? styles.organizationPlaceholder : null,
                      ]}
                    >
                      {line.text}
                    </Text>
                  ))}
                </View>
              </View>
            ) : null
          }
        />

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />

      </Page>
    </Document>
  );
};

export default PdfInvoice;
