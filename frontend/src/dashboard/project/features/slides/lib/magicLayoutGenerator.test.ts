/**
 * Magic Layout Generator Pro - Unit Tests
 * 
 * Tests for Phase 1.5 and Phase 2 features:
 * - Frozen tokens for global locks
 * - Text frame styling
 * - Theme extraction
 * - Media intelligence
 * - Storyboard templates
 * - Crop intents
 * - Layout system persistence
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock canvas context for browser APIs
const mockCanvasContext = {
  drawImage: vi.fn(),
  getImageData: vi.fn(() => ({
    width: 100,
    height: 100,
    data: new Uint8ClampedArray(100 * 100 * 4).fill(128),
  })),
};

// Mock createElement for canvas
const originalCreateElement = document.createElement.bind(document);
vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
  if (tag === "canvas") {
    return {
      getContext: () => mockCanvasContext,
      width: 0,
      height: 0,
    } as unknown as HTMLCanvasElement;
  }
  return originalCreateElement(tag);
});

// Import after mocks
import {
  generateMagicLayouts,
  clearFrozenTokens,
} from "./magicLayoutGenerator";
import {
  calculateTextFramePadding,
  getTileBackground,
  balanceText,
  getDropCapConfig,
  getTextFrameStyle,
} from "./textFrameStyles";
import { extractTheme, createQuickTheme, createDefaultTheme } from "./themeExtraction";
import { analyzeMedia, getFitModeForMediaType, type MediaType } from "./mediaIntelligence";
import {
  getStoryboardTemplate,
  getStoryboardTemplateIds,
  generateFramesFromTemplate,
  suggestTemplates,
} from "./storyboardTemplates";
import { calculateCrop, suggestCropIntent, type CropIntent } from "./cropIntents";
import {
  createDefaultLayoutSystem,
  getNextHeroPosition,
  advanceHeroPattern,
  saveLayoutSystem,
  loadAllLayoutSystems,
  analyzeRhythm,
} from "./layoutSystem";

describe("Magic Layout Generator", () => {
  beforeEach(() => {
    clearFrozenTokens("test-seed");
  });

  describe("generateMagicLayouts", () => {
    it("should generate 6 variants by default", () => {
      const result = generateMagicLayouts({
        frameCount: 4,
        mode: "grid",
        tasteMode: "apple-clean",
        seed: "test-seed",
        canvasWidth: 1920,
        canvasHeight: 1080,
        globalLocks: { lockSpacing: false, lockRadius: false },
      });

      expect(result.variants).toHaveLength(6);
      expect(result.variants[0].frames).toHaveLength(4);
    });

    it("should produce deterministic results with same seed", () => {
      const input = {
        frameCount: 3,
        mode: "grid" as const,
        tasteMode: "apple-clean" as const,
        seed: "deterministic-test",
        canvasWidth: 1920,
        canvasHeight: 1080,
        globalLocks: { lockSpacing: false, lockRadius: false },
      };

      clearFrozenTokens("deterministic-test");
      const result1 = generateMagicLayouts(input);
      
      clearFrozenTokens("deterministic-test");
      const result2 = generateMagicLayouts(input);

      expect(result1.variants[0].frames[0].x).toBe(result2.variants[0].frames[0].x);
      expect(result1.variants[0].frames[0].y).toBe(result2.variants[0].frames[0].y);
    });

    it("should freeze gutter when lockSpacing is true", () => {
      const input = {
        frameCount: 3,
        mode: "grid" as const,
        tasteMode: "apple-clean" as const,
        seed: "lock-test",
        canvasWidth: 1920,
        canvasHeight: 1080,
        globalLocks: { lockSpacing: true, lockRadius: false },
      };

      const result1 = generateMagicLayouts(input);
      const gutter1 = result1.variants[0].gutter;

      // Generate again with different taste mode (which would change gutter)
      const input2 = { ...input, tasteMode: "brutalist-grid" as const };
      const result2 = generateMagicLayouts(input2);
      const gutter2 = result2.variants[0].gutter;

      // Gutter should be frozen to first value
      expect(gutter2).toBe(gutter1);
    });
  });
});

describe("Text Frame Styles", () => {
  describe("calculateTextFramePadding", () => {
    it("should return larger padding for headlines", () => {
      const headlinePadding = calculateTextFramePadding(400, 200, "apple-clean", "headline");
      const bodyPadding = calculateTextFramePadding(400, 200, "apple-clean", "body");

      expect(headlinePadding.top).toBeGreaterThan(bodyPadding.top);
    });

    it("should vary padding by taste mode", () => {
      const applePadding = calculateTextFramePadding(400, 200, "apple-clean", "body");
      const brutalistPadding = calculateTextFramePadding(400, 200, "brutalist-grid", "body");

      expect(applePadding.left).toBeGreaterThan(brutalistPadding.left);
    });
  });

  describe("getTileBackground", () => {
    it("should return background config for taste mode", () => {
      const appleBg = getTileBackground("apple-clean");
      expect(appleBg.enabled).toBe(true);
      expect(appleBg.opacity).toBeLessThan(0.1);

      const brutalistBg = getTileBackground("brutalist-grid");
      expect(brutalistBg.enabled).toBe(true);
      expect(brutalistBg.opacity).toBeGreaterThan(0.5);
    });
  });

  describe("balanceText", () => {
    it("should not modify short text", () => {
      const short = "Hello World";
      expect(balanceText(short)).toBe(short);
    });

    it("should balance long headlines", () => {
      const long = "This is a very long headline that needs to be balanced across multiple lines";
      const balanced = balanceText(long, 40);
      expect(balanced).toContain("\n");
    });

    it("should avoid orphaned short words", () => {
      const text = "This is a test sentence with a short end";
      const balanced = balanceText(text, 25);
      const lines = balanced.split("\n");
      if (lines.length > 1) {
        const lastLine = lines[lines.length - 1];
        expect(lastLine.length).toBeGreaterThan(4);
      }
    });
  });

  describe("getDropCapConfig", () => {
    it("should return drop cap config per taste mode", () => {
      const appleDropCap = getDropCapConfig("apple-clean");
      expect(appleDropCap.enabled).toBe(false);

      const fashionDropCap = getDropCapConfig("fashion-editorial");
      expect(fashionDropCap.enabled).toBe(true);
    });
  });
});

describe("Theme Extraction", () => {
  describe("createQuickTheme", () => {
    it("should create theme from a hex color", () => {
      const theme = createQuickTheme("#ff5500", true);

      expect(theme.palette).toHaveLength(2);
      expect(theme.palette[0].hex).toBe("#ff5500");
      expect(theme.suggestedBackground).toBeDefined();
      expect(theme.contrastTextColors.light).toBe("#ffffff");
    });
  });

  describe("createDefaultTheme", () => {
    it("should create dark theme by default", () => {
      const theme = createDefaultTheme(true);

      expect(theme.suggestedBackground).toBe("#101112");
      expect(theme.contrastTextColors.light).toBe("#ffffff");
    });

    it("should create light theme when requested", () => {
      const theme = createDefaultTheme(false);

      expect(theme.suggestedBackground).toBe("#fafafa");
      expect(theme.contrastTextColors.light).toBe("#101112");
    });
  });
});

describe("Media Intelligence", () => {
  describe("getFitModeForMediaType", () => {
    it("should return cover for photos", () => {
      expect(getFitModeForMediaType("photo")).toBe("cover");
    });

    it("should return contain for logos", () => {
      expect(getFitModeForMediaType("logo")).toBe("contain");
    });

    it("should return contain for screenshots", () => {
      expect(getFitModeForMediaType("screenshot")).toBe("contain");
    });
  });
});

describe("Storyboard Templates", () => {
  describe("getStoryboardTemplateIds", () => {
    it("should return all template IDs", () => {
      const ids = getStoryboardTemplateIds();

      expect(ids).toContain("hero-caption");
      expect(ids).toContain("grid-2x2");
      expect(ids).toContain("magazine-spread");
      expect(ids.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe("getStoryboardTemplate", () => {
    it("should return template with correct slot count", () => {
      const heroCaption = getStoryboardTemplate("hero-caption");

      expect(heroCaption.frameCount).toBe(2);
      expect(heroCaption.slots).toHaveLength(2);
      expect(heroCaption.slots[0].contentType).toBe("image");
      expect(heroCaption.slots[1].contentType).toBe("text");
    });
  });

  describe("generateFramesFromTemplate", () => {
    it("should generate frames with correct dimensions", () => {
      const template = getStoryboardTemplate("hero-caption");
      const content = { x: 100, y: 50, width: 1600, height: 900 };

      const frames = generateFramesFromTemplate(template, content, 16);

      expect(frames).toHaveLength(2);
      expect(frames[0].x).toBeGreaterThanOrEqual(content.x);
      expect(frames[0].width).toBeLessThanOrEqual(content.width);
    });
  });

  describe("suggestTemplates", () => {
    it("should suggest templates matching image count", () => {
      const suggestions = suggestTemplates(4);

      expect(suggestions).toContain("grid-2x2");
    });
  });
});

describe("Crop Intents", () => {
  describe("calculateCrop", () => {
    it("should return center position for product intent", () => {
      const result = calculateCrop(
        "product",
        { x: 0.5, y: 0.5, weight: 1 },
        1.5,
        1.5
      );

      expect(result.objectPosition).toBe("center center");
      expect(result.objectFit).toBe("contain");
    });

    it("should use focal point for auto intent", () => {
      const result = calculateCrop(
        "auto",
        { x: 0.3, y: 0.7, weight: 0.8 },
        1.5,
        1.5
      );

      expect(result.objectPosition).toContain("30%");
      expect(result.objectPosition).toContain("70%");
    });
  });

  describe("suggestCropIntent", () => {
    it("should suggest landscape for wide frames", () => {
      const frame = {
        id: "test",
        index: 0,
        x: 0,
        y: 0,
        width: 1600,
        height: 400,
        contentType: "image" as const,
        imageSrc: null,
        textConfig: null,
        locks: { lockPosition: false, lockCrop: false, lockHero: false },
        isHero: false,
        radius: 0,
        rotation: 0,
        zIndex: 0,
      };

      expect(suggestCropIntent(frame)).toBe("landscape");
    });

    it("should suggest editorial for hero frames", () => {
      const frame = {
        id: "test",
        index: 0,
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        contentType: "image" as const,
        imageSrc: null,
        textConfig: null,
        locks: { lockPosition: false, lockCrop: false, lockHero: false },
        isHero: true,
        radius: 0,
        rotation: 0,
        zIndex: 0,
      };

      expect(suggestCropIntent(frame)).toBe("editorial");
    });
  });
});

describe("Layout System", () => {
  describe("createDefaultLayoutSystem", () => {
    it("should create system with default tokens", () => {
      const system = createDefaultLayoutSystem();

      expect(system.id).toBeDefined();
      expect(system.tokens.tasteMode).toBe("apple-clean");
      expect(system.tokens.gutter).toBe(24);
      expect(system.heroPattern.type).toBe("alternate-lr");
    });
  });

  describe("getNextHeroPosition", () => {
    it("should alternate left-right", () => {
      const pattern = { type: "alternate-lr" as const, currentIndex: 0 };

      expect(getNextHeroPosition(pattern)).toBe("left");
      expect(getNextHeroPosition({ ...pattern, currentIndex: 1 })).toBe("right");
      expect(getNextHeroPosition({ ...pattern, currentIndex: 2 })).toBe("left");
    });

    it("should cycle through LRC pattern", () => {
      const pattern = { type: "alternate-lrc" as const, currentIndex: 0 };

      expect(getNextHeroPosition(pattern)).toBe("left");
      expect(getNextHeroPosition({ ...pattern, currentIndex: 1 })).toBe("right");
      expect(getNextHeroPosition({ ...pattern, currentIndex: 2 })).toBe("center");
      expect(getNextHeroPosition({ ...pattern, currentIndex: 3 })).toBe("left");
    });
  });

  describe("advanceHeroPattern", () => {
    it("should increment current index", () => {
      const pattern = { type: "alternate-lr" as const, currentIndex: 0 };
      const advanced = advanceHeroPattern(pattern);

      expect(advanced.currentIndex).toBe(1);
    });
  });

  describe("analyzeRhythm", () => {
    it("should detect alternating pattern", () => {
      const positions = ["left", "right", "left", "right"] as const;
      const analysis = analyzeRhythm([...positions]);

      expect(analysis.detectedPattern).toBe("Alternating");
      expect(analysis.consistency).toBeGreaterThan(0.8);
    });

    it("should suggest improvements for random pattern", () => {
      const positions = ["left", "left", "center", "right"] as const;
      const analysis = analyzeRhythm([...positions]);

      expect(analysis.consistency).toBeLessThan(0.6);
      expect(analysis.suggestions.length).toBeGreaterThan(0);
    });
  });
});
