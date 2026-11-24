# Development notes

Larvatus is a Firefox and Chromium extension for Stalwart masked addresses, published by Triplebit. The README covers what it does, how to load it and how releases work. This file is the handoff for whoever works on it next, person or agent. It holds what the code and README do not: how to work here, why things are the way they are, and what is still unverified. Keep it current when any of that changes. It is not named AGENTS.md or CLAUDE.md because the owner's global git ignore excludes those names.

## How to work here

- Smallest complete change. The owner follows the "ponytail" principles (https://github.com/DietrichGebert/ponytail/blob/main/AGENTS.md): use what the codebase or platform already has, no speculative options or wrappers, one small test for new non-trivial logic, and end replies with what you skipped or did not check.
- The extension has no dependencies and no build step for Firefox. Keep it that way. Only `smoke/` has a `package.json`.
- Commit only when asked. `larvatus.xpi` at the root is tracked, so run `node scripts/build.mjs` before a commit that touches `extension/`.
- User-facing text says "your browser", never "Firefox" or "Chrome". The owner removed success messages from the on-page button and the autofill switch; do not add confirmations for things the UI already shows.

## Commands

```sh
node --test test/         # unit tests, no install needed (Node 22.7+)
node scripts/build.mjs    # dist/firefox, dist/chrome, both zips, and larvatus.xpi
npm --prefix smoke install && node smoke/chrome.mjs   # end-to-end test of the Chrome build
```

The smoke test builds the extension, starts a fake Stalwart (`smoke/server.mjs`, https://localhost:8443, needs `openssl`), signs in, turns on the field button, fills a sign-up form and checks the popup. It needs a Chromium that honours `--load-extension`: Puppeteer's own Chrome for Testing, or `CHROME_PATH=` pointing at Chromium or Brave. Branded Google Chrome 137+ ignores that flag. It listens on a local port, so sandboxes that block port binding must allow it. `PUPPETEER_SKIP_DOWNLOAD=1` skips the Chrome download when you set `CHROME_PATH`.

`scripts/cloud-setup.sh` is the setup script for a Claude Code on the web environment. It has not been run in one yet.

## Layout

- `extension/manifest.json` is the Firefox manifest. `scripts/build.mjs` derives the Chrome one (service worker, PNG icons from `extension/icons`, optional access to `http://127.0.0.1/*`).
- `background.js` owns the account, tokens and every server call. Pages talk to it through `send()` in `ui.js`. All requests run through one queue so refresh-token rotation stays ordered.
- `stalwart.js` is the OAuth and JMAP client and has no browser APIs in it, which is why it is unit-tested directly.
- `content.js` and `fields.js` are the on-page email field button. They are classic scripts (content scripts cannot be modules) and are registered only while the setting is on and site access is granted.
- `site.js` turns a tab URL into the default prefix and description. `options.js` holds settings defaults. `compat.js` maps `browser` to `chrome` on Chromium.

## Decisions and their reasons

- **Gecko ID is `extension@larvatus.net`.** Changing it after release makes Firefox treat it as a new extension and drops the stored sign-in.
- **Sign-in runs in the background script.** The browser closes the popup for the permission prompt and the sign-in window, which would kill a flow running there. `signin-pending` is stored first so `permissions.onAdded` can resume it.
- **Chromium sign-in does not use `launchWebAuthFlow`.** Stalwart only accepts loopback redirects for public clients (it answers 400 otherwise), and Chrome's helper only completes on `https://<id>.chromiumapp.org/`. So Chromium opens a popup window and a `tabs.onUpdated` listener catches `http://127.0.0.1/larvatus-oauth/<id>`. The pending sign-in lives in `storage.session` because the service worker can stop while the person types a password. An earlier version used a declarativeNetRequest rule and a callback page; it was replaced as needlessly large. Firefox still uses `launchWebAuthFlow` with its own loopback form.
- **Firefox sign-in stays in a popup window.** Moving it to a tab was considered and the owner said no.
- **The field button is off by default.** On by default would need all-sites access at install, which the owner rejected. The popup links to Settings while it is off.
- **Filling uses `execCommand("insertText")`, then the native setter plus `input` and `change` events.** Setting `.value` alone (what SimpleLogin does) leaves React-style pages with an empty state, and they wipe the field on the next focus or blur.
- **The button is positioned in page coordinates**, not `position: fixed`, because script-driven fixed positioning lagged on iOS (commit 059f2c5). Which iOS browser the owner uses is not recorded here.
- **A blank prefix sends one random character.** Stalwart's own generated prefix is long. The field button also sets `forDomain` to the page origin.
- **The masked-address limit cannot be read.** It defaults to 5 and is set by the Stalwart admin, but the `urn:stalwart:oauth:scope:settings` token cannot read it (checked against Stalwart 1.0.3 source). The number only appears in the `overQuota` error text, which the popup shows in its top banner. The owner chose not to build a counter or progress bar on that.
- **Alias edit links** are `<server>/account/Account/x:MaskedEmail/<JMAP id>`.
- **Colors** come from the Stalwart dashboard in light and dark mode (tokens at the top of `style.css`). Dark-mode primary buttons use dark text because white on `#ff5b7e` has too little contrast.
- **Workflow actions are pinned to commit SHAs.** The triplebit GitHub organisation refuses tags such as `@v4`.

## State as of 2026-11-23

Verified:
- Unit tests pass. `smoke/chrome.mjs` passes in Brave on macOS.
- The owner has used the extension in Firefox against a real Stalwart server (mail.triplebit.net) through most of its development.

Not verified:
- GitHub Actions has never passed. Both runs so far failed at setup because actions were not SHA-pinned; that is fixed in the workflow but not yet pushed, so the build, `web-ext lint` and release steps have never run.
- The Firefox build has not been checked by an agent since the Chromium changes (commit a8244de: `sendResponse` replies, the split of `authorize()`). Automating Firefox failed twice: Puppeteer 24.1 has no `installExtension`, and a pre-installed XPI in a Nightly profile would not navigate to `moz-extension://` pages. `web-ext run` was not tried.
- Chromium sign-in against a real Stalwart server, and closing the Chromium sign-in window without finishing.
- The field button on real websites, and whether the alias edit link's ID matches on the real server.
- `scripts/cloud-setup.sh` in a real cloud environment.

## Open work

Nothing is in progress. Known follow-ups, none of them requested yet:

- Store submission is manual. Uploading to addons.mozilla.org and the Chrome Web Store from the workflow would need API keys as repository secrets.
- For addons.mozilla.org, `data_collection_permissions` may need a browsing-activity entry: the site's hostname is sent to the user's Stalwart server in the description and `forDomain`.
- The smoke test could run in the workflow once it has passed on Linux.
- `showTip` in `content.js` still supports a success style that nothing uses.
