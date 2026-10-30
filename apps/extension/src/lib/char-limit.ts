// A sentence ends at . ! or ? (with closing quotes or brackets) followed by whitespace or the end,
// so "3.5" and "U.S." do not split; anything left over without an ending is the last sentence.
const SENTENCE = /[\s\S]+?[.!?]+["')\]]*(?=\s|$)\s*|[\s\S]+$/g;

/**
 * Drops whole trailing sentences until the text fits `max`. Whole sentences only, so the claim
 * check still matches the sentences that remain. Null when the limit is unusable or the first
 * sentence alone is too long (the user has to shorten it).
 */
export function fitToLimit(text: string, max: number): { text: string; dropped: number } | null {
  if (!Number.isFinite(max) || max <= 0) return null;
  if (text.length <= max) return { text, dropped: 0 };
  const sentences = text.match(SENTENCE) ?? [];
  for (let keep = sentences.length - 1; keep >= 1; keep--) {
    const kept = sentences.slice(0, keep).join("").trimEnd();
    if (kept.length <= max) return { text: kept, dropped: sentences.length - keep };
  }
  return null;
}

export type CharStatus = { ratio: number; tone: "ok" | "warn" | "bad"; label: string };

const format = (value: number) => value.toLocaleString("en-US");

/** How full an answer is against its character limit, or null when there is no usable limit. */
export function charStatus(length: number, max: number | undefined): CharStatus | null {
  if (max === undefined || !Number.isFinite(max) || max <= 0) return null;
  const tone = length > max ? "bad" : length * 10 >= max * 9 ? "warn" : "ok";
  return {
    ratio: Math.min(length / max, 1),
    tone,
    label: `${format(length)} / ${format(max)}`,
  };
}
