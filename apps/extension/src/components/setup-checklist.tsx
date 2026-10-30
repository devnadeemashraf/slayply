import { Button, Card } from "@slayply/ui";
import { type SetupStatus, setupChecklist, TABS, type TabId } from "../lib/panel-nav.js";

function tabLabel(id: TabId): string {
  return TABS.find((tab) => tab.id === id)?.label ?? id;
}

export function SetupChecklist({
  status,
  onGo,
}: {
  status: SetupStatus;
  onGo: (tab: TabId) => void;
}) {
  const items = setupChecklist(status);
  if (items.every((item) => item.done)) return null;

  return (
    <Card title="Before your first draft">
      <ul className="items">
        {items.map((item) => (
          <li key={item.id} className={item.done ? "done" : "open"}>
            <span aria-hidden="true">{item.done ? "✓" : "○"}</span> {item.label}
            {item.done && <span className="muted"> (done)</span>}
            {!item.done && item.required && <span className="muted"> (needed to draft)</span>}
            {!item.done && !item.required && <span className="muted"> (makes answers better)</span>}
            {!item.done && (
              <Button variant="secondary" onClick={() => onGo(item.tab)}>
                {`Go to ${tabLabel(item.tab)}`}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
