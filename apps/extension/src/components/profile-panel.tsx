import {
  addProfileItem,
  type EditResult,
  editProfileItem,
  type ParsedPack,
  parseContextPack,
  reconcileProfile,
  removeProfileItem,
  type StoredProfile,
} from "@slayply/core";
import { useRef, useState } from "react";
import type { ProfileStore } from "../lib/profile-store.js";
import { ImportPreviewView, ProfileView } from "./profile-view.js";

/** Matches the parser's own ceiling, so an oversized file is refused before it is read. */
const MAX_FILE_BYTES = 1_000_000;

export function ProfilePanel({
  profile,
  store,
  onChange,
}: {
  profile: StoredProfile | null;
  store: ProfileStore;
  onChange: (profile: StoredProfile) => void;
}) {
  const [preview, setPreview] = useState<ParsedPack | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Changes run one after another, each starting from the latest saved profile, so two quick
  // clicks cannot both take the same next ID.
  const latest = useRef(profile);
  latest.current = profile;
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  function mutate(change: (current: StoredProfile | null) => EditResult): Promise<boolean> {
    const run = queue.current.then(async () => {
      const result = change(latest.current);
      if (!result.ok) {
        setMessage(result.message);
        return false;
      }
      try {
        await store.save(result.profile);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "The profile could not be saved.");
        return false;
      }
      setMessage(null);
      latest.current = result.profile;
      onChange(result.profile);
      return true;
    });
    queue.current = run.catch(() => undefined);
    return run;
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setMessage("That file is too large (limit 1 MB).");
      return;
    }
    setMessage(null);
    setPreview(parseContextPack(await file.text()));
  }

  async function confirmImport() {
    if (!preview) return;
    const now = new Date().toISOString();
    if (await mutate((current) => reconcileProfile(current, preview, now))) setPreview(null);
  }

  const stamp = () => new Date().toISOString();

  return (
    <section>
      <h2>Your profile</h2>
      <label htmlFor="context-pack">Import a context pack (.md)</label>
      <input
        id="context-pack"
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        onChange={(event) => {
          void chooseFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      {preview && (
        <ImportPreviewView
          pack={preview}
          onConfirm={() => void confirmImport()}
          onCancel={() => setPreview(null)}
        />
      )}
      <ProfileView
        profile={profile}
        onAdd={(kind, text) =>
          mutate((current) =>
            current
              ? addProfileItem(current, kind, text, stamp())
              : { ok: false, message: "Import a context pack first." },
          )
        }
        onEdit={(id, text) =>
          mutate((current) =>
            current
              ? editProfileItem(current, id, text, stamp())
              : { ok: false, message: "Import a context pack first." },
          )
        }
        onRemove={(id) => {
          void mutate((current) =>
            current
              ? removeProfileItem(current, id, stamp())
              : { ok: false, message: "Import a context pack first." },
          );
        }}
      />
    </section>
  );
}
