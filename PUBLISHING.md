# Publishing Larvatus to the browser stores

The publisher on both stores is **Triplebit Corporation**. Store forms change often, so treat the field names here as a guide and the stores' own help pages as the authority.

## Before the first submission

1. **Privacy policy page.** Both stores need a public URL: <https://larvatus.net/privacy/> (its source is `site/privacy/index.html` in the apps' repository; check it is live). It should say what the extension handles and where it goes:
   - the address of your Stalwart server, and OAuth tokens for it, kept in the browser's local extension storage;
   - your masked addresses and their descriptions, read from and written to that server only;
   - the address of the current tab, used to suggest a description and, if chosen, the site's name as prefix; when the email field button creates an address, the site's origin is stored with it on your server as its Associated Domain. In Firefox this is optional (the browsing activity data permission) and off until the person chooses Site name as the default prefix;
   - nothing is sent to Triplebit or any third party, and there is no analytics.
2. **Screenshots.** Chrome needs at least one at 1280×800 or 640×400 and takes five at most.
   `node smoke/screenshots.mjs` (see DEVELOPMENT.md) writes six 1280×800 posters to `store/screenshots/`: a headline and callouts around the popup, the button on a sign-up email field, and a diagram, captured from the fake server. `store/listing.md` has their captions.
3. **Listing text.** A short summary (the manifest description works) and a longer description. The README's first paragraph and Settings section are a starting point.
4. **Test the packages in real browsers.** Load `dist/firefox` and `dist/chrome` as in the README, sign in to a Stalwart server, create an address from the popup and from the field button, toggle one and delete one.
5. **Set the version** in `extension/manifest.json`. Each store accepts a version number once.

## Build

```sh
node --test test/*.test.mjs
node scripts/build.mjs
```

This writes `dist/larvatus-<version>-firefox.zip` and `dist/larvatus-<version>-chrome.zip`. Pushing a tag such as `v1.0.0` that matches the manifest version builds the same two files in CI and attaches them to a GitHub release.

## Firefox: addons.mozilla.org

1. Sign in at <https://addons.mozilla.org/developers/> with the Mozilla account Triplebit Corporation will publish from, and choose **Submit a New Add-on**.
2. Distribution: **On this site**. ("On your own" only signs the file for self-hosting.)
3. Upload `larvatus-<version>-firefox.zip`. The validator runs; CI already runs the same check with `web-ext lint`.
4. Source code: answer **No**. Nothing is bundled, minified or generated; the package is a copy of `extension/`.
5. Listing: name, summary, description, category (Privacy & Security fits), license, support email or site, and the privacy policy.
6. Data collection: the manifest declares `authenticationInfo` and `personallyIdentifyingInfo` as required, which is what Firefox shows people at install, and `browsingActivity` as optional. Firefox does not show optional data types at install; Larvatus asks for `browsingActivity` at run time, when the person chooses "Site name" as the default prefix in Settings, and sends nothing about the sites visited without it. It stays granted until withdrawn in the add-on manager. Keep the privacy policy consistent with this.
7. Notes for reviewers: say that testing needs a Stalwart 1.0.3 or later server with OAuth and public client registration, and give a test server address and account if you can.
8. Submit.

The add-on id `extension@larvatus.net` is fixed from the first upload. Changing it later makes a different add-on.

## Chrome Web Store

1. Register at <https://chrome.google.com/webstore/devconsole> with the Google account Triplebit Corporation will publish from. There is a one-time registration fee, and the publisher name is set in the account. Then choose **New item**.
2. Upload `larvatus-<version>-chrome.zip`.
3. **Store listing**: description, category, language, the 128 px icon (`extension/icons/icon-128.png`), the screenshots (five at most), and the promo tiles from `store/promo/`: `small-440x280.png` as the small promo tile and `marquee-1400x560.png` as the marquee.
4. **Privacy**:
   - Single purpose: creating and managing Stalwart masked addresses.
   - Permission justifications:
     - `storage`: keeps the server address, sign-in tokens and settings on the device.
     - `identity`: gives the extension its sign-in redirect address.
     - `activeTab`: reads the current tab's address when the popup opens, to suggest a description and, if chosen in Settings, the site's name as prefix.
     - `scripting`: adds the button to email fields, only after the person turns that option on.
     - Optional host access `https://*/*`: asked for when the person turns on the email field button, and for the person's own mail server at sign-in.
     - Optional host access `http://127.0.0.1/*`: asked for at sign-in. Stalwart only accepts loopback redirects for public clients, so the extension reads the sign-in tab's redirect address.
   - Remote code: none.
   - Data use: authentication information and personally identifiable information (email addresses), with the three "not sold, not used for unrelated purposes, not used for creditworthiness" statements certified.
   - Privacy policy URL.
5. **Distribution**: public, all regions, free.
6. Submit for review. Optional access to all sites usually means a closer, slower review.

The Web Store gives the extension a new id, different from the unpacked one. The sign-in redirect is built from the id at run time, so nothing needs changing, but anyone who used an unpacked build signs in again.

## Updates

Raise the version in `extension/manifest.json`, rebuild (or push the matching tag), and upload the new zip as a new version of the existing item on each store. Do not create a second item.
