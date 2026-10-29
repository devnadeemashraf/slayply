import {
  type CaptureKind,
  type CaptureOutcome,
  captureFromTab,
  captureOneClick,
  captureSelection,
} from "../lib/capture.js";
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
  // The icon click (or its shortcut) is handled here, not by the browser's open-on-click setting:
  // `action.onClicked` is a documented `activeTab` grant, so the same click can open the panel and
  // read the page once. The panel opens first, before any await, to stay inside the user gesture.
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch((error: unknown) => {
    console.error("Could not turn off open-on-click", error);
  });

  chrome.action.onClicked.addListener((tab) => {
    if (tab.windowId !== undefined) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch((error: unknown) => {
        console.error("Could not open the side panel", error);
      });
    }
    void stageOutcome(
      captureOneClick({ id: tab.id, url: tab.url, title: tab.title }, browserCaptureDeps),
    );
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
  await stageOutcome(
    id === PAGE_ID
      ? captureFromTab("page", info, browserCaptureDeps)
      : Promise.resolve(captureSelection(selected, info, SELECTION_ITEMS[id] ?? "jd")),
  );
}

async function stageOutcome(pending: Promise<CaptureOutcome>): Promise<void> {
  try {
    await createCaptureInbox(chrome.storage.session).put(await pending);
  } catch (error) {
    console.error("Could not hand the capture to the side panel", error);
  }
}
