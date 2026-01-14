import { describe, expect, it } from "vitest";

import { arraysEqual, moveIdBeforeTarget } from "./reorder";

describe("moveIdBeforeTarget", () => {
  it("moves source before target", () => {
    expect(moveIdBeforeTarget(["a", "b", "c"], "c", "b")).toEqual(["a", "c", "b"]);
  });

  it("moves source to end when no target", () => {
    expect(moveIdBeforeTarget(["a", "b", "c"], "a")).toEqual(["b", "c", "a"]);
  });

  it("appends to end when target missing", () => {
    expect(moveIdBeforeTarget(["a", "b", "c"], "a", "zzz")).toEqual(["b", "c", "a"]);
  });

  it("is stable when source not present", () => {
    expect(moveIdBeforeTarget(["a", "b"], "x", "b")).toEqual(["a", "x", "b"]);
  });
});

describe("arraysEqual", () => {
  it("compares arrays", () => {
    expect(arraysEqual(["a"], ["a"])).toBe(true);
    expect(arraysEqual(["a"], ["b"])).toBe(false);
  });
});
