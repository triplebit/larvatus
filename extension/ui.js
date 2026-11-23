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
