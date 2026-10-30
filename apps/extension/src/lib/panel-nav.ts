export const TABS = [
  { id: "job", label: "Job" },
  { id: "jobs", label: "Jobs" },
  { id: "you", label: "You" },
  { id: "setup", label: "Setup" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

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
