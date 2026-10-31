import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLAYFUL, SERIOUS } from "./copy-text.js";
import { PRIVACY_STATEMENT, TRAINING_WARNING } from "./privacy.js";

const EMOJI = /\p{Extended_Pictographic}/u;
// Plain symbols used as icons (always aria-hidden next to text), not voice.
const ALLOWED_SYMBOLS = /[✓○•]/g;
const CHEEKY = /\b(cook\w*|fine print|slay|vibe|yeet|oops|uh-oh)\b/;

const SERIOUS_ALL: string[] = [...Object.values(SERIOUS), PRIVACY_STATEMENT, TRAINING_WARNING];
const PLAYFUL_ALL = Object.values(PLAYFUL);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("voice: playful stays in its lane", () => {
  it("has playful copy only for empty states and the relay warm-up", () => {
    expect(Object.keys(PLAYFUL).sort()).toEqual(
      [
        "jobEmptyBody",
        "jobEmptyTitle",
        "jobsEmptyBody",
        "jobsEmptyTitle",
        "relayWarming",
        "youEmptyBody",
        "youEmptyTitle",
      ].sort(),
    );
    for (const text of PLAYFUL_ALL) expect(text.trim().length).toBeGreaterThan(0);
  });

  it("keeps every serious message free of emoji and exclamation marks", () => {
    for (const text of SERIOUS_ALL) {
      expect(text, text).not.toMatch(EMOJI);
      expect(text, text).not.toContain("!");
    }
  });

  it("never reuses a playful phrase in a serious message, or the reverse", () => {
    for (const serious of SERIOUS_ALL) {
      for (const playful of PLAYFUL_ALL) {
        expect(serious.includes(playful), `${serious} / ${playful}`).toBe(false);
        expect(playful.includes(serious), `${playful} / ${serious}`).toBe(false);
      }
    }
  });

  it("keeps cheeky wording out of serious messages", () => {
    for (const text of SERIOUS_ALL) {
      expect(text.toLowerCase(), text).not.toMatch(CHEEKY);
    }
  });

  it("keeps emoji out of every source file except the copy file", () => {
    const root = join(import.meta.dirname, "..");
    const offenders = sourceFiles(root)
      .filter((file) => !file.endsWith("copy-text.ts"))
      .filter((file) => EMOJI.test(readFileSync(file, "utf8").replace(ALLOWED_SYMBOLS, "")));
    expect(offenders).toEqual([]);
  });
});

describe("serious messages say what happened and what to do", () => {
  it("names the problem for each storage and key failure", () => {
    expect(SERIOUS.keyEmpty).toMatch(/key/i);
    expect(SERIOUS.keyInvalid).toMatch(/key/i);
    expect(SERIOUS.settingsUnreadable).toMatch(/settings/i);
    expect(SERIOUS.profileStorageUnavailable).toMatch(/reload/i);
    expect(SERIOUS.profileUnreadable).toMatch(/delet|discard/i);
  });
});
