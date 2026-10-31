import { LIMITS } from "@slayply/core";
import { type DraftKindId, draftKind } from "./draft-kinds.js";
import type { QuestionRow } from "./question-rows.js";

export type DraftLimits = {
  /** Character limit per output ID, for the ring and the Fit button. */
  limits: Record<string, number>;
  /** The draft limit as a number; meaningful only when `limitOk`. */
  draftMax: number;
  /** The draft limit field holds a whole number from 1 to the contract maximum. */
  limitOk: boolean;
  /** The draft limit field is empty (no limit asked for). */
  blank: boolean;
};

/** Limits for the character ring: per-question limits, plus the draft limit for a draft kind. */
export function draftLimits(input: {
  kind: DraftKindId;
  draftLimit: string;
  rows: readonly QuestionRow[];
}): DraftLimits {
  const text = input.draftLimit.trim();
  const draftMax = Number(text);
  const limitOk = Number.isInteger(draftMax) && draftMax > 0 && draftMax <= LIMITS.questionMaxChars;
  const limits: Record<string, number> = {};
  if (input.kind !== "answers" && limitOk) {
    const task = draftKind(input.kind).task;
    limits[task === "answers" ? input.kind : task] = draftMax;
  }
  for (const row of input.rows) {
    if (typeof row.maxChars === "number" && row.maxChars > 0) limits[row.id] = row.maxChars;
  }
  return { limits, draftMax, limitOk, blank: text === "" };
}
