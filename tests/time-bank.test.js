import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createGame, decision, transition } from "../game/engine.js";
import { resolveTimeout } from "../server/timeout.js";
import {
  initClock,
  clockView,
  settleClock,
  followClock,
  changeClock,
  assertClockOpen,
  validateTimer,
} from "../server/clock.js";
// Item 6: turn limit, time bank and increment.
const fixtures = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/ux-states.json.gz", import.meta.url)),
  ),
);
function cardTurn() {
  let game = createGame(["A", "B"], { initiative: 0 }, 37);
  while (game.pending.length) {
    const p = game.pending[0].p;
    game = transition(game, p, {
      choice: decision(game, p).choices.find((c) => c.op === "skip").id,
    });
  }
  return game;
}
function room(timer, game = cardTurn()) {
  const r = {
    game: structuredClone(game),
    seats: game.players.map((p) => ({ name: p.name })),
    options: { timer: validateTimer(timer) },
  };
  initClock(r, 0);
  return r;
}
const live = (knobs, expiry = "overtime") => ({
  mode: "live",
  expiry,
  ...knobs,
});
// Hand the card turn to seat `p`, as finishing a turn does.
function turnTo(r, p, now) {
  settleClock(r, now);
  r.game.current = p;
  r.game.round++;
  r.game.pending = [];
  followClock(r, now);
}
const view = (r, now) => clockView(r, now);

test("timer validation: ranges per mode, at least one limit, increment needs a bank", () => {
  for (const ok of [
    { mode: "off" },
    live({ turn: 60 }),
    live({ turn: 3600 }),
    live({ bank: 300 }),
    live({ bank: 36000, increment: 600 }),
    live({ turn: 300, bank: 2400, increment: 30 }),
    { mode: "async", turn: 3600 },
    { mode: "async", bank: 604800, increment: 0 },
    { mode: "async", turn: 604800, bank: 3600 },
  ])
    assert.doesNotThrow(() => validateTimer(ok), JSON.stringify(ok));
  for (const bad of [
    live({ turn: 59 }),
    live({ turn: 3601 }),
    live({ bank: 299 }),
    live({ bank: 36001 }),
    live({ bank: 600, increment: 601 }),
    live({ bank: 600, increment: -1 }),
    live({ bank: 600.5 }),
    live({ turn: 0, bank: 0 }),
    live({ turn: 300, increment: 30 }),
    { mode: "async", turn: 3599 },
    { mode: "async", bank: 3599 },
    { mode: "async", bank: 604801 },
  ])
    assert.throws(() => validateTimer(bad), undefined, JSON.stringify(bad));
  // A turn limit alone keeps the bank and increment at zero.
  assert.deepEqual(validateTimer(live({ turn: 120 })), {
    mode: "live",
    expiry: "overtime",
    turn: 120,
    bank: 0,
    increment: 0,
  });
  assert.equal(validateTimer({ mode: "live" }).turn, 300);
  assert.equal(validateTimer({ mode: "async" }).turn, 86400);
  assert.equal(validateTimer(live({ bank: 600 })).turn, 0);
  assert.deepEqual(validateTimer({ mode: "off", turn: 5 }), {
    mode: "off",
    expiry: "auto",
    turn: 0,
    bank: 0,
    increment: 0,
  });
});

test("a room saved with only `seconds` keeps the old per-turn clock exactly", () => {
  // The shape a pre-bank room was saved in: no bank fields at all.
  const game = cardTurn();
  const r = {
    game,
    seats: [{ name: "A" }, { name: "B" }],
    options: { timer: { mode: "live", turn: 300, expiry: "pause" } },
    clock: {
      config: { mode: "live", turn: 300, expiry: "pause" },
      key: `${game.chapter}:${game.round}:${game.current}`,
      actor: 0,
      since: 0,
      spent: [0, 0],
      total: [7000, 0],
      bonus: [0, 0],
      paused: false,
    },
  };
  assert.equal(view(r, 100000).remainingMs, 200000);
  assert.equal(view(r, 100000).binding, "turn");
  assert.equal(view(r, 100000).bank, null);
  assert.equal(view(r, 400000).remainingMs, 0);
  assert.throws(() => assertClockOpen(r, 400000));
  // The host's extension goes to this turn only, worded as before.
  changeClock(r, 0, { operation: "extend", seconds: 60 }, 400000);
  assert.equal(view(r, 400000).remainingMs, 60000);
  assert.equal(
    r.notices.at(-1).text,
    "Host added 1 minute to A's current clock.",
  );
  // A rival's response charges their own turn clock in full: no grace.
  settleClock(r, 410000);
  r.game.pending = [{ p: 1, type: "predictive" }];
  followClock(r, 410000);
  assert.equal(view(r, 415000).spent[1], 5000);
  assert.equal(view(r, 415000).remainingMs, 295000);
  turnTo(r, 1, 420000);
  assert.equal(view(r, 420000).remainingMs, 300000);
  assert.deepEqual(view(r, 420000).total, [317000, 10000]);
  assert.equal(r.notices.length, 1, "no bank notices for a turn-only room");
  // Its draft keeps the table's turn length, not the 2-minute draft default.
  const d = room({ mode: "live", turn: 300 }, fixtures.draft.raw);
  assert.equal(view(d, 0).remainingMs, 300000);
});

test("bank expiry: AI completes the turn, and with no increment plays their later turns", () => {
  const r = room(live({ bank: 300 }, "auto"));
  assert.equal(view(r, 0).binding, "bank");
  assert.equal(view(r, 299999).remainingMs, 1);
  assert.equal(resolveTimeout(r, 299999), null);
  assert.throws(() => assertClockOpen(r, 300000), /AI/);
  // Time stops at zero: the bank is never overdrawn.
  assert.equal(view(r, 900000).bank[0], 0);
  let steps = 0;
  while (r.game.current === 0 && steps++ < 100)
    assert.ok(resolveTimeout(r, 300000));
  assert.ok(steps < 100);
  assert.equal(r.clock.actor, 1);
  assert.deepEqual(view(r, 300000).bank, [0, 300000]);
  assert.equal(view(r, 300000).remainingMs, 300000);
  // Seat 0's next turn starts on an empty bank: announced once, then AI.
  turnTo(r, 0, 310000);
  assert.ok(view(r, 310000).blocked);
  assert.match(
    r.notices.at(-1).text,
    /^A's time bank is empty\. AI will play their turns/,
  );
  assert.equal(r.notices.at(-1).p, 0);
  turnTo(r, 1, 320000);
  turnTo(r, 0, 330000);
  assert.equal(
    r.notices.filter((n) => n.text.includes("bank is empty")).length,
    1,
  );
});

test("bank expiry with pause stops play at each of their turns until the host adds time", () => {
  const r = room(live({ bank: 300 }, "pause"));
  assert.ok(view(r, 300000).blocked);
  changeClock(r, 0, { operation: "extend", seconds: 60 }, 300000);
  assert.equal(view(r, 300000).remainingMs, 60000);
  assert.equal(r.notices.at(-1).text, "Host added 1 minute to A's time bank.");
  turnTo(r, 1, 360000);
  turnTo(r, 0, 370000);
  assert.ok(view(r, 370000).blocked);
  assert.match(r.notices.at(-1).text, /Play stops at each of their turns/);
  // Overtime instead shows a negative bank and lets play continue.
  const o = room(live({ bank: 300 }));
  assert.equal(view(o, 330000).remainingMs, -30000);
  assert.equal(view(o, 330000).bank[0], -30000);
  assert.doesNotThrow(() => assertClockOpen(o, 330000));
  turnTo(o, 1, 330000);
  turnTo(o, 0, 340000);
  assert.match(o.notices.at(-1).text, /playing in overtime/);
});

test("min of both: the turn limit binds until the bank is the smaller", () => {
  const r = room(live({ turn: 120, bank: 300 }));
  assert.equal(view(r, 0).remainingMs, 120000);
  assert.equal(view(r, 0).binding, "turn");
  turnTo(r, 1, 100000);
  turnTo(r, 0, 100000);
  assert.equal(view(r, 100000).remainingMs, 120000);
  turnTo(r, 1, 200000);
  turnTo(r, 0, 200000);
  // 200 s of the bank used: 100 s left, below the 120 s turn limit.
  assert.equal(view(r, 200000).remainingMs, 100000);
  assert.equal(view(r, 200000).binding, "bank");
  assert.equal(view(r, 310000).remainingMs, -10000);
  // With auto expiry the bank, not the turn limit, stops the clock.
  const a = room(live({ turn: 120, bank: 300 }, "auto"));
  turnTo(a, 1, 100000);
  turnTo(a, 0, 100000);
  turnTo(a, 1, 200000);
  turnTo(a, 0, 200000);
  assert.ok(!view(a, 299999).blocked);
  assert.ok(view(a, 300000).blocked);
  assert.deepEqual(view(a, 500000).spent, [100000, 0]);
});

test("increment is credited once, when each card turn starts", () => {
  const r = room(live({ bank: 300, increment: 30 }));
  // The first card turn's increment comes with the clock.
  assert.deepEqual(view(r, 0).bank, [330000, 300000]);
  // Actions, undo and responses inside the turn never credit it again.
  settleClock(r, 10000);
  followClock(r, 10000);
  r.game.pending = [{ p: 1, type: "predictive" }];
  followClock(r, 10000);
  r.game.pending = [];
  followClock(r, 10000);
  assert.deepEqual(view(r, 10000).bank, [320000, 300000]);
  turnTo(r, 1, 10000);
  assert.deepEqual(view(r, 10000).bank, [320000, 330000]);
  // Scoring between chapters is not a card turn.
  settleClock(r, 10000);
  r.game.phase = "scoring";
  r.game.current = 0;
  r.game.round++;
  followClock(r, 10000);
  assert.deepEqual(view(r, 10000).bank, [320000, 330000]);
  r.game.phase = "card";
  r.game.chapter++;
  followClock(r, 10000);
  assert.deepEqual(view(r, 10000).bank, [350000, 330000]);
  // An exhausted bank leaves exactly the increment for the turn.
  turnTo(r, 1, 360000);
  assert.deepEqual(view(r, 360000).bank, [0, 360000]);
  turnTo(r, 0, 360000);
  assert.equal(view(r, 360000).remainingMs, 30000);
  assert.equal(
    r.notices.at(-1).text,
    "A's time bank is empty. From now on each of their turns gets only the increment: 30 seconds.",
  );
});

test("response grace: the first 10 s of each response in a rival's turn are free", () => {
  const game = structuredClone(fixtures.predictive.raw),
    owner = game.current,
    responder = game.pending[0].p,
    pending = game.pending;
  game.pending = [];
  const r = room(live({ bank: 300 }, "auto"), game);
  r.game.pending = pending;
  followClock(r, 0);
  assert.equal(r.clock.actor, responder);
  let v = view(r, 10000);
  assert.equal(v.bank[responder], 300000);
  assert.equal(v.graceMs, 0);
  assert.equal(v.remainingMs, 300000);
  assert.equal(view(r, 4000).graceMs, 6000);
  // The stretch keeps its grace across the responder's own actions.
  settleClock(r, 4000);
  followClock(r, 4000);
  assert.equal(view(r, 12000).bank[responder], 298000);
  // The turn owner gets none; the turn clock is still charged in full.
  settleClock(r, 12000);
  r.game.pending = [];
  followClock(r, 12000);
  assert.equal(view(r, 15000).bank[owner], 297000);
  assert.equal(view(r, 15000).total[responder], 12000);
  // A later response is a new stretch with fresh grace; with an empty bank
  // the grace is all the time the responder has.
  settleClock(r, 15000);
  r.clock.charged[responder] = 300000;
  r.game.pending = pending;
  followClock(r, 15000);
  assert.equal(view(r, 15000).remainingMs, 10000);
  assert.ok(!view(r, 24999).blocked);
  assert.ok(view(r, 25000).blocked);
});

test("draft picks never charge the bank and use the turn limit, else 2 minutes live or 24 hours async", () => {
  const r = room(live({ bank: 300 }, "auto"), fixtures.draft.raw),
    p = r.clock.actor;
  assert.equal(view(r, 0).remainingMs, 120000);
  assert.equal(view(r, 0).binding, "turn");
  assert.ok(view(r, 0).draft);
  assert.equal(view(r, 60000).bank[p], 300000);
  assert.equal(view(r, 60000).total[p], 60000);
  assert.ok(view(r, 120000).blocked);
  // The host's extension goes to the draft's turn clock, not the bank.
  changeClock(r, 0, { operation: "extend", seconds: 60 }, 120000);
  assert.equal(view(r, 120000).remainingMs, 60000);
  assert.deepEqual(r.clock.bankBonus, [0, 0, 0, 0]);
  assert.match(r.notices.at(-1).text, /current clock\.$/);
  const t = room(live({ turn: 90, bank: 300 }), fixtures.draft.raw);
  assert.equal(view(t, 0).remainingMs, 90000);
  // An async table with only a bank gives a day per pick, not 2 minutes.
  const slow = room({ mode: "async", bank: 86400 }, fixtures.draft.raw);
  assert.equal(view(slow, 0).remainingMs, 86400000);
  assert.equal(view(slow, 0).binding, "turn");
  // No increment is credited for a draft pick.
  const i = room(live({ bank: 300, increment: 30 }), fixtures.draft.raw);
  assert.deepEqual(view(i, 0).bank, [300000, 300000, 300000, 300000]);
});

test("host extend goes to each enabled limit; configure keeps bank use", () => {
  const r = room(live({ turn: 120, bank: 300, increment: 30 }, "pause"));
  changeClock(r, 0, { operation: "extend", seconds: 60 }, 0);
  assert.equal(view(r, 0).remainingMs, 180000);
  assert.deepEqual(view(r, 0).bank, [390000, 300000]);
  assert.equal(
    r.notices.at(-1).text,
    "Host added 1 minute to A's turn clock and time bank.",
  );
  // The turn part ends with the turn; the bank part stays.
  turnTo(r, 1, 50000);
  turnTo(r, 0, 50000);
  assert.deepEqual(view(r, 50000).bonus, [0, 0]);
  assert.equal(view(r, 50000).bank[0], 370000);
  assert.equal(view(r, 50000).remainingMs, 120000);
  // Configure resets this turn and host bonuses, not time used or earned.
  changeClock(
    r,
    0,
    {
      operation: "configure",
      config: live({ turn: 300, bank: 600, increment: 30 }, "pause"),
    },
    60000,
  );
  assert.deepEqual(view(r, 60000).bank, [600000, 630000]);
  assert.equal(view(r, 60000).remainingMs, 300000);
  assert.equal(
    r.notices.at(-1).text,
    "Timer set to 5 minutes per turn, 10 minutes time bank, +30 seconds each turn (live). Current allowance restarted; banks keep the time already used.",
  );
  // Survives a save and reload.
  const loaded = JSON.parse(JSON.stringify(r));
  assert.deepEqual(view(loaded, 70000), view(r, 70000));
});

test("adding a bank after untimed play starts full instead of billing previous decisions", () => {
  const r = room({ mode: "off" });
  changeClock(
    r,
    0,
    { operation: "configure", config: live({ bank: 600 }) },
    7200000,
  );
  assert.deepEqual(view(r, 7200000).bank, [600000, 600000]);
  assert.equal(view(r, 7200000).total[r.game.current], 7200000);
  assert.equal(view(r, 7210000).bank[r.game.current], 590000);
});

test("restart refills all allowances, cancels AI takeover and keeps the position and history", () => {
  const r = room(live({ turn: 60, bank: 300, increment: 30 }, "auto"));
  const game = structuredClone(r.game);
  r.history = { cursor: 1, steps: [{ before: game }] };
  const history = structuredClone(r.history);
  r.clock.takeovers = ["old takeover"];
  r.clock.paused = true;
  r.clock.charged = [300000, 300000];
  r.clock.spent = [60000, 60000];
  changeClock(r, 0, { operation: "restart" }, 90000);
  const c = view(r, 90000);
  assert.equal(c.remainingMs, 60000);
  assert.equal(c.paused, false);
  assert.deepEqual(c.charged, [0, 0]);
  assert.deepEqual(r.clock.takeovers, []);
  assert.deepEqual(
    c.bank,
    r.seats.map((_, i) => (i === r.game.current ? 330000 : 300000)),
  );
  assert.deepEqual(r.game, game);
  assert.deepEqual(r.history, history);
  assert.equal(resolveTimeout(r, 90000), null);
  changeClock(r, 0, { operation: "remove" }, 100000);
  assert.equal(view(r, 100000).config.mode, "off");
  assert.equal(view(r, 100000).blocked, false);
  assert.equal(resolveTimeout(r, 900000), null);
  changeClock(r, 0, { operation: "restart" }, 900000);
  assert.equal(view(r, 900000).config.bank, 300);
  assert.equal(view(r, 900000).remainingMs, 60000);
});

test("timer lifecycle works throughout every saved decision fixture without altering game state", () => {
  for (const [name, fixture] of Object.entries(fixtures)) {
    if (!fixture.raw) continue;
    const r = room({ mode: "off" }, fixture.raw);
    const before = structuredClone(r.game);
    for (const operation of ["restart", "remove", "restart"]) {
      changeClock(r, 0, { operation }, 1000);
      assert.deepEqual(r.game, before, `${name}: ${operation}`);
    }
    assert.equal(view(r, 1000).revision, 3, name);
  }
  const lobby = { seats: [{ name: "A" }], options: {}, game: null };
  changeClock(lobby, 0, { operation: "restart" }, 0);
  assert.equal(view(lobby, 100000).actor, null);
  assert.equal(view(lobby, 100000).remainingMs, null);
  changeClock(lobby, 0, { operation: "remove" }, 100000);
  assert.equal(lobby.game, null);
});
