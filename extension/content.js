// Adds a MaskedEmail button to sign-up email fields. Registered by background.js only while the
// option is on; it still checks the setting so that pages already open stop showing it when turned off.
(() => {
  if (globalThis.maskedEmailFieldsLoaded) return;
  globalThis.maskedEmailFieldsLoaded = true;
  const { isEmailField, isSignInForm } = globalThis.MaskedEmailFields;

  let enabled = false;
  let outside = false;
  const tracked = new Map(); // input -> { host, button, tip }

  const ICON = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#dd2b55"/><path d="M9 21l23 12 23-12v19c0 6-4 10-10 10-5 0-10-4-13-8-3 4-8 8-13 8-6 0-10-4-10-10z" fill="#fffefa"/><path d="m16 32 10 5-10 1zm32 0-10 5 10 1z" fill="#dd2b55"/></svg>`;
  const STYLE = `
    :host { all: initial; position: absolute; z-index: 2147483647; display: block; }
    button { all: unset; box-sizing: border-box; display: block; width: 100%; height: 100%; cursor: pointer; border-radius: 22%;
      transition: transform .12s ease, opacity .12s ease; opacity: .92; }
    button:hover { transform: scale(1.08); opacity: 1; }
    button:focus-visible { outline: 2px solid #dd2b55; outline-offset: 2px; }
    button[aria-busy=true] { animation: pulse 0.9s ease-in-out infinite alternate; cursor: progress; }
    @keyframes pulse { from { opacity: .45; } to { opacity: 1; } }
    svg { display: block; width: 100%; height: 100%; }
    .tip { position: absolute; top: calc(100% + 8px); right: 0; width: max-content; max-width: 280px; padding: 8px 11px;
      font: 500 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #15140e; background: #fffefa;
      border: 1px solid #e6e2db; border-radius: 9px; box-shadow: 0 6px 20px rgb(0 0 0 / .14); }
    .tip.error { color: #b81f45; border-color: #f5c8d3; background: #fce7e9; }
    .tip[hidden] { display: none; }`;

  const visible = element => {
    if (!element.isConnected || element.disabled || element.readOnly || !element.getClientRects().length) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== "hidden" && style.opacity !== "0" && rect.width >= 60 && rect.height >= 16;
  };

  function labelText(input) {
    const labels = [...(input.labels || [])].map(label => label.textContent);
    return [input.getAttribute("aria-label"), ...labels].join(" ");
  }

  // The form around a field, or the nearest ancestor that looks like one for script-driven pages.
  function scopeOf(input) {
    if (input.form) return input.form;
    let node = input.parentElement;
    for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
      if (node.querySelector("input[type=password], button, input[type=submit]")) return node;
    }
    return input.parentElement || document.body;
  }

  function describeForm(input) {
    const scope = scopeOf(input);
    const passwords = [...scope.querySelectorAll("input[type=password]")].filter(visible);
    const others = [...scope.querySelectorAll("input:not([type]), input[type=text], input[type=email], input[type=tel], input[type=number], input[type=date], select, textarea")]
      .filter(field => field !== input && visible(field));
    const submits = [...scope.querySelectorAll("button:not([type]), button[type=submit], input[type=submit], [role=button]")];
    return {
      passwords: passwords.length,
      newPassword: passwords.some(field => /new-password/i.test(field.autocomplete)),
      currentPassword: passwords.some(field => /current-password/i.test(field.autocomplete)),
      otherFields: others.length,
      submitText: submits.map(button => [button.textContent, button.value, button.getAttribute("aria-label")].join(" ")).join(" "),
      context: [location.pathname, location.hash, scope.id, scope.getAttribute("name"), scope.getAttribute("class"), scope.getAttribute("action")].join(" ")
    };
  }

  function wanted(input) {
    return isEmailField({ type: input.getAttribute("type"), name: input.name, id: input.id, autocomplete: input.autocomplete,
      placeholder: input.placeholder, label: labelText(input) }) && visible(input) && !isSignInForm(describeForm(input));
  }

  // Fill the way typing does, so frameworks such as React, Vue and Angular record the value.
  // Only setting .value (with no input event) leaves the page's own state empty, and the page
  // then clears the field the next time it re-renders, for example on focus or blur.
  function fill(input, value) {
    input.focus();
    input.select();
    let typed = false;
    try { typed = document.execCommand("insertText", false, value); } catch {}
    if (!typed || input.value !== value) {
      // In a Firefox content script this goes through the native setter, past page-side value trackers.
      input.value = value;
      input.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: value }));
    }
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function showTip(entry, text, error = false) {
    clearTimeout(entry.tipTimer);
    entry.tip.textContent = text;
    entry.tip.classList.toggle("error", error);
    entry.tip.setAttribute("role", error ? "alert" : "status");
    entry.tip.hidden = false;
    entry.tipTimer = setTimeout(() => { entry.tip.hidden = true; }, error ? 6000 : 3000);
  }

  async function create(input, entry) {
    if (entry.button.getAttribute("aria-busy") === "true") return;
    entry.button.setAttribute("aria-busy", "true");
    try {
      const response = await browser.runtime.sendMessage({ action: "field-create" });
      if (!response || response.error) {
        const note = response?.type === "overQuota" ? " This quota can be configured by a Stalwart administrator in the admin dashboard." : "";
        throw new Error((response?.error || "MaskedEmail could not create an address.") + note);
      }
      fill(input, response.value.email);
    } catch (error) {
      showTip(entry, error.message, true);
    } finally {
      entry.button.removeAttribute("aria-busy");
    }
  }

  function track(input) {
    const host = document.createElement("maskedemail-button");
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${STYLE}</style><button type="button" title="Create a masked address with MaskedEmail" aria-label="Create a masked address with MaskedEmail">${ICON}</button><div class="tip" hidden></div>`;
    const entry = { host, button: root.querySelector("button"), tip: root.querySelector(".tip") };
    // Keep focus in the field when the button is pressed.
    entry.button.addEventListener("mousedown", event => event.preventDefault());
    entry.button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      if (event.isTrusted) create(input, entry);
    });
    // place() moves the button from wherever it is, so start it at its containing block's origin.
    Object.assign(host.style, { left: "0px", top: "0px" });
    document.documentElement.append(host);
    tracked.set(input, entry);
    resizes.observe(input);
    place(input, entry);
  }

  function untrack(input) {
    const entry = tracked.get(input);
    if (!entry) return;
    entry.host.remove();
    resizes.unobserve(input);
    tracked.delete(input);
  }

  // Fields in a fixed or sticky box do not scroll with the page, so neither may their button.
  function pinned(input) {
    for (let node = input; node; node = node.offsetParent) if (/fixed|sticky/.test(getComputedStyle(node).position)) return true;
    return false;
  }

  // The button sits in document coordinates (position: absolute), so the browser scrolls and zooms it with
  // the page itself; script-driven fixed positioning lags behind compositor scrolling, notably on iOS.
  function place(input, entry) {
    if (!input.isConnected) return untrack(input);
    const { host } = entry;
    if (!visible(input)) { host.style.display = "none"; return; }
    const rect = input.getBoundingClientRect();
    const size = Math.round(Math.max(16, Math.min(outside ? 28 : 22, rect.height - (outside ? 4 : 10))));
    // Kept inside the page's width, so a button beside a full-width field never adds sideways scrolling.
    const left = Math.min(outside ? rect.right + 6 : rect.right - size - 8, document.documentElement.clientWidth - size);
    const top = rect.top + (rect.height - size) / 2;
    entry.pinned = pinned(input);
    // shortcut: a sticky field's button is fixed and follows scrolling from script, so it lags like before; fine while sticky sign-up fields are rare.
    update(host.style, { display: "block", position: entry.pinned ? "fixed" : "absolute", width: size + "px", height: size + "px" });
    // Move by the measured offset, which covers scrolling and a positioned or transformed <html>.
    const at = host.getBoundingClientRect();
    update(host.style, {
      left: Math.round(parseFloat(host.style.left) + left - at.left) + "px",
      top: Math.round(parseFloat(host.style.top) + top - at.top) + "px"
    });
  }

  // Writes only what changed, so re-checking an unmoved field costs no style or layout work.
  function update(style, values) {
    for (const [key, value] of Object.entries(values)) if (style[key] !== value) style[key] = value;
  }

  let frame = 0;
  function placeAll() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      for (const [input, entry] of tracked) place(input, entry);
    });
  }
  const resizes = new ResizeObserver(placeAll);

  let scanTimer = 0;
  function scan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      if (!enabled) return;
      for (const input of tracked.keys()) if (!input.isConnected) untrack(input);
      for (const input of document.querySelectorAll("input")) {
        if (!tracked.has(input) && wanted(input)) track(input);
      }
      placeAll();
    }, 250);
  }

  // The buttons' own placement and insertion are not page changes, and would otherwise re-scan the page each time.
  const ours = node => node.localName === "maskedemail-button";
  const foreign = record => record.type === "attributes" ? !ours(record.target) : ![...record.addedNodes, ...record.removedNodes].every(ours);
  const mutations = new MutationObserver(records => records.some(foreign) && scan());

  // Page scrolling carries the buttons natively. Scroll boxes inside the page move their fields away from
  // the buttons, and pinned buttons are fixed, so those are placed again.
  function scrolled(event) {
    if (event.target !== document || [...tracked.values()].some(entry => entry.pinned)) placeAll();
  }

  let layoutTimer = 0;
  function start() {
    mutations.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["type", "style", "class", "hidden"] });
    addEventListener("scroll", scrolled, { capture: true, passive: true });
    addEventListener("resize", placeAll, { passive: true });
    // Pages also move fields with animations and layout changes no observer reports.
    layoutTimer = setInterval(() => tracked.size && placeAll(), 500);
    scan();
  }
  function stop() {
    mutations.disconnect();
    removeEventListener("scroll", scrolled, { capture: true });
    removeEventListener("resize", placeAll);
    clearInterval(layoutTimer);
    for (const input of [...tracked.keys()]) untrack(input);
  }

  function apply(settings = {}) {
    const wasEnabled = enabled;
    enabled = !!settings.fieldButton;
    outside = !!settings.buttonOutside;
    if (enabled && !wasEnabled) start();
    else if (!enabled && wasEnabled) stop();
    else placeAll();
  }
  browser.storage.local.get("settings").then(({ settings }) => apply(settings));
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) apply(changes.settings.newValue);
  });
})();
