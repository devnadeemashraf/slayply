import { Button } from "@slayply/ui";
import { useEffect, useState } from "react";
import { formatElapsed, isSlow, type Stage, stageLabel } from "../lib/activity.js";
import { SERIOUS } from "../lib/copy-text.js";

/** The display only: stage, elapsed time, the slow-run note and Cancel. */
export function ActivityView({
  stage,
  attempt,
  elapsedMs,
  onCancel,
}: {
  stage: Stage;
  attempt: 1 | 2;
  elapsedMs: number;
  onCancel?: () => void;
}) {
  return (
    <div className="activity">
      <div className="activity-row">
        <span role="status">
          {stageLabel(stage, attempt)}
          {isSlow(elapsedMs) && <span className="sr-only"> {SERIOUS.slowRun}</span>}
        </span>
        {/* The clock stays out of the live region so a screen reader is not read every second. */}
        <time className="muted" aria-hidden="true">
          {formatElapsed(elapsedMs)}
        </time>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            {SERIOUS.cancel}
          </Button>
        )}
      </div>
      {isSlow(elapsedMs) && <p className="muted">{SERIOUS.slowRun}</p>}
    </div>
  );
}

/** Ticks once a second from `startedAt` while mounted. */
export function ActivityIndicator({
  stage,
  attempt,
  startedAt,
  onCancel,
}: {
  stage: Stage;
  attempt: 1 | 2;
  startedAt: number;
  onCancel?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <ActivityView stage={stage} attempt={attempt} elapsedMs={now - startedAt} onCancel={onCancel} />
  );
}
