/** Matches `--dur-base` in @slayply/ui; the leaving animation must fit inside it. */
export const EXIT_MS = 200;

type MatchMedia = (query: string) => { matches: boolean };

/** With no way to ask, assume the user wants no motion. */
export function prefersReducedMotion(matchMedia: MatchMedia | undefined): boolean {
  if (!matchMedia) return true;
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function exitDelay(reduced: boolean): number {
  return reduced ? 0 : EXIT_MS;
}

export type ViewTransitionDoc = {
  startViewTransition?: (update: () => void) => unknown;
};

/**
 * Runs `update` inside a same-document view transition when the browser has them and the user
 * allows motion; otherwise just runs it. `update` runs exactly once either way, and never early:
 * the browser must take its "before" snapshot first.
 */
export function withViewTransition(
  update: () => void,
  doc: ViewTransitionDoc,
  reduced: boolean,
): void {
  if (reduced || typeof doc.startViewTransition !== "function") {
    update();
    return;
  }
  let ran = false;
  const once = () => {
    if (ran) return;
    ran = true;
    update();
  };
  try {
    doc.startViewTransition(once);
  } catch {
    once();
  }
}

/**
 * Lets an item play its leaving animation before the real removal runs. A second request while
 * one is leaving is refused: it would be built from text the first removal has not yet changed.
 */
export function createExit<Key>(delayMs: number, setLeaving: (key: Key | null) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;
  return {
    start(key: Key, run: () => void): boolean {
      if (pending) return false;
      if (delayMs <= 0) {
        run();
        return true;
      }
      pending = true;
      setLeaving(key);
      timer = setTimeout(() => {
        pending = false;
        setLeaving(null);
        run();
      }, delayMs);
      return true;
    },
    cancel(): void {
      clearTimeout(timer);
      pending = false;
    },
  };
}
