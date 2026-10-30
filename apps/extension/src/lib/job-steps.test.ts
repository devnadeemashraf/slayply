import { describe, expect, it } from "vitest";
import { jobSteps, primaryAction } from "./job-steps.js";

const idle = { hasJd: false, fitDone: false, answered: false, fitRunning: false, running: false };

describe("jobSteps", () => {
  it("starts on Capture with nothing done", () => {
    expect(jobSteps(idle).map((step) => [step.id, step.state])).toEqual([
      ["capture", "current"],
      ["fit", "todo"],
      ["answers", "todo"],
    ]);
  });

  it("moves to Fit once there is a job description", () => {
    expect(jobSteps({ ...idle, hasJd: true }).map((step) => step.state)).toEqual([
      "done",
      "current",
      "todo",
    ]);
  });

  it("moves to Answers after a fit check", () => {
    expect(jobSteps({ ...idle, hasJd: true, fitDone: true }).map((step) => step.state)).toEqual([
      "done",
      "done",
      "current",
    ]);
  });

  it("marks everything done once answers exist", () => {
    const all = jobSteps({ ...idle, hasJd: true, fitDone: true, answered: true });
    expect(all.every((step) => step.state === "done")).toBe(true);
  });

  it("does not skip ahead: answers without a fit check leave Fit as the open step", () => {
    const steps = jobSteps({ ...idle, hasJd: true, answered: true });
    expect(steps.map((step) => step.state)).toEqual(["done", "current", "done"]);
  });
});

describe("primaryAction", () => {
  it("asks for a job description first, disabled, and says why", () => {
    const action = primaryAction({ ...idle, questionCount: 0 });
    expect(action).toMatchObject({ kind: "fit", disabled: true });
    expect(action.hint).toMatch(/job description/i);
  });

  it("offers Check fit once there is a job description", () => {
    const action = primaryAction({ ...idle, hasJd: true, questionCount: 2 });
    expect(action).toMatchObject({ kind: "fit", disabled: false, label: "Check my fit" });
  });

  it("offers answers after the fit check, counting the ticked questions", () => {
    const one = primaryAction({ ...idle, hasJd: true, fitDone: true, questionCount: 1 });
    expect(one).toMatchObject({ kind: "answers", label: "Write 1 answer", disabled: false });
    const many = primaryAction({ ...idle, hasJd: true, fitDone: true, questionCount: 3 });
    expect(many.label).toBe("Write 3 answers");
  });

  it("is disabled with a reason when no question is ticked", () => {
    const action = primaryAction({ ...idle, hasJd: true, fitDone: true, questionCount: 0 });
    expect(action).toMatchObject({ kind: "answers", disabled: true });
    expect(action.hint).toMatch(/question/i);
  });

  it("says Write again after answers exist", () => {
    const action = primaryAction({
      ...idle,
      hasJd: true,
      fitDone: true,
      answered: true,
      questionCount: 2,
    });
    expect(action.label).toBe("Write again");
  });

  it("turns into Stop while anything is running", () => {
    expect(
      primaryAction({ ...idle, hasJd: true, fitRunning: true, questionCount: 1 }),
    ).toMatchObject({ kind: "stop", label: "Stop", disabled: false });
    expect(primaryAction({ ...idle, hasJd: true, running: true, questionCount: 1 }).kind).toBe(
      "stop",
    );
  });
});
