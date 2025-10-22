import React, { useMemo } from "react";
import {
  Document,
  Image,
  Link,
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
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  notesParagraph: {
    marginBottom: 2,
  },
  notesBreak: {
    height: 6,
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
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginBottom: 6,
  },
  listItem: {
    display: "flex",
    flexDirection: "row",
    gap: 6,
  },
  listBullet: {
    width: 14,
  },
  listContent: {
    flex: 1,
  },
  link: {
    color: "#1a73e8",
    textDecoration: "underline",
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

type TextNode = { type: "text"; value: string };
type ElementNode = {
  type: "element";
  tag: string;
  attributes: Record<string, string>;
  children: HtmlNode[];
};
type HtmlNode = TextNode | ElementNode;

const INLINE_TAGS = new Set([
  "strong",
  "b",
  "em",
  "i",
  "u",
  "span",
  "a",
  "small",
  "sup",
  "sub",
  "br",
]);

const decodeHtmlEntities = (input: string): string =>
  input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

const parseAttributes = (input: string): Record<string, string> => {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(input))) {
    const name = match[1].toLowerCase();
    const value = decodeHtmlEntities(match[3] || match[4] || match[5] || "");
    attrs[name] = value;
  }
  return attrs;
};

const appendText = (parent: ElementNode, value: string) => {
  const decoded = decodeHtmlEntities(value);
  if (!decoded) return;
  const last = parent.children[parent.children.length - 1];
  if (last && last.type === "text") {
    last.value += decoded;
  } else {
    parent.children.push({ type: "text", value: decoded });
  }
};

const parseHtmlToNodes = (html: string): HtmlNode[] => {
  if (!html) return [];
  const root: ElementNode = { type: "element", tag: "root", attributes: {}, children: [] };
  const stack: ElementNode[] = [root];
  const tagRegex = /<\/?([a-zA-Z0-9]+)([^>]*)>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(html))) {
    if (match.index > lastIndex) {
      appendText(stack[stack.length - 1], html.slice(lastIndex, match.index));
    }

    const [fullMatch, rawTag, rawAttrs] = match;
    const tag = rawTag.toLowerCase();
    const isClosing = fullMatch.startsWith("</");
    const selfClosing = fullMatch.endsWith("/>") || tag === "br";

    if (isClosing) {
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
    } else {
      const node: ElementNode = {
        type: "element",
        tag,
        attributes: parseAttributes(rawAttrs || ""),
        children: [],
      };
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) {
        stack.push(node);
      }
    }

    lastIndex = tagRegex.lastIndex;
  }

  if (lastIndex < html.length) {
    appendText(stack[stack.length - 1], html.slice(lastIndex));
  }

  return root.children;
};

const renderInlineNodes = (nodes: HtmlNode[], keyPrefix: string): React.ReactNode[] =>
  nodes.flatMap((node, index) => {
    const key = `${keyPrefix}-inline-${index}`;
    if (node.type === "text") {
      if (!node.value) return [];
      return <Text key={key}>{node.value}</Text>;
    }

    if (node.tag === "br") {
      return <Text key={key}>{"\n"}</Text>;
    }

    if (node.tag === "strong" || node.tag === "b") {
      return (
        <Text key={key} style={styles.inlineBold}>
          {renderInlineNodes(node.children, key)}
        </Text>
      );
    }

    if (node.tag === "em" || node.tag === "i") {
      return (
        <Text key={key} style={styles.inlineItalic}>
          {renderInlineNodes(node.children, key)}
        </Text>
      );
    }

    if (node.tag === "u") {
      return (
        <Text key={key} style={styles.inlineUnderline}>
          {renderInlineNodes(node.children, key)}
        </Text>
      );
    }

    if (node.tag === "a") {
      const href = node.attributes.href || node.attributes["data-href"] || "";
      const children = renderInlineNodes(node.children, key);
      if (!href) {
        return children;
      }
      return (
        <Link key={key} src={href} style={styles.link}>
          {children.length ? children : href}
        </Link>
      );
    }

    return renderInlineNodes(node.children, key);
  });

const renderBlockNodes = (nodes: HtmlNode[], keyPrefix: string): React.ReactNode[] => {
  const elements: React.ReactNode[] = [];
  let inlineBuffer: HtmlNode[] = [];

  const flushInline = (bufferKey: string) => {
    if (!inlineBuffer.length) return;
    const hasContent = inlineBuffer.some((node) => {
      if (node.type === "text") return node.value.trim().length > 0;
      return node.type === "element" && node.tag !== "br";
    });
    const content = renderInlineNodes(inlineBuffer, bufferKey);
    inlineBuffer = [];
    if (!hasContent || !content.length) return;
    elements.push(
      <View key={`${bufferKey}-paragraph`} style={styles.notesParagraph}>
        <Text>{content}</Text>
      </View>
    );
  };

  nodes.forEach((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === "text" || (node.type === "element" && INLINE_TAGS.has(node.tag))) {
      inlineBuffer.push(node);
      return;
    }

    flushInline(`${key}-inline`);

    if (node.type === "element") {
      if (node.tag === "p" || node.tag === "div") {
        const content = renderInlineNodes(node.children, `${key}-inline`);
        if (content.length) {
          elements.push(
            <View key={`${key}-paragraph`} style={styles.notesParagraph}>
              <Text>{content}</Text>
            </View>
          );
        }
        return;
      }

      if (node.tag === "ul" || node.tag === "ol") {
        const isOrdered = node.tag === "ol";
        let counter = 1;
        const items = node.children.filter(
          (child): child is ElementNode => child.type === "element" && child.tag === "li"
        );
        if (items.length) {
          elements.push(
            <View key={`${key}-list`} style={styles.list}>
              {items.map((item, itemIdx) => {
                const bullet = isOrdered ? `${counter++}.` : "•";
                return (
                  <View key={`${key}-item-${itemIdx}`} style={styles.listItem}>
                    <Text style={styles.listBullet}>{bullet}</Text>
                    <Text style={styles.listContent}>
                      {renderInlineNodes(item.children, `${key}-item-${itemIdx}`)}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        }
        return;
      }

      if (node.tag === "br") {
        elements.push(<View key={`${key}-break`} style={styles.notesBreak} />);
        return;
      }

      elements.push(...renderBlockNodes(node.children, key));
    }
  });

  flushInline(`${keyPrefix}-inline-tail`);

  return elements;
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
  const notesContent = useMemo(() => renderBlockNodes(parseHtmlToNodes(notes || ""), "notes"), [notes]);
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

        {notesContent.length ? <View style={styles.notes}>{notesContent}</View> : null}

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
