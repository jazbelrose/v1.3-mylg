export const formatCurrency = (
  val: number | string | null | undefined
): string => {
  const num =
    typeof val === "number"
      ? val
      : parseFloat(String(val ?? "").replace(/[$,]/g, ""));
  if (Number.isNaN(num)) return (val as string) || "";
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const unescapeEntities = (value: string): string =>
  value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');

export const htmlToPlainText = (html: string): string => {
  if (!html) return "";
  const normalized = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r/g, "");
  return unescapeEntities(normalized).replace(/\n{3,}/g, "\n\n").trim();
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const plainTextToHtml = (text: string): string => {
  if (!text.trim()) return "";
  const lines = text.replace(/\r/g, "").split("\n");
  const htmlLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return "<p><br/></p>";
    }
    return `<p>${escapeHtml(trimmed)}</p>`;
  });
  return htmlLines.join("");
};
