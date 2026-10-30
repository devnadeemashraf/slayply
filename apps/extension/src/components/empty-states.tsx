import { EmptyState } from "@slayply/ui";
import { PLAYFUL } from "../lib/copy-text.js";

export function JobEmpty() {
  return <EmptyState title={PLAYFUL.jobEmptyTitle}>{PLAYFUL.jobEmptyBody}</EmptyState>;
}

export function YouEmpty() {
  return <EmptyState title={PLAYFUL.youEmptyTitle}>{PLAYFUL.youEmptyBody}</EmptyState>;
}
