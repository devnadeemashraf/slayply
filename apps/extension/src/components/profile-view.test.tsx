import { parseContextPack, reconcileProfile } from "@slayply/core";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImportPreviewView, ProfileView } from "./profile-view.js";

const NOW = "2026-10-29T00:00:00.000Z";
const noop = () => {};
const accept = async () => true;

function profileFrom(markdown: string) {
  const result = reconcileProfile(null, parseContextPack(markdown), NOW);
  if (!result.ok) throw new Error(result.message);
  return result.profile;
}

describe("ProfileView", () => {
  it("invites an import when there is no profile", () => {
    const html = renderToString(
      <ProfileView profile={null} onRemove={noop} onEdit={accept} onAdd={accept} />,
    );
    expect(html).toMatch(/No profile yet/);
  });

  it("lists facts and stories with their IDs", () => {
    const profile = profileFrom("## Facts\n- Built billing\n## Stories\n- The outage");
    const html = renderToString(
      <ProfileView profile={profile} onRemove={noop} onEdit={accept} onAdd={accept} />,
    );
    expect(html).toContain("F01");
    expect(html).toContain("Built billing");
    expect(html).toContain("S01");
    expect(html).toContain("The outage");
  });

  it("says rules are saved but not applied, and lists them", () => {
    const profile = profileFrom("## Facts\n- a\n## Rules\n- Never claim a degree");
    const html = renderToString(
      <ProfileView profile={profile} onRemove={noop} onEdit={accept} onAdd={accept} />,
    );
    expect(html).toContain("Never claim a degree");
    expect(html).toMatch(/not yet applied/i);
  });

  it("escapes profile text instead of inserting it as HTML", () => {
    const profile = profileFrom("## Facts\n- <img src=x onerror=alert(1)>");
    const html = renderToString(
      <ProfileView profile={profile} onRemove={noop} onEdit={accept} onAdd={accept} />,
    );
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });

  it("shows preferences as key and value", () => {
    const profile = profileFrom("## Facts\n- a\n## Preferences\n- location: remote");
    const html = renderToString(
      <ProfileView profile={profile} onRemove={noop} onEdit={accept} onAdd={accept} />,
    );
    expect(html).toContain("location");
    expect(html).toContain("remote");
  });
});

describe("ImportPreviewView", () => {
  it("shows counts per section and enables Import", () => {
    const pack = parseContextPack("## Facts\n- a\n- b\n## Stories\n- c\n## Rules\n- d");
    const html = renderToString(<ImportPreviewView pack={pack} onConfirm={noop} onCancel={noop} />);
    expect(html).toMatch(/2 facts/);
    expect(html).toMatch(/1 story/);
    expect(html).toMatch(/1 rule/);
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Import/);
  });

  it("lists skipped lines with their line numbers", () => {
    const pack = parseContextPack("## Facts\nstray sentence\n- real");
    const html = renderToString(<ImportPreviewView pack={pack} onConfirm={noop} onCancel={noop} />);
    expect(html).toMatch(/Line 2/);
    expect(html).toMatch(/1 line was skipped|1 warning/i);
  });

  it("disables Import and explains the headings when nothing was found", () => {
    const pack = parseContextPack("just some notes");
    const html = renderToString(<ImportPreviewView pack={pack} onConfirm={noop} onCancel={noop} />);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Import/);
    expect(html).toContain("## Facts");
  });
});
