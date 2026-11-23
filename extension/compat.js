// Firefox exposes the WebExtension APIs as `browser`; Chromium as `chrome`, which also returns
// promises in Manifest V3. Import this first in every extension page and the background script.
globalThis.browser ??= globalThis.chrome;
