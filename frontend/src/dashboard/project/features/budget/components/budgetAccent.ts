import type { CSSProperties } from "react";
import { generateSequentialPalette } from "@/shared/utils/colorUtils";

const DEFAULT_ACCENT_COLOR = "#6E7BFF";
const DEFAULT_ACCENT_RGB = "110, 123, 255";
const DEFAULT_SHADOW_RGB = "31, 45, 124";

const normalizeHexColor = (value: string): string | null => {
  const trimmed = value.trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) {
    return null;
  }

  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  return trimmed.toUpperCase();
};

const hexToRgb = (value: string): [number, number, number] | null => {
  const normalized = value.startsWith("#") ? value.slice(1) : value;
  if (normalized.length !== 6) return null;

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  if ([r, g, b].some((component) => Number.isNaN(component))) {
    return null;
  }

  return [r, g, b];
};

const resolveAccentColor = (rawColor?: string | null): string => {
  if (typeof rawColor === "string" && rawColor.trim() !== "") {
    const normalized = normalizeHexColor(rawColor);
    if (normalized) {
      return normalized;
    }
  }

  return DEFAULT_ACCENT_COLOR;
};

export const buildBudgetAccentStyles = (rawColor?: string | null): CSSProperties => {
  const accentColor = resolveAccentColor(rawColor);

  const accentRgb = hexToRgb(accentColor);
  const accentRgbString = accentRgb ? `${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}` : DEFAULT_ACCENT_RGB;

  const palette = generateSequentialPalette(accentColor, 3);
  const gradientStart = palette[0] ?? accentColor;
  const gradientEnd = palette[palette.length - 1] ?? accentColor;

  const shadowRgb = hexToRgb(gradientEnd) ?? hexToRgb(accentColor);
  const shadowRgbString = shadowRgb ? `${shadowRgb[0]}, ${shadowRgb[1]}, ${shadowRgb[2]}` : DEFAULT_SHADOW_RGB;

  return {
    "--line-item-accent": accentColor,
    "--line-item-accent-rgb": accentRgbString,
    "--line-item-accent-gradient-start": gradientStart,
    "--line-item-accent-gradient-end": gradientEnd,
    "--line-item-accent-shadow-rgb": shadowRgbString,
  };
};

