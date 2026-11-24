# Larvatus

A Firefox and Chrome toolbar extension for Stalwart masked addresses. Create an address with a random or custom prefix, search by address or description, click an address to copy it, switch delivery on or off, and delete it (the popup asks you to confirm first). Stalwart generates the address and suffix. The prefix starts as chosen in Settings: blank for a random one (the default), the site’s name (`google` for mail.google.com), or your own. When the popup opens on a website, the description starts as “Created on mail.google.com”. Edit or clear either before creating. In Firefox, sending the site's address to your server is optional: the description starts blank until you allow it by choosing Site name in Settings. The list uses the native creation timestamp, newest first.

## Load in Firefox

1. Open `about:debugging#/runtime/this-firefox` in Firefox 140 or later.
2. Click **Load Temporary Add-on…** and select **larvatus.xpi**, or select **extension/manifest.json** to load the source.
3. Open **Larvatus** from the extensions menu. Pin it to the toolbar for quick access.
4. Enter the canonical HTTPS address of your Stalwart server and click **Sign in with Stalwart**. Allow Firefox to connect, then sign in and approve account settings access on Stalwart. Firefox may close the popup during these steps. Sign-in finishes in the background and then opens Settings.

The included package is unsigned. Firefox removes temporarily loaded extensions on restart. A permanent installation in standard Firefox requires Mozilla signing.

## Load in Chrome

Chrome, Edge, Brave and other Chromium browsers (version 121 or later) load the Chrome build.

1. Build the packages with `node scripts/build.mjs` (see Development), or download them from a GitHub release.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select **dist/chrome**.
3. Sign in as above. Chrome also asks for access to `127.0.0.1`: Stalwart only accepts loopback redirects, and Chrome's own sign-in helper only supports `chromiumapp.org` ones, so the extension opens the sign-in in a window and finishes when that window reaches `http://127.0.0.1/larvatus-oauth/…`.

## Settings

Open **Settings** from the popup, or from Firefox's add-on manager.

- **Default prefix for addresses**, under General, is the prefix the popup starts with and the email field button uses: Random (the default, one random letter or digit), the site name (`github` for github.com), or a custom prefix of 1–64 letters, digits or underscores that starts with a letter or digit. In Firefox, choosing Site name asks for Firefox's optional *browsing activity* data permission, which lets Larvatus send the site's address to your server; if you decline, the previous choice stays. Once granted, it stays granted whichever prefix you choose, until you withdraw it in Firefox's add-on manager under Permissions and data. Without it, Larvatus sends nothing about the sites you visit: the popup's description starts blank, the email field button sends no description or Associated Domain, and Site name works like Random. Other browsers always use the site.
- **Show Larvatus button on email fields** adds a button to email fields on sign-up forms. Clicking it creates an address for the site and fills it in. Its description is "Created on" plus the site, and its Associated Domain is the site's origin, such as `https://github.com`. Firefox asks for access to websites the first time you turn this on. The button skips forms that look like sign-in forms: a current-password field, a "Sign in" or "Log in" submit button, a login URL, or just an email and one password.
- **Place the button outside the field** moves the button beside the field so it does not overlap password manager buttons.
- **Theme** switches between System, Light and Dark.

The button fills the field the way typing does, with `insertText` and its input events, so sites built with React, Vue or Angular keep the address when you move between fields.

## Server requirements and privacy

Use Stalwart 1.0.3 or later with its built-in OAuth server, public client registration, and the masked-address permissions for your account. OAuth discovery, the token endpoint, and JMAP must use the HTTPS origin you enter. The extension registers a public client automatically and signs in with the authorization code flow, PKCE S256, and Firefox’s extension-specific loopback callback.

The requested scope is `urn:stalwart:oauth:scope:settings`, which Stalwart uses for masked addresses. Tokens are kept in local Firefox extension storage. The current site's address reaches your server only in what you create: the suggested description, and the Associated Domain of addresses made with the email field button. In Firefox that needs the optional browsing activity permission described under Settings. Alias lists stay in memory while the popup is open. Search runs locally. **Settings → Disconnect account** clears local credentials and requests token revocation.

Stalwart accepts custom prefixes of up to 64 ASCII letters, digits, and underscores, starting with a letter or digit. Leave the prefix blank for one random letter or digit, which keeps the address short; Stalwart invents a much longer prefix when none is sent. Disabling an alias makes Stalwart reject incoming mail for it. Re-enabling restores delivery for an unexpired address. Deleting an alias removes it from Stalwart for good, and mail to it is no longer delivered.

[Stalwart masked email](https://stalw.art/docs/email/management/masked-email/) · [OAuth scopes](https://stalw.art/docs/auth/oauth/scopes/) · [Firefox identity API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity)

## Development

The extension uses plain HTML, CSS, and JavaScript with no dependencies. `extension/manifest.json` is the Firefox manifest, so Firefox loads the folder directly. Run the tests with Node.js 22.7 or later.

```sh
node --test test/*.test.mjs
```

Build both store packages from the project root. This also refreshes `larvatus.xpi`.

```sh
node scripts/build.mjs
```

Run the end-to-end test of the Chrome build, which drives a headless Chromium against a fake Stalwart server. It installs Puppeteer under `smoke/`; set `CHROME_PATH` to use Chromium or Brave instead of Puppeteer's own Chrome.

```sh
npm --prefix smoke install && node smoke/chrome.mjs
```

`DEVELOPMENT.md` records design decisions and what is still untested. Read it before changing the code.

The script writes `dist/firefox` and `dist/chrome` plus `dist/larvatus-<version>-firefox.zip` and `dist/larvatus-<version>-chrome.zip`. The Chrome manifest is derived from the Firefox one: a service worker instead of background scripts, the PNG icons in `extension/icons`, and no Firefox-only keys. Both browsers share the same code; `compat.js` maps `browser` to `chrome` where needed.

## Releases

`.github/workflows/build.yml` runs the tests, builds both packages, and lints the Firefox package with Mozilla's `web-ext lint` on every push and pull request. The packages are attached to each run as an artifact. To publish a release, set the version in `extension/manifest.json`, then push a matching tag such as `v1.0.1`. The workflow attaches both zips to a GitHub release, ready to upload to addons.mozilla.org and the Chrome Web Store. [PUBLISHING.md](PUBLISHING.md) has the submission steps.

## Licence

Copyright (C) 2026 Triplebit Corporation. Larvatus is free software, released under the GNU Affero General Public License, version 3. See [LICENSE](LICENSE).
