export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className="sl-switch"
      onClick={() => onChange(!checked)}
    >
      <span className="sl-switch-track" aria-hidden="true">
        <span className="sl-switch-thumb" />
      </span>
      <span>{label}</span>
    </button>
  );
}
