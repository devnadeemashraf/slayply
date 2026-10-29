export type RateLimiterOptions = {
  limit: number;
  windowMs: number;
  /** Upper bound on tracked keys so a flood of distinct IPs cannot grow memory without limit. */
  maxEntries: number;
  now: () => number;
};

export type RateLimitDecision = { allowed: boolean; retryAfterSeconds: number };

type Window = { count: number; resetAt: number };

/** Fixed-window counter per key. State is in memory and is lost on restart by design. */
export function createRateLimiter({ limit, windowMs, maxEntries, now }: RateLimiterOptions) {
  const windows = new Map<string, Window>();

  function makeRoom(time: number): void {
    for (const [key, window] of windows) {
      if (window.resetAt <= time) windows.delete(key);
    }
    while (windows.size >= maxEntries) {
      const oldest = windows.keys().next();
      if (oldest.done) return;
      windows.delete(oldest.value);
    }
  }

  return {
    check(key: string): RateLimitDecision {
      const time = now();
      let window = windows.get(key);
      if (window === undefined || window.resetAt <= time) {
        if (window === undefined && windows.size >= maxEntries) makeRoom(time);
        window = { count: 0, resetAt: time + windowMs };
        windows.set(key, window);
      }
      window.count += 1;
      if (window.count <= limit) return { allowed: true, retryAfterSeconds: 0 };
      return { allowed: false, retryAfterSeconds: Math.ceil((window.resetAt - time) / 1000) };
    },
    size(): number {
      return windows.size;
    },
  };
}
