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
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Playfair Display",
  "Merriweather",
  "Source Code Pro",
] as const;

export type FontFamily = (typeof FONT_FAMILIES)[number];

export const FONT_FAMILY_CSS_VALUES: Record<FontFamily, string> = {
  "Helvetica Special": "var(--font-family-helvetica-special)",
  "Helvetica Black": "var(--font-family-helvetica-black)",
  "Helvetica Light": "var(--font-family-helvetica-light)",
  "Helvetica Neue": "var(--font-family-helvetica-neue)",
  "Helvetica Medium": "var(--font-family-helvetica-medium)",
  "mylg-serif": "var(--font-family-serif)",
  "Inter": "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  "Roboto": "'Roboto', sans-serif",
  "Open Sans": "'Open Sans', sans-serif",
  "Lato": "'Lato', sans-serif",
  "Montserrat": "'Montserrat', sans-serif",
  "Playfair Display": "'Playfair Display', serif",
  "Merriweather": "'Merriweather', serif",
  "Source Code Pro": "'Source Code Pro', monospace",
};

export const FONT_FAMILY_WEIGHTS: Record<FontFamily, string> = {
  "Helvetica Special": "700",
  "Helvetica Black": "900",
  "Helvetica Light": "300",
  "Helvetica Neue": "400",
  "Helvetica Medium": "500",
  "mylg-serif": "500",
  "Inter": "400",
  "Roboto": "400",
  "Open Sans": "400",
  "Lato": "400",
  "Montserrat": "500",
  "Playfair Display": "400",
  "Merriweather": "400",
  "Source Code Pro": "400",
};

export const FONT_SIZES = [
  "8px", "9px", "10px", "11px", "12px", "14px", "16px", "18px", "20px",
  "24px", "28px", "32px", "36px", "40px", "48px", "56px", "64px", "72px",
  "80px", "96px", "120px", "144px"
] as const;
export type FontSize = (typeof FONT_SIZES)[number];

// Line height options
export const LINE_HEIGHTS = [
  "1", "1.15", "1.25", "1.5", "1.75", "2", "2.5", "3"
] as const;
export type LineHeight = (typeof LINE_HEIGHTS)[number];
export const DEFAULT_LINE_HEIGHT: LineHeight = "1.5";

// Letter spacing (kerning) options in em units
export const LETTER_SPACINGS = [
  "-0.05em", "-0.025em", "0", "0.025em", "0.05em", "0.1em", "0.15em", "0.2em", "0.3em"
] as const;
export type LetterSpacing = (typeof LETTER_SPACINGS)[number];
export const DEFAULT_LETTER_SPACING: LetterSpacing = "0";

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
