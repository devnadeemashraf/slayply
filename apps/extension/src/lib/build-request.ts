import {
  type GenerateRequest,
  LIMITS,
  type StoredProfile,
  toProfile,
  validateGenerateRequest,
} from "@slayply/core";

/** Shown next to the Slay button when there is no profile to ground the answer in. */
export const NO_PROFILE_NOTICE =
  "No resume or profile is attached yet, so answers will be generic. Slayply will not invent experience.";

// The contract requires resume text, so say plainly that there is none rather than inventing any.
const NO_RESUME_TEXT =
  "No resume provided. Do not invent experience, employers, numbers or tools; keep the answer general and note the gap in warnings.";

const EMPTY_PROFILE = { facts: [], stories: [], prefs: {} };

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** The line under the form that tells the user exactly what the answer will be grounded in. */
export function describeProfileUse(profile: StoredProfile | null): string {
  if (!profile || (profile.facts.length === 0 && profile.stories.length === 0)) {
    return NO_PROFILE_NOTICE;
  }
  const parts = [plural(profile.facts.length, "fact"), plural(profile.stories.length, "story")];
  const used = parts.filter((part) => !part.startsWith("0 ")).join(" and ");
  return `Using ${used} from your profile. No resume is attached yet.`;
}

export type BuildResult = { ok: true; request: GenerateRequest } | { ok: false; message: string };

export function buildAnswerRequest(input: {
  jd: string;
  question: string;
  profile?: StoredProfile | null;
}): BuildResult {
  const result = validateGenerateRequest({
    task: "answers",
    job: { jd: input.jd },
    questions: [{ id: "q1", text: input.question }],
    resume: { track: "general", region: "any", text: NO_RESUME_TEXT },
    profile: input.profile ? toProfile(input.profile) : EMPTY_PROFILE,
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
  if (paths.some((path) => path.startsWith("profile"))) {
    return {
      ok: false,
      message: "Your saved profile is not valid. Re-import your context pack.",
    };
  }
  return {
    ok: false,
    message: `Paste a question (up to ${LIMITS.questionChars.toLocaleString("en-US")} characters).`,
  };
}
