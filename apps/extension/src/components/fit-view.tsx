import {
  type CheckedMatch,
  checkFitMatches,
  type FitCheck,
  type StoredResume,
} from "@slayply/core";
import { Badge, type BadgeTone, Button, Card, Drawer } from "@slayply/ui";
import { useEffect, useMemo, useState } from "react";
import type { GenerationState } from "../lib/generate-controller.js";
import { ActivityIndicator } from "./activity-indicator.js";
import { ErrorNotice } from "./error-notice.js";

const CHANCE_TONE: Record<FitCheck["chance"], BadgeTone> = {
  high: "ok",
  medium: "warn",
  low: "bad",
};

export type FitResult = {
  fit: FitCheck;
  /** The facts and stories the result was checked against, not today's profile. */
  profile: Parameters<typeof checkFitMatches>[1];
  /** True when it came from the saved copy for this job instead of a new run. */
  cached: boolean;
};

export type ResumeSuggestion = { resume: StoredResume; active: boolean };

function MatchRow({ row }: { row: CheckedMatch }) {
  const missing = row.status === "uncited";
  const invalid = row.invalidIds.length > 0 ? `: ${row.invalidIds.join(", ")}` : "";
  return (
    <tr>
      <td>{row.match.want}</td>
      <td>
        {row.match.have}
        {missing && <span className="muted"> (no matching fact{invalid})</span>}
        {row.cited.length > 0 && (
          <ul className="citations">
            {row.cited.map((source) => (
              <li key={source.id}>
                <strong>{source.id}</strong> {source.text}
              </li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}

function List({ title, items }: { title: string; items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  );
}

function ResumeLine({
  fit,
  suggestion,
  onUseResume,
}: {
  fit: FitCheck;
  suggestion: ResumeSuggestion | null;
  onUseResume: () => void;
}) {
  const label = `Recommended resume: ${fit.resume.track}, ${fit.resume.region}.`;
  if (!suggestion) {
    return (
      <p>
        {label} <span className="muted">No saved resume has that track. Pick one yourself.</span>
      </p>
    );
  }
  if (suggestion.active) {
    return (
      <p>
        {label} <span className="muted">"{suggestion.resume.name}" is selected.</span>
      </p>
    );
  }
  return (
    <p>
      {label}{" "}
      <Button variant="secondary" onClick={onUseResume}>
        {`Use this resume (${suggestion.resume.name})`}
      </Button>
    </p>
  );
}

function Result({
  result,
  suggestion,
  onUseResume,
  onRerun,
}: {
  result: FitResult;
  suggestion: ResumeSuggestion | null;
  onUseResume: () => void;
  onRerun: () => void;
}) {
  const { fit } = result;
  const rows = useMemo(() => checkFitMatches(fit, result.profile), [fit, result.profile]);
  return (
    <>
      <p>
        <Badge tone={CHANCE_TONE[fit.chance]}>{`Chance: ${fit.chance}`}</Badge> {fit.reason}
      </p>
      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>They want</th>
              <th>You have</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <MatchRow key={index} row={row} />
            ))}
          </tbody>
        </table>
      )}
      <List title="Gaps" items={fit.gaps} />
      <List title="Deal-breakers" items={fit.dealBreakers} />
      <ResumeLine fit={fit} suggestion={suggestion} onUseResume={onUseResume} />
      {fit.salaryAnswer && (
        <>
          <h4>Suggested salary answer</h4>
          <p className="answer">{fit.salaryAnswer}</p>
        </>
      )}
      <p className="muted">
        {result.cached ? "Saved result for this job. " : ""}
        <Button variant="secondary" onClick={onRerun}>
          Run again
        </Button>
      </p>
    </>
  );
}

/** Renders a fit check. Model output is plain text children only, never HTML. */
export function FitView({
  state,
  result,
  suggestion,
  onUseResume,
  onRerun,
  onCancel,
  direct = false,
  compact = false,
  initialDetailsOpen = false,
}: {
  state: GenerationState;
  result: FitResult | null;
  suggestion: ResumeSuggestion | null;
  onUseResume: () => void;
  onRerun: () => void;
  /** Stops the running check; the indicator shows Cancel only when this is given. */
  onCancel?: () => void;
  /** Direct Mode: error advice about choosing another model does not apply. */
  direct?: boolean;
  /** A summary card with a Details drawer instead of the whole result. */
  compact?: boolean;
  /** Starts with the details drawer open (for tests). */
  initialDetailsOpen?: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(initialDetailsOpen);
  // A re-run or a cleared result closes the drawer, so it does not pop open when the next result lands.
  const busy = state.phase === "streaming" || result === null;
  useEffect(() => {
    if (busy) setDetailsOpen(false);
  }, [busy]);
  if (state.phase === "streaming") {
    return (
      <ActivityIndicator
        stage={state.stage}
        attempt={state.attempt}
        startedAt={state.startedAt}
        onCancel={onCancel}
      />
    );
  }
  if (state.phase === "error") {
    return (
      <ErrorNotice code={state.code} message={state.message} onRetry={onRerun} direct={direct} />
    );
  }
  if (state.phase === "raw") {
    return (
      <section className="result">
        <p className="notice">
          Unvalidated, check before use. The reply was not in the expected format.
        </p>
        <p className="answer">{state.rawText}</p>
      </section>
    );
  }
  if (!result) return null;
  if (compact) {
    const full = (
      <Result result={result} suggestion={suggestion} onUseResume={onUseResume} onRerun={onRerun} />
    );
    return (
      <div className="result" aria-live="polite">
        <Card title="Fit check">
          <p>
            <Badge tone={CHANCE_TONE[result.fit.chance]}>{`Chance: ${result.fit.chance}`}</Badge>{" "}
            {result.fit.reason}
          </p>
          <Button variant="secondary" onClick={() => setDetailsOpen(true)}>
            Details
          </Button>
        </Card>
        <Drawer open={detailsOpen} title="Fit check" onClose={() => setDetailsOpen(false)}>
          {full}
        </Drawer>
      </div>
    );
  }
  return (
    <div className="result" aria-live="polite">
      <Card title="Fit check">
        <Result
          result={result}
          suggestion={suggestion}
          onUseResume={onUseResume}
          onRerun={onRerun}
        />
      </Card>
    </div>
  );
}
