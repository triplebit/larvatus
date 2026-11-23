import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { aliasPage, authorize, createAlias, listAliases, refresh, serverOrigin, setEnabled } from "../extension/stalwart.js";

const origin = "https://mail.example.org";
const settings = "urn:stalwart:oauth:scope:settings";
const core = "urn:ietf:params:jmap:core";
const management = "urn:stalwart:jmap";
const connection = { apiUrl: origin + "/jmap/", accountId: "b", pageSize: 2, access: "example" };
const response = data => Response.json(data);
function jmap(t, handler) {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, connection.apiUrl);
    assert.equal(options.headers.Authorization, "Bearer example");
    const { using, methodCalls } = JSON.parse(options.body);
    assert.deepEqual(using, [core, management]);
    assert.equal(methodCalls.length, 1);
    const [name, args, tag] = methodCalls[0];
    assert.ok(name.startsWith("x:MaskedEmail/"));
    return response({ methodResponses: [[name, handler(name.split("/")[1], args), tag]] });
  });
}

test("accepts a server hostname or HTTPS origin including its port", () => {
  assert.equal(serverOrigin(" mail.example.org:8443 "), origin + ":8443");
  assert.equal(serverOrigin(origin + "/"), origin);
  for (const value of ["http://example.org", "https://name:secret@example.org", origin + "/login", origin + "?a"]) {
    assert.throws(() => serverOrigin(value));
  }
});

test("OAuth uses a public PKCE client and rejects swapped state and issuer before code exchange", async t => {
  let challenge, callbackMutation, exchanges = 0;
  const id = { getRedirectURL: () => "https://extension-id.extensions.allizom.org/",
    launchWebAuthFlow: async ({ url }) => {
      const params = new URL(url).searchParams;
      challenge = params.get("code_challenge");
      assert.equal(params.get("code_challenge_method"), "S256");
      assert.equal(params.get("scope"), settings);
      const redirect = new URL(params.get("redirect_uri"));
      assert.equal(redirect.href, "http://127.0.0.1/mozoauth2/extension-id");
      redirect.search = new URLSearchParams({ state: params.get("state"), iss: origin, code: "example" });
      callbackMutation?.(redirect);
      return redirect.href;
    } };
  t.mock.method(globalThis, "fetch", async (url, opts) => {
    switch (new URL(url).pathname) {
      case "/.well-known/oauth-authorization-server": return response({ issuer: origin,
        authorization_endpoint: origin + "/login", registration_endpoint: origin + "/register",
        token_endpoint: origin + "/token", authorization_response_iss_parameter_supported: true });
      case "/register": {
        const registration = JSON.parse(opts.body);
        assert.equal(registration.token_endpoint_auth_method, "none");
        assert.equal(registration.scope, settings);
        return response({ client_id: "registered" });
      }
      case "/token":
        exchanges++;
        assert.equal(createHash("sha256").update(opts.body.get("code_verifier")).digest("base64url"), challenge);
        return response({ token_type: "bearer", access_token: "example", scope: settings });
      case "/jmap/session": return response({ capabilities: { [core]: {} },
        primaryAccounts: { [management]: "b" }, apiUrl: connection.apiUrl });
      default: assert.fail("Unexpected request");
    }
  });
  assert.equal((await authorize(origin, id)).accountId, "b");
  for (const [key, value] of [["state", "wrong"], ["iss", "https://elsewhere.example"]]) {
    callbackMutation = redirect => redirect.searchParams.set(key, value);
    await assert.rejects(authorize(origin, id), /verify/);
  }
  assert.equal(exchanges, 1);
});

test("reads all account-filtered pages, including short pages, and sorts by creation", async t => {
  const ids = ["old", "new", "middle"];
  const dates = { old: 1, middle: 2, new: 3 };
  jmap(t, (verb, args) => {
    if (verb === "query") {
      assert.equal(args.filter.accountId, "b");
      return { ids: ids.slice(args.position, args.position + 1), position: args.position, queryState: "s" };
    }
    assert.equal(verb, "get");
    return { list: args.ids.map(id => ({ id, createdAt: "2026-01-0" + dates[id] + "T10:00:00Z" })) };
  });
  assert.deepEqual((await listAliases(connection)).map(alias => alias.id), ["new", "middle", "old"]);
});

test("uses server-generated prefixes and patches only the delivery flag", async t => {
  const payloads = [];
  jmap(t, (verb, args) => {
    assert.equal(verb, "set");
    payloads.push(args);
    return args.create ? { created: { alias: { id: "b" } } } : { updated: { b: null } };
  });
  await createAlias(connection, "", "");
  await createAlias(connection, "Newsletter_1", "News");
  await assert.rejects(createAlias(connection, "_bad", ""), /letters/);
  await setEnabled(connection, "b", false);
  assert.deepEqual(payloads, [{ create: { alias: { enable: true } } },
    { create: { alias: { enable: true, emailPrefix: "newsletter_1", description: "News" } } },
    { update: { b: { enable: false } } }]);
});

test("propagates creation and toggle failures", async t => {
  jmap(t, () => ({ notCreated: { alias: { type: "overQuota" } }, notUpdated: { b: { type: "forbidden" } } }));
  await assert.rejects(createAlias(connection, "", ""), error => error.type === "overQuota" && /overQuota/.test(error.message));
  await assert.rejects(setEnabled(connection, "b", true), /forbidden/);
});

test("adopts rotated refresh tokens", async t => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(options.body.get("grant_type"), "refresh_token");
    assert.equal(options.body.get("refresh_token"), "old");
    return response({ token_type: "Bearer", access_token: "new access", refresh_token: "new refresh", expires_in: 30 });
  });
  const renewed = await refresh({ tokenUrl: origin + "/token", clientId: "id", refresh: "old" });
  assert.equal(renewed.refresh, "new refresh");
  assert.equal(renewed.access, "new access");
  assert.ok(renewed.expires > Date.now());
});

test("links an alias to its Stalwart admin page by JMAP id", () => {
  assert.equal(aliasPage("https://mail.triplebit.net", "jp9td1w7baaa"),
    "https://mail.triplebit.net/account/Account/x:MaskedEmail/jp9td1w7baaa");
});
