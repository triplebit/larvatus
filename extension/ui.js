import { DEFAULTS, loadSettings } from "./options.js";
import { hostPattern, serverOrigin } from "./stalwart.js";

// Theme: a localStorage copy applies the last choice before the first paint, then storage confirms it.
const THEME_CACHE = "maskedemail-theme";
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_CACHE, theme); } catch {}
}
try { document.documentElement.dataset.theme = localStorage.getItem(THEME_CACHE) || DEFAULTS.theme; } catch {}
loadSettings().then(settings => applyTheme(settings.theme), () => {});
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) applyTheme({ ...DEFAULTS, ...changes.settings.newValue }.theme);
});

export const byId = id => document.getElementById(id);

export async function send(action, args = {}) {
  const response = await browser.runtime.sendMessage({ action, ...args });
  if (!response || response.error) {
    throw Object.assign(new Error(response?.error || "The extension could not complete the request."), { type: response?.type });
  }
  return response.value;
}

export function notice(message = "", error = false) {
  const element = byId("notice");
  element.textContent = message;
  element.classList.toggle("error", error);
}

// Call straight from a submit handler: Firefox only shows the permission prompt for a user action.
// The prompt and the sign-in window can close the popup, so the background script records the
// server first and finishes sign-in on its own. The returned promise only settles while this page lives.
export function beginSignIn(value) {
  const origin = serverOrigin(value);
  const granted = browser.permissions.request({ origins: [hostPattern(origin)] });
  const noted = send("signin-pending", { origin });
  return (async () => {
    await noted;
    if (!await granted) throw new Error("Firefox needs permission to connect to this server.");
    return send("signin", { origin });
  })();
}
