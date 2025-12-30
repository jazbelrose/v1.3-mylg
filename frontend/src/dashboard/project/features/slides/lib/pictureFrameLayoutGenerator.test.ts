import { describe, it, expect } from "vitest";
import { generatePictureFrameLayout, type Rect } from "./pictureFrameLayoutGenerator";

function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

function expectValidLayout(frames: Rect[], content: Rect) {
  expect(frames.length).toBeGreaterThanOrEqual(0);
  frames.forEach((f) => {
    expect(f.width).toBeGreaterThan(0);
    expect(f.height).toBeGreaterThan(0);
    expect(f.x).toBeGreaterThanOrEqual(content.x);
    expect(f.y).toBeGreaterThanOrEqual(content.y);
    expect(f.x + f.width).toBeLessThanOrEqual(content.x + content.width);
    expect(f.y + f.height).toBeLessThanOrEqual(content.y + content.height);
  });

  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      expect(rectsOverlap(frames[i]!, frames[j]!)).toBe(false);
    }
  }
}

describe("pictureFrameLayoutGenerator", () => {
  it("is deterministic for a given seed (grid)", () => {
    const a = generatePictureFrameLayout(9, { mode: "grid", seed: "seed-1" });
    const b = generatePictureFrameLayout(9, { mode: "grid", seed: "seed-1" });
    expect(a.frames).toEqual(b.frames);
    expect(a.usedFallback).toBe(false);
  });

  it("is deterministic for a given seed (masonry)", () => {
    const a = generatePictureFrameLayout(11, { mode: "masonry", seed: "seed-2" });
    const b = generatePictureFrameLayout(11, { mode: "masonry", seed: "seed-2" });
    expect(a.frames).toEqual(b.frames);
    expect(a.usedFallback).toBe(false);
  });

  it("generates non-overlapping frames within bounds (grid + masonry)", () => {
    const counts = [1, 2, 3, 5, 8, 12];
    counts.forEach((count) => {
      const grid = generatePictureFrameLayout(count, { mode: "grid", seed: `grid:${count}` });
      expect(grid.frames).toHaveLength(count);
      expectValidLayout(grid.frames, grid.content);

      const masonry = generatePictureFrameLayout(count, { mode: "masonry", seed: `masonry:${count}` });
      expect(masonry.frames).toHaveLength(count);
      expectValidLayout(masonry.frames, masonry.content);
    });
  });

  it("always returns a valid layout via fallback when constraints are impossible", () => {
    const result = generatePictureFrameLayout(20, {
      mode: "masonry",
      seed: "impossible",
      canvasWidth: 1920,
      canvasHeight: 1080,
      // Make masonry mathematically impossible by choosing a gutter larger than the entire canvas.
      // (The generator must fall back to a guaranteed-valid grid layout.)
      gutter: 5000,
      maxAttempts: 2,
    });

    expect(result.frames).toHaveLength(20);
    expect(result.usedFallback).toBe(true);
    expectValidLayout(result.frames, result.content);
  });
});
