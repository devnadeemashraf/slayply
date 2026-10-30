import { JOB_STATUSES, type JobRecord } from "@slayply/core";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PLAYFUL } from "../lib/copy-text.js";
import { JobsView, statusLabel } from "./jobs-view.js";

const JOB: JobRecord = {
  id: "k1",
  title: "Backend engineer",
  company: "Acme",
  location: "Remote",
  jd: "Build billing.",
  status: "applied",
  resumeName: "SDE resume",
  answers: [{ question: "Why us?", text: "Because <b>billing</b>." }],
  savedAt: "2026-10-30T10:00:00.000Z",
  updatedAt: "2026-10-30T11:00:00.000Z",
};

const noop = () => undefined;
const render = (jobs: JobRecord[], error: string | null = null) =>
  renderToString(<JobsView jobs={jobs} error={error} onStatus={noop} onRemove={noop} />);

describe("JobsView", () => {
  it("shows the empty state when there are no jobs", () => {
    const html = render([]);
    expect(html).toContain(PLAYFUL.jobsEmptyTitle);
    expect(html).toContain(PLAYFUL.jobsEmptyBody);
  });

  it("lists title, company, location, resume and the saved answers", () => {
    const html = render([JOB]);
    for (const text of ["Backend engineer", "Acme", "Remote", "SDE resume", "Why us?"]) {
      expect(html).toContain(text);
    }
  });

  it("offers every pipeline status and marks the current one", () => {
    const html = render([JOB]);
    for (const status of JOB_STATUSES) expect(html).toContain(statusLabel(status));
    expect(html).toMatch(/<option[^>]*value="applied"[^>]*selected|selected[^>]*value="applied"/);
  });

  it("renders stored text as plain text, never as markup", () => {
    const html = render([JOB]);
    expect(html).not.toContain("<b>billing</b>");
    expect(html).toContain("&lt;b&gt;billing&lt;/b&gt;");
  });

  it("falls back to a plain name for a job with no title or company", () => {
    const html = render([{ ...JOB, title: "", company: "" }]);
    expect(html).toContain("Untitled job");
  });

  it("shows a load error and still shows the list", () => {
    const html = render([JOB], "Could not load saved jobs.");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Could not load saved jobs.");
  });

  it("has a remove button per job", () => {
    expect(render([JOB, { ...JOB, id: "k2" }]).match(/Remove job/g)).toHaveLength(2);
  });
});
