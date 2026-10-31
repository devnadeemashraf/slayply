import { SERIOUS } from "./copy-text.js";

/** Where a generation is: asking, waiting on the model, receiving text, or checking the reply. */
export type Stage = "connecting" | "waiting" | "writing" | "checking";

/** After this long the indicator adds a note that the run is slower than usual. */
export const SLOW_AFTER_MS = 30_000;

export function isSlow(elapsedMs: number): boolean {
  return elapsedMs >= SLOW_AFTER_MS;
}

/** `m:ss`; a negative or non-finite time shows as `0:00`. */
export function formatElapsed(elapsedMs: number): string {
  const total = Number.isFinite(elapsedMs) && elapsedMs > 0 ? Math.floor(elapsedMs / 1000) : 0;
  const seconds = String(total % 60).padStart(2, "0");
  return `${Math.floor(total / 60)}:${seconds}`;
}

const STAGE_TEXT: Record<Stage, string> = {
  connecting: SERIOUS.stageConnecting,
  waiting: SERIOUS.stageWaiting,
  writing: SERIOUS.stageWriting,
  checking: SERIOUS.stageChecking,
};

export function stageLabel(stage: Stage, attempt: 1 | 2): string {
  const label = STAGE_TEXT[stage];
  return attempt === 2 ? `${SERIOUS.secondAttempt} ${label}` : label;
}
