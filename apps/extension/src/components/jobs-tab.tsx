import { EmptyState } from "@slayply/ui";
import { PLAYFUL } from "../lib/copy-text.js";

export function JobsTab() {
  return <EmptyState title={PLAYFUL.jobsEmptyTitle}>{PLAYFUL.jobsEmptyBody}</EmptyState>;
}
