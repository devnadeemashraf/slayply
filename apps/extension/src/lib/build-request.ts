import { type GenerateRequest, LIMITS, validateGenerateRequest } from "@slayply/core";

/** Shown next to the Slay button until resumes and profiles exist (`RES-01`, `PROF-01`). */
export const NO_PROFILE_NOTICE =
  "No resume or profile is attached yet, so answers will be generic. Slayply will not invent experience.";

// The contract requires resume text, so say plainly that there is none rather than inventing any.
const NO_RESUME_TEXT =
  "No resume provided. Do not invent experience, employers, numbers or tools; keep the answer general and note the gap in warnings.";

export type BuildResult = { ok: true; request: GenerateRequest } | { ok: false; message: string };

export function buildAnswerRequest(input: { jd: string; question: string }): BuildResult {
  const result = validateGenerateRequest({
    task: "answers",
    job: { jd: input.jd },
    questions: [{ id: "q1", text: input.question }],
    resume: { track: "general", region: "any", text: NO_RESUME_TEXT },
    profile: { facts: [], stories: [], prefs: {} },
    style: { tone: "crisp", length: "medium" },
  });
  if (result.success) return { ok: true, request: result.data };

  const paths = result.issues.map((issue) => issue.path);
  if (paths.some((path) => path.startsWith("job"))) {
    return {
      ok: false,
      message: `Paste a job description (up to ${LIMITS.jdChars.toLocaleString("en-US")} characters).`,
    };
  }
  return {
    ok: false,
    message: `Paste a question (up to ${LIMITS.questionChars.toLocaleString("en-US")} characters).`,
  };
}
