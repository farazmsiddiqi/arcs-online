import { gunzipSync } from "node:zlib";
import { chromium, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { viewFor, decision } from "../game/engine.js";
import { ACTION_CARDS } from "../game/data.js";
import { applyDecision, historyView } from "../server/history.js";
const fixtures = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL("../tests/fixtures/ux-states.json.gz", import.meta.url),
      ),
    ).toString("utf8"),
  ),
  base = process.env.TEST_URL ?? "http://localhost:5173",
  id = "ABCDDE13";
let room,
  p,
  writes = 0;
const projection = () => ({
  id,
  me: p,
  host: true,
  status: "playing",
  game: viewFor(room.game, p),
  seats: room.game.players.map((p) => ({ name: p.name })),
  options: { timer: { mode: "off" } },
  history: historyView(room, p),
  notices: room.notices ?? [],
});
// PW_CHANNEL=chrome runs against the system Chrome when Playwright's own
// Chromium is not installed.
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL }),
  page = await browser.newPage({ viewport: { width: 1512, height: 982 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.addInitScript((id) => {
  localStorage.setItem(`arcs-seat-${id}`, "fixture");
  // Count chimes instead of making sound.
  window.__chimes = 0;
  window.AudioContext = class {
    constructor() {
      window.__chimes++;
      this.currentTime = 0;
      this.destination = {};
    }
    createOscillator() {
      return { connect() {}, frequency: {}, start() {}, stop() {} };
    }
    createGain() {
      return {
        connect() {},
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      };
    }
    close() {}
  };
  window.WebSocket = class {
    constructor() {
      (window.__sockets ??= []).push(this);
      setTimeout(() => this.onopen?.(), 10);
    }
    send() {
      fetch(`/api/rooms/${id}`)
        .then((r) => r.json())
        .then((data) => this.onmessage?.({ data: JSON.stringify(data) }));
    }
    close() {}
  };
  // Push the current table to the page as the server would after a change.
  window.__push = () => window.__sockets.forEach((ws) => ws.send());
}, id);
await page.route(`**/api/rooms/${id}**`, async (route) => {
  if (route.request().method() === "POST") {
    applyDecision(room, p, route.request().postDataJSON());
    writes++;
  }
  await route.fulfill({ json: projection() });
});
const load = async (kind, alter = () => {}) => {
  writes = 0;
  room = { game: structuredClone(fixtures[kind].raw) };
  alter(room.game);
  p = room.game.pending[0]?.p ?? room.game.current;
  await page.goto(`${base}/table/${id}`);
  await page.locator(".command-live").waitFor();
};
try {
  await load("overflow");
  const discard = decision(room.game, p).choices[0],
    before = room.game.players[p].resources.filter(Boolean).length;
  await page.getByRole("button", { name: discard.label, exact: true }).click();
  assert.equal(
    room.game.players[p].resources.filter(Boolean).length,
    before - 1,
  );
  await load("gainChoice");
  const gain = decision(room.game, p).choices.find((c) => c.op === "gain");
  const n = room.game.supply[gain.resource];
  await page.getByRole("button", { name: gain.label, exact: true }).click();
  assert.equal(room.game.supply[gain.resource], n - 1);
  await load("effects");
  const effect = decision(room.game, p).choices[0];
  await page.getByRole("button", { name: effect.label, exact: true }).click();
  assert.ok(room.game.revision > fixtures.effects.raw.revision);
  await load("dice");
  assert.ok(
    Number(
      await page
        .getByRole("spinbutton", { name: "skirmish dice" })
        .inputValue(),
    ) > 0,
  );
  for (const viewport of [
    { width: 1512, height: 982 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(async () => {
        const r = await page
          .getByRole("button", { name: "Roll battle dice", exact: true })
          .boundingBox();
        return r && r.y >= 0 && r.y + r.height <= viewport.height;
      })
      .toBe(true);
  }
  await page.setViewportSize({ width: 1512, height: 982 });
  const prior = writes;
  await page
    .getByRole("button", { name: "Assault · more risk", exact: true })
    .click();
  assert.equal(writes, prior);
  const f = decision(room.game, p).form,
    d = {};
  for (const type of ["skirmish", "assault", "raid"])
    d[type] = Number(
      await page.getByRole("spinbutton", { name: `${type} dice` }).inputValue(),
    );
  assert.ok(Object.values(d).reduce((a, b) => a + b, 0) <= f.max);
  if (f.corsair) assert.ok(d.assault <= d.skirmish);
  await page.getByRole("button", { name: "Guidance on", exact: true }).click();
  assert.equal(await page.locator(".decision-instruction").count(), 0);
  await page.reload();
  await page
    .getByRole("button", { name: "Guidance off", exact: true })
    .waitFor();
  assert.equal(writes, prior);
  await page.getByRole("button", { name: "Guidance off", exact: true }).click();
  await load("actionsRoot", (s) => {
    s.pending = [];
    s.turn.pips = 0;
    s.turn.acted = true;
    s.turn.prelude = false;
    // A reveal closes the late declare/seize window (item 16).
    s.turn.revealed = "deck";
  });
  assert.deepEqual(
    decision(room.game, p).choices.map((c) => c.op),
    ["endTurn"],
  );
  await page
    .getByRole("button", { name: "Confirm & end turn", exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "End turn", exact: true }).count(),
    0,
  );
  const handoff = writes;
  await page
    .getByRole("button", { name: "Confirm & end turn", exact: true })
    .click();
  assert.equal(writes, handoff + 1);
  await load("repairBonus");
  const repair = decision(room.game, p).choices.find((c) => c.piece);
  assert.ok(repair);
  await page.locator(`[data-piece="${repair.piece}"]`).click();
  assert.equal(
    room.game.pieces.find((x) => x.id === repair.piece).damaged,
    false,
  );
  await load("farseersDiscard");
  const cards = decision(room.game, p).form.options;
  assert.ok(cards.length >= 2);
  assert.equal(
    await page.locator(".selection-gallery .decision-card-art").count(),
    cards.length,
  );
  await page
    .getByRole("checkbox", { name: cards[0].label, exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("checkbox", { name: cards[0].label, exact: true })
      .getAttribute("aria-checked"),
    "true",
  );
  await page
    .getByRole("button", { name: "Confirm selection", exact: true })
    .click();
  assert.ok(!room.game.players[p].hand.includes(cards[0].id));
  // M11 C-6: one-click commits wait for a confirm step. Cancelling (Escape or
  // Cancel) sends nothing and leaves the game and its history untouched;
  // confirming sends exactly one command.
  const region = page.getByRole("region", { name: "Confirm this choice" }),
    steps = () => room.history?.steps?.length ?? 0,
    settle = () => page.waitForTimeout(300);
  async function confirmFlow({ open, title, confirm, committed }) {
    const w = writes,
      rev = room.game.revision,
      h = steps(),
      untouched = () => {
        assert.equal(writes, w);
        assert.equal(room.game.revision, rev);
        assert.equal(steps(), h);
      };
    await open();
    await region.waitFor();
    assert.match(await region.innerText(), title);
    untouched();
    await page.keyboard.press("Escape");
    await region.waitFor({ state: "detached" });
    untouched();
    await open();
    await region.waitFor();
    await region.getByRole("button", { name: "Cancel", exact: true }).click();
    await region.waitFor({ state: "detached" });
    untouched();
    await open();
    await region.waitFor();
    await region.getByRole("button", { name: confirm, exact: true }).click();
    await expect.poll(() => writes).toBe(w + 1);
    await settle();
    assert.equal(writes, w + 1);
    assert.ok(room.game.revision > rev);
    committed({ rev, h });
  }
  // Pass initiative.
  await load("card", (s) => {
    s.lead = null;
    s.initiative = s.current;
  });
  const passer = p;
  await confirmFlow({
    open: () =>
      page
        .getByRole("button", { name: "Pass initiative", exact: true })
        .click(),
    title: /Pass the initiative\?/,
    confirm: "Confirm & pass",
    committed: () => {
      assert.ok(room.game.passes.includes(passer));
      assert.equal(steps(), 0);
      assert.match(room.history.reason, /Turn confirmed/);
    },
  });
  // Face-up plays: from the card's own dialog, then from the command panel.
  await load("card");
  const plays = decision(room.game, p).choices.filter((c) => c.op === "play"),
    faceUp = plays.find((c) => c.mode === "pivot"),
    copy = plays.find((c) => c.mode === "copy"),
    handCard = (id) =>
      page.getByRole("button", {
        name: `${ACTION_CARDS[id].suit} ${ACTION_CARDS[id].rank}, ${ACTION_CARDS[id].pips} action pips`,
        exact: true,
      });
  assert.ok(faceUp && copy);
  await handCard(faceUp.card).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: faceUp.label, exact: true }).click();
  await region.waitFor();
  assert.equal(await dialog.count(), 0);
  assert.equal(writes, 0);
  await region.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: faceUp.label, exact: true }).waitFor();
  await confirmFlow({
    open: () =>
      page.getByRole("button", { name: faceUp.label, exact: true }).click(),
    title: new RegExp(faceUp.label.replace(/[·]/g, ".")),
    confirm: "Confirm & play",
    committed: ({ h }) => {
      assert.equal(steps(), h + 1);
      assert.equal(room.history.steps.at(-1).label, faceUp.label);
      assert.equal(room.game.played.at(-1).card, faceUp.card);
    },
  });
  // A Copy is played face down, so it goes through at once.
  await load("card");
  await handCard(copy.card).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: copy.label, exact: true }).click();
  await expect.poll(() => writes).toBe(1);
  assert.equal(await region.count(), 0);
  assert.equal(steps(), 1);
  // Secure by clicking a Court card.
  await load("actionsRoot");
  await page.getByRole("button", { name: "Secure", exact: true }).click();
  await expect
    .poll(() =>
      decision(room.game, p).choices.some((c) => c.op === "secureTarget"),
    )
    .toBe(true);
  const secure = decision(room.game, p).choices.find(
    (c) => c.op === "secureTarget",
  );
  await confirmFlow({
    open: () =>
      page
        .locator(".court-slot")
        .nth(room.game.court.findIndex((c) => c.id === secure.card))
        .locator(".court-card")
        .click(),
    title: /^[\s\S]*Secure /,
    confirm: "Confirm & secure",
    committed: () => {
      assert.ok(room.game.players[p].cards.includes(secure.card));
      assert.ok(steps() <= 1);
    },
  });
  // Battle by clicking a system, from the expanded map too.
  await load("actionsRoot");
  await page.getByRole("button", { name: "Battle", exact: true }).click();
  await expect
    .poll(() =>
      decision(room.game, p).choices.some((c) => c.op === "battleTarget"),
    )
    .toBe(true);
  const battles = decision(room.game, p).choices.filter(
      (c) => c.op === "battleTarget",
    ),
    battle = battles.find(
      (c) => battles.filter((x) => x.system === c.system).length === 1,
    );
  assert.ok(battle, "a system with exactly one battle target");
  await page.getByRole("button", { name: "Expand board", exact: true }).click();
  await confirmFlow({
    open: () => page.locator(`[data-system="${battle.system}"]`).click(),
    title: /^[\s\S]*Battle /,
    confirm: "Confirm & start battle",
    committed: () => {
      assert.equal(room.game.pending[0].type, "dice");
    },
  });
  // The confirm collapsed the expanded map, which would have hidden it.
  assert.equal(await page.locator(".expanded-board").count(), 0);
  // Ransack takes the card and refills the Court like Secure, so it confirms too.
  await load("ransack");
  const ransack = decision(room.game, p).choices.find(
    (c) => c.op === "ransack",
  );
  await confirmFlow({
    open: () =>
      page
        .locator(".court-slot")
        .nth(room.game.court.findIndex((c) => c.id === ransack.card))
        .locator(".court-card")
        .click(),
    title: /^[\s\S]*Ransack /,
    confirm: "Confirm & ransack",
    committed: () => {
      assert.ok(room.game.players[p].cards.includes(ransack.card));
    },
  });
  // Escape closes the layer on top and nothing beneath it.
  await load("card", (s) => {
    s.lead = null;
    s.initiative = s.current;
  });
  await page
    .getByRole("button", { name: "Pass initiative", exact: true })
    .click();
  await region.waitFor();
  await page.getByRole("button", { name: "Card library", exact: true }).click();
  await dialog.waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  assert.equal(await region.count(), 1);
  await page.keyboard.press("Escape");
  await region.waitFor({ state: "detached" });
  assert.equal(writes, 0);
  // Back is not a confirmed choice: it goes straight through.
  await load("actionsRoot");
  await page.getByRole("button", { name: "Move", exact: true }).click();
  const origin = await expect
    .poll(
      () =>
        decision(room.game, p).choices.find((c) => c.op === "moveFrom") ?? null,
    )
    .not.toBeNull()
    .then(() =>
      decision(room.game, p).choices.find((c) => c.op === "moveFrom"),
    );
  await page.locator(`[data-system="${origin.system}"]`).click();
  await page.getByRole("button", { name: "← Back" }).click();
  await expect.poll(() => writes).toBe(3);
  assert.equal(await region.count(), 0);
  assert.ok(decision(room.game, p).choices.some((c) => c.op === "moveFrom"));

  // M11 C-5: the your-turn chime is on unless muted; a stored "no" stays muted.
  await load("card");
  await page
    .getByRole("button", { name: "Table settings", exact: true })
    .click();
  const chimeToggle = page.getByRole("button", { name: /Your-turn chime/ });
  assert.match(await chimeToggle.innerText(), /on/);
  assert.equal(await chimeToggle.getAttribute("aria-pressed"), "true");
  await chimeToggle.click();
  assert.match(await chimeToggle.innerText(), /muted/);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("arcs-sound")),
    "no",
  );
  await page.keyboard.press("Escape");
  const toOther = (current) => {
      room.game.current = current;
      room.game.revision++;
    },
    chimes = () => page.evaluate(() => window.__chimes),
    title = () => page.title();
  const baseTitle = await title();
  const unfocus = () =>
    page.evaluate(() => {
      document.hasFocus = () => false;
    });
  // Muted: the actor changes to you, nothing chimes, the title still flashes.
  await page.reload();
  await page.locator(".command-live").waitFor();
  await unfocus();
  assert.equal(await chimes(), 0, "no chime on load, even on your turn");
  const me = p,
    other = (me + 1) % room.game.players.length;
  toOther(other);
  await page.evaluate(() => window.__push());
  await page.getByText(/while you wait/).waitFor({ state: "attached" });
  toOther(me);
  await page.evaluate(() => window.__push());
  await expect.poll(title).toContain("Your turn");
  assert.equal(await chimes(), 0, "a muted chime stays silent");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(title).toBe(baseTitle);
  // Unmuted (fresh storage defaults to on): one chime per change to you.
  await page.evaluate(() => localStorage.removeItem("arcs-sound"));
  await page.reload();
  await page.locator(".command-live").waitFor();
  await unfocus();
  toOther(other);
  await page.evaluate(() => window.__push());
  await page.getByText(/while you wait/).waitFor({ state: "attached" });
  toOther(me);
  await page.evaluate(() => window.__push());
  await expect.poll(chimes).toBe(1);
  await page.evaluate(() => window.__push());
  await settle();
  assert.equal(await chimes(), 1, "the same turn does not chime twice");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  // A focused tab is not flashed.
  toOther(other);
  await page.evaluate(() => window.__push());
  await page.getByText(/while you wait/).waitFor({ state: "attached" });
  toOther(me);
  await page.evaluate(() => window.__push());
  await expect.poll(chimes).toBe(2);
  await page.waitForTimeout(1200);
  assert.equal(await title(), baseTitle);

  // Short laptop window (laptop-fit.css): the whole hand is visible beside
  // the player mat without scrolling, and the map keeps its room.
  await page.setViewportSize({ width: 1280, height: 700 });
  await load("card");
  const hand = await page
    .locator(".hand-cards .action-wrapper")
    .evaluateAll((cards) => cards.map((c) => c.getBoundingClientRect().bottom));
  assert.equal(hand.length, 6);
  assert.ok(
    hand.every((bottom) => bottom <= 700),
    "all six hand cards on screen at 1280x700",
  );
  const map = await page.locator(".physical-board").boundingBox();
  assert.ok(map.height >= 200, `map is ${map.height}px at 1280x700`);
  await page.setViewportSize({ width: 1512, height: 982 });
  // M11 C-5: timer notices become toasts, diffed on `at`.
  await load("card");
  const notice = (at, text, seat) => ({ text, at, p: seat }),
    toasts = page.locator(".notice-toast"),
    texts = () =>
      toasts
        .allInnerTexts()
        .then((t) => t.map((x) => x.replace(/^TIMER\s+/, "")));
  const push = async () => page.evaluate(() => window.__push());
  assert.equal(await toasts.count(), 0, "opening a table replays no history");
  room.notices = [notice(1000, "Host paused the table.", null)];
  await push();
  await expect.poll(texts).toEqual(["Host paused the table."]);
  room.notices.push(notice(2000, "Host added 1 minutes to A's clock.", p));
  await push();
  await push();
  await expect
    .poll(texts)
    .toEqual(["Host paused the table.", "Host added 1 minutes to A's clock."]);
  // A full list of 20 keeps its length; only the newest `at` is new.
  room.notices = Array.from({ length: 20 }, (_, i) =>
    notice(3000 + i, `n${i}`, null),
  );
  await push();
  await expect.poll(texts).toEqual(["n17", "n18", "n19"]);
  room.notices = [...room.notices.slice(1), notice(3020, "n20", null)];
  assert.equal(room.notices.length, 20);
  await push();
  await expect.poll(texts).toEqual(["n18", "n19", "n20"]);
  // Dismiss, and auto-dismiss is left to the 9 s timer.
  await toasts.first().getByRole("button", { name: "Dismiss" }).click();
  await expect.poll(texts).toEqual(["n19", "n20"]);
  // A reload (reconnect) shows only what was missed since the last one seen.
  await page.evaluate(
    (id) => localStorage.setItem(`arcs-notices-seen-${id}`, "3018"),
    id,
  );
  await page.reload();
  await page.locator(".command-live").waitFor();
  await expect.poll(texts).toEqual(["n19", "n20"]);
  await page.reload();
  await page.locator(".command-live").waitFor();
  await settle();
  assert.equal(await toasts.count(), 0, "already-seen notices stay quiet");
  // The title flashes for the player a notice is about, only in the background.
  await unfocus();
  room.notices.push(notice(4000, "Host added 1 minutes to B's clock.", other));
  await push();
  await expect.poll(texts).toEqual(["Host added 1 minutes to B's clock."]);
  await page.waitForTimeout(1200);
  assert.equal(await title(), baseTitle, "a notice about someone else");
  room.notices.push(notice(5000, "Host added 1 minutes to A's clock.", me));
  await push();
  await expect.poll(title).toContain("Host added 1 minutes to A's clock.");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(title).toBe(baseTitle);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      visualResourceActions: true,
      effectOrdering: true,
      legalDiceDefaults: true,
      noPresetCommits: true,
      teachingPreference: true,
      exhaustedTurnOneClick: true,
      mapBonusRepair: true,
      visualHandSelection: true,
      confirmPass: true,
      confirmFaceUpPlay: true,
      copyNeedsNoConfirm: true,
      confirmSecure: true,
      confirmBattle: true,
      confirmRansack: true,
      escapeClosesTopLayer: true,
      backBypassesConfirm: true,
      chimeDefaultOn: true,
      noticeToasts: true,
      titleFlash: true,
      laptopHandVisible: true,
      errors,
    }),
  );
} catch (e) {
  await page.screenshot({
    path: "work/ux-flow-failure.png",
    fullPage: true,
  });
  throw e;
} finally {
  await browser.close();
}
