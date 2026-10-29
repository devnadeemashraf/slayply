import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit.js";

function clock(start = 0) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("createRateLimiter", () => {
  it("allows up to the limit then rejects with a retry hint", () => {
    const time = clock();
    const limiter = createRateLimiter({
      limit: 3,
      windowMs: 60_000,
      maxEntries: 100,
      now: time.now,
    });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    const denied = limiter.check("a");
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBe(60);
  });

  it("counts keys independently", () => {
    const time = clock();
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      maxEntries: 100,
      now: time.now,
    });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });

  it("resets after the window and rounds the retry hint up", () => {
    const time = clock();
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      maxEntries: 100,
      now: time.now,
    });
    limiter.check("a");
    time.advance(59_500);
    expect(limiter.check("a")).toEqual({ allowed: false, retryAfterSeconds: 1 });
    time.advance(500);
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("stays within maxEntries when flooded with distinct keys", () => {
    const time = clock();
    const limiter = createRateLimiter({
      limit: 5,
      windowMs: 60_000,
      maxEntries: 10,
      now: time.now,
    });
    for (let i = 0; i < 1_000; i += 1) limiter.check(`ip-${i}`);
    expect(limiter.size()).toBeLessThanOrEqual(10);
  });

  it("sweeps expired entries before evicting live ones", () => {
    const time = clock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, maxEntries: 2, now: time.now });
    limiter.check("old1");
    limiter.check("old2");
    time.advance(1_000);
    limiter.check("fresh");
    expect(limiter.size()).toBe(1);
  });
});
