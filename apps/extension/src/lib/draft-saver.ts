import {
  type ContextAnswers,
  compileAnswers,
  publicAnswers,
  type StoredProfile,
} from "@slayply/core";
import { type AnswersStore, StaleAnswersError } from "./answers-store.js";
import { sanitizeAnswers, validateAnswers } from "./questionnaire-state.js";

export type SaveOutcome =
  | { status: "saved" }
  | { status: "unchanged" }
  | { status: "invalid"; errors: Record<string, string> }
  /** Saved, except for fields that failed validation and were left out of the stored copy. */
  | { status: "partial"; dropped: string[] }
  | { status: "stale"; message: string }
  | { status: "error"; message: string };

export type ApplyOutcome =
  | { status: "applied"; profile: StoredProfile; warnings: string[] }
  | Exclude<SaveOutcome, { status: "saved" | "unchanged" | "partial" }>;

/** Two copies are "the same" when everything but the revision matches. */
const fingerprint = (answers: ContextAnswers) => JSON.stringify({ ...answers, revision: 0 });

/**
 * Saves questionnaire drafts one at a time. It tracks the stored revision itself, so a field
 * edited while a save is running is picked up by the next save instead of racing it, and it
 * never writes a draft that fails validation or one that has not changed.
 */
export function createDraftSaver(
  store: AnswersStore,
  now: () => string = () => new Date().toISOString(),
) {
  let revision = 0;
  let lastSaved = "";
  let queue: Promise<unknown> = Promise.resolve();

  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  const failure = (error: unknown): { status: "stale" | "error"; message: string } => ({
    status: error instanceof StaleAnswersError ? "stale" : "error",
    message: error instanceof Error ? error.message : "Something went wrong.",
  });

  return {
    /** Call once with whatever was loaded (or fresh answers when nothing was stored). */
    init(loaded: ContextAnswers): void {
      revision = loaded.revision;
      lastSaved = fingerprint(loaded);
    },

    save(answers: ContextAnswers): Promise<SaveOutcome> {
      return serial(async () => {
        // One invalid field must not stop everything else from being saved.
        const sanitized = sanitizeAnswers(answers);
        if (!sanitized) return { status: "invalid", errors: validateAnswers(answers) };
        const { clean, dropped } = sanitized;
        const leftOut = (status: "saved" | "unchanged"): SaveOutcome =>
          dropped.length > 0 ? { status: "partial", dropped } : { status };
        if (fingerprint(clean) === lastSaved) return leftOut("unchanged");
        try {
          const saved = await store.saveDraft({ ...clean, revision });
          revision = saved.revision;
          lastSaved = fingerprint(saved);
          return leftOut("saved");
        } catch (error) {
          return failure(error);
        }
      });
    },

    /** Saves the answers and rebuilds the profile from them (the "Use these answers" step). */
    apply(answers: ContextAnswers): Promise<ApplyOutcome> {
      return serial(async () => {
        const errors = validateAnswers(answers);
        if (Object.keys(errors).length > 0) return { status: "invalid", errors };
        const compiled = compileAnswers(publicAnswers(answers));
        try {
          const result = await store.saveWithCompiled({ ...answers, revision }, compiled, now());
          revision = result.answers.revision;
          lastSaved = fingerprint(result.answers);
          return {
            status: "applied",
            profile: result.profile,
            warnings: [...compiled.warnings, ...result.warnings],
          };
        } catch (error) {
          return failure(error);
        }
      });
    },

    /** The revision a caller should show or store; mainly for tests. */
    get revision(): number {
      return revision;
    },
  };
}

export type DraftSaver = ReturnType<typeof createDraftSaver>;
