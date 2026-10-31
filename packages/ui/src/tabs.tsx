import { type CSSProperties, type ReactNode, useRef } from "react";

/** The tab a navigation key moves to (ARIA tabs pattern, wrapping), or null for any other key. */
export function nextIndex(count: number, current: number, key: string): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export type TabItem = { id: string; label: string };

export function Tabs({
  label,
  tabs,
  active,
  onSelect,
  idPrefix = "sl",
}: {
  label: string;
  tabs: readonly TabItem[];
  active: string;
  onSelect: (id: string) => void;
  idPrefix?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  return (
    <div
      className="sl-tabs"
      role="tablist"
      aria-label={label}
      style={
        {
          "--tab-count": tabs.length,
          "--tab-index": Math.max(
            0,
            tabs.findIndex((tab) => tab.id === active),
          ),
        } as CSSProperties
      }
    >
      <span className="sl-tabs-glider" aria-hidden="true" />
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(node) => {
            refs.current[index] = node;
          }}
          type="button"
          role="tab"
          className="sl-tab"
          id={`${idPrefix}-tab-${tab.id}`}
          aria-selected={tab.id === active}
          aria-controls={`${idPrefix}-panel-${tab.id}`}
          tabIndex={tab.id === active ? 0 : -1}
          onClick={() => onSelect(tab.id)}
          onKeyDown={(event) => {
            const target = nextIndex(tabs.length, index, event.key);
            const next = target === null ? undefined : tabs[target];
            if (target === null || !next) return;
            event.preventDefault();
            onSelect(next.id);
            refs.current[target]?.focus();
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Stays mounted when inactive, so a panel's state survives a switch of tab. */
export function TabPanel({
  id,
  active,
  idPrefix = "sl",
  children,
}: {
  id: string;
  active: boolean;
  idPrefix?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${id}`}
      aria-labelledby={`${idPrefix}-tab-${id}`}
      hidden={!active}
    >
      {children}
    </div>
  );
}
