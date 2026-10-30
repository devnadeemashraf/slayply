import type { DetectedQuestion, PageSnapshot } from "./page-snapshot.js";

const TEXT_MAX = 60_000;
const QUESTIONS_MAX = 40;
/** Embedded frames considered per capture. */
const FRAMES_MAX = 12;
/** A frame with less text than this and nothing else (no form, no structured data) is an ad or a widget. */
const USEFUL_TEXT = 200;

export type FrameResult = { frameId: number; result?: PageSnapshot | null };

/**
 * Orders per-frame results with the top page (frame 0) first and merges them. If the top page gave
 * nothing the result is `null`: an embedded frame never stands in for it, since the title, site
 * name and the LinkedIn decision all belong to the top page.
 */
export function mergeFrameResults(results: readonly FrameResult[]): PageSnapshot | null {
  const top = results.find((entry) => entry.frameId === 0)?.result;
  if (!top) return null;
  const embedded = results.flatMap((entry) =>
    entry.frameId !== 0 && entry.result ? [entry.result] : [],
  );
  // A page can hold dozens of frames (ads, widgets). Frames with the most questions come first, then the
  // longest, and only the first few are merged.
  const ranked = embedded
    .map((frame, index) => ({ frame, index }))
    .sort(
      (a, b) =>
        b.frame.questions.length - a.frame.questions.length ||
        b.frame.text.length - a.frame.text.length ||
        a.index - b.index,
    )
    .slice(0, FRAMES_MAX)
    .map((entry) => entry.frame);
  return mergeSnapshots([top, ...ranked]);
}

/** Splits the budget evenly, giving a part that needs less its share back to the others. */
function shareText(parts: readonly string[], total: number): string[] {
  const order = parts
    .map((part, index) => ({ index, length: part.length }))
    .sort((a, b) => a.length - b.length);
  const allowed = new Array<number>(parts.length).fill(0);
  let remaining = total;
  order.forEach((entry, position) => {
    const fair = Math.floor(remaining / (order.length - position));
    allowed[entry.index] = Math.min(entry.length, fair);
    remaining -= allowed[entry.index] ?? 0;
  });
  return parts.map((part, index) => part.slice(0, allowed[index]));
}

/**
 * Combines what each readable frame returned. The first result is the top page: it supplies the
 * title and site name. Questions, structured data and text from embedded frames are added to it,
 * so an application form in an iframe still shows up. Frames that are nearly empty are ignored,
 * and the text budget is shared so a very long page cannot crowd out the form frame.
 */
export function mergeSnapshots(frames: readonly PageSnapshot[]): PageSnapshot | null {
  const [main] = frames;
  if (!main) return null;
  if (frames.length === 1) return main;

  const useful = frames.filter(
    (frame, index) =>
      index === 0 ||
      frame.text.length >= USEFUL_TEXT ||
      frame.questions.length > 0 ||
      frame.jsonLd.length > 0,
  );

  const parts: string[] = [];
  const questions: DetectedQuestion[] = [];
  const seenQuestions = new Set<string>();
  const jsonLd: string[] = [];
  for (const frame of useful) {
    const text = frame.text.trim();
    // Short text (a form frame saying "Apply now") is kept; only real repeats are dropped.
    if (text !== "") {
      const repeatOf = parts.findIndex((part) => part.includes(text));
      const supersetOf = parts.findIndex((part) => text.includes(part));
      if (repeatOf >= 0 && text.length >= USEFUL_TEXT) {
        // already present
      } else if (supersetOf >= 0) {
        parts[supersetOf] = text;
      } else if (repeatOf < 0) {
        parts.push(text);
      }
    }
    for (const question of frame.questions) {
      const key = question.label.toLowerCase();
      if (questions.length >= QUESTIONS_MAX || seenQuestions.has(key)) continue;
      seenQuestions.add(key);
      questions.push(question);
    }
    for (const block of frame.jsonLd) if (jsonLd.length < 10) jsonLd.push(block);
  }

  return {
    title: main.title,
    ogTitle: main.ogTitle,
    ogSiteName: main.ogSiteName,
    jsonLd,
    text: shareText(parts, TEXT_MAX).join("\n\n").slice(0, TEXT_MAX),
    questions,
  };
}
