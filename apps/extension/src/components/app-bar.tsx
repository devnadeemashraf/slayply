import { nextTheme, type Theme } from "@slayply/ui";
import type { ReactNode } from "react";
import type { RelayStatus } from "../lib/relay-status.js";

const THEME_NAMES: Record<Theme, string> = { auto: "match system", light: "light", dark: "dark" };

const THEME_SHORT: Record<Theme, string> = { auto: "Auto", light: "Light", dark: "Dark" };

function StatusBadge({ status }: { status: RelayStatus }) {
  return (
    <p className={`status status-${status.phase}`} role="status">
      <span className="dot" aria-hidden="true" />
      {status.label}
    </p>
  );
}

/** The fixed top row: brand, the model chip slot, the theme toggle and the relay status. */
export function AppBar({
  status,
  theme,
  onTheme,
  chip,
}: {
  status: RelayStatus;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  chip?: ReactNode;
}) {
  const next = nextTheme(theme);
  return (
    <header className="app-bar">
      <h1>Slayply</h1>
      {chip !== undefined && chip !== null && <div className="app-bar-chip">{chip}</div>}
      <button
        type="button"
        className="sl-icon-btn"
        aria-label={`Theme: ${THEME_NAMES[theme]}. Switch to ${THEME_NAMES[next]}`}
        onClick={() => onTheme(next)}
      >
        <span aria-hidden="true">{THEME_SHORT[theme]}</span>
      </button>
      <StatusBadge status={status} />
    </header>
  );
}
