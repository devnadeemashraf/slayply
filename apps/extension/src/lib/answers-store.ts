import {
  type CompiledContext,
  type ContextAnswers,
  mergeCompiledContext,
  parseContextAnswers,
  parseStoredProfile,
  type StoredProfile,
} from "@slayply/core";
import type { IDBPDatabase } from "idb";
import { ANSWERS_STORE, PROFILE_STORE, ProfileCorruptError, RECORD_KEY } from "./profile-store.js";

/** The stored answers exist but do not match the schema. Loading stops so nothing overwrites them. */
export class AnswersCorruptError extends Error {
  constructor() {
    super("Your saved answers could not be read. You can discard them and start again.");
    this.name = "AnswersCorruptError";
  }
}

/** Another window saved these answers since this copy was loaded (ADR-0008). */
export class StaleAnswersError extends Error {
  constructor() {
    super("Your answers changed in another window. Reload the panel and try again.");
    this.name = "StaleAnswersError";
  }
}

function readStored(existing: unknown): ContextAnswers | null {
  if (existing === undefined) return null;
  const parsed = parseContextAnswers(existing);
  if (!parsed.success) throw new AnswersCorruptError();
  return parsed.data;
}

function readProfile(existing: unknown): StoredProfile | null {
  if (existing === undefined) return null;
  const parsed = parseStoredProfile(existing);
  if (!parsed.success) throw new ProfileCorruptError();
  return parsed.data;
}

/**
 * Questionnaire answers live in their own record. A save succeeds only if the stored revision is
 * the one the caller loaded (0 when nothing is stored), then writes revision + 1.
 */
export function createAnswersStore(dbPromise: Promise<IDBPDatabase>) {
  return {
    async load(): Promise<ContextAnswers | null> {
      const db = await dbPromise;
      return readStored(await db.get(ANSWERS_STORE, RECORD_KEY));
    },

    /** Saves a draft. The compiled profile is not touched. Returns the saved copy. */
    async saveDraft(answers: ContextAnswers): Promise<ContextAnswers> {
      const checked = parseContextAnswers(answers);
      if (!checked.success) throw new Error("The answers are not valid and were not saved.");
      const db = await dbPromise;
      const tx = db.transaction(ANSWERS_STORE, "readwrite");
      const stored = readStored(await tx.store.get(RECORD_KEY));
      if ((stored?.revision ?? 0) !== checked.data.revision) throw new StaleAnswersError();
      const next = { ...checked.data, revision: checked.data.revision + 1 };
      await tx.store.put(next, RECORD_KEY);
      await tx.done;
      return next;
    },

    /**
     * Saves the answers and merges their compiled output into the stored profile in ONE
     * transaction. The merge runs against the profile as it is stored right now, so a save from a
     * stale window cannot bring back an item removed (or revert an edit made) elsewhere.
     */
    async saveWithCompiled(
      answers: ContextAnswers,
      compiled: CompiledContext,
      now: string,
    ): Promise<{ answers: ContextAnswers; profile: StoredProfile; warnings: string[] }> {
      const checkedAnswers = parseContextAnswers(answers);
      if (!checkedAnswers.success) throw new Error("The answers are not valid and were not saved.");
      const db = await dbPromise;
      const tx = db.transaction([ANSWERS_STORE, PROFILE_STORE], "readwrite");
      const stored = readStored(await tx.objectStore(ANSWERS_STORE).get(RECORD_KEY));
      if ((stored?.revision ?? 0) !== checkedAnswers.data.revision) throw new StaleAnswersError();
      const rawProfile: unknown = await tx.objectStore(PROFILE_STORE).get(RECORD_KEY);
      const base = readProfile(rawProfile);
      const merged = mergeCompiledContext(base, compiled, now);
      if (!merged.ok) throw new Error(merged.message);
      const next = { ...checkedAnswers.data, revision: checkedAnswers.data.revision + 1 };
      await tx.objectStore(ANSWERS_STORE).put(next, RECORD_KEY);
      await tx.objectStore(PROFILE_STORE).put(merged.profile, RECORD_KEY);
      await tx.done;
      return { answers: next, profile: merged.profile, warnings: merged.warnings };
    },

    /**
     * Deletes the answers AND the items built from them, in one transaction, so nothing built
     * from deleted answers keeps being sent. Imported and typed items stay.
     */
    async discard(): Promise<void> {
      const db = await dbPromise;
      const tx = db.transaction([ANSWERS_STORE, PROFILE_STORE], "readwrite");
      const rawProfile: unknown = await tx.objectStore(PROFILE_STORE).get(RECORD_KEY);
      if (rawProfile !== undefined) {
        const merged = mergeCompiledContext(
          readProfile(rawProfile),
          { facts: [], stories: [], prefs: {}, rules: [] },
          new Date().toISOString(),
        );
        if (!merged.ok) throw new Error(merged.message);
        await tx.objectStore(PROFILE_STORE).put(merged.profile, RECORD_KEY);
      }
      await tx.objectStore(ANSWERS_STORE).delete(RECORD_KEY);
      await tx.done;
    },
  };
}

export type AnswersStore = ReturnType<typeof createAnswersStore>;
