import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast.js";
import { unguardedAnimations } from "./motion-audit.js";
import { DEFAULT_THEME, isTheme, THEMES } from "./themes.js";

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
  "--accent-soft",
  "--focus",
  "--border",
  "--border-strong",
  "--ok",
  "--ok-soft",
  "--warn",
  "--warn-soft",
  "--bad",
  "--bad-soft",
  "--on-status",
  "--shadow",
];

// [foreground, background, minimum ratio]: 4.5 for text, 3 for focus rings and control borders.
const PAIRS: [string, string, number][] = [
  ["--ink", "--bg", 4.5],
  ["--ink", "--surface", 4.5],
  ["--ink", "--surface-2", 4.5],
  ["--ink-muted", "--bg", 4.5],
  ["--ink-muted", "--surface", 4.5],
  ["--ink-muted", "--surface-2", 4.5],
  ["--ok", "--surface", 4.5],
  ["--warn", "--surface", 4.5],
  ["--bad", "--surface", 4.5],
  ["--accent-ink", "--accent", 4.5],
  ["--accent", "--bg", 4.5],
  ["--ink", "--accent-soft", 4.5],
  ["--on-status", "--ok", 4.5],
  ["--on-status", "--warn", 4.5],
  ["--on-status", "--bad", 4.5],
  ["--ok", "--ok-soft", 4.5],
  ["--warn", "--warn-soft", 4.5],
  ["--bad", "--bad-soft", 4.5],
  ["--focus", "--bg", 3],
  ["--focus", "--surface", 3],
  ["--border-strong", "--bg", 3],
  ["--border-strong", "--surface", 3],
];

describe("themes", () => {
  it("lists auto, light and dark, with auto as the default", () => {
    expect([...THEMES]).toEqual(["auto", "light", "dark"]);
    expect(DEFAULT_THEME).toBe("auto");
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("neon")).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });

  it("declares dark twice: for the system setting unless light is forced, and when forced", () => {
    const system = tokensOf(theme, 'html:not([data-theme="light"])');
    const forced = tokensOf(theme, 'html[data-theme="dark"]');
    expect(system).toEqual(forced);
    expect(theme).toContain("@media (prefers-color-scheme: dark)");
  });

  it("keeps the old presets out of the stylesheet", () => {
    for (const name of ["neon", "bubblegum", "brutal"]) expect(theme).not.toContain(name);
  });

  const themes = {
    light: tokensOf(theme, 'html[data-theme="light"]'),
    dark: tokensOf(theme, 'html[data-theme="dark"]'),
  };
  for (const [name, tokens] of Object.entries(themes)) {
    describe(name, () => {
      it("defines every colour token", () => {
        for (const token of COLOUR_TOKENS) {
          expect(tokens[token], `${name} is missing ${token}`).toBeDefined();
        }
      });

      for (const [foreground, background, minimum] of PAIRS) {
        it(`${foreground} on ${background} is at least ${minimum}:1`, () => {
          const ratio = contrastRatio(tokens[foreground] as string, tokens[background] as string);
          expect(
            ratio,
            `${name}: ${tokens[foreground]} on ${tokens[background]}`,
          ).toBeGreaterThanOrEqual(minimum);
        });
      }

      it("matches the recorded token values", () => {
        expect(tokens).toMatchSnapshot();
      });
    });
  }

  it("uses one accent per theme and no other hue for primary actions", () => {
    expect(themes.light["--accent"]).toBe("#0b5fff");
    expect(themes.dark["--accent"]).toBe("#7fa8ff");
  });
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
    for (const name of ["sl-pop", "sl-shake", "sl-fade", "sl-rise"]) {
      expect(components, `missing @keyframes ${name}`).toContain(`@keyframes ${name}`);
    }
  });
});
