const PATH_CACHE = new Map<string, string>();

const CIRCLE_APPROXIMATION = 0.5522847498;
const HANDLE_EXTRA = 1 - CIRCLE_APPROXIMATION;

type ResolvedCornerRadii = {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
};

export type SquircleCornerRadii = Partial<{
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
  top: number;
  bottom: number;
}>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatNumber(value: number): string {
  return Number.parseFloat(value.toFixed(4)).toString();
}

function resolveCornerRadii(
  baseRadius: number,
  width: number,
  height: number,
  overrides?: SquircleCornerRadii,
): ResolvedCornerRadii {
  const maxRadius = Math.min(width, height) / 2;
  const pick = (specific?: number, shared?: number): number => {
    if (isFiniteNumber(specific)) {
      return clamp(specific, 0, maxRadius);
    }
    if (isFiniteNumber(shared)) {
      return clamp(shared, 0, maxRadius);
    }
    return baseRadius;
  };

  let topLeft = pick(overrides?.topLeft, overrides?.top);
  let topRight = pick(overrides?.topRight, overrides?.top);
  let bottomRight = pick(overrides?.bottomRight, overrides?.bottom);
  let bottomLeft = pick(overrides?.bottomLeft, overrides?.bottom);

  const sumTop = topLeft + topRight;
  const sumBottom = bottomLeft + bottomRight;
  const sumLeft = topLeft + bottomLeft;
  const sumRight = topRight + bottomRight;

  const ratio = Math.max(
    sumTop / width,
    sumBottom / width,
    sumLeft / height,
    sumRight / height,
  );

  if (ratio > 1) {
    const scale = 1 / ratio;
    topLeft *= scale;
    topRight *= scale;
    bottomRight *= scale;
    bottomLeft *= scale;
  }

  return { topLeft, topRight, bottomRight, bottomLeft };
}

export function getSquirclePath(
  width: number,
  height: number,
  r = 20,
  k = 0.6,
  cornerRadii?: SquircleCornerRadii,
): string {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new TypeError('Width and height must be finite numbers.');
  }

  const safeWidth = Math.max(0, width);
  const safeHeight = Math.max(0, height);

  if (safeWidth === 0 || safeHeight === 0) {
    return 'M 0 0';
  }

  const radius = clamp(r, 0, Math.min(safeWidth, safeHeight) / 2);
  const smoothing = clamp(k, 0, 1);

  if (radius === 0 && !cornerRadii) {
    const rectPath = [
      'M 0 0',
      `L ${formatNumber(safeWidth)} 0`,
      `L ${formatNumber(safeWidth)} ${formatNumber(safeHeight)}`,
      `L 0 ${formatNumber(safeHeight)}`,
      'Z',
    ].join(' ');

    return rectPath;
  }

  const { topLeft, topRight, bottomRight, bottomLeft } = resolveCornerRadii(
    radius,
    safeWidth,
    safeHeight,
    cornerRadii,
  );

  if (topLeft === 0 && topRight === 0 && bottomRight === 0 && bottomLeft === 0) {
    return ['M 0 0', `L ${formatNumber(safeWidth)} 0`, `L ${formatNumber(safeWidth)} ${formatNumber(safeHeight)}`, `L 0 ${formatNumber(safeHeight)}`, 'Z'].join(' ');
  }

  const cacheKey = [
    `w${formatNumber(safeWidth)}`,
    `h${formatNumber(safeHeight)}`,
    `tl${formatNumber(topLeft)}`,
    `tr${formatNumber(topRight)}`,
    `br${formatNumber(bottomRight)}`,
    `bl${formatNumber(bottomLeft)}`,
    `k${formatNumber(smoothing)}`,
  ].join('|');
  const cached = PATH_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const handleTopLeft = topLeft * (CIRCLE_APPROXIMATION + HANDLE_EXTRA * smoothing);
  const handleTopRight = topRight * (CIRCLE_APPROXIMATION + HANDLE_EXTRA * smoothing);
  const handleBottomRight = bottomRight * (CIRCLE_APPROXIMATION + HANDLE_EXTRA * smoothing);
  const handleBottomLeft = bottomLeft * (CIRCLE_APPROXIMATION + HANDLE_EXTRA * smoothing);

  const topStartX = topLeft;
  const topEndX = safeWidth - topRight;
  const rightStartY = topRight;
  const rightEndY = safeHeight - bottomRight;
  const bottomStartX = safeWidth - bottomRight;
  const bottomEndX = bottomLeft;
  const leftStartY = safeHeight - bottomLeft;
  const leftEndY = topLeft;

  const pathSegments = [
    `M ${formatNumber(topStartX)} 0`,
    `L ${formatNumber(topEndX)} 0`,
    `C ${formatNumber(topEndX + handleTopRight)} 0 ${formatNumber(safeWidth)} ${formatNumber(rightStartY - handleTopRight)} ${formatNumber(safeWidth)} ${formatNumber(rightStartY)}`,
    `L ${formatNumber(safeWidth)} ${formatNumber(rightEndY)}`,
    `C ${formatNumber(safeWidth)} ${formatNumber(rightEndY + handleBottomRight)} ${formatNumber(bottomStartX + handleBottomRight)} ${formatNumber(safeHeight)} ${formatNumber(bottomStartX)} ${formatNumber(safeHeight)}`,
    `L ${formatNumber(bottomEndX)} ${formatNumber(safeHeight)}`,
    `C ${formatNumber(bottomEndX - handleBottomLeft)} ${formatNumber(safeHeight)} 0 ${formatNumber(leftStartY + handleBottomLeft)} 0 ${formatNumber(leftStartY)}`,
    `L 0 ${formatNumber(leftEndY)}`,
    `C 0 ${formatNumber(leftEndY - handleTopLeft)} ${formatNumber(topStartX - handleTopLeft)} 0 ${formatNumber(topStartX)} 0`,
    'Z',
  ];

  const path = pathSegments.join(' ');
  PATH_CACHE.set(cacheKey, path);
  return path;
}

export function clearSquirclePathCache(): void {
  PATH_CACHE.clear();
}









