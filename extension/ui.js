import { hostPattern, serverOrigin } from "./stalwart.js";

export const byId = id => document.getElementById(id);

export async function send(action, args = {}) {
  const response = await browser.runtime.sendMessage({ action, ...args });
  if (!response || response.error) throw new Error(response?.error || "The extension could not complete the request.");
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
