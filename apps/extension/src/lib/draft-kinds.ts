import type { Length, TaskKind } from "@slayply/core";

export type DraftKindId = "answers" | "cover_letter" | "message" | "email" | "relocation";

export type DraftKind = {
  id: DraftKindId;
  label: string;
  /** The contract's task: a relocation note has none of its own, so it is one fixed question. */
  task: TaskKind;
  /** Drafts can be capped (a LinkedIn note is 300 characters); answers carry limits per question. */
  takesLimit: boolean;
};

export const DRAFT_KINDS: readonly DraftKind[] = [
  { id: "answers", label: "Answers to questions", task: "answers", takesLimit: false },
  { id: "cover_letter", label: "Cover letter", task: "cover_letter", takesLimit: true },
  { id: "message", label: "Recruiter message", task: "message", takesLimit: true },
  { id: "email", label: "Cold email", task: "email", takesLimit: true },
  { id: "relocation", label: "Relocation note", task: "answers", takesLimit: true },
];

export function draftKind(id: DraftKindId): DraftKind {
  return DRAFT_KINDS.find((kind) => kind.id === id) ?? (DRAFT_KINDS[0] as DraftKind);
}

/** What the model is asked for a relocation note; the facts in the profile do the grounding. */
export const RELOCATION_QUESTION =
  "Write a short relocation note: whether I can relocate or work from the job's location, based only on my profile and preferences, and when I could start if the profile says.";

/** The label sent as the question text for a limited draft. */
export const DRAFT_QUESTION: Record<"cover_letter" | "message" | "email", string> = {
  cover_letter: "Cover letter for this job",
  message: "Message to the recruiter or hiring manager",
  email: "Cold email to the hiring manager",
};

const LENGTHS: readonly Length[] = ["short", "medium", "long"];

/** One step shorter or longer, stopping at the ends. */
export function shiftLength(length: Length, direction: "shorter" | "longer"): Length {
  const index = LENGTHS.indexOf(length) + (direction === "longer" ? 1 : -1);
  return LENGTHS[Math.min(LENGTHS.length - 1, Math.max(0, index))] as Length;
}
