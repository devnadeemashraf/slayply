import type { JobRecord } from "@slayply/core";

export const MAX_PAST_ANSWERS = 3;
const MIN_SHARED = 2;
const MIN_SCORE = 0.5;
/** Only the start of a question is compared, so a pasted essay cannot make the lookup slow. */
const MAX_COMPARED_CHARS = 1_000;

export type PastAnswer = {
  jobId: string;
  company: string;
  title: string;
  question: string;
  text: string;
  score: number;
};

const NON_WORD = /[^\p{L}\p{N}]+/u;
const FILLER = new Set(
  "the and you your our are for with this that here what how can have has was will would does did any from about been them their they who which when where please tell describe".split(
    " ",
  ),
);

function words(text: string): Set<string> {
  const found = new Set<string>();
  for (const word of text.slice(0, MAX_COMPARED_CHARS).toLowerCase().split(NON_WORD)) {
    if (word.length >= 3 && !FILLER.has(word)) found.add(word);
  }
  return found;
}

/**
 * Earlier answers to a similar question, best first, newest first among equals. Matching is local
 * word overlap (nothing is sent anywhere); `excludeJobId` is the job being worked on.
 */
export function findPastAnswers(
  question: string,
  jobs: readonly JobRecord[],
  excludeJobId: string,
): PastAnswer[] {
  const wanted = words(question);
  if (wanted.size === 0) return [];
  const hits: (PastAnswer & { at: string })[] = [];
  for (const job of jobs) {
    if (job.id === excludeJobId) continue;
    for (const answer of job.answers) {
      if (answer.text.trim() === "") continue;
      const other = words(answer.question);
      let shared = 0;
      for (const word of wanted) if (other.has(word)) shared++;
      const score = shared / (wanted.size + other.size - shared);
      // A short question ("Why us?") has one meaningful word, so an identical word set also counts.
      const same = shared >= 1 && shared === wanted.size && shared === other.size;
      if ((shared >= MIN_SHARED || same) && score >= MIN_SCORE) {
        hits.push({
          jobId: job.id,
          company: job.company,
          title: job.title,
          question: answer.question,
          text: answer.text,
          score,
          at: job.updatedAt,
        });
      }
    }
  }
  return hits
    .sort((a, b) => b.score - a.score || b.at.localeCompare(a.at))
    .slice(0, MAX_PAST_ANSWERS)
    .map(({ at: _at, ...hit }) => hit);
}
