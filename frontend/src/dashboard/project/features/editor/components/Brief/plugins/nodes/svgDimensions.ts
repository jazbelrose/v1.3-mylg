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

export type SvgBounds = { x: number; y: number; width: number; height: number };

const GRAPHICS_SELECTOR =
  "path,rect,circle,ellipse,line,polyline,polygon,text,use";

const clampNumber = (value: number): number => (Number.isFinite(value) ? value : 0);

const parseViewBox = (value: string | null): SvgBounds | null => {
  if (!value) return null;
  const tokens = value
    .trim()
    .split(/[\s,]+/)
    .map((token) => Number(token));
  if (tokens.length < 4) return null;
  const [x, y, width, height] = tokens;
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { x, y, width, height };
};

export function getSvgVisibleBoundsFromElement(
  svgElement: SVGSVGElement
): SvgBounds | null {
  if (typeof window === "undefined") return null;

  const rootCtm = svgElement.getScreenCTM?.();
  if (!rootCtm) return null;

  let invRoot: DOMMatrix;
  try {
    invRoot = rootCtm.inverse();
  } catch {
    return null;
  }

  const graphics = Array.from(svgElement.querySelectorAll(GRAPHICS_SELECTOR)) as unknown[];

  // Union in screen space first (includes all transforms), then map back to SVG user units.
  let minLeft = Number.POSITIVE_INFINITY;
  let minTop = Number.POSITIVE_INFINITY;
  let maxRight = Number.NEGATIVE_INFINITY;
  let maxBottom = Number.NEGATIVE_INFINITY;

  for (const node of graphics) {
    const el = node as SVGGraphicsElement;
    if (!el || typeof (el as any).getBoundingClientRect !== "function") continue;

    let rect: DOMRect;
    try {
      rect = el.getBoundingClientRect();
    } catch {
      continue;
    }

    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) continue;
    if (!Number.isFinite(rect.right) || !Number.isFinite(rect.bottom)) continue;
    if (rect.width <= 0 || rect.height <= 0) continue;

    minLeft = Math.min(minLeft, rect.left);
    minTop = Math.min(minTop, rect.top);
    maxRight = Math.max(maxRight, rect.right);
    maxBottom = Math.max(maxBottom, rect.bottom);
  }

  const hasScreenUnion =
    Number.isFinite(minLeft) &&
    Number.isFinite(minTop) &&
    Number.isFinite(maxRight) &&
    Number.isFinite(maxBottom);

  if (hasScreenUnion) {
    const corners = [
      new DOMPoint(minLeft, minTop),
      new DOMPoint(maxRight, minTop),
      new DOMPoint(maxRight, maxBottom),
      new DOMPoint(minLeft, maxBottom),
    ].map((p) => p.matrixTransform(invRoot));

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const p of corners) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    const width = maxX - minX;
    const height = maxY - minY;
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { x: minX, y: minY, width, height };
    }
  }

  // Fallback: if everything is clipped (rects are 0), derive bounds from geometry (ignores clipping).
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of graphics) {
    const el = node as SVGGraphicsElement;
    if (!el || typeof (el as any).getBBox !== "function") continue;
    const elCtm = el.getScreenCTM?.();
    if (!elCtm) continue;

    let bbox: DOMRect;
    try {
      bbox = el.getBBox();
    } catch {
      continue;
    }

    if (!Number.isFinite(bbox.x) || !Number.isFinite(bbox.y)) continue;
    if (!Number.isFinite(bbox.width) || !Number.isFinite(bbox.height)) continue;
    if (bbox.width <= 0 || bbox.height <= 0) continue;

    const points = [
      new DOMPoint(bbox.x, bbox.y),
      new DOMPoint(bbox.x + bbox.width, bbox.y),
      new DOMPoint(bbox.x + bbox.width, bbox.y + bbox.height),
      new DOMPoint(bbox.x, bbox.y + bbox.height),
    ]
      .map((p) => p.matrixTransform(elCtm))
      .map((p) => p.matrixTransform(invRoot));

    for (const p of points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  if (!Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 0 || height <= 0) return null;
  return { x: minX, y: minY, width, height };
}

export function cropSvgElementToVisibleBounds(
  svgElement: SVGSVGElement,
  options: { pad?: number; markAttr?: boolean } = {}
): SvgBounds | null {
  const bounds = getSvgVisibleBoundsFromElement(svgElement);
  if (!bounds) return null;

  const pad = clampNumber(options.pad ?? 0);
  const x = bounds.x - pad;
  const y = bounds.y - pad;
  const width = bounds.width + pad * 2;
  const height = bounds.height + pad * 2;
  if (width <= 0 || height <= 0) return null;

  svgElement.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  if (options.markAttr !== false) {
    svgElement.setAttribute("data-mylg-crop", "visible-2");
  }

  return { x, y, width, height };
}

export function cropSvgToVisibleBounds(
  svgText: string,
  options: { pad?: number; markAttr?: boolean } = {}
): { svg: string; bounds: SvgBounds } | null {
  if (typeof DOMParser === "undefined" || typeof document === "undefined") {
    return null;
  }

  try {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const svgElement = doc.documentElement as unknown as SVGSVGElement;
    if (!svgElement || svgElement.nodeName.toLowerCase() !== "svg") return null;

    const originalWidth = svgElement.getAttribute("width");
    const originalHeight = svgElement.getAttribute("height");
    const originalStyleWidth = (svgElement as any).style?.width ?? "";
    const originalStyleHeight = (svgElement as any).style?.height ?? "";

    // Ensure it has measurable size (percent sizes + detached DOM can yield 0).
    svgElement.setAttribute("width", "100");
    svgElement.setAttribute("height", "100");
    svgElement.style.width = "100px";
    svgElement.style.height = "100px";

    // Ensure a viewBox exists if possible, so getBBox coordinates are stable.
    if (!svgElement.hasAttribute("viewBox")) {
      const w = parseNumericDimension(originalWidth) ?? 0;
      const h = parseNumericDimension(originalHeight) ?? 0;
      if (w > 0 && h > 0) {
        svgElement.setAttribute("viewBox", `0 0 ${w} ${h}`);
      }
    }

    const wrapper = document.createElement("div");
    wrapper.style.position = "absolute";
    wrapper.style.left = "-100000px";
    wrapper.style.top = "-100000px";
    wrapper.style.width = "0";
    wrapper.style.height = "0";
    wrapper.style.overflow = "hidden";
    wrapper.style.visibility = "hidden";

    wrapper.appendChild(svgElement);
    document.body.appendChild(wrapper);

    const before = parseViewBox(svgElement.getAttribute("viewBox"));
    const bounds = cropSvgElementToVisibleBounds(svgElement, options);

    // Restore width/height attributes to avoid mutating authoring intent.
    if (originalWidth === null) svgElement.removeAttribute("width");
    else svgElement.setAttribute("width", originalWidth);
    if (originalHeight === null) svgElement.removeAttribute("height");
    else svgElement.setAttribute("height", originalHeight);
    svgElement.style.width = originalStyleWidth;
    svgElement.style.height = originalStyleHeight;

    const after = parseViewBox(svgElement.getAttribute("viewBox"));
    const changed =
      !!bounds &&
      (!before ||
        !after ||
        Math.abs(before.x - after.x) > 0.01 ||
        Math.abs(before.y - after.y) > 0.01 ||
        Math.abs(before.width - after.width) > 0.01 ||
        Math.abs(before.height - after.height) > 0.01);

    const svg = new XMLSerializer().serializeToString(svgElement);
    document.body.removeChild(wrapper);

    if (!bounds || !changed) return null;
    return { svg, bounds };
  } catch {
    return null;
  }
}
