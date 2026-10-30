import "fake-indexeddb/auto";
import type { JobRecord } from "@slayply/core";
import { describe, expect, it } from "vitest";
import { createJobStore, JOB_LIMIT } from "./job-store.js";
import { openProfileDb } from "./profile-store.js";

let counter = 0;
const freshDb = () => openProfileDb(`slayply-job-test-${++counter}`);

const DRAFT = {
  title: "Backend engineer",
  company: "Acme",
  location: "Remote",
  jd: "Build billing.",
  resumeName: "SDE resume",
  answers: [{ question: "Why us?", text: "Because billing." }],
};

describe("job store (IndexedDB)", () => {
  it("starts empty", async () => {
    expect(await createJobStore(freshDb()).list()).toEqual([]);
  });

  it("saves a job as 'saved' and reads it back", async () => {
    const store = createJobStore(freshDb());
    await store.save("k1", DRAFT);
    const [job] = await store.list();
    expect(job).toMatchObject({ id: "k1", status: "saved", title: "Backend engineer" });
    expect(job?.answers).toEqual(DRAFT.answers);
  });

  it("saving the same job again updates its answers but keeps status and first save date", async () => {
    const store = createJobStore(freshDb());
    await store.save("k1", DRAFT);
    await store.setStatus("k1", "applied");
    const first = (await store.list())[0] as JobRecord;
    await store.save("k1", { ...DRAFT, answers: [{ question: "Why?", text: "New." }] });
    const [job] = await store.list();
    expect(await store.list()).toHaveLength(1);
    expect(job?.status).toBe("applied");
    expect(job?.savedAt).toBe(first.savedAt);
    expect(job?.answers[0]?.text).toBe("New.");
  });

  it("saving again with no answers keeps the answers already saved", async () => {
    const store = createJobStore(freshDb());
    await store.save("k1", DRAFT);
    await store.save("k1", { ...DRAFT, title: "Renamed", answers: [] });
    const [job] = await store.list();
    expect(job?.title).toBe("Renamed");
    expect(job?.answers).toEqual(DRAFT.answers);
  });

  it("lists the most recently updated job first", async () => {
    const store = createJobStore(freshDb());
    await store.save("old", DRAFT);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await store.save("new", DRAFT);
    expect((await store.list()).map((job) => job.id)).toEqual(["new", "old"]);
  });

  it("changes status and refuses one outside the pipeline", async () => {
    const store = createJobStore(freshDb());
    await store.save("k1", DRAFT);
    await store.setStatus("k1", "offer");
    expect((await store.list())[0]?.status).toBe("offer");
    await expect(store.setStatus("k1", "ghosted" as never)).rejects.toThrow(/status/i);
    expect((await store.list())[0]?.status).toBe("offer");
  });

  it("setStatus on a missing job does nothing", async () => {
    const store = createJobStore(freshDb());
    await expect(store.setStatus("nope", "applied")).resolves.toBeUndefined();
    expect(await store.list()).toEqual([]);
  });

  it("removes a job", async () => {
    const store = createJobStore(freshDb());
    await store.save("k1", DRAFT);
    await store.remove("k1");
    expect(await store.list()).toEqual([]);
  });

  it("refuses a job that does not match the schema and saves nothing", async () => {
    const store = createJobStore(freshDb());
    await expect(store.save("k1", { ...DRAFT, jd: "x".repeat(70_000) })).rejects.toThrow(
      /not valid/,
    );
    expect(await store.list()).toEqual([]);
  });

  it("skips an unreadable stored record instead of failing the list", async () => {
    const db = freshDb();
    await (await db).put("jobs", { id: "bad", status: 7 });
    const store = createJobStore(db);
    await store.save("good", DRAFT);
    expect((await store.list()).map((job) => job.id)).toEqual(["good"]);
  });

  it("drops the oldest job past the limit", async () => {
    const store = createJobStore(freshDb());
    for (let i = 0; i <= JOB_LIMIT; i++) await store.save(`j${i}`, DRAFT);
    const ids = (await store.list()).map((job) => job.id);
    expect(ids).toHaveLength(JOB_LIMIT);
    expect(ids).not.toContain("j0");
  }, 30_000);
});
