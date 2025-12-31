import { describe, it, expect } from "vitest";
import { computeAlignDeltas, computeDistributeDeltas, type Aabb } from "./slideArrangeUtils";

function aabbFromRect(x: number, y: number, width: number, height: number): Aabb {
  return { minX: x, minY: y, maxX: x + width, maxY: y + height };
}

describe("slideArrangeUtils", () => {
  it("aligns left/top based on overall bounds", () => {
    const a = aabbFromRect(10, 20, 50, 30);
    const b = aabbFromRect(40, 5, 10, 10);
    const deltasLeft = computeAlignDeltas([a, b], "left");
    expect(deltasLeft).toEqual([
      { dx: 0, dy: 0 },
      { dx: -30, dy: 0 },
    ]);

    const deltasTop = computeAlignDeltas([a, b], "top");
    expect(deltasTop).toEqual([
      { dx: 0, dy: -15 },
      { dx: 0, dy: 0 },
    ]);
  });

  it("distributes horizontally between first and last, keeping endpoints fixed", () => {
    const left = aabbFromRect(0, 0, 10, 10);
    const mid = aabbFromRect(30, 0, 10, 10);
    const right = aabbFromRect(100, 0, 10, 10);
    const deltas = computeDistributeDeltas([left, mid, right], "horizontal");
    expect(deltas[0]).toEqual({ dx: 0, dy: 0 });
    expect(deltas[2]).toEqual({ dx: 0, dy: 0 });
    expect(deltas[1]).toEqual({ dx: 20, dy: 0 });
  });

  it("distributes vertically between first and last, keeping endpoints fixed", () => {
    const top = aabbFromRect(0, 0, 10, 10);
    const mid = aabbFromRect(0, 60, 10, 10);
    const bottom = aabbFromRect(0, 120, 10, 10);
    const deltas = computeDistributeDeltas([top, mid, bottom], "vertical");
    expect(deltas[0]).toEqual({ dx: 0, dy: 0 });
    expect(deltas[2]).toEqual({ dx: 0, dy: 0 });
    expect(deltas[1]).toEqual({ dx: 0, dy: 0 });
  });
});
