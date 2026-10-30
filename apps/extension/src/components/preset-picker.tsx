import { Chip, PRESETS, type Preset } from "@slayply/ui";

const LABELS: Record<Preset, string> = { neon: "Neon", bubblegum: "Bubblegum", brutal: "Brutal" };

export function PresetPicker({
  value,
  onChange,
}: {
  value: Preset;
  onChange: (preset: Preset) => void;
}) {
  return (
    <fieldset className="plain">
      <legend>Look</legend>
      <div className="row">
        {PRESETS.map((preset) => (
          <Chip key={preset} selected={preset === value} onClick={() => onChange(preset)}>
            {LABELS[preset]}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}
