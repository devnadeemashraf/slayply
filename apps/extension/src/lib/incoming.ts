import { LIMITS } from "@slayply/core";
import type { DetectedQuestion } from "./page-snapshot.js";
import { appendRow, type QuestionRow, replaceWithDetected } from "./question-rows.js";

/**
 * One captured thing for the generate panel. A page capture is a single `jd` update carrying its
 * questions, so nothing is lost when React batches two updates into one. `seq` makes a repeat of the
 * same text count as new.
 */
export type Incoming = { seq: number } & (
  | {
      kind: "jd";
      text: string;
      /** A whole-page capture: its questions replace the list. A selection or paste leaves it alone. */
      replaceAll: boolean;
      detected: DetectedQuestion[];
    }
  | { kind: "question"; text: string }
);

export type Applied = {
  /** The new job description, if the capture sets one. */
  jd?: string;
  rows: QuestionRow[];
  /** A new job description makes the old answers and fit result stale. */
  resetResult: boolean;
};

export function applyIncoming(
  incoming: Incoming,
  rows: readonly QuestionRow[],
  idFloor: number,
): Applied {
  if (incoming.kind === "question") {
    return { rows: appendRow(rows, incoming.text, idFloor), resetResult: false };
  }
  return {
    jd: incoming.text.slice(0, LIMITS.jdChars),
    rows: incoming.replaceAll ? replaceWithDetected(incoming.detected, idFloor) : [...rows],
    resetResult: true,
  };
}
