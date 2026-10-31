import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "ok" | "warn" | "bad";

/** The text always carries the meaning; the colour only reinforces it. */
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`sl-badge sl-badge-${tone}`}>{children}</span>;
}
