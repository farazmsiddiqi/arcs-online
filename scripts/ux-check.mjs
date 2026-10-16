import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { createGame, decision, transition, viewFor } from "../game/engine.js";
import { ACTION_CARDS, adjacent } from "../game/data.js";
const base = process.env.TEST_URL ?? "http://localhost:5173";
let state = createGame(
  ["Alex", "Mira", "Sol"],
  { initiative: 0, setupId: "3SETUP01" },
  37,
);
for (let seed = 1; !state.players[0].hand.includes("mobilization-2"); seed++)
  state = createGame(
    ["Alex", "Mira", "Sol"],
    { initiative: 0, setupId: "3SETUP01" },
    seed,
  );
const step = (op, fn = () => true) => {
  const p = state.pending[0]?.p ?? state.current;
  const c = decision(state, p).choices.find((c) => c.op === op && fn(c));
  assert.ok(c, op);
  state = transition(state, p, { choice: c.id });
};
step("play", (c) => c.card === "mobilization-2");
step("declare");
let seat = 0,
  actions = 0;
const room = () => ({
  id: "ABCDEF00",
  status: "playing",
  game: viewFor(state, seat),
  seats: state.players.map((p) => ({ name: p.name, connected: true })),
  host: seat === 0,
  capacity: 3,
});
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL });
const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  localStorage.setItem("arcs-seat-ABCDEF00", "test-fixture");
  window.WebSocket = class {
    constructor() {
      setTimeout(() => this.onopen?.(), 10);
    }
    send() {
      fetch("/api/rooms/ABCDEF00")
        .then((r) => r.json())
        .then((data) => this.onmessage?.({ data: JSON.stringify(data) }));
    }
    close() {}
  };
});
await page.route("**/api/rooms/ABCDEF00**", async (route) => {
  if (route.request().method() === "POST") {
    const input = route.request().postDataJSON();
    state = transition(state, seat, input);
    actions++;
  }
  await route.fulfill({ json: room() });
});
const refresh = async () => {
  await page.goto(base + "/table/ABCDEF00");
  await page.locator(".round-story").waitFor();
  await page.evaluate(() => document.fonts.ready);
};
try {
  await refresh();
  assert.match(
    await page.locator(".round-story").innerText(),
    /Alex declared Tycoon/,
  );
  assert.match(
    await page.locator(".round-story").innerText(),
    /printed action pips are unchanged/,
  );
  assert.equal(await page.locator(".printed-rank").innerText(), "2");
  assert.equal(
    await page
      .locator(".command-choice")
      .filter({ hasText: "Card actions" })
      .count(),
    0,
  );
  await page
    .locator(".command-choice")
    .filter({ hasText: "Finish Prelude" })
    .click();
  assert.equal(actions, 1);
  await page
    .locator(".command-choice")
    .filter({ hasText: "Review & end turn" })
    .waitFor();
  actions = 0;
  const end = page
    .locator(".command-choice")
    .filter({ hasText: /^Review & end turn/ });
  await end.click();
  assert.equal(actions, 0);
  await page.getByRole("button", { name: "Keep playing", exact: true }).click();
  assert.equal(actions, 0);
  await end.click();
  await page
    .getByRole("button", { name: "Confirm & end turn", exact: true })
    .click();
  await page.getByRole("heading", { name: "Waiting for Mira" }).waitFor();
  assert.equal(actions, 1);
  assert.match(
    await page.locator(".round-story").innerText(),
    /Alex declared Tycoon/,
  );
  seat = 1;
  await refresh();
  const ownCard = state.players[1].hand[0];
  await page
    .getByRole("button", {
      name: `${ACTION_CARDS[ownCard].suit} ${ACTION_CARDS[ownCard].rank}, ${ACTION_CARDS[ownCard].pips} action pips`,
      exact: true,
    })
    .click();
  assert.ok((await page.locator(".choice-consequence").count()) > 0);
  assert.match(await page.locator(".play-pips").first().innerText(), /action/);
  // Clicking a hand card opens its dialog; close it to reach the panel.
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await page.screenshot({
    path: "work/ux-declaration-desktop.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight + 2,
    ),
    "desktop height fits",
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: "work/ux-laptop.png", fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight + 2,
    ),
    "laptop height fits",
  );
  // On a short laptop window the map keeps at least 200px (laptop-fit.css),
  // and the Court's first row is whole; the rest scrolls inside the Court.
  const board = await page.locator(".physical-board").boundingBox();
  assert.ok(
    board.height >= 200,
    `map remains usable on laptop (${board.height}px)`,
  );
  const courtBounds = await page.locator(".court").boundingBox();
  const secondCourt = await page.locator(".court-slot").nth(1).boundingBox();
  assert.ok(
    secondCourt.y + secondCourt.height <=
      courtBounds.y + courtBounds.height + 2,
    "first row of Court cards visible on laptop",
  );
  await page.getByRole("button", { name: "Expand board", exact: true }).click();
  assert.ok(await page.locator(".expanded-board").isVisible());
  await page
    .getByRole("button", { name: "Close expanded board", exact: true })
    .click();
  await page.setViewportSize({ width: 1512, height: 982 });
  // A face-down copy is labelled, but its identity is not placed in DOM or alt text.
  step("play", (c) => c.mode === "copy");
  step("endTurn");
  seat = 2;
  await refresh();
  assert.match(
    await page.locator(".played-response").innerText(),
    /Copy · face down/,
  );
  assert.equal(
    await page.locator(".played-response img").getAttribute("src"),
    "/assets/card-back.webp",
  );
  // Target highlighting and reversible map filtering.
  step("play", (c) => c.mode === "copy");
  step("action", (c) => c.action === "move" && c.cost === "pip");
  await refresh();
  const targets = decision(state, seat).choices.filter((c) => c.system);
  assert.ok(targets.length > 1);
  assert.equal(
    await page.locator(".legal-ring").count(),
    new Set(targets.map((c) => c.system)).size,
  );
  const sys = targets[0].system;
  const [cluster, symbol] = sys.split("-");
  await page
    .getByRole("button", { name: new RegExp(`^${cluster} ${symbol},`) })
    .click();
  await page
    .getByRole("heading", { name: "Choose ships to move", exact: true })
    .waitFor();
  assert.ok((await page.locator(".selectable-ship").count()) > 0);
  // Scoring recap stays available after automatic chapter advancement.
  state.scoreHistory = [
    {
      chapter: 1,
      ambitions: [{ ambition: "tycoon", values: [3, 1, 2], awards: [5, 0, 3] }],
    },
  ];
  await refresh();
  await page
    .getByRole("button", { name: "Table history", exact: true })
    .click();
  await page.getByRole("button", { name: "Chapter 1 results" }).click();
  assert.match(await page.locator(".score-table").innerText(), /\+5/);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "work/ux-mobile.png", fullPage: true });
  const overflow = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    els: [...document.querySelectorAll("body *")]
      .filter(
        (e) =>
          e.getBoundingClientRect().right > innerWidth &&
          !e.closest(".hand-cards"),
      )
      .map((e) => ({
        cls: e.className,
        right: e.getBoundingClientRect().right,
      }))
      .slice(0, 12),
  }));
  assert.ok(overflow.scroll <= overflow.width, JSON.stringify(overflow));
  // Defender interruptions identify whose turn and pips are being resolved.
  const origin = state.pieces.find(
    (p) => p.owner === 1 && p.type === "ship",
  ).system;
  state.players[1].leader = "LEAD05";
  state.pending = [
    { type: "predictive", p: 1, system: adjacent(origin, state.clusters)[0] },
  ];
  state.lastBattle = {
    attacker: 2,
    defender: 1,
    system: origin,
    dice: [
      { type: "assault", faces: ["hit", "self"] },
      { type: "raid", faces: ["key"] },
    ],
  };
  state.battles = [{ ...state.lastBattle, rerolls: [] }];
  seat = 1;
  await refresh();
  assert.match(
    await page.locator(".command-live").innerText(),
    /response during Sol/,
  );
  assert.equal(await page.locator(".pip-strip").count(), 0);
  assert.equal(await page.locator(".turn-steps").count(), 0);
  assert.match(
    await page.locator(".command-live").innerText(),
    /at most 2 per origin/,
  );
  const options = decision(state, 1).form.options.filter(
    (o) => o.system === origin,
  );
  if (options.length >= 3) {
    const all = decision(state, 1).form.options;
    await page
      .getByRole("checkbox")
      .nth(all.findIndex((o) => o.id === options[0].id))
      .click();
    await page
      .getByRole("checkbox")
      .nth(all.findIndex((o) => o.id === options[1].id))
      .click();
    assert.equal(
      await page
        .getByRole("checkbox")
        .nth(all.findIndex((o) => o.id === options[2].id))
        .isEnabled(),
      false,
    );
  }
  await page
    .getByRole("button", { name: "Table history", exact: true })
    .click();
  await page.getByRole("button", { name: "Review latest battle dice" }).click();
  assert.match(
    await page.locator(".battle-record-dice").innerText(),
    /Self hit/,
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  // Per-chapter battle list: newest first, current chapter open, older folded.
  const roll = (chapter, round, rerolls, faces) => ({
    attacker: 2,
    defender: 1,
    system: origin,
    dice: [{ type: "skirmish", faces }],
    rerolls,
    at: { chapter, round, player: 2 },
  });
  state.chapter = 2;
  state.battles = [
    roll(1, 1, [], ["hit"]),
    roll(1, 3, ["Skirmishers"], []),
    roll(2, 2, [], ["hit"]),
  ];
  for (const [w, h] of [
    [1280, 700],
    [1440, 790],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await refresh();
    await page
      .getByRole("button", { name: "Table history", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Review latest battle dice" })
      .click();
    const dialog = page.getByRole("dialog");
    assert.equal(await dialog.locator("summary").count(), 2);
    assert.match(
      await dialog.locator("summary").first().innerText(),
      /Chapter 2 · 1 roll$/,
    );
    assert.match(
      await dialog.locator("summary").last().innerText(),
      /Chapter 1 · 2 rolls$/,
    );
    assert.equal(await dialog.locator("details[open]").count(), 1);
    assert.equal(
      await dialog.locator(".battle-record-dice:visible").count(),
      1,
    );
    await dialog.locator("summary").last().click();
    const text = await dialog.innerText();
    assert.match(text, /Rerolled: Skirmishers/);
    assert.ok(text.indexOf("Round 3") < text.indexOf("Round 1"));
    const box = await dialog.boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= h, JSON.stringify(box));
    // Escape, X and the backdrop all close it.
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page
      .getByRole("button", { name: "Table history", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Review latest battle dice" })
      .click();
    await page.getByRole("button", { name: "Close dialog" }).click();
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page
      .getByRole("button", { name: "Table history", exact: true })
      .click();
    await page.mouse.click(5, 5);
    assert.equal(await page.getByRole("dialog").count(), 0);
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      declarationContext: true,
      preservedAcrossTurns: true,
      endTurnGuard: true,
      choiceConsequences: true,
      hiddenCopy: true,
      mapTargets: true,
      scoringRecap: true,
      desktopFits: true,
      mobileFits: true,
      noExceptions: true,
      laptopCourtVisible: true,
      defenderContext: true,
      originSelectionLimit: true,
      battleReview: true,
      battleChapters: true,
    }),
  );
} catch (e) {
  console.error(errors);
  console.error(await page.locator("body").innerText());
  await page.screenshot({ path: "work/ux-failure.png", fullPage: true });
  throw e;
} finally {
  await browser.close();
}
