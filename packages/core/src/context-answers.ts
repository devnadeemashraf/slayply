import { z } from "zod";

/**
 * The standardized, versioned shape of everything the questionnaire collects (ADR-0008).
 *
 * Fields are lenient on purpose: a half-filled form is a valid draft, so every field is optional
 * and an empty string means "not answered". Only lengths and formats are enforced. What is
 * required to turn an entry into profile facts is checked when compiling.
 *
 * Everything under `private` stays on the device. `compileAnswers` is typed to take the answers
 * without that section, so the compiler cannot read it.
 */

export const ANSWER_LIMITS = {
  maxExperience: 8,
  maxProjects: 8,
  maxEducation: 4,
  maxSkills: 40,
  maxStories: 12,
  maxAchievements: 3,
  maxNeverClaim: 30,
  maxLinks: 10,
  /** Hard stop on compiled facts from answers, so imported facts keep room under the 500 cap. */
  maxCompiledFacts: 250,
} as const;

// --- Option lists (value -> label), shared by the compiler and the questionnaire UI ---

export const OPTION_LABELS = {
  employmentType: {
    full_time: "full-time",
    part_time: "part-time",
    contract: "contract",
    internship: "internship",
    freelance: "freelance",
  },
  companyStage: {
    pre_seed_seed: "pre-seed or seed startup",
    series_a_b: "Series A or B startup",
    growth: "growth-stage company",
    public: "public company",
    enterprise: "large enterprise",
    non_profit: "non-profit",
    other: "other",
  },
  workAuthorization: {
    citizen: "citizen",
    permanent_resident: "permanent resident",
    work_visa: "holds a work visa",
    needs_sponsorship: "needs visa sponsorship",
    other: "other",
  },
  relocation: { yes: "yes", no: "no", maybe: "maybe", depends: "depends on the role" },
  workMode: { remote: "remote", hybrid: "hybrid", onsite: "on-site" },
  seniority: {
    intern: "intern",
    junior: "junior",
    mid: "mid-level",
    senior: "senior",
    staff: "staff",
    principal: "principal",
    manager: "engineering manager",
    director: "director or above",
  },
  salaryPeriod: { year: "year", month: "month" },
  proficiency: {
    learning: "learning",
    working: "working knowledge",
    strong: "strong",
    expert: "expert",
  },
  storyCategory: {
    conflict: "conflict",
    failure: "failure",
    leadership: "leadership",
    ambiguity: "ambiguity",
    deadline: "tight deadline",
    ownership: "ownership",
    collaboration: "collaboration",
    other: "other",
  },
  tone: { crisp: "crisp", warm: "warm", bold: "bold" },
  formality: { casual: "casual", balanced: "balanced", formal: "formal" },
  length: { short: "short", medium: "medium", long: "long" },
  person: { first: "first person (I)", third: "third person" },
} as const;

function values<T extends Record<string, string>>(
  labels: T,
): [keyof T & string, ...(keyof T & string)[]] {
  return Object.keys(labels) as [keyof T & string, ...(keyof T & string)[]];
}

const choice = <T extends Record<string, string>>(labels: T) => z.enum(values(labels)).optional();

// --- Field helpers ---

const text = (max: number) => z.string().trim().max(max).optional();
const textList = (maxItems: number, maxChars: number) =>
  z.array(z.string().trim().max(maxChars)).max(maxItems).optional();

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
/** `YYYY-MM`, or empty for "not answered". */
const month = z.union([z.string().regex(MONTH), z.literal("")]).optional();
/** `YYYY-MM`, `present`, or empty. */
const monthOrPresent = z
  .union([z.string().regex(MONTH), z.literal("present"), z.literal("")])
  .optional();

const entryId = z.number().int().min(1).max(1_000_000);

// --- Sections ---

/** Never sent to the model. The compiler is not given this section. */
const privateSchema = z.strictObject({
  email: text(200),
  phone: text(200),
  links: textList(ANSWER_LIMITS.maxLinks, 300),
  address: text(200),
  currentCompensation: text(200),
});

const profileSection = z.strictObject({
  name: text(100),
  headline: text(100),
  city: text(100),
  country: text(100),
  timezone: text(100),
  workAuthorization: choice(OPTION_LABELS.workAuthorization),
  workAuthorizationNote: text(200),
  noticePeriod: text(200),
  relocation: choice(OPTION_LABELS.relocation),
  workMode: z
    .array(z.enum(values(OPTION_LABELS.workMode)))
    .max(3)
    .optional(),
  travelWillingness: text(200),
});

const targetsSection = z.strictObject({
  roles: textList(15, 80),
  seniority: choice(OPTION_LABELS.seniority),
  industries: textList(15, 80),
  companySizes: textList(10, 80),
  mustHaves: textList(15, 80),
  dealbreakers: textList(15, 80),
  salaryMin: z.number().min(0).max(1_000_000_000).optional(),
  salaryMax: z.number().min(0).max(1_000_000_000).optional(),
  salaryCurrency: text(8),
  salaryPeriod: choice(OPTION_LABELS.salaryPeriod),
});

const achievementSchema = z.strictObject({
  action: text(300),
  metric: text(300),
  result: text(300),
});

const experienceEntry = z.strictObject({
  entryId,
  company: text(100),
  title: text(100),
  employmentType: choice(OPTION_LABELS.employmentType),
  location: text(100),
  start: month,
  end: monthOrPresent,
  teamSize: z.number().int().min(0).max(100_000).optional(),
  reportingLine: text(100),
  companyStage: choice(OPTION_LABELS.companyStage),
  scopeOwned: text(600),
  stack: textList(30, 50),
  scaleMetrics: textList(5, 200),
  achievements: z.array(achievementSchema).max(ANSWER_LIMITS.maxAchievements).optional(),
  leadership: text(400),
  reasonForLeaving: text(400),
});

const projectEntry = z.strictObject({
  entryId,
  name: text(100),
  role: text(100),
  period: text(50),
  description: text(500),
  stack: textList(15, 50),
  outcome: text(300),
});

const educationEntry = z.strictObject({
  entryId,
  institution: text(100),
  degree: text(100),
  field: text(100),
  start: month,
  end: monthOrPresent,
  notes: text(300),
});

const skillEntry = z.strictObject({
  entryId,
  name: text(50),
  years: z.number().min(0).max(60).optional(),
  lastUsed: month,
  proficiency: choice(OPTION_LABELS.proficiency),
});

const storyEntry = z.strictObject({
  entryId,
  category: choice(OPTION_LABELS.storyCategory),
  title: text(100),
  situation: text(300),
  task: text(300),
  action: text(500),
  result: text(300),
  metric: text(200),
});

const voiceSection = z.strictObject({
  tone: choice(OPTION_LABELS.tone),
  formality: choice(OPTION_LABELS.formality),
  length: choice(OPTION_LABELS.length),
  person: choice(OPTION_LABELS.person),
  avoidPhrases: textList(20, 80),
  signaturePhrases: textList(20, 80),
  language: text(100),
});

const neverClaimSection = z.strictObject({
  statements: textList(ANSWER_LIMITS.maxNeverClaim, 300),
});

const cannedSection = z.strictObject({
  noticePeriod: text(500),
  relocation: text(500),
  salary: text(500),
  visa: text(500),
  startDate: text(500),
  whyLeaving: text(500),
  whyThisRole: text(500),
  strengthsWeaknesses: text(500),
});

/** The field list of each section, for the questionnaire coverage test and the UI. */
export const SECTION_SHAPES = {
  private: privateSchema,
  profile: profileSection,
  targets: targetsSection,
  experience: experienceEntry,
  projects: projectEntry,
  education: educationEntry,
  skills: skillEntry,
  stories: storyEntry,
  voice: voiceSection,
  neverClaim: neverClaimSection,
  canned: cannedSection,
} as const;
export const ACHIEVEMENT_SHAPE = achievementSchema;

export const SECTION_IDS = [
  "private",
  "profile",
  "targets",
  "experience",
  "projects",
  "education",
  "skills",
  "stories",
  "voice",
  "neverClaim",
  "canned",
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

function uniqueEntryIds(entries: readonly { entryId: number }[], next: number): boolean {
  const ids = entries.map((entry) => entry.entryId);
  return new Set(ids).size === ids.length && ids.every((id) => id < next);
}

export const contextAnswersSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    /** Bumped on every save; a save from a stale window is refused. */
    revision: z.number().int().min(0).max(1_000_000_000),
    /** Issues `entryId`s. Only ever grows, so a deleted entry's keys are never reused. */
    nextEntry: z.number().int().min(1).max(1_000_000),
    completedSections: z.array(z.enum(SECTION_IDS)).max(SECTION_IDS.length),
    private: privateSchema,
    profile: profileSection,
    targets: targetsSection,
    experience: z.array(experienceEntry).max(ANSWER_LIMITS.maxExperience),
    projects: z.array(projectEntry).max(ANSWER_LIMITS.maxProjects),
    education: z.array(educationEntry).max(ANSWER_LIMITS.maxEducation),
    skills: z.array(skillEntry).max(ANSWER_LIMITS.maxSkills),
    stories: z.array(storyEntry).max(ANSWER_LIMITS.maxStories),
    voice: voiceSection,
    neverClaim: neverClaimSection,
    canned: cannedSection,
  })
  .refine(
    (a) =>
      [a.experience, a.projects, a.education, a.skills, a.stories].every((entries) =>
        uniqueEntryIds(entries, a.nextEntry),
      ),
    { message: "Entry IDs must be unique and below the counter", path: ["nextEntry"] },
  );

export type ContextAnswers = z.infer<typeof contextAnswersSchema>;
/** What the compiler receives: everything except the device-only `private` section. */
export type PublicAnswers = Omit<ContextAnswers, "private"> & { private?: never };

export type ExperienceEntry = z.infer<typeof experienceEntry>;
export type ProjectEntry = z.infer<typeof projectEntry>;
export type EducationEntry = z.infer<typeof educationEntry>;
export type SkillEntry = z.infer<typeof skillEntry>;
export type StoryEntry = z.infer<typeof storyEntry>;

export function emptyAnswers(): ContextAnswers {
  return {
    schemaVersion: 1,
    revision: 0,
    nextEntry: 1,
    completedSections: [],
    private: {},
    profile: {},
    targets: {},
    experience: [],
    projects: [],
    education: [],
    skills: [],
    stories: [],
    voice: {},
    neverClaim: {},
    canned: {},
  };
}

export function parseContextAnswers(
  input: unknown,
): { success: true; data: ContextAnswers } | { success: false; issues: string[] } {
  const result = contextAnswersSchema.safeParse(input);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    issues: result.error.issues.map((issue) => `${issue.path.join(".") || "$"}: ${issue.message}`),
  };
}

/** Drops the device-only section. The only way to get `PublicAnswers` from stored answers. */
export function publicAnswers(answers: ContextAnswers): PublicAnswers {
  const { private: _private, ...rest } = answers;
  return rest;
}
