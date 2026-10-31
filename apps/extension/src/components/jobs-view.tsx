import { JOB_STATUSES, type JobRecord, type JobStatus } from "@slayply/core";
import { Badge, Button, Card, EmptyState } from "@slayply/ui";
import { PLAYFUL } from "../lib/copy-text.js";

const LABELS: Record<JobStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  rejected: "Rejected",
  offer: "Offer",
};

export const statusLabel = (status: JobStatus): string => LABELS[status];

/** Saved jobs and where each stands. Stored text is rendered as text, never as markup. */
export function JobsView({
  jobs,
  error,
  onStatus,
  onRemove,
}: {
  jobs: readonly JobRecord[];
  error: string | null;
  onStatus: (id: string, status: JobStatus) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section>
      <div className="jobs-head">
        <h2>Saved jobs</h2>
        {jobs.length > 0 && <span className="muted">{`${jobs.length} saved`}</span>}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {jobs.length === 0 ? (
        <EmptyState title={PLAYFUL.jobsEmptyTitle}>{PLAYFUL.jobsEmptyBody}</EmptyState>
      ) : (
        jobs.map((job) => (
          <Card key={job.id}>
            <h3>{[job.title || "Untitled job", job.company].filter(Boolean).join(" at ")}</h3>
            <Badge>{statusLabel(job.status)}</Badge>
            <p className="muted">
              {[
                job.location,
                job.resumeName && `Resume: ${job.resumeName}`,
                job.updatedAt.slice(0, 10),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <label htmlFor={`status-${job.id}`}>Status</label>
            <select
              id={`status-${job.id}`}
              value={job.status}
              onChange={(event) => onStatus(job.id, event.target.value as JobStatus)}
            >
              {JOB_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
            {job.answers.length > 0 && (
              <details>
                <summary>{`Answers (${job.answers.length})`}</summary>
                {job.answers.map((answer, index) => (
                  <div key={`${index}:${answer.question}`}>
                    <p className="muted">{answer.question}</p>
                    <p>{answer.text}</p>
                  </div>
                ))}
              </details>
            )}
            <Button variant="secondary" onClick={() => onRemove(job.id)}>
              Remove job
            </Button>
          </Card>
        ))
      )}
    </section>
  );
}
