import { z } from "zod";
import { LIMITS } from "./limits.js";

/** Largest PDF the extension will read, checked before any parsing. */
export const RESUME_MAX_BYTES = 5 * 1024 * 1024;
/** Most pages read from one PDF; a resume is a few pages, so more is the wrong file. */
export const RESUME_MAX_PAGES = 20;
/** Fewer visible characters than this across the whole file means there is no text layer. */
export const RESUME_MIN_TEXT_CHARS = 50;

export const RESUME_TRACK_PRESETS = ["fde", "sde"] as const;
export const RESUME_REGION_PRESETS = ["master", "gulf", "india", "remote"] as const;

// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
// Compiled once; used on text of up to a few hundred KB.
// biome-ignore lint/suspicious/noControlCharactersInRegex: removing control characters is the point
const STRIP_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const TRAILING_SPACE = /[ \t]+$/gm;
const BLANK_RUNS = /\n{3,}/g;

/** A track or region label: a preset or a custom name. Same bounds as the relay's `resumeSchema`. */
export const resumeTagSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.shortTextChars)
  .refine((value) => !CONTROL_CHARS.test(value), "no control characters");

export const storedResumeSchema = z.strictObject({
  id: z.string().regex(/^[\w-]{1,64}$/),
  name: z.string().trim().min(1).max(LIMITS.shortTextChars),
  track: resumeTagSchema,
  region: resumeTagSchema,
  text: z.string().trim().min(1).max(LIMITS.resumeChars),
  charCount: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type StoredResume = z.infer<typeof storedResumeSchema>;

/** One run of text from a PDF page, in page units with y increasing upward (the pdf.js frame). */
export type PdfTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Line = { y: number; items: PdfTextItem[] };

function groupLines(items: readonly PdfTextItem[]): Line[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const entry of sorted) {
    const last = lines[lines.length - 1];
    const tolerance = Math.max(1, entry.height * 0.5);
    if (last && Math.abs(last.y - entry.y) <= tolerance) last.items.push(entry);
    else lines.push({ y: entry.y, items: [entry] });
  }
  return lines;
}

function lineText(line: Line): string {
  const parts = [...line.items].sort((a, b) => a.x - b.x);
  let text = "";
  let previousEnd = Number.NEGATIVE_INFINITY;
  for (const part of parts) {
    const gap = part.x - previousEnd;
    const touching = gap <= part.height * 0.2;
    if (text !== "" && !touching && !text.endsWith(" ") && !part.str.startsWith(" ")) text += " ";
    text += part.str;
    previousEnd = part.x + part.width;
  }
  return text.trim();
}

/** Items wider than this are headers or full-width lines, never part of one column. */
const FULL_WIDTH_RATIO = 0.6;
const MIN_GUTTER_RATIO = 0.03;
const MIN_ITEMS_PER_SIDE = 5;
const MAX_CROSSING_ITEMS = 3;

/**
 * The x position of a vertical gutter, or null for a single column. Searches the middle half of
 * the page for the widest band that at most a few items cross: a centered name or contact line
 * crosses the gutter but must not hide it. A margin or right-aligned dates are never a gutter,
 * because body lines run across them.
 */
function findGutter(items: readonly PdfTextItem[], pageWidth: number): number | null {
  const narrow = items.filter((entry) => entry.width <= pageWidth * FULL_WIDTH_RATIO);
  const allowed = Math.max(MAX_CROSSING_ITEMS, Math.floor(items.length * 0.03));
  // Wide items count as crossing too: a page of full-width lines is one column.
  const events = items
    .flatMap(
      (entry) =>
        [
          [entry.x, 1],
          [entry.x + entry.width, -1],
        ] as const,
    )
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lo = pageWidth * 0.25;
  const hi = pageWidth * 0.75;
  let best: { start: number; end: number } | null = null;
  let open: number | null = null;
  let covering = 0;
  const close = (end: number) => {
    if (open === null) return;
    const start = Math.max(open, lo);
    const stop = Math.min(end, hi);
    if (stop - start > (best ? best.end - best.start : 0)) best = { start, end: stop };
    open = null;
  };
  for (const [x, delta] of events) {
    covering += delta;
    if (covering <= allowed) open ??= x;
    else close(x);
  }
  close(Number.POSITIVE_INFINITY);
  const gutter = best as { start: number; end: number } | null;
  if (!gutter || gutter.end - gutter.start < pageWidth * MIN_GUTTER_RATIO) return null;
  const middle = (gutter.start + gutter.end) / 2;
  const left = narrow.filter((entry) => entry.x + entry.width <= middle).length;
  const right = narrow.filter((entry) => entry.x >= middle).length;
  return left >= MIN_ITEMS_PER_SIDE && right >= MIN_ITEMS_PER_SIDE ? middle : null;
}

function readLines(items: readonly PdfTextItem[]): string[] {
  return groupLines(items)
    .map(lineText)
    .filter((text) => text !== "");
}

/**
 * Turns one page of positioned text into plain text in reading order. A page with one clear
 * gutter is read left column, then right column; anything else is read top to bottom. Full-width
 * lines (a name header) stay with the left column at their own height, so a header comes first.
 */
export function itemsToText(items: readonly PdfTextItem[], pageWidth: number): string {
  const visible = items.filter((entry) => entry.str.trim() !== "");
  const gutter = findGutter(visible, pageWidth);
  if (gutter === null) return readLines(visible).join("\n");
  const right = visible.filter((entry) => entry.x >= gutter);
  const left = visible.filter((entry) => entry.x < gutter);
  return [...readLines(left), ...readLines(right)].join("\n");
}

export type AssembledResume =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; reason: "no-text" };

function cutAtLimit(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const last = cut.charCodeAt(cut.length - 1);
  // Do not end on half of a surrogate pair.
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/** Joins per-page text, cleans it, and applies the request limit. */
export function assembleResume(pages: readonly string[]): AssembledResume {
  const text = pages
    .map((page) => page.replace(STRIP_CONTROL, "").replace(TRAILING_SPACE, "").trim())
    .filter((page) => page !== "")
    .join("\n\n")
    .replace(BLANK_RUNS, "\n\n");
  if (text.replace(/\s/g, "").length < RESUME_MIN_TEXT_CHARS)
    return { ok: false, reason: "no-text" };
  const cut = cutAtLimit(text, LIMITS.resumeChars).trimEnd();
  return { ok: true, text: cut, truncated: cut.length < text.length };
}
