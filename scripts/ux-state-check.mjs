import { gunzipSync } from "node:zlib";
import { chromium, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { viewFor } from "../game/engine.js";
const base = process.env.TEST_URL ?? "http://localhost:5173";
const fixtures = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL("../tests/fixtures/ux-states.json.gz", import.meta.url),
    ),
  ).toString("utf8"),
);
// Revive (Mythic Wayfarers) is never reached by the bots; build it from the
// Prelude root by hand.
{
  const raw = structuredClone(fixtures.preludeRoot.raw);
  raw.pending = [{ type: "revive", p: raw.current }];
  fixtures.revive = { raw };
}
const id = "ABCDDE12";
let current;
const projection = () => ({
  id,
  me: current.me,
  host: true,
  status: current.phase === "over" ? "complete" : "playing",
  game: current,
  seats: current.players.map((p) => ({ name: p.name })),
  options: { timer: { mode: "off" } },
  history: { canUndo: false, canRedo: false, reason: "Fixture", steps: [] },
});
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL }),
  page = await browser.newPage({ viewport: { width: 1512, height: 982 } }),
  errors = [],
  checked = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript((id) => {
  localStorage.setItem(`arcs-seat-${id}`, "fixture");
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
try {
  for (const [kind, f] of Object.entries(fixtures)) {
    const p =
      f.raw.pending[0]?.p ?? (f.raw.phase === "over" ? 0 : f.raw.current);
    current = viewFor(f.raw, p);
    for (const size of [
      { width: 1512, height: 982 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size);
      await page.goto(`${base}/table/${id}`);
      await page.locator(".command-live").waitFor();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth),
        size.width,
        `${kind}: horizontal overflow`,
      );
      assert.equal(
        await page.locator('img[src*="undefined"]').count(),
        0,
        `${kind}: missing artwork ID`,
      );
      await expect
        .poll(
          async () =>
            page.locator("img:visible").evaluateAll((images) => {
              // Cards below the fold are `loading="lazy"` and the browser
              // may never start them; this check is about the artwork, so
              // ask for it now.
              for (const image of images)
                if (!image.complete) image.loading = "eager";
              return images.every(
                (image) => image.complete && image.naturalWidth > 0,
              );
            }),
          { timeout: 15000, message: `${kind}: visible artwork loaded` },
        )
        .toBe(true);
      if (size.width === 1512 && kind === "dice") {
        await expect
          .poll(async () => {
            const box = await page
              .getByRole("button", { name: "Roll battle dice", exact: true })
              .boundingBox();
            return box && box.y + box.height <= size.height;
          })
          .toBe(true);
      }
      if (
        size.width === 1512 &&
        [
          "overflow",
          "gainChoice",
          "effects",
          "preludeRoot",
          "dice",
          "farseersSwap",
          "farseersDiscard",
        ].includes(kind)
      )
        await page.screenshot({ path: `work/ux-${kind}.png`, fullPage: true });
    }
    checked.push(kind);
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      states: checked.length,
      checked,
      desktopAndMobile: true,
      noUndefinedArt: true,
      visibleArtworkLoaded: true,
      errors,
    }),
  );
  writeFileSync(
    "work/ux-state-browser-report.json",
    JSON.stringify({ states: checked.length, checked, errors }, null, 2),
  );
} catch (e) {
  await page.screenshot({
    path: "work/ux-state-failure.png",
    fullPage: true,
  });
  throw e;
} finally {
  await browser.close();
}
