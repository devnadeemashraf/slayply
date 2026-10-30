import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PLAYFUL } from "../lib/copy-text.js";
import { showYouEmpty } from "../lib/panel-nav.js";
import { JobEmpty, YouEmpty } from "./empty-states.js";
import { JobsTab } from "./jobs-tab.js";

describe("empty states use the shared copy", () => {
  it("Job", () => {
    const html = renderToString(<JobEmpty />);
    expect(html).toContain(PLAYFUL.jobEmptyTitle);
    expect(html).toContain(PLAYFUL.jobEmptyBody);
  });

  it("Jobs", () => {
    const html = renderToString(<JobsTab />);
    expect(html).toContain(PLAYFUL.jobsEmptyTitle);
    expect(html).toContain(PLAYFUL.jobsEmptyBody);
  });

  it("You", () => {
    const html = renderToString(<YouEmpty />);
    expect(html).toContain(PLAYFUL.youEmptyTitle);
    expect(html).toContain(PLAYFUL.youEmptyBody);
  });

  it("escapes nothing it should not: the copy renders as plain text", () => {
    expect(renderToString(<JobEmpty />)).not.toContain("<script");
  });
});

describe("showYouEmpty", () => {
  const base = {
    profileStatus: "ready",
    profile: null,
    resumeCount: 0,
    resumesError: null,
  } as const;

  it("shows when there is no profile and no resume", () => {
    expect(showYouEmpty(base)).toBe(true);
  });

  it("hides once there is a profile or a resume", () => {
    expect(showYouEmpty({ ...base, profile: { facts: [] } as never })).toBe(false);
    expect(showYouEmpty({ ...base, resumeCount: 1 })).toBe(false);
  });

  it("hides while loading, on a storage problem, or when resumes failed to load", () => {
    expect(showYouEmpty({ ...base, profileStatus: "loading" })).toBe(false);
    expect(showYouEmpty({ ...base, profileStatus: "corrupt" })).toBe(false);
    expect(showYouEmpty({ ...base, profileStatus: "error" })).toBe(false);
    expect(showYouEmpty({ ...base, resumesError: "boom" })).toBe(false);
  });
});
