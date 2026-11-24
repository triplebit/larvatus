// Second-level labels that sit under a country code, e.g. bbc.co.uk or abc.net.au.
const COUNTRY_SECOND_LEVEL = new Set(["ac", "co", "com", "edu", "gov", "ltd", "net", "ne", "or", "org", "plc", "sch"]);

// The label a person would call the site: "google" for mail.google.com, "bbc" for www.bbc.co.uk.
export function siteLabel(hostname) {
  const labels = hostname.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (labels.length < 2) return labels[0] || "";
  const [second, top] = labels.slice(-2);
  const underCountry = labels.length > 2 && top.length === 2 && COUNTRY_SECOND_LEVEL.has(second);
  return labels.at(underCountry ? -3 : -2);
}

// Stalwart prefixes: 1–64 ASCII letters, digits or underscores, starting with a letter or digit.
export function toPrefix(label) {
  return label.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}

// Firefox lets people decline sending the sites they visit to their mail server: the optional browsingActivity
// data permission. Browsers whose manifest does not offer that choice (Chromium, Safari) may always use the site.
export const SITE_DATA = { data_collection: ["browsingActivity"] };
export const siteChoice = () => !!browser.runtime.getManifest().browser_specific_settings?.gecko
  ?.data_collection_permissions?.optional?.includes("browsingActivity");
export async function siteAllowed() {
  // getAll() has no data_collection where the browser lacks the built-in consent, so the site is then not used.
  return !siteChoice() || !!(await browser.permissions.getAll()).data_collection?.includes("browsingActivity");
}

const isIp = hostname => /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith("[");

export function siteDefaults(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) return null;
  const { hostname } = parsed;
  return {
    prefix: isIp(hostname) ? "" : toPrefix(siteLabel(hostname)),
    description: "Created on " + hostname
  };
}
