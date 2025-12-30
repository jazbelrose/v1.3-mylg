export type LayoutMode = "grid" | "masonry";

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Margin = { top: number; right: number; bottom: number; left: number };

export type PictureFrameLayoutOptions = {
  mode?: LayoutMode;
  seed?: string | number;

  canvasWidth?: number;
  canvasHeight?: number;
  margin?: number | Partial<Margin>;
  gutter?: number;

  minFrameWidth?: number;
  minFrameHeight?: number;
  maxFrameWidth?: number;
  maxFrameHeight?: number;

  grid?: {
    allowSpans?: boolean;
    maxSpan?: number;
  };

  masonry?: {
    minColumns?: number;
    maxColumns?: number;
  };

  maxAttempts?: number;
};

export type PictureFrameLayoutResult = {
  frames: Rect[];
  mode: LayoutMode;
  seed: string;
  canvas: { width: number; height: number };
  content: Rect;
  gutter: number;
  margin: Margin;
  usedFallback: boolean;
};

type Rng = {
  seed: string;
  next: () => number; // [0,1)
};

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function finitePositive(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function roundRect(rect: Rect): Rect {
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  return { x, y, width, height };
}

function normalizeMargin(margin?: number | Partial<Margin>): Margin {
  if (typeof margin === "number") {
    const v = Math.max(0, margin);
    return { top: v, right: v, bottom: v, left: v };
  }
  const top = Math.max(0, margin?.top ?? 0);
  const right = Math.max(0, margin?.right ?? 0);
  const bottom = Math.max(0, margin?.bottom ?? 0);
  const left = Math.max(0, margin?.left ?? 0);
  return { top, right, bottom, left };
}

function computeContentRect(canvasWidth: number, canvasHeight: number, margin: Margin): Rect {
  const x = margin.left;
  const y = margin.top;
  const width = canvasWidth - margin.left - margin.right;
  const height = canvasHeight - margin.top - margin.bottom;

  if (width <= 1 || height <= 1) {
    return { x: 0, y: 0, width: Math.max(1, canvasWidth), height: Math.max(1, canvasHeight) };
  }

  return { x, y, width, height };
}

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createSeededRng(seed?: string | number): Rng {
  const seedString = seed == null ? "0" : String(seed);
  const hash = xmur3(seedString)();
  const next = mulberry32(hash);
  return { seed: seedString, next };
}

function randInt(rng: Rng, min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi <= lo) return lo;
  return lo + Math.floor(rng.next() * (hi - lo + 1));
}

function choice<T>(rng: Rng, values: readonly T[]): T {
  return values[Math.floor(rng.next() * values.length)]!;
}

function rectsOverlap(a: Rect, b: Rect, epsilon = 0): boolean {
  return !(
    a.x + a.width <= b.x + epsilon ||
    b.x + b.width <= a.x + epsilon ||
    a.y + a.height <= b.y + epsilon ||
    b.y + b.height <= a.y + epsilon
  );
}

function validateLayout(frames: Rect[], content: Rect): boolean {
  for (const f of frames) {
    if (!Number.isFinite(f.x) || !Number.isFinite(f.y) || !Number.isFinite(f.width) || !Number.isFinite(f.height)) {
      return false;
    }
    if (f.width <= 0 || f.height <= 0) return false;
    if (f.x < content.x - 1e-6) return false;
    if (f.y < content.y - 1e-6) return false;
    if (f.x + f.width > content.x + content.width + 1e-6) return false;
    if (f.y + f.height > content.y + content.height + 1e-6) return false;
  }

  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      if (rectsOverlap(frames[i]!, frames[j]!, 0)) {
        return false;
      }
    }
  }
  return true;
}

function clampGutterToFit(content: Rect, cols: number, rows: number, desiredGutter: number): number {
  const gutter = Math.max(0, desiredGutter);
  if (cols <= 1 && rows <= 1) return 0;

  const maxGutterW =
    cols <= 1 ? gutter : (content.width - cols * 1) / Math.max(1, cols - 1);
  const maxGutterH =
    rows <= 1 ? gutter : (content.height - rows * 1) / Math.max(1, rows - 1);

  if (!Number.isFinite(maxGutterW) || !Number.isFinite(maxGutterH)) return 0;
  return clamp(gutter, 0, Math.max(0, Math.min(maxGutterW, maxGutterH)));
}

function gridFallback(count: number, content: Rect, gutter: number): Rect[] {
  if (count <= 0) return [];

  const aspect = content.width / content.height;
  const idealCols = Math.max(1, Math.round(Math.sqrt(count * aspect)));
  const cols = clamp(idealCols, 1, count);
  const rows = Math.ceil(count / cols);

  const g = clampGutterToFit(content, cols, rows, gutter);
  const cellW = (content.width - (cols - 1) * g) / cols;
  const cellH = (content.height - (rows - 1) * g) / rows;

  const frames: Rect[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = content.x + col * (cellW + g);
    const y = content.y + row * (cellH + g);
    frames.push(roundRect({ x, y, width: cellW, height: cellH }));
  }
  return frames;
}

function pickGridDims(count: number, content: Rect, gutter: number, minW: number, minH: number): { cols: number; rows: number } | null {
  const aspect = content.width / content.height;
  const idealCols = clamp(Math.round(Math.sqrt(count * aspect)), 1, count);
  const candidates: number[] = [];
  for (let delta = -3; delta <= 3; delta++) {
    const c = clamp(idealCols + delta, 1, count);
    if (!candidates.includes(c)) candidates.push(c);
  }

  let best: { cols: number; rows: number; score: number } | null = null;
  for (const cols of candidates) {
    const rows = Math.ceil(count / cols);
    const g = clampGutterToFit(content, cols, rows, gutter);
    const cellW = (content.width - (cols - 1) * g) / cols;
    const cellH = (content.height - (rows - 1) * g) / rows;
    if (cellW <= 0 || cellH <= 0) continue;

    const minPenalty = Math.max(0, minW - cellW) + Math.max(0, minH - cellH);
    const shapePenalty = Math.abs(cellW / cellH - 1) * 0.5;
    const score = minPenalty * 10 + shapePenalty;
    if (!best || score < best.score) best = { cols, rows, score };
  }

  return best ? { cols: best.cols, rows: best.rows } : null;
}

function tryGenerateGrid(
  rng: Rng,
  count: number,
  content: Rect,
  gutter: number,
  options: { allowSpans: boolean; maxSpan: number; minW: number; minH: number }
): Rect[] | null {
  if (count <= 0) return [];

  const dims = pickGridDims(count, content, gutter, options.minW, options.minH);
  if (!dims) return null;
  const cols = dims.cols;
  const rows = dims.rows;
  const g = clampGutterToFit(content, cols, rows, gutter);
  const cellW = (content.width - (cols - 1) * g) / cols;
  const cellH = (content.height - (rows - 1) * g) / rows;
  if (cellW <= 0 || cellH <= 0) return null;

  const occupied: boolean[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));

  const frames: Rect[] = [];
  let placed = 0;

  for (let row = 0; row < rows && placed < count; row++) {
    for (let col = 0; col < cols && placed < count; col++) {
      if (occupied[row]![col]!) continue;

      const wantsSpan = options.allowSpans && rng.next() < (count <= 6 ? 0.35 : 0.22);
      const maxSpan = clamp(options.maxSpan, 1, Math.max(cols, rows));
      const spanX = wantsSpan ? randInt(rng, 1, Math.min(maxSpan, cols - col)) : 1;
      const spanY = wantsSpan ? randInt(rng, 1, Math.min(maxSpan, rows - row)) : 1;

      let finalSpanX = spanX;
      let finalSpanY = spanY;

      const canPlace = (sx: number, sy: number): boolean => {
        if (col + sx > cols || row + sy > rows) return false;
        for (let r = row; r < row + sy; r++) {
          for (let c = col; c < col + sx; c++) {
            if (occupied[r]![c]!) return false;
          }
        }
        return true;
      };

      if (!canPlace(finalSpanX, finalSpanY)) {
        finalSpanX = 1;
        finalSpanY = 1;
      }

      for (let r = row; r < row + finalSpanY; r++) {
        for (let c = col; c < col + finalSpanX; c++) {
          occupied[r]![c] = true;
        }
      }

      const x = content.x + col * (cellW + g);
      const y = content.y + row * (cellH + g);
      const width = finalSpanX * cellW + (finalSpanX - 1) * g;
      const height = finalSpanY * cellH + (finalSpanY - 1) * g;
      frames.push(roundRect({ x, y, width, height }));
      placed++;
    }
  }

  return placed === count ? frames : null;
}

function pickMasonryColumns(count: number, content: Rect, rng: Rng, gutter: number, minW: number, options?: { minColumns?: number; maxColumns?: number }): number | null {
  const minColumns = clamp(options?.minColumns ?? 2, 1, Math.max(1, count));
  const maxColumns = clamp(options?.maxColumns ?? 6, minColumns, Math.max(1, count));

  let base = 2;
  if (count >= 10) base = 4;
  else if (count >= 6) base = 3;
  else if (count >= 3) base = 2;

  const candidate = clamp(base + (rng.next() < 0.25 ? 1 : 0), minColumns, maxColumns);
  const colW = (content.width - (candidate - 1) * gutter) / candidate;
  if (colW < minW) {
    for (let c = candidate; c >= minColumns; c--) {
      const w = (content.width - (c - 1) * gutter) / c;
      if (w >= minW && w > 0) return c;
    }
  }
  return colW > 0 ? candidate : null;
}

function tryGenerateMasonry(
  rng: Rng,
  count: number,
  content: Rect,
  gutter: number,
  constraints: { minW: number; minH: number; maxH: number },
  options?: { minColumns?: number; maxColumns?: number }
): Rect[] | null {
  if (count <= 0) return [];

  const cols = pickMasonryColumns(count, content, rng, gutter, constraints.minW, options);
  if (!cols) return null;
  const g = clampGutterToFit(content, cols, 1, gutter);
  const colW = (content.width - (cols - 1) * g) / cols;
  if (colW <= 0) return null;

  const ratioBuckets = [0.55, 0.7, 0.85, 1.05, 1.25, 1.5] as const;
  const rawHeights: number[] = [];
  for (let i = 0; i < count; i++) {
    const ratio = choice(rng, ratioBuckets);
    const jitter = 0.9 + rng.next() * 0.2;
    const h = clamp(colW * ratio * jitter, constraints.minH, constraints.maxH);
    rawHeights.push(h);
  }

  const columns: Array<Array<{ index: number; height: number }>> = Array.from({ length: cols }, () => []);
  const colHeights = Array.from({ length: cols }, () => 0);
  for (let i = 0; i < count; i++) {
    let bestCol = 0;
    for (let c = 1; c < cols; c++) {
      if (colHeights[c]! < colHeights[bestCol]!) bestCol = c;
    }
    columns[bestCol]!.push({ index: i, height: rawHeights[i]! });
    colHeights[bestCol] = colHeights[bestCol]! + rawHeights[i]! + (columns[bestCol]!.length > 1 ? g : 0);
  }

  let tallestCol = 0;
  for (let c = 1; c < cols; c++) {
    if (colHeights[c]! > colHeights[tallestCol]!) tallestCol = c;
  }
  const tallestItems = columns[tallestCol]!;
  const tallestGutters = Math.max(0, tallestItems.length - 1) * g;
  const tallestHeights = tallestItems.reduce((sum, it) => sum + it.height, 0);
  const availableForHeights = content.height - tallestGutters;
  const scale = tallestHeights > 0 ? clamp(availableForHeights / tallestHeights, 0, 1) : 1;
  if (scale <= 0) return null;

  const frames: Rect[] = new Array(count);
  for (let c = 0; c < cols; c++) {
    const x = content.x + c * (colW + g);
    let y = content.y;
    for (const item of columns[c]!) {
      const height = Math.max(1, item.height * scale);
      frames[item.index] = roundRect({ x, y, width: colW, height });
      y += height + g;
    }
  }

  return frames.every(Boolean) ? frames : null;
}

export function generatePictureFrameLayout(count: number, options: PictureFrameLayoutOptions = {}): PictureFrameLayoutResult {
  const canvasWidth = finitePositive(options.canvasWidth, 1920);
  const canvasHeight = finitePositive(options.canvasHeight, 1080);
  const seedRng = createSeededRng(options.seed);
  const mode: LayoutMode = options.mode ?? "grid";

  const baseMargin = normalizeMargin(options.margin ?? { top: 96, right: 120, bottom: 96, left: 120 });
  const baseGutter = Math.max(0, finitePositive(options.gutter, 24));
  const baseContent = computeContentRect(canvasWidth, canvasHeight, baseMargin);

  const minFrameWidth = Math.max(1, finitePositive(options.minFrameWidth, 220));
  const minFrameHeight = Math.max(1, finitePositive(options.minFrameHeight, 160));
  const maxFrameWidth = Math.max(minFrameWidth, finitePositive(options.maxFrameWidth, baseContent.width));
  const maxFrameHeight = Math.max(minFrameHeight, finitePositive(options.maxFrameHeight, baseContent.height));

  const maxAttempts = clamp(options.maxAttempts ?? 24, 1, 100);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const jitter = attempt === 0 ? 1 : 0.85 ** attempt;
    const gutter = Math.max(0, Math.round(baseGutter * jitter));
    const margin = normalizeMargin({
      top: Math.round(baseMargin.top * jitter),
      right: Math.round(baseMargin.right * jitter),
      bottom: Math.round(baseMargin.bottom * jitter),
      left: Math.round(baseMargin.left * jitter),
    });
    const content = computeContentRect(canvasWidth, canvasHeight, margin);

    const rng = attempt === 0 ? seedRng : createSeededRng(`${seedRng.seed}:${attempt}`);

    let frames: Rect[] | null = null;
    if (mode === "grid") {
      frames = tryGenerateGrid(rng, count, content, gutter, {
        allowSpans: options.grid?.allowSpans ?? true,
        maxSpan: options.grid?.maxSpan ?? (count <= 4 ? 3 : 2),
        minW: minFrameWidth,
        minH: minFrameHeight,
      });
    } else {
      frames = tryGenerateMasonry(rng, count, content, gutter, { minW: minFrameWidth, minH: minFrameHeight, maxH: maxFrameHeight }, options.masonry);
    }

    if (!frames) continue;
    frames = frames.map((f) => {
      const clampedW = clamp(f.width, 1, maxFrameWidth);
      const clampedH = clamp(f.height, 1, maxFrameHeight);
      const x = clamp(f.x, content.x, content.x + content.width - clampedW);
      const y = clamp(f.y, content.y, content.y + content.height - clampedH);
      return roundRect({ x, y, width: clampedW, height: clampedH });
    });

    if (!validateLayout(frames, content)) continue;
    return {
      frames,
      mode,
      seed: rng.seed,
      canvas: { width: canvasWidth, height: canvasHeight },
      content,
      gutter,
      margin,
      usedFallback: false,
    };
  }

  const fallbackMargin = baseMargin;
  const fallbackContent = baseContent;
  const fallbackFrames = gridFallback(count, fallbackContent, baseGutter);

  return {
    frames: fallbackFrames,
    mode,
    seed: seedRng.seed,
    canvas: { width: canvasWidth, height: canvasHeight },
    content: fallbackContent,
    gutter: baseGutter,
    margin: fallbackMargin,
    usedFallback: true,
  };
}
