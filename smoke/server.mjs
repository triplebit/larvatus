// A fake Stalwart for smoke/chrome.mjs: OAuth discovery, client registration, authorization and
// token endpoints, the JMAP session, the x:MaskedEmail methods the test uses, and a page with a
// sign-up form and a sign-in form. It listens on https://localhost:8443 with a throwaway certificate.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const origin = "https://localhost:8443";
export const username = "tester@example.org";

// Like React and friends, the sign-up page keeps its own copy of the email, updated only by input
// events, and writes it back on focus and blur. A fill that skips those events is wiped.
const PAGE = `<!doctype html><meta charset="utf-8"><title>Sign up</title>
<style>body { font: 15px system-ui; margin: 40px } form { display: grid; gap: 10px; width: 380px; margin-bottom: 40px } input { padding: 9px }</style>
<form id="signup"><input id="signup-email" type="email" name="email" placeholder="Email"><input id="name" name="name" placeholder="Full name">
  <input type="password" autocomplete="new-password"><button>Create account</button></form>
<form id="login"><input id="login-email" type="email" name="email" placeholder="Email"><input type="password" autocomplete="current-password"><button>Log in</button></form>
<script>
  let state = "";
  const email = document.getElementById("signup-email");
  email.addEventListener("input", () => { state = email.value; });
  for (const type of ["focus", "blur"]) email.addEventListener(type, () => { email.value = state; });
  window.pageState = () => state;
  for (const form of document.forms) form.addEventListener("submit", event => event.preventDefault());
</script>`;

export function start() {
  const dir = mkdtempSync(join(tmpdir(), "larvatus-cert-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"),
    "-days", "2", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"], { stdio: "ignore" });
  const aliases = [];

  const server = https.createServer({ key: readFileSync(join(dir, "key.pem")), cert: readFileSync(join(dir, "cert.pem")) }, async (req, res) => {
    const url = new URL(req.url, origin);
    let body = "";
    for await (const chunk of req) body += chunk;
    const json = (data, status = 200) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(data));

    switch (req.method + " " + url.pathname) {
      case "GET /.well-known/oauth-authorization-server":
        return json({ issuer: origin, authorization_endpoint: origin + "/authorize", token_endpoint: origin + "/token",
          registration_endpoint: origin + "/register", authorization_response_iss_parameter_supported: true });
      case "POST /register":
        // Stalwart's real rule and wording: this is what refused Chrome's chromiumapp.org redirect.
        if (!/^http:\/\/(127\.0\.0\.1|\[::1\])\//.test(JSON.parse(body).redirect_uris[0])) {
          return json({ error: "invalid_redirect_uri", error_description: "Redirect URI must be a loopback (http://127.0.0.1/, http://[::1]/) or a private-use scheme containing a dot." }, 400);
        }
        return json({ client_id: "smoke-client" });
      case "GET /authorize": {
        const back = new URL(url.searchParams.get("redirect_uri"));
        back.search = new URLSearchParams({ code: "smoke-code", state: url.searchParams.get("state"), iss: origin });
        return res.writeHead(302, { Location: back.href }).end();
      }
      case "POST /token": {
        const form = new URLSearchParams(body);
        if (form.get("code") !== "smoke-code" || !form.get("code_verifier")) return json({ error: "invalid_grant" }, 400);
        return json({ token_type: "bearer", access_token: "smoke-token", refresh_token: "smoke-refresh", expires_in: 3600, scope: "urn:stalwart:oauth:scope:settings" });
      }
      case "GET /jmap/session":
        return json({ capabilities: { "urn:ietf:params:jmap:core": {} }, primaryAccounts: { "urn:stalwart:jmap": "a" }, apiUrl: origin + "/jmap/", username });
      case "POST /jmap/": {
        const [method, args, tag] = JSON.parse(body).methodCalls[0];
        const verb = method.split("/")[1];
        let result;
        if (verb === "query") result = { ids: aliases.slice(args.position).map(alias => alias.id), position: args.position, queryState: "s", total: aliases.length };
        else if (verb === "get") result = { list: aliases.filter(alias => args.ids.includes(alias.id)) };
        else if (verb === "set" && args.create) {
          const { emailPrefix, ...fields } = args.create.alias;
          const alias = { id: "id" + (aliases.length + 1), email: emailPrefix + ".k3x9q2@example.org", createdAt: new Date().toISOString(), ...fields };
          aliases.push(alias);
          // Like Stalwart, the create response may leave out the generated address.
          result = { created: { alias: { id: alias.id } } };
        }
        return result ? json({ methodResponses: [[method, result, tag]] }) : json({ error: "The fake server does not implement " + method }, 400);
      }
      case "GET /signup":
        return res.writeHead(200, { "Content-Type": "text/html" }).end(PAGE);
      default:
        return json({ error: "not found" }, 404);
    }
  });
  return new Promise(resolve => server.listen(8443, "127.0.0.1", () => resolve({ aliases, close: () => server.close() })));
}
