import { chromium, expect } from "@playwright/test";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { viewFor } from "../game/engine.js";
import {
  applyDecision,
  historyView,
  travelHistory,
} from "../server/history.js";
const fixtures = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL("../tests/fixtures/ux-states.json.gz", import.meta.url),
    ),
  ),
);
const base = process.env.TEST_URL ?? "http://localhost:5173",
  id = "ABCDDE14";
const room = { game: structuredClone(fixtures.preludeRoot.raw) },
  p = room.game.current,
  me = room.game.players[p];
me.leader = "LEAD04";
me.cards = ["L03", "L07", "BC09", "BC14"];
me.hand.push(...room.game.discardDown.splice(0, 4));
me.trophies = [
  { id: "test-t1", owner: (p + 1) % 3, type: "ship" },
  { id: "test-t2", owner: (p + 2) % 3, type: "city" },
  { id: "test-t3", owner: (p + 1) % 3, type: "starport" },
];
me.captives = Array.from({ length: 4 }, (_, i) => ({
  id: `test-c${i}`,
  owner: (p + 1 + (i % 2)) % 3,
  type: "agent",
}));
const projection = () => ({
  id,
  me: p,
  host: true,
  status: "playing",
  game: viewFor(room.game, p),
  seats: room.game.players.map((p) => ({ name: p.name })),
  options: { timer: { mode: "off" } },
  history: historyView(room, p),
});
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL }),
  page = await browser.newPage({ viewport: { width: 1512, height: 982 } }),
  errors = [];
let writes = 0;
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
await page.route(`**/api/rooms/${id}**`, async (route) => {
  if (route.request().method() === "POST") {
    const input = route.request().postDataJSON();
    if (route.request().url().endsWith("/history"))
      travelHistory(room, p, input.direction);
    else applyDecision(room, p, input);
    writes++;
  }
  await route.fulfill({ json: projection() });
});
try {
  await page.goto(`${base}/table/${id}`);
  await page
    .getByRole("region", { name: "Your player board", exact: true })
    .waitFor();
  await expect(page.locator(".mat-captured.trophies img")).toHaveCount(3);
  await expect(page.locator(".mat-captured.captives img")).toHaveCount(4);
  await expect(page.locator(".owned-table-card")).toHaveCount(5);
  const slot = page.getByRole("button", { name: /Resource slot 2:/ });
  await slot.click();
  await expect(slot).toHaveAttribute("aria-pressed", "true");
  assert.equal(writes, 0);
  assert.equal(room.game.turn.prelude, true);
  // The command panel's filter follows the slot a render later: retry.
  await expect(page.locator(".stage-categories .selected")).toContainText(
    "Slot 2",
  );
  await page
    .getByRole("button", {
      name: "Inspect your Shipping Interest",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  assert.equal(writes, 0);
  await expect
    .poll(() =>
      page
        .locator("img:visible")
        .evaluateAll((imgs) =>
          imgs.every((i) => i.complete && i.naturalWidth > 0),
        ),
    )
    .toBe(true);
  for (let i = 0; i < 6; i++) {
    const left = await page
      .locator(".owned-card-spread")
      .evaluate((el) => el.scrollLeft);
    if (left <= 1) break;
    await page
      .getByRole("button", { name: "Previous owned cards", exact: true })
      .click();
    await expect
      .poll(() =>
        page.locator(".owned-card-spread").evaluate((el) => el.scrollLeft),
      )
      .toBeLessThan(left);
  }
  await expect
    .poll(() =>
      page.locator(".owned-card-spread").evaluate((el) => el.scrollLeft),
    )
    .toBeLessThanOrEqual(4);
  const divider = page.getByRole("separator", {
    name: "Resize player board and step panel",
    exact: true,
  });
  const initialWidth = await page
    .locator(".player-table")
    .evaluate((el) => el.getBoundingClientRect().width);
  await divider.press("ArrowRight");
  await expect
    .poll(() =>
      page
        .locator(".player-table")
        .evaluate((el) => el.getBoundingClientRect().width),
    )
    .toBeGreaterThan(initialWidth);
  const handle = await divider.boundingBox();
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(handle.x + 80, handle.y + handle.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  const savedWidth = await page
    .locator(".player-table")
    .evaluate((el) => el.getBoundingClientRect().width);
  assert.ok(savedWidth > initialWidth + 60);
  assert.ok(
    await page
      .locator(".action-panel")
      .evaluate((el) => el.getBoundingClientRect().width >= 459),
  );
  const writesBeforeReload = writes;
  await page.reload();
  await divider.waitFor();
  await expect
    .poll(() =>
      page
        .locator(".player-table")
        .evaluate((el) => el.getBoundingClientRect().width),
    )
    .toBeCloseTo(savedWidth, 0);
  assert.equal(writes, writesBeforeReload);
  await page.screenshot({
    path: "work/player-table-preview.png",
    fullPage: true,
  });
  await divider.press("Home");
  await expect
    .poll(() =>
      page
        .locator(".player-table")
        .evaluate((el) => el.getBoundingClientRect().width),
    )
    .toBeCloseTo(initialWidth, 0);
  await page
    .getByRole("button", { name: "Finish Prelude", exact: true })
    .click();
  assert.equal(writes, 1);
  assert.equal(room.game.turn.prelude, false);
  await expect(page.locator('.turn-steps [aria-current="step"]')).toContainText(
    "Actions",
  );
  assert.equal(await page.locator(".mat-resource.usable").count(), 0);
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click();
  await expect.poll(() => room.game.turn.prelude).toBe(true);
  for (const size of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBe(size.width);
    if (size.width > 1000) {
      await expect
        .poll(() =>
          page
            .locator(".personal-hand .card-zoom")
            .last()
            .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
        )
        .toBe(true);
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      physicalPieces: true,
      widthDragKeyboardPersistenceReset: true,
      ownedCardInspection: true,
      resourceSelectionDoesNotSpend: true,
      preludeActionsFlow: true,
      undoPreserved: true,
      desktopAndMobileFit: true,
      errors,
    }),
  );
} catch (e) {
  console.log(errors);
  await page.screenshot({
    path: "work/player-table-failure.png",
    fullPage: true,
  });
  throw e;
} finally {
  await browser.close();
}
