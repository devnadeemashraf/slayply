import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast.js";
import { unguardedAnimations } from "./motion-audit.js";
import { DEFAULT_PRESET, isPreset, PRESETS } from "./themes.js";

const theme = readFileSync(new URL("./theme.css", import.meta.url), "utf8");
const components = readFileSync(new URL("./components.css", import.meta.url), "utf8");

/** Custom properties declared in the first block whose selector contains `selector`. */
function tokensOf(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`no block for ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const tokens: Record<string, string> = {};
  for (const match of css.slice(open + 1, close).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[match[1] as string] = (match[2] as string).trim();
  }
  return tokens;
}

const COLOUR_TOKENS = [
  "--bg",
  "--surface",
  "--surface-2",
  "--ink",
  "--ink-muted",
  "--accent",
  "--accent-ink",
  "--focus",
  "--border",
  "--ok",
  "--warn",
  "--bad",
  "--on-status",
  "--shadow-color",
];

const SHAPE_TOKENS = ["--radius-sm", "--radius-md", "--radius-lg", "--border-w", "--shadow-offset"];

// [foreground, background, minimum ratio]: 4.5 for text, 3 for focus rings and control borders.
const PAIRS: [string, string, number][] = [
  ["--ink", "--bg", 4.5],
  ["--ink", "--surface", 4.5],
  ["--ink", "--surface-2", 4.5],
  ["--ink-muted", "--bg", 4.5],
  ["--ink-muted", "--surface", 4.5],
  ["--accent-ink", "--accent", 4.5],
  ["--on-status", "--ok", 4.5],
  ["--on-status", "--warn", 4.5],
  ["--on-status", "--bad", 4.5],
  ["--focus", "--bg", 3],
  ["--focus", "--surface", 3],
  ["--border", "--bg", 3],
  ["--border", "--surface", 3],
];

describe("presets", () => {
  it("lists neon, bubblegum and brutal, with neon as the default", () => {
    expect([...PRESETS]).toEqual(["neon", "bubblegum", "brutal"]);
    expect(DEFAULT_PRESET).toBe("neon");
    expect(isPreset("brutal")).toBe(true);
    expect(isPreset("matrix")).toBe(false);
    expect(isPreset(undefined)).toBe(false);
  });

  it("serves the default preset when no data-theme is set", () => {
    const root = tokensOf(theme, ":root");
    const neon = tokensOf(theme, '[data-theme="neon"]');
    expect(root["--bg"]).toBe(neon["--bg"]);
    expect(root["--accent"]).toBe(neon["--accent"]);
  });

  for (const preset of PRESETS) {
    describe(preset, () => {
      const tokens = tokensOf(theme, `[data-theme="${preset}"]`);

      it("defines every colour and shape token", () => {
        for (const name of [...COLOUR_TOKENS, ...SHAPE_TOKENS]) {
          expect(tokens[name], `${preset} is missing ${name}`).toBeDefined();
        }
      });

      for (const [foreground, background, minimum] of PAIRS) {
        it(`${foreground} on ${background} is at least ${minimum}:1`, () => {
          const ratio = contrastRatio(tokens[foreground] as string, tokens[background] as string);
          expect(
            ratio,
            `${preset}: ${tokens[foreground]} on ${tokens[background]}`,
          ).toBeGreaterThanOrEqual(minimum);
        });
      }

      it("matches the recorded token values", () => {
        expect(tokens).toMatchSnapshot();
      });
    });
  }
});

describe("motion", () => {
  const reduced = theme.slice(theme.indexOf("@media (prefers-reduced-motion: reduce)"));

  it("has a reduced-motion block that collapses every duration token", () => {
    expect(reduced.startsWith("@media (prefers-reduced-motion: reduce)")).toBe(true);
    for (const name of ["--dur-fast", "--dur-base", "--dur-slow"]) {
      expect(reduced).toContain(`${name}:`);
    }
  });

  it("never hard-codes a duration in a component, so the override reaches it", () => {
    const declarations = components.match(/(?:transition|animation)[\w-]*\s*:[^;]+;/g) ?? [];
    for (const declaration of declarations) {
      expect(declaration, declaration).not.toMatch(/\d+(\.\d+)?m?s\b/);
    }
  });

  it("gives every animated component rule a reduced-motion rule for the same selector", () => {
    expect(unguardedAnimations(components)).toEqual([]);
  });

  it("defines the keyframes the components use, and a plain fade to replace movement", () => {
    for (const name of ["sl-pop", "sl-drop", "sl-shake", "sl-fade"]) {
      expect(components, `missing @keyframes ${name}`).toContain(`@keyframes ${name}`);
    }
  });
});
