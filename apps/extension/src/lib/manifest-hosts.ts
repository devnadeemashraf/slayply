/**
 * Hosts the extension may ask for at run time (`chrome.permissions.request` rejects anything not
 * declared here). Nothing is granted at install. `api.anthropic.com` is asked for at Direct Mode
 * time; the any-https-site entry only lets the panel ask for one site at a time, or the job-board list in
 * `job-sites.ts`, when the user clicks. LinkedIn is never requested (see `capture-access.ts`).
 */
export const OPTIONAL_HOST_PERMISSIONS: string[] = ["https://api.anthropic.com/*", "https://*/*"];
