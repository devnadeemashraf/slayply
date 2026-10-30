import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast.js";

describe("contrastRatio", () => {
  it("is 21 for black on white, in either order", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  it("is 1 for identical colours", () => {
    expect(contrastRatio("#123456", "#123456")).toBeCloseTo(1, 5);
  });

  it("matches the published value for #777777 on white (about 4.48)", () => {
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("accepts three-digit hex and any letter case", () => {
    expect(contrastRatio("#FFF", "#000")).toBeCloseTo(21, 5);
  });

  it("rejects anything that is not a hex colour", () => {
    expect(() => contrastRatio("red", "#fff")).toThrow();
    expect(() => contrastRatio("#12345", "#fff")).toThrow();
    expect(() => contrastRatio("var(--ink)", "#fff")).toThrow();
  });
});
