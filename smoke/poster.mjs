// Building blocks for the store "posters" in screenshots.mjs: each is a 1280x800 HTML page with a headline,
// live captures of the extension placed on it, and callouts positioned from the captures' measured rects.
import { readFileSync } from "node:fs";

const icon = readFileSync(new URL("../extension/icon.svg", import.meta.url), "utf8");
// The white mask from the logo, with its eye holes, for the large watermark. The eyes start with a relative "m",
// which is only absolute at the start of a path, so it is rewritten to join the face in one path.
const [face, eyes] = [...icon.matchAll(/ d="([^"]+)"/g)].map(match => match[1]);
export const mask = (style, color = "currentColor") =>
  `<svg class="mask" style="${style}" viewBox="8 20 48 31"><path d="${face}${eyes.replace(/^m([\d.]+ [\d.]+) ?/, "M$1l")}" fill="${color}" fill-rule="evenodd"/></svg>`;

const CSS = `
  :root { --page: #f5f2ec; --surface: #fffefa; --text: #15140e; --muted: #67645e; --accent: #dd2b55; --ink: #b81f45;
    --soft: #fce7e9; --line: #e6e2db; --dark: #131313; --dark-surface: #1f1f21; }
  * { box-sizing: border-box; margin: 0; }
  body { position: relative; width: 1280px; height: 800px; overflow: hidden; background: var(--page); color: var(--text);
    font: 16px/1.4 "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
  body > * { position: absolute; }
  .lockup { display: flex; align-items: center; gap: 10px; font-size: 21px; font-weight: 700; letter-spacing: -.6px; }
  .lockup svg { width: 34px; height: 34px; }
  h1 { font-size: 56px; font-weight: 700; letter-spacing: -1.8px; line-height: 1.05; }
  h1 em { font-style: normal; color: var(--accent); }
  .sub { margin-top: 22px; max-width: 30em; font-size: 20px; line-height: 1.45; color: var(--muted); }
  .center { text-align: center; }
  .center .sub { margin-inline: auto; }
  .ui { overflow: hidden; border-radius: 14px; box-shadow: 0 32px 80px rgb(60 20 30 / .22), 0 4px 14px rgb(0 0 0 / .08); }
  .shot img { display: block; width: 100%; }
  .panel { border-radius: 56px; }
  .mask { position: absolute; pointer-events: none; }
  .callout { width: 0; height: 0; z-index: 5; }
  .callout span { position: absolute; padding: 9px 16px; white-space: nowrap; border-radius: 999px; background: var(--surface);
    color: var(--ink); font-size: 15px; font-weight: 600; letter-spacing: -.1px;
    box-shadow: 0 10px 28px rgb(60 10 25 / .2), 0 1px 3px rgb(0 0 0 / .12); }
  .callout.dark span { background: var(--text); color: var(--surface); }
  .callout span::after { content: ""; position: absolute; width: 12px; height: 12px; background: inherit; transform: rotate(45deg); }
  .callout.left span { right: 11px; transform: translateY(-50%); }
  .callout.left span::after { right: -5px; top: calc(50% - 6px); }
  .callout.right span { left: 11px; transform: translateY(-50%); }
  .callout.right span::after { left: -5px; top: calc(50% - 6px); }
  .callout.top span { bottom: 11px; transform: translateX(calc(-50% + var(--shift))); }
  .callout.top span::after { bottom: -5px; left: calc(50% - var(--shift) - 6px); }
  .callout.bottom span { top: 11px; transform: translateX(calc(-50% + var(--shift))); }
  .callout.bottom span::after { top: -5px; left: calc(50% - var(--shift) - 6px); }
  /* On the accent background: white text, and the logo inverted so it does not vanish. */
  .red { background: radial-gradient(circle at 20% 15%, #e43a62, var(--accent) 45%, #c4214a); color: #fff; }
  .red .lockup rect { fill: #fff; }
  .red .lockup path:first-of-type { fill: var(--accent); }
  .red .lockup path:last-of-type { fill: #fff; }
  .red h1 em { color: #ffd0da; }
  .red .sub { color: rgb(255 255 255 / .9); }
`;

// A whole poster page. Callers place things with style="left: …; top: …".
export const poster = (body, css = "", className = "") =>
  `<!doctype html><meta charset="utf-8"><style>${CSS}${css}</style><body class="${className}">${body}</body>`;

export const lockup = style => `<div class="lockup" style="${style}">${icon}Larvatus</div>`;

// The headline marks its accent phrase with *…*.
export const copy = (style, headline, sub, className = "") =>
  `<div class="${className}" style="${style}"><h1>${headline.replace(/\*(.+?)\*/, "<em>$1</em>")}</h1><p class="sub">${sub}</p></div>`;

// A capture from screenshots.mjs placed at (x, y) and scaled. at() maps a point of one of its measured
// elements (fx, fy as fractions of its rect) to poster coordinates.
// pad (CSS pixels on the poster) frames the capture above and below in the popup's page colour.
export function shot(capture, { x, y, scale = 1, pad = 0, style = "", className = "ui" }) {
  return {
    html: `<div class="shot ${className}" style="left: ${x}px; top: ${y}px; width: ${capture.width * scale}px; padding: ${pad}px 0; background: #f5f2ec; ${style}"><img src="${capture.src}"></div>`,
    at(name, fx = .5, fy = .5) {
      const rect = capture.rects[name];
      return { x: x + (rect.x + rect.width * fx) * scale, y: y + pad + (rect.y + rect.height * fy) * scale };
    }
  };
}

// A pill whose tail touches point; side is where the pill sits relative to it. shift moves a top or bottom pill sideways.
export const callout = (point, side, text, { dark = false, shift = 0 } = {}) =>
  `<div class="callout ${side}${dark ? " dark" : ""}" style="left: ${point.x}px; top: ${point.y}px; --shift: ${shift}px"><span>${text}</span></div>`;

// A masked address as a chip with its switch, as drawn in the diagram and on the marquee tile.
export const address = (local, on, style = "") =>
  `<div class="chip address${on ? "" : " off"}" style="${style}">${local}@example.org<i class="toggle"></i></div>`;

// Sites -> masked addresses -> your server -> your inbox, drawn in the brand style. Rows are 110px apart around y 560.
export function diagram() {
  const sites = [["W", "Wrenfield Books", "wrenfield.k7m2qa", true, "#2f6b5a"], ["H", "Harbor Cycles", "harbor.p3w8zt", false, "#3d5a80"],
    ["P", "Pinecrest News", "pinecrest.c6v1xe", true, "#8a5a2b"]];
  const mid = 560, ys = [mid - 112, mid, mid + 112];
  const flow = "stroke: var(--accent); stroke-width: 2.5; fill: none";
  const lines = sites.map(([, , , on], i) => {
    const y = ys[i];
    return `<path d="M302 ${y}H352" style="stroke: #cfc9bd; stroke-width: 2; fill: none"/>` + (on
      ? `<path d="M690 ${y}C735 ${y} 735 ${mid} 772 ${mid}" style="${flow}" marker-end="url(#head)"/>`
      : `<path d="M690 ${y}H724" style="stroke: #c8c2b6; stroke-width: 2.5; stroke-dasharray: 5 5"/><path d="M732 ${y - 7}l14 14m0-14-14 14" style="stroke: #a8a29a; stroke-width: 2.5"/>`);
  }).join("");
  return `<svg style="left: 0; top: 0" width="1280" height="800">
      <defs><marker id="head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5 0 10z" fill="#dd2b55"/></marker></defs>
      ${lines}<path d="M988 ${mid}H1040" style="${flow}" marker-end="url(#head)"/></svg>
    ${sites.map(([initial, name, local, on, color], i) => `
      <div class="chip site" style="left: 80px; top: ${ys[i] - 30}px"><b style="background: ${color}">${initial}</b>${name}</div>
      ${address(local, on, `left: 352px; top: ${ys[i] - 30}px`)}`).join("")}
    <div class="node" style="left: 784px; top: ${mid - 88}px; width: 204px">
      <svg viewBox="0 0 48 48" width="52" height="52"><rect x="8" y="8" width="32" height="13" rx="4"/><rect x="8" y="27" width="32" height="13" rx="4"/><circle cx="15" cy="14.5" r="2"/><circle cx="15" cy="33.5" r="2"/><path d="M22 14.5h12M22 33.5h12"/></svg>
      <strong>Your Stalwart server</strong></div>
    <div class="node" style="left: 1052px; top: ${mid - 88}px; width: 158px">
      <svg viewBox="0 0 48 48" width="52" height="52"><path d="M8 26l6-16h20l6 16v11a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z"/><path d="M8 26h10l2 5h8l2-5h10"/></svg>
      <strong>Your inbox</strong><small>sam@example.org</small></div>`;
}
export const DIAGRAM_CSS = `
  .chip { display: flex; align-items: center; gap: 12px; height: 60px; padding: 0 18px; background: var(--surface); border: 1px solid var(--line);
    border-radius: 16px; box-shadow: 0 10px 30px rgb(60 20 30 / .08); font-weight: 600; }
  .site { width: 222px; font-size: 17px; letter-spacing: -.3px; }
  .site b { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; color: #fff; font-size: 16px; }
  .address { width: 338px; justify-content: space-between; color: var(--ink); font-size: 15.5px; letter-spacing: -.2px; }
  .address.off { color: #a8a29a; background: #f9f6f0; box-shadow: none; }
  .toggle { position: relative; flex: none; width: 34px; height: 20px; border-radius: 12px; background: var(--accent); }
  .toggle::after { content: ""; position: absolute; top: 3px; left: 17px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgb(0 0 0 / .2); }
  .off .toggle { background: #d9d4ca; }
  .off .toggle::after { left: 3px; }
  .node { display: grid; justify-items: center; gap: 4px; padding: 22px 16px 20px; text-align: center; background: var(--surface);
    border: 1px solid var(--line); border-radius: 22px; box-shadow: 0 18px 44px rgb(60 20 30 / .12); }
  .node svg { margin-bottom: 6px; fill: none; stroke: var(--accent); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
  .node circle { fill: var(--accent); stroke: none; }
  .node strong { font-size: 17px; letter-spacing: -.3px; line-height: 1.2; }
  .node small { color: var(--muted); font-size: 14px; }
`;
