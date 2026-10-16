import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { createGame, decision, transition, viewFor } from "../game/engine.js";
import {
  applyResourceArrangement,
  historyView,
  travelHistory,
} from "../server/history.js";
const base = process.env.TEST_URL ?? "http://localhost:5173";
let game = createGame(["Pilot", "Mira", "Sol"], { initiative: 0 }, 3);
while (game.pending.length)
  game = transition(game, game.pending[0].p, {
    choice: decision(game, game.pending[0].p).choices.find(
      (c) => c.op === "skip",
    ).id,
  });
game = transition(game, 0, {
  choice: decision(game, 0).choices.find((c) => c.op === "play").id,
});
game = transition(game, 0, {
  choice: decision(game, 0).choices.find((c) => c.op === "endPrelude").id,
});
game.turn.pips = 0;
for (const r of game.players[0].resources) if (r) game.supply[r]++;
game.players[0].resources = ["relic", "fuel", null];
for (const r of game.players[0].resources) if (r) game.supply[r]--;
game.pending = [{ type: "arrangeResources", p: 0 }];
const room = {
    game,
    seats: game.players.map((p) => ({ name: p.name })),
    options: { timer: { mode: "off" } },
  },
  id = "ABCDEF23";
const projection = () => ({
  id,
  me: 0,
  host: true,
  status: "playing",
  options: room.options,
  seats: room.seats,
  game: viewFor(room.game, 0),
  history: historyView(room, 0),
});
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL });
const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
const errors = [];
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
      travelHistory(room, 0, input.direction);
    else applyResourceArrangement(room, 0, input);
    writes++;
  }
  await route.fulfill({ json: projection() });
});
const slot = (i) => page.locator(`[data-resource-slot="${i}"]`);
try {
  await page.goto(`${base}/table/${id}`);
  await page.locator(".resource-arranger").waitFor();
  assert.equal(await page.locator(".pip-strip").count(), 0);
  assert.equal(await page.locator(".command-choice").count(), 0);
  await page.screenshot({
    path: "work/resource-tray-preview.png",
    fullPage: true,
  });
  // Keyboard preview never changes game state.
  await slot(0).press("Enter");
  await slot(2).press("Enter");
  assert.equal(writes, 0);
  assert.match(await slot(2).getAttribute("aria-label"), /Relic/);
  await page.getByRole("button", { name: "Reset", exact: true }).last().click();
  const a = await slot(1).boundingBox(),
    b = await slot(2).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  assert.equal(writes, 0);
  assert.match(await slot(2).getAttribute("aria-label"), /Fuel/);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.locator(".resource-arranger").waitFor({ state: "detached" });
  assert.equal(writes, 1);
  assert.deepEqual(room.game.players[0].resources, ["relic", null, "fuel"]);
  assert.equal(room.history.steps.length, 1);
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click();
  await page.locator(".resource-arranger").waitFor();
  assert.deepEqual(room.game.players[0].resources, ["relic", "fuel", null]);
  await page.getByRole("button", { name: "↷ Redo", exact: true }).click();
  await page.locator(".resource-arranger").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click();
  await page.locator(".resource-arranger").waitFor();
  // Match user's identical-resource case and show the updated screen.
  room.game.supply.fuel++;
  room.game.supply.relic--;
  room.game.players[0].resources = ["relic", "relic", null];
  await page.reload();
  await page.locator(".resource-arranger").waitFor();
  await page.screenshot({
    path: "work/resource-tray-preview.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollHeight),
    720,
  );
  assert.ok(
    await page
      .locator(".command-live")
      .evaluate((el) => el.scrollHeight <= el.parentElement.clientHeight + 2),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  await page.screenshot({
    path: "work/resource-tray-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.locator(".resource-arranger").waitFor({ state: "detached" });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      visualSlots: true,
      keyboardAndDrag: true,
      noPrematureWrites: true,
      oneCommit: true,
      oneUndoRedo: true,
      identicalTokens: true,
      desktopAndMobileFit: true,
      errors,
    }),
  );
} catch (e) {
  await page.screenshot({
    path: "work/resource-tray-failure.png",
    fullPage: true,
  });
  throw e;
} finally {
  await browser.close();
}
