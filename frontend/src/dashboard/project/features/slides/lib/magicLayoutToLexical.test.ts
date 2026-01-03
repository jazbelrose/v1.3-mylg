import { describe, it, expect } from "vitest";
import type { LayoutVariant } from "./magicLayoutTypes";
import { generateMagicLayoutContent } from "./magicLayoutToLexical";

function extractPictureFrameImageSrcs(contentJson: string): Array<string | null | undefined> {
  const parsed = JSON.parse(contentJson) as {
    root?: { children?: Array<{ children?: Array<{ type: string; imageSrc?: string | null }> }> };
  };
  const paragraph = parsed.root?.children?.[0];
  const nodes = paragraph?.children ?? [];
  return nodes.filter((n) => n.type === "picture-frame").map((n) => n.imageSrc);
}

describe("generateMagicLayoutContent", () => {
  it("deals images in order and leaves remaining image frames empty (no fallback)", () => {
    const variant: LayoutVariant = {
      id: "v1",
      seed: "seed",
      index: 0,
      mode: "grid",
      tasteMode: "apple-clean",
      canvas: { width: 1920, height: 1080 },
      content: [],
      gutter: 20,
      margin: { top: 10, right: 10, bottom: 10, left: 10 },
      score: 1,
      usedFallback: false,
      frames: [
        {
          id: "f1",
          index: 0,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          zIndex: 0,
          radius: 0,
          isHero: false,
          contentType: "image",
          imageSrc: "fallback-1",
          textConfig: null,
          locks: { lockPosition: false, lockCrop: false, lockHero: false },
        },
        {
          id: "f2",
          index: 1,
          x: 120,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          zIndex: 1,
          radius: 0,
          isHero: false,
          contentType: "image",
          imageSrc: "fallback-2",
          textConfig: null,
          locks: { lockPosition: false, lockCrop: false, lockHero: false },
        },
      ],
    };

    const json = generateMagicLayoutContent(variant, ["img-1"], "apple-clean");
    expect(extractPictureFrameImageSrcs(json)).toEqual(["img-1", null]);
  });
});

