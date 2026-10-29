import "fake-indexeddb/auto";
import type { StoredResume } from "@slayply/core";
import { describe, expect, it } from "vitest";
import { openProfileDb } from "./profile-store.js";
import { createResumeStore, ResumeCorruptError } from "./resume-store.js";

let counter = 0;
const freshDb = () => openProfileDb(`slayply-resume-test-${++counter}`);

const NEW = {
  name: "cv.pdf",
  track: "sde",
  region: "master",
  text: "Built things. ".repeat(10).trim(),
  pageCount: 2,
  truncated: false,
};

describe("resume store (IndexedDB)", () => {
  it("starts empty", async () => {
    expect(await createResumeStore(freshDb()).list()).toEqual([]);
  });

  it("saves a resume with an id and timestamp, and lists it newest first", async () => {
    const store = createResumeStore(freshDb());
    const first = await store.add({ ...NEW, name: "a.pdf" });
    const second = await store.add({ ...NEW, name: "b.pdf" });
    expect(first.id).not.toBe(second.id);
    expect(first.charCount).toBe(NEW.text.length);
    const listed = await store.list();
    expect(listed.map((r) => r.name).sort()).toEqual(["a.pdf", "b.pdf"]);
    const [newest, oldest] = listed;
    expect((newest?.createdAt ?? "") >= (oldest?.createdAt ?? "")).toBe(true);
  });

  it("rejects an invalid resume without writing", async () => {
    const store = createResumeStore(freshDb());
    await expect(store.add({ ...NEW, track: "a\nb" })).rejects.toThrow(/not valid/);
    await expect(store.add({ ...NEW, text: "   " })).rejects.toThrow(/not valid/);
    expect(await store.list()).toEqual([]);
  });

  it("changes the tags of a saved resume and keeps the text", async () => {
    const store = createResumeStore(freshDb());
    const saved = await store.add(NEW);
    await store.retag(saved.id, { track: "fde", region: "gulf" });
    const [loaded] = await store.list();
    expect(loaded).toMatchObject({ id: saved.id, track: "fde", region: "gulf", text: NEW.text });
  });

  it("refuses to retag a missing resume or with a bad tag", async () => {
    const store = createResumeStore(freshDb());
    await expect(store.retag("nope", { track: "x", region: "y" })).rejects.toThrow(/not found/);
    const saved = await store.add(NEW);
    await expect(store.retag(saved.id, { track: "", region: "y" })).rejects.toThrow(/not valid/);
    expect((await store.list())[0]?.track).toBe("sde");
  });

  it("removes a resume", async () => {
    const store = createResumeStore(freshDb());
    const saved = await store.add(NEW);
    await store.remove(saved.id);
    expect(await store.list()).toEqual([]);
  });

  it("keeps resumes across a reopen and leaves the profile stores alone", async () => {
    const name = `slayply-resume-test-${++counter}`;
    const saved = await createResumeStore(openProfileDb(name)).add(NEW);
    const db = await openProfileDb(name);
    expect(await createResumeStore(Promise.resolve(db)).list()).toEqual([saved]);
    expect([...db.objectStoreNames].sort()).toEqual(["answers", "profile", "resumes"]);
  });

  it("stops on an unreadable record instead of hiding or overwriting it", async () => {
    const db = await freshDb();
    await db.put("resumes", { id: "bad", text: 5 });
    await expect(createResumeStore(Promise.resolve(db)).list()).rejects.toBeInstanceOf(
      ResumeCorruptError,
    );
  });

  it("returns exactly what was stored", async () => {
    const store = createResumeStore(freshDb());
    const saved: StoredResume = await store.add(NEW);
    expect((await store.list())[0]).toEqual(saved);
  });
});
