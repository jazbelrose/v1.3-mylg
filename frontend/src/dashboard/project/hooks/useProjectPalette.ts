import { useEffect, useState } from "react";

export type ProjectAccentPalette = {
  accent: string;
  accentWeak: string;
  accentStrong: string;
  source: "image" | "fallback" | "custom";
};

export type UseProjectPaletteOptions = {
  color?: string | null;
};

const BRAND_ACCENT = "#FA3356";
const BRAND_BG = "#0c0c0c";
const WHITE = "#ffffff";

type ContrastConstraint = {
  reference: string;
  min: number;
  prefer?: "lighter" | "darker" | "auto";
};

type Bucket = {
  r: number;
  g: number;
  b: number;
  count: number;
};

const paletteCache = new Map<string, ProjectAccentPalette>();

function normalizeHexColor(color?: string | null): string | null {
  if (!color) return null;
  let value = color.trim();
  if (!value) return null;
  if (!value.startsWith("#")) {
    value = `#${value}`;
  }

  const hex = value.slice(1);
  if (!(hex.length === 3 || hex.length === 6)) return null;
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;

  const normalized =
    hex.length === 3 ? hex.split("").map((char) => char + char).join("") : hex;

  return `#${normalized.toUpperCase()}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function componentToHex(value: number): string {
  const clamped = clamp(Math.round(value), 0, 255);
  return clamped.toString(16).padStart(2, "0").toUpperCase();
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

function hexToRgbNormalized(hex: string): { r: number; g: number; b: number } {
  let value = hex.replace("#", "");
  if (value.length === 3) {
    value = value
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (value.length !== 6) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255,
  };
}

function hexToRgb255(hex: string): { r: number; g: number; b: number } {
  const { r, g, b } = hexToRgbNormalized(hex);
  return { r: r * 255, g: g * 255, b: b * 255 };
}

function rgbToHslNormalized(r: number, g: number, b: number): {
  h: number;
  s: number;
  l: number;
} {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }

  return { h, s, l };
}

function hslToRgbNormalized(h: number, s: number, l: number): {
  r: number;
  g: number;
  b: number;
} {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hue < 60) {
    r1 = c;
    g1 = x;
  } else if (hue < 120) {
    r1 = x;
    g1 = c;
  } else if (hue < 180) {
    g1 = c;
    b1 = x;
  } else if (hue < 240) {
    g1 = x;
    b1 = c;
  } else if (hue < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  return {
    r: clamp(r1 + m, 0, 1),
    g: clamp(g1 + m, 0, 1),
    b: clamp(b1 + m, 0, 1),
  };
}

function hslToHexNormalized(h: number, s: number, l: number): string {
  const { r, g, b } = hslToRgbNormalized(h, s, l);
  return rgbToHex(r * 255, g * 255, b * 255);
}

function mixColors(colorA: string, colorB: string, amount: number): string {
  const t = clamp(amount, 0, 1);
  const a = hexToRgbNormalized(colorA);
  const b = hexToRgbNormalized(colorB);
  return rgbToHex(
    (a.r * (1 - t) + b.r * t) * 255,
    (a.g * (1 - t) + b.g * t) * 255,
    (a.b * (1 - t) + b.b * t) * 255
  );
}

function clampSaturation(hex: string, min: number, max: number): string {
  const { r, g, b } = hexToRgb255(hex);
  const { h, s, l } = rgbToHslNormalized(r, g, b);
  const nextS = clamp(s, min, max);
  return hslToHexNormalized(h, nextS, l);
}

function getLuminance(hex: string): number {
  const { r, g, b } = hexToRgbNormalized(hex);
  const transform = (value: number) =>
    value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  return (
    0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b)
  );
}

function contrastRatio(hexA: string, hexB: string): number {
  const l1 = getLuminance(hexA);
  const l2 = getLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function adjustLightness(
  color: string,
  reference: string,
  minContrast: number,
  prefer: "lighter" | "darker" | "auto" = "auto"
): string {
  const { r, g, b } = hexToRgb255(color);
  const { h, s, l } = rgbToHslNormalized(r, g, b);
  let bestColor = color;
  let bestContrast = contrastRatio(color, reference);
  if (bestContrast >= minContrast) return bestColor;

  const referenceLum = getLuminance(reference);
  const colorLum = getLuminance(color);
  const directions: Array<"lighten" | "darken"> = [];
  const preferLight =
    prefer === "lighter" || (prefer === "auto" && colorLum <= referenceLum);

  directions.push(preferLight ? "lighten" : "darken");
  directions.push(preferLight ? "darken" : "lighten");

  for (const direction of directions) {
    let currentL = l;
    for (let i = 0; i < 24; i += 1) {
      currentL += direction === "lighten" ? 0.02 : -0.02;
      currentL = clamp(currentL, 0.02, 0.98);
      const candidate = hslToHexNormalized(h, s, currentL);
      const ratio = contrastRatio(candidate, reference);
      if (ratio > bestContrast) {
        bestContrast = ratio;
        bestColor = candidate;
      }
      if (ratio >= minContrast) {
        return candidate;
      }
      if (currentL === 0.02 || currentL === 0.98) {
        break;
      }
    }
  }

  return bestColor;
}

function applyContrastConstraints(
  color: string,
  constraints: ContrastConstraint[]
): string {
  let result = color;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    let updated = result;
    for (const constraint of constraints) {
      updated = adjustLightness(
        updated,
        constraint.reference,
        constraint.min,
        constraint.prefer
      );
    }
    if (updated === result) {
      return result;
    }
    result = updated;
  }
  return result;
}

function addToBucket(bucket: Bucket, r: number, g: number, b: number): void {
  bucket.r += r;
  bucket.g += g;
  bucket.b += b;
  bucket.count += 1;
}

function bucketToHex(bucket: Bucket): string | null {
  if (!bucket.count) return null;
  return rgbToHex(bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count);
}

async function extractPaletteFromImage(
  url: string
): Promise<{ vibrant: string | null; muted: string | null }> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve({ vibrant: null, muted: null });
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";

    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
    };

    img.onload = () => {
      try {
        const naturalWidth = img.naturalWidth || img.width;
        const naturalHeight = img.naturalHeight || img.height;
        if (!naturalWidth || !naturalHeight) {
          cleanup();
          resolve({ vibrant: null, muted: null });
          return;
        }

        const maxSize = 64;
        const scale = Math.max(naturalWidth, naturalHeight) / maxSize;
        const width = Math.max(1, Math.round(naturalWidth / (scale || 1)));
        const height = Math.max(1, Math.round(naturalHeight / (scale || 1)));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          cleanup();
          resolve({ vibrant: null, muted: null });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const { data } = ctx.getImageData(0, 0, width, height);

        const vibrant: Bucket = { r: 0, g: 0, b: 0, count: 0 };
        const muted: Bucket = { r: 0, g: 0, b: 0, count: 0 };
        const fallback: Bucket = { r: 0, g: 0, b: 0, count: 0 };

        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3] / 255;
          if (alpha < 0.3) continue;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const { s, l } = rgbToHslNormalized(r, g, b);
          if (l <= 0.05 || l >= 0.97) continue;
          if (s >= 0.45 && l >= 0.25 && l <= 0.75) {
            addToBucket(vibrant, r, g, b);
          } else if (s >= 0.2 && l >= 0.2 && l <= 0.8) {
            addToBucket(muted, r, g, b);
          } else {
            addToBucket(fallback, r, g, b);
          }
        }

        const vibrantHex = bucketToHex(vibrant) ?? bucketToHex(fallback);
        const mutedHex = bucketToHex(muted) ?? bucketToHex(fallback);
        cleanup();
        resolve({ vibrant: vibrantHex, muted: mutedHex });
      } catch {
        cleanup();
        resolve({ vibrant: null, muted: null });
      }
    };

    img.onerror = () => {
      cleanup();
      resolve({ vibrant: null, muted: null });
    };

    img.src = url;
  });
}

function computePaletteFromColor(color: string): ProjectAccentPalette {
  let accent = clampSaturation(color, 0.35, 0.95);
  accent = applyContrastConstraints(accent, [
    { reference: BRAND_BG, min: 3.6, prefer: "lighter" },
    { reference: WHITE, min: 2.4, prefer: "darker" },
  ]);

  let accentStrong = clampSaturation(mixColors(accent, BRAND_BG, 0.18), 0.4, 0.95);
  accentStrong = applyContrastConstraints(accentStrong, [
    { reference: BRAND_BG, min: 4.5, prefer: "lighter" },
    { reference: WHITE, min: 2.2, prefer: "darker" },
  ]);

  if (contrastRatio(accentStrong, accent) < 1.35) {
    accentStrong = applyContrastConstraints(mixColors(accent, BRAND_BG, 0.28), [
      { reference: BRAND_BG, min: 4.5, prefer: "lighter" },
      { reference: WHITE, min: 2.2, prefer: "darker" },
    ]);
  }

  let accentWeak = clampSaturation(mixColors(accent, BRAND_BG, 0.6), 0.2, 0.7);
  accentWeak = applyContrastConstraints(accentWeak, [
    { reference: WHITE, min: 4.5, prefer: "darker" },
    { reference: BRAND_BG, min: 1.6, prefer: "lighter" },
  ]);

  if (contrastRatio(accentWeak, accentStrong) < 1.2) {
    accentWeak = applyContrastConstraints(mixColors(accentStrong, BRAND_BG, 0.55), [
      { reference: WHITE, min: 4.5, prefer: "darker" },
      { reference: BRAND_BG, min: 1.6, prefer: "lighter" },
    ]);
  }

  if (contrastRatio(accentWeak, accent) < 1.25) {
    accentWeak = applyContrastConstraints(mixColors(accent, BRAND_BG, 0.7), [
      { reference: WHITE, min: 4.5, prefer: "darker" },
      { reference: BRAND_BG, min: 1.6, prefer: "lighter" },
    ]);
  }

  return {
    accent,
    accentWeak,
    accentStrong,
    source: "custom",
  };
}

const DEFAULT_PALETTE: ProjectAccentPalette = {
  accent: BRAND_ACCENT,
  accentWeak: applyContrastConstraints(
    mixColors(BRAND_ACCENT, BRAND_BG, 0.65),
    [
      { reference: WHITE, min: 4.5, prefer: "darker" },
      { reference: BRAND_BG, min: 1.6, prefer: "lighter" },
    ]
  ),
  accentStrong: applyContrastConstraints(BRAND_ACCENT, [
    { reference: BRAND_BG, min: 4.5, prefer: "lighter" },
    { reference: WHITE, min: 2.2, prefer: "darker" },
  ]),
  source: "fallback",
};

async function computePalette(imageUrl: string): Promise<ProjectAccentPalette> {
  if (!imageUrl) return DEFAULT_PALETTE;
  const cached = paletteCache.get(imageUrl);
  if (cached) return cached;

  const { vibrant, muted } = await extractPaletteFromImage(imageUrl);
  const baseCandidate = vibrant ?? muted ?? BRAND_ACCENT;
  const secondaryCandidate = muted ?? vibrant ?? BRAND_ACCENT;

  let accent = clampSaturation(baseCandidate, 0.35, 0.9);
  accent = applyContrastConstraints(accent, [
    { reference: BRAND_BG, min: 3.6, prefer: "lighter" },
    { reference: WHITE, min: 2.4, prefer: "darker" },
  ]);

  let accentStrong = clampSaturation(mixColors(accent, BRAND_ACCENT, 0.25), 0.4, 0.95);
  accentStrong = applyContrastConstraints(accentStrong, [
    { reference: BRAND_BG, min: 4.5, prefer: "lighter" },
    { reference: WHITE, min: 2.2, prefer: "darker" },
  ]);

  let accentWeak = clampSaturation(mixColors(secondaryCandidate, BRAND_BG, 0.55), 0.2, 0.7);
  accentWeak = applyContrastConstraints(accentWeak, [
    { reference: WHITE, min: 4.5, prefer: "darker" },
    { reference: BRAND_BG, min: 1.6, prefer: "lighter" },
  ]);

  if (contrastRatio(accentWeak, BRAND_BG) < 1.4) {
    accentWeak = applyContrastConstraints(mixColors(accentWeak, accent, 0.25), [
      { reference: WHITE, min: 4.5, prefer: "darker" },
      { reference: BRAND_BG, min: 1.6, prefer: "lighter" },
    ]);
  }

  if (contrastRatio(accentWeak, accentStrong) < 1.2) {
    accentWeak = applyContrastConstraints(mixColors(accentStrong, BRAND_BG, 0.6), [
      { reference: WHITE, min: 4.5, prefer: "darker" },
      { reference: BRAND_BG, min: 1.6, prefer: "lighter" },
    ]);
  }

  const palette: ProjectAccentPalette = {
    accent,
    accentWeak,
    accentStrong,
    source: vibrant || muted ? "image" : "fallback",
  };
  paletteCache.set(imageUrl, palette);
  return palette;
}

function palettesEqual(a: ProjectAccentPalette, b: ProjectAccentPalette): boolean {
  return (
    a.accent === b.accent &&
    a.accentWeak === b.accentWeak &&
    a.accentStrong === b.accentStrong &&
    a.source === b.source
  );
}

export function useProjectPalette(
  imageUrl?: string | null,
  options?: UseProjectPaletteOptions
): ProjectAccentPalette {
  const [palette, setPalette] = useState<ProjectAccentPalette>(DEFAULT_PALETTE);
  const color = options?.color;

  useEffect(() => {
    const normalizedColor = normalizeHexColor(color);
    if (normalizedColor) {
      const derived = computePaletteFromColor(normalizedColor);
      setPalette((prev) => (palettesEqual(prev, derived) ? prev : derived));
      return;
    }

    let cancelled = false;
    if (!imageUrl) {
      setPalette((prev) => (palettesEqual(prev, DEFAULT_PALETTE) ? prev : DEFAULT_PALETTE));
      return () => {
        cancelled = true;
      };
    }

    computePalette(imageUrl)
      .then((result) => {
        if (!cancelled) {
          setPalette((prev) => (palettesEqual(prev, result) ? prev : result));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPalette((prev) =>
            palettesEqual(prev, DEFAULT_PALETTE) ? prev : DEFAULT_PALETTE
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [imageUrl, color]);

  return palette;
}

export const PROJECT_BRAND_ACCENT = BRAND_ACCENT;
export const PROJECT_BRAND_BG = BRAND_BG;









