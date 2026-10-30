import { describe, expect, it } from "vitest";
import { JOB_STATUSES, jobRecordSchema } from "./job-record.js";
import { LIMITS } from "./limits.js";

const BASE = {
  id: "a".repeat(64),
  title: "Backend engineer",
  company: "Acme",
  location: "Remote",
  jd: "Build billing.",
  status: "saved",
  resumeName: "SDE resume",
  answers: [{ question: "Why us?", text: "Because billing." }],
  savedAt: "2026-10-30T10:00:00.000Z",
  updatedAt: "2026-10-30T10:00:00.000Z",
};

describe("jobRecordSchema", () => {
  it("lists the pipeline in order", () => {
    expect(JOB_STATUSES).toEqual(["saved", "applied", "interviewing", "rejected", "offer"]);
  });

  it("accepts a full record and one with empty optional text", () => {
    expect(jobRecordSchema.safeParse(BASE).success).toBe(true);
    expect(
      jobRecordSchema.safeParse({ ...BASE, title: "", company: "", location: "", resumeName: "" })
        .success,
    ).toBe(true);
  });

  it("refuses an unknown status", () => {
    expect(jobRecordSchema.safeParse({ ...BASE, status: "ghosted" }).success).toBe(false);
  });

  it("refuses a bad date and an empty id", () => {
    expect(jobRecordSchema.safeParse({ ...BASE, savedAt: "yesterday" }).success).toBe(false);
    expect(jobRecordSchema.safeParse({ ...BASE, id: "" }).success).toBe(false);
  });

  it("caps the job description, the answers and each answer's text", () => {
    expect(jobRecordSchema.safeParse({ ...BASE, jd: "x".repeat(LIMITS.jdChars + 1) }).success).toBe(
      false,
    );
    const many = Array.from({ length: LIMITS.maxOutputs + 1 }, () => BASE.answers[0]);
    expect(jobRecordSchema.safeParse({ ...BASE, answers: many }).success).toBe(false);
    const long = [{ question: "Q", text: "x".repeat(LIMITS.outputChars + 1) }];
    expect(jobRecordSchema.safeParse({ ...BASE, answers: long }).success).toBe(false);
  });

  it("refuses unknown keys so a stored record cannot smuggle extra data", () => {
    expect(jobRecordSchema.safeParse({ ...BASE, apiKey: "sk-secret" }).success).toBe(false);
  });
});
