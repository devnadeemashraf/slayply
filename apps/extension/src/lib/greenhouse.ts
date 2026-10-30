import type { JobFields } from "./capture-fields.js";
import type { DetectedQuestion } from "./page-snapshot.js";

/** Greenhouse's public Job Board API. It needs no key; the host is a job-site permission (`job-sites.ts`). */
export const GREENHOUSE_API_ORIGIN = "https://boards-api.greenhouse.io";

const BOARD_HOSTS: readonly string[] = [
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "boards.eu.greenhouse.io",
  "job-boards.eu.greenhouse.io",
];
const BOARD_TOKEN = /^[A-Za-z0-9_-]{1,64}$/;
const JOB_ID = /^\d{1,12}$/;
const MAX_REPLY_CHARS = 2_000_000;
const MAX_QUESTIONS = 40;
const FIELD_MAX = 120;
const LABEL_MAX = 300;

export type GreenhouseTarget = { board: string; jobId: string };

/** The board token and job id in a Greenhouse job page URL, or null. Exact hosts only. */
export function parseGreenhouseJobUrl(url: string): GreenhouseTarget | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !BOARD_HOSTS.includes(parsed.hostname)) return null;

  const segments = parsed.pathname.split("/").filter((segment) => segment !== "");
  if (segments.length === 3 && segments[1] === "jobs") {
    const [board = "", , jobId = ""] = segments;
    return BOARD_TOKEN.test(board) && JOB_ID.test(jobId) ? { board, jobId } : null;
  }
  if (segments.length === 2 && segments[0] === "embed" && segments[1] === "job_app") {
    const board = parsed.searchParams.get("for") ?? "";
    const jobId = parsed.searchParams.get("token") ?? "";
    return BOARD_TOKEN.test(board) && JOB_ID.test(jobId) ? { board, jobId } : null;
  }
  return null;
}

export type GreenhouseJob = {
  title: string;
  company: string;
  location: string;
  questions: DetectedQuestion[];
};

/** Compares labels ignoring case, spacing and a trailing required marker. */
const labelKey = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[\s*:?.]+$/g, "")
    .replace(/\s+/g, " ");

const clean = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

function questionType(fieldType: unknown): DetectedQuestion["type"] | null {
  if (fieldType === "textarea") return "longtext";
  if (fieldType === "input_text") return "text";
  if (typeof fieldType === "string" && fieldType.startsWith("multi_value")) return "choice";
  return null;
}

/**
 * Reads the Job Board API reply defensively. Only the board's custom questions (fields named
 * `question_<id>`) are kept: the standard name, email, phone, resume and cover-letter fields and the
 * demographic questions are left out, as are file uploads.
 */
export function parseGreenhouseJob(data: unknown): GreenhouseJob | null {
  const record = asRecord(data);
  if (!record) return null;

  const questions: DetectedQuestion[] = [];
  const seen = new Set<string>();
  if (Array.isArray(record.questions)) {
    for (const item of record.questions) {
      if (questions.length >= MAX_QUESTIONS) break;
      const entry = asRecord(item);
      const label = clean(entry?.label, LABEL_MAX);
      if (!entry || label === "" || !Array.isArray(entry.fields)) continue;
      const custom = entry.fields
        .map(asRecord)
        .find((field) => typeof field?.name === "string" && field.name.startsWith("question_"));
      const type = questionType(custom?.type);
      if (!type || seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      questions.push({ label, type, required: entry.required === true, maxChars: null });
    }
  }

  return {
    title: clean(record.title, FIELD_MAX),
    company: clean(record.company_name, FIELD_MAX),
    location: clean(asRecord(record.location)?.name, FIELD_MAX),
    questions,
  };
}

/**
 * Puts the structured questions first (the form's own order) with the page's character limits, then
 * any question only the page showed. Job fields the page left empty are filled from the API.
 */
export function mergeGreenhouseJob(
  base: { questions: DetectedQuestion[]; fields: JobFields },
  job: GreenhouseJob | null,
): { questions: DetectedQuestion[]; fields: JobFields } {
  if (!job) return base;
  const pageByLabel = new Map(base.questions.map((q) => [labelKey(q.label), q]));
  // The page knows the real widget and its limit, so it wins where it saw the question.
  const fromApi = job.questions.map((q) => {
    const seen = pageByLabel.get(labelKey(q.label));
    return seen ? { ...q, type: seen.type, maxChars: seen.maxChars ?? q.maxChars } : q;
  });
  const apiLabels = new Set(fromApi.map((q) => labelKey(q.label)));
  const pageOnly = base.questions.filter((q) => !apiLabels.has(labelKey(q.label)));
  return {
    questions: [...fromApi, ...pageOnly].slice(0, MAX_QUESTIONS),
    fields: {
      ...base.fields,
      title: base.fields.title || job.title,
      company: base.fields.company || job.company,
      location: base.fields.location || job.location,
    },
  };
}

/** One GET to the public endpoint, with no credentials, a timeout and a size cap. Any failure is null. */
export async function fetchGreenhouseJob(
  target: GreenhouseTarget,
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>,
  timeoutMs = 5_000,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${GREENHOUSE_API_ORIGIN}/v1/boards/${target.board}/jobs/${target.jobId}?questions=true`;
    const response = await fetchFn(url, {
      method: "GET",
      credentials: "omit",
      redirect: "error",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_REPLY_CHARS) return null;
    const text = await response.text();
    if (text.length > MAX_REPLY_CHARS) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type PermissionsLike = { contains(query: { origins: string[] }): Promise<boolean> };

/**
 * The `readApi` dependency for captures. It fetches only for a Greenhouse job page and only when
 * the API origin has been granted (the job-site switch); it never asks for the permission itself.
 */
export function createGreenhouseReader(
  permissions: PermissionsLike,
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>,
): (url: string) => Promise<unknown> {
  return async (url) => {
    const target = parseGreenhouseJobUrl(url);
    if (!target) return null;
    const allowed = await permissions.contains({ origins: [`${GREENHOUSE_API_ORIGIN}/*`] });
    return allowed ? fetchGreenhouseJob(target, fetchFn) : null;
  };
}
