import { FIELD_ORIGINS, loadSettings, saveSettings } from "./options.js";
import { applyTheme, beginSignIn, byId, notice, send } from "./ui.js";

// Account

let current;
async function display() {
  current = await send("status");
  byId("signin").hidden = !!current;
  byId("connected").hidden = !current;
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
    await signingIn;
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
  byId("theme").value = settings.theme;
}

byId("field-button").addEventListener("click", () => {
  const turnOn = byId("field-button").getAttribute("aria-checked") !== "true";
  // Request in the click itself: Firefox only shows permission prompts for a user action.
  const granted = turnOn ? browser.permissions.request({ origins: FIELD_ORIGINS }) : Promise.resolve(true);
  (async () => {
    autofillNotice();
    if (!await granted) {
      autofillNotice("The button needs access to websites to find their email fields.", true);
      return;
    }
    await saveSettings({ fieldButton: turnOn });
    await showOptions();
    if (turnOn) autofillNotice("On. Pages you already have open show the button once they finish loading or after a reload.");
  })().catch(error => autofillNotice(error.message, true));
});

byId("button-outside").addEventListener("click", () => {
  saveSettings({ buttonOutside: byId("button-outside").getAttribute("aria-checked") !== "true" })
    .then(showOptions, error => autofillNotice(error.message, true));
});

byId("theme").addEventListener("change", () => {
  applyTheme(byId("theme").value);
  saveSettings({ theme: byId("theme").value }).catch(error => autofillNotice(error.message, true));
});

display().catch(error => notice(error.message, true));
showOptions().catch(error => autofillNotice(error.message, true));
