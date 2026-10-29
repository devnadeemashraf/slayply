import type { IDBPDatabase } from "idb";
import { useMemo, useState } from "react";
import {
  BACKUP_MAX_CHARS,
  exportBackup,
  importBackup,
  serializeBackup,
  wipeLocalData,
} from "../lib/backup.js";
import { createDirectModeController } from "../lib/direct-mode.js";
import { downloadText } from "../lib/download.js";
import type { SettingsStore } from "../lib/settings.js";
import { SettingsView } from "./settings-view.js";

/** Both actions replace every store, so the panel reloads and every view reads the new data. */
export function SettingsPanel({
  db,
  settings,
  directMode,
  onDirectModeChange,
  reload = () => window.location.reload(),
}: {
  db: Promise<IDBPDatabase>;
  settings: SettingsStore;
  directMode: boolean;
  /** Called after the stored setting changed, so the app reads it again. */
  onDirectModeChange: () => void;
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

  const direct = useMemo(
    () =>
      createDirectModeController({
        save: (on) => settings.setDirectMode(on),
        requestOrigins: (origins) => chrome.permissions.request({ origins }),
      }),
    [settings],
  );

  return (
    <SettingsView
      confirmingWipe={confirmingWipe}
      busy={busy}
      message={message}
      directMode={directMode}
      onToggleDirect={(on) =>
        void run(async () => {
          const result = on ? await direct.enable() : await direct.disable();
          setMessage(result.ok ? null : result.message);
          onDirectModeChange();
        })
      }
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
