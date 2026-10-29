import {
  type GenerateRequest,
  LIMITS,
  type StoredProfile,
  type StoredResume,
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
export function describeProfileUse(
  profile: StoredProfile | null,
  resume: StoredResume | null = null,
): string {
  const hasProfile = profile !== null && (profile.facts.length > 0 || profile.stories.length > 0);
  if (!hasProfile && !resume) return NO_PROFILE_NOTICE;
  const used: string[] = [];
  if (hasProfile) {
    const parts = [plural(profile.facts.length, "fact"), plural(profile.stories.length, "story")];
    used.push(`${parts.filter((part) => !part.startsWith("0 ")).join(" and ")} from your profile`);
  }
  if (resume) used.push(`the resume "${resume.name}" (${resume.track}, ${resume.region})`);
  const cut = resume?.truncated ? " The resume was cut to fit the size limit." : "";
  const noResume = resume ? "" : " No resume is attached.";
  return `Using ${used.join(" and ")}.${noResume}${cut}`;
}

export type BuildResult = { ok: true; request: GenerateRequest } | { ok: false; message: string };

type BuildInput = {
  jd: string;
  profile?: StoredProfile | null;
  resume?: StoredResume | null;
};

function buildRequest(
  input: BuildInput,
  task: "answers" | "fit_check",
  questions?: { id: string; text: string }[],
): GenerateRequest | { issues: { path: string }[] } {
  const result = validateGenerateRequest({
    task,
    job: { jd: input.jd },
    ...(questions ? { questions } : {}),
    resume: input.resume
      ? { track: input.resume.track, region: input.resume.region, text: input.resume.text }
      : { track: "general", region: "any", text: NO_RESUME_TEXT },
    profile: input.profile ? toProfile(input.profile) : EMPTY_PROFILE,
    style: { tone: "crisp", length: "medium" },
  });
  return result.success ? result.data : { issues: result.issues };
}

function explain(paths: string[], fallback: string): BuildResult {
  if (paths.some((path) => path.startsWith("job"))) {
    return {
      ok: false,
      message: `Paste a job description (up to ${LIMITS.jdChars.toLocaleString("en-US")} characters).`,
    };
  }
  if (paths.some((path) => path.startsWith("resume"))) {
    return { ok: false, message: "That resume is not valid. Remove it and upload the PDF again." };
  }
  if (paths.some((path) => path.startsWith("profile"))) {
    return {
      ok: false,
      message: "Your saved profile is not valid. Re-import your context pack.",
    };
  }
  return { ok: false, message: fallback };
}

export function buildAnswerRequest(input: BuildInput & { question: string }): BuildResult {
  const built = buildRequest(input, "answers", [{ id: "q1", text: input.question }]);
  if ("issues" in built) {
    return explain(
      built.issues.map((issue) => issue.path),
      `Paste a question (up to ${LIMITS.questionChars.toLocaleString("en-US")} characters).`,
    );
  }
  return { ok: true, request: built };
}

/** A fit check needs only the job description; the resume and profile ground the match table. */
export function buildFitRequest(input: BuildInput): BuildResult {
  const built = buildRequest(input, "fit_check");
  if ("issues" in built) {
    return explain(
      built.issues.map((issue) => issue.path),
      "The fit check request is not valid.",
    );
  }
  return { ok: true, request: built };
}
