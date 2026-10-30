import { z } from "zod";
import { LIMITS } from "./limits.js";

/** The application pipeline, in the order a job moves through it. */
export const JOB_STATUSES = ["saved", "applied", "interviewing", "rejected", "offer"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** One saved job with the answers that were produced for it (SPEC Feature 7). */
export const jobRecordSchema = z.strictObject({
  id: z.string().min(1).max(128),
  title: z.string().max(LIMITS.shortTextChars),
  company: z.string().max(LIMITS.shortTextChars),
  location: z.string().max(LIMITS.shortTextChars),
  jd: z.string().max(LIMITS.jdChars),
  status: z.enum(JOB_STATUSES),
  resumeName: z.string().max(LIMITS.shortTextChars),
  answers: z
    .array(
      z.strictObject({
        question: z.string().max(LIMITS.questionChars),
        text: z.string().max(LIMITS.outputChars),
      }),
    )
    .max(LIMITS.maxOutputs),
  savedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type JobRecord = z.infer<typeof jobRecordSchema>;
