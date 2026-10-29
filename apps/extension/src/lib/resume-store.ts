import { resumeTagSchema, type StoredResume, storedResumeSchema } from "@slayply/core";
import type { IDBPDatabase } from "idb";
import { RESUMES_STORE } from "./profile-store.js";

/** A saved resume does not match the schema. Listing stops so nothing hides or overwrites it. */
export class ResumeCorruptError extends Error {
  constructor() {
    super("A saved resume could not be read. Remove it from the browser's site data to continue.");
    this.name = "ResumeCorruptError";
  }
}

export type NewResume = {
  name: string;
  track: string;
  region: string;
  text: string;
  pageCount: number;
  truncated: boolean;
};

export type ResumeTags = { track: string; region: string };

function parseStored(record: unknown): StoredResume {
  const parsed = storedResumeSchema.safeParse(record);
  if (!parsed.success) throw new ResumeCorruptError();
  return parsed.data;
}

/**
 * Resumes live in IndexedDB as extracted text only; the PDF itself is never kept. IDs are random,
 * so two windows can add resumes without a shared counter.
 */
export function createResumeStore(dbPromise: Promise<IDBPDatabase>) {
  return {
    /** Newest first. */
    async list(): Promise<StoredResume[]> {
      const db = await dbPromise;
      const records: unknown[] = await db.getAll(RESUMES_STORE);
      return records.map(parseStored).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async add(input: NewResume): Promise<StoredResume> {
      const parsed = storedResumeSchema.safeParse({
        ...input,
        id: crypto.randomUUID(),
        charCount: input.text.trim().length,
        createdAt: new Date().toISOString(),
      });
      if (!parsed.success) throw new Error("The resume is not valid and was not saved.");
      const db = await dbPromise;
      await db.add(RESUMES_STORE, parsed.data);
      return parsed.data;
    },

    async retag(id: string, tags: ResumeTags): Promise<void> {
      const track = resumeTagSchema.safeParse(tags.track);
      const region = resumeTagSchema.safeParse(tags.region);
      if (!track.success || !region.success) {
        throw new Error("The track or region is not valid and was not saved.");
      }
      const db = await dbPromise;
      const tx = db.transaction(RESUMES_STORE, "readwrite");
      const record: unknown = await tx.store.get(id);
      if (record === undefined) throw new Error("That resume was not found.");
      await tx.store.put({ ...parseStored(record), track: track.data, region: region.data });
      await tx.done;
    },

    async remove(id: string): Promise<void> {
      const db = await dbPromise;
      await db.delete(RESUMES_STORE, id);
    },
  };
}

export type ResumeStore = ReturnType<typeof createResumeStore>;
