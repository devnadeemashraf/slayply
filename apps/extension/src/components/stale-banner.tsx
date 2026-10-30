export function StaleBanner({
  host,
  busy,
  onCapture,
  onDismiss,
}: {
  host: string;
  busy: boolean;
  onCapture: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="notice" role="status">
      <p>
        {host === ""
          ? "You have moved to another page."
          : `This draft is from ${host}, and you have moved on.`}
      </p>
      <div className="row">
        <button type="button" disabled={busy} onClick={onCapture}>
          Capture this page
        </button>
        <button type="button" className="secondary" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
