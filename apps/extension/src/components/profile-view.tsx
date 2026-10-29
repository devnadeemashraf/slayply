import type { ParsedPack, StoredItem, StoredProfile } from "@slayply/core";
import { useState } from "react";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function ItemRow({
  item,
  onEdit,
  onRemove,
}: {
  item: StoredItem;
  onEdit: (id: string, text: string) => Promise<boolean>;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);

  return (
    <li>
      <span className="item-id">{item.id}</span>
      {editing ? (
        <>
          <textarea
            aria-label={`Edit ${item.id}`}
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="row">
            <button
              type="button"
              onClick={async () => {
                // Stay open on a rejected edit so the user's text is not lost.
                if (await onEdit(item.id, draft)) setEditing(false);
              }}
            >
              Save
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setDraft(item.text);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="answer">{item.text}</span>
          <span className="row">
            <button type="button" className="secondary" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button type="button" className="secondary" onClick={() => onRemove(item.id)}>
              Remove
            </button>
          </span>
        </>
      )}
    </li>
  );
}

function AddItem({ label, onAdd }: { label: string; onAdd: (text: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        // Keep the draft when the add is rejected (a duplicate, the limit) so it can be fixed.
        if (await onAdd(draft)) setDraft("");
      }}
    >
      <label htmlFor={`add-${label}`}>Add a {label}</label>
      <input id={`add-${label}`} value={draft} onChange={(event) => setDraft(event.target.value)} />
      <div className="row">
        <button type="submit" disabled={draft.trim() === ""}>
          Add
        </button>
      </div>
    </form>
  );
}

/** The saved profile. All text is rendered as plain children, never HTML. */
export function ProfileView({
  profile,
  onEdit,
  onRemove,
  onAdd,
}: {
  profile: StoredProfile | null;
  onEdit: (id: string, text: string) => Promise<boolean>;
  onRemove: (id: string) => void;
  onAdd: (kind: "fact" | "story", text: string) => Promise<boolean>;
}) {
  if (!profile) {
    return (
      <p className="muted">No profile yet. Import a context pack (a markdown file) to begin.</p>
    );
  }
  const prefs = Object.entries(profile.prefs);
  return (
    <div>
      <p className="muted">
        {plural(profile.facts.length, "fact")}, {plural(profile.stories.length, "story")},{" "}
        {plural(prefs.length, "preference")}, {plural(profile.rules.length, "rule")}.
      </p>
      <h3>Facts</h3>
      <ul className="items">
        {profile.facts.map((item) => (
          <ItemRow key={item.id} item={item} onEdit={onEdit} onRemove={onRemove} />
        ))}
      </ul>
      <AddItem label="fact" onAdd={(text) => onAdd("fact", text)} />
      <h3>Stories</h3>
      <ul className="items">
        {profile.stories.map((item) => (
          <ItemRow key={item.id} item={item} onEdit={onEdit} onRemove={onRemove} />
        ))}
      </ul>
      <AddItem label="story" onAdd={(text) => onAdd("story", text)} />
      {prefs.length > 0 && (
        <>
          <h3>Preferences</h3>
          <ul className="items">
            {prefs.map(([key, value]) => (
              <li key={key}>
                <span className="item-id">{key}</span>
                <span className="answer">{value}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {profile.rules.length > 0 && (
        <>
          <h3>Rules</h3>
          <p className="notice">Rules are saved but not yet applied to answers.</p>
          <ul className="items">
            {profile.rules.map((rule) => (
              <li key={rule}>
                <span className="answer">{rule}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** What an import found, shown before anything is saved. */
export function ImportPreviewView({
  pack,
  onConfirm,
  onCancel,
}: {
  pack: ParsedPack;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const prefCount = Object.keys(pack.prefs).length;
  const total = pack.facts.length + pack.stories.length + prefCount + pack.rules.length;
  return (
    <div className="result">
      <h3>Import preview</h3>
      {total === 0 ? (
        <p className="error" role="alert">
          Nothing was found. Use the headings ## Facts, ## Stories, ## Preferences and ## Rules,
          with one bullet per item.
        </p>
      ) : (
        <p>
          Found {plural(pack.facts.length, "fact")}, {plural(pack.stories.length, "story")},{" "}
          {plural(prefCount, "preference")} and {plural(pack.rules.length, "rule")}. Importing
          replaces your current profile; unchanged items keep their IDs.
        </p>
      )}
      {pack.warnings.length > 0 && (
        <>
          <p className="muted">{plural(pack.warnings.length, "warning")}:</p>
          <ul className="warnings">
            {pack.warnings.map((warning) => (
              <li key={`${warning.line}-${warning.message}`}>
                {warning.line > 0 ? `Line ${warning.line}: ` : ""}
                {warning.message}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="row">
        <button type="button" disabled={total === 0} onClick={onConfirm}>
          Import
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
