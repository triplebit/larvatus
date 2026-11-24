// Builds the Firefox and Chrome packages from extension/ into dist/.
//   node scripts/build.mjs
// extension/manifest.json is the Firefox manifest, so the folder also loads directly in Firefox.
// The Chrome manifest is derived from it: a service worker instead of background scripts, PNG
// icons (Chrome does not accept SVG there), and no Firefox-only keys.
import { execFileSync } from "node:child_process";
import { copyFile, cp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = join(root, "extension");
const dist = join(root, "dist");
const manifest = JSON.parse(await readFile(join(source, "manifest.json"), "utf8"));
const { version } = manifest;
const png = sizes => Object.fromEntries(sizes.map(size => [size, `icons/icon-${size}.png`]));

const targets = {
  firefox: manifest,
  chrome: (({ browser_specific_settings, background, ...rest }) => ({
    ...rest,
    minimum_chrome_version: "121",
    background: { service_worker: background.scripts[0], type: background.type },
    icons: png([16, 32, 48, 128]),
    action: { ...rest.action, default_icon: png([16, 32]) },
    // Chromium sign-in reads the sign-in tab's loopback redirect URL (asked for at sign-in).
    optional_host_permissions: [...rest.optional_host_permissions, "http://127.0.0.1/*"]
  }))(manifest)
};

await rm(dist, { recursive: true, force: true });
for (const [browser, targetManifest] of Object.entries(targets)) {
  const dir = join(dist, browser);
  // Dot files are never part of the extension: .DS_Store, or a tool's folder such as .claude.
  await cp(source, dir, { recursive: true, filter: path => !basename(path).startsWith(".") });
  await writeFile(join(dir, "manifest.json"), JSON.stringify(targetManifest, null, 2) + "\n");
  const archive = join(dist, `larvatus-${version}-${browser}.zip`);
  // -X leaves out extra file attributes so repeated builds of the same files match.
  execFileSync("zip", ["-qrX", archive, "."], { cwd: dir });
  console.log(`${browser}: ${archive}`);
}

// The repository keeps a ready-to-load Firefox package at the root for manual installs.
await copyFile(join(dist, `larvatus-${version}-firefox.zip`), join(root, "larvatus.xpi"));
