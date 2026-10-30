import { type ReactNode, useRef } from "react";
import { nextTab, TABS, type TabId } from "../lib/panel-nav.js";

export function TabBar({ active, onSelect }: { active: TabId; onSelect: (tab: TabId) => void }) {
  const refs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  return (
    <div className="tabbar" role="tablist" aria-label="Slayply sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          ref={(node) => {
            refs.current[tab.id] = node;
          }}
          type="button"
          role="tab"
          id={`tab-${tab.id}`}
          aria-selected={tab.id === active}
          aria-controls={`panel-${tab.id}`}
          tabIndex={tab.id === active ? 0 : -1}
          onClick={() => onSelect(tab.id)}
          onKeyDown={(event) => {
            const target = nextTab(tab.id, event.key);
            if (target === null) return;
            event.preventDefault();
            onSelect(target);
            refs.current[target]?.focus();
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Every panel stays mounted and is only hidden: the Job tab holds a running generation and
 * unsaved edits in React state, which a switch of tab must not drop.
 */
export function TabPanel({
  id,
  active,
  children,
}: {
  id: TabId;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={!active}>
      {children}
    </div>
  );
}
