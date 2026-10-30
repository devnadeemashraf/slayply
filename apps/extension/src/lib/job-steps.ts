export type StepId = "capture" | "fit" | "answers";
export type StepState = "done" | "current" | "todo";
export type Step = { id: StepId; label: string; state: StepState };

export type JobProgress = {
  hasJd: boolean;
  fitDone: boolean;
  answered: boolean;
  fitRunning: boolean;
  running: boolean;
};

const STEPS: readonly { id: StepId; label: string }[] = [
  { id: "capture", label: "Capture" },
  { id: "fit", label: "Fit" },
  { id: "answers", label: "Answers" },
];

/** The first step not yet done is the current one; a later step done early stays done. */
export function jobSteps(progress: Pick<JobProgress, "hasJd" | "fitDone" | "answered">): Step[] {
  const done = [progress.hasJd, progress.fitDone, progress.answered];
  const current = done.findIndex((flag) => !flag);
  return STEPS.map((step, index) => ({
    ...step,
    state: done[index] ? "done" : index === current ? "current" : "todo",
  }));
}

export type PrimaryAction = {
  kind: "fit" | "answers" | "stop";
  label: string;
  disabled: boolean;
  /** Why the button is disabled, shown beside it. */
  hint?: string;
};

export function primaryAction(progress: JobProgress & { questionCount: number }): PrimaryAction {
  if (progress.running || progress.fitRunning) {
    return { kind: "stop", label: "Stop", disabled: false };
  }
  if (!progress.hasJd) {
    return {
      kind: "fit",
      label: "Check my fit",
      disabled: true,
      hint: "Add a job description first.",
    };
  }
  if (!progress.fitDone) return { kind: "fit", label: "Check my fit", disabled: false };
  if (progress.questionCount === 0) {
    return {
      kind: "answers",
      label: "Write answers",
      disabled: true,
      hint: "Tick at least one question.",
    };
  }
  const count = progress.questionCount;
  return {
    kind: "answers",
    label: progress.answered
      ? "Write again"
      : `Write ${count} ${count === 1 ? "answer" : "answers"}`,
    disabled: false,
  };
}
