/**
 * Crop Intents - Smart cropping presets for different image purposes
 * 
 * Phase 2 Feature B:
 * - Editorial crop: Rule of thirds, subject awareness
 * - Product crop: Centered, full visibility, padding
 * - Drama crop: Close-up, tension, asymmetric
 * - Basic focal point detection
 */

import type { GeneratedFrame } from "./magicLayoutTypes";

// =============================================================================
// CROP INTENT TYPES
// =============================================================================

export type CropIntent = 
  | "auto"        // Automatically detect best crop
  | "editorial"   // Rule of thirds, storytelling composition
  | "product"     // Centered, full visibility
  | "drama"       // Close-up, tension, asymmetric cropping
  | "portrait"    // Face-focused, centered vertically
  | "landscape"   // Horizon-aware, wide view
  | "detail"      // Tight crop on interesting details
  | "fill";       // Simply fill the frame, no intelligence

export interface CropConfig {
  intent: CropIntent;
  focalPoint: FocalPoint;
  zoom: number;           // 1.0 = no zoom, 1.5 = 50% zoom in
  offsetX: number;        // -1 to 1, pan left/right
  offsetY: number;        // -1 to 1, pan up/down
}

export interface FocalPoint {
  x: number; // 0-1, left to right
  y: number; // 0-1, top to bottom
  weight: number; // 0-1, importance
}

export interface CropResult {
  /** CSS object-position value */
  objectPosition: string;
  /** CSS object-fit value */
  objectFit: "cover" | "contain" | "fill";
  /** Suggested aspect ratio for the frame */
  suggestedAspectRatio?: number;
  /** Transform for fine-tuning (scale and translate) */
  transform?: string;
}

// =============================================================================
// FOCAL POINT DETECTION
// =============================================================================

/**
 * Simple focal point detection using edge/interest analysis
 * For a more sophisticated approach, use ML-based detection
 */
export async function detectFocalPoint(imageSrc: string): Promise<FocalPoint> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      
      if (!ctx) {
        resolve({ x: 0.5, y: 0.5, weight: 0.5 });
        return;
      }
      
      // Sample at reduced size
      const maxSize = 100;
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      const focalPoint = findInterestPoint(imageData);
      resolve(focalPoint);
    };
    
    img.onerror = () => resolve({ x: 0.5, y: 0.5, weight: 0.5 });
    img.src = imageSrc;
  });
}

/**
 * Find the point of highest visual interest in the image
 * Uses edge detection + color contrast
 */
function findInterestPoint(imageData: ImageData): FocalPoint {
  const { width, height, data } = imageData;
  
  // Calculate interest map
  const interestMap: number[][] = [];
  for (let y = 0; y < height; y++) {
    interestMap[y] = [];
    for (let x = 0; x < width; x++) {
      interestMap[y][x] = 0;
    }
  }
  
  // Edge detection (Sobel-like)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const left = ((y * width) + (x - 1)) * 4;
      const right = ((y * width) + (x + 1)) * 4;
      const up = (((y - 1) * width) + x) * 4;
      const down = (((y + 1) * width) + x) * 4;
      
      // Calculate gradient
      const gx = Math.abs(data[right] - data[left]);
      const gy = Math.abs(data[down] - data[up]);
      const gradient = Math.sqrt(gx * gx + gy * gy);
      
      // Saturation/color interest
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max > 0 ? (max - min) / max : 0;
      
      // Combined interest
      interestMap[y][x] = gradient * 0.7 + saturation * 100 * 0.3;
    }
  }
  
  // Apply rule of thirds weighting
  // Interest is higher at rule of thirds intersections
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const xThirds = [width / 3, width * 2 / 3];
      const yThirds = [height / 3, height * 2 / 3];
      
      let thirdsWeight = 1.0;
      for (const tx of xThirds) {
        for (const ty of yThirds) {
          const dist = Math.sqrt((x - tx) ** 2 + (y - ty) ** 2);
          const influence = Math.max(0, 1 - dist / (Math.min(width, height) / 4));
          thirdsWeight = Math.max(thirdsWeight, 1 + influence * 0.3);
        }
      }
      
      interestMap[y][x] *= thirdsWeight;
    }
  }
  
  // Find maximum interest point
  let maxInterest = 0;
  let focalX = width / 2;
  let focalY = height / 2;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (interestMap[y][x] > maxInterest) {
        maxInterest = interestMap[y][x];
        focalX = x;
        focalY = y;
      }
    }
  }
  
  // Normalize to 0-1 range
  return {
    x: focalX / width,
    y: focalY / height,
    weight: Math.min(1, maxInterest / 100),
  };
}

// =============================================================================
// CROP INTENT PRESETS
// =============================================================================

const INTENT_DEFAULTS: Record<CropIntent, Partial<CropConfig>> = {
  auto: { zoom: 1.0, offsetX: 0, offsetY: 0 },
  editorial: { zoom: 1.0, offsetX: 0, offsetY: 0 },
  product: { zoom: 1.0, offsetX: 0, offsetY: 0 },
  drama: { zoom: 1.3, offsetX: 0, offsetY: -0.1 },
  portrait: { zoom: 1.1, offsetX: 0, offsetY: -0.15 },
  landscape: { zoom: 1.0, offsetX: 0, offsetY: 0.1 },
  detail: { zoom: 1.6, offsetX: 0, offsetY: 0 },
  fill: { zoom: 1.0, offsetX: 0, offsetY: 0 },
};

// =============================================================================
// CROP CALCULATION
// =============================================================================

/**
 * Calculate crop result based on intent and focal point
 */
export function calculateCrop(
  intent: CropIntent,
  focalPoint: FocalPoint,
  frameAspect: number,
  imageAspect: number
): CropResult {
  const defaults = INTENT_DEFAULTS[intent];
  
  switch (intent) {
    case "fill":
      return {
        objectPosition: "center center",
        objectFit: "cover",
      };
      
    case "product":
      // Center the product, ensure full visibility
      return {
        objectPosition: "center center",
        objectFit: "contain",
        suggestedAspectRatio: 1, // Square tends to work well for products
      };
      
    case "portrait":
      // Focus on upper third (face area), slight zoom
      return {
        objectPosition: `center ${Math.round(focalPoint.y * 60 + 20)}%`,
        objectFit: "cover",
        transform: "scale(1.1)",
      };
      
    case "landscape":
      // Keep horizon in lower/upper third
      const horizonY = focalPoint.y > 0.5 ? 35 : 65;
      return {
        objectPosition: `center ${horizonY}%`,
        objectFit: "cover",
      };
      
    case "drama":
      // Asymmetric crop, zoom in, offset from center
      const dramaX = focalPoint.x < 0.5 ? 30 : 70;
      const dramaY = Math.round(focalPoint.y * 100);
      return {
        objectPosition: `${dramaX}% ${dramaY}%`,
        objectFit: "cover",
        transform: "scale(1.3)",
      };
      
    case "detail":
      // Tight crop on focal point
      return {
        objectPosition: `${Math.round(focalPoint.x * 100)}% ${Math.round(focalPoint.y * 100)}%`,
        objectFit: "cover",
        transform: "scale(1.6)",
      };
      
    case "editorial":
      // Rule of thirds placement
      const editX = focalPoint.x < 0.4 ? 33 : focalPoint.x > 0.6 ? 67 : 50;
      const editY = focalPoint.y < 0.4 ? 33 : focalPoint.y > 0.6 ? 67 : 50;
      return {
        objectPosition: `${editX}% ${editY}%`,
        objectFit: "cover",
      };
      
    case "auto":
    default:
      // Use focal point directly
      return {
        objectPosition: `${Math.round(focalPoint.x * 100)}% ${Math.round(focalPoint.y * 100)}%`,
        objectFit: "cover",
      };
  }
}

/**
 * Get CSS styles for applying a crop result
 */
export function getCropCSS(result: CropResult): React.CSSProperties {
  const styles: React.CSSProperties = {
    objectFit: result.objectFit,
    objectPosition: result.objectPosition,
  };
  
  if (result.transform) {
    styles.transform = result.transform;
  }
  
  return styles;
}

// =============================================================================
// FRAME-LEVEL CROP APPLICATION
// =============================================================================

/**
 * Apply crop intent to a frame's image
 */
export async function applyCropToFrame(
  frame: GeneratedFrame,
  intent: CropIntent
): Promise<CropResult> {
  if (!frame.imageSrc) {
    return { objectPosition: "center center", objectFit: "cover" };
  }
  
  const focalPoint = await detectFocalPoint(frame.imageSrc);
  const frameAspect = frame.width / frame.height;
  
  // We don't know the image aspect without loading it
  // For now, assume a common aspect
  const imageAspect = 1.5; // Placeholder
  
  return calculateCrop(intent, focalPoint, frameAspect, imageAspect);
}

/**
 * Batch apply crop intents to multiple frames
 */
export async function applyCropsToFrames(
  frames: GeneratedFrame[],
  intent: CropIntent = "auto"
): Promise<Map<string, CropResult>> {
  const results = new Map<string, CropResult>();
  
  const imageFrames = frames.filter(f => f.contentType === "image" && f.imageSrc);
  
  const cropPromises = imageFrames.map(async (frame) => {
    const result = await applyCropToFrame(frame, intent);
    return { frameId: frame.id, result };
  });
  
  const resolved = await Promise.all(cropPromises);
  
  for (const { frameId, result } of resolved) {
    results.set(frameId, result);
  }
  
  return results;
}

/**
 * Get recommended crop intent based on frame characteristics
 */
export function suggestCropIntent(frame: GeneratedFrame): CropIntent {
  const aspect = frame.width / frame.height;
  
  // Wide frames → landscape or editorial
  if (aspect > 2) return "landscape";
  
  // Tall frames → portrait
  if (aspect < 0.7) return "portrait";
  
  // Hero frames → editorial (rule of thirds)
  if (frame.isHero) return "editorial";
  
  // Small frames → detail or drama
  const area = frame.width * frame.height;
  const canvasArea = 1920 * 1080;
  if (area < canvasArea * 0.15) return "detail";
  
  // Default to auto
  return "auto";
}
