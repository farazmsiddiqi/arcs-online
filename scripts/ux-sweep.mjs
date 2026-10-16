// UI sweep: renders every saved engine state (tests/fixtures/ux-states.json.gz)
// at several window sizes, from the acting seat and a waiting seat, and with
// each dialog and panel opened on top of a few representative states. Each
// render is screenshotted to work/ux-sweep/ for review and checked
// mechanically: no horizontal overflow, no page scroll on a desktop window,
// no console errors, no broken artwork, no clipped text, no interactive
// element outside the window or overlapping another, and the live command
// panel visible to the actor. The report is work/ux-sweep/report.json; the
// script exits non-zero when a check fails. Small phone tap targets are
// listed as notes, not failures.
//   npm run test:ux-sweep                       # everything
//   STATES=card,dice SIZES=desktop npm run test:ux-sweep
//   LAYERS=0 SHOTS=0 npm run test:ux-sweep      # checks only
import { gunzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { viewFor } from "../game/engine.js";
import { initClock, clockView, addNotice } from "../server/clock.js";
const base = process.env.TEST_URL ?? "http://localhost:5173",
  out = "work/ux-sweep",
  shots = process.env.SHOTS !== "0",
  withLayers = process.env.LAYERS !== "0";
mkdirSync(out, { recursive: true });
const fixtures = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL("../tests/fixtures/ux-states.json.gz", import.meta.url),
    ),
  ).toString("utf8"),
);
// Window sizes, largest first. The 14" MacBook default is the main target.
const SIZES = {
  desktop: { width: 1512, height: 982 },
  laptop: { width: 1440, height: 900 },
  small: { width: 1280, height: 720 },
  phone: { width: 390, height: 844 },
};
const sizes = (process.env.SIZES ?? Object.keys(SIZES).join(","))
  .split(",")
  .map((k) => [k, SIZES[k]]);
const stateNames = process.env.STATES
  ? process.env.STATES.split(",")
  : Object.keys(fixtures);
// Dialogs and panels, opened from a few states that have the data for them.
const LAYERS = {
  players: (page) => page.getByLabel("Players", { exact: true }),
  ambitions: (page) => page.getByLabel("Ambitions", { exact: true }),
  history: (page) => page.getByLabel("Table history", { exact: true }),
  library: (page) => page.getByLabel("Card library", { exact: true }),
  rules: (page) => page.getByLabel("Rules", { exact: true }),
  settings: (page) => page.getByLabel("Table settings", { exact: true }),
  timers: (page) => page.getByLabel("Turn timers", { exact: true }),
  courtDiscard: (page) => page.locator(".court-discard-link").first(),
  actionDiscard: (page) => page.getByLabel("Inspect action discard piles"),
  ambition: (page) => page.locator(".shared-ambition").first(),
  // The system nearest the middle of the map, so the click is never under
  // the Court column or off the zoomed map.
  system: async (page) => {
    const id = await page.evaluate(() => {
      const map = document
        .querySelector(".physical-board")
        ?.getBoundingClientRect();
      if (!map) return null;
      let best = null,
        bestD = Infinity;
      for (const el of document.querySelectorAll("[data-system]")) {
        const r = el.getBoundingClientRect(),
          d = Math.hypot(
            r.left + r.width / 2 - (map.left + map.width / 2),
            r.top + r.height / 2 - (map.top + map.height / 2),
          );
        if (d < bestD) ((bestD = d), (best = el.getAttribute("data-system")));
      }
      return best;
    });
    return page.locator(id ? `[data-system="${id}"]` : "[data-system]").first();
  },
  expanded: (page) => page.getByLabel("Expand board", { exact: true }),
  card: (page) => page.locator(".court-card").first(),
};
const LAYER_STATES = ["card", "actionsRoot", "dice", "over"];
// The client only accepts hex table ids.
const id = "ABCDDE20";
let current = null,
  room = null;
const projection = () => ({
  id,
  revision: current.game.revision,
  me: current.me,
  host: current.host,
  status: current.game.phase === "over" ? "complete" : "playing",
  game: current.game,
  seats: current.game.players.map((p) => ({ name: p.name, connected: true })),
  options: room.options,
  clock: clockView(room, room.clock.since + 20000),
  notices: room.notices ?? [],
  history: {
    canUndo: current.host,
    canRedo: false,
    undoLabel: "Undo last move",
    reason: current.host ? null : "Only the host can undo",
    steps: [],
  },
});
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL }),
  page = await browser.newPage({ viewport: SIZES.desktop }),
  errors = [],
  report = { cells: 0, failures: [], notes: [] };
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript((id) => {
  localStorage.setItem(`arcs-seat-${id}`, "sweep");
  window.WebSocket = class {
    constructor() {
      setTimeout(() => this.onopen?.(), 10);
    }
    send() {
      fetch(`/api/rooms/${id}`)
        .then((r) => r.json())
        .then((data) => this.onmessage?.({ data: JSON.stringify(data) }));
    }
    close() {}
  };
}, id);
await page.route(`**/api/rooms/${id}**`, (route) =>
  route.fulfill({ json: projection() }),
);
// Mechanical checks, run inside the page.
const inspect = () =>
  page.evaluate(() => {
    const vw = innerWidth,
      vh = innerHeight,
      issues = [],
      notes = [],
      visible = (el) => {
        const r = el.getBoundingClientRect(),
          cs = getComputedStyle(el);
        return (
          r.width > 0 &&
          r.height > 0 &&
          cs.visibility !== "hidden" &&
          cs.display !== "none" &&
          Number(cs.opacity) > 0.05
        );
      },
      label = (el) =>
        (el.getAttribute("aria-label") ?? el.textContent).trim().slice(0, 30);
    if (document.documentElement.scrollWidth > vw + 1)
      issues.push(
        `horizontal overflow ${document.documentElement.scrollWidth}px`,
      );
    for (const img of document.querySelectorAll("img"))
      if (
        img.src.includes("undefined") ||
        (img.complete && img.naturalWidth === 0 && visible(img))
      )
        issues.push(`broken image ${img.getAttribute("src")}`);
    // Text clipped by an overflow:hidden box without an ellipsis.
    for (const el of document.querySelectorAll("body *")) {
      if (!visible(el) || el.childElementCount || !el.textContent.trim())
        continue;
      const cs = getComputedStyle(el),
        hidden = ["hidden", "clip"],
        text = el.textContent.trim().slice(0, 40);
      if (
        hidden.includes(cs.overflowX) &&
        el.scrollWidth > el.clientWidth + 2 &&
        cs.textOverflow !== "ellipsis"
      )
        issues.push(`clipped text "${text}" (${el.className})`);
      if (
        hidden.includes(cs.overflowY) &&
        el.scrollHeight > el.clientHeight + 4 &&
        cs.webkitLineClamp === "none"
      )
        issues.push(`clipped lines "${text}" (${el.className})`);
    }
    // Interactive elements outside the window or on top of each other. Map
    // shapes and piece sprites overlap by design; resize strips sit on the
    // borders they drag.
    const controls = [
      ...document.querySelectorAll(
        'button, a[href], input, select, [role="button"], [role="checkbox"], [tabindex="0"]',
      ),
    ].filter(
      (el) =>
        visible(el) &&
        !el.closest("[data-system], [data-piece]") &&
        !/resize/.test(el.className),
    );
    // A control's visible box is its own box cut down by every scrolling or
    // clipping ancestor, so a card half-scrolled out of the Court does not
    // count as overlapping what sits below the Court.
    const clipped = (el) => {
      let r = el.getBoundingClientRect();
      r = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      for (let a = el.parentElement; a; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (!/auto|scroll|hidden|clip/.test(cs.overflowX + cs.overflowY))
          continue;
        const b = a.getBoundingClientRect();
        r.left = Math.max(r.left, b.left);
        r.top = Math.max(r.top, b.top);
        r.right = Math.min(r.right, b.right);
        r.bottom = Math.min(r.bottom, b.bottom);
      }
      return { ...r, width: r.right - r.left, height: r.bottom - r.top };
    };
    const boxes = controls
      .map((el) => ({ el, r: clipped(el) }))
      .filter(({ r }) => r.width > 0 && r.height > 0);
    const onTop = ({ el, r }) => {
      const hit = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
      );
      return !!hit && (hit === el || el.contains(hit));
    };
    const scrollsSideways = (el) => {
      for (let a = el.parentElement; a; a = a.parentElement) {
        const o = getComputedStyle(a).overflowX;
        if ((o === "auto" || o === "scroll") && a.scrollWidth > a.clientWidth)
          return true;
      }
      return false;
    };
    for (const { el, r } of boxes) {
      if ((r.right > vw + 1 || r.left < -1) && !scrollsSideways(el))
        issues.push(`control off the side: "${label(el)}" (${el.className})`);
      if (vw < 600 && (r.width < 24 || r.height < 24))
        notes.push(
          `tiny tap target ${Math.round(r.width)}x${Math.round(r.height)} "${label(el)}"`,
        );
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        // A small badge button placed on a tile's corner (Inspect) is by
        // design, not a collision.
        const inside = (x, y) =>
          x.r.left >= y.r.left - 1 &&
          x.r.right <= y.r.right + 1 &&
          x.r.top >= y.r.top - 1 &&
          x.r.bottom <= y.r.bottom + 1 &&
          x.r.width * x.r.height < 1600;
        if (inside(a, b) || inside(b, a)) continue;
        const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left),
          y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (x > 6 && y > 6 && onTop(a) && onTop(b))
          issues.push(`overlap: "${label(a.el)}" over "${label(b.el)}"`);
      }
    const live = document.querySelector(".command-live"),
      liveBox = live?.getBoundingClientRect();
    return {
      issues: [...new Set(issues)],
      notes: [...new Set(notes)],
      pageScroll: document.documentElement.scrollHeight - vh,
      liveVisible: !!liveBox && liveBox.top >= 0 && liveBox.top < vh - 40,
    };
  });
const cell = async (name, { allowScroll, needsLive }) => {
  report.cells++;
  const r = await inspect(),
    issues = [...r.issues];
  if (!allowScroll && r.pageScroll > 2)
    issues.push(`page scrolls ${r.pageScroll}px`);
  if (needsLive && !r.liveVisible)
    issues.push("command panel not visible to the actor");
  if (errors.length) issues.push(...errors.map((e) => `console: ${e}`));
  errors.length = 0;
  if (issues.length) report.failures.push({ cell: name, issues });
  if (r.notes.length) report.notes.push({ cell: name, notes: r.notes });
  return issues;
};
const setState = (kind, seat) => {
  const raw = structuredClone(fixtures[kind].raw),
    actor = raw.pending[0]?.p ?? (raw.phase === "over" ? 0 : raw.current),
    me = seat === "actor" ? actor : (actor + 1) % raw.players.length;
  room = {
    game: raw,
    seats: raw.players.map((p) => ({ name: p.name })),
    options: {
      timer: {
        mode: "live",
        turn: 300,
        bank: 1800,
        increment: 30,
        expiry: "pause",
      },
    },
  };
  initClock(room, 0);
  addNotice(
    room,
    `${raw.players[actor].name}'s turn: 5:00 on the clock.`,
    actor,
    5000,
  );
  current = { game: viewFor(raw, me), me, host: me === 0 };
};
const open = async (kind, seat, size) => {
  setState(kind, seat);
  await page.setViewportSize(size);
  await page.goto(`${base}/table/${id}`);
  await page.locator(".app").waitFor();
  await page
    .locator(".command-live")
    .waitFor({ timeout: 5000 })
    .catch(() => {});
  // Cards below the fold are `loading="lazy"` and may never start on a tall
  // phone page; ask for them, and never wait more than a few seconds.
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        [...document.images]
          .filter((i) => !i.complete)
          .map((i) => {
            i.loading = "eager";
            return new Promise((r) => (i.onload = i.onerror = r));
          }),
      ),
      new Promise((r) => setTimeout(r, 4000)),
    ]),
  );
};
const run = async (name, opts) => {
  const issues = await cell(name, opts);
  if (shots) await page.screenshot({ path: `${out}/${name}.png` });
  if (issues.length) console.log(`✗ ${name}: ${issues.join(" | ")}`);
};
try {
  for (const [sizeName, size] of sizes) {
    mkdirSync(`${out}/${sizeName}`, { recursive: true });
    for (const kind of stateNames)
      for (const seat of sizeName === "desktop"
        ? ["actor", "other"]
        : ["actor"]) {
        await open(kind, seat, size);
        // A phone scrolls to the command panel; a computer must show it.
        await run(`${sizeName}/${kind}${seat === "other" ? "-waiting" : ""}`, {
          allowScroll: sizeName === "phone",
          needsLive:
            sizeName !== "phone" &&
            seat === "actor" &&
            fixtures[kind].raw.phase !== "over",
        });
      }
  }
  if (withLayers)
    for (const kind of LAYER_STATES.filter((k) => stateNames.includes(k)))
      for (const [sizeName, size] of sizes.filter(
        ([k]) => k === "desktop" || k === "phone",
      )) {
        mkdirSync(`${out}/${sizeName}/layers`, { recursive: true });
        for (const [layer, find] of Object.entries(LAYERS)) {
          await open(kind, "actor", size);
          const target = await find(page);
          if (!(await target.count())) continue;
          await target.first().click();
          await page.waitForTimeout(250);
          await run(`${sizeName}/layers/${kind}-${layer}`, {
            allowScroll: true,
            needsLive: false,
          });
        }
      }
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      cells: report.cells,
      failing: report.failures.length,
      noted: report.notes.length,
    }),
  );
  if (report.failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
