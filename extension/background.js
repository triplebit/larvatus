import { authorize, createAlias, hostPattern, listAliases, refresh, revoke, serverOrigin, session, setEnabled } from "./stalwart.js";

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
  if (!connection || message.key !== connection.key) throw new Error("Your account changed. Reopen MaskedEmail.");
  if (message.action === "disconnect") {
    await store.remove("connection");
    try {
      await revoke(connection);
      return "Disconnected.";
    } catch {
      return "Disconnected from Firefox. To revoke server access, remove MaskedEmail from your Stalwart connected applications.";
    }
  }

  async function renew() {
    try {
      connection = await refresh(connection);
      await store.set({ connection });
    } catch (error) {
      if (["invalid_grant", "invalid_client"].includes(error.code)) {
        await store.remove("connection");
        throw new Error("Your session has ended. Open Account to sign in again.");
      }
      throw error;
    }
  }

  async function run() {
    switch (message.action) {
      case "list":
        Object.assign(connection, await session(connection));
        await store.set({ connection });
        return listAliases(connection);
      case "create": return createAlias(connection, message.prefix, message.description);
      case "toggle": return setEnabled(connection, message.id, message.enable);
      default: throw new Error("Unknown action.");
    }
  }
  if (connection.expires && connection.expires < Date.now() + 30000) await renew();
  try {
    return await run();
  } catch (error) {
    if (error.status !== 401) throw error;
    await renew();
    return run();
  }
}

function checkedOrigin(value) {
  const origin = serverOrigin(String(value));
  if (origin !== value) throw new Error("Enter the HTTPS server address, without a path or credentials.");
  return origin;
}
const fresh = pending => pending && Date.now() - pending.at < 10 * 60 * 1000 ? pending : null;

// Sign-in runs here, not in the popup: Firefox closes the popup for the permission prompt and the
// sign-in window, and keeps this page alive while launchWebAuthFlow is pending.
let signing = null;
function signIn(origin) {
  signing ??= (async () => {
    try {
      if ((await store.get("connection")).connection) throw new Error("An account is already connected. Disconnect it before signing in again.");
      const connection = await authorize(origin, browser.identity);
      await store.set({ connection });
      await store.remove(["pendingSignin", "signinError"]);
      return summary(connection);
    } catch (error) {
      await store.set({ signinError: error.message || "Sign-in failed." });
      await store.remove("pendingSignin");
      throw error;
    }
  })().finally(() => { signing = null; });
  return signing;
}

// If the popup closed for the permission prompt, continue once Firefox grants access.
browser.permissions.onAdded.addListener(async ({ origins = [] }) => {
  const pending = fresh((await store.get("pendingSignin")).pendingSignin);
  if (pending && origins.includes(hostPattern(pending.origin))) signIn(pending.origin).catch(() => {});
});

// One queue across all extension pages keeps rotating refresh tokens and account changes ordered.
let queue = Promise.resolve();
browser.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL(""))) return;
  // Sign-in waits on the person, so it stays out of the queue and never blocks the popup's status check.
  const result = message.action === "signin"
    ? Promise.resolve().then(() => signIn(checkedOrigin(message.origin)))
    : queue.then(() => handle(message));
  if (message.action !== "signin") queue = result.catch(() => {});
  return result.then(value => ({ value }), error => ({ error: error.message || "The request failed." }));
});
