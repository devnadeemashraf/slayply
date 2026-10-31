import { Popover } from "@slayply/ui";
import { useRef, useState } from "react";
import { chipLabel } from "../lib/model-chip.js";
import type { ModelChoice } from "../lib/models-client.js";
import type { Settings } from "../lib/settings.js";
import { ModelPicker } from "./model-picker.js";

type Choice = Pick<Settings, "provider" | "model" | "effort">;

/** The app bar chip: shows the model in use and opens provider, model and effort in a popover. */
export function ModelChip({
  settings,
  models,
  loading,
  note,
  onChoice,
  initialOpen = false,
}: {
  settings: Pick<Settings, "provider" | "model" | "effort" | "directMode">;
  models: readonly ModelChoice[] | null;
  loading: boolean;
  note: string | null;
  onChoice: (choice: Choice) => void;
  /** Starts with the popover open (for tests). */
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const trigger = useRef<HTMLButtonElement>(null);
  const { provider, model, effort, directMode } = settings;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="sl-chip sl-chip-button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        {chipLabel(settings, models)}
      </button>
      <Popover open={open} label="Model" onClose={() => setOpen(false)} trigger={trigger}>
        <ModelPicker
          provider={provider}
          models={models}
          loading={loading}
          note={note}
          model={model}
          effort={effort}
          disabled={false}
          lockModel={directMode}
          onProvider={(next) => onChoice({ provider: next, model: "", effort: "" })}
          onModel={(next) => onChoice({ provider, model: next, effort })}
          onEffort={(next) => onChoice({ provider, model, effort: next })}
        />
      </Popover>
    </>
  );
}
