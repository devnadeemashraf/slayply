import type { Length, Tone } from "@slayply/core";
import { draftKind, type DraftKindId } from "./draft-kinds.js";

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** One line for the collapsed Style section: what is written, in which tone and length. */
export function styleSummary(kind: DraftKindId, tone: Tone, length: Length): string {
  return `${draftKind(kind).label} · ${capitalize(tone)} · ${capitalize(length)}`;
}
