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
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  notesParagraph: {
    fontSize: 10,
    lineHeight: 1.5,
  },
  inlineBold: {
    fontWeight: 700,
  },
  inlineItalic: {
    fontStyle: "italic",
  },
  inlineUnderline: {
    textDecoration: "underline",
  },
  notesList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  notesListItem: {
    display: "flex",
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
  },
  notesBullet: {
    fontSize: 10,
    lineHeight: 1.5,
  },
  notesListContent: {
    fontSize: 10,
    lineHeight: 1.5,
    flex: 1,
  },
  footer: {
    marginTop: 24,
    fontSize: 10,
    color: "#666666",
  },
  pageNumber: {
    position: "absolute",
    bottom: 24,
    left: 0,
    right: 0,
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

const isBrowserEnvironment = typeof window !== "undefined" && typeof DOMParser !== "undefined";

const renderInlineNodes = (
  nodes: ChildNode[],
  keyPrefix: string,
  inheritedStyles: Record<string, unknown>[] = []
): React.ReactNode[] => {
  const children: React.ReactNode[] = [];

  nodes.forEach((node, index) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const raw = node.textContent ?? "";
      if (!raw) return;
      if (!raw.trim()) {
        children.push(
          <Text
            key={`${keyPrefix}-space-${index}`}
            style={inheritedStyles.length ? inheritedStyles : undefined}
          >
            {" "}
          </Text>
        );
        return;
      }

      const normalized = raw.replace(/\s+/g, " ");
      children.push(
        <Text
          key={`${keyPrefix}-text-${index}`}
          style={inheritedStyles.length ? inheritedStyles : undefined}
        >
          {normalized}
        </Text>
      );
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();

    if (tag === "br") {
      children.push(
        <Text
          key={`${keyPrefix}-br-${index}`}
          style={inheritedStyles.length ? inheritedStyles : undefined}
        >
          {"\n"}
        </Text>
      );
      return;
    }

    const nextStyles = [...inheritedStyles];
    if (tag === "strong" || tag === "b") nextStyles.push(styles.inlineBold);
    if (tag === "em" || tag === "i") nextStyles.push(styles.inlineItalic);
    if (tag === "u") nextStyles.push(styles.inlineUnderline);

    if (tag === "span") {
      const fontWeight = element.style.fontWeight;
      if (fontWeight && fontWeight !== "normal" && fontWeight !== "400") {
        nextStyles.push(styles.inlineBold);
      }
      if (element.style.fontStyle === "italic") {
        nextStyles.push(styles.inlineItalic);
      }
      if (element.style.textDecoration?.includes("underline")) {
        nextStyles.push(styles.inlineUnderline);
      }
    }

    children.push(
      ...renderInlineNodes(Array.from(element.childNodes), `${keyPrefix}-${index}`, nextStyles)
    );
  });

  return children;
};

const renderBlockNode = (node: ChildNode, key: string): React.ReactNode | null => {
  if (node.nodeType === Node.TEXT_NODE) {
    const raw = node.textContent ?? "";
    const normalized = raw.replace(/\s+/g, " ").trim();
    if (!normalized) return null;
    return (
      <Text key={key} style={styles.notesParagraph}>
        {normalized}
      </Text>
    );
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();

  if (tag === "br") {
    return (
      <Text key={key} style={styles.notesParagraph}>
        {"\n"}
      </Text>
    );
  }

  if (tag === "ul" || tag === "ol") {
    const ordered = tag === "ol";
    return (
      <View key={key} style={styles.notesList}>
        {Array.from(element.children).map((child, index) => (
          <View key={`${key}-item-${index}`} style={styles.notesListItem}>
            <Text style={styles.notesBullet}>{ordered ? `${index + 1}.` : "\u2022"}</Text>
            <Text style={styles.notesListContent}>
              {renderInlineNodes(Array.from(child.childNodes), `${key}-item-${index}`)}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  const inlineNodes = renderInlineNodes(Array.from(element.childNodes), `${key}-inline`);
  if (inlineNodes.length === 0) return null;

  return (
    <Text key={key} style={styles.notesParagraph}>
      {inlineNodes}
    </Text>
  );
};

const buildRichTextNodes = (html: string): React.ReactNode[] => {
  if (!html) return [];
  if (!isBrowserEnvironment) {
    const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return plain ? [<Text key="plain" style={styles.notesParagraph}>{plain}</Text>] : [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return [];

  const nodes: React.ReactNode[] = [];
  Array.from(root.childNodes).forEach((node, index) => {
    const rendered = renderBlockNode(node, `block-${index}`);
    if (rendered) nodes.push(rendered);
  });
  return nodes;
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
  const notesContent = useMemo(() => buildRichTextNodes(notes), [notes]);
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

        {notesContent.length > 0 ? <View style={styles.notes}>{notesContent}</View> : null}

        {project?.company ? <Text style={styles.footer}>{project.company}</Text> : null}

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
};

export default PdfInvoice;
