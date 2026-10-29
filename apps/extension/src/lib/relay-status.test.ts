import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIRECT_MODE_AFTER_MS,
  describeRelayStatus,
  monitorRelay,
  type RelayStatus,
} from "./relay-status.js";

function healthResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("describeRelayStatus", () => {
  it("is checking while the first probe is young", () => {
    expect(describeRelayStatus({ elapsedMs: 500, outcome: "pending" }).phase).toBe("checking");
  });

  it("turns to warming once a probe has been pending for 3 s", () => {
    expect(describeRelayStatus({ elapsedMs: 3_000, outcome: "pending" }).phase).toBe("warming");
  });

  it("is warming right after a failed probe", () => {
    expect(describeRelayStatus({ elapsedMs: 200, outcome: "failed" }).phase).toBe("warming");
  });

  it("is awake as soon as a probe succeeds, even late", () => {
    expect(describeRelayStatus({ elapsedMs: 59_000, outcome: "ok" }).phase).toBe("awake");
    expect(describeRelayStatus({ elapsedMs: 90_000, outcome: "ok" }).phase).toBe("awake");
  });

  it("offers Direct Mode once 60 s pass without a success", () => {
    expect(describeRelayStatus({ elapsedMs: 59_999, outcome: "failed" }).phase).toBe("warming");
    expect(describeRelayStatus({ elapsedMs: DIRECT_MODE_AFTER_MS, outcome: "failed" }).phase).toBe(
      "unreachable",
    );
    expect(describeRelayStatus({ elapsedMs: 61_000, outcome: "pending" }).phase).toBe(
      "unreachable",
    );
  });

  it("labels each phase, and only unreachable offers Direct Mode", () => {
    const phases = [
      describeRelayStatus({ elapsedMs: 0, outcome: "pending" }),
      describeRelayStatus({ elapsedMs: 5_000, outcome: "failed" }),
      describeRelayStatus({ elapsedMs: 1_000, outcome: "ok" }),
      describeRelayStatus({ elapsedMs: 70_000, outcome: "failed" }),
    ];
    for (const status of phases) expect(status.label.length).toBeGreaterThan(0);
    expect(phases.map((s) => s.offerDirectMode)).toEqual([false, false, false, true]);
    expect(phases[2]?.label).toBe("Connected");
    expect(phases[1]?.label).toContain("cooking your answer");
  });
});

describe("monitorRelay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  it("reports connected after one healthy probe and then stops probing", async () => {
    const fetchFn = vi.fn(async () => healthResponse({ status: "ok", timestamp: "t" }));
    const seen: RelayStatus[] = [];
    monitorRelay({ url: "http://relay.test", fetchFn, onChange: (s) => seen.push(s) });

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchFn).toHaveBeenCalledWith("http://relay.test/health", expect.anything());
    expect(seen.at(-1)?.phase).toBe("awake");

    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("retries a sleeping relay every 3 s and connects when it wakes", async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls += 1;
      if (calls < 4) throw new TypeError("fetch failed");
      return healthResponse({ status: "ok" });
    });
    const seen: RelayStatus[] = [];
    monitorRelay({ url: "http://relay.test", fetchFn, onChange: (s) => seen.push(s) });

    await vi.advanceTimersByTimeAsync(0);
    expect(seen.at(-1)?.phase).toBe("warming");
    await vi.advanceTimersByTimeAsync(9_000);
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(seen.at(-1)?.phase).toBe("awake");
  });

  it("gives up after 60 s, offers Direct Mode and stops probing", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const seen: RelayStatus[] = [];
    monitorRelay({ url: "http://relay.test", fetchFn, onChange: (s) => seen.push(s) });

    await vi.advanceTimersByTimeAsync(DIRECT_MODE_AFTER_MS + 3_000);
    expect(seen.at(-1)?.phase).toBe("unreachable");
    const calls = fetchFn.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchFn).toHaveBeenCalledTimes(calls);
  });

  it("aborts a probe that hangs (a cold relay holds the request) and keeps retrying", async () => {
    const fetchFn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const seen: RelayStatus[] = [];
    monitorRelay({ url: "http://relay.test", fetchFn, onChange: (s) => seen.push(s) });

    await vi.advanceTimersByTimeAsync(4_000);
    expect(seen.at(-1)?.phase).toBe("warming");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchFn.mock.calls.length).toBeGreaterThan(1);
  });

  it("treats a non-200, a body without status ok, or a non-JSON body as not ready", async () => {
    const replies = [
      healthResponse({ status: "ok" }, { status: 503 }),
      healthResponse({ hello: "world" }),
      new Response("<html>captive portal</html>", { status: 200 }),
    ];
    const fetchFn = vi.fn(async () => replies.shift() ?? healthResponse({ status: "ok" }));
    const seen: RelayStatus[] = [];
    monitorRelay({ url: "http://relay.test", fetchFn, onChange: (s) => seen.push(s) });

    for (let i = 0; i < 3; i += 1) {
      await vi.advanceTimersByTimeAsync(i === 0 ? 0 : 3_000);
      expect(seen.at(-1)?.phase).toBe("warming");
    }
    await vi.advanceTimersByTimeAsync(3_000);
    expect(seen.at(-1)?.phase).toBe("awake");
  });

  it("stop() cancels probing and silences later callbacks", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const seen: RelayStatus[] = [];
    const stop = monitorRelay({
      url: "http://relay.test",
      fetchFn,
      onChange: (s) => seen.push(s),
    });
    await vi.advanceTimersByTimeAsync(0);
    stop();
    const calls = fetchFn.mock.calls.length;
    const reported = seen.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchFn).toHaveBeenCalledTimes(calls);
    expect(seen).toHaveLength(reported);
  });

  it("strips a trailing slash from the relay URL", async () => {
    const fetchFn = vi.fn(async () => healthResponse({ status: "ok" }));
    monitorRelay({ url: "http://relay.test/", fetchFn, onChange: () => {} });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchFn).toHaveBeenCalledWith("http://relay.test/health", expect.anything());
  });
});
