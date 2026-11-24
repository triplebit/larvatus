import "./compat.js";
import { FIELD_ORIGINS, loadSettings, saveSettings } from "./options.js";
import { SITE_DATA, siteAllowed, siteChoice } from "./site.js";
import { PREFIX_PATTERN, PREFIX_RULE } from "./stalwart.js";
import { applyTheme, beginSignIn, byId, notice, send } from "./ui.js";

// Account

let current;
async function display() {
  current = await send("status");
  byId("signin").hidden = !!current;
  byId("connected").hidden = !current;
  // The other settings and the donation ask wait for a connected account.
  byId("support").hidden = !current;
  for (const card of document.querySelectorAll(".needs-account")) {
    card.inert = !current;
    card.classList.toggle("inactive", !current);
  }
  if (current) {
    byId("user").textContent = current.username;
    byId("host").textContent = current.origin;
  }
}

byId("connect-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = byId("connect");
  try {
    const signingIn = beginSignIn(byId("server").value);
    button.disabled = true;
    notice("Waiting for Stalwart sign-in…");
    // Chromium answers before the sign-in window is done; the storage listener below takes over.
    if (await signingIn === null) return notice("Finish signing in in the Stalwart window.");
    await display();
    notice();
  } catch (error) {
    notice(error.message, true);
  } finally {
    button.disabled = false;
  }
});

byId("disconnect").addEventListener("click", async () => {
  byId("disconnect").disabled = true;
  try {
    const message = await send("disconnect", { key: current.key });
    await display();
    notice(message);
  } catch (error) {
    notice(error.message, true);
  } finally {
    byId("disconnect").disabled = false;
  }
});

// Options

function autofillNotice(message = "", error = false) {
  byId("autofill-notice").textContent = message;
  byId("autofill-notice").classList.toggle("error", error);
}

function setSwitch(id, on) {
  byId(id).setAttribute("aria-checked", String(on));
}

async function showOptions() {
  const settings = await loadSettings();
  // Website access can be withdrawn in Firefox's add-on manager, which turns the button off too.
  const fieldButton = settings.fieldButton && await browser.permissions.contains({ origins: FIELD_ORIGINS });
  setSwitch("field-button", fieldButton);
  setSwitch("button-outside", settings.buttonOutside);
  byId("outside-option").classList.toggle("dimmed", !fieldButton);
  byId("button-outside").disabled = !fieldButton;
  byId("prefix-option").classList.toggle("dimmed", !fieldButton);
  for (const radio of document.getElementsByName("field-prefix")) {
    radio.checked = radio.value === settings.fieldPrefix;
    radio.disabled = !fieldButton;
  }
  byId("custom-prefix").hidden = settings.fieldPrefix !== "custom";
  byId("custom-prefix").disabled = !fieldButton;
  if (document.activeElement !== byId("custom-prefix")) byId("custom-prefix").value = settings.fieldCustomPrefix;
  checkCustomPrefix();
  for (const radio of document.getElementsByName("theme")) radio.checked = radio.value === settings.theme;
  // The permission itself is this setting. Browsers that offer no choice always use the site.
  if (siteChoice()) {
    byId("site-option").hidden = false;
    setSwitch("site-data", await siteAllowed());
  }
}

byId("field-button").addEventListener("click", () => {
  const turnOn = byId("field-button").getAttribute("aria-checked") !== "true";
  // Request in the click itself: Firefox only shows permission prompts for a user action.
  // One prompt also asks to use the site, which Firefox grants with website access or not at all.
  const request = { origins: FIELD_ORIGINS, ...siteChoice() && SITE_DATA };
  const granted = turnOn ? browser.permissions.request(request) : Promise.resolve(true);
  (async () => {
    autofillNotice();
    // Website access is all the button needs, and may have been granted before.
    if (!await granted && !await browser.permissions.contains({ origins: FIELD_ORIGINS })) {
      autofillNotice("The button needs access to websites to find their email fields.", true);
      return;
    }
    await saveSettings({ fieldButton: turnOn });
    await showOptions();
  })().catch(error => autofillNotice(error.message, true));
});

byId("site-data").addEventListener("click", () => {
  const turnOn = byId("site-data").getAttribute("aria-checked") !== "true";
  const changed = turnOn ? browser.permissions.request(SITE_DATA) : browser.permissions.remove(SITE_DATA);
  autofillNotice();
  changed.then(done => done || autofillNotice("Your browser needs permission to use the site’s address.", true),
    error => autofillNotice(error.message, true));
});
// The switches follow the permissions, including changes made in the browser's add-on manager.
browser.permissions.onAdded.addListener(() => showOptions().catch(error => autofillNotice(error.message, true)));
browser.permissions.onRemoved.addListener(() => showOptions().catch(error => autofillNotice(error.message, true)));

byId("button-outside").addEventListener("click", () => {
  saveSettings({ buttonOutside: byId("button-outside").getAttribute("aria-checked") !== "true" })
    .then(showOptions, error => autofillNotice(error.message, true));
});

// The custom prefix is saved only while it meets Stalwart's rule; until then the button reports it.
function checkCustomPrefix() {
  const input = byId("custom-prefix");
  const value = input.value.trim();
  const valid = PREFIX_PATTERN.test(value);
  const shown = !input.hidden;
  input.setAttribute("aria-invalid", String(shown && !valid));
  const help = byId("custom-prefix-help");
  help.textContent = !shown ? "" : valid ? "New addresses look like " + value.toLowerCase() + ".randomsuffix@your-domain." : PREFIX_RULE;
  help.classList.toggle("error", shown && !valid);
  return valid ? value : null;
}

for (const radio of document.getElementsByName("field-prefix")) {
  radio.addEventListener("change", () => {
    byId("custom-prefix").hidden = radio.value !== "custom";
    checkCustomPrefix();
    if (radio.value === "custom") byId("custom-prefix").focus();
    saveSettings({ fieldPrefix: radio.value }).catch(error => autofillNotice(error.message, true));
  });
}

let prefixTimer = 0;
byId("custom-prefix").addEventListener("input", () => {
  const value = checkCustomPrefix();
  clearTimeout(prefixTimer);
  if (value !== null) prefixTimer = setTimeout(() => saveSettings({ fieldCustomPrefix: value }).catch(error => autofillNotice(error.message, true)), 300);
});

for (const radio of document.getElementsByName("theme")) {
  radio.addEventListener("change", () => {
    applyTheme(radio.value);
    saveSettings({ theme: radio.value }).catch(error => autofillNotice(error.message, true));
  });
}

// A sign-in can finish after this page's own request has lost its reply (Chromium may restart the
// background service worker meanwhile), so follow the stored account too.
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if ("connection" in changes) display().then(() => notice(), error => notice(error.message, true));
  if (changes.signinError?.newValue) notice(changes.signinError.newValue, true);
});

display().catch(error => notice(error.message, true));
showOptions().catch(error => autofillNotice(error.message, true));
