import { byId, notice, send } from "./ui.js";
import { siteDefaults } from "./site.js";

let account;
let aliases = [];
let loaded = false;
let busy = false;
const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

function render() {
  const needle = byId("search").value.trim().toLowerCase();
  const visible = aliases.filter(alias => [alias.email, alias.description, alias.forDomain]
    .some(value => value?.toLowerCase().includes(needle)));
  byId("count").textContent = loaded ? (needle ? visible.length + " of " : "") + aliases.length + (aliases.length === 1 ? " address" : " addresses") : "";
  byId("empty").hidden = !loaded || visible.length > 0;
  byId("empty").textContent = aliases.length ? "No matching addresses." : "Your first address will appear here.";
  const fragment = document.createDocumentFragment();
  for (const alias of visible) {
    const row = byId("row").content.cloneNode(true);
    const copy = row.querySelector(".copy");
    copy.textContent = alias.email;
    copy.setAttribute("aria-label", "Copy " + alias.email);
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(alias.email);
        notice("Address copied.");
      } catch { notice("Copy failed. Select the address to copy it manually.", true); }
    };
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
    row.querySelector(".description").textContent = alias.description || alias.forDomain || "";
    const created = Date.parse(alias.createdAt);
    const date = Number.isFinite(created) ? "Created " + dateFormat.format(created) : "";
    row.querySelector(".date").textContent = Date.parse(alias.expiresAt) <= Date.now() ? "Expired · " + date : date;
    fragment.append(row);
  }
  byId("aliases").replaceChildren(fragment);
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

byId("account").onclick = byId("setup").onclick = () => browser.runtime.openOptionsPage();
byId("search").oninput = render;
byId("reload").onclick = () => act(load);
byId("composer").onsubmit = event => {
  event.preventDefault();
  act(async () => {
    const created = await send("create", { key: account.key, prefix: byId("prefix").value.trim(), description: byId("description").value.trim() });
    byId("composer").reset();
    byId("search").value = "";
    const confirmation = created.email ? "Created " + created.email : "Address created.";
    notice(confirmation);
    try { await load(); }
    catch { notice(confirmation + " Refresh to reload the list.", true); }
  });
};

// Prefill from the active tab. defaultValue makes the form's reset() restore these after each create.
async function prefill() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const defaults = tab?.url && siteDefaults(tab.url);
  if (!defaults) return;
  byId("prefix").defaultValue = defaults.prefix;
  byId("description").defaultValue = defaults.description;
}

async function start() {
  prefill().catch(() => {});
  account = await send("status");
  notice();
  byId("welcome").hidden = !!account;
  byId("account").hidden = !account;
  byId("workspace").hidden = !account;
  if (account) await act(load);
}
start().catch(error => notice(error.message, true));
