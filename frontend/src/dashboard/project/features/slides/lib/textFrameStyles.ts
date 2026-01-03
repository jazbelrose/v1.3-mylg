/**
 * Text Frame Styles - Editorial styling for text frames
 * 
 * Phase 1.5 Polish:
 * - Taste-based padding (inner margins)
 * - Optional subtle tile background
 * - Title line-balance (word splitting for better line breaks)
 * - Drop-cap presets that preserve line height
 */

import type { TasteTokens, TypePack, TextIntent, TasteModeId } from "./magicLayoutTypes";
import { getTasteMode } from "./tasteModes";

// =============================================================================
// TEXT FRAME PADDING
// =============================================================================

/** Inner padding multipliers per taste mode */
const PADDING_SCALES: Record<TasteModeId, { h: number; v: number }> = {
  "apple-clean": { h: 1.2, v: 1.0 },           // Generous horizontal
  "fashion-editorial": { h: 0.8, v: 1.2 },     // Tall, narrow
  "vaporwave-cyber": { h: 0.6, v: 0.6 },       // Tight
  "brutalist-grid": { h: 0.4, v: 0.4 },        // Minimal
  "pinterest-collage": { h: 1.0, v: 1.0 },     // Balanced
  "museum-wall": { h: 1.5, v: 1.3 },           // Gallery spacious
};

export interface TextFramePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Calculate inner padding for a text frame based on taste mode
 */
export function calculateTextFramePadding(
  frameWidth: number,
  frameHeight: number,
  tasteMode: TasteModeId,
  intent: TextIntent
): TextFramePadding {
  const basePadding = 24;
  const scales = PADDING_SCALES[tasteMode] ?? PADDING_SCALES["apple-clean"];
  
  // Intent adjustments
  const intentMultiplier: Record<TextIntent, number> = {
    headline: 1.2,
    subheadline: 1.1,
    body: 1.0,
    quote: 1.3,
    caption: 0.7,
    label: 0.5,
    custom: 1.0,
  };
  
  const multiplier = intentMultiplier[intent] ?? 1.0;
  
  return {
    top: Math.round(basePadding * scales.v * multiplier),
    right: Math.round(basePadding * scales.h * multiplier),
    bottom: Math.round(basePadding * scales.v * multiplier),
    left: Math.round(basePadding * scales.h * multiplier),
  };
}

// =============================================================================
// TILE BACKGROUND
// =============================================================================

export interface TileBackground {
  enabled: boolean;
  color: string;
  opacity: number;
  borderRadius: number;
}

/** Default tile backgrounds per taste mode */
const TILE_BACKGROUNDS: Record<TasteModeId, TileBackground> = {
  "apple-clean": {
    enabled: true,
    color: "#ffffff",
    opacity: 0.03,
    borderRadius: 16,
  },
  "fashion-editorial": {
    enabled: false,
    color: "transparent",
    opacity: 0,
    borderRadius: 0,
  },
  "vaporwave-cyber": {
    enabled: true,
    color: "#ff00ff",
    opacity: 0.05,
    borderRadius: 0,
  },
  "brutalist-grid": {
    enabled: true,
    color: "#000000",
    opacity: 0.95,
    borderRadius: 0,
  },
  "pinterest-collage": {
    enabled: true,
    color: "#ffffff",
    opacity: 0.08,
    borderRadius: 12,
  },
  "museum-wall": {
    enabled: true,
    color: "#f5f5f5",
    opacity: 0.05,
    borderRadius: 4,
  },
};

/**
 * Get tile background config for a taste mode
 */
export function getTileBackground(tasteMode: TasteModeId): TileBackground {
  return TILE_BACKGROUNDS[tasteMode] ?? TILE_BACKGROUNDS["apple-clean"];
}

// =============================================================================
// LINE BALANCE (for headlines)
// =============================================================================

/**
 * Balance text for better line breaks in headlines
 * Uses a simple algorithm to avoid orphaned words
 */
export function balanceText(
  text: string,
  maxCharsPerLine: number = 35
): string {
  if (!text || text.length <= maxCharsPerLine) {
    return text;
  }

  const words = text.split(/\s+/);
  if (words.length <= 3) {
    return text;
  }

  // Calculate ideal split point
  const totalLength = text.length;
  const idealLineLength = Math.ceil(totalLength / 2);
  
  let currentLength = 0;
  let breakIndex = 0;
  
  for (let i = 0; i < words.length; i++) {
    currentLength += words[i].length + 1;
    if (currentLength >= idealLineLength && i < words.length - 1) {
      breakIndex = i + 1;
      break;
    }
  }

  // Don't orphan a single short word
  const lastWord = words[words.length - 1];
  if (breakIndex === words.length - 1 && lastWord.length < 5) {
    breakIndex = Math.max(0, breakIndex - 1);
  }

  // Return with line break at optimal point
  const line1 = words.slice(0, breakIndex).join(" ");
  const line2 = words.slice(breakIndex).join(" ");
  
  return `${line1}\n${line2}`;
}

/**
 * Balance headline text with CSS text-wrap: balance fallback
 */
export function getBalanceStyles(intent: TextIntent): Record<string, string> {
  if (intent === "headline" || intent === "subheadline") {
    return {
      textWrap: "balance",
      wordBreak: "normal",
      overflowWrap: "break-word",
    };
  }
  return {};
}

// =============================================================================
// DROP CAP PRESETS
// =============================================================================

export interface DropCapConfig {
  enabled: boolean;
  fontSize: number;        // As multiplier of body font
  lineSpan: number;        // How many lines it spans
  fontWeight: number;
  marginRight: number;     // px
  marginTop: number;       // px offset to align with baseline
  color?: string;          // Optional color override
}

/** Drop cap presets per taste mode */
const DROP_CAP_PRESETS: Record<TasteModeId, DropCapConfig> = {
  "apple-clean": {
    enabled: false,
    fontSize: 3.5,
    lineSpan: 3,
    fontWeight: 400,
    marginRight: 8,
    marginTop: 4,
  },
  "fashion-editorial": {
    enabled: true,
    fontSize: 4.5,
    lineSpan: 4,
    fontWeight: 300,
    marginRight: 12,
    marginTop: 6,
  },
  "vaporwave-cyber": {
    enabled: false,
    fontSize: 3.0,
    lineSpan: 2,
    fontWeight: 700,
    marginRight: 6,
    marginTop: 2,
  },
  "brutalist-grid": {
    enabled: true,
    fontSize: 5.0,
    lineSpan: 4,
    fontWeight: 900,
    marginRight: 4,
    marginTop: 0,
    color: "#ff0000",
  },
  "pinterest-collage": {
    enabled: false,
    fontSize: 3.0,
    lineSpan: 3,
    fontWeight: 700,
    marginRight: 8,
    marginTop: 4,
  },
  "museum-wall": {
    enabled: true,
    fontSize: 4.0,
    lineSpan: 3,
    fontWeight: 400,
    marginRight: 10,
    marginTop: 3,
  },
};

/**
 * Get drop cap config for a taste mode
 */
export function getDropCapConfig(tasteMode: TasteModeId): DropCapConfig {
  return DROP_CAP_PRESETS[tasteMode] ?? DROP_CAP_PRESETS["apple-clean"];
}

/**
 * Generate CSS for drop cap that preserves line height
 * Uses float-based drop cap with careful line-height management
 */
export function getDropCapCSS(
  config: DropCapConfig,
  typePack: TypePack,
  bodyFontSize: number
): string {
  if (!config.enabled) return "";

  const capSize = bodyFontSize * config.fontSize;
  const lineHeight = typePack.bodyLineHeight * bodyFontSize;
  const dropHeight = lineHeight * config.lineSpan;

  return `
    .drop-cap::first-letter {
      float: left;
      font-size: ${capSize}px;
      font-weight: ${config.fontWeight};
      line-height: ${dropHeight / capSize};
      margin-right: ${config.marginRight}px;
      margin-top: ${config.marginTop}px;
      ${config.color ? `color: ${config.color};` : ""}
    }
  `;
}

// =============================================================================
// COMBINED TEXT FRAME STYLING
// =============================================================================

export interface TextFrameStyle {
  padding: TextFramePadding;
  background: TileBackground;
  dropCap: DropCapConfig;
  balanceStyles: Record<string, string>;
}

/**
 * Get complete text frame styling for a given configuration
 */
export function getTextFrameStyle(
  frameWidth: number,
  frameHeight: number,
  tasteMode: TasteModeId,
  intent: TextIntent
): TextFrameStyle {
  return {
    padding: calculateTextFramePadding(frameWidth, frameHeight, tasteMode, intent),
    background: getTileBackground(tasteMode),
    dropCap: getDropCapConfig(tasteMode),
    balanceStyles: getBalanceStyles(intent),
  };
}

/**
 * Generate inline style object for a text frame container
 */
export function getTextFrameContainerStyle(
  style: TextFrameStyle
): React.CSSProperties {
  const bg = style.background;
  
  return {
    paddingTop: style.padding.top,
    paddingRight: style.padding.right,
    paddingBottom: style.padding.bottom,
    paddingLeft: style.padding.left,
    backgroundColor: bg.enabled 
      ? `rgba(${hexToRgb(bg.color)}, ${bg.opacity})`
      : "transparent",
    borderRadius: bg.borderRadius,
    ...style.balanceStyles,
  } as React.CSSProperties;
}

// Utility to convert hex to RGB
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
  }
  return "255, 255, 255";
}
