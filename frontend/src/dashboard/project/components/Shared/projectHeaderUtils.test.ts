import { describe, expect, it } from "vitest";

import { formatHoursHuman, roundToNearestHalf } from "./projectHeaderUtils";

describe("roundToNearestHalf", () => {
  it("rounds to the nearest 0.5", () => {
    expect(roundToNearestHalf(179.24)).toBe(179);
    expect(roundToNearestHalf(179.25)).toBe(179.5);
    expect(roundToNearestHalf(179.26)).toBe(179.5);
    expect(roundToNearestHalf(179.74)).toBe(179.5);
    expect(roundToNearestHalf(179.75)).toBe(180);
  });

  it("handles non-finite values", () => {
    expect(roundToNearestHalf(Number.NaN)).toBe(0);
    expect(roundToNearestHalf(Number.POSITIVE_INFINITY)).toBe(0);
    expect(roundToNearestHalf(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe("formatHoursHuman", () => {
  it("omits trailing .0, keeps .5", () => {
    expect(formatHoursHuman(180)).toBe("180");
    expect(formatHoursHuman(179.5)).toBe("179.5");
    expect(formatHoursHuman(179.75)).toBe("180");
    expect(formatHoursHuman("179.25")).toBe("179.5");
  });

  it("falls back to 0 for invalid inputs", () => {
    expect(formatHoursHuman(undefined)).toBe("0");
    expect(formatHoursHuman("not-a-number")).toBe("0");
  });
});
