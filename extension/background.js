import "./compat.js";
import { FIELD_ORIGINS, loadSettings } from "./options.js";
import { siteDefaults } from "./site.js";
import { PREFIX_PATTERN, authorize, completeAuthorization, createAlias, deleteAlias, getAlias, hostPattern, isChromium, listAliases,
  prepareAuthorization, redirectUri, refresh, revoke, serverOrigin, session, setEnabled } from "./stalwart.js";

const store = browser.storage.local;
function summary(connection) {
  return connection ? { key: connection.key, origin: connection.origin, username: connection.username } : null;
}

async function handle(message) {
  let { connection } = await store.get("connection");
  if (message.action === "status") return summary(connection);
  if (message.action === "signin-pending") {
    if (connection) throw new Error("An account is already connected. Disconnect it before signing in again.");
    await store.set({ pendingSignin: { origin: checkedOrigin(message.origin), at: Date.now() } });
    await store.remove("signinError");
    return null;
  }
  if (message.action === "signin-state") {
    // Report, then forget, an error from a sign-in that finished after its popup closed.
    const { pendingSignin, signinError } = await store.get(["pendingSignin", "signinError"]);
    await store.remove("signinError");
    return { active: !!signing, origin: fresh(pendingSignin)?.origin, error: signinError };
  }
  if (!connection || message.key !== connection.key) throw new Error("Your account changed. Reopen Larvatus.");
  if (message.action === "disconnect") {
    await store.remove("connection");
    try {
      await revoke(connection);
      return "Disconnected.";
    } catch {
      return "Disconnected from this browser. To revoke server access, remove Larvatus from your Stalwart connected applications.";
    }
  }

  return authorized(connection, async connection => {
    switch (message.action) {
      case "list":
        Object.assign(connection, await session(connection));
        await store.set({ connection });
        return listAliases(connection);
      case "create": return createAlias(connection, message.prefix, message.description);
      case "toggle": return setEnabled(connection, message.id, message.enable);
      case "delete":
        await deleteAlias(connection, message.id);
        return null;
      default: throw new Error("Unknown action.");
    }
  });
}

// Runs a request with a fresh access token, renewing once if the server rejects the current one.
async function authorized(connection, run) {
  async function renew() {
    try {
      connection = await refresh(connection);
      await store.set({ connection });
    } catch (error) {
      if (["invalid_grant", "invalid_client"].includes(error.code)) {
        await store.remove("connection");
        throw new Error("Your session has ended. Open Settings to sign in again.");
      }
      throw error;
    }
  }
  if (connection.expires && connection.expires < Date.now() + 30000) await renew();
  try {
    return await run(connection);
  } catch (error) {
    if (error.status !== 401) throw error;
    await renew();
    return run(connection);
  }
}

// The email field button: an address described by and associated with the tab's site, with the prefix chosen in Settings.
async function createForField(sender) {
  const settings = await loadSettings();
  if (!settings.fieldButton) throw new Error("The Larvatus button is turned off in Settings.");
  const url = sender.tab?.url || sender.url;
  const defaults = siteDefaults(url);
  if (!defaults) throw new Error("Larvatus can only create addresses on websites.");
  const prefix = fieldPrefix(settings, defaults);
  const { connection } = await store.get("connection");
  if (!connection) throw new Error("Sign in to Larvatus first. Open it from the browser toolbar.");
  return authorized(connection, async connection => {
    const created = await createAlias(connection, prefix, defaults.description, new URL(url).origin);
    // Stalwart may leave the generated address out of the create response.
    const email = created.email || (await getAlias(connection, created.id))?.email;
    if (!email) throw new Error("Stalwart created the address but did not return it. Open Larvatus to copy it.");
    return { email };
  });
}

// The prefix chosen in Settings: the site's name, none (createAlias picks one random character), or a custom one.
function fieldPrefix(settings, defaults) {
  if (settings.fieldPrefix === "random") return "";
  if (settings.fieldPrefix !== "custom") return defaults.prefix;
  const custom = settings.fieldCustomPrefix.trim();
  if (!PREFIX_PATTERN.test(custom)) throw new Error("Enter a custom prefix in Larvatus Settings, or choose another prefix option.");
  return custom;
}

// The email field content script runs only while the option is on and Firefox allows website access.
const FIELD_SCRIPT = { id: "email-fields", matches: FIELD_ORIGINS, js: ["fields.js", "content.js"],
  runAt: "document_idle", allFrames: true, persistAcrossSessions: true };
let syncing = Promise.resolve();
function syncFieldScript({ reregister = false } = {}) {
  syncing = syncing.then(async () => {
    const wanted = (await loadSettings()).fieldButton && await browser.permissions.contains({ origins: FIELD_ORIGINS });
    let registered = (await browser.scripting.getRegisteredContentScripts({ ids: [FIELD_SCRIPT.id] })).length > 0;
    if (registered && (!wanted || reregister)) {
      await browser.scripting.unregisterContentScripts({ ids: [FIELD_SCRIPT.id] });
      registered = false;
    }
    if (!wanted || registered) return;
    await browser.scripting.registerContentScripts([FIELD_SCRIPT]);
    if (reregister) return;
    // Newly turned on: add the button to pages that are already open, too.
    for (const tab of await browser.tabs.query({ url: FIELD_ORIGINS })) {
      browser.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: FIELD_SCRIPT.js }).catch(() => {});
    }
  }).catch(error => console.error("Larvatus could not update the email field button.", error));
  return syncing;
}
browser.runtime.onInstalled.addListener(() => syncFieldScript({ reregister: true }));
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) syncFieldScript();
});
browser.permissions.onRemoved.addListener(() => syncFieldScript());

function checkedOrigin(value) {
  const origin = serverOrigin(String(value));
  if (origin !== value) throw new Error("Enter the HTTPS server address, without a path or credentials.");
  return origin;
}
const fresh = pending => pending && Date.now() - pending.at < 10 * 60 * 1000 ? pending : null;

// Sign-in runs here, not in the popup: the browser closes the popup for the permission prompt and
// the sign-in window. Firefox keeps this page alive while launchWebAuthFlow is pending.
const CHROMIUM = isChromium(browser.identity.getRedirectURL());
let signing = null;
function signIn(origin) {
  signing ??= (async () => {
    try {
      if ((await store.get("connection")).connection) throw new Error("An account is already connected. Disconnect it before signing in again.");
      if (CHROMIUM) return await startChromiumSignIn(origin);
      return await finishSignIn(await authorize(origin, browser.identity));
    } catch (error) {
      await failSignIn(error);
      throw error;
    }
  })().finally(() => { signing = null; });
  return signing;
}

async function finishSignIn(connection) {
  await store.set({ connection });
  await store.remove(["pendingSignin", "signinError"]);
  return summary(connection);
}

async function failSignIn(error) {
  await store.set({ signinError: error.message || "Sign-in failed." });
  await store.remove("pendingSignin");
}

// Chromium: launchWebAuthFlow only finishes on https://<id>.chromiumapp.org/, which Stalwart refuses,
// so the sign-in opens in a plain window and the redirect is caught from the tab's URL. The pending
// sign-in waits in session storage because the service worker may stop while the person signs in.
async function startChromiumSignIn(origin) {
  const pending = await prepareAuthorization(origin, redirectUri(browser.identity.getRedirectURL()));
  await browser.storage.session.set({ oauthPending: pending });
  await browser.windows.create({ url: pending.authUrl, type: "popup", width: 520, height: 760 });
  return null; // Finishes in the tabs.onUpdated listener below; extension pages follow storage.
}

let handledCallback = null;
if (CHROMIUM) {
  browser.tabs.onUpdated.addListener(async (tabId, { url }) => {
    // The tab URL is visible because sign-in asks for access to http://127.0.0.1/*.
    if (!url?.startsWith("http://127.0.0.1/larvatus-oauth/") || url === handledCallback) return;
    handledCallback = url;
    const { oauthPending: pending } = await browser.storage.session.get("oauthPending");
    if (!pending || !url.startsWith(pending.redirect)) return;
    await browser.storage.session.remove("oauthPending");
    browser.tabs.remove(tabId).catch(() => {});
    try { await finishSignIn(await completeAuthorization(pending, url)); }
    catch (error) { await failSignIn(error); }
  });
}

// If the popup closed for the permission prompt, continue once Firefox grants access.
browser.permissions.onAdded.addListener(async ({ origins = [] }) => {
  syncFieldScript();
  const pending = fresh((await store.get("pendingSignin")).pendingSignin);
  if (pending && origins.includes(hostPattern(pending.origin))) signIn(pending.origin).catch(() => {});
});

// One queue across all extension pages keeps rotating refresh tokens and account changes ordered.
let queue = Promise.resolve();
// Replies go through sendResponse: Chromium ignores a promise returned from the listener.
function reply(result, sendResponse) {
  result.then(value => sendResponse({ value }),
    error => sendResponse({ error: error.message || "The request failed.", type: error.type }));
  return true;
}
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== browser.runtime.id) return;
  if (!sender.url?.startsWith(browser.runtime.getURL(""))) {
    // Web pages get exactly one request, from the content script's button, and the site comes from the
    // tab the browser reports rather than from the message.
    if (!sender.tab || message?.action !== "field-create") return;
    const result = queue.then(() => createForField(sender));
    queue = result.catch(() => {});
    return reply(result, sendResponse);
  }
  // Sign-in waits on the person, so it stays out of the queue and never blocks the popup's status check.
  const result = message.action === "signin"
    ? Promise.resolve().then(() => signIn(checkedOrigin(message.origin)))
    : queue.then(() => handle(message));
  if (message.action !== "signin") queue = result.catch(() => {});
  return reply(result, sendResponse);
});
