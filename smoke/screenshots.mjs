// Store screenshots of the Chrome build against the fake Stalwart in server.mjs, at 1280x800 in
// store/screenshots/. Same browser requirements as chrome.mjs:
//   CHROME_PATH=... PUPPETEER_SKIP_DOWNLOAD=1 node smoke/screenshots.mjs
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { origin, start } from "./server.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "store/screenshots");
mkdirSync(out, { recursive: true });
execFileSync("node", ["scripts/build.mjs"], { cwd: root, stdio: "ignore" });

const tmp = mkdtempSync(join(tmpdir(), "larvatus-shots-"));
const ext = join(tmp, "ext");
cpSync(join(root, "dist/chrome"), ext, { recursive: true });
// As in chrome.mjs: a headless browser cannot answer permission prompts.
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
  throw new Error("Timed out waiting for " + what);
}

// Newest first, as Stalwart returns them.
const day = 864e5;
const seed = [
  ["github.k7m2qa", "Created on github.com", 3, true],
  ["figma.p3w8zt", "Created on figma.com", 9, true],
  ["reddit.c6v1xe", "Created on reddit.com", 21, false],
  ["groceries.h9d4rn", "Weekly grocery delivery", 33, true],
  ["duolingo.m2s7kb", "Created on duolingo.com", 51, true],
  ["travel.q8f5jw", "Flight and hotel bookings", 72, true]
].map(([local, description, age, enable], i) => ({ id: "seed" + i, email: local + "@example.org", description, enable,
  createdAt: new Date(Date.now() - age * day).toISOString() }));

// A generic sign-up page for a fictional shop, served in place of the network.
const SITE = "https://wrenfield.example/join";
const SIGNUP = `<!doctype html><meta charset="utf-8"><title>Join Wrenfield Books</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2a2e; background: #eef2f0; }
  .card { width: 420px; padding: 36px 40px 40px; background: #fff; border-radius: 14px; box-shadow: 0 10px 40px rgb(30 50 45 / .12); }
  .brand { font: 600 15px Georgia, serif; letter-spacing: .4px; color: #2f6b5a; }
  h1 { margin: 10px 0 4px; font-size: 26px; letter-spacing: -.4px; }
  p { margin: 0 0 24px; color: #5d6b6f; }
  form { display: grid; gap: 6px; }
  label { margin-top: 10px; font-size: 13px; font-weight: 600; }
  input { padding: 11px 12px; font: inherit; border: 1px solid #cdd6d3; border-radius: 8px; }
  button { margin-top: 22px; padding: 12px; font: inherit; font-weight: 600; color: #fff; background: #2f6b5a; border: 0; border-radius: 8px; }
</style>
<div class="card"><div class="brand">Wrenfield Books</div><h1>Create your account</h1><p>Track orders and get early access to signed editions.</p>
<form><label for="name">Full name</label><input id="name" name="name" autocomplete="name" value="Sam Rivera">
<label for="email">Email</label><input id="email" type="email" name="email" autocomplete="email">
<label for="password">Password</label><input id="password" type="password" autocomplete="new-password" value="correct-horse">
<button>Create account</button></form></div>
<script>document.forms[0].addEventListener("submit", event => event.preventDefault());</script>`;

const server = await start();
server.aliases.push(...seed);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH, headless: true, userDataDir: join(tmp, "profile"),
  defaultViewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--ignore-certificate-errors", "--no-first-run", "--lang=en-US",
    ...(process.getuid?.() === 0 ? ["--no-sandbox"] : [])]
});
try {
  const worker = await browser.waitForTarget(target => target.type() === "service_worker" && target.url().endsWith("/background.js"), { timeout: 15000 });
  const base = "chrome-extension://" + new URL(worker.url()).host;
  const shot = (page, name) => page.screenshot({ path: join(out, name) });

  // Sign in as chrome.mjs does, then turn on the field button so the popup shows no hint about it.
  const settings = await browser.newPage();
  await settings.goto(base + "/settings.html");
  await settings.evaluate(async origin => {
    for (const action of ["signin-pending", "signin"]) {
      const response = await chrome.runtime.sendMessage({ action, origin });
      if (response.error) throw new Error(response.error);
    }
    await chrome.storage.local.set({ settings: { theme: "light" } });
  }, origin);
  await until("the account in Settings", () => settings.evaluate(() => !document.getElementById("connected").hidden));
  await settings.click("#field-button");
  await until("the field button switch", () => settings.evaluate(() => document.getElementById("field-button").getAttribute("aria-checked") === "true"));

  // The popup at its real width and Chrome's 600px popup height, on a plain backdrop.
  async function popup(backdrop) {
    const page = await browser.newPage();
    await page.goto(base + "/popup.html");
    await until("the list", () => page.$$eval("#aliases li", (rows, count) => rows.length === count, server.aliases.length));
    // :root to outrank style.css's own; overflow on the root so the body clips instead of the viewport.
    await page.addStyleTag({ content: `:root { height: 100vh; overflow: hidden; display: grid; place-items: center; background: ${backdrop}; }
      body { height: 600px; overflow: hidden; background: var(--page); border-radius: 12px; box-shadow: 0 24px 64px rgb(0 0 0 / .2), 0 2px 8px rgb(0 0 0 / .08); }` });
    return page;
  }

  const list = await popup("#e4e0d8");
  await shot(list, "1-popup.png");

  await list.type("#prefix", "wikipedia");
  await list.type("#description", "Created on wikipedia.org");
  await list.evaluate(() => document.activeElement.blur());
  await shot(list, "2-create.png");

  const removing = await popup("#e4e0d8");
  await removing.click("#aliases li:first-child .delete");
  // Focusing Cancel scrolls the clipped body; keep the header in view.
  await removing.evaluate(() => { document.body.scrollTop = 0; });
  await shot(removing, "5-delete.png");

  await settings.evaluate(() => chrome.storage.local.set({ settings: { theme: "dark", fieldButton: true } }));
  await shot(await popup("#3a3a3d"), "1-popup-dark.png");
  await settings.evaluate(() => chrome.storage.local.set({ settings: { theme: "light", fieldButton: true } }));

  const site = await browser.newPage();
  await site.setRequestInterception(true);
  site.on("request", request => request.url() === SITE ? request.respond({ contentType: "text/html", body: SIGNUP }) : request.continue());
  await site.goto(SITE);
  await until("the field button", () => site.$$eval("larvatus-button", hosts => hosts.length === 1));
  await sleep(500);
  const [spot] = await site.$$eval("larvatus-button", hosts => hosts.map(host => {
    const rect = host.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }));
  await site.mouse.click(spot.x, spot.y);
  await until("the address in the field", () => site.$eval("#email", input => input.value.endsWith("@example.org")));
  await site.mouse.move(0, 0);
  await sleep(300);
  await shot(site, "3-field-button.png");

  await settings.reload();
  await until("the account in Settings", () => settings.evaluate(() => !document.getElementById("connected").hidden));
  // The fake server's localhost origin and test account, shown as a person's own would be.
  await settings.evaluate(() => {
    document.getElementById("user").textContent = "sam@example.org";
    document.getElementById("host").textContent = "https://mail.example.org";
  });
  await shot(settings, "4-settings.png");
  console.log("Screenshots in " + out);
} finally {
  await browser.close();
  server.close();
}
