import {
  type CaptureDeps,
  type CaptureMode,
  type CaptureOutcome,
  captureFromTab,
  captureOneClick,
} from "./capture.js";
import { selectionText, snapshotPage } from "./page-snapshot.js";
import { mergeFrameResults } from "./snapshot-merge.js";

/**
 * Runs the capture helpers in a tab, in every frame the extension may access (the top page first).
 * A frame it has no permission for is simply left out. `activeTab` from the user's click, or a host
 * permission the user granted, is what allows the read.
 */
export const browserCaptureDeps: CaptureDeps = {
  async readPage(tabId) {
    const injections = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: snapshotPage,
      args: [],
    });
    const merged = mergeFrameResults(
      injections.map((injection) => ({ frameId: injection.frameId, result: injection.result })),
    );
    if (!merged) throw new Error("No result from the page");
    return merged;
  },
  async readSelection(tabId) {
    const injections = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: selectionText,
      args: [],
    });
    // The top page's selection wins; an embedded frame is used only when the top page has none.
    const ordered = [...injections].sort((a, b) =>
      a.frameId === 0 ? -1 : b.frameId === 0 ? 1 : 0,
    );
    return (
      ordered.map((injection) => injection.result ?? "").find((text) => text.trim() !== "") ?? ""
    );
  },
};

export async function captureFromActiveTab(mode: CaptureMode): Promise<CaptureOutcome> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return { ok: false, message: "No page is open to capture from." };
  return captureFromTab(mode, { id: tab.id, url: tab.url, title: tab.title }, browserCaptureDeps);
}

export async function captureOneClickFromActiveTab(): Promise<CaptureOutcome> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return { ok: false, message: "No page is open to capture from." };
  return captureOneClick({ id: tab.id, url: tab.url, title: tab.title }, browserCaptureDeps);
}
