export const TABS = [
  { id: "job", label: "Job" },
  { id: "jobs", label: "Jobs" },
  { id: "you", label: "You" },
  { id: "setup", label: "Setup" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

/** The tab a navigation key moves to (ARIA tabs pattern, wrapping), or null for any other key. */
export function nextTab(current: TabId, key: string): TabId | null {
  const index = TABS.findIndex((tab) => tab.id === current);
  switch (key) {
    case "ArrowRight":
      return TABS[(index + 1) % TABS.length]?.id ?? null;
    case "ArrowLeft":
      return TABS[(index - 1 + TABS.length) % TABS.length]?.id ?? null;
    case "Home":
      return TABS[0].id;
    case "End":
      return TABS[TABS.length - 1]?.id ?? null;
    default:
      return null;
  }
}

export type SetupStatus = { hasKey: boolean; hasProfile: boolean; hasResume: boolean };

export type SetupItem = {
  id: "key" | "profile" | "resume";
  label: string;
  done: boolean;
  /** Only the key blocks drafting; a profile and a resume make answers better. */
  required: boolean;
  tab: TabId;
};

export function setupChecklist(status: SetupStatus): SetupItem[] {
  return [
    { id: "key", label: "API key", done: status.hasKey, required: true, tab: "setup" },
    { id: "profile", label: "Profile", done: status.hasProfile, required: false, tab: "you" },
    { id: "resume", label: "Resume", done: status.hasResume, required: false, tab: "you" },
  ];
}
