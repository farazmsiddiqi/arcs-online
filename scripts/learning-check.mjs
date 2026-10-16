import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { createGame, decision, transition, viewFor } from "../game/engine.js";
import {
  applyDecision,
  historyView,
  travelHistory,
} from "../server/history.js";
const base = process.env.TEST_URL ?? "http://localhost:5173";
let game;
for (let seed = 1; seed < 2000; seed++) {
  game = createGame(
    ["Mira", "Pilot", "Sol"],
    { initiative: 0, setupId: "3SETUP01" },
    seed,
  );
  if (
    game.players[0].hand.includes("construction-2") &&
    game.players[1].hand.includes("administration-5")
  )
    break;
}
const step = (op, predicate = () => true) => {
  const p = game.pending[0]?.p ?? game.current,
    c = decision(game, p).choices.find((c) => c.op === op && predicate(c));
  assert.ok(c, op);
  game = transition(game, p, { choice: c.id });
};
while (game.pending.length) step("skip");
step("play", (c) => c.card === "construction-2");
step("endPrelude");
step("endTurn");
game.pieces.find((p) => p.owner === 1 && p.type === "ship").damaged = true;
const room = {
  game,
  seats: game.players.map((p) => ({ name: p.name })),
  options: { timer: { mode: "off" } },
};
const id = "FEDCBA12";
let actions = 0;
const projection = () => ({
  id,
  me: 1,
  host: false,
  status: "playing",
  options: room.options,
  seats: room.seats,
  game: viewFor(room.game, 1),
  history: historyView(room, 1),
});
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL });
const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
const errors = [];
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
    const body = route.request().postDataJSON();
    if (route.request().url().endsWith("/history"))
      travelHistory(room, 1, body.direction);
    else applyDecision(room, 1, body);
    actions++;
  }
  await route.fulfill({ json: projection() });
});
const command = (label) =>
  page.getByRole("button", { name: label, exact: true });
const reload = async () => {
  await page.goto(`${base}/table/${id}`);
  await page.locator(".command-live").waitFor();
};
try {
  await reload();
  await command("administration 5, 3 action pips").click();
  assert.equal(await page.locator(".play-option").count(), 2);
  assert.ok(
    await page
      .locator('[data-mode="copy"]')
      .evaluate((e) => e.classList.contains("suit-construction")),
  );
  assert.ok(
    await page
      .locator('[data-mode="pivot"]')
      .evaluate((e) => e.classList.contains("suit-administration")),
  );
  await page.screenshot({ path: "work/card-play-options.png", fullPage: true });
  await command("What is Copy?").hover();
  await page.getByRole("tooltip").waitFor();
  assert.match(await page.getByRole("tooltip").innerText(), /one card action/);
  assert.equal(actions, 0);
  await page.keyboard.press("Escape");
  await page
    .locator('[data-mode="copy"]')
    .getByRole("button", { name: "What does Build do?", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Build explained" }).waitFor();
  await page.screenshot({ path: "work/card-play-guide.png", fullPage: true });
  assert.equal(actions, 0);
  await command("Close explanation").click();
  await command("What is Pivot?").focus();
  await page.getByRole("tooltip").waitFor();
  assert.match(
    await page.getByRole("tooltip").innerText(),
    /lead suit stays unchanged/,
  );
  await page.keyboard.press("Escape");
  await command("Copy with Administration 5").click();
  assert.equal(room.game.turn.suit, "construction");
  assert.equal(room.game.turn.pips, 1);
  await page
    .locator(".command-choice")
    .filter({ hasText: "Finish Prelude" })
    .click();
  await page.locator(".action-rail").waitFor();
  await page.screenshot({
    path: "work/action-bar-preview.png",
    fullPage: true,
  });

  assert.ok(
    await page
      .locator(".action-panel")
      .evaluate((e) => e.scrollHeight <= e.clientHeight + 2),
    "main action bar fits without scrolling",
  );
  const dock = page.getByRole("separator", { name: "Resize action area" });
  const baseHeight = Number(await dock.getAttribute("aria-valuenow"));
  await dock.focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  assert.equal(
    await dock.getAttribute("aria-valuenow"),
    String(baseHeight + 60),
  );
  const grip = await dock.boundingBox();
  await page.mouse.move(grip.x + 100, grip.y + 5);
  await page.mouse.down();
  await page.mouse.move(grip.x + 100, grip.y - 55, { steps: 8 });
  await page.mouse.up();
  assert.equal(
    await dock.getAttribute("aria-valuenow"),
    String(baseHeight + 120),
  );
  await page.reload();
  await page.locator(".command-live").waitFor();
  assert.equal(
    await dock.getAttribute("aria-valuenow"),
    String(baseHeight + 120),
  );
  await command("Reset").click();
  await command("Build").click();
  await page.locator(".map-instruction").waitFor();
  assert.equal(
    await page.locator(".target-fallback").getAttribute("open"),
    null,
  );
  const targets = decision(room.game, 1).choices.filter(
    (c) => c.op === "buildTarget",
  );
  const system = targets.find(
    (c) => targets.filter((t) => t.system === c.system).length > 1,
  ).system;
  await page.locator(`[data-system="${system}"] .system-target`).click();
  await page.locator(".map-choice-tray").waitFor();
  const target =
    targets.find((c) => c.system === system && c.kind === "city") ??
    targets.find((c) => c.system === system);
  const before = room.game.pieces.length;
  await page
    .locator(".map-choice-tray")
    .getByRole("button", { name: target.label, exact: true })
    .click();
  assert.equal(room.game.pieces.length, before + 1);
  // A real battle target decision, with fixtures bringing opposing fleets together.
  const friendly = room.game.pieces.find(
    (p) => p.owner === 1 && p.type === "ship",
  );
  const enemy = room.game.pieces.find(
    (p) => p.owner === 0 && p.type === "ship",
  );
  enemy.system = friendly.system;
  room.game.turn = {
    ...room.game.turn,
    suit: "aggression",
    pips: 3,
    prelude: false,
  };
  room.game.pending = [{ type: "action", p: 1, action: "battle", cost: "pip" }];
  room.game.revision++;
  await reload();
  await page
    .locator(`[data-system="${friendly.system}"] .system-target`)
    .click();
  // Starting a battle waits for its confirm step (M11, C-6), whether the
  // system click picked the only target or the tray offered several.
  const confirmRegion = page.getByRole("region", {
    name: "Confirm this choice",
  });
  if (!(await confirmRegion.count()))
    await page
      .locator(".map-choice-tray")
      .getByRole("button", { name: new RegExp("^Battle Mira") })
      .click();
  assert.equal(room.game.pending[0].type, "action", "not sent unconfirmed");
  await confirmRegion
    .getByRole("button", { name: "Confirm & start battle", exact: true })
    .click();
  await page.getByLabel("skirmish dice", { exact: true }).waitFor();
  await page.waitForFunction(
    () => Number(document.querySelector(".map-viewport").dataset.zoom) > 3.49,
  );
  await page.screenshot({ path: "work/map-battle-focus.png", fullPage: true });
  await command("Show whole map").click();
  await page.waitForFunction(
    () => Number(document.querySelector(".map-viewport").dataset.zoom) === 1,
  );
  await command("Zoom in").click();
  await page.waitForFunction(
    () => Number(document.querySelector(".map-viewport").dataset.zoom) > 1.3,
  );
  const box = await page.locator(".physical-board").boundingBox(),
    oldView = await page.locator(".physical-board").getAttribute("viewBox");
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(
    box.x + box.width * 0.5 + 65,
    box.y + box.height * 0.5 + 30,
    { steps: 8 },
  );
  await page.mouse.up({ button: "middle" });
  await page.waitForFunction(
    (old) =>
      document.querySelector(".physical-board").getAttribute("viewBox") !== old,
    oldView,
  );
  await page.mouse.wheel(0, -220);
  await page.waitForFunction(
    () => Number(document.querySelector(".map-viewport").dataset.zoom) > 1.5,
  );
  // Hits are applied by touching the target piece, without selecting a bottom list.
  room.game.pending = [
    {
      type: "hits",
      p: 1,
      target: 0,
      dealer: 1,
      system: enemy.system,
      left: 1,
      kind: "hit",
      battle: true,
    },
    {
      type: "battleEnd",
      p: 1,
      defender: 0,
      system: enemy.system,
      attackers: [friendly.id],
      beforeTrophies: 0,
    },
  ];
  room.game.revision++;
  await reload();
  await page.locator(`[data-piece="${enemy.id}"]`).click();
  assert.ok(room.game.pieces.find((p) => p.id === enemy.id).damaged);
  // Repair and Tax also work directly on pieces.
  const damaged = room.game.pieces.find((p) => p.owner === 1 && p.damaged);
  room.game.turn = { ...room.game.turn, suit: "administration", pips: 3 };
  room.game.pending = [{ type: "action", p: 1, action: "repair", cost: "pip" }];
  room.game.revision++;
  await reload();
  await page.locator(`[data-piece="${damaged.id}"]`).click();
  assert.equal(
    room.game.pieces.find((p) => p.id === damaged.id).damaged,
    false,
  );
  room.game.pending = [{ type: "action", p: 1, action: "tax", cost: "pip" }];
  room.game.revision++;
  await reload();
  const tax = decision(room.game, 1).choices.find((c) => c.op === "taxTarget");
  await page.locator(`[data-piece="${tax.piece}"]`).click();
  assert.ok(room.game.turn.taxed.includes(tax.piece));
  // Court interactions submit the corresponding legal action directly.
  room.game.pending = [
    { type: "action", p: 1, action: "influence", cost: "free" },
  ];
  room.game.revision++;
  await reload();
  const influence = decision(room.game, 1).choices.find(
      (c) => c.op === "influenceTarget",
    ),
    agents = room.game.court[influence.index].agents[1];
  await page
    .locator(".court-slot")
    .nth(influence.index)
    .locator(".court-card")
    .click();
  assert.equal(room.game.court[influence.index].agents[1], agents + 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      suitThemedPlays: true,
      hoverKeyboardTapHelp: true,
      noHelpCommits: true,
      actionBarFits: true,
      resizeAndPersist: true,
      mapBuildBattleHitRepairTax: true,
      courtInfluence: true,
      autoBattleZoom: true,
      zoomPanWheel: true,
      mobileFits: true,
      errors,
    }),
  );
} catch (e) {
  console.error(await page.locator("body").innerText());
  await page.screenshot({
    path: "work/learning-failure.png",
    fullPage: true,
  });
  throw e;
} finally {
  await browser.close();
}
