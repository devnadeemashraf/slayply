import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PRIVACY_STATEMENT, TRAINING_WARNING } from "../lib/privacy.js";
import { SettingsView, type SettingsViewProps } from "./settings-view.js";

const noop = () => {};
const base: SettingsViewProps = {
  confirmingWipe: false,
  busy: false,
  message: null,
  onExport: noop,
  onChooseFile: noop,
  onAskWipe: noop,
  onCancelWipe: noop,
  onConfirmWipe: noop,
};

const text = (props: Partial<SettingsViewProps> = {}) =>
  renderToString(<SettingsView {...base} {...props} />).replace(/&#x27;/g, "'");

describe("SettingsView", () => {
  it("shows the privacy statement and the training warning", () => {
    const html = text();
    expect(html).toContain(PRIVACY_STATEMENT.slice(0, 40));
    expect(html).toContain(TRAINING_WARNING.slice(0, 40));
  });

  it("offers export, import and wipe, and says the key is never exported", () => {
    const html = text();
    expect(html).toMatch(/Export everything/);
    expect(html).toMatch(/Import a backup/);
    expect(html).toMatch(/never contains your API key/);
    expect(html).toMatch(/Delete all local data/);
    expect(html).not.toMatch(/Yes, delete everything/);
  });

  it("asks for confirmation before a wipe", () => {
    const html = text({ confirmingWipe: true });
    expect(html).toMatch(/Yes, delete everything/);
    expect(html).toMatch(/cannot be undone/);
    expect(html).toMatch(/Cancel/);
  });

  it("disables the actions while one is running", () => {
    const html = text({ busy: true });
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("shows a result message", () => {
    expect(text({ message: "Imported 2 resumes." })).toContain("Imported 2 resumes.");
  });
});
