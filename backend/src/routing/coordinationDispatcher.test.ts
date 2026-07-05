import { describe, expect, it } from "vitest";
import { rotationIndex } from "./coordinationDispatcher.js";

describe("rotationIndex", () => {
  it("cycles 1,2,3 -> 0,1,2 and wraps back", () => {
    const length = 3;
    const seq = [1, 2, 3, 4, 5, 6, 7].map((c) => rotationIndex(c, length));
    expect(seq).toEqual([0, 1, 2, 0, 1, 2, 0]);
  });

  it("returns 0 for a single-element group", () => {
    expect(rotationIndex(1, 1)).toBe(0);
    expect(rotationIndex(99, 1)).toBe(0);
  });

  it("is safe for non-positive length", () => {
    expect(rotationIndex(5, 0)).toBe(0);
  });
});
