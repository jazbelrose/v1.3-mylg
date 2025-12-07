export type TextBlockType = "paragraph" | "quote" | "code" | "h1" | "h2" | "ul" | "ol";

export const SUPPORTED_BLOCK_TYPES: ReadonlySet<TextBlockType> = new Set([
  "paragraph",
  "quote",
  "code",
  "h1",
  "h2",
  "ul",
  "ol",
]);

export const BLOCK_TYPE_LABELS: Record<TextBlockType, string> = {
  paragraph: "Body",
  quote: "Quote",
  code: "Code",
  h1: "Heading",
  h2: "Subheading",
  ul: "Bulleted List",
  ol: "Numbered List",
};

export const FONT_FAMILIES = [
  "Helvetica Special",
  "Helvetica Black",
  "Helvetica Light",
  "Helvetica Neue",
  "Helvetica Medium",
  "mylg-serif",
] as const;

export type FontFamily = (typeof FONT_FAMILIES)[number];

export const FONT_FAMILY_CSS_VALUES: Record<FontFamily, string> = {
  "Helvetica Special": "var(--font-family-helvetica-special)",
  "Helvetica Black": "var(--font-family-helvetica-black)",
  "Helvetica Light": "var(--font-family-helvetica-light)",
  "Helvetica Neue": "var(--font-family-helvetica-neue)",
  "Helvetica Medium": "var(--font-family-helvetica-medium)",
  "mylg-serif": "var(--font-family-serif)",
};

export const FONT_FAMILY_WEIGHTS: Record<FontFamily, string> = {
  "Helvetica Special": "700",
  "Helvetica Black": "900",
  "Helvetica Light": "300",
  "Helvetica Neue": "400",
  "Helvetica Medium": "500",
  "mylg-serif": "500",
};

export const FONT_SIZES = ["12px", "14px", "16px", "18px", "24px", "32px", "48px"] as const;
export type FontSize = (typeof FONT_SIZES)[number];

export const DEFAULT_FONT_FAMILY: FontFamily = "Helvetica Neue";
export const DEFAULT_FONT_SIZE: FontSize = "16px";
export const DEFAULT_TEXT_COLOR = "#000000";
export const DEFAULT_BG_COLOR = "#ffffff";

const cssValueToFont = new Map<string, FontFamily>(
  Object.entries(FONT_FAMILY_CSS_VALUES).map(([family, cssValue]) => [cssValue, family as FontFamily])
);

export function resolveFontFamilyFromCss(value: string | null | undefined): FontFamily {
  if (!value) return DEFAULT_FONT_FAMILY;
  const trimmed = value.trim();
  return cssValueToFont.get(trimmed) ?? DEFAULT_FONT_FAMILY;
}
