import type { ClaimCitation, Profile } from "./schema.js";

export type ClaimStatus = "cited" | "uncited" | "not-a-claim";

export type CheckedSentence = {
  text: string;
  /** Offsets into the checked text: `text.slice(start, end)` is `text` above. */
  start: number;
  end: number;
  status: ClaimStatus;
  /** IDs the model listed for this sentence (valid or not). */
  factIds: string[];
  /** Listed IDs that are not in the profile that was sent with the request. */
  invalidIds: string[];
  /** The fact text in force when the request was sent, for each valid listed ID. */
  cited: { id: string; text: string }[];
};

export type ClaimSummary = { cited: number; uncited: number; other: number };

type CitableProfile = Pick<Profile, "facts" | "stories">;

// Compiled once at module load. A sentence is about the user when it holds a first-person word.
// The check fails toward flagging: a false red costs one click, a missed claim costs trust.
// `i.e.` and lowercase `i` are not "I"; the match is on Latin pronouns only (see ADR-0010).
const FIRST_PERSON =
  /(?<![\p{L}\p{N}_])(?:I(?!\.\p{Ll})|[Mm]y|[Mm]e|[Mm]ine|[Mm]yself|[Ww]e|[Oo]urs?|[Uu]s)(?![\p{L}\p{N}_])/u;
const CURLY_APOSTROPHE = /[‘’]/g;
const WHITESPACE_RUN = /\s+/g;
const TRAILING_PUNCTUATION = /[\s.!?…"'”)]+$/u;
const LINE_BREAK = /\n/;
const LIST_MARKER = /^(?:[-*•]|\d+[.)])\s+/u;

const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });

/** Equality key for matching a claim to a sentence. Exact after this; never fuzzy. */
function normalize(sentence: string): string {
  return sentence
    .normalize("NFKC")
    .replace(CURLY_APOSTROPHE, "'")
    .replace(WHITESPACE_RUN, " ")
    .trim()
    .replace(LIST_MARKER, "")
    .replace(TRAILING_PUNCTUATION, "");
}

function isFirstPerson(sentence: string): boolean {
  return FIRST_PERSON.test(sentence.normalize("NFKC").replace(CURLY_APOSTROPHE, "'"));
}

/** Splits into sentences, one per list line at least, keeping offsets into `text`. */
function splitSentences(text: string): { text: string; start: number; end: number }[] {
  const result: { text: string; start: number; end: number }[] = [];
  let lineStart = 0;
  for (const line of text.split(LINE_BREAK)) {
    for (const part of segmenter.segment(line)) {
      const trimmed = part.segment.trim();
      if (trimmed === "") continue;
      const start = lineStart + part.index + part.segment.indexOf(trimmed);
      result.push({ text: trimmed, start, end: start + trimmed.length });
    }
    lineStart += line.length + 1;
  }
  return result;
}

function indexById(profile: CitableProfile): Map<string, string> {
  const index = new Map<string, string>();
  for (const item of [...profile.facts, ...profile.stories]) index.set(item.id, item.text);
  return index;
}

function indexClaims(claims: readonly ClaimCitation[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const claim of claims) {
    const key = normalize(claim.sentence);
    const ids = index.get(key) ?? [];
    for (const id of claim.factIds) if (!ids.includes(id)) ids.push(id);
    index.set(key, ids);
  }
  return index;
}

/**
 * Judges coverage from the answer text itself, not from the model's own list: a first-person
 * sentence is `cited` only when a claim quotes it exactly and every ID it lists exists in the
 * profile that was sent. Paraphrased, missing, empty or forged citations leave it `uncited`.
 */
export function checkClaims(
  text: string,
  claims: readonly ClaimCitation[],
  profile: CitableProfile,
): CheckedSentence[] {
  const known = indexById(profile);
  const claimed = indexClaims(claims);

  return splitSentences(text).map((sentence) => {
    const factIds = claimed.get(normalize(sentence.text)) ?? [];
    const invalidIds = factIds.filter((id) => !known.has(id));
    const cited = factIds
      .filter((id) => known.has(id))
      .map((id) => ({ id, text: known.get(id) ?? "" }));

    let status: ClaimStatus = "not-a-claim";
    if (isFirstPerson(sentence.text)) {
      status = cited.length > 0 && invalidIds.length === 0 ? "cited" : "uncited";
    }
    return { ...sentence, status, factIds: [...factIds], invalidIds, cited };
  });
}

export function summarizeClaims(sentences: readonly CheckedSentence[]): ClaimSummary {
  const summary: ClaimSummary = { cited: 0, uncited: 0, other: 0 };
  for (const sentence of sentences) {
    if (sentence.status === "cited") summary.cited += 1;
    else if (sentence.status === "uncited") summary.uncited += 1;
    else summary.other += 1;
  }
  return summary;
}

/** Returns `text` without the sentence; a line left empty is dropped, other spacing is tidied. */
export function removeSentence(text: string, sentence: CheckedSentence): string {
  const lineStart = text.lastIndexOf("\n", sentence.start - 1) + 1;
  const newline = text.indexOf("\n", sentence.end);
  const lineEnd = newline === -1 ? text.length : newline;
  const before = text.slice(lineStart, sentence.start).trimEnd();
  const after = text.slice(sentence.end, lineEnd).trimStart();

  if (before === "" && after === "") {
    const head =
      lineEnd === text.length
        ? text.slice(0, Math.max(lineStart - 1, 0))
        : text.slice(0, lineStart);
    return head + text.slice(Math.min(lineEnd + 1, text.length));
  }
  const joined = before !== "" && after !== "" ? `${before} ${after}` : `${before}${after}`;
  return text.slice(0, lineStart) + joined + text.slice(lineEnd);
}
