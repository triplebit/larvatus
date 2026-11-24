# Store listing text for Larvatus 1.0.1

Text to paste into addons.mozilla.org (AMO) and the Chrome Web Store (CWS). Each block under a heading is meant to be pasted as it stands. Publisher on both stores: Triplebit Corporation.

## 1. Name and summary

Name:

```
Larvatus
```

Summary (AMO "Summary", limit 250 characters) and short description (CWS, taken from the manifest `description`, limit 132 characters). The manifest description is 60 characters, so it fits both and is reused as is (it keeps the manifest's wording, without the Oxford comma):

```
Create, find and switch Stalwart masked addresses on or off.
```

## 2. Long description

The same text for both stores. Plain text, no markup.

```
Larvatus creates and manages masked addresses on your own Stalwart mail server. A masked address is a separate address that delivers to your inbox, so you can give each site its own address and switch it off when you no longer want its mail.

In the toolbar popup you can:
- See your masked addresses, newest first, with their descriptions and creation dates.
- Search by address or description.
- Create an address with an optional prefix and description. Leave the prefix blank for one random letter or digit, or choose in Settings to start with the site's name (for example "github") or your own prefix. On a website, a description is suggested, for example "Created on github.com", and you can edit or clear it. In some browsers the suggestion is off until you choose the site's name as the prefix in Settings. Your server generates the rest of the address.
- Click an address to copy it.
- Switch an address off, which makes your server reject mail sent to it, and on again to restore delivery.
- Delete an address after confirming. Mail sent to it is no longer delivered.
- Open an address on your server's account page to edit it there.

Optional button on email fields:
Turn on "Show Larvatus button on email fields" in Settings to add a button to email fields on sign-up forms. Clicking it creates a masked address for the site and fills it in. The button skips forms that look like sign-in forms. It uses the default prefix from Settings (one random character, the site's name, or your own), and you choose whether it sits inside or beside the field, so it doesn't cover password manager buttons. The button is off until you turn it on. Without permission to use the site's address, it creates the address with a random prefix in place of the site's name, and with no description.

Requirements:
- Stalwart 1.0.3 or later, reachable over HTTPS, with its built-in OAuth server and public client registration enabled.
- A Stalwart account that is allowed to manage masked addresses. Your server's administrator sets how many you can have.

Signing in:
Enter your server's address and choose "Sign in with Stalwart". You sign in on your server's own page, so Larvatus never sees your password. It registers itself with your server and signs in with OAuth (authorization code with PKCE), asking only for access to your account settings, which is where Stalwart keeps masked addresses. "Disconnect account" in Settings removes the sign-in from your browser and asks your server to revoke it.

Permissions:
- Access to your mail server: asked when you sign in, for the server you enter and no other.
- Access to websites: asked only when you turn on the email field button, so Larvatus can add the button to email fields. If you never turn the button on, Larvatus never asks for it.
- Use of the site's address (some browsers): asked when you choose the site's name as the default prefix in Settings. Without it, Larvatus sends nothing about the sites you visit to your server. Once allowed, it stays allowed until you turn it off in your browser's add-on settings.
- In some browsers, sign-in also asks for access to 127.0.0.1, the local address your server sends you back to after you sign in.
- Current tab: when you open the popup, Larvatus reads the current tab's address to suggest a description and, if you chose it, the site's name as prefix. In some browsers it does this only once you allow use of the site's address.
- Storage: keeps your server address, sign-in tokens and settings in your browser.
- Identity and scripting: used for the sign-in redirect and to add the email field button.

Privacy:
Larvatus talks only to the Stalwart server you sign in to. It has no servers of its own, no analytics, and no tracking, and it sends nothing to Triplebit or anyone else. Your sign-in tokens and settings stay in your browser. Your address list is fetched from your server and kept only while the popup is open. Search runs in your browser. When you create an address, its description is stored on your server, and an address made with the email field button also stores the site's address (for example https://github.com) as its associated domain. In browsers that let you choose, the site's address is used and sent only once you allow it. The button looks at a page's form fields in your browser to decide where to appear; it does not read or send page contents.

Privacy policy: https://larvatus.net/privacy/
Website: https://larvatus.net/

Larvatus is published free of charge by Triplebit Corporation, a nonprofit. It is not affiliated with or endorsed by Stalwart Labs.
```

## 3. Categories and screenshot captions

Categories:
- AMO: Privacy & Security (primary). If a second is wanted: Social & Communication.
- CWS: Privacy & Security (under "Make Chrome Yours"). Alternative: Productivity > Communication.

Screenshot captions. The files are 1280x800 posters: a headline, the real interface captured from the fake test server, and callouts. The Chrome Web Store takes five at most, so upload 1 to 5 there; addons.mozilla.org can take all six. The Chrome Web Store's promo tiles are in `store/promo/`: `small-440x280.png` (small promo tile) and `marquee-1400x560.png` (marquee promo tile). They carry no caption.

| File | Headline in the image | Caption |
|---|---|---|
| `1-addresses.png` | A separate address for every site. | Your masked addresses in the toolbar popup: click one to copy it, or switch it off |
| `2-field-button.png` | Sign up without giving out your address. | The optional button on a sign-up email field creates a masked address and fills it in |
| `3-create.png` | Name it, or leave it random. | Creating an address with a prefix and description |
| `4-switch-off.png` | Too much mail? Switch it off. | Your server rejects mail to an address that is switched off |
| `5-your-server.png` | Your real address stays private. | Each site gets its own address; mail goes through your own Stalwart server to your inbox |
| `6-dark.png` | Light or dark. | The popup in light and dark mode |

## 4. AMO: Notes for reviewers

```
Larvatus manages masked addresses on a Stalwart mail server (https://stalw.art/), so testing needs a Stalwart 1.0.3 or later server with its OAuth server and public client registration enabled. Larvatus has no servers of its own and talks only to the Stalwart server the person enters.

Test server and account:
  Server address: [OWNER: TEST SERVER, e.g. mail.example.org]
  Username:       [OWNER: TEST ACCOUNT]
  Password:       [OWNER: TEST PASSWORD]
  [OWNER: say whether the account has a masked-address limit, and that it may be reset after review]

Sign-in flow:
1. Open Larvatus from the toolbar, enter the server address and click "Sign in with Stalwart". When sign-in completes, the extension opens its Settings page (runtime.openOptionsPage).
2. Firefox asks for access to that one server (an optional host permission from "https://*/*"). The popup may close for this prompt. Sign-in continues in the background script (permissions.onAdded), so reopen the popup afterward if needed.
3. The background script reads the server's OAuth discovery document, registers a public client (dynamic client registration, token_endpoint_auth_method "none"), and calls identity.launchWebAuthFlow with Firefox's loopback redirect (http://127.0.0.1/mozoauth2/<id>). It uses the authorization code flow with PKCE S256 and the scope urn:stalwart:oauth:scope:settings, which Stalwart uses for masked addresses.
4. Sign in and approve access on the Stalwart page. Tokens are stored in storage.local. Settings > "Disconnect account" deletes them and calls the server's revocation endpoint.

Then create an address from the popup, copy it, switch it off and on, delete it, and search.

Why host permissions are optional:
- The mail server is chosen by the person, so it cannot be listed in the manifest. Access is requested at sign-in for that server's origin only.
- The email field button is off by default. Turning it on in Settings ("Show Larvatus button on email fields") requests "https://*/*"; only then does the background script register content.js and fields.js with scripting.registerContentScripts. Turning it off, or removing the permission, unregisters them. To test it, turn it on and open any sign-up form with an email field; clicking the button creates an address whose description is "Created on <hostname>" and whose forDomain is the page origin, both sent to the person's own Stalwart server.
- activeTab is used only to read the current tab's URL when the popup opens, to suggest a description (and the site's name as prefix if chosen in Settings), and only while browsingActivity is granted.

Data collection: authenticationInfo (OAuth tokens, sent only to the person's own server) and personallyIdentifyingInfo (their account name and masked addresses) are required. browsingActivity is optional: the current site's hostname (in the suggested description) and origin (as forDomain, from the field button) are sent to the person's own Stalwart server only while it is granted. It is requested with permissions.request when the person chooses "Site name" as the default prefix in Settings, and is not removed when they choose another prefix; it is withdrawn in about:addons. Without it, the popup does not read the active tab, and the field button sends no description and no forDomain and uses a random one-character prefix in place of the site's name (enforced in background.js, createForField). Settings follows permissions.onAdded/onRemoved, so after revoking it in about:addons "Site name" shows as "Random".

Source: the package is the unmodified contents of the extension/ folder of https://github.com/triplebit/maskedemail-extension. Nothing is bundled, minified, or generated, and there are no dependencies. web-ext lint reports one warning: Firefox for Android 140 predates data_collection_permissions. The add-on has no gecko_android key and is for desktop Firefox only.
```

## 5. CWS: Privacy practices tab

Single purpose:

```
Larvatus creates and manages masked email addresses on the user's own Stalwart mail server: listing, searching, creating, copying, switching on or off, and deleting them, from the toolbar popup or from an optional button on sign-up email fields.
```

Permission justifications. The Chrome manifest that `scripts/build.mjs` writes declares `permissions` `activeTab`, `identity`, `scripting`, `storage` and `optional_host_permissions` `https://*/*`, `http://127.0.0.1/*`. This matches the list in PUBLISHING.md.

`storage`:
```
Keeps the user's server address, OAuth tokens for that server and the extension's settings on the device (local storage), and a pending sign-in in session storage while the user signs in.
```

`identity`:
```
Used only for identity.getRedirectURL(), whose extension id becomes part of the loopback redirect address the extension registers with the user's Stalwart server at sign-in.
```

`activeTab`:
```
When the user opens the popup, the extension reads the active tab's URL to suggest a description for a new address, such as "Created on github.com", and the site's name ("github") as prefix if the user chose that in Settings. The user can edit or clear both.
```

`scripting`:
```
Registers the content script that adds the Larvatus button to email fields on sign-up forms, and injects it into tabs already open. This happens only after the user turns the button on in Settings and grants website access; turning it off unregisters the script.
```

Host permission `https://*/*` (optional):
```
Requested in two cases, both started by the user. At sign-in, for the origin of the Stalwart server the user enters, so the extension can call its OAuth and JMAP endpoints. The user chooses the server, so it cannot be listed in advance. When the user turns on the email field button in Settings, for all HTTPS sites, so the button can be added to email fields. The button is off by default and the extension works without it.
```

Host permission `http://127.0.0.1/*` (optional):
```
Requested at sign-in. Stalwart only accepts loopback redirect addresses for public OAuth clients, and Chrome's launchWebAuthFlow only completes on chromiumapp.org, so the extension opens the sign-in in a window and reads that tab's URL when it reaches http://127.0.0.1/larvatus-oauth/<id> to collect the authorization code. Nothing is served from or sent to 127.0.0.1.
```

Remote code:

```
No, I am not using remote code. All JavaScript is in the package. The extension only exchanges JSON data with the user's own Stalwart server.
```

Data usage. Tick:
- Personally identifiable information: the user's account name and their masked email addresses, read from and written to the user's own Stalwart server.
- Authentication information: OAuth tokens for that server, stored on the device and sent only to that server.
Leave unticked: web history, health, financial and payment, personal communications, location, user activity, website content. The content script inspects form fields on the device only and sends nothing from the page.

Certify all three statements: data is not sold or transferred to third parties outside the approved use cases; not used or transferred for purposes unrelated to the single purpose; not used or transferred to determine creditworthiness or for lending.

Privacy policy URL: `https://larvatus.net/privacy/`

## 6. Open questions for the owner

1. **Decided: AMO `data_collection_permissions`.** `browsingActivity` is optional on Firefox (`"optional": ["browsingActivity"]` beside the required `authenticationInfo` and `personallyIdentifyingInfo`). Larvatus asks for it at run time from Settings and sends no site address without it. `websiteContent` and `websiteActivity` are not needed: the content script reads form structure on the device and sends nothing from the page.
2. **Decided: no CWS "Web history" tick.** Chromium behavior is unchanged (it always suggests from the site), and section 5 leaves Web history unticked.
3. **Done: privacy policy wording.** The policy now says that a kept suggested description is stored on the server and that Firefox makes site data a choice. It is live (checked 2026-11-24).
4. **Decided: license.** GNU Affero General Public License, version 3 (`LICENSE` in the repository). On the AMO listing choose the AGPL 3.0 entry.
5. **Support contact** for both listings: info@triplebit.org (the privacy contact) or another address, and a support site (larvatus.net or the GitHub repository).
6. **Test server for reviewers**: the placeholders in section 4. The repository URL there is the git remote (`triplebit/maskedemail-extension`); it needs to be public for reviewers to use it, and may be renamed later.
7. **Name**: "Larvatus" matches the manifest. Settings calls it "Larvatus (for Stalwart Mail)"; a listing name such as "Larvatus for Stalwart" would be easier to find in store search, but AMO takes the name from the manifest, so it would mean a manifest change.
