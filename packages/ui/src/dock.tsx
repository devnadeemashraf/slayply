import type { ReactNode } from "react";

/** The bottom bar: one primary action above the tab bar. */
export function Dock({ primary, children }: { primary?: ReactNode; children: ReactNode }) {
  return (
    <div className="sl-dock">
      {primary !== undefined && primary !== null && (
        <div className="sl-dock-primary">{primary}</div>
      )}
      {children}
    </div>
  );
}
