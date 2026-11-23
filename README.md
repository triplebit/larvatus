# MaskedEmail

A Firefox toolbar extension for Stalwart masked addresses. Create an address with a random or custom prefix, search by address or description, click an address to copy it, and switch delivery on or off. Stalwart generates the address and suffix. When the popup opens on a website, the prefix defaults to the site’s name (`google` for mail.google.com) and the description to “Created on mail.google.com”. Edit or clear either before creating. The list uses the native creation timestamp, newest first.

## Load in Firefox

1. Open `about:debugging#/runtime/this-firefox` in Firefox 140 or later.
2. Click **Load Temporary Add-on…** and select **masked-email.xpi**, or select **extension/manifest.json** to load the source.
3. Open **MaskedEmail** from the extensions menu. Pin it to the toolbar for quick access.
4. Enter the canonical HTTPS address of your Stalwart server and click **Sign in with Stalwart**. Allow Firefox to connect, then sign in and approve account settings access on Stalwart. Firefox may close the popup during these steps. Sign-in finishes in the background, so reopen MaskedEmail afterwards.

The included package is unsigned. Firefox removes temporarily loaded extensions on restart. A permanent installation in standard Firefox requires Mozilla signing.

## Settings

Open **Settings** from the popup, or from Firefox's add-on manager.

- **Show MaskedEmail button on email fields** adds a button to email fields on sign-up forms. Clicking it creates an address named after the site, like the popup's defaults, and fills it in. Firefox asks for access to websites the first time you turn this on. The button skips forms that look like sign-in forms: a current-password field, a "Sign in" or "Log in" submit button, a login URL, or just an email and one password.
- **Place the button outside the field** moves the button beside the field so it does not overlap password manager buttons.
- **Theme** switches between System, Light and Dark.

The button fills the field the way typing does, with `insertText` and its input events, so sites built with React, Vue or Angular keep the address when you move between fields.

## Server requirements and privacy

Use Stalwart 1.0.3 or later with its built-in OAuth server, public client registration, and the masked-address permissions for your account. OAuth discovery, the token endpoint, and JMAP must use the HTTPS origin you enter. The extension registers a public client automatically and signs in with the authorization code flow, PKCE S256, and Firefox’s extension-specific loopback callback.

The requested scope is `urn:stalwart:oauth:scope:settings`, which Stalwart uses for masked addresses. Tokens are kept in local Firefox extension storage. Alias lists stay in memory while the popup is open. Search runs locally. **Settings → Disconnect account** clears local credentials and requests token revocation.

Stalwart accepts custom prefixes of up to 64 ASCII letters, digits, and underscores, starting with a letter or digit. Leave the prefix blank for a fully server-generated address. Disabling an alias makes Stalwart reject incoming mail for it. Re-enabling restores delivery for an unexpired address.

[Stalwart masked email](https://stalw.art/docs/email/management/masked-email/) · [OAuth scopes](https://stalw.art/docs/auth/oauth/scopes/) · [Firefox identity API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity)

## Development

The extension uses plain HTML, CSS, and JavaScript and loads directly from the extension directory. Run the protocol tests with Node.js 22.7 or later.

```sh
node --test test/
```

To rebuild the XPI from the project root:

```sh
(cd extension && zip -q ../masked-email.xpi *.html *.css *.js *.json *.svg)
```
