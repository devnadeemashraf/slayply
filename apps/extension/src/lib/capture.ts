import { extractJobFields, type JobFields } from "./capture-fields.js";
import type { DetectedQuestion, PageSnapshot } from "./page-snapshot.js";

export type CaptureKind = "jd" | "question" | "note";
export type CaptureMode = "selection" | "page";

export type Capture = {
  kind: CaptureKind;
  text: string;
  url: string;
  fields: JobFields;
  /** Application questions found on the page; empty for a selection or pasted text. */
  questions: DetectedQuestion[];
  /** True when the whole visible page was read, so the capture describes a whole job. */
  fromPage?: boolean;
};
export type CaptureOutcome = { ok: true; capture: Capture } | { ok: false; message: string };

export type TabInfo = {
  id: number | undefined;
  url: string | undefined;
  title: string | undefined;
};

/** What the capture code needs from the browser; the real ones run `executeScript` in the tab. */
export type CaptureDeps = {
  readPage: (tabId: number) => Promise<PageSnapshot>;
  readSelection: (tabId: number) => Promise<string>;
};

/** Matches the generate panel's job description limit. */
export const CAPTURE_TEXT_MAX = 60_000;

const KINDS: readonly string[] = ["jd", "question", "note"];

const LINKEDIN_MESSAGE =
  "Slayply does not read LinkedIn pages. Select the job text you want, then click the Slayply icon (or right-click it and choose Capture for Slayply).";
const BLOCKED_MESSAGE =
  "Slayply could not read this page. Browser pages and the web store are off limits; on other pages click the Slayply toolbar icon, or select text and right-click it.";

// linkedin.cn is LinkedIn China; lnkd.in is its short-link host.
const LINKEDIN_HOSTS = ["linkedin.com", "linkedin.cn", "lnkd.in"];

/** True for linkedin.com and its subdomains. A URL that cannot be parsed counts as LinkedIn: fail closed. */
export function isLinkedInUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return true;
  }
  // A trailing dot ("www.linkedin.com.") names the same host, so it is stripped before comparing.
  const bare = host.replace(/\.+$/, "");
  return LINKEDIN_HOSTS.some((name) => bare === name || bare.endsWith(`.${name}`));
}

/**
 * Captures from one tab at the user's request. Reading the visible page (`page`) is refused on
 * LinkedIn and on tabs with no URL, before any script runs; an explicit selection is always allowed.
 */
export async function captureFromTab(
  mode: CaptureMode,
  tab: TabInfo,
  deps: CaptureDeps,
): Promise<CaptureOutcome> {
  const { id, url } = tab;
  if (id === undefined || url === undefined) return { ok: false, message: BLOCKED_MESSAGE };

  if (mode === "page") {
    if (isLinkedInUrl(url)) return { ok: false, message: LINKEDIN_MESSAGE };
    let snapshot: PageSnapshot;
    try {
      snapshot = await deps.readPage(id);
    } catch {
      return { ok: false, message: BLOCKED_MESSAGE };
    }
    const text = snapshot.text.trim().slice(0, CAPTURE_TEXT_MAX);
    if (text === "") return { ok: false, message: "No readable text was found on this page." };
    return {
      ok: true,
      capture: {
        kind: "jd",
        text,
        url,
        fields: extractJobFields(snapshot),
        questions: parseQuestions(snapshot.questions) ?? [],
        fromPage: true,
      },
    };
  }

  let selected: string;
  try {
    selected = await deps.readSelection(id);
  } catch {
    return { ok: false, message: BLOCKED_MESSAGE };
  }
  return captureSelection(selected, tab, "jd");
}

/**
 * The one-click capture behind the toolbar icon and its shortcut: a selection wins; with none, the
 * visible page is read, except on LinkedIn, where `captureFromTab` refuses before any script runs.
 */
export async function captureOneClick(tab: TabInfo, deps: CaptureDeps): Promise<CaptureOutcome> {
  if (tab.id !== undefined && tab.url !== undefined) {
    let selected = "";
    try {
      selected = await deps.readSelection(tab.id);
    } catch {
      // A page that cannot be scripted is reported by the page read below.
    }
    if (selected.trim() !== "") return captureSelection(selected, tab, "jd");
  }
  return captureFromTab("page", tab, deps);
}

/** Builds a capture from selected text. The tab title is what the user already sees in the tab strip. */
export function captureSelection(
  selected: string,
  tab: Pick<TabInfo, "url" | "title">,
  kind: CaptureKind,
): CaptureOutcome {
  const text = selected.trim().slice(0, CAPTURE_TEXT_MAX);
  if (text === "") return { ok: false, message: "Nothing is selected. Select some text first." };
  const fields =
    kind === "jd" ? extractJobFields({ text, title: tab.title }) : extractJobFields({ text: "" });
  return { ok: true, capture: { kind, text, url: tab.url ?? "", fields, questions: [] } };
}

/** Validates what came back from `storage.session`; anything malformed is dropped. */
export function parsePending(value: unknown): CaptureOutcome | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.error === "string") return { ok: false, message: record.error.slice(0, 300) };

  const { kind, text, url, fields, questions } = record;
  if (typeof kind !== "string" || !KINDS.includes(kind)) return null;
  if (typeof text !== "string" || text.length > CAPTURE_TEXT_MAX) return null;
  if (typeof url !== "string" || typeof fields !== "object" || fields === null) return null;
  const f = fields as Record<string, unknown>;
  const keys = ["title", "company", "location", "salary"] as const;
  if (!keys.every((key) => typeof f[key] === "string")) return null;
  // Bad questions cost only the list, not the job text the user captured.
  const parsedQuestions = parseQuestions(questions) ?? [];
  return {
    ok: true,
    capture: {
      questions: parsedQuestions,
      ...(record.fromPage === true ? { fromPage: true } : {}),
      kind: kind as CaptureKind,
      text,
      url,
      fields: {
        title: f.title as string,
        company: f.company as string,
        location: f.location as string,
        salary: f.salary as string,
      },
    },
  };
}

const QUESTION_TYPES: readonly string[] = ["text", "longtext", "choice"];

/** A missing list is empty; null means the list is malformed or oversized. */
function parseQuestions(value: unknown): DetectedQuestion[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 40) return null;
  const parsed: DetectedQuestion[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const { label, type, required, maxChars } = item as Record<string, unknown>;
    if (typeof label !== "string" || label === "" || label.length > 300) return null;
    if (typeof type !== "string" || !QUESTION_TYPES.includes(type)) return null;
    if (typeof required !== "boolean") return null;
    if (
      maxChars !== null &&
      (typeof maxChars !== "number" ||
        !Number.isInteger(maxChars) ||
        maxChars <= 0 ||
        maxChars > 100_000)
    )
      return null;
    parsed.push({ label, type: type as DetectedQuestion["type"], required, maxChars });
  }
  return parsed;
}
