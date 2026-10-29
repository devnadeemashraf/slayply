import { type CaptureKind, captureFromTab, captureSelection } from "../lib/capture.js";
import { browserCaptureDeps } from "../lib/capture-browser.js";
import { createCaptureInbox } from "../lib/capture-inbox.js";

const SELECTION_ITEMS: Record<string, CaptureKind> = {
  "capture-jd": "jd",
  "capture-question": "question",
  "capture-note": "note",
};
const PARENT_ID = "capture";
const PAGE_ID = "capture-page";

export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel.
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => {
    console.error("Could not enable the side panel on icon click", error);
  });

  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: PARENT_ID,
        title: "Capture for Slayply",
        contexts: ["selection"],
      });
      for (const [id, label] of [
        ["capture-jd", "Job description"],
        ["capture-question", "Question"],
        ["capture-note", "Note"],
      ] as const) {
        chrome.contextMenus.create({
          id,
          parentId: PARENT_ID,
          title: label,
          contexts: ["selection"],
        });
      }
      chrome.contextMenus.create({
        id: PAGE_ID,
        title: "Capture visible job description (Slayply)",
        contexts: ["page"],
      });
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    const id = String(info.menuItemId);
    if (!tab || (id !== PAGE_ID && !(id in SELECTION_ITEMS))) return;
    // The panel must open inside the click's user gesture, so before anything is awaited.
    if (tab.windowId !== undefined) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch((error: unknown) => {
        console.error("Could not open the side panel", error);
      });
    }
    void stage(id, info.selectionText ?? "", tab);
  });
});

async function stage(id: string, selected: string, tab: chrome.tabs.Tab): Promise<void> {
  const info = { id: tab.id, url: tab.url, title: tab.title };
  const outcome =
    id === PAGE_ID
      ? await captureFromTab("page", info, browserCaptureDeps)
      : captureSelection(selected, info, SELECTION_ITEMS[id] ?? "jd");
  try {
    await createCaptureInbox(chrome.storage.session).put(outcome);
  } catch (error) {
    console.error("Could not hand the capture to the side panel", error);
  }
}
