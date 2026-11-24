// Store screenshots of the Chrome build against the fake Stalwart in server.mjs: 1280x800 posters in
// store/screenshots/, composed in poster.mjs around live 2x captures of the extension, and the Chrome Web Store's
// two promo tiles in store/promo/. Same browser requirements as chrome.mjs:
//   CHROME_PATH=... PUPPETEER_SKIP_DOWNLOAD=1 node smoke/screenshots.mjs
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { address, callout, copy, diagram, DIAGRAM_CSS, lockup, mask, poster, shot } from "./poster.mjs";
import { origin, start } from "./server.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "store/screenshots");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
mkdirSync(join(root, "store/promo"), { recursive: true });
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


// A 2x capture of the clip (CSS pixels) with the rects of the named elements relative to it.
async function capture(page, clip, targets = {}) {
  const rects = await page.evaluate(targets => Object.fromEntries(Object.entries(targets).map(([name, selector]) => {
    const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
    return [name, { x, y, width, height }];
  })), targets);
  for (const rect of Object.values(rects)) { rect.x -= clip.x; rect.y -= clip.y; }
  const png = await page.screenshot({ clip, encoding: "base64" });
  return { src: "data:image/png;base64," + png, width: clip.width, height: clip.height, rects };
}
const rectOf = (page, selector) => page.$eval(selector, element => {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
});

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
  const setSettings = value => settings.evaluate(value => chrome.storage.local.set({ settings: value }), value);

  // The popup at its real width, sharp at 2x; height 600 is Chrome's popup limit.
  async function popup(height = 600) {
    const page = await browser.newPage();
    await page.setViewport({ width: 475, height, deviceScaleFactor: 2 });
    await page.goto(base + "/popup.html");
    await until("the list", () => page.$$eval("#aliases li", (rows, count) => rows.length === count, server.aliases.length));
    return page;
  }
  const row = n => `#aliases li:nth-child(${n})`;
  const whole = { x: 0, y: 0, width: 475, height: 600 };

  const list = await popup();
  const light = await capture(list, whole);
  await list.type("#prefix", "wikipedia");
  await list.type("#description", "Created on wikipedia.org");
  await list.evaluate(() => document.activeElement.blur());
  const composer = await rectOf(list, "#composer");
  const create = await capture(list, { x: 0, y: 0, width: 475, height: composer.y + composer.height + 150 }, { create: "#create" });

  // A tall viewport for the two captures that must not cut the third row off: a popup that runs off the
  // poster's bottom edge, and three rows on their own.
  const tall = await popup(1000);
  const long = await capture(tall, { ...whole, height: 700 }, { copy: row(1) + " .copy", off: row(3) + " .switch" });
  const [first, third] = [await rectOf(tall, row(1)), await rectOf(tall, row(3))];
  const rows = await capture(tall, { x: 0, y: first.y + 1, width: 475, height: third.y + third.height - first.y - 1 }, { off: row(3) + " .switch" });

  await setSettings({ theme: "dark", fieldButton: true });
  const dark = await capture(await popup(), whole);

  // The field button, with addresses named after the site for this one shot.
  await setSettings({ theme: "light", fieldButton: true, fieldPrefix: "site" });
  const site = await browser.newPage();
  await site.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
  await site.setRequestInterception(true);
  site.on("request", request => request.url() === SITE ? request.respond({ contentType: "text/html", body: SIGNUP }) : request.continue());
  await site.goto(SITE);
  await until("the field button", () => site.$$eval("larvatus-button", hosts => hosts.length === 1));
  await sleep(500);
  const button = await rectOf(site, "larvatus-button");
  await site.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
  await until("the address in the field", () => site.$eval("#email", input => input.value.endsWith("@example.org")));
  const filled = await site.$eval("#email", input => input.value);
  if (!/^wrenfield\.\w+@example\.org$/.test(filled)) throw new Error("Unexpected address " + filled);
  await site.mouse.move(0, 0);
  await sleep(300);
  const card = await rectOf(site, ".card");
  const pad = 44;
  const signup = await capture(site, { x: card.x - pad, y: card.y - pad, width: card.width + 2 * pad, height: card.height + 2 * pad }, { button: "larvatus-button" });
  await setSettings({ theme: "light", fieldButton: true });

  // Compose each poster and screenshot it at 1280x800.
  const canvas = await browser.newPage();
  await canvas.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  async function render(name, html, width = 1280, height = 800) {
    await canvas.setViewport({ width, height, deviceScaleFactor: 1 });
    await canvas.setContent(html, { waitUntil: "load" });
    await canvas.evaluate(() => document.fonts.ready);
    await canvas.screenshot({ path: join(out, name) });
  }

  {
    const ui = shot(long, { x: 548, y: 72, scale: 1.1 });
    await render("1-addresses.png", poster(`
      <div class="panel" style="left: 610px; top: 30px; width: 560px; height: 820px; transform: rotate(7deg); background: linear-gradient(160deg, #e43a62, #c4214a)"></div>
      ${lockup("left: 64px; top: 52px")}
      ${copy("left: 80px; top: 158px; width: 410px", "A separate address for *every site.*",
        "Create and manage masked addresses on your own Stalwart mail server.")}
      ${ui.html}
      ${callout(ui.at("copy", 0, .5), "left", "Click to copy")}
      ${callout(ui.at("off", 1, .5), "right", "Off: your server<br>rejects its mail")}`,
      `.callout.right span { border-radius: 18px; line-height: 1.3; }`));
  }
  {
    const scale = 1.12;
    const ui = shot(signup, { x: 72, y: 168, scale, className: "page" });
    await render("2-field-button.png", poster(`
      <div style="left: 40px; top: 40px; width: 900px; height: 900px; background: radial-gradient(closest-side, rgb(221 43 85 / .18), transparent)"></div>
      <div class="window" style="left: 72px; top: 122px; width: ${signup.width * scale}px; height: 760px">
        <div class="bar"><i></i><i></i><i></i><span>wrenfield.example/join</span></div></div>
      ${ui.html}
      ${lockup("right: 64px; top: 52px")}
      ${copy("left: 790px; top: 220px; width: 420px", "Sign up without giving out *your address.*",
        "An optional button on email fields creates a masked address and fills it in.")}
      ${callout(ui.at("button", 1, .5), "right", "One click: new address, filled in")}`,
      `.window { overflow: hidden; border-radius: 14px; background: #eef2f0; box-shadow: 0 32px 80px rgb(30 50 45 / .22), 0 4px 14px rgb(0 0 0 / .08); }
       .bar { display: flex; align-items: center; gap: 8px; height: 46px; padding: 0 18px; background: #fffefa; border-bottom: 1px solid var(--line); }
       .bar i { width: 12px; height: 12px; border-radius: 50%; background: #dcd7ce; }
       .bar span { margin-left: 22px; flex: 1; max-width: 360px; padding: 5px 14px; border-radius: 999px; background: #efeae0; color: var(--muted); font-size: 14px; }`));
  }
  {
    const scale = 1.36, x = Math.round((1280 - create.width * scale) / 2);
    const ui = shot(create, { x, y: 272, scale });
    await render("3-create.png", poster(`
      <div style="left: 140px; top: 120px; width: 1000px; height: 900px; background: radial-gradient(closest-side, rgb(221 43 85 / .16), transparent)"></div>
      <div class="panel" style="left: ${x - 90}px; top: 320px; width: 500px; height: 600px; transform: rotate(-8deg); background: var(--soft); border: 1px solid #f5c8d3"></div>
      <div class="panel" style="left: ${x + 260}px; top: 300px; width: 500px; height: 600px; transform: rotate(6deg); background: linear-gradient(160deg, #e43a62, #c4214a)"></div>
      ${lockup("left: 64px; top: 52px")}
      ${copy("left: 0; top: 104px; width: 1280px", "Name it, or leave it *random.*",
        "Add a prefix and a note, so you know what each address is for.", "center")}
      ${ui.html}
      ${callout(ui.at("create", 1, .5), "right", "Your server generates the rest")}`));
  }
  {
    const scale = 1.4;
    const ui = shot(rows, { x: 556, y: 196, scale, pad: 14 });
    await render("4-switch-off.png", poster(`
      ${mask("left: 76px; top: 500px; width: 400px; color: rgb(255 255 255 / .1)")}
      ${lockup("left: 64px; top: 52px")}
      ${copy("left: 80px; top: 210px; width: 430px", "Too much mail? *Switch it off.*",
        "Your server rejects mail to an address that is off. Switch it back on any time, or delete it.")}
      ${ui.html}
      ${callout(ui.at("off", .5, 1), "bottom", "Off: mail is rejected", { shift: -50, dark: true })}`,
      `.ui { box-shadow: 0 36px 90px rgb(80 0 20 / .4), 0 4px 14px rgb(0 0 0 / .15); }`, "red"));
  }
  await render("5-your-server.png", poster(`
    <div style="left: 560px; top: 260px; width: 680px; height: 600px; background: radial-gradient(closest-side, rgb(221 43 85 / .16), transparent)"></div>
    ${lockup("left: 64px; top: 52px")}
    ${copy("left: 80px; top: 150px; width: 900px", "Your real address *stays private.*",
      "Larvatus talks only to your own Stalwart server. No servers of its own, no analytics, no tracking.")}
    ${diagram()}`, DIAGRAM_CSS));
  {
    const back = shot(light, { x: 500, y: 176, scale: 1.08 });
    const front = shot(dark, { x: 712, y: 262, scale: 1.08, style: "box-shadow: 0 40px 90px rgb(0 0 0 / .55), 0 0 0 1px rgb(255 255 255 / .06)" });
    await render("6-dark.png", poster(`
      <div style="inset: 0; background: linear-gradient(160deg, #1f1f21, var(--dark)); clip-path: polygon(900px 0, 1280px 0, 1280px 800px, 600px 800px)"></div>
      ${lockup("left: 64px; top: 52px")}
      ${copy("left: 80px; top: 220px; width: 390px", "Light or *dark.*", "Follows your browser’s theme, or choose one in Settings.")}
      ${back.html}${front.html}`));
  }

  // The Chrome Web Store's promo tiles: brand art with little text and no screenshot, as the store asks.
  const size = (width, height) => `body { width: ${width}px; height: ${height}px; }`;
  await render("../promo/small-440x280.png", poster(`
    ${mask("left: 196px; top: 52px; width: 390px; transform: rotate(-12deg); color: rgb(255 255 255 / .1)")}
    <div class="brand" style="inset: 0">${lockup("")}<p>Masked email addresses for Stalwart</p></div>`,
    size(440, 280) + `.brand { display: grid; place-content: center; justify-items: center; gap: 16px; font-size: 17px; font-weight: 500; color: rgb(255 255 255 / .92); }
     .lockup { gap: 14px; font-size: 46px; letter-spacing: -1.6px; } .lockup svg { width: 62px; height: 62px; }`, "red"), 440, 280);
  await render("../promo/marquee-1400x560.png", poster(`
    ${mask("left: 700px; top: 40px; width: 780px; transform: rotate(-9deg); color: rgb(255 255 255 / .06)")}
    ${lockup("left: 96px; top: 76px")}
    ${copy("left: 96px; top: 176px; width: 560px", "A separate address for *every site.*", "Masked email addresses on your own Stalwart mail server.")}
    <div style="left: 800px; top: 140px"><div class="stack">
      ${address("wrenfield.k7m2qa", true)}${address("harbor.p3w8zt", false, "margin-left: 62px")}${address("pinecrest.c6v1xe", true, "margin-left: 22px")}</div></div>`,
    size(1400, 560) + DIAGRAM_CSS + `h1 { font-size: 64px; } h1 em { white-space: nowrap; } .lockup { font-size: 28px; gap: 13px; } .lockup svg { width: 44px; height: 44px; }
     .stack { display: grid; gap: 18px; zoom: 1.3; } .chip { border: 0; box-shadow: 0 18px 44px rgb(80 0 20 / .35); }
     .address.off { background: #f3ded9; box-shadow: 0 10px 26px rgb(80 0 20 / .2); }`, "red"), 1400, 560);
  console.log("Screenshots in " + out);
} finally {
  await browser.close();
  server.close();
}

