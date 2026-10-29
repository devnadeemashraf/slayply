import { isLinkedInUrl } from "./capture.js";

/** The slice of `chrome.permissions` used here. */
export type PermissionsApi = {
  contains(query: { origins: string[] }): Promise<boolean>;
  request(query: { origins: string[] }): Promise<boolean>;
};

/**
 * Makes sure the panel's Capture button may read the site of the active tab. `activeTab` only covers
 * the tab and page where the icon was last clicked, so for any other page the user is asked once per
 * site (from the click itself) and the grant then lasts. LinkedIn, browser pages and other schemes are
 * never asked for: LinkedIn stays selection-only through the icon or the right-click menu.
 */
export async function ensureSiteAccess(url: string, permissions: PermissionsApi): Promise<boolean> {
  if (isLinkedInUrl(url)) return false;
  let origin: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    origin = `${parsed.origin}/*`;
  } catch {
    return false;
  }
  try {
    if (await permissions.contains({ origins: [origin] })) return true;
    return await permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}
