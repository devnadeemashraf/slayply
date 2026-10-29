import { z } from "zod";
import { CITATION_ID_PATTERN, FACT_ID_PATTERN, LIMITS, STORY_ID_PATTERN } from "./limits.js";

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();

function hasUniqueIds(items: readonly { id: string }[]): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}

// --- Request ---

export const taskKindSchema = z.enum(["fit_check", "answers", "cover_letter", "message", "email"]);
export type TaskKind = z.infer<typeof taskKindSchema>;

export const toneSchema = z.enum(["crisp", "warm", "bold"]);
export type Tone = z.infer<typeof toneSchema>;

export const lengthSchema = z.enum(["short", "medium", "long"]);
export type Length = z.infer<typeof lengthSchema>;

export const styleSchema = z.strictObject({ tone: toneSchema, length: lengthSchema });
export type Style = z.infer<typeof styleSchema>;

export const jobSchema = z.strictObject({
  company: optionalText(LIMITS.shortTextChars),
  title: optionalText(LIMITS.shortTextChars),
  location: optionalText(LIMITS.shortTextChars),
  jd: requiredText(LIMITS.jdChars),
  url: z
    .url({ protocol: /^https?$/ })
    .max(LIMITS.urlChars)
    .optional(),
});
export type Job = z.infer<typeof jobSchema>;

export const questionSchema = z.strictObject({
  id: z.string().regex(/^[\w-]{1,64}$/),
  text: requiredText(LIMITS.questionChars),
  maxChars: z.number().int().positive().max(LIMITS.questionMaxChars).optional(),
});
export type Question = z.infer<typeof questionSchema>;

export const resumeSchema = z.strictObject({
  track: requiredText(LIMITS.shortTextChars),
  region: requiredText(LIMITS.shortTextChars),
  text: requiredText(LIMITS.resumeChars),
});
export type Resume = z.infer<typeof resumeSchema>;

export const factSchema = z.strictObject({
  id: z.string().regex(FACT_ID_PATTERN),
  text: requiredText(LIMITS.factChars),
});
export type Fact = z.infer<typeof factSchema>;

export const storySchema = z.strictObject({
  id: z.string().regex(STORY_ID_PATTERN),
  text: requiredText(LIMITS.factChars),
});
export type Story = z.infer<typeof storySchema>;

export const profileSchema = z
  .strictObject({
    facts: z.array(factSchema).max(LIMITS.maxFacts),
    stories: z.array(storySchema).max(LIMITS.maxStories),
    prefs: z
      .record(requiredText(LIMITS.shortTextChars), z.string().max(LIMITS.factChars))
      .refine((prefs) => Object.keys(prefs).length <= LIMITS.maxPrefs, {
        message: `At most ${LIMITS.maxPrefs} preferences`,
      }),
  })
  .refine((profile) => hasUniqueIds([...profile.facts, ...profile.stories]), {
    message: "Fact and story IDs must be unique",
    path: ["facts"],
  });
export type Profile = z.infer<typeof profileSchema>;

export const generateRequestSchema = z
  .strictObject({
    task: taskKindSchema,
    job: jobSchema,
    questions: z.array(questionSchema).max(LIMITS.maxQuestions).optional(),
    resume: resumeSchema,
    profile: profileSchema,
    style: styleSchema,
  })
  .refine((req) => req.questions === undefined || hasUniqueIds(req.questions), {
    message: "Question IDs must be unique",
    path: ["questions"],
  })
  .refine((req) => req.task !== "answers" || (req.questions?.length ?? 0) > 0, {
    message: 'Task "answers" requires at least one question',
    path: ["questions"],
  });
export type GenerateRequest = z.infer<typeof generateRequestSchema>;

// --- Response ---
// Response objects are non-strict: models add stray keys, and rejecting a whole
// answer over an extra field costs the user a retry for no benefit.

export const chanceSchema = z.enum(["low", "medium", "high"]);
export type Chance = z.infer<typeof chanceSchema>;

const citationIdSchema = z.string().regex(CITATION_ID_PATTERN);
const listItemSchema = z.string().max(LIMITS.questionChars);

export const fitMatchSchema = z.object({
  want: z.string().max(LIMITS.questionChars),
  have: z.string().max(LIMITS.questionChars),
  factIds: z.array(citationIdSchema).max(LIMITS.maxListItems),
});
export type FitMatch = z.infer<typeof fitMatchSchema>;

export const fitCheckSchema = z.object({
  matches: z.array(fitMatchSchema).max(LIMITS.maxListItems),
  gaps: z.array(listItemSchema).max(LIMITS.maxListItems),
  chance: chanceSchema,
  reason: z.string().max(LIMITS.questionChars),
  resume: z.object({ track: z.string(), region: z.string() }),
  dealBreakers: z.array(listItemSchema).max(LIMITS.maxListItems),
  salaryAnswer: z.string().max(LIMITS.questionChars).optional(),
});
export type FitCheck = z.infer<typeof fitCheckSchema>;

export const claimCitationSchema = z.object({
  sentence: z.string().max(LIMITS.questionChars),
  factIds: z.array(citationIdSchema).max(LIMITS.maxListItems),
});
export type ClaimCitation = z.infer<typeof claimCitationSchema>;

export const outputAnswerSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(LIMITS.shortTextChars),
  text: z.string().max(LIMITS.outputChars),
  claims: z.array(claimCitationSchema).max(LIMITS.maxClaims),
  charCount: z.number().int().nonnegative(),
});
export type OutputAnswer = z.infer<typeof outputAnswerSchema>;

export const generateResponseSchema = z.object({
  fit: fitCheckSchema.optional(),
  outputs: z.array(outputAnswerSchema).max(LIMITS.maxOutputs),
  warnings: z.array(listItemSchema).max(LIMITS.maxListItems),
});
export type GenerateResponse = z.infer<typeof generateResponseSchema>;
