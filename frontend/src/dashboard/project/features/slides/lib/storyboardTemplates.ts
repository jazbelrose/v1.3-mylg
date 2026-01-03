/**
 * Storyboard Templates - Predefined layout templates with text frame slots
 * 
 * Phase 2 Feature D:
 * - Named templates (Hero + Caption, 2x2 Grid, Story Sequence, etc.)
 * - Auto-created text frames with appropriate intents
 * - Consistent spacing and visual hierarchy
 */

import type { 
  GeneratedFrame, 
  FrameContentType, 
  TextIntent, 
  TasteModeId,
  Rect,
  TileLocks 
} from "./magicLayoutTypes";
import { v4 as uuidv4 } from "uuid";

// =============================================================================
// TEMPLATE TYPES
// =============================================================================

export type StoryboardTemplateId =
  | "hero-caption"           // Large image + text below
  | "hero-sidebar"           // Large image + text column
  | "grid-2x2"               // 4 equal images
  | "grid-2x2-titled"        // 4 images + headline
  | "story-sequence"         // 3 horizontal images + caption
  | "comparison"             // 2 images side by side + labels
  | "feature-list"           // Image + 3 text blocks
  | "magazine-spread"        // Hero + 2 secondary + pull quote
  | "timeline"               // 4 images in sequence + text
  | "single-hero"            // One large centered image
  | "gallery-wall"           // 5-6 varied sizes
  | "quote-centered";        // Large centered quote + attribution

export interface StoryboardTemplate {
  id: StoryboardTemplateId;
  name: string;
  description: string;
  frameCount: number;
  slots: TemplateSlot[];
  suggestedTasteModes: TasteModeId[];
}

export interface TemplateSlot {
  /** Slot index */
  index: number;
  /** Position as percentage of content area */
  x: number;      // 0-100
  y: number;      // 0-100
  width: number;  // 0-100
  height: number; // 0-100
  /** Content type for this slot */
  contentType: FrameContentType;
  /** Text intent for text slots */
  textIntent?: TextIntent;
  /** Default text content (placeholder) */
  defaultText?: string;
  /** Is this the hero/primary slot */
  isHero?: boolean;
  /** Suggested z-index */
  zIndex?: number;
}

// =============================================================================
// TEMPLATE DEFINITIONS
// =============================================================================

const TEMPLATES: Record<StoryboardTemplateId, StoryboardTemplate> = {
  "hero-caption": {
    id: "hero-caption",
    name: "Hero + Caption",
    description: "Large hero image with text caption below",
    frameCount: 2,
    suggestedTasteModes: ["apple-clean", "museum-wall"],
    slots: [
      { index: 0, x: 0, y: 0, width: 100, height: 75, contentType: "image", isHero: true, zIndex: 0 },
      { index: 1, x: 0, y: 78, width: 100, height: 22, contentType: "text", textIntent: "caption", defaultText: "Add your caption here", zIndex: 1 },
    ],
  },
  
  "hero-sidebar": {
    id: "hero-sidebar",
    name: "Hero + Sidebar",
    description: "Large image with text column on the side",
    frameCount: 2,
    suggestedTasteModes: ["fashion-editorial", "apple-clean"],
    slots: [
      { index: 0, x: 0, y: 0, width: 65, height: 100, contentType: "image", isHero: true, zIndex: 0 },
      { index: 1, x: 68, y: 10, width: 32, height: 80, contentType: "text", textIntent: "body", defaultText: "Your story goes here...", zIndex: 1 },
    ],
  },
  
  "grid-2x2": {
    id: "grid-2x2",
    name: "2×2 Grid",
    description: "Four equal-sized images in a grid",
    frameCount: 4,
    suggestedTasteModes: ["brutalist-grid", "pinterest-collage"],
    slots: [
      { index: 0, x: 0, y: 0, width: 48, height: 48, contentType: "image", zIndex: 0 },
      { index: 1, x: 52, y: 0, width: 48, height: 48, contentType: "image", zIndex: 1 },
      { index: 2, x: 0, y: 52, width: 48, height: 48, contentType: "image", zIndex: 2 },
      { index: 3, x: 52, y: 52, width: 48, height: 48, contentType: "image", zIndex: 3 },
    ],
  },
  
  "grid-2x2-titled": {
    id: "grid-2x2-titled",
    name: "2×2 Grid + Title",
    description: "Four images with a headline above",
    frameCount: 5,
    suggestedTasteModes: ["apple-clean", "museum-wall"],
    slots: [
      { index: 0, x: 0, y: 0, width: 100, height: 15, contentType: "text", textIntent: "headline", defaultText: "Your Title", isHero: true, zIndex: 0 },
      { index: 1, x: 0, y: 20, width: 48, height: 38, contentType: "image", zIndex: 1 },
      { index: 2, x: 52, y: 20, width: 48, height: 38, contentType: "image", zIndex: 2 },
      { index: 3, x: 0, y: 62, width: 48, height: 38, contentType: "image", zIndex: 3 },
      { index: 4, x: 52, y: 62, width: 48, height: 38, contentType: "image", zIndex: 4 },
    ],
  },
  
  "story-sequence": {
    id: "story-sequence",
    name: "Story Sequence",
    description: "Three horizontal images with caption strip",
    frameCount: 4,
    suggestedTasteModes: ["fashion-editorial", "vaporwave-cyber"],
    slots: [
      { index: 0, x: 0, y: 0, width: 32, height: 75, contentType: "image", zIndex: 0 },
      { index: 1, x: 34, y: 0, width: 32, height: 75, contentType: "image", isHero: true, zIndex: 1 },
      { index: 2, x: 68, y: 0, width: 32, height: 75, contentType: "image", zIndex: 2 },
      { index: 3, x: 0, y: 80, width: 100, height: 20, contentType: "text", textIntent: "caption", defaultText: "Describe your sequence", zIndex: 3 },
    ],
  },
  
  "comparison": {
    id: "comparison",
    name: "Comparison",
    description: "Two images side by side with labels",
    frameCount: 4,
    suggestedTasteModes: ["brutalist-grid", "apple-clean"],
    slots: [
      { index: 0, x: 0, y: 10, width: 48, height: 70, contentType: "image", zIndex: 0 },
      { index: 1, x: 52, y: 10, width: 48, height: 70, contentType: "image", zIndex: 1 },
      { index: 2, x: 0, y: 82, width: 48, height: 15, contentType: "text", textIntent: "label", defaultText: "Before", zIndex: 2 },
      { index: 3, x: 52, y: 82, width: 48, height: 15, contentType: "text", textIntent: "label", defaultText: "After", zIndex: 3 },
    ],
  },
  
  "feature-list": {
    id: "feature-list",
    name: "Feature List",
    description: "Image with three feature text blocks",
    frameCount: 4,
    suggestedTasteModes: ["apple-clean", "pinterest-collage"],
    slots: [
      { index: 0, x: 0, y: 0, width: 50, height: 100, contentType: "image", isHero: true, zIndex: 0 },
      { index: 1, x: 55, y: 5, width: 45, height: 28, contentType: "text", textIntent: "subheadline", defaultText: "Feature One", zIndex: 1 },
      { index: 2, x: 55, y: 36, width: 45, height: 28, contentType: "text", textIntent: "subheadline", defaultText: "Feature Two", zIndex: 2 },
      { index: 3, x: 55, y: 67, width: 45, height: 28, contentType: "text", textIntent: "subheadline", defaultText: "Feature Three", zIndex: 3 },
    ],
  },
  
  "magazine-spread": {
    id: "magazine-spread",
    name: "Magazine Spread",
    description: "Hero image with secondaries and pull quote",
    frameCount: 4,
    suggestedTasteModes: ["fashion-editorial", "museum-wall"],
    slots: [
      { index: 0, x: 0, y: 0, width: 60, height: 100, contentType: "image", isHero: true, zIndex: 0 },
      { index: 1, x: 64, y: 0, width: 36, height: 45, contentType: "image", zIndex: 1 },
      { index: 2, x: 64, y: 48, width: 36, height: 25, contentType: "text", textIntent: "quote", defaultText: '"Your inspiring quote here."', zIndex: 2 },
      { index: 3, x: 64, y: 76, width: 36, height: 24, contentType: "image", zIndex: 3 },
    ],
  },
  
  "timeline": {
    id: "timeline",
    name: "Timeline",
    description: "Four sequential moments with labels",
    frameCount: 8,
    suggestedTasteModes: ["brutalist-grid", "vaporwave-cyber"],
    slots: [
      { index: 0, x: 0, y: 10, width: 22, height: 55, contentType: "image", zIndex: 0 },
      { index: 1, x: 26, y: 10, width: 22, height: 55, contentType: "image", zIndex: 1 },
      { index: 2, x: 52, y: 10, width: 22, height: 55, contentType: "image", zIndex: 2 },
      { index: 3, x: 78, y: 10, width: 22, height: 55, contentType: "image", zIndex: 3 },
      { index: 4, x: 0, y: 68, width: 22, height: 12, contentType: "text", textIntent: "caption", defaultText: "Step 1", zIndex: 4 },
      { index: 5, x: 26, y: 68, width: 22, height: 12, contentType: "text", textIntent: "caption", defaultText: "Step 2", zIndex: 5 },
      { index: 6, x: 52, y: 68, width: 22, height: 12, contentType: "text", textIntent: "caption", defaultText: "Step 3", zIndex: 6 },
      { index: 7, x: 78, y: 68, width: 22, height: 12, contentType: "text", textIntent: "caption", defaultText: "Step 4", zIndex: 7 },
    ],
  },
  
  "single-hero": {
    id: "single-hero",
    name: "Single Hero",
    description: "One large centered image",
    frameCount: 1,
    suggestedTasteModes: ["museum-wall", "fashion-editorial"],
    slots: [
      { index: 0, x: 10, y: 5, width: 80, height: 90, contentType: "image", isHero: true, zIndex: 0 },
    ],
  },
  
  "gallery-wall": {
    id: "gallery-wall",
    name: "Gallery Wall",
    description: "Multiple varied-size images like a gallery",
    frameCount: 5,
    suggestedTasteModes: ["museum-wall", "pinterest-collage"],
    slots: [
      { index: 0, x: 0, y: 0, width: 40, height: 60, contentType: "image", isHero: true, zIndex: 0 },
      { index: 1, x: 43, y: 0, width: 57, height: 38, contentType: "image", zIndex: 1 },
      { index: 2, x: 43, y: 42, width: 28, height: 58, contentType: "image", zIndex: 2 },
      { index: 3, x: 74, y: 42, width: 26, height: 30, contentType: "image", zIndex: 3 },
      { index: 4, x: 0, y: 64, width: 40, height: 36, contentType: "image", zIndex: 4 },
    ],
  },
  
  "quote-centered": {
    id: "quote-centered",
    name: "Centered Quote",
    description: "Large centered quote with attribution",
    frameCount: 2,
    suggestedTasteModes: ["fashion-editorial", "apple-clean"],
    slots: [
      { index: 0, x: 10, y: 20, width: 80, height: 50, contentType: "text", textIntent: "quote", defaultText: '"Your powerful quote goes here."', isHero: true, zIndex: 0 },
      { index: 1, x: 30, y: 75, width: 40, height: 15, contentType: "text", textIntent: "caption", defaultText: "— Attribution", zIndex: 1 },
    ],
  },
};

// =============================================================================
// TEMPLATE API
// =============================================================================

/**
 * Get a storyboard template by ID
 */
export function getStoryboardTemplate(id: StoryboardTemplateId): StoryboardTemplate {
  return TEMPLATES[id];
}

/**
 * Get all available template IDs
 */
export function getStoryboardTemplateIds(): StoryboardTemplateId[] {
  return Object.keys(TEMPLATES) as StoryboardTemplateId[];
}

/**
 * Get templates organized by category
 */
export function getTemplatesByCategory(): Record<string, StoryboardTemplate[]> {
  return {
    "Single Focus": [TEMPLATES["single-hero"], TEMPLATES["hero-caption"], TEMPLATES["hero-sidebar"]],
    "Grids": [TEMPLATES["grid-2x2"], TEMPLATES["grid-2x2-titled"], TEMPLATES["gallery-wall"]],
    "Sequences": [TEMPLATES["story-sequence"], TEMPLATES["timeline"], TEMPLATES["comparison"]],
    "Editorial": [TEMPLATES["magazine-spread"], TEMPLATES["feature-list"], TEMPLATES["quote-centered"]],
  };
}

// =============================================================================
// FRAME GENERATION FROM TEMPLATES
// =============================================================================

/**
 * Generate frames from a storyboard template
 */
export function generateFramesFromTemplate(
  template: StoryboardTemplate,
  content: Rect,
  radius: number,
  imageSrcs?: string[]
): GeneratedFrame[] {
  const frames: GeneratedFrame[] = [];
  
  for (const slot of template.slots) {
    // Convert percentage positions to absolute pixels
    const x = content.x + (slot.x / 100) * content.width;
    const y = content.y + (slot.y / 100) * content.height;
    const width = (slot.width / 100) * content.width;
    const height = (slot.height / 100) * content.height;
    
    const locks: TileLocks = {
      lockPosition: false,
      lockCrop: false,
      lockHero: slot.isHero ?? false,
    };
    
    // Get image source if available
    const imageSrc = slot.contentType === "image" 
      ? (imageSrcs?.[slot.index] ?? null)
      : null;
    
    const frame: GeneratedFrame = {
      id: uuidv4(),
      index: slot.index,
      x,
      y,
      width,
      height,
      contentType: slot.contentType,
      imageSrc,
      textConfig: slot.contentType === "text" 
        ? { intent: slot.textIntent ?? "body", content: slot.defaultText ?? "" }
        : null,
      locks,
      isHero: slot.isHero ?? false,
      radius: slot.contentType === "text" ? Math.min(radius, 8) : radius,
      rotation: 0,
      zIndex: slot.zIndex ?? slot.index,
    };
    
    frames.push(frame);
  }
  
  return frames;
}

/**
 * Get template suggestions based on image count
 */
export function suggestTemplates(imageCount: number): StoryboardTemplateId[] {
  const suggestions: StoryboardTemplateId[] = [];
  
  for (const [id, template] of Object.entries(TEMPLATES)) {
    const imageSlots = template.slots.filter(s => s.contentType === "image").length;
    
    // Suggest if image count matches or is close
    if (imageSlots === imageCount) {
      suggestions.unshift(id as StoryboardTemplateId); // Exact match first
    } else if (Math.abs(imageSlots - imageCount) <= 1) {
      suggestions.push(id as StoryboardTemplateId);
    }
  }
  
  return suggestions.slice(0, 4); // Return top 4
}

/**
 * Get the number of image slots in a template
 */
export function getTemplateImageCount(templateId: StoryboardTemplateId): number {
  const template = TEMPLATES[templateId];
  return template.slots.filter(s => s.contentType === "image").length;
}

/**
 * Get the number of text slots in a template
 */
export function getTemplateTextCount(templateId: StoryboardTemplateId): number {
  const template = TEMPLATES[templateId];
  return template.slots.filter(s => s.contentType === "text").length;
}
