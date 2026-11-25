// SPDX-FileCopyrightText: 2026 Triplebit Corporation
// SPDX-License-Identifier: AGPL-3.0-only

// End-to-end check of the Chrome build against the fake Stalwart in server.mjs: sign in, turn on
// the email field button, create an address from a sign-up form, and find it in the popup.
//   npm --prefix smoke install && node smoke/chrome.mjs
// CHROME_PATH picks an installed Chromium browser instead of Puppeteer's own Chrome. Branded
// Google Chrome 137 and later ignores --load-extension, so use Chromium, Brave or Chrome for Testing.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { origin, start, username } from "./server.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
execFileSync("node", ["scripts/build.mjs"], { cwd: root, stdio: "ignore" });

const tmp = mkdtempSync(join(tmpdir(), "larvatus-smoke-"));
const ext = join(tmp, "ext");
cpSync(join(root, "dist/chrome"), ext, { recursive: true });
// A headless browser cannot answer permission prompts, so the test copy gets its optional hosts up front.
const manifest = JSON.parse(readFileSync(join(ext, "manifest.json"), "utf8"));
manifest.host_permissions = manifest.optional_host_permissions;
delete manifest.optional_host_permissions;
writeFileSync(join(ext, "manifest.json"), JSON.stringify(manifest));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(what, check) {
  for (let i = 0; i < 50; i++) {
    if (await check()) return;
    await sleep(200);
  }
  assert.fail("Timed out waiting for " + what);
}

const server = await start();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH, headless: true, userDataDir: join(tmp, "profile"),
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--ignore-certificate-errors", "--no-first-run",
    ...(process.getuid?.() === 0 ? ["--no-sandbox"] : [])]
});
try {
  const worker = await browser.waitForTarget(target => target.type() === "service_worker" && target.url().endsWith("/background.js"), { timeout: 15000 });
  const base = "chrome-extension://" + new URL(worker.url()).host;
  const problems = [];
  async function open(url) {
    const page = await browser.newPage();
    page.on("pageerror", error => problems.push(url + ": " + error.message));
    page.on("console", message => { if (message.type() === "error") problems.push(url + ": " + message.text()); });
    await page.goto(url);
    return page;
  }

  // Signed out: Settings shows the sign-in form and locks the other cards.
  const settings = await open(base + "/settings.html");
  await until("the sign-in form", () => settings.evaluate(() => !document.getElementById("signin").hidden));
  assert.deepEqual(await settings.evaluate(() => [...document.querySelectorAll(".needs-account")].map(card => card.hidden)), [true]);

  // Sign in. The messages are what beginSignIn() sends once the permission prompt is answered.
  await settings.evaluate(async origin => {
    for (const action of ["signin-pending", "signin"]) {
      const response = await chrome.runtime.sendMessage({ action, origin });
      if (response.error) throw new Error(response.error);
    }
  }, origin);
  await until("the account in Settings", () => settings.evaluate(() => document.getElementById("user").textContent).then(user => user === username));
  await until("the sign-in window to close", () => settings.evaluate(async () => (await chrome.windows.getAll()).length === 1));
  // Sign-in opens Settings, which is already open here, so it is focused rather than opened twice.
  await sleep(500);
  assert.equal(await settings.evaluate(async url => (await chrome.tabs.query({ url })).length, base + "/settings.html"), 1);

  // Turn on the email field button with its real switch.
  await settings.click("#field-button");
  await until("the field button switch", () => settings.evaluate(() => document.getElementById("field-button").getAttribute("aria-checked") === "true"));

  // The sign-up form gets a button; the sign-in form on the same page does not.
  const site = await browser.newPage();
  await site.goto(origin + "/signup");
  await until("the button on the sign-up form", () => site.$$eval("larvatus-button", hosts => hosts.length === 1));
  await sleep(500);
  const [spot] = await site.$$eval("larvatus-button", hosts => hosts.map(host => {
    const rect = host.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }));
  await site.mouse.click(spot.x, spot.y);
  await until("the address in the field", () => site.$eval("#signup-email", input => input.value.endsWith("@example.org")));

  // The address survives the page writing its own state back on focus and blur.
  for (const field of ["#name", "#signup-email", "#name"]) await site.click(field);
  const [alias] = server.aliases;
  assert.equal(server.aliases.length, 1);
  assert.equal(await site.$eval("#signup-email", input => input.value), alias.email);
  assert.equal(await site.evaluate(() => pageState()), alias.email);
  // The default prefix is one random character; Chromium still sends the site as description and Associated Domain.
  assert.match(alias.email, /^[a-z0-9]\.k3x9q2@example\.org$/);
  assert.equal(alias.description, "Created on localhost");
  assert.equal(alias.forDomain, origin);

  // The popup lists it.
  const popup = await open(base + "/popup.html");
  await until("the address in the popup", () => popup.$$eval("#aliases .copy", rows => rows.map(row => row.textContent)).then(rows => rows.length === 1 && rows[0] === alias.email));

  assert.deepEqual(problems, []);
  console.log("ok: Chrome build signs in, fills a sign-up field and lists the address");
} finally {
  await browser.close();
  server.close();
}
