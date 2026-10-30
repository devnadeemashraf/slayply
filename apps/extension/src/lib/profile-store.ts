import { parseStoredProfile, type StoredProfile } from "@slayply/core";
import { type IDBPDatabase, openDB } from "idb";

const DB_VERSION = 5;
const STORE = "profile";
export const ANSWERS_STORE = "answers";
export const RESUMES_STORE = "resumes";
export const FITS_STORE = "fits";
export const JOBS_STORE = "jobs";
const KEY = "current";

/** The stored record exists but does not match the schema. Loading stops so nothing overwrites it. */
export class ProfileCorruptError extends Error {
  constructor() {
    super(
      "The saved profile could not be read. You can discard it and import your context pack again.",
    );
    this.name = "ProfileCorruptError";
  }
}

/** Another window saved newer data (higher ID counters); saving this copy would reuse retired IDs. */
export class StaleProfileError extends Error {
  constructor() {
    super("Your profile changed in another window. Reload the panel and try again.");
    this.name = "StaleProfileError";
  }
}

/**
 * Opens the extension database. Each version adds stores and never touches existing records:
 * version 1 has `profile`, version 2 adds `answers`, version 3 adds `resumes`, version 4 adds `fits`, version 5 adds `jobs`. Later items add more.
 */
export function openProfileDb(name = "slayply"): Promise<IDBPDatabase> {
  return openDB(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) db.createObjectStore(STORE);
      if (oldVersion < 2) db.createObjectStore(ANSWERS_STORE);
      if (oldVersion < 3) db.createObjectStore(RESUMES_STORE, { keyPath: "id" });
      if (oldVersion < 4) db.createObjectStore(FITS_STORE, { keyPath: "key" });
      if (oldVersion < 5) db.createObjectStore(JOBS_STORE, { keyPath: "id" });
    },
  });
}

/**
 * Throws if writing `incoming` over `existing` would lose data: an unreadable record, or ID
 * counters older than the stored ones (which would hand out a retired ID again).
 */
export function assertProfileWritable(existing: unknown, incoming: StoredProfile): void {
  if (existing === undefined) return;
  const stored = parseStoredProfile(existing);
  if (!stored.success) throw new ProfileCorruptError();
  if (stored.data.nextFact > incoming.nextFact || stored.data.nextStory > incoming.nextStory) {
    throw new StaleProfileError();
  }
}

export { KEY as RECORD_KEY, STORE as PROFILE_STORE };

/** Every object store in the database. Export, import and wipe all walk this list. */
export const STORE_NAMES = [STORE, ANSWERS_STORE, RESUMES_STORE, FITS_STORE, JOBS_STORE] as const;

/** The whole profile is one record, so a save is atomic: it is either fully replaced or not at all. */
export function createProfileStore(dbPromise: Promise<IDBPDatabase>) {
  return {
    async load(): Promise<StoredProfile | null> {
      const db = await dbPromise;
      const record: unknown = await db.get(STORE, KEY);
      if (record === undefined) return null;
      const parsed = parseStoredProfile(record);
      if (!parsed.success) throw new ProfileCorruptError();
      return parsed.data;
    },

    /**
     * Checks and writes in one transaction. It never replaces an unreadable record and never
     * lets a copy with older ID counters win, because that would hand out a retired ID again.
     */
    async save(profile: StoredProfile): Promise<void> {
      const checked = parseStoredProfile(profile);
      if (!checked.success) throw new Error("The profile is not valid and was not saved.");
      const db = await dbPromise;
      const tx = db.transaction(STORE, "readwrite");
      assertProfileWritable(await tx.store.get(KEY), checked.data);
      await tx.store.put(checked.data, KEY);
      await tx.done;
    },

    /** Deletes the record. Only for an unreadable profile, after the user agrees to start over. */
    async discard(): Promise<void> {
      const db = await dbPromise;
      await db.delete(STORE, KEY);
    },
  };
}

export type ProfileStore = ReturnType<typeof createProfileStore>;
