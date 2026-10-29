import { z } from "zod";
import { LIMITS } from "./limits.js";
import { factSchema, type Profile, storySchema } from "./schema.js";

// --- Types ---

export type StoredItem = { id: string; text: string };

/**
 * What the extension persists. `nextFact` / `nextStory` only ever grow, so an ID that was ever
 * issued is never issued again, even after the item is deleted (ADR-0007).
 * `rules` are kept locally; the request contract has no field for them.
 */
export type StoredProfile = {
  schemaVersion: 1;
  facts: StoredItem[];
  stories: StoredItem[];
  prefs: Record<string, string>;
  rules: string[];
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

export const storedProfileSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    facts: z.array(factSchema).max(LIMITS.maxFacts),
    stories: z.array(storySchema).max(LIMITS.maxStories),
    prefs: prefsSchema,
    rules: z.array(z.string().trim().min(1).max(LIMITS.factChars)).max(LIMITS.maxRules),
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

export function parseStoredProfile(
  input: unknown,
): { success: true; data: StoredProfile } | { success: false; issues: string[] } {
  const result = storedProfileSchema.safeParse(input);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    issues: result.error.issues.map((issue) => `${issue.path.join(".") || "$"}: ${issue.message}`),
  };
}

export function emptyStoredProfile(now: string): StoredProfile {
  return {
    schemaVersion: 1,
    facts: [],
    stories: [],
    prefs: {},
    rules: [],
    nextFact: 1,
    nextStory: 1,
    updatedAt: now,
  };
}

/** The part of the profile that goes in a `GenerateRequest`. Rules are deliberately left out. */
export function toProfile(stored: StoredProfile): Profile {
  return {
    facts: stored.facts.map((item) => ({ ...item })),
    stories: stored.stories.map((item) => ({ ...item })),
    prefs: { ...stored.prefs },
  };
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

function reconcileItems(
  prefix: "F" | "S",
  previous: readonly StoredItem[],
  incoming: readonly string[],
  counter: number,
): { items: StoredItem[]; next: number } {
  const byText = new Map<string, StoredItem>();
  for (const item of previous) byText.set(normalizeText(item.text), item);
  const used = new Set<string>();
  let next = counter;
  const items = incoming.map((raw) => {
    const text = raw.trim();
    const key = normalizeText(text);
    const match = byText.get(key);
    if (match && !used.has(match.id)) {
      used.add(match.id);
      return { id: match.id, text };
    }
    const id = formatId(prefix, next);
    next += 1;
    return { id, text };
  });
  return { items, next };
}

/**
 * Merges a freshly parsed pack into the stored profile. An item whose normalized text is
 * unchanged keeps its ID (so reordering is safe); anything new takes the next counter value;
 * anything missing from the pack is removed and its ID retired.
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
  const facts = reconcileItems("F", base.facts, pack.facts, base.nextFact);
  const stories = reconcileItems("S", base.stories, pack.stories, base.nextStory);
  const candidate: StoredProfile = {
    schemaVersion: 1,
    facts: facts.items,
    stories: stories.items,
    prefs: { ...pack.prefs },
    rules: [...pack.rules],
    nextFact: facts.next,
    nextStory: stories.next,
    updatedAt: now,
  };
  const checked = parseStoredProfile(candidate);
  if (!checked.success) return { ok: false, message: "The imported profile is not valid." };
  return { ok: true, profile: checked.data };
}

// --- In-app edits ---

type Kind = "fact" | "story";

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
  const added = { id: formatId(isFact ? "F" : "S", counter), text: cleaned.text };
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
  if (!items.some((item) => item.id === id))
    return { ok: false, message: "That item no longer exists." };
  if (isDuplicate(items, cleaned.text, id)) {
    return { ok: false, message: "That is already in your profile." };
  }
  const updated = items.map((item) => (item.id === id ? { id, text: cleaned.text } : item));
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
  if (!items.some((item) => item.id === id))
    return { ok: false, message: "That item no longer exists." };
  const remaining = items.filter((item) => item.id !== id);
  return {
    ok: true,
    profile: isFact
      ? { ...profile, facts: remaining, updatedAt: now }
      : { ...profile, stories: remaining, updatedAt: now },
  };
}
