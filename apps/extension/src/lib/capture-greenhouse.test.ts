import { describe, expect, it, vi } from "vitest";
import { captureFromTab, type TabInfo } from "./capture.js";
import { LINKEDIN_URL } from "./capture-fixtures.js";
import type { PageSnapshot } from "./page-snapshot.js";

const snapshot: PageSnapshot = {
  title: "Senior Engineer at Acme",
  ogTitle: "",
  ogSiteName: "",
  jsonLd: [],
  text: "A real job description that is long enough to be useful.",
  questions: [],
};

const tab = (url: string): TabInfo => ({ id: 7, url, title: "Senior Engineer at Acme" });
const board = tab("https://boards.greenhouse.io/acme/jobs/4012345");

const apiJob = {
  title: "Senior Engineer",
  company_name: "Acme",
  location: { name: "Berlin" },
  questions: [
    { required: true, label: "Why Acme?", fields: [{ name: "question_1", type: "textarea" }] },
  ],
};

const deps = (readApi?: (url: string) => Promise<unknown>) => ({
  readPage: async () => snapshot,
  readSelection: vi.fn(),
  ...(readApi ? { readApi } : {}),
});

describe("captureFromTab with the Greenhouse API", () => {
  it("adds the structured questions and job details to the page result", async () => {
    const readApi = vi.fn(async (_url: string) => apiJob);
    const result = await captureFromTab("page", board, deps(readApi));
    expect(readApi).toHaveBeenCalledWith("https://boards.greenhouse.io/acme/jobs/4012345");
    expect(result.ok && result.capture.questions.map((q) => q.label)).toEqual(["Why Acme?"]);
    expect(result.ok && result.capture.fields.company).toBe("Acme");
  });

  it("falls back to the page result when the API fails, is empty or is unavailable", async () => {
    const failing = await captureFromTab(
      "page",
      board,
      deps(async () => {
        throw new Error("x");
      }),
    );
    const none = await captureFromTab(
      "page",
      board,
      deps(async () => null),
    );
    const absent = await captureFromTab("page", board, deps());
    for (const result of [failing, none, absent]) {
      expect(result.ok && result.capture.questions).toEqual([]);
    }
  });

  it("does not call the API for other sites or for LinkedIn", async () => {
    const readApi = vi.fn(async (_url: string) => apiJob);
    await captureFromTab("page", tab("https://example.com/jobs/1"), deps(readApi));
    await captureFromTab("page", tab(LINKEDIN_URL), deps(readApi));
    expect(readApi).not.toHaveBeenCalled();
  });
});
