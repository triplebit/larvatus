import test from "node:test";
import assert from "node:assert/strict";
import "../extension/fields.js";

const { isEmailField, isSignInForm } = globalThis.LarvatusFields;
const form = fields => ({ passwords: 0, newPassword: false, currentPassword: false, otherFields: 0, submitText: "", context: "/", ...fields });

test("recognizes email fields and skips other inputs", () => {
  assert.ok(isEmailField({ type: "email" }));
  assert.ok(isEmailField({ type: "text", name: "user_email" }));
  assert.ok(isEmailField({ type: "text", autocomplete: "email" }));
  assert.ok(isEmailField({ type: "", placeholder: "E-mail address" }));
  assert.ok(isEmailField({ type: "text", label: "Your email" }));
  assert.ok(!isEmailField({ type: "checkbox", name: "email_opt_in" }));
  assert.ok(!isEmailField({ type: "text", name: "username" }));
  assert.ok(!isEmailField({ type: "password", id: "email-password" }));
});

test("shows the button on sign-up forms", () => {
  assert.ok(!isSignInForm(form({ passwords: 2 })));
  assert.ok(!isSignInForm(form({ passwords: 1, newPassword: true })));
  assert.ok(!isSignInForm(form({ passwords: 1, submitText: "Create account" })));
  assert.ok(!isSignInForm(form({ passwords: 1, otherFields: 2, submitText: "Continue", context: "/" })));
  assert.ok(!isSignInForm(form({ submitText: "Subscribe" })));
  assert.ok(!isSignInForm(form({ context: "/users/sign_up" })));
  assert.ok(!isSignInForm(form({ submitText: "Next" })), "email-only forms with no login signal still get the button");
});

test("hides the button on sign-in forms", () => {
  assert.ok(isSignInForm(form({ passwords: 1, currentPassword: true })));
  assert.ok(isSignInForm(form({ passwords: 1, submitText: "Sign in" })));
  assert.ok(isSignInForm(form({ passwords: 1, submitText: "Log in" })));
  assert.ok(isSignInForm(form({ submitText: "Continue", context: "/u/login/identifier" })));
  assert.ok(isSignInForm(form({ submitText: "Next", context: "/signin login-form" })));
  assert.ok(isSignInForm(form({ passwords: 1 })), "a bare email and password pair is a login");
});

test("sign-up signals beat sign-in ones", () => {
  assert.ok(!isSignInForm(form({ passwords: 1, submitText: "Sign up", context: "/login" })));
  assert.ok(!isSignInForm(form({ passwords: 2, submitText: "Log in" })));
});
