# Larvatus

Larvatus is a Firefox and Chrome toolbar extension for the masked addresses on your Stalwart mail server. From its popup you can:

- create an address with a random or custom prefix
- search by address or description
- click an address to copy it
- switch delivery on or off
- delete an address (the popup asks you to confirm first)

The list is sorted by Stalwart's own creation timestamp, newest first.

You choose the prefix, and Stalwart generates the address and its suffix. The prefix field starts with whatever Settings says: blank for a random prefix (the default), the site's name (`google` for mail.google.com), or a prefix of your own. When you open the popup on a website, the description starts as "Created on mail.google.com". You can edit or clear either one before creating the address.

In Firefox, sending the site's address to your server is optional: the description starts blank until you allow it by choosing **Site name** in Settings.

## Load in Firefox

1. Open `about:debugging#/runtime/this-firefox` in Firefox 140 or later.
2. Click **Load Temporary Add-on…** and select **larvatus.xpi**, or select **extension/manifest.json** to load the source.
3. Open **Larvatus** from the extensions menu. Pin it to the toolbar for quick access.
4. Enter the canonical HTTPS address of your Stalwart server and click **Sign in with Stalwart**. Allow Firefox to connect, then sign in and approve account settings access on Stalwart. Firefox may close the popup during these steps; sign-in finishes in the background and then opens Settings.

The included package is unsigned, and Firefox removes temporarily loaded extensions when it restarts. A permanent installation in standard Firefox requires Mozilla's signature.

## Load in Chrome

Chrome, Edge, Brave, and other Chromium browsers (version 121 or later) load the Chrome build.

1. Build the packages with `node scripts/build.mjs` (see Development), or download them from a GitHub release.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select **dist/chrome**.
3. Sign in as above. Chrome also asks for access to `127.0.0.1`. Stalwart only accepts loopback redirects, and Chrome's own sign-in helper only supports `chromiumapp.org` ones, so the extension opens the sign-in in a window and finishes when that window reaches `http://127.0.0.1/larvatus-oauth/…`.

## Settings

Open **Settings** from the popup, or from Firefox's add-on manager.

- **Default prefix for addresses** (under General) is the prefix the popup starts with and the one the email field button uses. It can be Random (the default: one random letter or digit), the site name (`github` for github.com), or a custom prefix of 1–64 letters, digits, or underscores that starts with a letter or digit.
- **Show Larvatus button on email fields** adds a button to email fields on sign-up forms. Clicking it creates an address for the site and fills it in, with "Created on" plus the site as its description and the site's origin (such as `https://github.com`) as its Associated Domain. Firefox asks for access to websites the first time you turn this on. The button skips forms that look like sign-in forms: ones with a current-password field, a "Sign in" or "Log in" submit button, a login URL, or just an email and one password.
- **Place the button outside the field** moves the button beside the field, so it doesn't overlap password manager buttons.
- **Theme** switches between System, Light, and Dark.

The button fills the field the way typing does (with `insertText` and its input events), so sites built with React, Vue, or Angular keep the address when you move between fields.

In Firefox, choosing Site name asks for Firefox's optional *browsing activity* data permission, which lets Larvatus send the site's address to your server. If you decline, the previous choice stays. Once granted, the permission stays granted whichever prefix you choose, until you withdraw it in Firefox's add-on manager under **Permissions and data**. Without it, Larvatus sends nothing about the sites you visit: the popup's description starts blank, the email field button sends no description or Associated Domain, and Site name works like Random. Other browsers always use the site.

## Your Stalwart server

You need Stalwart 1.0.3 or later with its built-in OAuth server, public client registration, and the masked-address permissions for your account. OAuth discovery, the token endpoint, and JMAP must use the HTTPS origin you enter. The extension registers a public client automatically and signs in with the authorization code flow, PKCE S256, and a loopback callback: Firefox's extension-specific one, or in Chrome the `127.0.0.1` address described above.

Stalwart accepts custom prefixes of up to 64 ASCII letters, digits, and underscores, starting with a letter or digit. If you send no prefix, Stalwart invents a much longer one, so a blank prefix field sends one random letter or digit to keep the address short. Switching an address off makes Stalwart reject incoming mail for it, and switching it back on restores delivery if the address hasn't expired. Deleting an address removes it from Stalwart for good, and mail to it is no longer delivered.

[Stalwart masked email](https://stalw.art/docs/email/management/masked-email/) · [OAuth scopes](https://stalw.art/docs/auth/oauth/scopes/) · [Firefox identity API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity)

## Privacy

Larvatus requests one scope, `urn:stalwart:oauth:scope:settings`, which Stalwart uses for masked addresses. Tokens are kept in your browser's local extension storage. **Settings → Disconnect account** clears the local credentials and asks the server to revoke the tokens.

The current site's address reaches your server only in what you create: the suggested description, and the Associated Domain of addresses made with the email field button. In Firefox that needs the optional browsing activity permission described under Settings. Your address list stays in memory only while the popup is open, and search runs locally.

## Development

The extension is plain HTML, CSS, and JavaScript with no dependencies. `extension/manifest.json` is the Firefox manifest, so Firefox loads the folder directly. Run the tests with Node.js 22.7 or later:

```sh
node --test test/*.test.mjs
```

Build both store packages from the project root. This also refreshes `larvatus.xpi`.

```sh
node scripts/build.mjs
```

The build writes `dist/firefox` and `dist/chrome`, plus `dist/larvatus-<version>-firefox.zip` and `dist/larvatus-<version>-chrome.zip`. The Chrome manifest is derived from the Firefox one: a service worker instead of background scripts, the PNG icons in `extension/icons`, and no Firefox-only keys. Both browsers share the same code; `compat.js` maps `browser` to `chrome` where needed.

The end-to-end test drives a headless Chromium with the Chrome build against a fake Stalwart server. It installs Puppeteer under `smoke/`. Set `CHROME_PATH` to use Chromium or Brave instead of Puppeteer's own Chrome.

```sh
npm --prefix smoke install && node smoke/chrome.mjs
```

[DEVELOPMENT.md](DEVELOPMENT.md) records the design decisions and what is still untested.

## Releases

`.github/workflows/build.yml` runs the tests, builds both packages, and lints the Firefox package with Mozilla's `web-ext lint` on every push and pull request, and attaches the packages to each run as an artifact. To publish a release, set the version in `extension/manifest.json`, then push a matching tag such as `v1.0.1`. The workflow attaches both zips to a GitHub release, ready to upload to addons.mozilla.org and the Chrome Web Store. [PUBLISHING.md](PUBLISHING.md) has the submission steps.

## License

Copyright (C) 2026 Triplebit Corporation. Larvatus is free software, released under the GNU Affero General Public License, version 3. See [LICENSE](LICENSE).
