// SPDX-FileCopyrightText: 2026 Triplebit Corporation
// SPDX-License-Identifier: AGPL-3.0-only

// Field rules for content.js. A classic script (content scripts cannot be modules), so it shares
// these through a global. The rules work on plain values so they can be tested without a browser.
// Chromium content scripts only have `chrome`; content.js uses `browser`.
globalThis.browser ??= globalThis.chrome;

(() => {
  const SIGN_UP = /\b(sign ?up|register|registration|create (an |your |new )?account|new account|join|get started|start (free|trial|now)|subscribe|enroll)\b/i;
  const SIGN_IN = /\b(sign ?in|log ?in|logon|log on)\b/i;
  const EMAIL = /e-?mail/i;
  const words = text => String(text || "").replace(/[^a-z0-9]+/gi, " ");

  // field: { type, name, id, autocomplete, placeholder, label }
  function isEmailField(field) {
    const type = (field.type || "text").toLowerCase();
    if (type === "email") return true;
    if (type !== "text") return false;
    if (/\bemail\b/i.test(field.autocomplete)) return true;
    return [field.name, field.id, field.placeholder, field.label].some(value => EMAIL.test(value || ""));
  }

  // form: { passwords, newPassword, currentPassword, otherFields, submitText, context }
  // passwords and otherFields count visible fields; submitText is the submit buttons' text;
  // context is the page path plus the form's id, name, class and action.
  // Sign-up signals win: a "Create account" link inside a login form is a link, not a submit button.
  function isSignInForm(form) {
    if (form.newPassword || form.passwords >= 2) return false;
    const submit = words(form.submitText);
    if (SIGN_UP.test(submit)) return false;
    if (form.currentPassword || SIGN_IN.test(submit)) return true;
    const context = words(form.context);
    if (SIGN_UP.test(context)) return false;
    if (SIGN_IN.test(context)) return true;
    // Just an email and a password, with nothing else to fill in.
    return form.passwords === 1 && form.otherFields === 0;
  }

  globalThis.LarvatusFields = { isEmailField, isSignInForm };
})();
