/**
 * Media Intelligence - Smart detection and styling for different media types
 * 
 * Phase 2 Feature G:
 * - Screenshot detection → card treatment with padding + shadow
 * - Logo detection → contain mode with padding + mono filter option
 * - Photo detection → cover mode with focal point awareness
 */

import type { GeneratedFrame } from "./magicLayoutTypes";

// =============================================================================
// MEDIA TYPE DETECTION
// =============================================================================

export type MediaType = 
  | "photo"         // Standard photo - use cover
  | "screenshot"    // UI screenshot - card treatment
  | "logo"          // Logo/icon - contain with padding
  | "illustration"  // Vector/illustration - contain or cover
  | "text-heavy"    // Infographic/text - maintain readability
  | "unknown";

export interface MediaAnalysis {
  type: MediaType;
  confidence: number; // 0-1
  features: MediaFeatures;
  suggestedTreatment: MediaTreatment;
}

export interface MediaFeatures {
  hasTransparency: boolean;
  isMonochrome: boolean;
  hasSharpEdges: boolean;     // Suggests screenshot/logo
  aspectRatio: number;
  dominantColors: number;     // Number of distinct colors
  edgeDensity: number;        // High = complex image
  textLikelihood: number;     // 0-1, how likely to contain text
}

export interface MediaTreatment {
  fitMode: "cover" | "contain" | "fill";
  padding: number;           // Inner padding in px
  backgroundColor?: string;  // Background for contain mode
  borderRadius: number;
  shadow: ShadowConfig | null;
  filter?: string;           // CSS filter
}

export interface ShadowConfig {
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: string;
}

// =============================================================================
// IMAGE ANALYSIS
// =============================================================================

/**
 * Analyze an image to detect its media type
 */
export async function analyzeMedia(imageSrc: string): Promise<MediaAnalysis> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      
      if (!ctx) {
        resolve(createDefaultAnalysis());
        return;
      }
      
      // Sample at reduced size for performance
      const maxSize = 150;
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      const features = extractFeatures(imageData, img.width / img.height);
      const type = classifyMediaType(features);
      const treatment = generateTreatment(type, features);
      
      resolve({
        type,
        confidence: calculateConfidence(features, type),
        features,
        suggestedTreatment: treatment,
      });
    };
    
    img.onerror = () => resolve(createDefaultAnalysis());
    img.src = imageSrc;
  });
}

/**
 * Extract visual features from image data
 */
function extractFeatures(imageData: ImageData, aspectRatio: number): MediaFeatures {
  const pixels = imageData.data;
  const totalPixels = imageData.width * imageData.height;
  
  let transparentPixels = 0;
  let grayPixels = 0;
  const colorBuckets = new Set<string>();
  let edgeCount = 0;
  
  // Analyze each pixel
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    
    // Check transparency
    if (a < 255) transparentPixels++;
    
    // Check if grayscale
    const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    if (maxDiff < 20) grayPixels++;
    
    // Color bucketing (reduced precision)
    const bucket = `${Math.round(r / 32)},${Math.round(g / 32)},${Math.round(b / 32)}`;
    colorBuckets.add(bucket);
  }
  
  // Detect sharp edges using Sobel-like approach
  for (let y = 1; y < imageData.height - 1; y++) {
    for (let x = 1; x < imageData.width - 1; x++) {
      const idx = (y * imageData.width + x) * 4;
      const left = (y * imageData.width + x - 1) * 4;
      const right = (y * imageData.width + x + 1) * 4;
      const up = ((y - 1) * imageData.width + x) * 4;
      const down = ((y + 1) * imageData.width + x) * 4;
      
      // Calculate gradient magnitude
      const gx = Math.abs(pixels[right] - pixels[left]);
      const gy = Math.abs(pixels[down] - pixels[up]);
      const gradient = Math.sqrt(gx * gx + gy * gy);
      
      // High gradient = edge
      if (gradient > 50) edgeCount++;
    }
  }
  
  const edgeDensity = edgeCount / totalPixels;
  const hasTransparency = transparentPixels > totalPixels * 0.05;
  const isMonochrome = grayPixels > totalPixels * 0.9;
  const hasSharpEdges = edgeDensity > 0.1;
  const dominantColors = colorBuckets.size;
  
  // Text likelihood based on edge density and color count
  const textLikelihood = Math.min(1, (edgeDensity * 2) * (dominantColors < 50 ? 1.5 : 1));
  
  return {
    hasTransparency,
    isMonochrome,
    hasSharpEdges,
    aspectRatio,
    dominantColors,
    edgeDensity,
    textLikelihood,
  };
}

/**
 * Classify media type based on features
 */
function classifyMediaType(features: MediaFeatures): MediaType {
  const { hasTransparency, isMonochrome, hasSharpEdges, aspectRatio, dominantColors, textLikelihood } = features;
  
  // Logo detection: transparent, few colors, likely square-ish
  if (hasTransparency && dominantColors < 30 && aspectRatio > 0.5 && aspectRatio < 2) {
    return "logo";
  }
  
  // Screenshot detection: sharp edges, many colors, wide aspect
  if (hasSharpEdges && dominantColors > 100 && !hasTransparency) {
    if (aspectRatio > 1.2 || textLikelihood > 0.6) {
      return "screenshot";
    }
  }
  
  // Text-heavy: high edge density + likely text
  if (textLikelihood > 0.7 && dominantColors < 80) {
    return "text-heavy";
  }
  
  // Illustration: transparent with colors, or vector-like (few colors, clean edges)
  if (hasTransparency && dominantColors < 100 && dominantColors > 30) {
    return "illustration";
  }
  
  // Default to photo
  return "photo";
}

/**
 * Calculate confidence score for the classification
 */
function calculateConfidence(features: MediaFeatures, type: MediaType): number {
  let confidence = 0.5;
  
  switch (type) {
    case "logo":
      if (features.hasTransparency) confidence += 0.2;
      if (features.dominantColors < 20) confidence += 0.15;
      if (features.isMonochrome) confidence += 0.1;
      break;
      
    case "screenshot":
      if (features.hasSharpEdges) confidence += 0.15;
      if (features.textLikelihood > 0.5) confidence += 0.2;
      if (features.aspectRatio > 1.3) confidence += 0.1;
      break;
      
    case "photo":
      if (features.dominantColors > 150) confidence += 0.2;
      if (!features.hasTransparency) confidence += 0.15;
      if (!features.hasSharpEdges) confidence += 0.1;
      break;
      
    case "illustration":
      if (features.hasTransparency) confidence += 0.15;
      if (features.dominantColors < 100) confidence += 0.15;
      break;
      
    case "text-heavy":
      if (features.textLikelihood > 0.7) confidence += 0.25;
      break;
  }
  
  return Math.min(1, confidence);
}

/**
 * Generate treatment recommendation based on media type
 */
function generateTreatment(type: MediaType, features: MediaFeatures): MediaTreatment {
  switch (type) {
    case "screenshot":
      return {
        fitMode: "contain",
        padding: 24,
        backgroundColor: features.isMonochrome ? "#1a1a1a" : "#0f0f0f",
        borderRadius: 12,
        shadow: {
          offsetX: 0,
          offsetY: 8,
          blur: 32,
          spread: -8,
          color: "rgba(0, 0, 0, 0.4)",
        },
      };
      
    case "logo":
      return {
        fitMode: "contain",
        padding: 32,
        backgroundColor: features.isMonochrome ? "transparent" : "rgba(255, 255, 255, 0.03)",
        borderRadius: 8,
        shadow: null,
        filter: features.isMonochrome ? undefined : undefined, // Could add grayscale filter
      };
      
    case "illustration":
      return {
        fitMode: "contain",
        padding: 16,
        backgroundColor: "transparent",
        borderRadius: 0,
        shadow: null,
      };
      
    case "text-heavy":
      return {
        fitMode: "contain",
        padding: 16,
        backgroundColor: "#ffffff",
        borderRadius: 8,
        shadow: {
          offsetX: 0,
          offsetY: 4,
          blur: 16,
          spread: 0,
          color: "rgba(0, 0, 0, 0.15)",
        },
      };
      
    case "photo":
    default:
      return {
        fitMode: "cover",
        padding: 0,
        borderRadius: 16,
        shadow: null,
      };
  }
}

/**
 * Create default analysis for error cases
 */
function createDefaultAnalysis(): MediaAnalysis {
  return {
    type: "photo",
    confidence: 0.5,
    features: {
      hasTransparency: false,
      isMonochrome: false,
      hasSharpEdges: false,
      aspectRatio: 1,
      dominantColors: 100,
      edgeDensity: 0.05,
      textLikelihood: 0,
    },
    suggestedTreatment: {
      fitMode: "cover",
      padding: 0,
      borderRadius: 16,
      shadow: null,
    },
  };
}

// =============================================================================
// BATCH ANALYSIS
// =============================================================================

/**
 * Analyze multiple images and return a map of treatments
 */
export async function analyzeMediaBatch(
  imageSrcs: string[]
): Promise<Map<string, MediaAnalysis>> {
  const results = new Map<string, MediaAnalysis>();
  
  const analyses = await Promise.all(
    imageSrcs.map(async (src) => ({
      src,
      analysis: await analyzeMedia(src),
    }))
  );
  
  for (const { src, analysis } of analyses) {
    results.set(src, analysis);
  }
  
  return results;
}

// =============================================================================
// APPLY TO FRAMES
// =============================================================================

/**
 * Apply media intelligence to a frame's styling
 */
export function applyMediaIntelligence(
  frame: GeneratedFrame,
  analysis: MediaAnalysis
): Partial<GeneratedFrame> {
  const treatment = analysis.suggestedTreatment;
  
  return {
    radius: treatment.borderRadius,
    // Additional properties could be added here for:
    // - fitMode
    // - padding
    // - shadow
    // - backgroundColor
  };
}

/**
 * Get CSS styles for a frame based on media treatment
 */
export function getMediaTreatmentCSS(treatment: MediaTreatment): React.CSSProperties {
  const styles: React.CSSProperties = {
    borderRadius: treatment.borderRadius,
    objectFit: treatment.fitMode,
    padding: treatment.padding,
    backgroundColor: treatment.backgroundColor,
  };
  
  if (treatment.shadow) {
    const s = treatment.shadow;
    styles.boxShadow = `${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.spread}px ${s.color}`;
  }
  
  if (treatment.filter) {
    styles.filter = treatment.filter;
  }
  
  return styles;
}

/**
 * Get the best fit mode for a media type
 */
export function getFitModeForMediaType(type: MediaType): "cover" | "contain" | "fill" {
  switch (type) {
    case "logo":
    case "screenshot":
    case "illustration":
    case "text-heavy":
      return "contain";
    case "photo":
    default:
      return "cover";
  }
}
