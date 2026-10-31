import { describe, expect, it } from "vitest";
import { advance, canEnter, type ScreenProgress, screenSteps } from "./job-screens.js";

const none: ScreenProgress = { hasJd: false, fitDone: false, answered: false, running: false };
const withJd: ScreenProgress = { ...none, hasJd: true };

describe("canEnter", () => {
  it("always allows Capture", () => {
    expect(canEnter("capture", none)).toBe(true);
  });

  it("needs a job description for Questions", () => {
    expect(canEnter("questions", none)).toBe(false);
    expect(canEnter("questions", withJd)).toBe(true);
  });

  it("needs answers, or a run in progress, for Answers", () => {
    expect(canEnter("answers", withJd)).toBe(false);
    expect(canEnter("answers", { ...withJd, running: true })).toBe(true);
    expect(canEnter("answers", { ...withJd, answered: true })).toBe(true);
  });
});

describe("advance", () => {
  it("moves Capture to Questions when the fit check finishes", () => {
    expect(advance("capture", withJd, { ...withJd, fitDone: true })).toBe("questions");
  });

  it("stays on Capture when only the job description arrives", () => {
    expect(advance("capture", none, withJd)).toBe("capture");
  });

  it("does not pull the user back from Capture when nothing about the fit changed", () => {
    const done = { ...withJd, fitDone: true };
    expect(advance("capture", done, { ...done, answered: false })).toBe("capture");
  });

  it("moves Questions to Answers when a run starts", () => {
    const ready = { ...withJd, fitDone: true };
    expect(advance("questions", ready, { ...ready, running: true })).toBe("answers");
  });

  it("moves Questions to Answers when answers appear without a run seen", () => {
    expect(advance("questions", withJd, { ...withJd, answered: true })).toBe("answers");
  });

  it("does not move a user who is reading the fit result on Capture to Answers", () => {
    const ready = { ...withJd, fitDone: true };
    expect(advance("capture", ready, { ...ready, running: true })).toBe("capture");
  });

  it("steps back to Questions when the answers are cleared", () => {
    const done = { ...withJd, fitDone: true, answered: true };
    expect(advance("answers", done, { ...withJd, fitDone: false })).toBe("questions");
  });

  it("steps back to Capture when the job description is cleared", () => {
    const done = { ...withJd, answered: true };
    expect(advance("answers", done, none)).toBe("capture");
    expect(advance("questions", withJd, none)).toBe("capture");
  });

  it("leaves the screen alone when nothing changed", () => {
    expect(advance("questions", withJd, withJd)).toBe("questions");
  });
});

describe("screenSteps", () => {
  it("lists Capture, Questions and Answers with the current one marked", () => {
    const steps = screenSteps("questions", { ...withJd, fitDone: true });
    expect(steps.map((step) => step.label)).toEqual(["Capture", "Questions", "Answers"]);
    expect(steps.map((step) => step.state)).toEqual(["done", "current", "todo"]);
  });

  it("marks which steps can be opened", () => {
    expect(screenSteps("capture", none).map((step) => step.enterable)).toEqual([
      true,
      false,
      false,
    ]);
    expect(
      screenSteps("answers", { ...withJd, answered: true }).map((step) => step.enterable),
    ).toEqual([true, true, true]);
  });

  it("shows Questions and Answers done once answers exist", () => {
    const steps = screenSteps("capture", { ...withJd, answered: true });
    expect(steps.map((step) => step.state)).toEqual(["current", "done", "done"]);
  });
});

describe("a whole run", () => {
  it("follows Capture, fit, Questions, run, Answers, and steps back when the run is cancelled", () => {
    let screen = advance("capture", none, withJd);
    expect(screen).toBe("capture");
    const fitted = { ...withJd, fitDone: true };
    screen = advance(screen, withJd, fitted);
    expect(screen).toBe("questions");
    const running = { ...fitted, running: true };
    screen = advance(screen, fitted, running);
    expect(screen).toBe("answers");
    // Cancelling leaves no result and no run, so Answers is no longer available.
    screen = advance(screen, running, fitted);
    expect(screen).toBe("questions");
  });

  it("keeps Answers open on a failed run, which counts as a result", () => {
    const fitted = { ...withJd, fitDone: true };
    const running = { ...fitted, running: true };
    const failed = { ...fitted, answered: true };
    expect(advance("answers", running, failed)).toBe("answers");
  });
});
