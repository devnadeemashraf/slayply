/** The three screens of the Apply tab. The fit check lives on Capture, so it has no screen. */
export type ScreenId = "capture" | "questions" | "answers";

export type ScreenProgress = {
  hasJd: boolean;
  fitDone: boolean;
  answered: boolean;
  running: boolean;
};

export type ScreenStep = {
  id: ScreenId;
  label: string;
  state: "done" | "current" | "todo";
  /** The step can be opened now; the others are shown but disabled. */
  enterable: boolean;
};

const ORDER: readonly { id: ScreenId; label: string }[] = [
  { id: "capture", label: "Capture" },
  { id: "questions", label: "Questions" },
  { id: "answers", label: "Answers" },
];

/** Whether the user may open a screen: Questions needs a job, Answers needs a result or a run. */
export function canEnter(screen: ScreenId, progress: ScreenProgress): boolean {
  if (screen === "capture") return true;
  if (screen === "questions") return progress.hasJd;
  return progress.answered || progress.running;
}

/**
 * The screen to show after progress moves from `from` to `to`. It moves forward only on the event
 * that finishes the step the user is on (a fit check on Capture, a run on Questions), so a user
 * who goes back to read is not pulled away. It steps back when the current screen is no longer
 * available, for example after a new capture clears the answers.
 */
export function advance(current: ScreenId, from: ScreenProgress, to: ScreenProgress): ScreenId {
  let next = current;
  if (current === "capture" && !from.fitDone && to.fitDone) {
    next = "questions";
  } else if (
    current === "questions" &&
    ((!from.running && to.running) || (!from.answered && to.answered))
  ) {
    next = "answers";
  }
  let index = ORDER.findIndex((entry) => entry.id === next);
  while (index > 0 && !canEnter(ORDER[index]?.id ?? "capture", to)) index -= 1;
  return ORDER[index]?.id ?? "capture";
}

export function screenSteps(current: ScreenId, progress: ScreenProgress): ScreenStep[] {
  const done: Record<ScreenId, boolean> = {
    capture: progress.hasJd,
    questions: progress.answered,
    answers: progress.answered,
  };
  return ORDER.map((entry) => ({
    ...entry,
    state: entry.id === current ? "current" : done[entry.id] ? "done" : "todo",
    enterable: canEnter(entry.id, progress),
  }));
}
