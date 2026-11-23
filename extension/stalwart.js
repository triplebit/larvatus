const CORE = "urn:ietf:params:jmap:core";
const STALWART = "urn:stalwart:jmap";
const SETTINGS = "urn:stalwart:oauth:scope:settings";

export function serverOrigin(value) {
  const raw = value.trim();
  const url = new URL(raw.includes("://") ? raw : "https://" + raw);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Enter the HTTPS server address, without a path or credentials.");
  }
  return url.origin;
}

// The host permission Firefox must grant before the extension can reach this server.
export const hostPattern = origin => "https://" + new URL(origin).hostname + "/*";

function endpoint(value, origin) {
  if (!value) throw new Error("A required server endpoint is missing.");
  const url = new URL(value, origin);
  if (url.origin !== origin || url.username || url.password || url.hash) {
    throw new Error("Enter the server’s canonical HTTPS address. Its advertised endpoints must use the same origin.");
  }
  return url.href;
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: "omit", cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(30000), ...options
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error_description || data?.detail || data?.error || response.statusText;
    const error = new Error(`Server returned ${response.status}: ${message}`);
    error.status = response.status;
    error.code = data?.error;
    throw error;
  }
  if (!data) throw new Error("Expected a JSON response. Check the Stalwart server address.");
  return data;
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function exchange(connection, fields) {
  const result = await request(connection.tokenUrl, {
    method: "POST", body: new URLSearchParams({ client_id: connection.clientId, ...fields })
  });
  if (!result.access_token || result.token_type?.toLowerCase() !== "bearer") {
    throw new Error("Stalwart did not return a bearer token.");
  }
  if (result.scope !== undefined && !result.scope.split(/\s+/).includes(SETTINGS)) {
    throw new Error("Masked addresses require the Stalwart account settings scope. Check the server version and grant access at sign-in.");
  }
  return { ...connection, access: result.access_token, refresh: result.refresh_token || connection.refresh,
    expires: result.expires_in ? Date.now() + result.expires_in * 1000 : null };
}

export async function authorize(origin, identity) {
  const metadata = await request(origin + "/.well-known/oauth-authorization-server");
  endpoint(metadata.issuer, origin);
  const authUrl = new URL(endpoint(metadata.authorization_endpoint, origin));
  const tokenUrl = endpoint(metadata.token_endpoint, origin);
  const revocationUrl = metadata.revocation_endpoint && endpoint(metadata.revocation_endpoint, origin);
  const redirect = "http://127.0.0.1/mozoauth2/" + new URL(identity.getRedirectURL()).hostname.split(".")[0];
  const client = await request(endpoint(metadata.registration_endpoint, origin), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "MaskedEmail", redirect_uris: [redirect],
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
      token_endpoint_auth_method: "none", scope: SETTINGS })
  });
  if (!client.client_id) throw new Error("Stalwart did not register the extension.");
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  authUrl.search = new URLSearchParams({ client_id: client.client_id, redirect_uri: redirect,
    response_type: "code", scope: SETTINGS, state, code_challenge: challenge, code_challenge_method: "S256" });
  const callback = new URL(await identity.launchWebAuthFlow({ interactive: true, url: authUrl.href }));
  const params = callback.searchParams;
  if (callback.origin + callback.pathname !== redirect || params.get("state") !== state ||
      ((metadata.authorization_response_iss_parameter_supported || params.has("iss")) && params.get("iss") !== metadata.issuer)) {
    throw new Error("Could not verify the sign-in response. Start sign-in again.");
  }
  if (params.has("error")) throw new Error(params.get("error_description") || params.get("error"));
  if (!params.get("code")) throw new Error("Sign-in ended without an authorization code.");
  const connection = await exchange({ origin, clientId: client.client_id, tokenUrl, revocationUrl }, {
    grant_type: "authorization_code", code: params.get("code"), redirect_uri: redirect, code_verifier: verifier
  });
  return { ...connection, ...await session(connection), key: crypto.randomUUID() };
}

export async function session(connection) {
  // Stalwart's /.well-known/jmap redirects to this session resource.
  const data = await request(connection.origin + "/jmap/session", {
    headers: { Authorization: "Bearer " + connection.access }
  });
  const accountId = data.primaryAccounts?.[STALWART] ||
    Object.keys(data.accounts || {}).find(id => data.accounts[id].isPersonal);
  if (!accountId) throw new Error("Stalwart did not identify your account.");
  // Stalwart can advertise management only on the account, outside the global capability list.
  if (!data.primaryAccounts?.[STALWART] && !data.accounts?.[accountId]?.accountCapabilities?.[STALWART] && !data.capabilities?.[STALWART]) {
    throw new Error("This account needs Stalwart’s JMAP management capability and settings scope.");
  }
  return { apiUrl: endpoint(data.apiUrl, connection.origin), accountId, username: data.username,
    pageSize: Math.min(100, Math.max(1, data.capabilities[CORE]?.maxObjectsInGet || 50)) };
}

export async function refresh(connection) {
  if (!connection.refresh) throw Object.assign(new Error("Sign in again to renew access."), { code: "invalid_grant" });
  return exchange(connection, { grant_type: "refresh_token", refresh_token: connection.refresh });
}

export async function revoke(connection) {
  if (!connection.revocationUrl) return;
  for (const token of new Set([connection.refresh, connection.access].filter(Boolean))) {
    const response = await fetch(connection.revocationUrl, { method: "POST", credentials: "omit",
      redirect: "error", signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ client_id: connection.clientId, token }) });
    if (!response.ok) throw new Error("Could not revoke access on the server.");
  }
}

function problem(error) {
  return new Error(error?.description || error?.type || "Unexpected JMAP response.");
}

async function call(connection, verb, args) {
  const method = "x:MaskedEmail/" + verb;
  const data = await request(connection.apiUrl, {
    method: "POST", headers: { Authorization: "Bearer " + connection.access, "Content-Type": "application/json" },
    body: JSON.stringify({ using: [CORE, STALWART], methodCalls: [[method, args, "a"]] })
  });
  const [name, result, tag] = data.methodResponses?.[0] || [];
  if (name !== method || tag !== "a" || !result) throw problem(result);
  return result;
}

// The alias's page in Stalwart's web admin, keyed by the same JMAP id the extension reads.
export function aliasPage(origin, id) {
  return origin + "/account/Account/x:MaskedEmail/" + encodeURIComponent(id);
}

export async function listAliases(connection) {
  const rows = new Map();
  let position = 0;
  let queryState;
  for (;;) {
    const page = await call(connection, "query", { filter: { accountId: connection.accountId },
      position, limit: connection.pageSize, calculateTotal: true });
    if (!Array.isArray(page.ids) || page.position !== position ||
        (position && queryState !== page.queryState)) {
      throw new Error("The address list changed while loading. Refresh to try again.");
    }
    queryState = page.queryState;
    if (!page.ids.length) break;
    const objects = await call(connection, "get", { ids: page.ids,
      properties: ["id", "email", "enable", "description", "forDomain", "createdAt", "expiresAt"] });
    for (const alias of objects.list) rows.set(alias.id, alias);
    position += page.ids.length;
    if (page.total != null && position >= page.total) break;
  }
  return [...rows.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
}

export async function createAlias(connection, prefix, description) {
  const fields = { enable: true };
  if (prefix) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_]{0,63}$/.test(prefix)) throw new Error("Use 1–64 letters, digits or underscores. Start with a letter or digit.");
    fields.emailPrefix = prefix.toLowerCase();
  }
  if (description) fields.description = description;
  const result = await call(connection, "set", { create: { alias: fields } });
  if (!result.created?.alias?.id) throw problem(result.notCreated?.alias);
  return result.created.alias;
}

export async function setEnabled(connection, id, enable) {
  if (typeof id !== "string" || typeof enable !== "boolean") throw new Error("Invalid address or switch value.");
  const result = await call(connection, "set", { update: { [id]: { enable } } });
  if (!Object.hasOwn(result.updated || {}, id)) throw problem(result.notUpdated?.[id]);
}
