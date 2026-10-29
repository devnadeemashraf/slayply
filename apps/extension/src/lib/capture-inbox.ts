import { type CaptureOutcome, parsePending } from "./capture.js";

/** The slice of `chrome.storage.session` the inbox uses. */
export type InboxArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
};

export const PENDING_CAPTURE_KEY = "slayply:pendingCapture";

/**
 * Passes one capture from the background worker to the side panel. It lives in session storage
 * (memory only, cleared when the browser closes), is read once, and is validated on the way out.
 */
export function createCaptureInbox(area: InboxArea) {
  return {
    async put(outcome: CaptureOutcome): Promise<void> {
      await area.set({
        [PENDING_CAPTURE_KEY]: outcome.ok ? outcome.capture : { error: outcome.message },
      });
    },
    async take(): Promise<CaptureOutcome | null> {
      const stored = (await area.get(PENDING_CAPTURE_KEY))[PENDING_CAPTURE_KEY];
      if (stored === undefined) return null;
      await area.remove(PENDING_CAPTURE_KEY);
      return parsePending(stored);
    },
  };
}
