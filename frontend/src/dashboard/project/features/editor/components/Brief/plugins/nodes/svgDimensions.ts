export const DEFAULT_SVG_WIDTH = 300;
export const DEFAULT_SVG_HEIGHT = 200;

const parseNumericDimension = (value: string | null): number | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.endsWith("%")) return null;
  const parsed = parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseViewBoxDimensions = (value: string | null) => {
  if (!value) return null;
  const tokens = value
    .trim()
    .split(/[\s,]+/)
    .map((token) => Number(token));
  if (tokens.length < 4) return null;
  const [, , width, height] = tokens;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
};

export type SvgDimensions = { width: number; height: number };

export function getSvgIntrinsicDimensions(svgText: string): SvgDimensions | null {
  if (typeof DOMParser === "undefined") return null;

  try {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const svgElement = doc.documentElement;
    if (!svgElement || svgElement.nodeName.toLowerCase() !== "svg") return null;

    const widthAttr = parseNumericDimension(svgElement.getAttribute("width"));
    const heightAttr = parseNumericDimension(svgElement.getAttribute("height"));
    if (widthAttr && heightAttr) return { width: widthAttr, height: heightAttr };

    const viewBox = parseViewBoxDimensions(svgElement.getAttribute("viewBox"));
    if (viewBox) return { width: viewBox.width, height: viewBox.height };
  } catch {
    // Ignore invalid SVG parsing
  }

  return null;
}

export function resolveSvgDimensions(
  svgText: string,
  fallback: SvgDimensions = { width: DEFAULT_SVG_WIDTH, height: DEFAULT_SVG_HEIGHT }
): SvgDimensions {
  return getSvgIntrinsicDimensions(svgText) ?? fallback;
}

export function resolveSvgScaledToWidth(
  svgText: string,
  targetWidth: number = DEFAULT_SVG_WIDTH,
  fallbackHeight: number = DEFAULT_SVG_HEIGHT
): SvgDimensions {
  const intrinsic = getSvgIntrinsicDimensions(svgText);
  if (!intrinsic || intrinsic.width <= 0 || intrinsic.height <= 0) {
    return { width: targetWidth, height: fallbackHeight };
  }
  const height = targetWidth * (intrinsic.height / intrinsic.width);
  return { width: targetWidth, height };
}

