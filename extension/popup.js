import "./compat.js";
import { beginSignIn, byId, notice, send } from "./ui.js";
import { FIELD_ORIGINS, loadSettings } from "./options.js";
import { siteDefaults } from "./site.js";
import { aliasPage } from "./stalwart.js";

let account;
let aliases = [];
let loaded = false;
let busy = false;
let justCreated = null;
let quotaMessage = null;
const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

function copyable(button, email) {
  button.textContent = email;
  button.setAttribute("aria-label", "Copy " + email);
  button.onclick = async () => {
    try {
      await navigator.clipboard.writeText(email);
      notice("Address copied.");
    } catch { notice("Copy failed. Select the address to copy it manually.", true); }
  };
  return button;
}

const QUOTA_NOTE = "This quota can be configured by a Stalwart administrator in the admin dashboard.";

// Stalwart addresses look like prefix.randomsuffix@domain; prefixes cannot contain dots.
const prefixOf = email => email.toLowerCase().split("@")[0].split(".")[0];

// The banner above the composer: the address just created, or existing ones that use the typed prefix.
function renderSpotlight() {
  let title, emails;
  const box = byId("spotlight");
  box.classList.toggle("quota", !!quotaMessage);
  if (quotaMessage) {
    // Stalwart's own wording, which includes the account's limit.
    box.hidden = false;
    box.classList.remove("created");
    byId("spotlight-title").textContent = quotaMessage;
    byId("spotlight-list").replaceChildren(Object.assign(document.createElement("small"), { textContent: QUOTA_NOTE }));
    return;
  }
  if (justCreated) {
    title = "New alias created, click to copy:";
    emails = [justCreated];
  } else {
    const prefix = byId("prefix").value.trim().toLowerCase();
    emails = prefix && loaded ? aliases.filter(alias => prefixOf(alias.email) === prefix).map(alias => alias.email) : [];
    title = emails.length > 1 ? emails.length + " aliases with this prefix already exist:" : "An alias with this prefix already exists:";
  }
  box.hidden = !emails.length;
  box.classList.toggle("created", !!justCreated);
  byId("spotlight-title").textContent = title;
  const shown = emails.slice(0, 3).map(email => copyable(Object.assign(document.createElement("button"), { type: "button", className: "copy" }), email));
  if (emails.length > shown.length) shown.push(Object.assign(document.createElement("small"), { textContent: "+" + (emails.length - shown.length) + " more in the list below" }));
  byId("spotlight-list").replaceChildren(...shown);
}

function render() {
  renderSpotlight();
  const needle = byId("search").value.trim().toLowerCase();
  const visible = aliases.filter(alias => [alias.email, alias.description, alias.forDomain]
    .some(value => value?.toLowerCase().includes(needle)));
  byId("count").textContent = loaded ? (needle ? visible.length + " of " : "") + aliases.length + (aliases.length === 1 ? " address" : " addresses") : "";
  byId("empty").hidden = !loaded || visible.length > 0;
  byId("empty").textContent = aliases.length ? "No matching addresses." : "Your first address will appear here.";
  const fragment = document.createDocumentFragment();
  for (const alias of visible) {
    const row = byId("row").content.cloneNode(true);
    copyable(row.querySelector(".copy"), alias.email);
    const edit = row.querySelector(".edit");
    edit.setAttribute("aria-label", "Edit " + alias.email + " in Stalwart");
    edit.onclick = () => browser.tabs.create({ url: aliasPage(account.origin, alias.id) }).then(() => window.close(), error => notice(error.message, true));
    const toggle = row.querySelector(".switch");
    toggle.setAttribute("aria-checked", String(alias.enable));
    toggle.setAttribute("aria-label", "Enable delivery to " + alias.email);
    toggle.title = alias.enable ? "Disable delivery" : "Enable delivery";
    toggle.onclick = () => act(async () => {
      await send("toggle", { key: account.key, id: alias.id, enable: !alias.enable });
      alias.enable = !alias.enable;
      if (toggle.isConnected) {
        toggle.setAttribute("aria-checked", String(alias.enable));
        toggle.title = alias.enable ? "Disable delivery" : "Enable delivery";
      } else {
        render();
      }
      notice(alias.enable ? "Delivery enabled." : "Delivery disabled.");
    });
    confirmDelete(row, alias);
    row.querySelector(".description").textContent = alias.description || alias.forDomain || "";
    const created = Date.parse(alias.createdAt);
    const date = Number.isFinite(created) ? "Created " + dateFormat.format(created) : "";
    row.querySelector(".date").textContent = Date.parse(alias.expiresAt) <= Date.now() ? "Expired · " + date : date;
    fragment.append(row);
  }
  byId("aliases").replaceChildren(fragment);
}

// Deleting asks inside the row: some browsers close the popup for a native confirm() dialog.
function confirmDelete(row, alias) {
  const remove = row.querySelector(".delete");
  const box = row.querySelector(".confirm");
  const text = box.querySelector("p");
  const [yes, cancel] = box.querySelectorAll("button");
  remove.setAttribute("aria-label", "Delete " + alias.email);
  text.id = "confirm-" + alias.id;
  text.textContent = "Delete " + alias.email + "? Mail sent to it will no longer be delivered. This cannot be undone.";
  box.setAttribute("aria-labelledby", text.id);
  remove.onclick = () => { box.hidden = false; cancel.focus(); };
  cancel.onclick = () => { box.hidden = true; remove.focus(); };
  yes.onclick = () => act(async () => {
    yes.disabled = true;
    try { await send("delete", { key: account.key, id: alias.id }); }
    finally { yes.disabled = false; }
    aliases = aliases.filter(item => item.id !== alias.id);
    if (justCreated === alias.email) justCreated = null;
    render();
    // The row and its focused button are gone. The heading, unlike the search box, opens no keyboard on a phone.
    Object.assign(byId("list-title"), { tabIndex: -1 }).focus();
    notice("Address deleted.");
  });
}

async function load() {
  aliases = await send("list", { key: account.key });
  loaded = true;
  render();
}

async function act(action) {
  if (busy) return;
  busy = true;
  byId("create").disabled = byId("reload").disabled = true;
  byId("workspace").setAttribute("aria-busy", "true");
  notice();
  try { await action(); }
  catch (error) { notice(error.message, true); }
  finally {
    busy = false;
    byId("create").disabled = byId("reload").disabled = false;
    byId("workspace").removeAttribute("aria-busy");
  }
}

byId("account").onclick = () => browser.runtime.openOptionsPage();
byId("enable-autofill").onclick = () => browser.runtime.openOptionsPage().then(() => window.close());

// Point to the on-page button in Settings while it is off (or Firefox has withdrawn its site access).
async function showAutofillHint() {
  const on = (await loadSettings()).fieldButton && await browser.permissions.contains({ origins: FIELD_ORIGINS });
  byId("enable-autofill").hidden = on;
}
byId("connect-form").onsubmit = event => {
  event.preventDefault();
  let signingIn;
  try { signingIn = beginSignIn(byId("server").value); }
  catch (error) { notice(error.message, true); return; }
  byId("connect").disabled = true;
  notice("Continue in the Stalwart sign-in window. You can reopen Larvatus when you’re done.");
  signingIn.then(start, error => notice(error.message, true)).finally(() => { byId("connect").disabled = false; });
};
byId("search").oninput = render;
byId("prefix").oninput = () => { justCreated = null; renderSpotlight(); };
byId("reload").onclick = () => act(load);
byId("composer").onsubmit = event => {
  event.preventDefault();
  act(async () => {
    quotaMessage = null;
    let created;
    try {
      created = await send("create", { key: account.key, prefix: byId("prefix").value.trim(), description: byId("description").value.trim() });
    } catch (error) {
      if (error.type !== "overQuota") throw error;
      justCreated = null;
      quotaMessage = error.message;
      renderSpotlight();
      return;
    }
    byId("composer").reset();
    byId("search").value = "";
    justCreated = created.email || null;
    try {
      await load();
      // Stalwart may leave the generated address out of the create response.
      justCreated = aliases.find(alias => alias.id === created.id)?.email || justCreated;
      renderSpotlight();
      if (!justCreated) notice("Address created.");
    } catch {
      renderSpotlight();
      notice((justCreated ? "" : "Address created. ") + "Refresh to reload the list.", true);
    }
  });
};

// Prefill from the active tab. defaultValue makes the form's reset() restore these after each create.
async function prefill() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const defaults = tab?.url && siteDefaults(tab.url);
  if (!defaults) return;
  byId("prefix").defaultValue = defaults.prefix;
  byId("description").defaultValue = defaults.description;
  renderSpotlight();
}

// Sign-in may have carried on in the background after this popup last closed.
async function showSignInState() {
  const state = await send("signin-state");
  if (state.origin && !byId("server").value) byId("server").value = new URL(state.origin).host;
  if (state.error) notice(state.error, true);
  else if (state.active) notice("Finish signing in in the Stalwart window.");
}

async function start() {
  prefill().catch(() => {});
  showAutofillHint().catch(() => {});
  account = await send("status");
  notice();
  if (!account) await showSignInState();
  byId("welcome").hidden = !!account;
  byId("account").hidden = !account;
  byId("workspace").hidden = !account;
  if (account) await act(load);
}
start().catch(error => notice(error.message, true));
