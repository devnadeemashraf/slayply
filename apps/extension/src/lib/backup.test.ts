import "fake-indexeddb/auto";
import {
  emptyAnswers,
  type FitCheck,
  parseContextPack,
  reconcileProfile,
  type StoredProfile,
} from "@slayply/core";
import { describe, expect, it } from "vitest";
import { createAnswersStore } from "./answers-store.js";
import {
  BACKUP_MAX_CHARS,
  exportBackup,
  importBackup,
  serializeBackup,
  wipeLocalData,
} from "./backup.js";
import { createFitStore } from "./fit-store.js";
import { createProfileStore, openProfileDb, STORE_NAMES } from "./profile-store.js";
import { createResumeStore } from "./resume-store.js";
import { createSettingsStore, type StorageAreaLike } from "./settings.js";
import { REMEMBERED_RESUME_KEY } from "./storage-keys.js";

let counter = 0;
const freshDb = () => openProfileDb(`slayply-backup-test-${++counter}`);

const NOW = "2026-10-29T00:00:00.000Z";
const PACK =
  "## Facts\n- Built a thing\n- Shipped a thing\n## Stories\n- A story\n## Rules\n- A rule";
const FIT: FitCheck = {
  matches: [{ want: "Billing", have: "Built billing", factIds: ["F01"] }],
  gaps: ["Rust"],
  chance: "medium",
  reason: "Close.",
  resume: { track: "sde", region: "us" },
  dealBreakers: [],
};
const RESUME = {
  name: "cv.pdf",
  track: "sde",
  region: "us",
  text: "Built things.",
  pageCount: 1,
  truncated: false,
};

function profile(): StoredProfile {
  const result = reconcileProfile(null, parseContextPack(PACK), NOW);
  if (!result.ok) throw new Error(result.message);
  return result.profile;
}

async function fill(db: ReturnType<typeof freshDb>) {
  const stored = profile();
  await createProfileStore(db).save(stored);
  await createAnswersStore(db).saveDraft({
    ...emptyAnswers(),
    private: { email: "me@example.com" },
  });
  const resume = await createResumeStore(db).add(RESUME);
  await createFitStore(db).put("job-1", {
    fit: FIT,
    profile: {
      facts: stored.facts.map(({ id, text }) => ({ id, text })),
      stories: stored.stories.map(({ id, text }) => ({ id, text })),
    },
  });
  return { stored, resume };
}

async function snapshot(db: ReturnType<typeof freshDb>) {
  const open = await db;
  const out: Record<string, unknown[]> = {};
  for (const name of STORE_NAMES) out[name] = await open.getAll(name);
  return out;
}

function memoryArea(initial: Record<string, unknown> = {}): StorageAreaLike & {
  data: Record<string, unknown>;
} {
  const data = { ...initial };
  return {
    data,
    async get(key) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(items) {
      Object.assign(data, items);
    },
    async remove(key) {
      delete data[key];
    },
  };
}

describe("STORE_NAMES", () => {
  it("lists every object store, so export and wipe cannot miss a new one", async () => {
    const db = await freshDb();
    expect([...db.objectStoreNames].sort()).toEqual([...STORE_NAMES].sort());
  });
});

describe("export and import", () => {
  it("round-trips everything into an empty database", async () => {
    const source = freshDb();
    await fill(source);
    const text = serializeBackup(await exportBackup(source, NOW));

    const target = freshDb();
    const result = await importBackup(target, text);
    expect(result).toEqual({ ok: true, resumes: 1, fits: 1 });
    expect(await snapshot(target)).toEqual(await snapshot(source));
  });

  it("exports an empty database as a valid, importable file", async () => {
    const text = serializeBackup(await exportBackup(freshDb(), NOW));
    expect(JSON.parse(text)).toMatchObject({
      format: "slayply-backup",
      version: 1,
      profile: null,
      answers: null,
      resumes: [],
      fits: [],
    });
    expect((await importBackup(freshDb(), text)).ok).toBe(true);
  });

  it("replaces what is already stored instead of merging", async () => {
    const source = freshDb();
    await fill(source);
    const text = serializeBackup(await exportBackup(source, NOW));

    const target = freshDb();
    await createResumeStore(target).add({ ...RESUME, name: "old.pdf" });
    await importBackup(target, text);
    const names = (await createResumeStore(target).list()).map((resume) => resume.name);
    expect(names).toEqual(["cv.pdf"]);
  });

  it("never carries the API key or the privacy acknowledgement", async () => {
    const source = freshDb();
    await fill(source);
    const text = serializeBackup(await exportBackup(source, NOW));
    expect(text).not.toMatch(/anthropicKey|privacyAcknowledged|sk-ant/);
  });

  it("refuses to export a profile that no longer matches the schema", async () => {
    const db = freshDb();
    await (await db).put("profile", { broken: true }, "current");
    await expect(exportBackup(db, NOW)).rejects.toThrow(/profile/i);
  });

  it("skips a fit result that no longer matches the schema (it is only a cache)", async () => {
    const db = freshDb();
    await fill(db);
    await (await db).put("fits", { key: "bad", fit: "nope" });
    const backup = await exportBackup(db, NOW);
    expect(backup.fits.map((entry) => entry.key)).toEqual(["job-1"]);
  });
});

describe("hostile and malformed imports", () => {
  async function validText() {
    const db = freshDb();
    await fill(db);
    return serializeBackup(await exportBackup(db, NOW));
  }

  async function expectRejected(text: string) {
    const target = freshDb();
    const before = await fill(target);
    const snapshotBefore = await snapshot(target);
    const result = await importBackup(target, text);
    expect(result.ok).toBe(false);
    expect(await snapshot(target)).toEqual(snapshotBefore);
    return before;
  }

  it("rejects text that is not JSON", async () => {
    await expectRejected("not json {");
  });

  it("rejects JSON that is not a Slayply backup", async () => {
    await expectRejected(JSON.stringify({ hello: "world" }));
    await expectRejected("[]");
    await expectRejected("null");
  });

  it("rejects a newer or unknown version", async () => {
    const parsed = JSON.parse(await validText());
    await expectRejected(JSON.stringify({ ...parsed, version: 2 }));
  });

  it("rejects an invalid resume and keeps the existing data untouched", async () => {
    const parsed = JSON.parse(await validText());
    parsed.resumes[0].track = "a\nb";
    await expectRejected(JSON.stringify(parsed));
  });

  it("rejects an invalid profile even when the other parts are valid", async () => {
    const parsed = JSON.parse(await validText());
    parsed.profile = { facts: "x" };
    await expectRejected(JSON.stringify(parsed));
  });

  it("rejects an unknown extra top-level field", async () => {
    const parsed = JSON.parse(await validText());
    await expectRejected(JSON.stringify({ ...parsed, extra: 1 }));
  });

  it("rejects duplicate resume ids and duplicate fit keys", async () => {
    const parsed = JSON.parse(await validText());
    await expectRejected(
      JSON.stringify({ ...parsed, resumes: [parsed.resumes[0], parsed.resumes[0]] }),
    );
    await expectRejected(JSON.stringify({ ...parsed, fits: [parsed.fits[0], parsed.fits[0]] }));
  });

  it("rejects too many resumes", async () => {
    const parsed = JSON.parse(await validText());
    const many = Array.from({ length: 201 }, (_, index) => ({
      ...parsed.resumes[0],
      id: `r${index}`,
    }));
    await expectRejected(JSON.stringify({ ...parsed, resumes: many }));
  });

  it("rejects a file over the size cap without parsing it", async () => {
    await expectRejected(" ".repeat(BACKUP_MAX_CHARS + 1));
  });

  it("does not pollute prototypes from a __proto__ key", async () => {
    const text = (await validText()).replace(/^\{/, '{"__proto__":{"polluted":true},');
    const target = freshDb();
    await importBackup(target, text);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("writes nothing when the transaction fails part-way", async () => {
    const source = freshDb();
    await fill(source);
    const text = serializeBackup(await exportBackup(source, NOW));

    const target = freshDb();
    await createResumeStore(target).add({ ...RESUME, name: "keep.pdf" });
    const before = await snapshot(target);
    // A resume keyed by an object cannot be stored; the put throws inside the transaction.
    const db = await target;
    const realPut = IDBObjectStore.prototype.put;
    let calls = 0;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof realPut>) {
      calls += 1;
      if (calls === 3) throw new Error("disk full");
      return realPut.apply(this, args);
    };
    try {
      const result = await importBackup(Promise.resolve(db), text);
      expect(result.ok).toBe(false);
    } finally {
      IDBObjectStore.prototype.put = realPut;
    }
    expect(await snapshot(target)).toEqual(before);
  });
});

describe("wipeLocalData", () => {
  it("leaves no records in any store and no stored settings", async () => {
    const db = freshDb();
    await fill(db);
    const area = memoryArea();
    const settings = createSettingsStore(area);
    await settings.saveKey("sk-ant-abc123");
    await settings.acknowledgePrivacy();

    await wipeLocalData(db, settings, { removeItem() {} });

    for (const records of Object.values(await snapshot(db))) expect(records).toEqual([]);
    expect(area.data).toEqual({});
    expect(await settings.load()).toEqual({ anthropicKey: "", privacyAcknowledged: false });
  });

  it("removes the remembered resume choice from browser storage", async () => {
    const removed: string[] = [];
    await wipeLocalData(freshDb(), createSettingsStore(memoryArea()), {
      removeItem: (key) => void removed.push(key),
    });
    expect(removed).toEqual([REMEMBERED_RESUME_KEY]);
  });

  it("still wipes the database when the key cannot be removed, then reports the failure", async () => {
    const db = freshDb();
    await fill(db);
    const area = memoryArea();
    area.remove = async () => {
      throw new Error("storage unavailable");
    };
    await expect(wipeLocalData(db, createSettingsStore(area), { removeItem() {} })).rejects.toThrow(
      /could not be deleted/,
    );
    for (const records of Object.values(await snapshot(db))) expect(records).toEqual([]);
  });

  it("still removes the key when the database cannot be cleared, then reports the failure", async () => {
    const area = memoryArea();
    const settings = createSettingsStore(area);
    await settings.saveKey("sk-ant-abc123");
    const broken = Promise.reject(new Error("no database"));
    broken.catch(() => undefined);
    await expect(wipeLocalData(broken, settings, { removeItem() {} })).rejects.toThrow(
      /could not be deleted/,
    );
    expect(area.data).toEqual({});
  });

  it("works on an already empty database", async () => {
    await wipeLocalData(freshDb(), createSettingsStore(memoryArea()), {
      removeItem() {},
    });
  });
});
