const REDUCED_QUERY = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{/g;
const RULE = /([^{}@]+)\{([^{}]*)\}/g;
const ANIMATES = /(?:^|[;\s])animation(?:-name)?\s*:\s*([^;]+)/;

function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function closingBrace(css: string, open: number): number {
  let depth = 0;
  for (let index = open; index < css.length; index++) {
    if (css[index] === "{") depth++;
    if (css[index] === "}" && --depth === 0) return index;
  }
  return css.length;
}

function withoutBlocks(css: string, header: RegExp): { rest: string; inner: string[] } {
  const inner: string[] = [];
  let rest = "";
  let cursor = 0;
  for (const match of css.matchAll(header)) {
    const open = match.index + match[0].length - 1;
    const close = closingBrace(css, open);
    rest += css.slice(cursor, match.index);
    inner.push(css.slice(open + 1, close));
    cursor = close + 1;
  }
  return { rest: rest + css.slice(cursor), inner };
}

const normalise = (selector: string) => selector.replace(/\s+/g, " ").trim();

/** Selectors (one per list entry) whose rule sets an animation other than `none`. */
function animatedSelectors(css: string): string[] {
  const found: string[] = [];
  for (const rule of css.matchAll(RULE)) {
    const animation = ANIMATES.exec(rule[2] ?? "");
    if (!animation || (animation[1] ?? "").trim().startsWith("none")) continue;
    for (const selector of (rule[1] ?? "").split(",")) found.push(normalise(selector));
  }
  return found;
}

/** Selectors that have any animation declaration at all, `none` included. */
function overriddenSelectors(css: string): Set<string> {
  const found = new Set<string>();
  for (const rule of css.matchAll(RULE)) {
    if (!ANIMATES.test(rule[2] ?? "")) continue;
    for (const selector of (rule[1] ?? "").split(",")) found.add(normalise(selector));
  }
  return found;
}

/**
 * Selectors that animate but have no rule for the same selector inside a
 * `prefers-reduced-motion: reduce` block. The override may switch the animation off or swap in a
 * gentler one; it must exist.
 */
export function unguardedAnimations(source: string): string[] {
  const css = withoutComments(source);
  const { rest, inner } = withoutBlocks(css, REDUCED_QUERY);
  const keyframes = withoutBlocks(rest, /@keyframes\s+[\w-]+\s*\{/g).rest;
  const guarded = overriddenSelectors(inner.join("\n"));
  return animatedSelectors(keyframes).filter((selector) => !guarded.has(selector));
}
