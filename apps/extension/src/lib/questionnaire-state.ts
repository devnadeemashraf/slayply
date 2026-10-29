import {
  ANSWER_LIMITS,
  type ContextAnswers,
  contextAnswersSchema,
  parseContextAnswers,
  QUESTIONNAIRE,
  type QuestionnaireSection,
  type SectionId,
} from "@slayply/core";

/**
 * Pure helpers behind the questionnaire form: every edit returns a new answers object, so the
 * React layer only holds state and calls these. Nothing here touches storage.
 */

export type Path = ReadonlyArray<string | number>;

const REPEATABLE_LIMITS: Partial<Record<SectionId, number>> = {
  experience: ANSWER_LIMITS.maxExperience,
  projects: ANSWER_LIMITS.maxProjects,
  education: ANSWER_LIMITS.maxEducation,
  skills: ANSWER_LIMITS.maxSkills,
  stories: ANSWER_LIMITS.maxStories,
};

export function getAt(root: unknown, path: Path): unknown {
  let node = root;
  for (const key of path) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string | number, unknown>)[key];
  }
  return node;
}

/** Returns a copy of `root` with `value` at `path`. `undefined` removes the key. */
export function setAt<T>(root: T, path: Path, value: unknown): T {
  const [head, ...rest] = path;
  if (head === undefined) return value as T;
  const node = (root ?? (typeof head === "number" ? [] : {})) as Record<string | number, unknown>;
  const child = rest.length === 0 ? value : setAt(node[head], rest, value);
  if (Array.isArray(node)) {
    const copy = [...node];
    copy[head as number] = child;
    return copy as T;
  }
  const copy = { ...node };
  if (child === undefined) delete copy[head];
  else copy[head] = child;
  return copy as T;
}

/** A typed value to store: an empty string, empty list or NaN means "not answered". */
export function cleanValue(value: unknown): unknown {
  if (value === "" || value === null) return undefined;
  if (typeof value === "number" && Number.isNaN(value)) return undefined;
  if (Array.isArray(value) && value.length === 0) return undefined;
  return value;
}

export function setAnswer(answers: ContextAnswers, path: Path, value: unknown): ContextAnswers {
  return setAt(answers, path, cleanValue(value));
}

type Entry = { entryId: number } & Record<string, unknown>;

function entriesOf(answers: ContextAnswers, id: SectionId): Entry[] {
  return (answers as unknown as Record<string, Entry[]>)[id] ?? [];
}

export function canAddEntry(answers: ContextAnswers, id: SectionId): boolean {
  const max = REPEATABLE_LIMITS[id];
  return max !== undefined && entriesOf(answers, id).length < max;
}

/** Adds an empty entry with a fresh, never-reused `entryId`. */
export function addEntry(answers: ContextAnswers, id: SectionId): ContextAnswers {
  if (!canAddEntry(answers, id)) return answers;
  const entry: Entry = { entryId: answers.nextEntry };
  return {
    ...answers,
    nextEntry: answers.nextEntry + 1,
    [id]: [...entriesOf(answers, id), entry],
  };
}

/** Removes an entry. `nextEntry` is left alone, so its ID is never issued again. */
export function removeEntry(answers: ContextAnswers, id: SectionId, index: number): ContextAnswers {
  const entries = entriesOf(answers, id);
  if (index < 0 || index >= entries.length) return answers;
  return { ...answers, [id]: entries.filter((_, i) => i !== index) };
}

export function moveEntry(
  answers: ContextAnswers,
  id: SectionId,
  index: number,
  delta: -1 | 1,
): ContextAnswers {
  const entries = [...entriesOf(answers, id)];
  const target = index + delta;
  if (index < 0 || index >= entries.length || target < 0 || target >= entries.length) {
    return answers;
  }
  const moving = entries[index] as Entry;
  entries[index] = entries[target] as Entry;
  entries[target] = moving;
  return { ...answers, [id]: entries };
}

/** Appends an empty item to a nested list (for example an achievement), up to `max`. */
export function addGroupItem(answers: ContextAnswers, path: Path, max: number): ContextAnswers {
  const list = (getAt(answers, path) as unknown[] | undefined) ?? [];
  if (list.length >= max) return answers;
  return setAt(answers, path, [...list, {}]);
}

export function removeGroupItem(
  answers: ContextAnswers,
  path: Path,
  index: number,
): ContextAnswers {
  const list = (getAt(answers, path) as unknown[] | undefined) ?? [];
  return setAnswer(
    answers,
    path,
    list.filter((_, i) => i !== index),
  );
}

/** Field problems keyed by dotted path (`experience.0.start`), for inline messages. */
export function validateAnswers(answers: ContextAnswers): Record<string, string> {
  const result = parseContextAnswers(answers);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.issues) {
    const separator = issue.indexOf(": ");
    const key = issue.slice(0, separator);
    errors[key] ??= friendly(issue.slice(separator + 2));
  }
  return errors;
}

const UNFIXABLE = new Set(["schemaVersion", "revision", "nextEntry", "completedSections"]);

/**
 * Returns the answers with every invalid field dropped (trimmed, as the schema stores them), so
 * one bad field never blocks saving the rest. `dropped` lists the fields that were left out.
 * `null` means the problem is structural and nothing can be saved.
 */
export function sanitizeAnswers(
  answers: ContextAnswers,
): { clean: ContextAnswers; dropped: string[] } | null {
  let working = answers;
  const dropped: string[] = [];
  for (let round = 0; round < 20; round += 1) {
    const result = contextAnswersSchema.safeParse(working);
    if (result.success) return { clean: result.data, dropped };
    for (const issue of result.error.issues) {
      const path = issue.path as Array<string | number>;
      if (path.length === 0 || UNFIXABLE.has(String(path[0]))) return null;
      // A bad item inside a list drops the whole list field, so nothing is silently reordered.
      const field = typeof path[path.length - 1] === "number" ? path.slice(0, -1) : path;
      dropped.push(field.join("."));
      working = setAt(working, field, undefined);
    }
  }
  return null;
}

function friendly(message: string): string {
  if (/regex|pattern|invalid string/i.test(message))
    return "Use the format YYYY-MM, for example 2024-03.";
  if (/too big|at most|maximum|<=\d/i.test(message)) return "That is too long or too large.";
  if (/invalid option|invalid input/i.test(message)) return "Pick one of the options.";
  return message;
}

function hasContent(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.some(hasContent);
  if (typeof value === "object") {
    return Object.entries(value).some(([key, v]) => key !== "entryId" && hasContent(v));
  }
  return true;
}

export type SectionProgress = {
  id: SectionId;
  title: string;
  filled: boolean;
  entries?: number;
  hasErrors?: boolean;
};

/** One row per step, for the progress indicator. A section is "filled" when anything is answered. */
export function sectionProgress(
  answers: ContextAnswers,
  errors: Record<string, string> = {},
): SectionProgress[] {
  return QUESTIONNAIRE.map((section) => {
    const value = (answers as unknown as Record<string, unknown>)[section.id];
    return {
      id: section.id,
      title: section.title,
      filled: hasContent(value),
      hasErrors: Object.keys(errors).some(
        (key) => key === section.id || key.startsWith(`${section.id}.`),
      ),
      ...(Array.isArray(value) ? { entries: value.length } : {}),
    };
  });
}

export function sectionById(id: SectionId): QuestionnaireSection {
  const section = QUESTIONNAIRE.find((s) => s.id === id);
  if (!section) throw new Error(`Unknown section ${id}`);
  return section;
}

// --- Answers file (JSON) ---

export const ANSWERS_FILE_KIND = "slayply-answers";

/** The whole answers record, including the private section: it is the user's own backup. */
export function exportAnswersJson(answers: ContextAnswers): string {
  return JSON.stringify({ kind: ANSWERS_FILE_KIND, answers }, null, 2);
}

export type AnswersImport =
  | { ok: true; answers: ContextAnswers; summary: string }
  | { ok: false; message: string };

const MAX_IMPORT_CHARS = 1_000_000;

/**
 * Reads an exported file. The result keeps the CURRENT revision and a counter at least as high
 * as either side, so the save is accepted and no entry ID is ever reused.
 */
export function parseAnswersImport(text: string, current: ContextAnswers): AnswersImport {
  if (text.length > MAX_IMPORT_CHARS) return { ok: false, message: "That file is too large." };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: "That file is not valid JSON." };
  }
  const answers = (data as { kind?: unknown; answers?: unknown } | null)?.answers;
  if ((data as { kind?: unknown } | null)?.kind !== ANSWERS_FILE_KIND || answers === undefined) {
    return { ok: false, message: "That is not a Slayply answers file." };
  }
  const parsed = parseContextAnswers(answers);
  if (!parsed.success) {
    return { ok: false, message: `The answers in that file are not valid (${parsed.issues[0]}).` };
  }
  const imported = {
    ...parsed.data,
    revision: current.revision,
    nextEntry: Math.max(parsed.data.nextEntry, current.nextEntry),
  };
  const roles = imported.experience.length;
  const total = sectionProgress(imported).filter((s) => s.filled).length;
  return {
    ok: true,
    answers: imported,
    summary: `${total} sections with answers, ${roles} ${roles === 1 ? "role" : "roles"}.`,
  };
}
