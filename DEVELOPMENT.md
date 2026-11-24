# Development notes

Larvatus is a Firefox and Chromium extension for Stalwart masked addresses, published by Triplebit. The README covers what it does, how to load it and how releases work. This file is the handoff for whoever works on it next, person or agent. It holds what the code and README do not: how to work here, why things are the way they are, and what is still unverified. Keep it current when any of that changes. The owner's global git ignore excludes `CLAUDE.md` and `AGENTS.md`, so this file is the committed copy of the working notes. A local `CLAUDE.md` may exist that imports it.

## How to work here

- Read this file before changing the code.
- **Work is generally done by Opus agents, orchestrated by the main session.** Planning, decisions and discussion with the owner happen in the main session. It briefs Opus subagents to do the coding, sets each one's reasoning effort to fit the task, reviews and tests what they return, and commits. Subagents do not commit. Small edits and doc updates are fine in the main session.
- Smallest complete change. The owner follows the "ponytail" principles (https://github.com/DietrichGebert/ponytail/blob/main/AGENTS.md): use what the codebase or platform already has, no speculative options or wrappers, one small test for new non-trivial logic, and end replies with what you skipped or did not check.
- The extension has no dependencies and no build step for Firefox. Keep it that way. Only `smoke/` has a `package.json`.
- Commit only when asked. Commits are signed through the owner's 1Password SSH agent, which a sandboxed shell cannot reach, so the commit command runs outside the sandbox; do not turn signing off. Push only when asked. `larvatus.xpi` at the root is tracked, so run `node scripts/build.mjs` before a commit that touches `extension/`.
- User-facing text says "your browser", never "Firefox" or "Chrome". The owner removed success messages from the on-page button and the autofill switch; do not add confirmations for things the UI already shows.

## Commands

```sh
node --test test/*.test.mjs   # unit tests, no install needed. Name the files: Node 22 runs a bare directory as a module
node scripts/build.mjs    # dist/firefox, dist/chrome, both zips, and larvatus.xpi
npm --prefix smoke install && node smoke/chrome.mjs   # end-to-end test of the Chrome build
node smoke/screenshots.mjs  # store screenshots (1280x800 posters) into store/screenshots/ and Chrome's promo tiles into store/promo/, same browser setup
```

The smoke test builds the extension, starts a fake Stalwart (`smoke/server.mjs`, https://localhost:8443, needs `openssl`), signs in, turns on the field button, fills a sign-up form and checks the popup. It needs a Chromium that honours `--load-extension`: Puppeteer's own Chrome for Testing, or `CHROME_PATH=` pointing at Chromium or Brave. Branded Google Chrome 137+ ignores that flag. It listens on a local port, so sandboxes that block port binding must allow it. `PUPPETEER_SKIP_DOWNLOAD=1` skips the Chrome download when you set `CHROME_PATH`.

The apps' repository uses `smoke/server.mjs` and `smoke/poster.mjs` for its App Store screenshots (`scripts/capture.mjs` and `scripts/posters.mjs` there). For that the fake server accepts the apps' `net.larvatus:/oauth` redirect and token refreshes, serves the Wrenfield sign-up page at `/join` (exported as `SIGNUP`, with a phone layout below 600px), and its certificate also names `wrenfield.localhost`. Keep those when changing it.

`scripts/cloud-setup.sh` is the setup script for a Claude Code on the web environment. It has not been run in one yet.

## Layout

- `extension/manifest.json` is the Firefox manifest. `scripts/build.mjs` derives the Chrome one (service worker, PNG icons from `extension/icons`, optional access to `http://127.0.0.1/*`, and the name "Larvatus: Email Aliases for Stalwart Mail", which the owner chose on 2026-11-24 for Chrome Web Store search; Firefox and Safari keep "Larvatus").
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
- **Site data is optional on Firefox.** `browsingActivity` is an optional data permission. Settings has one "Default prefix for addresses" (Site name, Random or Custom; Random by default) that drives both the popup and the field button, and choosing Site name asks for the permission. Larvatus never removes it: once granted it stays until withdrawn in the browser's add-on manager, and the owner chose that over a separate switch. The permission alone decides what is saved about the site. With it, the description and `forDomain` are sent in every prefix mode; without it nothing about the site is sent and Site name acts as Random. `siteAllowed()` in `site.js` is true wherever the manifest does not offer the choice, so Chromium and Safari always save the site; the owner decided Chrome needs no "Web history" disclosure. Sign-in opens Settings when it succeeds.
- **Firefox for Android is not supported, so the manifest has no `gecko_android` key** and addons.mozilla.org lists the add-on for desktop only. Firefox for Android has no `identity` API (MDN compatibility data, checked 2026-11-23), and `background.js` and `ui.js` call `browser.identity.getRedirectURL()` as they load, so nothing would work there. Supporting it needs a sign-in that catches the loopback redirect in a tab, as Chromium's does but without `windows.create`, and a minimum of 142, the first Android version with the built-in data consent and `data_collection` in `permissions.request`.
- **The licence is the GNU Affero General Public License, version 3**, the owner's choice, with Triplebit Corporation as copyright holder. `LICENSE` is the text from gnu.org, unchanged. "Or any later version" was not asked for and is not stated. The apps' repository copies these files into its Safari extension and has no licence of its own yet.
- **No `innerHTML` anywhere.** addons.mozilla.org's validator flagged the field button's markup ("Unsafe assignment to innerHTML", which it says can lead to rejection) although it was built from constants, so `content.js` builds the button node by node.
- **`icons/icon-128.png` is the 96 px artwork centred in a transparent 128 px square**, as the Chrome Web Store asks (16 px of padding per side). It is `icon.svg` drawn at 96 px in headless Brave and captured with a transparent background. The same file goes in the store listing's icon field. The smaller PNGs fill their squares. The 1.0.1 packages still carry the earlier full-size 128 px icon.
- **Alias edit links** are `<server>/account/Account/x:MaskedEmail/<JMAP id>`.
- **Colors** come from the Stalwart dashboard in light and dark mode (tokens at the top of `style.css`). The accent is the exception: the owner found the dashboard's dark-mode pink too light, so buttons, switches and radios use the logo's `#dd2b55` with white text in both themes. Accent-coloured text in dark mode keeps the lighter `--accent-ink`, because `#dd2b55` text on the dark surface is about 3.4:1.
- **Workflow actions are pinned to commit SHAs.** The triplebit GitHub organisation refuses tags such as `@v4`. When touching the workflow, look up each action's latest release (`gh api repos/actions/<name>/releases/latest`) and pin that commit; do not write versions from memory. The Node version there is the oldest the tests support, on purpose.

## State as of 2026-11-24

The product was renamed from MaskedEmail to Larvatus on this date. Stalwart's own names (`x:MaskedEmail`, "masked address") and the storage keys were kept.

Verified:
- Unit tests pass. `smoke/chrome.mjs` passes in Brave on macOS, after the rename and after the Settings rework (default prefix under General, optional site data, Autofill hidden when signed out, logo red in dark mode). It also checks that sign-in does not open a second Settings tab.
- The Firefox build ran headless in Firefox 151 against `smoke/server.mjs`, after the rename: it loads without errors, signs in through `launchWebAuthFlow`, and the field button and popup list work. This used a throwaway script, not in the repo: Puppeteer 23's Firefox launch, the extension installed with the raw BiDi command `browser.connection.send("webExtension.install", …)`, a fixed UUID from the `extensions.webextensions.uuids` pref, and host permissions granted by `extensions.originControls.grantByDefault`. `page.goto` to `moz-extension://` pages times out although the page loads, so catch it. Firefox Nightly here is 132, below `strict_min_version`.
- GitHub Actions passes on a push to `main`: tests on Node 22, the build, `web-ext lint` and the package upload.
- `v1.0.0` and then `v1.0.1` were tagged on 2026-11-23, and the release job attached both packages to a GitHub release each time. 1.0.1 is the one for the stores: it is 1.0.0 with the field button built without `innerHTML`. Their contents match a local build. The repository is private, so the release is too. The owner began uploading 1.0.1 to both stores on 2026-11-23; whether either was submitted, and its review state, is not recorded here, so ask.
- `web-ext lint` (version 10) on `dist/firefox`: no errors, one warning. It says Firefox for Android 140 predates `data_collection_permissions` (142) and does not apply, because the add-on is not offered on Android.
- The field button built without `innerHTML` (see Decisions) was checked in headless Brave with a stubbed extension API: it renders in the email field and a click fills the address. The full smoke test was not re-run after that change.
- The store screenshots in `store/screenshots/` are six posters: a headline, callouts and the real interface captured at 2x, laid out by `smoke/poster.mjs`, plus one drawn diagram. All six were looked at after the last run. The same script writes the Chrome Web Store's promo tiles to `store/promo/` (440x280 and 1400x560: brand art, no screenshot); both were looked at. Posters 1, 4 and 6 show creation dates counted back from today, so a rerun on a later day changes those files. The script empties the screenshots folder first, and `smoke/server.mjs` has a fixed port, so a second copy of the fake server (another session's smoke test) makes it fail with `EADDRINUSE`.
- Before the rename, the owner used the extension in Firefox against a real Stalwart server (mail.triplebit.net) through most of its development, and deleting from the popup was checked in Safari on a simulator against a test account.

Not verified:
- The optional `browsingActivity` permission in a real Firefox: the prompt when Site name is chosen (asked from a radio's change event), Settings showing Random after it is withdrawn in the add-on manager, blank popup suggestions without it, and Settings opening after sign-in. Only the unit test covers it. The owner saw Settings flicker back to Random for a moment after granting; the fix (no redraw from the permission event while the choice is being saved) has not been confirmed in Firefox.
- The renamed build against a real Stalwart server, in either browser.
- Firefox's real permission prompt, and the popup opened from the toolbar and not as a page.
- Chromium sign-in against a real Stalwart server, and closing the Chromium sign-in window without finishing.
- The field button on real websites in Chromium, and whether the alias edit link's ID matches on the real server.
- `scripts/cloud-setup.sh` in a real cloud environment.

## Open work

Nothing is in progress. Known follow-ups, none of them requested yet:

- Store submission is with the owner, who began the uploads on 2026-11-23 from the `v1.0.1` GitHub release. The live privacy policy has the new wording (checked 2026-11-24). The reviewer notes point at this repository, which is private. For the Chrome Web Store's icon field use `extension/icons/icon-128.png`; the docs do not say whether the store takes its icon from that field or from the package, and the 1.0.1 package holds the earlier unpadded icon.
- The apps' App Store screenshots are to follow the poster design used here (`smoke/poster.mjs`, `smoke/screenshots.mjs`); that work belongs to the apps' repository. [PUBLISHING.md](PUBLISHING.md) has the steps; the publisher is Triplebit Corporation. larvat.us is live, and the listing text is drafted in `store/listing.md`. Uploading to addons.mozilla.org and the Chrome Web Store from the workflow would need API keys as repository secrets.
- The Safari fork was last synced at `edf0a9b` (first at `fb513d5` for the Settings rework), with its own `settings.html` and `options.js` brought in line. In Safari the app owns the default prefix (now Random there too), so Safari's `options.js` lays the app's choice over the stored settings in `loadSettings()`; the shared `popup.js` and `settings.js` rely on `loadSettings()` for the prefix, so keep reading it that way. Signed-in checks of the synced Safari extension are still open (see the apps' DEVELOPMENT.md).
- The owner still has to choose a support email and site for the listings and give reviewers a test server and account (placeholders in `store/listing.md`).
- The smoke test could run in the workflow once it has passed on Linux.
- A kept Firefox smoke test (`smoke/firefox.mjs`) could be made from the approach described under Verified.
- The popup's edit control is a pencil; the apps use the `switch.2` symbol for the same action.
- The Safari extension in the apps' repository forks six files. Three small changes here would cut that to two: read `FIELD_ORIGINS` and the field-button default from the manifest's optional hosts; hide the sign-in form, Disconnect and the prefix choice when `browser.identity` is missing; and a `pointer: coarse` popup width.
- `showTip` in `content.js` still supports a success style that nothing uses.
