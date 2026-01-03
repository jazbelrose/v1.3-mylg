/**
 * Magic Layout Generator Pro - Core Type Definitions
 * 
 * This file defines all types for the advanced layout generation system including:
 * - Locks (per-tile and global constraints)
 * - Taste modes (style DNA presets)
 * - Variants (multiple candidate layouts)
 * - Text frames (copy blocks within generated layouts)
 */

import type { Rect, LayoutMode, Margin } from "./pictureFrameLayoutGenerator";

// Re-export Rect for use in other modules
export type { Rect, LayoutMode, Margin };

// =============================================================================
// LOCKS
// =============================================================================

/** Per-tile lock options */
export type TileLocks = {
  /** Lock position - tile stays at exact x,y during regen */
  lockPosition: boolean;
  /** Lock crop settings - focal point and fit mode preserved */
  lockCrop: boolean;
  /** Lock as hero - this tile maintains prominence/size priority */
  lockHero: boolean;
};

/** Global layout lock options */
export type GlobalLocks = {
  /** Lock spacing/gutter between frames */
  lockSpacing: boolean;
  /** Lock corner radius for all frames */
  lockRadius: boolean;
};

/** Default tile locks (all unlocked) */
export const DEFAULT_TILE_LOCKS: TileLocks = {
  lockPosition: false,
  lockCrop: false,
  lockHero: false,
};

/** Default global locks (all unlocked) */
export const DEFAULT_GLOBAL_LOCKS: GlobalLocks = {
  lockSpacing: false,
  lockRadius: false,
};

// =============================================================================
// CONTENT TYPES
// =============================================================================

/** Frame content type - either image or text */
export type FrameContentType = "image" | "text";

/** Text intent presets for copy blocks */
export type TextIntent =
  | "headline"      // Large display text
  | "subheadline"   // Secondary heading
  | "body"          // Body copy
  | "caption"       // Small descriptive text
  | "quote"         // Pull quote or testimonial
  | "label"         // Step labels, tags
  | "custom";       // User-defined

/** Drop cap style options */
export type DropCapStyle = "off" | "classic" | "block" | "outline";

/** Text styling configuration derived from Taste + Theme */
export type TextStyleConfig = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  color: string;
  textAlign: "left" | "center" | "right" | "justify";
  padding: { top: number; right: number; bottom: number; left: number };
  dropCap: DropCapStyle;
  maxLineLength?: number; // Characters per line for readability
};

/** Configuration for a text frame */
export type TextFrameConfig = {
  intent: TextIntent;
  content: string;
  styleOverrides?: Partial<TextStyleConfig>;
};

// =============================================================================
// TASTE MODES
// =============================================================================

/** Available taste mode identifiers */
export type TasteModeId =
  | "apple-clean"
  | "fashion-editorial"
  | "vaporwave-cyber"
  | "brutalist-grid"
  | "pinterest-collage"
  | "museum-wall";

/** Design tokens controlled by taste mode */
export type TasteTokens = {
  // Spacing
  marginScale: number;        // Multiplier for canvas margins (1.0 = default)
  gutterScale: number;        // Multiplier for inter-frame gutter (1.0 = default)
  asymmetryFactor: number;    // 0 = perfectly symmetric, 1 = max asymmetry
  
  // Frame styling
  radiusBase: number;         // Base corner radius in px
  radiusVariance: number;     // Random variance for radius (0-1)
  
  // Visual effects
  shadowIntensity: number;    // 0 = no shadow, 1 = full shadow
  strokeWidth: number;        // Frame stroke width (0 = none)
  strokeColor: string;        // Frame stroke color
  
  // Scale
  scaleVariance: number;      // Size variance between frames (0-1)
  heroScale: number;          // How much larger hero frames are (1.5 = 50% larger)
  
  // Typography
  typePack: TypePack;
};

/** Typography configuration for a taste mode */
export type TypePack = {
  headlineFont: string;
  headlineWeight: number;
  headlineTracking: number;   // Letter spacing in em
  
  bodyFont: string;
  bodyWeight: number;
  bodyLineHeight: number;
  
  captionFont: string;
  captionWeight: number;
  
  baseFontSize: number;       // Base size in px, scales with frame
  typeScale: number;          // Modular scale ratio (e.g., 1.25 for major third)
};

/** Full taste mode definition */
export type TasteMode = {
  id: TasteModeId;
  name: string;
  description: string;
  tokens: TasteTokens;
};

// =============================================================================
// FRAME WITH EXTENDED PROPERTIES
// =============================================================================

/** Extended frame definition with locks, content, and styling */
export type GeneratedFrame = Rect & {
  /** Unique identifier for this frame */
  id: string;
  
  /** Frame index in layout order */
  index: number;
  
  /** Content type: image or text */
  contentType: FrameContentType;
  
  /** Image source (for image frames) */
  imageSrc: string | null;
  
  /** Text configuration (for text frames) */
  textConfig: TextFrameConfig | null;
  
  /** Per-tile locks */
  locks: TileLocks;
  
  /** Is this frame the hero/primary frame */
  isHero: boolean;
  
  /** Corner radius for this frame */
  radius: number;
  
  /** Rotation in degrees */
  rotation: number;
  
  /** Z-index for stacking */
  zIndex: number;
};

// =============================================================================
// LAYOUT VARIANT
// =============================================================================

/** A single layout candidate/variant */
export type LayoutVariant = {
  /** Unique variant ID */
  id: string;
  
  /** Seed that produced this variant */
  seed: string;
  
  /** Variant index (0-5 for 6 variants) */
  index: number;
  
  /** All frames in this variant */
  frames: GeneratedFrame[];
  
  /** Layout mode used */
  mode: LayoutMode;
  
  /** Taste mode applied */
  tasteMode: TasteModeId;
  
  /** Canvas dimensions */
  canvas: { width: number; height: number };
  
  /** Content area (within margins) */
  content: Rect;
  
  /** Gutter used */
  gutter: number;
  
  /** Margins used */
  margin: Margin;
  
  /** Quality score (higher = better) */
  score: number;
  
  /** Whether fallback layout was used */
  usedFallback: boolean;
};

// =============================================================================
// GENERATOR INPUT/OUTPUT
// =============================================================================

/** Input configuration for layout generation */
export type MagicLayoutInput = {
  /** Number of frames to generate */
  frameCount: number;
  
  /** Layout mode (grid or masonry) */
  mode: LayoutMode;
  
  /** Taste mode to apply */
  tasteMode: TasteModeId;
  
  /** Base seed for deterministic generation */
  seed: string;
  
  /** Canvas dimensions */
  canvasWidth: number;
  canvasHeight: number;
  
  /** Global locks */
  globalLocks: GlobalLocks;
  
  /** Per-frame configurations (optional, for locking/content) */
  frameConfigs?: Array<{
    contentType: FrameContentType;
    imageSrc?: string | null;
    textConfig?: TextFrameConfig | null;
    locks?: Partial<TileLocks>;
  }>;
  
  /** Locked frames from previous generation (for regen with constraints) */
  lockedFrames?: GeneratedFrame[];
  
  /** Number of variants to generate */
  variantCount?: number;
};

/** Output from layout generation */
export type MagicLayoutOutput = {
  /** All generated variants, sorted by score */
  variants: LayoutVariant[];
  
  /** Input configuration used */
  input: MagicLayoutInput;
  
  /** Generation metadata */
  meta: {
    generatedAt: number;
    generationTimeMs: number;
    candidatesEvaluated: number;
  };
};

// =============================================================================
// THEME EXTRACTION (For Phase 2)
// =============================================================================

/** Extracted color from images */
export type ExtractedColor = {
  hex: string;
  rgb: { r: number; g: number; b: number };
  prominence: number; // 0-1, how dominant this color is
  category: "primary" | "secondary" | "accent" | "neutral";
};

/** Theme extracted from images */
export type ExtractedTheme = {
  palette: ExtractedColor[];
  suggestedBackground: string;
  suggestedGradient?: { start: string; end: string; angle: number };
  contrastTextColors: { light: string; dark: string };
  accentStroke?: string;
};

// =============================================================================
// SCORING
// =============================================================================

/** Scoring weights for layout evaluation */
export type ScoringWeights = {
  alignment: number;          // How well frames align to grid/guides
  spacing: number;            // Consistency of spacing
  hierarchy: number;          // Clear visual hierarchy (hero prominence)
  balance: number;            // Visual weight distribution
  variety: number;            // Interesting variation without chaos
  textReadability: number;    // Text frames have good proportions
  cropQuality: number;        // Image frames have good aspect ratios
  storyboardFit: number;      // Matches intended storyboard template
};

/** Default scoring weights */
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  alignment: 0.15,
  spacing: 0.15,
  hierarchy: 0.20,
  balance: 0.15,
  variety: 0.10,
  textReadability: 0.10,
  cropQuality: 0.10,
  storyboardFit: 0.05,
};
