import { z } from "zod";
import { LIMITS } from "./limits.js";
import { type FitCheck, factSchema, fitCheckSchema, type Profile, storySchema } from "./schema.js";

type CitableProfile = Pick<Profile, "facts" | "stories">;

/** A cached fit result with the fact text it was checked against (an in-app edit keeps the ID). */
export const fitCacheEntrySchema = z.object({
  key: z.string().min(1).max(128),
  fit: fitCheckSchema,
  profile: z.object({
    facts: z.array(factSchema).max(LIMITS.maxFacts),
    stories: z.array(storySchema).max(LIMITS.maxStories),
  }),
  createdAt: z.iso.datetime(),
});
export type FitCacheEntry = z.infer<typeof fitCacheEntrySchema>;

export type CheckedMatch = {
  match: FitCheck["matches"][number];
  /** `cited` when at least one listed ID is in the profile that was sent; otherwise `uncited`. */
  status: "cited" | "uncited";
  /** Listed IDs that are not in the profile that was sent with the request. */
  invalidIds: string[];
  /** The fact text in force when the request was sent, for each valid listed ID. */
  cited: { id: string; text: string }[];
};

/**
 * Checks each "you have" row against the profile that was sent. Fails toward flagging: a row
 * with no valid ID is `uncited`, so the panel can say the model's claim has no backing fact.
 */
export function checkFitMatches(fit: FitCheck, profile: CitableProfile): CheckedMatch[] {
  const sources = new Map<string, string>();
  for (const entry of [...profile.facts, ...profile.stories]) sources.set(entry.id, entry.text);

  return fit.matches.map((match) => {
    const cited: CheckedMatch["cited"] = [];
    const invalidIds: string[] = [];
    for (const id of new Set(match.factIds)) {
      const text = sources.get(id);
      if (text === undefined) invalidIds.push(id);
      else cited.push({ id, text });
    }
    return { match, status: cited.length > 0 ? "cited" : "uncited", invalidIds, cited };
  });
}

type ResumeTags = { id: string; track: string; region: string; createdAt: string };

function tagKey(tag: string): string {
  return tag.normalize("NFKC").trim().toLowerCase();
}

/**
 * The saved resume that best fits the recommended track and region: same track and region, else
 * same track. Newest wins a tie. `null` when no resume has that track; the user can always pick.
 */
export function suggestResume<T extends ResumeTags>(
  recommended: { track: string; region: string },
  resumes: readonly T[],
): T | null {
  const track = tagKey(recommended.track);
  const region = tagKey(recommended.region);
  const sameTrack = resumes
    .filter((resume) => tagKey(resume.track) === track)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return sameTrack.find((resume) => tagKey(resume.region) === region) ?? sameTrack[0] ?? null;
}
