import { useState } from "react";
import {
  BACKUP_MAX_CHARS,
  exportBackup,
  importBackup,
  serializeBackup,
  wipeLocalData,
} from "../lib/backup.js";
import { downloadText } from "../lib/download.js";
import type { SettingsStore } from "../lib/settings.js";
import type { IDBPDatabase } from "idb";
import { SettingsView } from "./settings-view.js";

/** Both actions replace every store, so the panel reloads and every view reads the new data. */
export function SettingsPanel({
  db,
  settings,
  reload = () => window.location.reload(),
}: {
  db: Promise<IDBPDatabase>;
  settings: SettingsStore;
  reload?: () => void;
}) {
  const [confirmingWipe, setConfirmingWipe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsView
      confirmingWipe={confirmingWipe}
      busy={busy}
      message={message}
      onExport={() =>
        void run(async () => {
          const backup = await exportBackup(db);
          const day = backup.exportedAt.slice(0, 10);
          downloadText(`slayply-backup-${day}.json`, serializeBackup(backup), "application/json");
          setMessage("Backup saved to your downloads.");
        })
      }
      onChooseFile={(file) => {
        if (!file) return;
        void run(async () => {
          if (file.size > BACKUP_MAX_CHARS) {
            setMessage("That file is too large to be a Slayply backup.");
            return;
          }
          const result = await importBackup(db, await file.text());
          if (!result.ok) {
            setMessage(result.message);
            return;
          }
          reload();
        });
      }}
      onAskWipe={() => setConfirmingWipe(true)}
      onCancelWipe={() => setConfirmingWipe(false)}
      onConfirmWipe={() =>
        void run(async () => {
          await wipeLocalData(db, settings);
          reload();
        })
      }
    />
  );
}
