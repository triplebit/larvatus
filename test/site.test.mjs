// SPDX-FileCopyrightText: 2026 Triplebit Corporation
// SPDX-License-Identifier: AGPL-3.0-only

import test from "node:test";
import assert from "node:assert/strict";
import { siteDefaults } from "../extension/site.js";

test("prefix is the second-level label, description names the full host", () => {
  assert.deepEqual(siteDefaults("https://mail.google.com/mail/u/0/"), { prefix: "google", description: "Created on mail.google.com" });
  assert.deepEqual(siteDefaults("https://github.com/"), { prefix: "github", description: "Created on github.com" });
});

test("country second-level domains skip to the registrable label", () => {
  assert.equal(siteDefaults("https://www.bbc.co.uk/news").prefix, "bbc");
  assert.equal(siteDefaults("https://shop.example.com.au/").prefix, "example");
  assert.equal(siteDefaults("https://t.co/").prefix, "t");
});

test("prefix is sanitized to Stalwart's allowed characters", () => {
  assert.equal(siteDefaults("https://my-bank.example-site.com/").prefix, "example_site");
  assert.equal(siteDefaults("https://xn--bcher-kva.de/").prefix, "xn_bcher_kva");
});

test("single-label and IP hosts", () => {
  assert.equal(siteDefaults("http://localhost:8080/").prefix, "localhost");
  assert.deepEqual(siteDefaults("http://192.168.1.10/admin"), { prefix: "", description: "Created on 192.168.1.10" });
  assert.equal(siteDefaults("http://[::1]:3000/").prefix, "");
});

test("non-web pages give no defaults", () => {
  for (const url of ["about:newtab", "moz-extension://abc/popup.html", "file:///tmp/a.html", "not a url"]) {
    assert.equal(siteDefaults(url), null);
  }
});
