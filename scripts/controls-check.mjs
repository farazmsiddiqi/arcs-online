import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { createGame, decision, transition, viewFor } from "../game/engine.js";
import {
  applyDecision,
  applyMovement,
  historyView,
  travelHistory,
} from "../server/history.js";
import {
  initClock,
  clockView,
  settleClock,
  followClock,
  changeClock,
} from "../server/clock.js";
import { ACTION_CARDS } from "../game/data.js";
const base = process.env.TEST_URL ?? "http://localhost:5173";
const r = {
  game: createGame(["Pilot", "Rival"], { initiative: 0 }, 37),
  seats: [{ name: "Pilot" }, { name: "Rival" }],
  options: { timer: { mode: "off" } },
};
while (r.game.pending.length) {
  const p = r.game.pending[0].p;
  r.game = transition(r.game, p, {
    choice: decision(r.game, p).choices.find((c) => c.op === "skip").id,
  });
}
// Use a dealt movement card; seek a seed if necessary.
for (
  let seed = 38;
  !r.game.players[0].hand.some((id) =>
    ["mobilization", "aggression"].includes(ACTION_CARDS[id].suit),
  );
  seed++
) {
  r.game = createGame(["Pilot", "Rival"], { initiative: 0 }, seed);
  while (r.game.pending.length) {
    const p = r.game.pending[0].p;
    r.game = transition(r.game, p, {
      choice: decision(r.game, p).choices.find((c) => c.op === "skip").id,
    });
  }
}
initClock(r);
const id = "ABCDEF11";
const projection = () => ({
  id,
  me: 0,
  host: true,
  capacity: 2,
  status: "playing",
  revision: r.game.revision,
  options: r.options,
  seats: r.seats,
  game: viewFor(r.game, 0),
  history: historyView(r, 0),
  clock: clockView(r),
  notices: r.notices ?? [],
});
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL });
const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.setDefaultTimeout(10000);
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
  if (route.request().method() === "GET")
    await new Promise((resolve) => setTimeout(resolve, 200));
  const input = route.request().postDataJSON();
  if (route.request().method() === "POST") {
    settleClock(r);
    if (route.request().url().endsWith("/history"))
      travelHistory(r, 0, input.direction);
    else if (route.request().url().endsWith("/timer")) {
      changeClock(r, 0, input);
      r.game.revision++;
    } else if (input.destination) applyMovement(r, 0, input);
    else applyDecision(r, 0, input);
    followClock(r);
  }
  await route.fulfill({ json: projection() });
});
const choice = (label) =>
  page.locator(".command-choice").filter({ hasText: label }).first();
try {
  await page.goto(`${base}/table/${id}`);
  const card = r.game.players[0].hand.find((id) =>
    ["mobilization", "aggression"].includes(ACTION_CARDS[id].suit),
  );
  const cardEl = page
    .locator(".action-card")
    .filter({ has: page.locator(`img[src="/assets/${card}.webp"]`) });
  await cardEl.dragTo(page.locator(".physical-board"));
  await page.getByRole("button", { name: /^Lead / }).waitFor();
  assert.equal(r.game.phase, "card", "drop selects without committing");
  await page.screenshot({
    path: "work/clear-before.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /^Lead / }).click();
  // A face-up play waits for its confirm step (M11, C-6).
  assert.equal(r.game.phase, "card", "a face-up play is not sent unconfirmed");
  await page
    .getByRole("button", { name: "Confirm & play", exact: true })
    .click();
  await choice("Finish Prelude").waitFor();
  assert.equal(await choice("Card actions").count(), 0);
  await choice("Finish Prelude").click();
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click();
  await choice("Finish Prelude").waitFor();
  await page.getByRole("button", { name: "↷ Redo", exact: true }).click();
  await choice("Move").waitFor();
  await choice("Move").click();
  const origin = decision(r.game, 0).choices.find(
    (c) => c.op === "moveFrom",
  ).system;
  await page.locator(`[data-system="${origin}"]`).click();
  await page
    .getByRole("heading", { name: "Choose ships to move", exact: true })
    .waitFor();
  const piece = decision(r.game, 0).form.options[0].id;
  assert.equal(
    await page.locator(`[data-piece="${piece}"]`).getAttribute("aria-pressed"),
    "true",
  );
  await page.locator(`[data-piece="${piece}"]`).click();
  assert.equal(
    await page.locator(`[data-piece="${piece}"]`).getAttribute("aria-pressed"),
    "false",
  );
  await page.locator(`[data-piece="${piece}"]`).click();
  const destination = viewFor(r.game, 0).interaction.destinations[0];
  await page.locator(`[data-system="${destination}"]`).hover();
  await page.screenshot({
    path: "work/clear-table-preview.png",
    fullPage: true,
  });
  await page.locator(`[data-system="${destination}"]`).click();
  await page.waitForFunction(() => !!document.querySelector(".flying-ship"));
  assert.equal(r.game.pieces.find((p) => p.id === piece).system, destination);
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click();
  assert.equal(r.game.pieces.find((p) => p.id === piece).system, origin);
  await page
    .getByRole("heading", { name: "Choose ships to move", exact: true })
    .waitFor();
  await page.waitForFunction(() => !document.querySelector(".flying-ship"));
  await page
    .locator(`[data-system="${origin}"] [data-piece="${piece}"].draggable-ship`)
    .waitFor();
  const from = await page.locator(`[data-piece="${piece}"]`).boundingBox(),
    to = await page
      .locator(`[data-system="${destination}"] .system-target`)
      .boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await page
    .locator(`[data-system="${destination}"] [data-piece="${piece}"]`)
    .waitFor();
  assert.equal(r.game.pieces.find((p) => p.id === piece).system, destination);
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click();
  await page.getByRole("button", { name: "↷ Redo", exact: true }).click();
  assert.equal(r.game.pieces.find((p) => p.id === piece).system, destination);
  await choice("Move").click();
  await page.waitForFunction(
    (n) => document.querySelectorAll(".command-choice").length === n,
    decision(r.game, 0).choices.length,
  );
  assert.equal(
    await page.locator(".command-choice").count(),
    decision(r.game, 0).choices.length,
    "a new action must clear the previous system filter",
  );
  await page.getByRole("button", { name: "Turn timers", exact: true }).click();
  await page.getByLabel("Mode", { exact: true }).selectOption("live");
  await page
    .getByRole("button", { name: "Apply timer settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Pause table", exact: true }).click();
  assert.equal(r.clock.paused, true);
  await page.reload();
  await page.locator(".clock-blocked").waitFor();
  assert.equal(r.clock.paused, true);
  await page
    .getByRole("button", { name: "Open turn timers", exact: true })
    .click();
  await page.getByRole("button", { name: "Resume table", exact: true }).click();
  assert.equal(r.clock.paused, false);
  await page.screenshot({ path: "work/timers-preview.png", fullPage: true });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  const enemy = r.game.pieces.find((p) => p.owner === 1 && p.type === "ship");
  const attackers = r.game.pieces
    .filter((p) => p.owner === 0 && p.type === "ship")
    .slice(0, 3);
  for (const x of attackers) x.system = enemy.system;
  r.game.pending = [
    {
      type: "dice",
      p: 0,
      defender: 1,
      system: enemy.system,
      attackers: attackers.map((p) => p.id),
      allFresh: true,
      beforeTrophies: 0,
    },
  ];
  r.game.revision++;
  await page.reload();
  await page.getByLabel("skirmish dice", { exact: true }).fill("2");
  await page.getByLabel("assault dice", { exact: true }).fill("1");
  assert.match(
    await page.getByLabel("Selected dice probabilities").innerText(),
    /95.8%/,
  );
  await page.getByRole("button", { name: /What do these dice do/ }).click();
  assert.equal(await page.locator(".die-faces > span").count(), 18);
  assert.match(
    await page.locator(".battle-definitions").innerText(),
    /Multiple intercept symbols do not multiply/,
  );
  await page.screenshot({
    path: "work/battle-dice-preview.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Roll battle dice", exact: true })
    .click();
  assert.equal(historyView(r, 0).canUndo, false);
  // Deterministic post-roll fixture exercises real hit transitions, not invented animation events.
  enemy.damaged = false;
  r.game.pieces.find((p) => p.id === enemy.id).damaged = false;
  r.game.pending = [
    {
      type: "hits",
      p: 0,
      target: 1,
      dealer: 0,
      system: enemy.system,
      left: 2,
      kind: "hit",
      battle: true,
    },
  ];
  r.game.revision++;
  await page.reload();
  let target = decision(r.game, 0).choices.find((c) => c.piece === enemy.id);
  await page.locator(`[data-piece="${enemy.id}"]`).click();
  await page.locator(".effect-damage").waitFor({ state: "attached" });
  await page.screenshot({
    path: "work/battle-impact-preview.png",
    fullPage: true,
  });
  target = decision(r.game, 0).choices.find((c) => c.piece === enemy.id);
  await page.locator(`[data-piece="${enemy.id}"]`).click();
  await page.locator(".effect-destroy").waitFor({ state: "attached" });
  assert.equal(
    r.game.pieces.some((p) => p.id === enemy.id),
    false,
  );
  // A raid animates the item actually stolen; no false city destruction.
  r.game.pending = [
    {
      type: "raid",
      p: 0,
      defender: 1,
      system: enemy.system,
      keys: 6,
      attackers: attackers.map((p) => p.id),
    },
  ];
  r.game.revision++;
  await page.reload();
  const steal = decision(r.game, 0).choices.find(
    (c) => c.op === "stealResource",
  );
  assert.ok(steal);
  await choice(steal.label).click();
  await page.locator(".effect-loot").waitFor({ state: "attached" });
  assert.equal(await page.locator(".effect-destroy").count(), 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".combat-effects")
      .evaluate((e) => getComputedStyle(e).display),
    "none",
  );
  await page.reload();
  assert.equal(
    await page.locator(".combat-effect").count(),
    0,
    "reload must not replay old battle effects",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      cardDrag: true,
      guidedStages: true,
      undoRedo: true,
      mapShipSelection: true,
      clickDestination: true,
      fleetDrag: true,
      previewBeforeCommit: true,
      movementAnimation: true,
      persistentTimer: true,
      battleOdds: true,
      damageAndDestruction: true,
      raidLoot: true,
      reducedMotion: true,
      nextActionClearsOldTarget: true,
      errors,
    }),
  );
} catch (e) {
  console.error(errors);
  await page.screenshot({
    path: "work/clear-failure.png",
    fullPage: true,
  });
  console.error(await page.locator("body").innerText());
  throw e;
} finally {
  await browser.close();
}
