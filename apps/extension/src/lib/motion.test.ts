import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createExit,
  EXIT_MS,
  exitDelay,
  prefersReducedMotion,
  withViewTransition,
} from "./motion.js";

describe("prefersReducedMotion", () => {
  it("reads the media query", () => {
    expect(prefersReducedMotion(() => ({ matches: true }))).toBe(true);
    expect(prefersReducedMotion(() => ({ matches: false }))).toBe(false);
  });

  it("asks for the reduced-motion query specifically", () => {
    const ask = vi.fn(() => ({ matches: false }));
    prefersReducedMotion(ask);
    expect(ask).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });

  it("assumes reduced when the browser cannot answer, so nothing moves", () => {
    expect(prefersReducedMotion(undefined)).toBe(true);
  });
});

describe("exitDelay", () => {
  it("is zero under reduced motion and the exit time otherwise", () => {
    expect(exitDelay(true)).toBe(0);
    expect(exitDelay(false)).toBe(EXIT_MS);
  });
});

describe("withViewTransition", () => {
  it("just updates when the browser has no view transitions", () => {
    const update = vi.fn();
    withViewTransition(update, {}, false);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("just updates under reduced motion, even when supported", () => {
    const update = vi.fn();
    const startViewTransition = vi.fn();
    withViewTransition(update, { startViewTransition }, true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(startViewTransition).not.toHaveBeenCalled();
  });

  it("hands the update to the transition and does not run it early", () => {
    const update = vi.fn();
    let callback: (() => void) | undefined;
    withViewTransition(
      update,
      {
        startViewTransition: (cb) => {
          callback = cb;
        },
      },
      false,
    );
    expect(update).not.toHaveBeenCalled();
    callback?.();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("runs the update once if starting the transition throws", () => {
    const update = vi.fn();
    withViewTransition(
      update,
      {
        startViewTransition: () => {
          throw new Error("InvalidStateError");
        },
      },
      false,
    );
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("never runs the update twice, even if the callback fires after a throw", () => {
    const update = vi.fn();
    let callback: (() => void) | undefined;
    withViewTransition(
      update,
      {
        startViewTransition: (cb) => {
          callback = cb;
          throw new Error("late");
        },
      },
      false,
    );
    callback?.();
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe("createExit", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("with no delay it runs at once and never marks anything as leaving", () => {
    const leaving = vi.fn();
    const run = vi.fn();
    const exit = createExit(0, leaving);
    expect(exit.start(7, run)).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(leaving).not.toHaveBeenCalled();
  });

  it("marks the item as leaving, then clears it and runs after the delay", () => {
    const leaving = vi.fn();
    const run = vi.fn();
    const exit = createExit(200, leaving);
    exit.start(7, run);
    expect(leaving).toHaveBeenLastCalledWith(7);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(199);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(leaving).toHaveBeenLastCalledWith(null);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("ignores a second request while one is leaving, so a stale removal cannot overwrite it", () => {
    const run = vi.fn();
    const second = vi.fn();
    const exit = createExit(200, () => {});
    exit.start(1, run);
    expect(exit.start(2, second)).toBe(false);
    vi.advanceTimersByTime(200);
    expect(run).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("accepts a new request once the first has finished", () => {
    const exit = createExit(200, () => {});
    exit.start(1, () => {});
    vi.advanceTimersByTime(200);
    const run = vi.fn();
    expect(exit.start(2, run)).toBe(true);
    vi.advanceTimersByTime(200);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("cancel drops a pending removal", () => {
    const run = vi.fn();
    const exit = createExit(200, () => {});
    exit.start(1, run);
    exit.cancel();
    vi.advanceTimersByTime(500);
    expect(run).not.toHaveBeenCalled();
  });
});
