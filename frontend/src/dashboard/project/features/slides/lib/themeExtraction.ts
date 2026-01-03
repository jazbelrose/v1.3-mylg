/**
 * Theme Extraction - Extract colors and create contrast-safe palettes from images
 * 
 * Phase 2 Feature F:
 * - Extract dominant colors from images using canvas sampling
 * - Generate background colors that complement the palette
 * - Calculate contrast-safe text colors
 * - Create accent/stroke colors
 */

import type { ExtractedTheme, ExtractedColor } from "./magicLayoutTypes";

// =============================================================================
// COLOR UTILITIES
// =============================================================================

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}

function hexToRgb(hex: string): RGB | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  
  let h = 0;
  let s = 0;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h: number, s: number, l: number): RGB {
  h /= 360;
  s /= 100;
  l /= 100;
  
  let r, g, b;
  
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

/**
 * Calculate relative luminance for WCAG contrast
 */
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate WCAG contrast ratio between two colors
 */
function getContrastRatio(rgb1: RGB, rgb2: RGB): number {
  const l1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if contrast meets WCAG AA (4.5:1 for normal text)
 */
function meetsContrastAA(rgb1: RGB, rgb2: RGB): boolean {
  return getContrastRatio(rgb1, rgb2) >= 4.5;
}

// =============================================================================
// COLOR EXTRACTION
// =============================================================================

interface ColorBucket {
  r: number;
  g: number;
  b: number;
  count: number;
}

/**
 * Extract dominant colors from an image using canvas sampling
 */
async function extractColorsFromImage(
  imageSrc: string,
  sampleCount: number = 5
): Promise<ExtractedColor[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve([]);
        return;
      }
      
      // Sample at reduced size for performance
      const maxSize = 100;
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      
      // Bucket colors using k-means-like clustering
      const buckets = new Map<string, ColorBucket>();
      const bucketSize = 32; // Group similar colors
      
      for (let i = 0; i < pixels.length; i += 4) {
        const r = Math.round(pixels[i] / bucketSize) * bucketSize;
        const g = Math.round(pixels[i + 1] / bucketSize) * bucketSize;
        const b = Math.round(pixels[i + 2] / bucketSize) * bucketSize;
        const a = pixels[i + 3];
        
        if (a < 128) continue; // Skip transparent
        
        const key = `${r},${g},${b}`;
        const bucket = buckets.get(key);
        if (bucket) {
          bucket.r += pixels[i];
          bucket.g += pixels[i + 1];
          bucket.b += pixels[i + 2];
          bucket.count++;
        } else {
          buckets.set(key, {
            r: pixels[i],
            g: pixels[i + 1],
            b: pixels[i + 2],
            count: 1,
          });
        }
      }
      
      // Convert to sorted array
      const totalPixels = (canvas.width * canvas.height) || 1;
      const colors: ExtractedColor[] = Array.from(buckets.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, sampleCount * 2)
        .map(bucket => {
          const r = Math.round(bucket.r / bucket.count);
          const g = Math.round(bucket.g / bucket.count);
          const b = Math.round(bucket.b / bucket.count);
          const prominence = bucket.count / totalPixels;
          const hsl = rgbToHsl(r, g, b);
          
          // Categorize by saturation and luminance
          let category: ExtractedColor["category"];
          if (hsl.s < 15) {
            category = "neutral";
          } else if (hsl.s > 60 && hsl.l > 30 && hsl.l < 70) {
            category = prominence > 0.1 ? "primary" : "accent";
          } else {
            category = "secondary";
          }
          
          return {
            hex: rgbToHex(r, g, b),
            rgb: { r, g, b },
            prominence,
            category,
          };
        })
        .slice(0, sampleCount);
      
      resolve(colors);
    };
    
    img.onerror = () => resolve([]);
    img.src = imageSrc;
  });
}

// =============================================================================
// THEME GENERATION
// =============================================================================

/**
 * Generate a background color that complements the extracted palette
 */
function generateBackground(
  palette: ExtractedColor[],
  preferDark: boolean = true
): string {
  if (palette.length === 0) {
    return preferDark ? "#101112" : "#fafafa";
  }
  
  // Find the most prominent color
  const primary = palette.find(c => c.category === "primary") ?? palette[0];
  const hsl = rgbToHsl(primary.rgb.r, primary.rgb.g, primary.rgb.b);
  
  if (preferDark) {
    // Create a very dark, slightly tinted background
    const bgHsl = { h: hsl.h, s: Math.min(hsl.s * 0.3, 10), l: 8 };
    const rgb = hslToRgb(bgHsl.h, bgHsl.s, bgHsl.l);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  } else {
    // Create a very light, slightly tinted background
    const bgHsl = { h: hsl.h, s: Math.min(hsl.s * 0.2, 5), l: 96 };
    const rgb = hslToRgb(bgHsl.h, bgHsl.s, bgHsl.l);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }
}

/**
 * Calculate contrast-safe text colors for the given background
 */
function calculateTextColors(
  background: string
): { light: string; dark: string } {
  const bgRgb = hexToRgb(background);
  if (!bgRgb) {
    return { light: "#ffffff", dark: "#101112" };
  }
  
  const bgLuminance = getLuminance(bgRgb.r, bgRgb.g, bgRgb.b);
  
  // For dark backgrounds, return light colors with good contrast
  if (bgLuminance < 0.5) {
    return {
      light: "#ffffff",
      dark: "rgba(255, 255, 255, 0.65)",
    };
  }
  
  // For light backgrounds, return dark colors
  return {
    light: "#101112",
    dark: "rgba(16, 17, 18, 0.65)",
  };
}

/**
 * Generate an accent stroke color from the palette
 */
function generateAccentStroke(
  palette: ExtractedColor[],
  background: string
): string | undefined {
  const accent = palette.find(c => c.category === "accent") 
    ?? palette.find(c => c.category === "primary");
  
  if (!accent) return undefined;
  
  const bgRgb = hexToRgb(background);
  if (!bgRgb) return accent.hex;
  
  // Ensure the accent has good contrast with the background
  const contrastRatio = getContrastRatio(accent.rgb, bgRgb);
  if (contrastRatio < 3) {
    // Boost saturation and adjust lightness for better contrast
    const hsl = rgbToHsl(accent.rgb.r, accent.rgb.g, accent.rgb.b);
    const bgLuminance = getLuminance(bgRgb.r, bgRgb.g, bgRgb.b);
    
    const adjustedL = bgLuminance < 0.5 
      ? Math.max(hsl.l, 60) 
      : Math.min(hsl.l, 40);
    const adjustedS = Math.min(hsl.s * 1.2, 100);
    
    const adjusted = hslToRgb(hsl.h, adjustedS, adjustedL);
    return rgbToHex(adjusted.r, adjusted.g, adjusted.b);
  }
  
  return accent.hex;
}

/**
 * Generate a gradient suggestion from two palette colors
 */
function generateGradient(
  palette: ExtractedColor[]
): { start: string; end: string; angle: number } | undefined {
  if (palette.length < 2) return undefined;
  
  // Use primary and secondary/accent for gradient
  const start = palette[0];
  const end = palette[1];
  
  // Calculate angle based on hue difference for visual interest
  const hsl1 = rgbToHsl(start.rgb.r, start.rgb.g, start.rgb.b);
  const hsl2 = rgbToHsl(end.rgb.r, end.rgb.g, end.rgb.b);
  const hueDiff = Math.abs(hsl1.h - hsl2.h);
  
  // Map hue difference to angle (45-135 degrees for variety)
  const angle = 45 + (hueDiff / 360) * 90;
  
  return {
    start: start.hex,
    end: end.hex,
    angle: Math.round(angle),
  };
}

// =============================================================================
// MAIN EXTRACTION API
// =============================================================================

/**
 * Extract a complete theme from one or more images
 */
export async function extractTheme(
  imageSrcs: string[],
  options: {
    preferDark?: boolean;
    maxColors?: number;
  } = {}
): Promise<ExtractedTheme> {
  const { preferDark = true, maxColors = 5 } = options;
  
  // Extract colors from all images
  const allColors: ExtractedColor[] = [];
  
  for (const src of imageSrcs.slice(0, 5)) { // Max 5 images
    const colors = await extractColorsFromImage(src, maxColors);
    allColors.push(...colors);
  }
  
  // Merge and dedupe colors
  const mergedPalette = mergeColors(allColors, maxColors);
  
  // Generate theme components
  const background = generateBackground(mergedPalette, preferDark);
  const contrastTextColors = calculateTextColors(background);
  const gradient = generateGradient(mergedPalette);
  const accentStroke = generateAccentStroke(mergedPalette, background);
  
  return {
    palette: mergedPalette,
    suggestedBackground: background,
    suggestedGradient: gradient,
    contrastTextColors,
    accentStroke,
  };
}

/**
 * Merge colors from multiple images, deduping similar colors
 */
function mergeColors(
  colors: ExtractedColor[],
  maxCount: number
): ExtractedColor[] {
  if (colors.length === 0) return [];
  
  // Sort by prominence
  const sorted = [...colors].sort((a, b) => b.prominence - a.prominence);
  
  // Dedupe colors that are too similar
  const dedupedColors: ExtractedColor[] = [];
  const minDistance = 40; // Minimum color distance to keep
  
  for (const color of sorted) {
    const isSimilar = dedupedColors.some(existing => {
      const dr = Math.abs(color.rgb.r - existing.rgb.r);
      const dg = Math.abs(color.rgb.g - existing.rgb.g);
      const db = Math.abs(color.rgb.b - existing.rgb.b);
      return dr + dg + db < minDistance;
    });
    
    if (!isSimilar) {
      dedupedColors.push(color);
      if (dedupedColors.length >= maxCount) break;
    }
  }
  
  return dedupedColors;
}

/**
 * Create a quick theme from a single dominant color
 * Useful for placeholder/fallback themes
 */
export function createQuickTheme(
  dominantColor: string,
  preferDark: boolean = true
): ExtractedTheme {
  const rgb = hexToRgb(dominantColor);
  if (!rgb) {
    return createDefaultTheme(preferDark);
  }
  
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const palette: ExtractedColor[] = [
    {
      hex: dominantColor,
      rgb,
      prominence: 1.0,
      category: "primary",
    },
  ];
  
  // Generate complementary color
  const compHue = (hsl.h + 180) % 360;
  const compRgb = hslToRgb(compHue, hsl.s * 0.8, hsl.l);
  palette.push({
    hex: rgbToHex(compRgb.r, compRgb.g, compRgb.b),
    rgb: compRgb,
    prominence: 0.5,
    category: "accent",
  });
  
  const background = generateBackground(palette, preferDark);
  
  return {
    palette,
    suggestedBackground: background,
    contrastTextColors: calculateTextColors(background),
    accentStroke: dominantColor,
  };
}

/**
 * Create default theme when no images are available
 */
export function createDefaultTheme(preferDark: boolean = true): ExtractedTheme {
  return {
    palette: [],
    suggestedBackground: preferDark ? "#101112" : "#fafafa",
    contrastTextColors: preferDark 
      ? { light: "#ffffff", dark: "rgba(255, 255, 255, 0.65)" }
      : { light: "#101112", dark: "rgba(16, 17, 18, 0.65)" },
  };
}

// =============================================================================
// THEME APPLICATION
// =============================================================================

/**
 * Apply theme colors to a layout variant
 * Returns CSS variables for use in styling
 */
export function getThemeCSSVars(theme: ExtractedTheme): Record<string, string> {
  const vars: Record<string, string> = {
    "--theme-bg": theme.suggestedBackground,
    "--theme-text-primary": theme.contrastTextColors.light,
    "--theme-text-secondary": theme.contrastTextColors.dark,
  };
  
  if (theme.palette[0]) {
    vars["--theme-primary"] = theme.palette[0].hex;
  }
  if (theme.palette[1]) {
    vars["--theme-secondary"] = theme.palette[1].hex;
  }
  if (theme.accentStroke) {
    vars["--theme-accent"] = theme.accentStroke;
  }
  if (theme.suggestedGradient) {
    vars["--theme-gradient"] = `linear-gradient(${theme.suggestedGradient.angle}deg, ${theme.suggestedGradient.start}, ${theme.suggestedGradient.end})`;
  }
  
  return vars;
}
