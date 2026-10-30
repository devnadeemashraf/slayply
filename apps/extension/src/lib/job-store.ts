import { JOB_STATUSES, type JobRecord, type JobStatus, jobRecordSchema } from "@slayply/core";
import type { IDBPDatabase } from "idb";
import { JOBS_STORE } from "./profile-store.js";

/** More than a job search needs; the least recently updated job goes first. */
export const JOB_LIMIT = 500;

export type JobDraft = Pick<
  JobRecord,
  "title" | "company" | "location" | "jd" | "resumeName" | "answers"
>;

/**
 * Saved jobs in IndexedDB, keyed by the job description's hash so saving the same posting again
 * updates it. A record that no longer matches the schema is skipped when listing.
 */
export function createJobStore(dbPromise: Promise<IDBPDatabase>) {
  return {
    async list(): Promise<JobRecord[]> {
      const db = await dbPromise;
      const records: unknown[] = await db.getAll(JOBS_STORE);
      return records
        .flatMap((record) => {
          const parsed = jobRecordSchema.safeParse(record);
          return parsed.success ? [parsed.data] : [];
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    /** New jobs start as "saved"; an existing job keeps its status and first save date. */
    async save(id: string, draft: JobDraft): Promise<void> {
      const db = await dbPromise;
      const tx = db.transaction(JOBS_STORE, "readwrite");
      const now = new Date().toISOString();
      const existing = jobRecordSchema.safeParse(await tx.store.get(id));
      const parsed = jobRecordSchema.safeParse({
        ...draft,
        // Saving before anything is generated must not erase answers saved earlier.
        answers:
          draft.answers.length === 0 && existing.success ? existing.data.answers : draft.answers,
        id,
        status: existing.success ? existing.data.status : "saved",
        savedAt: existing.success ? existing.data.savedAt : now,
        updatedAt: now,
      });
      if (!parsed.success) {
        tx.abort();
        await tx.done.catch(() => undefined);
        throw new Error("The job is not valid and was not saved.");
      }
      await tx.store.put(parsed.data);
      const overflow = (await tx.store.count()) - JOB_LIMIT;
      if (overflow > 0) {
        const all = (await tx.store.getAll()) as { id: string; updatedAt?: string }[];
        const oldest = all
          .sort((a, b) => (a.updatedAt ?? "").localeCompare(b.updatedAt ?? ""))
          .slice(0, overflow);
        for (const entry of oldest) await tx.store.delete(entry.id);
      }
      await tx.done;
    },

    async setStatus(id: string, status: JobStatus): Promise<void> {
      if (!JOB_STATUSES.includes(status)) throw new Error("That status is not valid.");
      const db = await dbPromise;
      const tx = db.transaction(JOBS_STORE, "readwrite");
      const existing = jobRecordSchema.safeParse(await tx.store.get(id));
      if (existing.success) {
        await tx.store.put({ ...existing.data, status, updatedAt: new Date().toISOString() });
      }
      await tx.done;
    },

    async remove(id: string): Promise<void> {
      const db = await dbPromise;
      await db.delete(JOBS_STORE, id);
    },
  };
}

export type JobStore = ReturnType<typeof createJobStore>;
