import { chromium, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
import { viewFor } from "../game/engine.js";
import { initClock, clockView } from "../server/clock.js";
const fixtures = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL("../tests/fixtures/ux-states.json.gz", import.meta.url),
    ),
  ),
);
const raw = structuredClone(fixtures.card.raw),
  p = raw.pending[0]?.p ?? raw.current;
const game = viewFor(raw, p),
  id = "ABCDDE15",
  base = process.env.TEST_URL ?? "http://localhost:5173";
const room = {
  game: raw,
  seats: raw.players.map((p) => ({ name: p.name })),
  options: { timer: { mode: "live", turn: 60, expiry: "auto" } },
};
initClock(room);
let expired = false,
  writes = 0;
const projection = () => ({
  id,
  me: p,
  host: true,
  status: "playing",
  seats: room.seats,
  options: room.options,
  game,
  clock: clockView(room, expired ? room.clock.since + 60000 : room.clock.since),
  history: { canUndo: false, canRedo: false, steps: [] },
});
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL }),
  page = await browser.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript((id) => {
  localStorage.setItem(`arcs-seat-${id}`, "fixture");
  window.WebSocket = class {
    send() {}
    close() {}
  };
}, id);
await page.route(`**/api/rooms/${id}**`, (route) => {
  if (route.request().method() === "POST") writes++;
  return route.fulfill({ json: projection() });
});
try {
  for (const size of [
    { width: 1512, height: 982 },
    { width: 1280, height: 800 },
    { width: 960, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await page.goto(`${base}/table/${id}`);
    const board = page.getByRole("complementary", {
      name: "Shared game board",
    });
    await expect(page.locator(".round-card .zero-marker")).toBeVisible();
    await expect(page.locator(".resource-bank")).toBeVisible();
    await expect(page.locator(".deck-count")).toBeVisible();
    await expect(board.locator(".shared-ambition")).toHaveCount(5);
    await expect(
      board.locator(".shared-ambitions .physical-ambition-marker"),
    ).toHaveCount(game.markers.filter((m) => m.ambition).length);
    await expect(
      board.locator(".available-ambition-markers .physical-ambition-marker"),
    ).toHaveCount(game.markers.filter((m) => !m.ambition).length);
    await expect(page.locator(".round-player-power")).toHaveCount(
      game.players.length,
    );
    await expect(page.locator(".round-declaration-marker")).toHaveCount(
      game.lead.declarations.length,
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      size.width,
    );
    if (size.width > 900) {
      const rail = await board.boundingBox();
      for (const button of await board
        .locator(".shared-ambition, .available-ambition-markers")
        .all()) {
        const b = await button.boundingBox();
        assert.ok(
          b.y + b.height <= rail.y + rail.height + 1,
          `all five ambitions fit: ${JSON.stringify({ size, rail, b })}`,
        );
      }
    }
    const declared = game.markers.find((m) => m.ambition).ambition;
    await board
      .getByRole("button", { name: new RegExp(`^${declared}\\.`, "i") })
      .click();
    await expect(page.locator(".projected-award")).toHaveCount(
      game.players.length,
    );
    for (let i = 0; i < game.players.length; i++)
      await expect(page.locator(".projected-award").nth(i)).toHaveText(
        `+${game.ambitionAwards[declared][i]} Power`,
      );
    await page.keyboard.press("Escape");
    await expect(page.locator(".modal-backdrop")).toHaveCount(0);
    if (size.width === 1512) {
      await expect
        .poll(() =>
          page
            .locator("img:visible")
            .evaluateAll((imgs) =>
              imgs.every((img) => img.complete && img.naturalWidth),
            ),
        )
        .toBe(true);
      await page.screenshot({ path: "work/shared-board-preview.png" });
    }
  }
  expired = true;
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.reload();
  await expect(page.locator(".clock-blocked strong")).toHaveText(
    "AI is finishing this turn",
  );
  await page.getByRole("button", { name: "Turn timers", exact: true }).click();
  await expect(page.locator(".timer-hero strong")).toHaveText(
    "AI finishing turn",
  );
  await expect(page.getByLabel("When time runs out")).toHaveValue("auto");
  assert.equal(writes, 0);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      sharedBoard: true,
      allFiveAmbitionsFit: true,
      declarationsAndZero: true,
      projectedAwards: true,
      playerPowerAndInitiative: true,
      timerAutoFeedback: true,
      mobileFits: true,
      writes,
      errors,
    }),
  );
} catch (e) {
  await page.screenshot({
    path: "work/shared-board-failure.png",
    fullPage: true,
  });
  throw e;
} finally {
  await browser.close();
}
