import { SERIOUS } from "./copy-text.js";

/** After this long without a healthy probe the panel offers Direct Mode (SPEC §5). */
export const DIRECT_MODE_AFTER_MS = 60_000;

const WARMING_AFTER_MS = 3_000;
const RETRY_EVERY_MS = 3_000;
const PROBE_TIMEOUT_MS = 10_000;

export type ProbeOutcome = "pending" | "ok" | "failed";

export type RelayStatus = {
  phase: "checking" | "warming" | "awake" | "unreachable";
  label: string;
  offerDirectMode: boolean;
};

/** Pure mapping from "how long have we been trying, and what did the last probe say" to the UI state. */
export function describeRelayStatus(input: {
  elapsedMs: number;
  outcome: ProbeOutcome;
}): RelayStatus {
  const { elapsedMs, outcome } = input;
  if (outcome === "ok")
    return { phase: "awake", label: SERIOUS.relayConnected, offerDirectMode: false };
  if (elapsedMs >= DIRECT_MODE_AFTER_MS) {
    return {
      phase: "unreachable",
      label: SERIOUS.relayNotResponding,
      offerDirectMode: true,
    };
  }
  if (outcome === "failed" || elapsedMs >= WARMING_AFTER_MS) {
    return {
      phase: "warming",
      label: SERIOUS.relayWarming,
      offerDirectMode: false,
    };
  }
  return { phase: "checking", label: SERIOUS.relayChecking, offerDirectMode: false };
}

export type MonitorOptions = {
  /** Relay base URL, e.g. `https://relay.example.com`. */
  url: string;
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
  onChange: (status: RelayStatus) => void;
};

async function probe(
  fetchFn: MonitorOptions["fetchFn"],
  healthUrl: string,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    const response = await fetchFn(healthUrl, { signal, cache: "no-store" });
    if (!response.ok) return false;
    const body: unknown = await response.json();
    return (
      typeof body === "object" && body !== null && (body as { status?: unknown }).status === "ok"
    );
  } catch {
    return false;
  }
}

/**
 * Pings `GET /health` on open and every 3 s until the relay answers or 60 s pass.
 * A cold Render instance holds the first request, so each probe is aborted after 10 s.
 * Returns a function that stops probing and silences further callbacks.
 */
export function monitorRelay(options: MonitorOptions): () => void {
  const healthUrl = `${options.url.replace(/\/+$/, "")}/health`;
  const startedAt = Date.now();
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let warmingTimer: ReturnType<typeof setTimeout> | undefined;
  let giveUpTimer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let lastOutcome: ProbeOutcome = "pending";

  const report = (outcome: ProbeOutcome) => {
    if (stopped) return;
    lastOutcome = outcome;
    options.onChange(describeRelayStatus({ elapsedMs: Date.now() - startedAt, outcome }));
  };

  const stop = () => {
    stopped = true;
    clearTimeout(retryTimer);
    clearTimeout(warmingTimer);
    clearTimeout(giveUpTimer);
    controller?.abort();
  };

  const attempt = async () => {
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), PROBE_TIMEOUT_MS);
    const healthy = await probe(options.fetchFn, healthUrl, controller.signal);
    clearTimeout(timeout);
    if (stopped) return;
    if (healthy) {
      report("ok");
      stop();
      return;
    }
    report("failed");
    if (Date.now() - startedAt >= DIRECT_MODE_AFTER_MS) {
      stop();
      return;
    }
    retryTimer = setTimeout(() => void attempt(), RETRY_EVERY_MS);
  };

  report("pending");
  // A probe that hangs on a cold relay never reports, so the clock drives these two transitions.
  warmingTimer = setTimeout(
    () => report(lastOutcome === "failed" ? "failed" : "pending"),
    WARMING_AFTER_MS,
  );
  giveUpTimer = setTimeout(() => {
    report("failed");
    stop();
  }, DIRECT_MODE_AFTER_MS);
  void attempt();
  return stop;
}
