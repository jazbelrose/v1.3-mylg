/**
 * Layout Scoring System
 * 
 * Evaluates generated layouts and assigns quality scores based on:
 * - Alignment to grids/guides
 * - Spacing consistency
 * - Visual hierarchy
 * - Balance and variety
 * - Text readability
 * - Crop quality for images
 */

import type {
  GeneratedFrame,
  LayoutVariant,
  ScoringWeights,
  Rect,
} from "./magicLayoutTypes";

import { DEFAULT_SCORING_WEIGHTS } from "./magicLayoutTypes";

// Re-export for consumers
export { DEFAULT_SCORING_WEIGHTS };

/**
 * Calculate the alignment score
 * Higher score = frames align well to grid lines
 */
function scoreAlignment(frames: GeneratedFrame[], content: Rect, gutter: number): number {
  if (frames.length <= 1) return 1.0;

  // Collect all x and y coordinates
  const xCoords = new Set<number>();
  const yCoords = new Set<number>();
  
  frames.forEach((f) => {
    xCoords.add(Math.round(f.x));
    xCoords.add(Math.round(f.x + f.width));
    yCoords.add(Math.round(f.y));
    yCoords.add(Math.round(f.y + f.height));
  });

  // Count how many frames share alignment with others
  let alignedCount = 0;
  const tolerance = gutter * 0.1 || 2;

  frames.forEach((f) => {
    let hasXAlign = false;
    let hasYAlign = false;

    frames.forEach((other) => {
      if (f.id === other.id) return;
      
      // Check left edge alignment
      if (Math.abs(f.x - other.x) <= tolerance) hasXAlign = true;
      if (Math.abs(f.x + f.width - other.x - other.width) <= tolerance) hasXAlign = true;
      if (Math.abs(f.x - other.x - other.width) <= tolerance) hasXAlign = true;
      
      // Check top edge alignment
      if (Math.abs(f.y - other.y) <= tolerance) hasYAlign = true;
      if (Math.abs(f.y + f.height - other.y - other.height) <= tolerance) hasYAlign = true;
    });

    if (hasXAlign) alignedCount++;
    if (hasYAlign) alignedCount++;
  });

  const maxPossibleAlignments = frames.length * 2;
  return alignedCount / maxPossibleAlignments;
}

/**
 * Calculate spacing consistency score
 * Higher score = more consistent gaps between frames
 */
function scoreSpacing(frames: GeneratedFrame[], gutter: number): number {
  if (frames.length <= 1) return 1.0;

  // Find all horizontal and vertical gaps
  const gaps: number[] = [];

  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      const a = frames[i];
      const b = frames[j];

      // Horizontal gap (a is left of b)
      if (a.x + a.width <= b.x && overlapY(a, b)) {
        gaps.push(b.x - (a.x + a.width));
      }
      // Horizontal gap (b is left of a)
      if (b.x + b.width <= a.x && overlapY(a, b)) {
        gaps.push(a.x - (b.x + b.width));
      }
      // Vertical gap (a is above b)
      if (a.y + a.height <= b.y && overlapX(a, b)) {
        gaps.push(b.y - (a.y + a.height));
      }
      // Vertical gap (b is above a)
      if (b.y + b.height <= a.y && overlapX(a, b)) {
        gaps.push(a.y - (b.y + b.height));
      }
    }
  }

  if (gaps.length === 0) return 1.0;

  // Calculate variance from target gutter
  const targetGutter = gutter;
  const deviations = gaps.map((g) => Math.abs(g - targetGutter) / Math.max(targetGutter, 1));
  const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;

  // Convert to 0-1 score (lower deviation = higher score)
  return Math.max(0, 1 - avgDeviation);
}

/** Check if two rectangles overlap on X axis */
function overlapX(a: Rect, b: Rect): boolean {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x);
}

/** Check if two rectangles overlap on Y axis */
function overlapY(a: Rect, b: Rect): boolean {
  return !(a.y + a.height <= b.y || b.y + b.height <= a.y);
}

/**
 * Calculate hierarchy score
 * Higher score = clear hero frame that stands out
 */
function scoreHierarchy(frames: GeneratedFrame[]): number {
  if (frames.length <= 1) return 1.0;

  const areas = frames.map((f) => f.width * f.height);
  const maxArea = Math.max(...areas);
  const avgArea = areas.reduce((a, b) => a + b, 0) / areas.length;

  // Hero should be significantly larger than average
  const heroRatio = maxArea / avgArea;
  
  // Count how many frames are "hero-sized" (within 90% of max)
  const heroThreshold = maxArea * 0.9;
  const heroCount = areas.filter((a) => a >= heroThreshold).length;

  // Ideal: one clear hero (ratio > 1.3) and only 1 hero-sized frame
  let score = 0;
  
  if (heroRatio >= 1.5) score += 0.5;
  else if (heroRatio >= 1.3) score += 0.35;
  else if (heroRatio >= 1.15) score += 0.2;

  if (heroCount === 1) score += 0.5;
  else if (heroCount === 2) score += 0.3;
  else score += 0.1;

  return Math.min(1, score);
}

/**
 * Calculate balance score
 * Higher score = visual weight is well distributed
 */
function scoreBalance(frames: GeneratedFrame[], content: Rect): number {
  if (frames.length <= 1) return 1.0;

  const centerX = content.x + content.width / 2;
  const centerY = content.y + content.height / 2;

  // Calculate center of mass based on frame areas
  let totalArea = 0;
  let weightedX = 0;
  let weightedY = 0;

  frames.forEach((f) => {
    const area = f.width * f.height;
    const frameCenterX = f.x + f.width / 2;
    const frameCenterY = f.y + f.height / 2;
    
    totalArea += area;
    weightedX += frameCenterX * area;
    weightedY += frameCenterY * area;
  });

  const massX = weightedX / totalArea;
  const massY = weightedY / totalArea;

  // Calculate offset from center as percentage of content size
  const offsetX = Math.abs(massX - centerX) / (content.width / 2);
  const offsetY = Math.abs(massY - centerY) / (content.height / 2);

  // Average offset, inverted to score
  const avgOffset = (offsetX + offsetY) / 2;
  return Math.max(0, 1 - avgOffset);
}

/**
 * Calculate variety score
 * Higher score = interesting variation without chaos
 */
function scoreVariety(frames: GeneratedFrame[]): number {
  if (frames.length <= 1) return 1.0;

  const areas = frames.map((f) => f.width * f.height);
  const aspectRatios = frames.map((f) => f.width / f.height);

  // Calculate coefficient of variation for areas
  const avgArea = areas.reduce((a, b) => a + b, 0) / areas.length;
  const areaVariance = areas.reduce((sum, a) => sum + Math.pow(a - avgArea, 2), 0) / areas.length;
  const areaCV = Math.sqrt(areaVariance) / avgArea;

  // Calculate spread of aspect ratios
  const minAR = Math.min(...aspectRatios);
  const maxAR = Math.max(...aspectRatios);
  const arSpread = maxAR - minAR;

  // Ideal: moderate variety (CV between 0.2 and 0.5, AR spread between 0.3 and 1.5)
  let areaScore = 0;
  if (areaCV >= 0.15 && areaCV <= 0.6) areaScore = 1;
  else if (areaCV < 0.15) areaScore = areaCV / 0.15;
  else areaScore = Math.max(0, 1 - (areaCV - 0.6) / 0.4);

  let arScore = 0;
  if (arSpread >= 0.2 && arSpread <= 1.5) arScore = 1;
  else if (arSpread < 0.2) arScore = arSpread / 0.2;
  else arScore = Math.max(0, 1 - (arSpread - 1.5) / 1);

  return (areaScore + arScore) / 2;
}

/**
 * Calculate text readability score
 * Higher score = text frames have good proportions for reading
 */
function scoreTextReadability(frames: GeneratedFrame[]): number {
  const textFrames = frames.filter((f) => f.contentType === "text");
  if (textFrames.length === 0) return 1.0;

  let totalScore = 0;

  textFrames.forEach((f) => {
    // Ideal aspect ratio for text: between 1.5 and 4 (wider than tall)
    const ar = f.width / f.height;
    let arScore = 0;
    if (ar >= 1.2 && ar <= 5) arScore = 1;
    else if (ar < 1.2) arScore = ar / 1.2;
    else arScore = Math.max(0, 1 - (ar - 5) / 3);

    // Ideal width for reading: 300-800px
    let widthScore = 0;
    if (f.width >= 280 && f.width <= 900) widthScore = 1;
    else if (f.width < 280) widthScore = f.width / 280;
    else widthScore = Math.max(0, 1 - (f.width - 900) / 400);

    // Minimum height for comfortable text
    let heightScore = f.height >= 100 ? 1 : f.height / 100;

    totalScore += (arScore + widthScore + heightScore) / 3;
  });

  return totalScore / textFrames.length;
}

/**
 * Calculate crop quality score for image frames
 * Higher score = frames have good aspect ratios for images
 */
function scoreCropQuality(frames: GeneratedFrame[]): number {
  const imageFrames = frames.filter((f) => f.contentType === "image");
  if (imageFrames.length === 0) return 1.0;

  let totalScore = 0;

  imageFrames.forEach((f) => {
    const ar = f.width / f.height;
    
    // Common good aspect ratios: 1:1, 4:3, 3:2, 16:9, 2:3, 3:4
    const goodRatios = [1, 4/3, 3/2, 16/9, 2/3, 3/4, 9/16];
    const minDistance = Math.min(...goodRatios.map((r) => Math.abs(ar - r)));
    
    // Score based on proximity to a good ratio
    const score = Math.max(0, 1 - minDistance * 2);
    totalScore += score;
  });

  return totalScore / imageFrames.length;
}

/**
 * Calculate overall layout score
 */
export function scoreLayout(
  variant: LayoutVariant,
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS
): number {
  const { frames, content, gutter } = variant;

  const scores = {
    alignment: scoreAlignment(frames, content, gutter),
    spacing: scoreSpacing(frames, gutter),
    hierarchy: scoreHierarchy(frames),
    balance: scoreBalance(frames, content),
    variety: scoreVariety(frames),
    textReadability: scoreTextReadability(frames),
    cropQuality: scoreCropQuality(frames),
    storyboardFit: 1.0, // Placeholder for storyboard template matching
  };

  // Weighted average
  let totalWeight = 0;
  let weightedSum = 0;

  (Object.keys(scores) as Array<keyof typeof scores>).forEach((key) => {
    const weight = weights[key] ?? 0;
    totalWeight += weight;
    weightedSum += scores[key] * weight;
  });

  return totalWeight > 0 ? weightedSum / totalWeight : 0.5;
}

/**
 * Score and sort multiple variants, returning top N
 */
export function rankVariants(
  variants: LayoutVariant[],
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
  topN?: number
): LayoutVariant[] {
  // Score each variant
  const scored = variants.map((v) => ({
    ...v,
    score: scoreLayout(v, weights),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return top N if specified
  return topN !== undefined ? scored.slice(0, topN) : scored;
}
