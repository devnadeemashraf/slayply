import { parseStoredProfile, type StoredProfile } from "@slayply/core";
import { type IDBPDatabase, openDB } from "idb";

const DB_VERSION = 1;
const STORE = "profile";
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

/** Opens the extension database. Later items (resumes, history) add stores in `upgrade`. */
export function openProfileDb(name = "slayply"): Promise<IDBPDatabase> {
  return openDB(name, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    },
  });
}

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
      const existing: unknown = await tx.store.get(KEY);
      if (existing !== undefined) {
        const stored = parseStoredProfile(existing);
        if (!stored.success) throw new ProfileCorruptError();
        if (
          stored.data.nextFact > checked.data.nextFact ||
          stored.data.nextStory > checked.data.nextStory
        ) {
          throw new StaleProfileError();
        }
      }
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
