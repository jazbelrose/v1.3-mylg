/**
 * Layout System - Persisted design tokens and rhythm across slides
 * 
 * Phase 2 Feature H:
 * - Persisted layout tokens (spacing, radius, margins)
 * - Hero alternation pattern (left/right/center)
 * - Cross-slide visual rhythm
 * - Deck-level design consistency
 */

import type { TasteModeId, GlobalLocks, Rect } from "./magicLayoutTypes";

// =============================================================================
// LAYOUT SYSTEM TYPES
// =============================================================================

export interface LayoutSystemTokens {
  /** Taste mode for the system */
  tasteMode: TasteModeId;
  
  /** Spacing tokens */
  gutter: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  
  /** Visual tokens */
  cornerRadius: number;
  shadowIntensity: number;
  strokeWidth: number;
  strokeColor: string;
  
  /** Hierarchy tokens */
  heroScale: number;
  scaleVariance: number;
  
  /** Whether tokens are locked */
  locked: GlobalLocks;
}

export interface HeroPattern {
  /** Pattern type for hero placement */
  type: "alternate-lr" | "alternate-lrc" | "fixed-left" | "fixed-right" | "fixed-center" | "random";
  /** Current position in the pattern */
  currentIndex: number;
}

export interface LayoutSystem {
  /** Unique ID for the layout system */
  id: string;
  /** Human-readable name */
  name: string;
  /** Design tokens */
  tokens: LayoutSystemTokens;
  /** Hero alternation pattern */
  heroPattern: HeroPattern;
  /** Slide index -> last hero position (for tracking) */
  heroHistory: Map<number, HeroPosition>;
  /** Created timestamp */
  createdAt: number;
  /** Last updated timestamp */
  updatedAt: number;
}

export type HeroPosition = "left" | "right" | "center" | "top" | "bottom";

// =============================================================================
// DEFAULT LAYOUT SYSTEM
// =============================================================================

const DEFAULT_TOKENS: LayoutSystemTokens = {
  tasteMode: "apple-clean",
  gutter: 24,
  marginTop: 96,
  marginRight: 120,
  marginBottom: 96,
  marginLeft: 120,
  cornerRadius: 16,
  shadowIntensity: 0.15,
  strokeWidth: 0,
  strokeColor: "transparent",
  heroScale: 1.3,
  scaleVariance: 0.05,
  locked: { lockSpacing: false, lockRadius: false },
};

export function createDefaultLayoutSystem(): LayoutSystem {
  return {
    id: generateSystemId(),
    name: "Untitled Design System",
    tokens: { ...DEFAULT_TOKENS },
    heroPattern: { type: "alternate-lr", currentIndex: 0 },
    heroHistory: new Map(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function generateSystemId(): string {
  return `ls_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// =============================================================================
// HERO ALTERNATION
// =============================================================================

const HERO_PATTERNS: Record<HeroPattern["type"], HeroPosition[]> = {
  "alternate-lr": ["left", "right"],
  "alternate-lrc": ["left", "right", "center"],
  "fixed-left": ["left"],
  "fixed-right": ["right"],
  "fixed-center": ["center"],
  "random": ["left", "right", "center"],
};

/**
 * Get the next hero position based on the pattern
 */
export function getNextHeroPosition(pattern: HeroPattern): HeroPosition {
  const positions = HERO_PATTERNS[pattern.type];
  
  if (pattern.type === "random") {
    return positions[Math.floor(Math.random() * positions.length)];
  }
  
  return positions[pattern.currentIndex % positions.length];
}

/**
 * Advance the hero pattern to the next position
 */
export function advanceHeroPattern(pattern: HeroPattern): HeroPattern {
  return {
    ...pattern,
    currentIndex: pattern.currentIndex + 1,
  };
}

/**
 * Get hero frame placement rect based on position
 */
export function getHeroRect(
  position: HeroPosition,
  content: Rect,
  heroScale: number = 1.3
): Rect {
  const baseWidth = content.width * 0.5;
  const baseHeight = content.height * 0.6;
  const heroWidth = baseWidth * heroScale;
  const heroHeight = baseHeight * heroScale;
  
  switch (position) {
    case "left":
      return {
        x: content.x,
        y: content.y + (content.height - heroHeight) / 2,
        width: heroWidth,
        height: heroHeight,
      };
      
    case "right":
      return {
        x: content.x + content.width - heroWidth,
        y: content.y + (content.height - heroHeight) / 2,
        width: heroWidth,
        height: heroHeight,
      };
      
    case "center":
      return {
        x: content.x + (content.width - heroWidth) / 2,
        y: content.y + (content.height - heroHeight) / 2,
        width: heroWidth,
        height: heroHeight,
      };
      
    case "top":
      return {
        x: content.x + (content.width - heroWidth) / 2,
        y: content.y,
        width: heroWidth,
        height: heroHeight,
      };
      
    case "bottom":
      return {
        x: content.x + (content.width - heroWidth) / 2,
        y: content.y + content.height - heroHeight,
        width: heroWidth,
        height: heroHeight,
      };
  }
}

// =============================================================================
// LAYOUT SYSTEM PERSISTENCE
// =============================================================================

const STORAGE_KEY = "mylg_layout_systems";

/**
 * Save layout system to localStorage
 */
export function saveLayoutSystem(system: LayoutSystem): void {
  const systems = loadAllLayoutSystems();
  const existing = systems.findIndex(s => s.id === system.id);
  
  const updated = {
    ...system,
    updatedAt: Date.now(),
    // Convert Map to array for JSON serialization
    heroHistory: Array.from(system.heroHistory.entries()),
  };
  
  if (existing >= 0) {
    systems[existing] = updated as unknown as LayoutSystem;
  } else {
    systems.push(updated as unknown as LayoutSystem);
  }
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(systems));
  } catch (e) {
    console.warn("Failed to save layout system:", e);
  }
}

/**
 * Load all layout systems from localStorage
 */
export function loadAllLayoutSystems(): LayoutSystem[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    
    const parsed = JSON.parse(data) as Array<LayoutSystem & { heroHistory?: [number, HeroPosition][] }>;
    
    // Convert heroHistory arrays back to Maps
    return parsed.map(system => ({
      ...system,
      heroHistory: new Map(system.heroHistory ?? []),
    }));
  } catch (e) {
    console.warn("Failed to load layout systems:", e);
    return [];
  }
}

/**
 * Load a specific layout system by ID
 */
export function loadLayoutSystem(id: string): LayoutSystem | null {
  const systems = loadAllLayoutSystems();
  return systems.find(s => s.id === id) ?? null;
}

/**
 * Delete a layout system
 */
export function deleteLayoutSystem(id: string): void {
  const systems = loadAllLayoutSystems().filter(s => s.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(systems));
  } catch (e) {
    console.warn("Failed to delete layout system:", e);
  }
}

// =============================================================================
// TOKEN APPLICATION
// =============================================================================

/**
 * Apply layout system tokens to layout generation input
 */
export function applyLayoutSystemToInput(
  system: LayoutSystem
): {
  gutter: number;
  radius: number;
  margin: { top: number; right: number; bottom: number; left: number };
  tasteMode: TasteModeId;
  globalLocks: GlobalLocks;
} {
  return {
    gutter: system.tokens.gutter,
    radius: system.tokens.cornerRadius,
    margin: {
      top: system.tokens.marginTop,
      right: system.tokens.marginRight,
      bottom: system.tokens.marginBottom,
      left: system.tokens.marginLeft,
    },
    tasteMode: system.tokens.tasteMode,
    globalLocks: system.tokens.locked,
  };
}

/**
 * Update layout system tokens from a generated variant
 */
export function updateSystemFromVariant(
  system: LayoutSystem,
  variant: {
    gutter: number;
    margin: { top: number; right: number; bottom: number; left: number };
    tasteMode: TasteModeId;
  }
): LayoutSystem {
  return {
    ...system,
    tokens: {
      ...system.tokens,
      gutter: variant.gutter,
      marginTop: variant.margin.top,
      marginRight: variant.margin.right,
      marginBottom: variant.margin.bottom,
      marginLeft: variant.margin.left,
      tasteMode: variant.tasteMode,
    },
    updatedAt: Date.now(),
  };
}

// =============================================================================
// RHYTHM ANALYSIS
// =============================================================================

export interface RhythmAnalysis {
  /** Consistency score 0-1 */
  consistency: number;
  /** Suggested improvements */
  suggestions: string[];
  /** Pattern detected */
  detectedPattern: string | null;
}

/**
 * Analyze rhythm across multiple slides
 */
export function analyzeRhythm(
  heroPositions: HeroPosition[]
): RhythmAnalysis {
  if (heroPositions.length < 2) {
    return { consistency: 1, suggestions: [], detectedPattern: null };
  }
  
  // Check for alternating pattern
  let isAlternating = true;
  for (let i = 1; i < heroPositions.length; i++) {
    if (heroPositions[i] === heroPositions[i - 1]) {
      isAlternating = false;
      break;
    }
  }
  
  // Check for consistent position
  const allSame = heroPositions.every(p => p === heroPositions[0]);
  
  // Check for LRC pattern
  const isLRC = heroPositions.length >= 3 && 
    heroPositions.every((p, i) => {
      const expected = ["left", "right", "center"][i % 3];
      return p === expected;
    });
  
  const suggestions: string[] = [];
  let detectedPattern: string | null = null;
  let consistency = 0.5;
  
  if (isLRC) {
    detectedPattern = "Left-Right-Center rotation";
    consistency = 1.0;
  } else if (isAlternating) {
    detectedPattern = "Alternating";
    consistency = 0.9;
  } else if (allSame) {
    detectedPattern = `Fixed ${heroPositions[0]}`;
    consistency = 0.8;
    suggestions.push("Consider alternating hero positions for visual interest");
  } else {
    // Random/no pattern
    suggestions.push("Hero positions seem random. Consider a consistent pattern.");
    consistency = 0.4;
  }
  
  return { consistency, suggestions, detectedPattern };
}

/**
 * Suggest hero position for next slide based on history
 */
export function suggestNextHeroPosition(
  history: HeroPosition[],
  preferredPattern: HeroPattern["type"] = "alternate-lr"
): HeroPosition {
  if (history.length === 0) {
    return getNextHeroPosition({ type: preferredPattern, currentIndex: 0 });
  }
  
  const lastPosition = history[history.length - 1];
  const pattern = HERO_PATTERNS[preferredPattern];
  
  // Find where we are in the pattern
  const lastIndex = pattern.indexOf(lastPosition);
  if (lastIndex === -1) {
    return pattern[0];
  }
  
  return pattern[(lastIndex + 1) % pattern.length];
}
