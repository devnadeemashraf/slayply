import { defineConfig } from "wxt";

// Relay base URL baked in at build time. The production URL arrives with SITE-01.
const relayUrl = resolveRelayUrl(process.env.WXT_RELAY_URL);

function resolveRelayUrl(value: string | undefined): string {
  if (value === undefined || value === "") {
    // Local builds default to the dev relay; only a release build (WXT_RELEASE=1) must name one.
    if (process.env.WXT_RELEASE === "1") {
      throw new Error("WXT_RELAY_URL must be set for a release build");
    }
    return "http://localhost:3000";
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("WXT_RELAY_URL is not a valid URL");
  }
  const local = url.protocol === "http:" && url.hostname === "localhost";
  if (url.protocol !== "https:" && !local) {
    throw new Error("WXT_RELAY_URL must use https (http is allowed only for localhost)");
  }
  return value;
}

export default defineConfig({
  srcDir: "src",
  manifest: {
    name: "Slayply",
    description: "Turn a job description and its questions into honest, grounded answers.",
    // activeTab is granted by the user clicking the icon or a context menu item and lets Slayply read
    // that one tab then; there is no broad host access.
    permissions: ["sidePanel", "storage", "contextMenus", "activeTab", "scripting"],
    // Asked for at Direct Mode toggle time (chrome.permissions.request), not at install.
    optional_host_permissions: ["https://api.anthropic.com/*"],
    host_permissions: [`${new URL(relayUrl).origin}/*`],
    action: { default_title: "Open Slayply" },
    // Blocks remote script and eval. Network access is limited only by host_permissions, which
    // grants (not restricts) cross-origin fetches; Direct Mode adds the provider host as an optional one.
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
  },
  vite: () => ({
    define: { __RELAY_URL__: JSON.stringify(relayUrl) },
  }),
});
