# MaskedEmail

A Firefox and Chrome toolbar extension for Stalwart masked addresses. Create an address with a random or custom prefix, search by address or description, click an address to copy it, switch delivery on or off, and delete it (the popup asks you to confirm first). Stalwart generates the address and suffix. When the popup opens on a website, the prefix defaults to the site’s name (`google` for mail.google.com) and the description to “Created on mail.google.com”. Edit or clear either before creating. The list uses the native creation timestamp, newest first.

## Load in Firefox

1. Open `about:debugging#/runtime/this-firefox` in Firefox 140 or later.
2. Click **Load Temporary Add-on…** and select **masked-email.xpi**, or select **extension/manifest.json** to load the source.
3. Open **MaskedEmail** from the extensions menu. Pin it to the toolbar for quick access.
4. Enter the canonical HTTPS address of your Stalwart server and click **Sign in with Stalwart**. Allow Firefox to connect, then sign in and approve account settings access on Stalwart. Firefox may close the popup during these steps. Sign-in finishes in the background, so reopen MaskedEmail afterwards.

The included package is unsigned. Firefox removes temporarily loaded extensions on restart. A permanent installation in standard Firefox requires Mozilla signing.

## Load in Chrome

Chrome, Edge, Brave and other Chromium browsers (version 121 or later) load the Chrome build.

1. Build the packages with `node scripts/build.mjs` (see Development), or download them from a GitHub release.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select **dist/chrome**.
3. Sign in as above. Chrome also asks for access to `127.0.0.1`: Stalwart only accepts loopback redirects, and Chrome's own sign-in helper only supports `chromiumapp.org` ones, so the extension opens the sign-in in a window and finishes when that window reaches `http://127.0.0.1/maskedemail-oauth/…`.

## Settings

Open **Settings** from the popup, or from Firefox's add-on manager.

- **Show MaskedEmail button on email fields** adds a button to email fields on sign-up forms. Clicking it creates an address for the site and fills it in. Firefox asks for access to websites the first time you turn this on. The button skips forms that look like sign-in forms: a current-password field, a "Sign in" or "Log in" submit button, a login URL, or just an email and one password.
- **Prefix for autofilled addresses** chooses the prefix the button uses: the site name (`github` for github.com), one random letter or digit, or a custom prefix of 1–64 letters, digits or underscores that starts with a letter or digit. The description is always "Created on" plus the site, and the address's Associated Domain is the site's origin, such as `https://github.com`.
- **Place the button outside the field** moves the button beside the field so it does not overlap password manager buttons.
- **Theme** switches between System, Light and Dark.

The button fills the field the way typing does, with `insertText` and its input events, so sites built with React, Vue or Angular keep the address when you move between fields.

## Server requirements and privacy

Use Stalwart 1.0.3 or later with its built-in OAuth server, public client registration, and the masked-address permissions for your account. OAuth discovery, the token endpoint, and JMAP must use the HTTPS origin you enter. The extension registers a public client automatically and signs in with the authorization code flow, PKCE S256, and Firefox’s extension-specific loopback callback.

The requested scope is `urn:stalwart:oauth:scope:settings`, which Stalwart uses for masked addresses. Tokens are kept in local Firefox extension storage. Alias lists stay in memory while the popup is open. Search runs locally. **Settings → Disconnect account** clears local credentials and requests token revocation.

Stalwart accepts custom prefixes of up to 64 ASCII letters, digits, and underscores, starting with a letter or digit. Leave the prefix blank for one random letter or digit, which keeps the address short; Stalwart invents a much longer prefix when none is sent. Disabling an alias makes Stalwart reject incoming mail for it. Re-enabling restores delivery for an unexpired address. Deleting an alias removes it from Stalwart for good, and mail to it is no longer delivered.

[Stalwart masked email](https://stalw.art/docs/email/management/masked-email/) · [OAuth scopes](https://stalw.art/docs/auth/oauth/scopes/) · [Firefox identity API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity)

## Development

The extension uses plain HTML, CSS, and JavaScript with no dependencies. `extension/manifest.json` is the Firefox manifest, so Firefox loads the folder directly. Run the tests with Node.js 22.7 or later.

```sh
node --test test/
```

Build both store packages from the project root. This also refreshes `masked-email.xpi`.

```sh
node scripts/build.mjs
```

The script writes `dist/firefox` and `dist/chrome` plus `dist/masked-email-<version>-firefox.zip` and `dist/masked-email-<version>-chrome.zip`. The Chrome manifest is derived from the Firefox one: a service worker instead of background scripts, the PNG icons in `extension/icons`, and no Firefox-only keys. Both browsers share the same code; `compat.js` maps `browser` to `chrome` where needed.

## Releases

`.github/workflows/build.yml` runs the tests, builds both packages, and lints the Firefox package with Mozilla's `web-ext lint` on every push and pull request. The packages are attached to each run as an artifact. To publish a release, set the version in `extension/manifest.json`, then push a matching tag such as `v1.0.1`. The workflow attaches both zips to a GitHub release, ready to upload to addons.mozilla.org and the Chrome Web Store.
