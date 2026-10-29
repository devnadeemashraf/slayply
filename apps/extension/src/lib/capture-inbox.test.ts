import { describe, expect, it } from "vitest";
import type { Capture } from "./capture.js";
import { createCaptureInbox, type InboxArea } from "./capture-inbox.js";

function fakeArea(): InboxArea & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
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

const capture: Capture = {
  kind: "jd",
  text: "The job",
  url: "https://example.com/",
  fields: { title: "T", company: "C", location: "", salary: "" },
};

describe("capture inbox", () => {
  it("hands a capture over once, then is empty", async () => {
    const inbox = createCaptureInbox(fakeArea());
    await inbox.put({ ok: true, capture });
    expect(await inbox.take()).toEqual({ ok: true, capture });
    expect(await inbox.take()).toBeNull();
  });

  it("hands over an error message too", async () => {
    const inbox = createCaptureInbox(fakeArea());
    await inbox.put({ ok: false, message: "Nothing is selected." });
    expect(await inbox.take()).toEqual({ ok: false, message: "Nothing is selected." });
  });

  it("discards a malformed record instead of staging it", async () => {
    const area = fakeArea();
    area.data["slayply:pendingCapture"] = { kind: "jd", text: 5 };
    expect(await createCaptureInbox(area).take()).toBeNull();
    expect(area.data["slayply:pendingCapture"]).toBeUndefined();
  });

  it("keeps only the newest capture", async () => {
    const inbox = createCaptureInbox(fakeArea());
    await inbox.put({ ok: true, capture });
    await inbox.put({ ok: true, capture: { ...capture, text: "Newer" } });
    expect(await inbox.take()).toMatchObject({ ok: true, capture: { text: "Newer" } });
  });
});
