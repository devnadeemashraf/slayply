import { SERIOUS } from "./copy-text.js";

type Explained = { message: string; retry: boolean };
type Entry = { message: string; direct?: string; retry: boolean };

// What went wrong and what to do about it, by the code the relay or the panel reports. A code not
// listed here keeps the text it came with, and a failure the user cannot fix by repeating it
// (a rejected key, an unknown extension) offers no retry. Direct Mode always uses the newest Claude
// model, so its variants never tell the user to pick another model.
const KNOWN: Readonly<Record<string, Entry>> = {
  STREAM_TIMEOUT: { message: SERIOUS.errorTimeout, retry: true },
  RATE_LIMITED: { message: SERIOUS.errorRateLimited, retry: true },
  TOO_MANY_STREAMS: { message: SERIOUS.errorTooManyStreams, retry: true },
  UPSTREAM_RATE_LIMITED: {
    message: SERIOUS.errorUpstreamRateLimited,
    direct: SERIOUS.errorUpstreamRateLimitedDirect,
    retry: true,
  },
  UPSTREAM_OVERLOADED: {
    message: SERIOUS.errorOverloaded,
    direct: SERIOUS.errorOverloadedDirect,
    retry: true,
  },
  UPSTREAM_AUTH: { message: SERIOUS.errorAuth, retry: false },
  UPSTREAM_REJECTED: {
    message: SERIOUS.errorRejected,
    direct: SERIOUS.errorRejectedDirect,
    retry: false,
  },
  UPSTREAM_ERROR: {
    message: SERIOUS.errorUpstream,
    direct: SERIOUS.errorUpstreamDirect,
    retry: true,
  },
  STREAM_INCOMPLETE: { message: SERIOUS.errorIncomplete, retry: true },
  FORBIDDEN_ORIGIN: { message: SERIOUS.errorForbiddenOrigin, retry: false },
};

// The text already says what to do; only a retry is added.
const RETRY_ONLY: ReadonlySet<string> = new Set([
  "NETWORK",
  "REQUEST_TIMEOUT",
  "INTERNAL",
  "TOO_LARGE",
  "UNKNOWN",
]);

export function explainError(code: string, message: string, direct = false): Explained {
  const known = KNOWN[code];
  if (known !== undefined) {
    return {
      message: direct ? (known.direct ?? known.message) : known.message,
      retry: known.retry,
    };
  }
  return { message, retry: RETRY_ONLY.has(code) };
}
