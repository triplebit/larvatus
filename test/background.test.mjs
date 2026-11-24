import test from "node:test";
import assert from "node:assert/strict";

// Enough of Firefox's extension API for background.js to answer the email field button.
const listen = { addListener() {} };
let onMessage;
let granted = [];
const stored = {
  settings: { fieldButton: true, fieldPrefix: "site" },
  connection: { key: "k", apiUrl: "https://mail.example.org/jmap/", accountId: "b", access: "a", expires: Date.now() + 3600000 }
};
globalThis.browser = {
  runtime: {
    id: "ext", getURL: path => "moz-extension://ext/" + path, onInstalled: listen,
    onMessage: { addListener: fn => { onMessage = fn; } },
    getManifest: () => ({ browser_specific_settings: { gecko: { data_collection_permissions: { optional: ["browsingActivity"] } } } })
  },
  storage: { local: { get: async key => ({ [key]: stored[key] }) }, onChanged: listen },
  permissions: { getAll: async () => ({ origins: [], permissions: [], data_collection: granted }), onAdded: listen, onRemoved: listen },
  identity: { getRedirectURL: () => "https://ext.extensions.allizom.org/" }
};
await import("../extension/background.js");

async function fieldCreate(t) {
  let sent;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    [[, sent]] = JSON.parse(options.body).methodCalls;
    return Response.json({ methodResponses: [["x:MaskedEmail/set", { created: { alias: { id: "a1", email: "x@example.org" } } }, "a"]] });
  });
  const reply = await new Promise(resolve => onMessage({ action: "field-create" }, { id: "ext", tab: { url: "https://shop.example.com/signup" } }, resolve));
  assert.deepEqual(reply, { value: { email: "x@example.org" } });
  return sent.create.alias;
}

test("the field button sends nothing about the site unless browsingActivity is granted", async t => {
  granted = [];
  const alias = await fieldCreate(t);
  assert.match(alias.emailPrefix, /^[a-z0-9]$/);
  assert.deepEqual(Object.keys(alias).sort(), ["emailPrefix", "enable"]);

  granted = ["browsingActivity"];
  assert.deepEqual(await fieldCreate(t), { enable: true, emailPrefix: "example",
    description: "Created on shop.example.com", forDomain: "https://shop.example.com" });
});
