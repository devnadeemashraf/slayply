import {
  type ContextAnswers,
  type FitCacheEntry,
  fitCacheEntrySchema,
  parseContextAnswers,
  parseStoredProfile,
  type StoredProfile,
  type StoredResume,
  storedResumeSchema,
} from "@slayply/core";
import type { IDBPDatabase } from "idb";
import { FIT_CACHE_LIMIT } from "./fit-store.js";
import {
  ANSWERS_STORE,
  FITS_STORE,
  PROFILE_STORE,
  RECORD_KEY,
  RESUMES_STORE,
  STORE_NAMES,
} from "./profile-store.js";
import type { SettingsStore } from "./settings.js";
import { REMEMBERED_RESUME_KEY } from "./storage-keys.js";

export const BACKUP_FORMAT = "slayply-backup";
export const BACKUP_VERSION = 1;
/** Characters, not bytes: a file this long is refused before it is parsed. */
export const BACKUP_MAX_CHARS = 25_000_000;
export const BACKUP_MAX_RESUMES = 200;

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  profile: StoredProfile | null;
  answers: ContextAnswers | null;
  resumes: StoredResume[];
  fits: FitCacheEntry[];
};

export type ImportResult =
  | { ok: true; resumes: number; fits: number }
  | { ok: false; message: string };

type Envelope = {
  exportedAt: string;
  profile: unknown;
  answers: unknown;
  resumes: unknown[];
  fits: unknown[];
};

const ENVELOPE_KEYS = ["format", "version", "exportedAt", "profile", "answers", "resumes", "fits"];

// Each part is validated again by its own parser below; the envelope only fixes the shape and caps.
// Unknown keys are refused, which also rejects a hostile `__proto__` entry.
function readEnvelope(json: unknown): Envelope | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const record = json as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== ENVELOPE_KEYS.length || !ENVELOPE_KEYS.every((key) => keys.includes(key))) {
    return null;
  }
  const { format, version, exportedAt, profile, answers, resumes, fits } = record;
  if (format !== BACKUP_FORMAT || version !== BACKUP_VERSION) return null;
  if (typeof exportedAt !== "string" || Number.isNaN(Date.parse(exportedAt))) return null;
  if (!Array.isArray(resumes) || resumes.length > BACKUP_MAX_RESUMES) return null;
  if (!Array.isArray(fits) || fits.length > FIT_CACHE_LIMIT) return null;
  return { exportedAt, profile, answers, resumes, fits };
}

/**
 * Reads every store in one transaction. The API key and the privacy acknowledgement are not
 * exported: a backup file is meant to be kept and moved between devices, and consent is per device.
 * A profile, answers or resume that no longer matches the schema stops the export, because a
 * backup that silently drops it would look complete and not be. Fit results are only a cache, so
 * an unreadable one is left out.
 */
export async function exportBackup(
  dbPromise: Promise<IDBPDatabase>,
  now = new Date().toISOString(),
): Promise<Backup> {
  const db = await dbPromise;
  const tx = db.transaction([...STORE_NAMES], "readonly");
  const [profileRaw, answersRaw, resumesRaw, fitsRaw] = await Promise.all([
    tx.objectStore(PROFILE_STORE).get(RECORD_KEY) as Promise<unknown>,
    tx.objectStore(ANSWERS_STORE).get(RECORD_KEY) as Promise<unknown>,
    tx.objectStore(RESUMES_STORE).getAll() as Promise<unknown[]>,
    tx.objectStore(FITS_STORE).getAll() as Promise<unknown[]>,
  ]);
  await tx.done;

  let profile: StoredProfile | null = null;
  if (profileRaw !== undefined) {
    const parsed = parseStoredProfile(profileRaw);
    if (!parsed.success) {
      throw new Error("The saved profile could not be read, so nothing was exported.");
    }
    profile = parsed.data;
  }
  let answers: ContextAnswers | null = null;
  if (answersRaw !== undefined) {
    const parsed = parseContextAnswers(answersRaw);
    if (!parsed.success) {
      throw new Error("The saved answers could not be read, so nothing was exported.");
    }
    answers = parsed.data;
  }
  const resumes = resumesRaw.map((record) => {
    const parsed = storedResumeSchema.safeParse(record);
    if (!parsed.success) {
      throw new Error("A saved resume could not be read, so nothing was exported.");
    }
    return parsed.data;
  });
  const fits = fitsRaw.flatMap((record) => {
    const parsed = fitCacheEntrySchema.safeParse(record);
    return parsed.success ? [parsed.data] : [];
  });

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    profile,
    answers,
    resumes,
    fits,
  };
}

export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup, null, 2);
}

type Parsed = { ok: true; backup: Backup } | { ok: false; message: string };

function hasDuplicates(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

/** Everything is checked before the first write; messages never repeat file content. */
function parseBackup(text: string): Parsed {
  const fail = (message: string): Parsed => ({ ok: false, message });
  if (text.length > BACKUP_MAX_CHARS) return fail("That file is too large to be a Slayply backup.");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail("That file is not valid JSON.");
  }
  const envelope = readEnvelope(json);
  if (!envelope) return fail("That file is not a Slayply backup this version can read.");
  const { exportedAt } = envelope;

  let profile: StoredProfile | null = null;
  if (envelope.profile !== null) {
    const parsed = parseStoredProfile(envelope.profile);
    if (!parsed.success)
      return fail("The profile in that file is not valid; nothing was imported.");
    profile = parsed.data;
  }
  let answers: ContextAnswers | null = null;
  if (envelope.answers !== null) {
    const parsed = parseContextAnswers(envelope.answers);
    if (!parsed.success)
      return fail("The answers in that file are not valid; nothing was imported.");
    answers = parsed.data;
  }
  const resumes: StoredResume[] = [];
  for (const record of envelope.resumes) {
    const parsed = storedResumeSchema.safeParse(record);
    if (!parsed.success) return fail("A resume in that file is not valid; nothing was imported.");
    resumes.push(parsed.data);
  }
  const fits: FitCacheEntry[] = [];
  for (const record of envelope.fits) {
    const parsed = fitCacheEntrySchema.safeParse(record);
    if (!parsed.success)
      return fail("A job result in that file is not valid; nothing was imported.");
    fits.push(parsed.data);
  }
  if (hasDuplicates(resumes.map((r) => r.id)) || hasDuplicates(fits.map((f) => f.key))) {
    return fail("That file repeats an entry; nothing was imported.");
  }

  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt,
      profile,
      answers,
      resumes,
      fits,
    },
  };
}

/**
 * Replaces all stored data with the file's, in one transaction: either every store is replaced or
 * none is. A restore is a replacement, not a merge, so it cannot bring back items removed since.
 */
export async function importBackup(
  dbPromise: Promise<IDBPDatabase>,
  text: string,
): Promise<ImportResult> {
  const parsed = parseBackup(text);
  if (!parsed.ok) return parsed;
  const { backup } = parsed;

  const db = await dbPromise;
  const tx = db.transaction([...STORE_NAMES], "readwrite");
  // Attached now so a failure before `await tx.done` is never reported as unhandled.
  const finished = tx.done.catch(() => undefined);
  try {
    await Promise.all(STORE_NAMES.map((name) => tx.objectStore(name).clear()));
    if (backup.profile) await tx.objectStore(PROFILE_STORE).put(backup.profile, RECORD_KEY);
    if (backup.answers) await tx.objectStore(ANSWERS_STORE).put(backup.answers, RECORD_KEY);
    for (const resume of backup.resumes) await tx.objectStore(RESUMES_STORE).put(resume);
    for (const fit of backup.fits) await tx.objectStore(FITS_STORE).put(fit);
    await tx.done;
  } catch {
    try {
      tx.abort();
    } catch {
      // Already finished or aborted.
    }
    await finished;
    return { ok: false, message: "The backup could not be written; nothing was changed." };
  }
  return { ok: true, resumes: backup.resumes.length, fits: backup.fits.length };
}

/**
 * Clears the stored settings (API key included), the remembered resume choice and every store.
 * The key goes first because it is the most sensitive item, and every step runs even if an earlier
 * one fails; the first failure is then thrown so the caller can say the wipe was incomplete.
 */
export async function wipeLocalData(
  dbPromise: Promise<IDBPDatabase>,
  settings: SettingsStore,
  local: Pick<Storage, "removeItem"> = localStorage,
): Promise<void> {
  const failures: unknown[] = [];
  const attempt = async (step: () => Promise<void> | void) => {
    try {
      await step();
    } catch (error) {
      failures.push(error);
    }
  };

  await attempt(() => settings.wipe());
  await attempt(() => local.removeItem(REMEMBERED_RESUME_KEY));
  await attempt(async () => {
    const db = await dbPromise;
    const tx = db.transaction([...STORE_NAMES], "readwrite");
    await Promise.all(STORE_NAMES.map((name) => tx.objectStore(name).clear()));
    await tx.done;
  });

  if (failures.length > 0) {
    throw new Error("Some data could not be deleted. Reload the panel and try again.");
  }
}
