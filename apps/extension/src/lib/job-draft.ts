import { LIMITS } from "@slayply/core";
import type { JobDetails } from "./build-request.js";
import type { GenerationState } from "./generate-controller.js";
import type { JobDraft } from "./job-store.js";
import type { QuestionRow } from "./question-rows.js";

const clip = (text: string, max: number): string => text.slice(0, max);

/**
 * What "Save job" stores: the job fields, the description and the displayed answers (with the
 * user's edits) beside their question. Every field is clipped to the stored limit so a long
 * capture cannot make the save fail.
 */
export function buildJobDraft({
  job,
  jd,
  resumeName,
  rows,
  state,
  edits,
}: {
  job: Pick<JobDetails, "title" | "company" | "location">;
  jd: string;
  resumeName: string;
  rows: readonly QuestionRow[];
  state: GenerationState;
  edits: Readonly<Record<string, string>>;
}): JobDraft {
  const answers =
    state.phase === "done"
      ? state.response.outputs.flatMap((output) => {
          const text = (edits[output.id] ?? output.text).trim();
          if (text === "") return [];
          const question = rows.find((row) => row.id === output.id)?.text.trim() || output.label;
          return [
            {
              question: clip(question, LIMITS.questionChars),
              text: clip(text, LIMITS.outputChars),
            },
          ];
        })
      : [];
  return {
    title: clip(job.title, LIMITS.shortTextChars),
    company: clip(job.company, LIMITS.shortTextChars),
    location: clip(job.location, LIMITS.shortTextChars),
    jd: clip(jd, LIMITS.jdChars),
    resumeName: clip(resumeName, LIMITS.shortTextChars),
    answers: answers.slice(0, LIMITS.maxOutputs),
  };
}
