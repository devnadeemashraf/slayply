import { describe, expect, it } from "vitest";
import { unguardedAnimations } from "./motion-audit.js";

describe("unguardedAnimations", () => {
  it("is empty when nothing animates", () => {
    expect(unguardedAnimations(".a { color: red; }")).toEqual([]);
  });

  it("flags an animated rule with no reduced-motion rule", () => {
    const css = ".pop { animation: grow 1s both; }";
    expect(unguardedAnimations(css)).toEqual([".pop"]);
  });

  it("accepts a rule whose selector is also overridden under reduced motion", () => {
    const css = `
      .pop { animation: grow 1s both; }
      @media (prefers-reduced-motion: reduce) {
        .pop { animation: fade 1s both; }
      }`;
    expect(unguardedAnimations(css)).toEqual([]);
  });

  it("checks every selector in a list, not just the first", () => {
    const css = `
      .a, .b { animation: grow 1s; }
      @media (prefers-reduced-motion: reduce) { .a { animation: none; } }`;
    expect(unguardedAnimations(css)).toEqual([".b"]);
  });

  it("also catches animation-name", () => {
    expect(unguardedAnimations(".x { animation-name: grow; }")).toEqual([".x"]);
  });

  it("ignores animation: none and animations inside the reduced-motion block", () => {
    const css = `
      .off { animation: none; }
      @media (prefers-reduced-motion: reduce) { .only { animation: fade 1s; } }`;
    expect(unguardedAnimations(css)).toEqual([]);
  });

  it("ignores the contents of @keyframes", () => {
    const css = "@keyframes grow { from { opacity: 0; } to { opacity: 1; } }";
    expect(unguardedAnimations(css)).toEqual([]);
  });

  it("matches selectors regardless of whitespace", () => {
    const css = `
      .a   .b { animation: grow 1s; }
      @media (prefers-reduced-motion: reduce) { .a .b { animation: none; } }`;
    expect(unguardedAnimations(css)).toEqual([]);
  });

  it("does not let another media query count as the reduced-motion block", () => {
    const css = `
      .a { animation: grow 1s; }
      @media (min-width: 600px) { .a { animation: none; } }`;
    expect(unguardedAnimations(css)).toEqual([".a"]);
  });
});
