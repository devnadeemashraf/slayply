import { z } from "zod";
import { LIMITS } from "./limits.js";
import { factSchema, type Profile, profileSchema, storySchema } from "./schema.js";

// --- Types ---

/** Where an item came from: compiled from questionnaire answers, or imported / typed by hand. */
export type ItemOrigin = "answers" | "manual";

/** `key` ties an `answers` item to the answer that produced it, so editing the answer keeps the ID. */
export type StoredItem = { id: string; text: string; origin: ItemOrigin; key?: string };

/**
 * What the extension persists. `nextFact` / `nextStory` only ever grow, so an ID that was ever
 * issued is never issued again, even after the item is deleted (ADR-0007).
 * `rules` and `answerRules` are kept locally; the request contract has no field for them.
 * `prefs` / `rules` come from a context-pack import; `answerPrefs` / `answerRules` from the
 * questionnaire (ADR-0008).
 */
export type StoredProfile = {
  schemaVersion: 2;
  facts: StoredItem[];
  stories: StoredItem[];
  prefs: Record<string, string>;
  rules: string[];
  answerPrefs: Record<string, string>;
  answerRules: string[];
  nextFact: number;
  nextStory: number;
  updatedAt: string;
};

export type ParseWarning = { line: number; message: string };

export type ParsedPack = {
  facts: string[];
  stories: string[];
  prefs: Record<string, string>;
  rules: string[];
  warnings: ParseWarning[];
};

export type EditResult = { ok: true; profile: StoredProfile } | { ok: false; message: string };

// --- Stored record schema ---

const prefsSchema = z
  .record(z.string().trim().min(1).max(LIMITS.shortTextChars), z.string().max(LIMITS.factChars))
  .refine((prefs) => Object.keys(prefs).length <= LIMITS.maxPrefs, {
    message: `At most ${LIMITS.maxPrefs} preferences`,
  });

function highestNumber(items: readonly StoredItem[]): number {
  return items.reduce((max, item) => Math.max(max, Number.parseInt(item.id.slice(1), 10)), 0);
}

const originFields = {
  origin: z.enum(["answers", "manual"]),
  key: z.string().min(1).max(100).optional(),
};
const storedFactSchema = factSchema.extend(originFields);
const storedStorySchema = storySchema.extend(originFields);
const ruleListSchema = z.array(z.string().trim().min(1).max(LIMITS.factChars)).max(LIMITS.maxRules);

export const storedProfileSchema = z
  .strictObject({
    schemaVersion: z.literal(2),
    facts: z.array(storedFactSchema).max(LIMITS.maxFacts),
    stories: z.array(storedStorySchema).max(LIMITS.maxStories),
    prefs: prefsSchema,
    rules: ruleListSchema,
    answerPrefs: prefsSchema,
    answerRules: ruleListSchema,
    nextFact: z.number().int().min(1).max(1_000_000),
    nextStory: z.number().int().min(1).max(1_000_000),
    updatedAt: z.string().max(40),
  })
  .refine(
    (p) =>
      new Set([...p.facts, ...p.stories].map((item) => item.id)).size ===
      p.facts.length + p.stories.length,
    { message: "Fact and story IDs must be unique", path: ["facts"] },
  )
  .refine((p) => p.nextFact > highestNumber(p.facts) && p.nextStory > highestNumber(p.stories), {
    message: "ID counters must be above every issued ID",
    path: ["nextFact"],
  });

/** Upgrades a version 1 record (no origin) to version 2: every item was typed or imported by hand. */
function upgradeStoredProfile(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const record = input as Record<string, unknown>;
  if (record.schemaVersion !== 1) return input;
  const asManual = (items: unknown) =>
    Array.isArray(items)
      ? items.map((item) =>
          typeof item === "object" && item !== null ? { ...item, origin: "manual" } : item,
        )
      : items;
  return {
    ...record,
    schemaVersion: 2,
    facts: asManual(record.facts),
    stories: asManual(record.stories),
    answerPrefs: {},
    answerRules: [],
  };
}

export function parseStoredProfile(
  input: unknown,
): { success: true; data: StoredProfile } | { success: false; issues: string[] } {
  const result = storedProfileSchema.safeParse(upgradeStoredProfile(input));
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    issues: result.error.issues.map((issue) => `${issue.path.join(".") || "$"}: ${issue.message}`),
  };
}

export function emptyStoredProfile(now: string): StoredProfile {
  return {
    schemaVersion: 2,
    facts: [],
    stories: [],
    prefs: {},
    rules: [],
    answerPrefs: {},
    answerRules: [],
    nextFact: 1,
    nextStory: 1,
    updatedAt: now,
  };
}

/**
 * The part of the profile that goes in a `GenerateRequest`: IDs and text only (the request is
 * strict, so `origin` and `key` must not leak), and preferences from the questionnaire win over
 * imported ones. Rules are deliberately left out.
 */
export function toProfile(stored: StoredProfile): Profile {
  return {
    facts: stored.facts.map(({ id, text }) => ({ id, text })),
    stories: stored.stories.map(({ id, text }) => ({ id, text })),
    prefs: { ...stored.prefs, ...stored.answerPrefs },
  };
}

/** A candidate profile is only acceptable if it is valid stored data AND fits the request contract. */
function checkCandidate(candidate: StoredProfile): EditResult {
  const stored = parseStoredProfile(candidate);
  if (!stored.success) return { ok: false, message: "The profile is not valid." };
  if (!profileSchema.safeParse(toProfile(stored.data)).success) {
    return {
      ok: false,
      message: "That would put the profile over its limits (too many items or preferences).",
    };
  }
  return { ok: true, profile: stored.data };
}

// --- Text helpers ---

/** Used only to decide whether two items are "the same": NFKC, collapsed spacing, lower case. */
export function normalizeText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function tidy(text: string): string {
  return text.replace(/[ \t]+/g, " ").trim();
}

// --- Parser ---

/** Larger inputs are refused outright: a context pack is notes, not a data dump. */
const MAX_PACK_CHARS = 1_000_000;

/** A longer line is skipped unread: no real note is this long, and it bounds every per-line scan. */
const MAX_LINE_CHARS = 10_000;

const BULLET = /^([ \t]*)(?:[-*]|\d+[.)])[ \t]+(.+)$/;

/**
 * Reads `#`, `##` or `###` followed by a title. Written as a scan, not a regex, so a line made of
 * spaces cannot cause quadratic backtracking. Closing hashes (`## Facts ##`) are dropped, but a
 * hash that is part of the title (`Moved to C#`) is kept.
 */
function parseHeading(line: string): { level: number; name: string } | null {
  let level = 0;
  while (level < line.length && line[level] === "#") level += 1;
  if (level < 1 || level > 3) return null;
  const separator = line[level];
  if (separator !== " " && separator !== "\t") return null;
  let hashes = line.length;
  while (hashes > level && line[hashes - 1] === "#") hashes -= 1;
  const before = line[hashes - 1];
  const hasClosingHashes = hashes < line.length && (before === " " || before === "\t");
  return { level, name: tidy(line.slice(level + 1, hasClosingHashes ? hashes : line.length)) };
}

type Section = "none" | "unknown" | "facts" | "stories" | "prefs" | "rules";

const SECTION_NAMES: Readonly<Record<string, Section>> = {
  facts: "facts",
  stories: "stories",
  story: "stories",
  preferences: "prefs",
  preference: "prefs",
  prefs: "prefs",
  rules: "rules",
};

type Candidate = { text: string; line: number };

function finalizeItems(
  candidates: Candidate[],
  max: number,
  label: string,
  warnings: ParseWarning[],
): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
  let overflow = 0;
  let firstOverflowLine = 0;
  for (const { text, line } of candidates) {
    if (text.length > LIMITS.factChars) {
      warnings.push({
        line,
        message: `Skipped a ${label} that is too long (${text.length} characters, max ${LIMITS.factChars}).`,
      });
      continue;
    }
    const key = normalizeText(text);
    if (seen.has(key)) {
      warnings.push({ line, message: `Dropped a duplicate ${label}.` });
      continue;
    }
    if (kept.length >= max) {
      overflow += 1;
      if (overflow === 1) firstOverflowLine = line;
      continue;
    }
    seen.add(key);
    kept.push(text);
  }
  if (overflow > 0) {
    warnings.push({
      line: firstOverflowLine,
      message: `${overflow} more ${label}s were left out (limit ${max}).`,
    });
  }
  return kept;
}

/**
 * Reads a context-pack markdown file. It never throws on content: lines it cannot use are
 * reported in `warnings`. See ADR-0007 for the format.
 */
export function parseContextPack(markdown: string): ParsedPack {
  const empty: ParsedPack = { facts: [], stories: [], prefs: {}, rules: [], warnings: [] };
  if (markdown.length > MAX_PACK_CHARS) {
    return { ...empty, warnings: [{ line: 0, message: "The file is too large (limit 1 MB)." }] };
  }

  const warnings: ParseWarning[] = [];
  const facts: Candidate[] = [];
  const rules: Candidate[] = [];
  const stories: Candidate[] = [];
  const prefs = new Map<string, string>();
  let lastPrefKey: string | null = null;

  let section: Section = "none";
  let sectionLevel = 0;
  let current: Candidate | null = null; // the item a continuation line would extend
  let story: { title: string; body: string[]; line: number } | null = null;

  const flushStory = () => {
    if (story) {
      stories.push({ text: [story.title, ...story.body].join("\n"), line: story.line });
      story = null;
    }
  };
  const targetFor = (s: Section): Candidate[] | null =>
    s === "facts" ? facts : s === "rules" ? rules : s === "stories" ? stories : null;

  const lines = markdown.replace(/^﻿/, "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const lineNo = index + 1;
    const raw = (lines[index] ?? "").trimEnd();
    if (raw.trim() === "") continue;
    if (raw.length > MAX_LINE_CHARS) {
      if (section !== "none" && section !== "unknown") {
        warnings.push({
          line: lineNo,
          message: `Skipped a line that is too long (over ${MAX_LINE_CHARS} characters).`,
        });
      }
      continue;
    }

    const heading = parseHeading(raw);
    if (heading) {
      const { level, name } = heading;
      const known = Object.hasOwn(SECTION_NAMES, name.toLowerCase());
      if (section === "stories" && level > sectionLevel && !known) {
        flushStory();
        story = { title: name, body: [], line: lineNo };
        current = null;
        continue;
      }
      flushStory();
      section = known ? (SECTION_NAMES[name.toLowerCase()] ?? "unknown") : "unknown";
      sectionLevel = level;
      current = null;
      lastPrefKey = null;
      continue;
    }

    if (section === "none" || section === "unknown") continue;

    const bullet = BULLET.exec(raw);
    const text = tidy(bullet ? (bullet[2] ?? "") : raw);

    if (section === "stories" && story) {
      story.body.push(text);
      continue;
    }

    const indent = (bullet?.[1] ?? "").replace(/\t/g, "  ").length;
    const continuation = bullet ? indent >= 2 : /^[ \t]/.test(raw);
    if (section === "prefs") {
      if (continuation && lastPrefKey !== null) {
        const grown = `${prefs.get(lastPrefKey) ?? ""} ${text}`.trim();
        if (grown.length > LIMITS.factChars) {
          prefs.delete(lastPrefKey);
          warnings.push({
            line: lineNo,
            message: `Skipped preference "${lastPrefKey.slice(0, 40)}": its value is too long (max ${LIMITS.factChars}).`,
          });
          lastPrefKey = null;
        } else {
          prefs.set(lastPrefKey, grown);
        }
        continue;
      }
      if (!bullet) {
        warnings.push({ line: lineNo, message: "Ignored a line that is not a bullet." });
        continue;
      }
      const colon = text.indexOf(":");
      const key = colon === -1 ? "" : text.slice(0, colon).trim();
      if (key === "") {
        warnings.push({
          line: lineNo,
          message: 'Ignored a preference without a "key: value" form.',
        });
        lastPrefKey = null;
        continue;
      }
      if (key === "__proto__") {
        warnings.push({ line: lineNo, message: 'Ignored a preference named "__proto__".' });
        lastPrefKey = null;
        continue;
      }
      if (prefs.has(key)) {
        warnings.push({ line: lineNo, message: `Ignored a duplicate preference "${key}".` });
        lastPrefKey = null;
        continue;
      }
      if (prefs.size >= LIMITS.maxPrefs || key.length > LIMITS.shortTextChars) {
        warnings.push({
          line: lineNo,
          message: `Skipped preference "${key.slice(0, 40)}" (limit).`,
        });
        lastPrefKey = null;
        continue;
      }
      const value = text.slice(colon + 1).trim();
      if (value.length > LIMITS.factChars) {
        warnings.push({
          line: lineNo,
          message: `Skipped preference "${key.slice(0, 40)}": its value is too long (max ${LIMITS.factChars}).`,
        });
        lastPrefKey = null;
        continue;
      }
      prefs.set(key, value);
      lastPrefKey = key;
      continue;
    }

    const target = targetFor(section);
    if (!target) continue;
    if (continuation && current) {
      current.text = `${current.text} ${text}`;
      continue;
    }
    if (!bullet) {
      warnings.push({ line: lineNo, message: "Ignored a line that is not a bullet." });
      continue;
    }
    current = { text, line: lineNo };
    target.push(current);
  }
  flushStory();

  const result: ParsedPack = {
    facts: finalizeItems(facts, LIMITS.maxFacts, "fact", warnings),
    stories: finalizeItems(stories, LIMITS.maxStories, "story", warnings),
    prefs: Object.fromEntries(prefs),
    rules: finalizeItems(rules, LIMITS.maxRules, "rule", warnings),
    warnings,
  };
  result.warnings.sort((a, b) => a.line - b.line);
  return result;
}

// --- Stable IDs ---

function formatId(prefix: "F" | "S", n: number): string {
  return `${prefix}${String(n).padStart(2, "0")}`;
}

/** Matches imported text to existing manual items by normalized text; the rest take new IDs. */
function reconcileItems(
  prefix: "F" | "S",
  previous: readonly StoredItem[],
  incoming: readonly string[],
  counter: number,
  taken: ReadonlySet<string>,
): { items: StoredItem[]; next: number } {
  const byText = new Map<string, StoredItem>();
  for (const item of previous) byText.set(normalizeText(item.text), item);
  const used = new Set<string>();
  let next = counter;
  const items: StoredItem[] = [];
  for (const raw of incoming) {
    const text = raw.trim();
    const norm = normalizeText(text);
    // The questionnaire already states this: do not store the same sentence twice.
    if (taken.has(norm)) continue;
    const match = byText.get(norm);
    if (match && !used.has(match.id)) {
      used.add(match.id);
      items.push({ id: match.id, text, origin: "manual" });
      continue;
    }
    items.push({ id: formatId(prefix, next), text, origin: "manual" });
    next += 1;
  }
  return { items, next };
}

const ofOrigin = (items: readonly StoredItem[], origin: ItemOrigin) =>
  items.filter((item) => item.origin === origin);

const textsOf = (items: readonly StoredItem[]) =>
  new Set(items.map((item) => normalizeText(item.text)));

/**
 * Merges a freshly parsed pack into the stored profile. An item whose normalized text is
 * unchanged keeps its ID (so reordering is safe); anything new takes the next counter value;
 * anything missing from the pack is removed and its ID retired. Only `manual` items are
 * replaced: items compiled from questionnaire answers are left alone (ADR-0008).
 */
export function reconcileProfile(
  previous: StoredProfile | null,
  pack: ParsedPack,
  now: string,
): EditResult {
  const total =
    pack.facts.length + pack.stories.length + Object.keys(pack.prefs).length + pack.rules.length;
  if (total === 0) {
    return {
      ok: false,
      message:
        "No facts, stories, preferences or rules were found. Check the section headings: ## Facts, ## Stories, ## Preferences, ## Rules.",
    };
  }

  const base = previous ?? emptyStoredProfile(now);
  const answerFacts = ofOrigin(base.facts, "answers");
  const answerStories = ofOrigin(base.stories, "answers");
  const facts = reconcileItems(
    "F",
    ofOrigin(base.facts, "manual"),
    pack.facts,
    base.nextFact,
    textsOf(answerFacts),
  );
  const stories = reconcileItems(
    "S",
    ofOrigin(base.stories, "manual"),
    pack.stories,
    base.nextStory,
    textsOf(answerStories),
  );
  return checkCandidate({
    ...base,
    facts: [...answerFacts, ...facts.items],
    stories: [...answerStories, ...stories.items],
    prefs: { ...pack.prefs },
    rules: [...pack.rules],
    nextFact: facts.next,
    nextStory: stories.next,
    updatedAt: now,
  });
}

// --- Compiled questionnaire answers ---

/** One compiled sentence and the answer it came from (for example `exp:3:ach:1`). */
export type KeyedText = { key: string; text: string };

export type CompiledContext = {
  facts: KeyedText[];
  stories: KeyedText[];
  prefs: Record<string, string>;
  rules: string[];
};

export type MergeResult =
  | { ok: true; profile: StoredProfile; warnings: string[] }
  | { ok: false; message: string };

/**
 * Gives compiled items their IDs. Order of preference: unchanged text keeps its ID (so a reorder
 * can never swap two IDs' meanings); otherwise the same answer key keeps its ID (an edited
 * answer); otherwise a new ID. Counters only grow, so retired IDs are never reissued.
 */
function assignAnswerItems(
  prefix: "F" | "S",
  previous: readonly StoredItem[],
  incoming: readonly KeyedText[],
  counter: number,
  taken: ReadonlySet<string>,
  warnings: string[],
): { items: StoredItem[]; next: number } {
  const unique: KeyedText[] = [];
  const seen = new Set<string>();
  for (const entry of incoming) {
    const norm = normalizeText(entry.text);
    if (seen.has(norm) || taken.has(norm)) {
      warnings.push(`Skipped a duplicate sentence (${entry.key}).`);
      continue;
    }
    seen.add(norm);
    unique.push(entry);
  }

  const assigned: Array<StoredItem | null> = unique.map(() => null);
  const used = new Set<string>();
  const byText = new Map(previous.map((item) => [normalizeText(item.text), item]));
  unique.forEach((entry, i) => {
    const match = byText.get(normalizeText(entry.text));
    if (match && !used.has(match.id)) {
      used.add(match.id);
      assigned[i] = { id: match.id, text: entry.text, origin: "answers", key: entry.key };
    }
  });
  const byKey = new Map<string, StoredItem>();
  for (const item of previous) if (item.key !== undefined) byKey.set(item.key, item);
  unique.forEach((entry, i) => {
    if (assigned[i]) return;
    const match = byKey.get(entry.key);
    if (match && !used.has(match.id)) {
      used.add(match.id);
      assigned[i] = { id: match.id, text: entry.text, origin: "answers", key: entry.key };
    }
  });

  let next = counter;
  const items = unique.map((entry, i) => {
    const existing = assigned[i];
    if (existing) return existing;
    const item: StoredItem = {
      id: formatId(prefix, next),
      text: entry.text,
      origin: "answers",
      key: entry.key,
    };
    next += 1;
    return item;
  });
  return { items, next };
}

/**
 * Applies compiled questionnaire output to the stored profile. Only `answers` items are
 * replaced; `manual` items stay. Compiled preferences and rules replace the previous
 * questionnaire ones (and win over imported preferences with the same key).
 */
export function mergeCompiledContext(
  previous: StoredProfile | null,
  compiled: CompiledContext,
  now: string,
): MergeResult {
  const base = previous ?? emptyStoredProfile(now);
  const warnings: string[] = [];
  const manualFacts = ofOrigin(base.facts, "manual");
  const manualStories = ofOrigin(base.stories, "manual");
  const facts = assignAnswerItems(
    "F",
    ofOrigin(base.facts, "answers"),
    compiled.facts,
    base.nextFact,
    textsOf(manualFacts),
    warnings,
  );
  const stories = assignAnswerItems(
    "S",
    ofOrigin(base.stories, "answers"),
    compiled.stories,
    base.nextStory,
    textsOf(manualStories),
    warnings,
  );
  for (const key of Object.keys(compiled.prefs)) {
    if (Object.hasOwn(base.prefs, key)) {
      warnings.push(`Preference "${key}" from your answers replaces the imported one.`);
    }
  }
  const checked = checkCandidate({
    ...base,
    facts: [...facts.items, ...manualFacts],
    stories: [...stories.items, ...manualStories],
    answerPrefs: { ...compiled.prefs },
    answerRules: [...compiled.rules],
    nextFact: facts.next,
    nextStory: stories.next,
    updatedAt: now,
  });
  return checked.ok ? { ok: true, profile: checked.profile, warnings } : checked;
}

// --- In-app edits ---

type Kind = "fact" | "story";

const FROM_ANSWERS_MESSAGE =
  "This item is built from your questionnaire answers. Change the answer instead.";

function cleanItemText(text: string): { ok: true; text: string } | { ok: false; message: string } {
  const cleaned = text.split(/\r?\n/).map(tidy).join("\n").trim();
  if (cleaned === "") return { ok: false, message: "Enter some text." };
  if (cleaned.length > LIMITS.factChars) {
    return { ok: false, message: `Keep it under ${LIMITS.factChars} characters.` };
  }
  return { ok: true, text: cleaned };
}

function isDuplicate(items: readonly StoredItem[], text: string, exceptId?: string): boolean {
  const key = normalizeText(text);
  return items.some((item) => item.id !== exceptId && normalizeText(item.text) === key);
}

export function addProfileItem(
  profile: StoredProfile,
  kind: Kind,
  text: string,
  now: string,
): EditResult {
  const cleaned = cleanItemText(text);
  if (!cleaned.ok) return cleaned;
  const isFact = kind === "fact";
  const items = isFact ? profile.facts : profile.stories;
  if (items.length >= (isFact ? LIMITS.maxFacts : LIMITS.maxStories)) {
    return {
      ok: false,
      message: `You have reached the limit of ${isFact ? LIMITS.maxFacts : LIMITS.maxStories} ${kind}s.`,
    };
  }
  if (isDuplicate(items, cleaned.text)) {
    return { ok: false, message: "That is already in your profile." };
  }
  const counter = isFact ? profile.nextFact : profile.nextStory;
  const added: StoredItem = {
    id: formatId(isFact ? "F" : "S", counter),
    text: cleaned.text,
    origin: "manual",
  };
  return {
    ok: true,
    profile: isFact
      ? { ...profile, facts: [...profile.facts, added], nextFact: counter + 1, updatedAt: now }
      : {
          ...profile,
          stories: [...profile.stories, added],
          nextStory: counter + 1,
          updatedAt: now,
        },
  };
}

export function editProfileItem(
  profile: StoredProfile,
  id: string,
  text: string,
  now: string,
): EditResult {
  const cleaned = cleanItemText(text);
  if (!cleaned.ok) return cleaned;
  const isFact = id.startsWith("F");
  const items = isFact ? profile.facts : profile.stories;
  const target = items.find((item) => item.id === id);
  if (!target) return { ok: false, message: "That item no longer exists." };
  if (target.origin === "answers") return { ok: false, message: FROM_ANSWERS_MESSAGE };
  if (isDuplicate(items, cleaned.text, id)) {
    return { ok: false, message: "That is already in your profile." };
  }
  const updated = items.map((item) => (item.id === id ? { ...item, text: cleaned.text } : item));
  return {
    ok: true,
    profile: isFact
      ? { ...profile, facts: updated, updatedAt: now }
      : { ...profile, stories: updated, updatedAt: now },
  };
}

export function removeProfileItem(profile: StoredProfile, id: string, now: string): EditResult {
  const isFact = id.startsWith("F");
  const items = isFact ? profile.facts : profile.stories;
  const target = items.find((item) => item.id === id);
  if (!target) return { ok: false, message: "That item no longer exists." };
  if (target.origin === "answers") return { ok: false, message: FROM_ANSWERS_MESSAGE };
  const remaining = items.filter((item) => item.id !== id);
  return {
    ok: true,
    profile: isFact
      ? { ...profile, facts: remaining, updatedAt: now }
      : { ...profile, stories: remaining, updatedAt: now },
  };
}
