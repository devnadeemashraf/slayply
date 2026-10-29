import { type FitCacheEntry, fitCacheEntrySchema } from "@slayply/core";
import type { IDBPDatabase } from "idb";
import { FITS_STORE } from "./profile-store.js";

/** More than a job search needs at once; the oldest results go first so the store cannot grow forever. */
export const FIT_CACHE_LIMIT = 100;

const CRLF = /\r\n?/g;

export type CachedFit = Pick<FitCacheEntry, "fit" | "profile">;

/** Same job description (ignoring line endings and outer whitespace) gives the same key. */
export async function fitKey(jd: string): Promise<string> {
  const bytes = new TextEncoder().encode(jd.replace(CRLF, "\n").trim());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * One fit result per job, in IndexedDB (SPEC Feature 4: runs once per job and is cached). A record
 * that no longer matches the schema is a cache miss, never an error: the check can simply run again.
 */
export function createFitStore(dbPromise: Promise<IDBPDatabase>) {
  return {
    async get(key: string): Promise<CachedFit | null> {
      const db = await dbPromise;
      const record: unknown = await db.get(FITS_STORE, key);
      const parsed = fitCacheEntrySchema.safeParse(record);
      return parsed.success ? { fit: parsed.data.fit, profile: parsed.data.profile } : null;
    },

    async put(key: string, value: CachedFit): Promise<void> {
      const parsed = fitCacheEntrySchema.safeParse({
        key,
        ...value,
        createdAt: new Date().toISOString(),
      });
      if (!parsed.success) throw new Error("The fit result is not valid and was not saved.");
      const db = await dbPromise;
      const tx = db.transaction(FITS_STORE, "readwrite");
      await tx.store.put(parsed.data);
      const overflow = (await tx.store.count()) - FIT_CACHE_LIMIT;
      if (overflow > 0) {
        const all: { key: string; createdAt?: string }[] = await tx.store.getAll();
        const oldest = all
          .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
          .slice(0, overflow);
        for (const entry of oldest) await tx.store.delete(entry.key);
      }
      await tx.done;
    },

    async count(): Promise<number> {
      const db = await dbPromise;
      return db.count(FITS_STORE);
    },
  };
}

export type FitStore = ReturnType<typeof createFitStore>;
