import { Button } from "@slayply/ui";
import type { PrimaryAction } from "../lib/job-steps.js";

/** The one next step for the job, pinned above the tab bar so it is never scrolled away. */
export function ActionBar({
  action,
  onFit,
  onAnswers,
  onStop,
}: {
  action: PrimaryAction;
  onFit: () => void;
  onAnswers: () => void;
  onStop: () => void;
}) {
  const onClick = action.kind === "fit" ? onFit : action.kind === "answers" ? onAnswers : onStop;
  return (
    <div className="action-bar">
      {action.hint && <p className="muted">{action.hint}</p>}
      <Button
        variant={action.kind === "stop" ? "secondary" : "primary"}
        disabled={action.disabled}
        onClick={onClick}
      >
        {action.label}
      </Button>
    </div>
  );
}
