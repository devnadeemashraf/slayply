import { readFileSync } from "node:fs";
import { unguardedAnimations } from "@slayply/ui";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../entrypoints/sidepanel/style.css", import.meta.url), "utf8");

describe("side panel stylesheet motion", () => {
  it("gives every animated rule a reduced-motion rule", () => {
    expect(unguardedAnimations(css)).toEqual([]);
  });

  it("scopes the page-level view transition to a token duration", () => {
    expect(css).toMatch(/::view-transition-group\(root\)\s*\{[^}]*var\(--dur-fast\)/);
  });
});
