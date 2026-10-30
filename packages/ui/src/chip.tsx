import type { ReactNode } from "react";
import { cx } from "./cx.js";

export function Chip({
  children,
  selected,
  onClick,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  const className = cx("sl-chip", selected && "sl-chip-selected", onClick && "sl-chip-button");
  if (!onClick) return <span className={className}>{children}</span>;
  return (
    <button type="button" className={className} aria-pressed={selected ?? false} onClick={onClick}>
      {children}
    </button>
  );
}
