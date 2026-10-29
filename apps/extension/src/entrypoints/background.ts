export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel.
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => {
    console.error("Could not enable the side panel on icon click", error);
  });
});
