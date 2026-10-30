import {
  type Effort,
  type GenerateRequest,
  LIMITS,
  type StoredProfile,
  type StoredResume,
  type Style,
  type TaskKind,
  toProfile,
  validateGenerateRequest,
} from "@slayply/core";
import { DRAFT_QUESTION, type DraftKindId, RELOCATION_QUESTION } from "./draft-kinds.js";

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

/** The picker's choice; "" means the provider's default. */
export type ProviderChoice = {
  provider: "anthropic" | "openai" | "gemini";
  model: string;
  effort: Effort | "";
};

/** Job details the user captured; blanks and the salary (not part of the contract) are not sent. */
export type JobDetails = { title: string; company: string; location: string; salary?: string };

type BuildInput = {
  style?: Style;
  choice?: ProviderChoice;
  job?: JobDetails;
  jd: string;
  profile?: StoredProfile | null;
  resume?: StoredResume | null;
};

function buildRequest(
  input: BuildInput,
  task: TaskKind,
  questions?: { id: string; text: string; maxChars?: number }[],
): GenerateRequest | { issues: { path: string }[] } {
  const result = validateGenerateRequest({
    task,
    job: {
      jd: input.jd,
      ...(input.job?.title?.trim() ? { title: input.job.title.trim() } : {}),
      ...(input.job?.company?.trim() ? { company: input.job.company.trim() } : {}),
      ...(input.job?.location?.trim() ? { location: input.job.location.trim() } : {}),
    },
    ...(questions ? { questions } : {}),
    resume: input.resume
      ? { track: input.resume.track, region: input.resume.region, text: input.resume.text }
      : { track: "general", region: "any", text: NO_RESUME_TEXT },
    profile: input.profile ? toProfile(input.profile) : EMPTY_PROFILE,
    style: input.style ?? { tone: "crisp", length: "medium" },
    ...(input.choice
      ? {
          provider: input.choice.provider,
          ...(input.choice.model !== "" ? { model: input.choice.model } : {}),
          ...(input.choice.effort !== "" ? { effort: input.choice.effort } : {}),
        }
      : {}),
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
  if (paths.some((path) => path === "model" || path === "effort" || path === "provider")) {
    return { ok: false, message: "That model choice is not valid. Pick a model from the list." };
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

/** One `question`, or a list of `questions` (the review screen's checked rows). */
export function buildAnswerRequest(
  input: BuildInput &
    ({ question: string } | { questions: { id: string; text: string; maxChars?: number }[] }),
): BuildResult {
  const questions = "questions" in input ? input.questions : [{ id: "q1", text: input.question }];
  if (questions.length === 0) return { ok: false, message: "Pick or add at least one question." };
  const built = buildRequest(input, "answers", questions);
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

/** A positive whole number within the contract's cap, else no limit is sent. */
const usableLimit = (value: number | undefined): value is number =>
  value !== undefined && Number.isInteger(value) && value > 0 && value <= LIMITS.questionMaxChars;

/**
 * A cover letter, message, cold email or relocation note. A limit travels as one question named
 * after the task (a relocation note is an answers task with one fixed question).
 */
export function buildDraftRequest(
  input: BuildInput & { kind: Exclude<DraftKindId, "answers">; maxChars?: number },
): BuildResult {
  const limit = usableLimit(input.maxChars) ? { maxChars: input.maxChars } : {};
  const built =
    input.kind === "relocation"
      ? buildRequest(input, "answers", [{ id: "relocation", text: RELOCATION_QUESTION, ...limit }])
      : buildRequest(
          input,
          input.kind,
          usableLimit(input.maxChars)
            ? [{ id: input.kind, text: DRAFT_QUESTION[input.kind], ...limit }]
            : undefined,
        );
  if ("issues" in built) {
    return explain(
      built.issues.map((issue) => issue.path),
      "The draft request is not valid.",
    );
  }
  return { ok: true, request: built };
}
