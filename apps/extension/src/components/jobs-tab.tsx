import type { JobRecord, JobStatus } from "@slayply/core";
import { useCallback, useEffect, useState } from "react";
import type { JobStore } from "../lib/job-store.js";
import { JobsView } from "./jobs-view.js";

/** `refresh` changes whenever a job is saved elsewhere, so the list reloads while this tab is hidden. */
export function JobsTab({ store, refresh }: { store: JobStore; refresh: number }) {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      store.list().then(
        (list) => {
          setJobs(list);
          setError(null);
        },
        () => setError("The saved jobs could not be read."),
      ),
    [store],
  );
  useEffect(() => {
    void load();
  }, [load, refresh]);

  const change = (run: Promise<void>) =>
    run.then(load, () => setError("That change could not be saved."));

  return (
    <JobsView
      jobs={jobs}
      error={error}
      onStatus={(id: string, status: JobStatus) => void change(store.setStatus(id, status))}
      onRemove={(id: string) => void change(store.remove(id))}
    />
  );
}
