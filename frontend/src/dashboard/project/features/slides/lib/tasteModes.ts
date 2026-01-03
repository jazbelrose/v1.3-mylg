/**
 * Taste Modes - Style DNA Presets
 * 
 * Each taste mode defines a complete design language including:
 * - Spacing and margins
 * - Corner radii and visual effects
 * - Typography settings
 * - Overall aesthetic approach
 */

import type { TasteMode, TasteModeId, TasteTokens, TypePack } from "./magicLayoutTypes";

// =============================================================================
// TYPE PACKS (Typography configurations)
// =============================================================================

const TYPE_PACK_APPLE: TypePack = {
  headlineFont: "SF Pro Display, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  headlineWeight: 600,
  headlineTracking: -0.02,
  bodyFont: "SF Pro Text, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  bodyWeight: 400,
  bodyLineHeight: 1.5,
  captionFont: "SF Pro Text, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  captionWeight: 400,
  baseFontSize: 16,
  typeScale: 1.25, // Major third
};

const TYPE_PACK_FASHION: TypePack = {
  headlineFont: "Didot, 'Playfair Display', Georgia, serif",
  headlineWeight: 400,
  headlineTracking: 0.05,
  bodyFont: "Helvetica Neue, Helvetica, Arial, sans-serif",
  bodyWeight: 300,
  bodyLineHeight: 1.6,
  captionFont: "Helvetica Neue, Helvetica, Arial, sans-serif",
  captionWeight: 400,
  baseFontSize: 14,
  typeScale: 1.333, // Perfect fourth
};

const TYPE_PACK_CYBER: TypePack = {
  headlineFont: "Space Grotesk, 'JetBrains Mono', monospace",
  headlineWeight: 700,
  headlineTracking: 0.08,
  bodyFont: "Space Grotesk, 'IBM Plex Sans', sans-serif",
  bodyWeight: 400,
  bodyLineHeight: 1.5,
  captionFont: "'JetBrains Mono', 'Fira Code', monospace",
  captionWeight: 400,
  baseFontSize: 15,
  typeScale: 1.2, // Minor third
};

const TYPE_PACK_BRUTALIST: TypePack = {
  headlineFont: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
  headlineWeight: 900,
  headlineTracking: -0.03,
  bodyFont: "Arial, Helvetica, sans-serif",
  bodyWeight: 400,
  bodyLineHeight: 1.4,
  captionFont: "'Courier New', Courier, monospace",
  captionWeight: 700,
  baseFontSize: 16,
  typeScale: 1.414, // Augmented fourth
};

const TYPE_PACK_PINTEREST: TypePack = {
  headlineFont: "Lato, 'Open Sans', sans-serif",
  headlineWeight: 700,
  headlineTracking: 0,
  bodyFont: "Lato, 'Open Sans', sans-serif",
  bodyWeight: 400,
  bodyLineHeight: 1.6,
  captionFont: "Lato, 'Open Sans', sans-serif",
  captionWeight: 400,
  baseFontSize: 15,
  typeScale: 1.2,
};

const TYPE_PACK_MUSEUM: TypePack = {
  headlineFont: "Garamond, 'Times New Roman', serif",
  headlineWeight: 400,
  headlineTracking: 0.02,
  bodyFont: "Garamond, 'Times New Roman', serif",
  bodyWeight: 400,
  bodyLineHeight: 1.7,
  captionFont: "'Helvetica Neue', Helvetica, sans-serif",
  captionWeight: 300,
  baseFontSize: 14,
  typeScale: 1.25,
};

// =============================================================================
// TASTE MODE DEFINITIONS
// =============================================================================

const APPLE_CLEAN_TOKENS: TasteTokens = {
  marginScale: 1.2,
  gutterScale: 1.0,
  asymmetryFactor: 0.0,
  radiusBase: 16,
  radiusVariance: 0.0,
  shadowIntensity: 0.15,
  strokeWidth: 0,
  strokeColor: "transparent",
  scaleVariance: 0.05,
  heroScale: 1.3,
  typePack: TYPE_PACK_APPLE,
};

const FASHION_EDITORIAL_TOKENS: TasteTokens = {
  marginScale: 1.5,
  gutterScale: 0.6,
  asymmetryFactor: 0.4,
  radiusBase: 0,
  radiusVariance: 0.0,
  shadowIntensity: 0.0,
  strokeWidth: 0,
  strokeColor: "transparent",
  scaleVariance: 0.25,
  heroScale: 1.8,
  typePack: TYPE_PACK_FASHION,
};

const VAPORWAVE_CYBER_TOKENS: TasteTokens = {
  marginScale: 0.8,
  gutterScale: 0.5,
  asymmetryFactor: 0.3,
  radiusBase: 0,
  radiusVariance: 0.0,
  shadowIntensity: 0.0,
  strokeWidth: 2,
  strokeColor: "#ff00ff",
  scaleVariance: 0.15,
  heroScale: 1.4,
  typePack: TYPE_PACK_CYBER,
};

const BRUTALIST_GRID_TOKENS: TasteTokens = {
  marginScale: 0.6,
  gutterScale: 0.3,
  asymmetryFactor: 0.0,
  radiusBase: 0,
  radiusVariance: 0.0,
  shadowIntensity: 0.0,
  strokeWidth: 3,
  strokeColor: "#000000",
  scaleVariance: 0.0,
  heroScale: 1.2,
  typePack: TYPE_PACK_BRUTALIST,
};

const PINTEREST_COLLAGE_TOKENS: TasteTokens = {
  marginScale: 0.8,
  gutterScale: 0.8,
  asymmetryFactor: 0.6,
  radiusBase: 12,
  radiusVariance: 0.2,
  shadowIntensity: 0.25,
  strokeWidth: 0,
  strokeColor: "transparent",
  scaleVariance: 0.35,
  heroScale: 1.5,
  typePack: TYPE_PACK_PINTEREST,
};

const MUSEUM_WALL_TOKENS: TasteTokens = {
  marginScale: 1.8,
  gutterScale: 1.5,
  asymmetryFactor: 0.2,
  radiusBase: 0,
  radiusVariance: 0.0,
  shadowIntensity: 0.3,
  strokeWidth: 1,
  strokeColor: "#1a1a1a",
  scaleVariance: 0.4,
  heroScale: 2.0,
  typePack: TYPE_PACK_MUSEUM,
};

// =============================================================================
// EXPORTED TASTE MODES
// =============================================================================

export const TASTE_MODES: Record<TasteModeId, TasteMode> = {
  "apple-clean": {
    id: "apple-clean",
    name: "Apple Clean",
    description: "Minimal, precise, generous whitespace. Think Apple keynotes.",
    tokens: APPLE_CLEAN_TOKENS,
  },
  "fashion-editorial": {
    id: "fashion-editorial",
    name: "Fashion Editorial",
    description: "High contrast, dramatic scale, editorial magazine aesthetic.",
    tokens: FASHION_EDITORIAL_TOKENS,
  },
  "vaporwave-cyber": {
    id: "vaporwave-cyber",
    name: "Vaporwave/Cyber",
    description: "Neon accents, tight layouts, retro-futuristic vibes.",
    tokens: VAPORWAVE_CYBER_TOKENS,
  },
  "brutalist-grid": {
    id: "brutalist-grid",
    name: "Brutalist Grid",
    description: "Raw, stark, aggressive. Bold borders, zero embellishment.",
    tokens: BRUTALIST_GRID_TOKENS,
  },
  "pinterest-collage": {
    id: "pinterest-collage",
    name: "Pinterest Collage",
    description: "Organic masonry, soft shadows, cozy and curated feel.",
    tokens: PINTEREST_COLLAGE_TOKENS,
  },
  "museum-wall": {
    id: "museum-wall",
    name: "Museum Wall",
    description: "Gallery-style spacing, elegant frames, contemplative pacing.",
    tokens: MUSEUM_WALL_TOKENS,
  },
};

/** Get taste mode by ID, with fallback to apple-clean */
export function getTasteMode(id: TasteModeId | string): TasteMode {
  return TASTE_MODES[id as TasteModeId] ?? TASTE_MODES["apple-clean"];
}

/** Get all available taste mode IDs */
export function getTasteModeIds(): TasteModeId[] {
  return Object.keys(TASTE_MODES) as TasteModeId[];
}

/** Check if a string is a valid taste mode ID */
export function isValidTasteModeId(id: string): id is TasteModeId {
  return id in TASTE_MODES;
}

/**
 * Apply taste tokens to base layout parameters
 * Returns adjusted margins, gutter, and radius
 */
export function applyTasteTokens(
  tokens: TasteTokens,
  baseMargin: { top: number; right: number; bottom: number; left: number },
  baseGutter: number,
  baseRadius: number
): {
  margin: { top: number; right: number; bottom: number; left: number };
  gutter: number;
  radius: number;
} {
  return {
    margin: {
      top: Math.round(baseMargin.top * tokens.marginScale),
      right: Math.round(baseMargin.right * tokens.marginScale),
      bottom: Math.round(baseMargin.bottom * tokens.marginScale),
      left: Math.round(baseMargin.left * tokens.marginScale),
    },
    gutter: Math.round(baseGutter * tokens.gutterScale),
    radius: tokens.radiusBase,
  };
}
