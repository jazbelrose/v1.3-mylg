/**
 * Magic Layout Generator Pro
 * 
 * Advanced layout generation engine with:
 * - Deterministic seed-based generation
 * - Constraint solver respecting locks
 * - Taste mode application
 * - Multi-variant candidate generation
 * - Scoring and ranking
 */

import { v4 as uuidv4 } from "uuid";
import {
  generatePictureFrameLayout,
  type PictureFrameLayoutResult,
  type LayoutMode,
  type Rect,
  type Margin,
} from "./pictureFrameLayoutGenerator";
import { getTasteMode, applyTasteTokens } from "./tasteModes";
import { scoreLayout, rankVariants, DEFAULT_SCORING_WEIGHTS } from "./layoutScoring";
import type {
  MagicLayoutInput,
  MagicLayoutOutput,
  LayoutVariant,
  GeneratedFrame,
  TileLocks,
  GlobalLocks,
  FrameContentType,
  TextFrameConfig,
  TasteModeId,
  DEFAULT_TILE_LOCKS,
  DEFAULT_GLOBAL_LOCKS,
} from "./magicLayoutTypes";

// Re-export types for convenience
export type { MagicLayoutInput, MagicLayoutOutput, LayoutVariant, GeneratedFrame };

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_CANVAS_WIDTH = 1920;
const DEFAULT_CANVAS_HEIGHT = 1080;
const DEFAULT_BASE_MARGIN = { top: 96, right: 120, bottom: 96, left: 120 };
const DEFAULT_BASE_GUTTER = 24;
const DEFAULT_BASE_RADIUS = 16;
const DEFAULT_VARIANT_COUNT = 6;
const CANDIDATES_PER_VARIANT = 4; // Generate 4x candidates, pick best

// =============================================================================
// FROZEN TOKENS (for global lock persistence)
// =============================================================================

/** 
 * Stores frozen layout tokens when global locks are enabled.
 * These values persist across regen to prevent drift.
 */
export interface FrozenTokens {
  gutter?: number;
  radius?: number;
  margin?: Margin;
}

// Module-level storage for frozen tokens (keyed by session/seed)
const frozenTokensCache = new Map<string, FrozenTokens>();

/**
 * Get or create frozen tokens for a layout session
 */
function getFrozenTokens(
  sessionKey: string,
  globalLocks: { lockSpacing: boolean; lockRadius: boolean },
  currentGutter: number,
  currentRadius: number,
  currentMargin: Margin
): FrozenTokens {
  const cached = frozenTokensCache.get(sessionKey);
  
  if (cached) {
    // Return cached frozen values only for locked properties
    return {
      gutter: globalLocks.lockSpacing ? cached.gutter : undefined,
      radius: globalLocks.lockRadius ? cached.radius : undefined,
      margin: globalLocks.lockSpacing ? cached.margin : undefined,
    };
  }
  
  // First generation - store current values as frozen
  const newFrozen: FrozenTokens = {
    gutter: currentGutter,
    radius: currentRadius,
    margin: currentMargin,
  };
  frozenTokensCache.set(sessionKey, newFrozen);
  
  return {
    gutter: globalLocks.lockSpacing ? currentGutter : undefined,
    radius: globalLocks.lockRadius ? currentRadius : undefined,
    margin: globalLocks.lockSpacing ? currentMargin : undefined,
  };
}

/**
 * Clear frozen tokens for a session (when locks are released)
 */
export function clearFrozenTokens(sessionKey: string): void {
  frozenTokensCache.delete(sessionKey);
}

/**
 * Update frozen tokens with new values (when user explicitly changes locked values)
 */
export function updateFrozenTokens(
  sessionKey: string,
  updates: Partial<FrozenTokens>
): void {
  const existing = frozenTokensCache.get(sessionKey) ?? {};
  frozenTokensCache.set(sessionKey, { ...existing, ...updates });
}

// =============================================================================
// SEEDED RNG (same as pictureFrameLayoutGenerator for consistency)
// =============================================================================

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

type Rng = { seed: string; next: () => number };

function createRng(seed: string): Rng {
  const hash = xmur3(seed)();
  return { seed, next: mulberry32(hash) };
}

function deriveSeed(baseSeed: string, index: number): string {
  return `${baseSeed}:variant:${index}`;
}

// =============================================================================
// CONSTRAINT SOLVER
// =============================================================================

/**
 * Constraint solver for respecting locked frames
 * Places unlocked frames around locked ones
 */
function solveConstraints(
  unlockedFrames: GeneratedFrame[],
  lockedFrames: GeneratedFrame[],
  content: Rect,
  gutter: number
): GeneratedFrame[] {
  if (lockedFrames.length === 0) {
    return unlockedFrames;
  }

  // Find available regions not occupied by locked frames
  const availableRegions = findAvailableRegions(lockedFrames, content, gutter);
  
  // Distribute unlocked frames into available regions
  const adjusted = distributeIntoRegions(unlockedFrames, availableRegions, gutter);
  
  return adjusted;
}

/**
 * Find rectangular regions not occupied by locked frames
 * Uses a simple guillotine subdivision approach
 */
function findAvailableRegions(
  lockedFrames: GeneratedFrame[],
  content: Rect,
  gutter: number
): Rect[] {
  if (lockedFrames.length === 0) {
    return [content];
  }

  // Sort locked frames by position for consistent subdivision
  const sorted = [...lockedFrames].sort((a, b) => {
    if (Math.abs(a.y - b.y) < 10) return a.x - b.x;
    return a.y - b.y;
  });

  let regions: Rect[] = [content];

  sorted.forEach((locked) => {
    const newRegions: Rect[] = [];

    regions.forEach((region) => {
      if (!rectsOverlap(region, locked)) {
        newRegions.push(region);
        return;
      }

      // Subdivide region around the locked frame
      const subRegions = subdivideAroundRect(region, locked, gutter);
      newRegions.push(...subRegions.filter((r) => r.width >= 100 && r.height >= 80));
    });

    regions = newRegions;
  });

  return regions;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

function subdivideAroundRect(region: Rect, obstacle: Rect, gutter: number): Rect[] {
  const subRegions: Rect[] = [];
  const g = gutter;

  // Left of obstacle
  if (obstacle.x > region.x + g) {
    subRegions.push({
      x: region.x,
      y: region.y,
      width: obstacle.x - region.x - g,
      height: region.height,
    });
  }

  // Right of obstacle
  if (obstacle.x + obstacle.width + g < region.x + region.width) {
    subRegions.push({
      x: obstacle.x + obstacle.width + g,
      y: region.y,
      width: region.x + region.width - (obstacle.x + obstacle.width + g),
      height: region.height,
    });
  }

  // Above obstacle
  if (obstacle.y > region.y + g) {
    subRegions.push({
      x: region.x,
      y: region.y,
      width: region.width,
      height: obstacle.y - region.y - g,
    });
  }

  // Below obstacle
  if (obstacle.y + obstacle.height + g < region.y + region.height) {
    subRegions.push({
      x: region.x,
      y: obstacle.y + obstacle.height + g,
      width: region.width,
      height: region.y + region.height - (obstacle.y + obstacle.height + g),
    });
  }

  return subRegions;
}

/**
 * Distribute frames into available regions
 * Scales frames to fit if necessary
 */
function distributeIntoRegions(
  frames: GeneratedFrame[],
  regions: Rect[],
  gutter: number
): GeneratedFrame[] {
  if (regions.length === 0 || frames.length === 0) {
    return frames;
  }

  const result: GeneratedFrame[] = [];
  let regionIndex = 0;

  frames.forEach((frame, i) => {
    const region = regions[regionIndex % regions.length];
    
    // Scale frame to fit within region if necessary
    const scaledWidth = Math.min(frame.width, region.width);
    const scaledHeight = Math.min(frame.height, region.height);
    
    // Position within region
    const x = region.x + (i * gutter) % Math.max(1, region.width - scaledWidth);
    const y = region.y + (i * gutter) % Math.max(1, region.height - scaledHeight);

    result.push({
      ...frame,
      x,
      y,
      width: scaledWidth,
      height: scaledHeight,
    });

    // Move to next region for variety
    if ((i + 1) % Math.ceil(frames.length / regions.length) === 0) {
      regionIndex++;
    }
  });

  return result;
}

// =============================================================================
// FRAME GENERATION
// =============================================================================

/**
 * Convert base layout result to GeneratedFrames with extended properties
 */
function createGeneratedFrames(
  baseFrames: Rect[],
  input: MagicLayoutInput,
  rng: Rng,
  tasteRadius: number
): GeneratedFrame[] {
  const frameConfigs = input.frameConfigs ?? [];
  
  // Find the largest frame as hero
  let maxArea = 0;
  let heroIndex = 0;
  baseFrames.forEach((f, i) => {
    const area = f.width * f.height;
    if (area > maxArea) {
      maxArea = area;
      heroIndex = i;
    }
  });

  return baseFrames.map((rect, index) => {
    const config = frameConfigs[index];
    const locks: TileLocks = {
      lockPosition: config?.locks?.lockPosition ?? false,
      lockCrop: config?.locks?.lockCrop ?? false,
      lockHero: config?.locks?.lockHero ?? false,
    };

    return {
      ...rect,
      id: uuidv4(),
      index,
      contentType: config?.contentType ?? "image",
      imageSrc: config?.imageSrc ?? null,
      textConfig: config?.textConfig ?? null,
      locks,
      isHero: index === heroIndex,
      radius: tasteRadius,
      rotation: 0,
      zIndex: index,
    };
  });
}

// =============================================================================
// VARIANT GENERATION
// =============================================================================

/**
 * Generate a single layout variant
 */
function generateVariant(
  input: MagicLayoutInput,
  variantIndex: number,
  variantSeed: string,
  frozen?: FrozenTokens
): LayoutVariant {
  const tasteMode = getTasteMode(input.tasteMode);
  const tokens = tasteMode.tokens;

  // Apply taste tokens to base values
  const tasteApplied = applyTasteTokens(
    tokens,
    DEFAULT_BASE_MARGIN,
    DEFAULT_BASE_GUTTER,
    DEFAULT_BASE_RADIUS
  );

  // Use frozen values if locks are enabled, otherwise use taste-applied values
  const margin = frozen?.margin ?? tasteApplied.margin;
  const gutter = frozen?.gutter ?? tasteApplied.gutter;
  const radius = frozen?.radius ?? tasteApplied.radius;

  const rng = createRng(variantSeed);

  // Generate base layout using existing generator
  const baseLayout = generatePictureFrameLayout(input.frameCount, {
    mode: input.mode,
    seed: variantSeed,
    canvasWidth: input.canvasWidth,
    canvasHeight: input.canvasHeight,
    margin,
    gutter,
    minFrameWidth: 180,
    minFrameHeight: 120,
  });

  // Convert to GeneratedFrames
  let frames = createGeneratedFrames(baseLayout.frames, input, rng, radius);

  // Apply constraints from locked frames
  if (input.lockedFrames && input.lockedFrames.length > 0) {
    const lockedFrames = input.lockedFrames.filter((f) => f.locks.lockPosition);
    const unlockedFrames = frames.filter((f) => !f.locks.lockPosition);
    
    // Keep locked frames as-is, adjust unlocked ones
    const adjustedUnlocked = solveConstraints(
      unlockedFrames,
      lockedFrames,
      baseLayout.content,
      gutter
    );

    // Merge locked and adjusted unlocked
    frames = [
      ...lockedFrames,
      ...adjustedUnlocked,
    ].sort((a, b) => a.index - b.index);
  }

  const variant: LayoutVariant = {
    id: uuidv4(),
    seed: variantSeed,
    index: variantIndex,
    frames,
    mode: input.mode,
    tasteMode: input.tasteMode,
    canvas: { width: input.canvasWidth, height: input.canvasHeight },
    content: baseLayout.content,
    gutter,
    margin,
    score: 0, // Will be calculated
    usedFallback: baseLayout.usedFallback,
  };

  // Calculate score
  variant.score = scoreLayout(variant, DEFAULT_SCORING_WEIGHTS);

  return variant;
}

// =============================================================================
// MAIN GENERATOR
// =============================================================================

/**
 * Generate magic layouts with all Phase 1 features:
 * - Deterministic seed-based generation
 * - Taste mode styling
 * - Lock constraints
 * - Multiple scored variants
 */
export function generateMagicLayouts(input: MagicLayoutInput): MagicLayoutOutput {
  const startTime = performance.now();
  
  // Normalize input
  const normalizedInput: MagicLayoutInput = {
    frameCount: Math.max(1, Math.min(20, input.frameCount)),
    mode: input.mode ?? "grid",
    tasteMode: input.tasteMode ?? "apple-clean",
    seed: input.seed || `${Date.now()}`,
    canvasWidth: input.canvasWidth ?? DEFAULT_CANVAS_WIDTH,
    canvasHeight: input.canvasHeight ?? DEFAULT_CANVAS_HEIGHT,
    globalLocks: input.globalLocks ?? { lockSpacing: false, lockRadius: false },
    frameConfigs: input.frameConfigs,
    lockedFrames: input.lockedFrames,
    variantCount: input.variantCount ?? DEFAULT_VARIANT_COUNT,
  };

  const variantCount = normalizedInput.variantCount!;
  const candidateCount = variantCount * CANDIDATES_PER_VARIANT;
  
  // Get frozen tokens for locked values (prevents drift across regen)
  const sessionKey = normalizedInput.seed;
  const tasteMode = getTasteMode(normalizedInput.tasteMode);
  const tasteApplied = applyTasteTokens(
    tasteMode.tokens,
    DEFAULT_BASE_MARGIN,
    DEFAULT_BASE_GUTTER,
    DEFAULT_BASE_RADIUS
  );
  
  const frozen = getFrozenTokens(
    sessionKey,
    normalizedInput.globalLocks,
    tasteApplied.gutter,
    tasteApplied.radius,
    tasteApplied.margin
  );
  
  // Generate all candidates
  const allCandidates: LayoutVariant[] = [];
  
  for (let i = 0; i < candidateCount; i++) {
    const candidateSeed = deriveSeed(normalizedInput.seed, i);
    const variant = generateVariant(normalizedInput, i, candidateSeed, frozen);
    allCandidates.push(variant);
  }

  // Rank and pick top variants
  const rankedVariants = rankVariants(allCandidates, DEFAULT_SCORING_WEIGHTS, variantCount);

  // Re-index the final variants
  rankedVariants.forEach((v, i) => {
    v.index = i;
  });

  const endTime = performance.now();

  return {
    variants: rankedVariants,
    input: normalizedInput,
    meta: {
      generatedAt: Date.now(),
      generationTimeMs: Math.round(endTime - startTime),
      candidatesEvaluated: candidateCount,
    },
  };
}

/**
 * Generate a single (fast) magic layout variant for a given seed.
 *
 * This is intended for multi-slide plans where we want unique layouts per slide
 * without paying the full ranking/scoring cost of `generateMagicLayouts` for
 * every slide.
 */
export function generateMagicLayoutVariant(
  input: MagicLayoutInput,
  variantSeed: string,
  variantIndex = 0,
  sessionSeed?: string
): LayoutVariant {
  const normalizedInput: MagicLayoutInput = {
    frameCount: Math.max(1, Math.min(20, input.frameCount)),
    mode: input.mode ?? "grid",
    tasteMode: input.tasteMode ?? "apple-clean",
    seed: input.seed || `${Date.now()}`,
    canvasWidth: input.canvasWidth ?? DEFAULT_CANVAS_WIDTH,
    canvasHeight: input.canvasHeight ?? DEFAULT_CANVAS_HEIGHT,
    globalLocks: input.globalLocks ?? { lockSpacing: false, lockRadius: false },
    frameConfigs: input.frameConfigs,
    lockedFrames: input.lockedFrames,
  };

  const sessionKey = sessionSeed ?? normalizedInput.seed;
  const tasteMode = getTasteMode(normalizedInput.tasteMode);
  const tasteApplied = applyTasteTokens(
    tasteMode.tokens,
    DEFAULT_BASE_MARGIN,
    DEFAULT_BASE_GUTTER,
    DEFAULT_BASE_RADIUS
  );

  const frozen = getFrozenTokens(
    sessionKey,
    normalizedInput.globalLocks ?? { lockSpacing: false, lockRadius: false },
    tasteApplied.gutter,
    tasteApplied.radius,
    tasteApplied.margin
  );

  return generateVariant(normalizedInput, variantIndex, variantSeed, frozen);
}

/**
 * Regenerate layouts with new seed while preserving locked frames
 */
export function regenerateMagicLayouts(
  previousOutput: MagicLayoutOutput,
  newSeed?: string
): MagicLayoutOutput {
  const lockedFrames = extractLockedFrames(previousOutput.variants[0]);
  
  return generateMagicLayouts({
    ...previousOutput.input,
    seed: newSeed ?? `${Date.now()}`,
    lockedFrames,
  });
}

/**
 * Extract frames that have any lock enabled
 */
function extractLockedFrames(variant: LayoutVariant | undefined): GeneratedFrame[] {
  if (!variant) return [];
  
  return variant.frames.filter(
    (f) => f.locks.lockPosition || f.locks.lockCrop || f.locks.lockHero
  );
}

/**
 * Quick generation for preview (single variant, no scoring overhead)
 */
export function generatePreviewLayout(
  frameCount: number,
  mode: LayoutMode,
  tasteMode: TasteModeId,
  seed: string
): LayoutVariant {
  return generateVariant(
    {
      frameCount,
      mode,
      tasteMode,
      seed,
      canvasWidth: DEFAULT_CANVAS_WIDTH,
      canvasHeight: DEFAULT_CANVAS_HEIGHT,
      globalLocks: { lockSpacing: false, lockRadius: false },
    },
    0,
    seed
  );
}
