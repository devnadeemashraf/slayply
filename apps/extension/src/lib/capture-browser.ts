import {
  type CaptureDeps,
  type CaptureMode,
  type CaptureOutcome,
  captureFromTab,
} from "./capture.js";
import { snapshotPage } from "./page-snapshot.js";

/** Runs the capture helpers in a tab. `activeTab` (granted by the user's click) is the only permission used. */
export const browserCaptureDeps: CaptureDeps = {
  async readPage(tabId) {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: snapshotPage,
      args: [],
    });
    if (!injection?.result) throw new Error("No result from the page");
    return injection.result;
  },
  async readSelection(tabId) {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.getSelection()?.toString() ?? "",
    });
    return injection?.result ?? "";
  },
};

export async function captureFromActiveTab(mode: CaptureMode): Promise<CaptureOutcome> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return { ok: false, message: "No page is open to capture from." };
  return captureFromTab(mode, { id: tab.id, url: tab.url, title: tab.title }, browserCaptureDeps);
}
