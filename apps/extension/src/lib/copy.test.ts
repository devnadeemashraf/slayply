import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COPY_FEEDBACK_MS, copyText, createCopyFeedback } from "./copy.js";

describe("copyText", () => {
  it("writes exactly the text and reports copied", async () => {
    const writeText = vi.fn(async () => {});
    expect(await copyText({ writeText }, "Line one\nLine two ☕")).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("Line one\nLine two ☕");
  });

  it("reports failed when the clipboard rejects, without throwing", async () => {
    const writeText = vi.fn(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    expect(await copyText({ writeText }, "x")).toBe("failed");
  });

  it("reports failed when there is no clipboard", async () => {
    expect(await copyText(undefined, "x")).toBe("failed");
  });
});

describe("createCopyFeedback", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows copied, then returns to idle after the feedback window", async () => {
    const seen: string[] = [];
    const feedback = createCopyFeedback({ writeText: async () => {} }, (s) => seen.push(s));
    await feedback.copy("hello");
    expect(seen).toEqual(["copied"]);
    await vi.advanceTimersByTimeAsync(COPY_FEEDBACK_MS);
    expect(seen).toEqual(["copied", "idle"]);
  });

  it("shows failed and resets too", async () => {
    const seen: string[] = [];
    const feedback = createCopyFeedback(undefined, (s) => seen.push(s));
    await feedback.copy("hello");
    await vi.advanceTimersByTimeAsync(COPY_FEEDBACK_MS);
    expect(seen).toEqual(["failed", "idle"]);
  });

  it("restarts the window on a second click and cancel() silences the pending reset", async () => {
    const seen: string[] = [];
    const feedback = createCopyFeedback({ writeText: async () => {} }, (s) => seen.push(s));
    await feedback.copy("a");
    await vi.advanceTimersByTimeAsync(COPY_FEEDBACK_MS - 100);
    await feedback.copy("a");
    await vi.advanceTimersByTimeAsync(200);
    expect(seen).toEqual(["copied", "copied"]);
    feedback.cancel();
    await vi.advanceTimersByTimeAsync(COPY_FEEDBACK_MS * 2);
    expect(seen).toEqual(["copied", "copied"]);
  });
});
