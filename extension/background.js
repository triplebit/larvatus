import { createAlias, listAliases, refresh, revoke, session, setEnabled } from "./stalwart.js";

const store = browser.storage.local;
function summary(connection) {
  return connection ? { key: connection.key, origin: connection.origin, username: connection.username } : null;
}

async function handle(message) {
  let { connection } = await store.get("connection");
  if (message.action === "status") return summary(connection);
  if (message.action === "connect") {
    if (connection) throw new Error("An account is already connected. Disconnect it before signing in again.");
    await store.set({ connection: message.connection });
    return summary(message.connection);
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

// One queue across all extension pages keeps rotating refresh tokens and account changes ordered.
let queue = Promise.resolve();
browser.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL(""))) return;
  const result = queue.then(() => handle(message));
  queue = result.catch(() => {});
  return result.then(value => ({ value }), error => ({ error: error.message || "The request failed." }));
});
