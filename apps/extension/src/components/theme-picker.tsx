import { Chip, THEMES, type Theme } from "@slayply/ui";

const LABELS: Record<Theme, string> = { auto: "Match system", light: "Light", dark: "Dark" };

export function ThemePicker({
  value,
  onChange,
}: {
  value: Theme;
  onChange: (theme: Theme) => void;
}) {
  return (
    <fieldset className="plain">
      <legend>Theme</legend>
      <div className="row">
        {THEMES.map((theme) => (
          <Chip key={theme} selected={theme === value} onClick={() => onChange(theme)}>
            {LABELS[theme]}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}
