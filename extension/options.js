// Extension options, shared by the settings page, the popup and the background script.
// content.js keeps its own copy of the two field-button defaults because content scripts cannot import modules.
// fieldPrefix, the default prefix in the popup and for the field button: "site" names addresses after the site,
// "random" uses one random character, "custom" uses fieldCustomPrefix.
export const DEFAULTS = { fieldButton: false, buttonOutside: false, fieldPrefix: "random", fieldCustomPrefix: "", theme: "system" };

// Sites where the email field button may run. Firefox asks for this once, when the option is turned on.
export const FIELD_ORIGINS = ["https://*/*"];

export async function loadSettings() {
  const { settings } = await browser.storage.local.get("settings");
  return { ...DEFAULTS, ...settings };
}

export async function saveSettings(patch) {
  const settings = { ...await loadSettings(), ...patch };
  await browser.storage.local.set({ settings });
  return settings;
}
