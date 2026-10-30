/**
 * Job-board hosts the user can allow in one click, so the panel's Capture button and embedded
 * application forms work without a prompt per site. They are match patterns for the optional host
 * permission for any https site that is declared in the manifest. The exact hosts of each vendor are from general
 * knowledge and unverified (see docs/VERSIONS.md); a missing host falls back to the one-time per-site
 * prompt. Only application and careers hosts are listed: HR, payroll, learning and cloud-platform
 * domains (for example all of oraclecloud.com, which hosts Oracle Recruiting tenants next to storage
 * and customer apps) are left out, so those sites ask once instead. LinkedIn is never listed.
 */
export const JOB_SITE_ORIGINS: readonly string[] = [
  "https://boards.greenhouse.io/*",
  "https://job-boards.greenhouse.io/*",
  "https://boards.eu.greenhouse.io/*",
  "https://job-boards.eu.greenhouse.io/*",
  "https://jobs.lever.co/*",
  "https://jobs.eu.lever.co/*",
  "https://jobs.ashbyhq.com/*",
  "https://*.myworkdayjobs.com/*",
  "https://*.myworkdaysite.com/*",
  "https://*.taleo.net/*",
  "https://*.icims.com/*",
  "https://jobs.smartrecruiters.com/*",
  "https://careers.smartrecruiters.com/*",
  "https://apply.workable.com/*",
  "https://jobs.workable.com/*",
  "https://jobs.jobvite.com/*",
  "https://*.recruitee.com/*",
  "https://*.teamtailor.com/*",
  "https://*.jobs.personio.de/*",
  "https://*.jobs.personio.com/*",
  "https://ats.rippling.com/*",
  "https://*.jobs2web.com/*",
  "https://*.breezy.hr/*",
  "https://jobs.dayforcehcm.com/*",
  "https://recruiting.ultipro.com/*",
  "https://recruiting.paylocity.com/*",
  "https://*.applytojob.com/*",
];

/** The slice of `chrome.permissions` used here. */
export type SiteAccessApi = {
  contains(query: { origins: string[] }): Promise<boolean>;
  getAll(): Promise<{ origins?: string[] }>;
  request(query: { origins: string[] }): Promise<boolean>;
  remove(query: { origins: string[] }): Promise<boolean>;
};

export type SiteAccessResult = { ok: true } | { ok: false; message: string };

export function createSiteAccessController(permissions: SiteAccessApi) {
  const query = { origins: [...JOB_SITE_ORIGINS] };
  return {
    async isEnabled(): Promise<boolean> {
      // Any listed origin still granted counts as on, so removing one in the browser's settings
      // does not make the switch lie; turning it off then removes the rest.
      try {
        const granted = new Set((await permissions.getAll()).origins ?? []);
        return JOB_SITE_ORIGINS.some((origin) => granted.has(origin));
      } catch {
        return false;
      }
    },

    /** Must run from a click: the browser asks for the whole list at once. */
    async enable(): Promise<SiteAccessResult> {
      try {
        return (await permissions.request(query))
          ? { ok: true }
          : { ok: false, message: "Job-site access was not allowed. Nothing changed." };
      } catch {
        return { ok: false, message: "The browser could not ask for job-site access." };
      }
    },

    async disable(): Promise<SiteAccessResult> {
      try {
        await permissions.remove(query);
        return { ok: true };
      } catch {
        return { ok: false, message: "The browser could not remove job-site access." };
      }
    },
  };
}
