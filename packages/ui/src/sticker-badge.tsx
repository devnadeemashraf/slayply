import type { ReactNode } from "react";

export type StickerTone = "neutral" | "ok" | "warn" | "bad";

/** The text always carries the meaning; the colour only reinforces it. */
export function StickerBadge({
  tone = "neutral",
  children,
}: {
  tone?: StickerTone;
  children: ReactNode;
}) {
  return <span className={`sl-sticker sl-sticker-${tone}`}>{children}</span>;
}
