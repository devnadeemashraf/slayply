export type CapturedPage = { tabId: number | undefined; url: string };
export type CurrentTab = { tabId: number | undefined; url: string | undefined };

/** Query parameters that name the job. Everything else (tracking, scroll or filter state) is ignored. */
const JOB_PARAMS = [
  "gh_jid",
  "currentjobid",
  "jobid",
  "job_id",
  "jk",
  "req",
  "requisitionid",
  "id",
];

const identity = (url: string): string => {
  try {
    const parsed = new URL(url);
    const params = JOB_PARAMS.flatMap((name) => {
      for (const [key, value] of parsed.searchParams) {
        if (key.toLowerCase() === name) return [`${name}=${value}`];
      }
      return [];
    });
    return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}?${params.sort().join("&")}`;
  } catch {
    return url;
  }
};

/** Same page for our purposes: same path and job id, ignoring the hash, tracking and other parameters. */
export function sameDocument(a: string, b: string): boolean {
  return identity(a) === identity(b);
}

/**
 * Whether the draft came from a page the user has since left. Different tab: stale. Same tab with a
 * different address (including a single-page navigation): stale. An address the browser does not
 * reveal (no host access) is never taken as a change, so the banner cannot be wrong about it.
 * Only comparing, never reading the page.
 */
export function isStale(captured: CapturedPage | null, current: CurrentTab | null): boolean {
  if (!captured || !current) return false;
  const movedTab =
    captured.tabId !== undefined && current.tabId !== undefined && captured.tabId !== current.tabId;
  if (movedTab) return true;
  if (current.url === undefined) return false;
  return !sameDocument(captured.url, current.url);
}
