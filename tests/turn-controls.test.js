import test from "node:test";
import assert from "node:assert/strict";
import { createGame, decision, transition } from "../game/engine.js";
import {
  applyDecision,
  applyMovement,
  historyView,
  travelHistory,
  historyBoundary,
} from "../server/history.js";
import {
  initClock,
  clockView,
  settleClock,
  followClock,
  changeClock,
  assertClockOpen,
  validateTimer,
} from "../server/clock.js";
function room() {
  let game = createGame(["A", "B"], { initiative: 0 }, 37);
  while (game.pending.length) {
    const p = game.pending[0].p;
    game = transition(game, p, {
      choice: decision(game, p).choices.find((c) => c.op === "skip").id,
    });
  }
  return {
    game,
    seats: [{ name: "A" }, { name: "B" }],
    options: { timer: { mode: "live", turn: 300, expiry: "overtime" } },
  };
}
function choose(r, op) {
  const p = r.game.pending[0]?.p ?? r.game.current;
  const c = decision(r.game, p).choices.find((c) => c.op === op);
  assert.ok(c, op);
  applyDecision(r, p, { choice: c.id });
}
const normalized = (s) => {
  const x = structuredClone(s);
  delete x.revision;
  delete x.log;
  delete x.eventId;
  return x;
};
test("undo/redo restores entire card turn and Prelude with increasing revisions; branching invalidates redo", () => {
  const r = room(),
    start = structuredClone(r.game);
  choose(r, "play");
  const played = structuredClone(r.game);
  choose(r, "endPrelude");
  const actions = structuredClone(r.game);
  travelHistory(r, 0, "undo");
  assert.deepEqual(normalized(r.game), normalized(played));
  assert.equal(r.game.revision, actions.revision + 1);
  travelHistory(r, 0, "redo");
  assert.deepEqual(normalized(r.game), normalized(actions));
  travelHistory(r, 0, "undo");
  travelHistory(r, 0, "undo");
  assert.deepEqual(normalized(r.game), normalized(start));
  assert.ok(historyView(r, 0).canRedo);
  choose(r, "play");
  assert.equal(historyView(r, 0).canRedo, false);
  assert.deepEqual(historyView(r, 1).steps, []);
  assert.throws(() => travelHistory(r, 1, "undo"));
  assert.ok(!JSON.stringify(historyView(r, 0)).includes("courtDeck"));
});
test("confirming turn commits history and cannot undo the next player", () => {
  const r = room();
  choose(r, "play");
  choose(r, "endPrelude");
  choose(r, "endTurn");
  assert.equal(historyView(r, 0).canUndo, false);
  assert.equal(historyView(r, 1).canUndo, false);
  assert.throws(() => travelHistory(r, 0, "undo"));
});
test("new information, rolls, handoffs and chapter changes form history boundaries", () => {
  const before = room().game;
  for (const mutate of [
    (s) => s.rng++,
    (s) => s.courtDeck.pop(),
    (s) => s.players[1].hand.reverse(),
    (s) => s.players[0].hand.push("new-private-card"),
    (s) => s.pending.push({ type: "farseersSwap", p: 0 }),
    (s) => s.pending.push({ type: "predictive", p: 1 }),
    (s) => s.chapter++,
  ]) {
    const after = structuredClone(before);
    mutate(after);
    assert.ok(historyBoundary(before, after, 0, {}));
  }
  assert.equal(historyBoundary(before, structuredClone(before), 0, {}), null);
});
// M7: with the action discard split in two, a draw from the face-down pile
// (or anything reaching the face-up pile) still commits earlier steps.
test("a face-down discard draw or a face-up pile change forms a history boundary", () => {
  const before = room().game;
  for (const mutate of [
    (s) => s.discardDown.shift(),
    (s) =>
      s.discardUp.push({
        card: s.discardDown.pop(),
        player: 0,
        mode: "lead",
        round: 1,
      }),
  ]) {
    const after = structuredClone(before);
    mutate(after);
    assert.match(historyBoundary(before, after, 0, {}), /A deck changed/);
  }
});
test("clock never resets per action/undo; handoffs charge the responder; next card turn resets", () => {
  const r = room();
  initClock(r, 1000);
  settleClock(r, 11000);
  choose(r, "play");
  followClock(r, 11000);
  assert.equal(clockView(r, 21000).remainingMs, 280000);
  settleClock(r, 21000);
  travelHistory(r, 0, "undo");
  followClock(r, 21000);
  assert.equal(clockView(r, 31000).remainingMs, 270000);
  settleClock(r, 31000);
  r.game.pending = [{ p: 1, type: "predictive" }];
  followClock(r, 31000);
  assert.equal(clockView(r, 41000).spent[0], 30000);
  assert.equal(clockView(r, 41000).spent[1], 10000);
  settleClock(r, 41000);
  r.game.pending = [];
  followClock(r, 41000);
  assert.equal(clockView(r, 51000).remainingMs, 260000);
  settleClock(r, 51000);
  r.game.current = 1;
  followClock(r, 51000);
  assert.equal(clockView(r, 51000).remainingMs, 300000);
  assert.deepEqual(clockView(r, 51000).total, [40000, 10000]);
});
test("pause/resume freezes all clocks; expiry stops at zero, extensions grant usable time, persisted time survives reload", () => {
  const r = room();
  r.options.timer.expiry = "pause";
  initClock(r, 0);
  changeClock(r, 0, { operation: "pause" }, 10000);
  assert.equal(clockView(r, 100000).remainingMs, 290000);
  assert.throws(() => assertClockOpen(r, 100000));
  changeClock(r, 0, { operation: "resume" }, 100000);
  assert.equal(clockView(r, 500000).remainingMs, 0);
  assert.throws(() => assertClockOpen(r, 500000));
  changeClock(r, 0, { operation: "extend", seconds: 60 }, 500000);
  assert.equal(clockView(r, 500000).remainingMs, 60000);
  // Each notice says whose clock it touches, so that player's tab can flash.
  assert.deepEqual(
    r.notices.map((x) => [x.at, x.p]),
    [
      [10000, r.clock.actor],
      [100000, r.clock.actor],
      [500000, r.clock.actor],
    ],
  );
  const loaded = JSON.parse(JSON.stringify(r));
  assert.equal(clockView(loaded, 510000).remainingMs, 50000);
  assert.throws(() => changeClock(r, 1, { operation: "pause" }, 510000));
});
test("overtime permits actions; timer inputs are validated; configure is explicit reset", () => {
  const r = room();
  initClock(r, 0);
  assert.equal(clockView(r, 400000).remainingMs, -100000);
  assert.doesNotThrow(() => assertClockOpen(r, 400000));
  for (const config of [
    null,
    { mode: "bad" },
    { mode: "live", turn: 59 },
    { mode: "async", turn: 604801 },
    { mode: "live", turn: NaN },
  ])
    assert.throws(() => validateTimer(config));
  changeClock(
    r,
    0,
    {
      operation: "configure",
      config: { mode: "async", turn: 3600, expiry: "pause" },
    },
    400000,
  );
  assert.equal(clockView(r, 400000).remainingMs, 3600000);
  assert.ok(r.notices.length);
  assert.equal(
    r.notices.at(-1).text,
    "Timer set to 1 hour per turn (async). Current allowance restarted.",
  );
});
test("every notice's `at` is later than the one before it, and the newest 20 are kept", () => {
  const r = room();
  initClock(r, 0);
  // Two changes in the same millisecond, then one with a clock that went back.
  changeClock(r, 0, { operation: "pause" }, 5000);
  changeClock(r, 0, { operation: "resume" }, 5000);
  changeClock(r, 0, { operation: "pause" }, 4000);
  assert.deepEqual(
    r.notices.map((x) => x.at),
    [5000, 5001, 5002],
  );
  for (let i = 0; i < 30; i++)
    changeClock(r, 0, { operation: i % 2 ? "pause" : "resume" }, 6000);
  assert.equal(r.notices.length, 20);
  const ats = r.notices.map((x) => x.at);
  assert.deepEqual(
    ats,
    [...ats].sort((a, b) => a - b),
  );
  assert.equal(new Set(ats).size, 20);
});
test("notices word durations in the unit a player would say", () => {
  const say = (seconds, config) => {
    const r = room();
    initClock(r, 0);
    changeClock(
      r,
      0,
      config
        ? { operation: "configure", config: { mode: "async", ...config } }
        : { operation: "extend", seconds },
      1000,
    );
    return r.notices.at(-1).text;
  };
  assert.match(say(30), /added 30 seconds to A/);
  assert.match(say(60), /added 1 minute to A/);
  assert.match(say(120), /added 2 minutes to A/);
  assert.match(say(3600), /added 1 hour to A/);
  assert.match(say(86400), /added 24 hours to A/);
  assert.match(say(0, { turn: 86400, expiry: "pause" }), /24 hours per turn/);
});
test("undo a completed build restores pieces, pools, pips and turn usage; redo restores all together", () => {
  const r = room();
  const card = decision(r.game, 0).choices.find(
    (c) => c.op === "play" && c.card.startsWith("construction-"),
  );
  assert.ok(card);
  applyDecision(r, 0, { choice: card.id });
  choose(r, "endPrelude");
  const start = structuredClone(r.game);
  const action = decision(r.game, 0).choices.find(
    (c) => c.op === "action" && c.action === "build" && c.cost === "pip",
  );
  assert.ok(action);
  applyDecision(r, 0, { choice: action.id });
  choose(r, "buildTarget");
  const built = structuredClone(r.game);
  assert.equal(built.turn.pips, start.turn.pips - 1);
  assert.equal(built.pieces.length, start.pieces.length + 1);
  travelHistory(r, 0, "undo");
  travelHistory(r, 0, "undo");
  assert.deepEqual(normalized(r.game), normalized(start));
  travelHistory(r, 0, "redo");
  travelHistory(r, 0, "redo");
  assert.deepEqual(normalized(r.game), normalized(built));
});

function movingRoom() {
  const r = room();
  const card = decision(r.game, 0).choices.find(
    (c) => c.op === "play" && /^(mobilization|aggression)-/.test(c.card),
  );
  applyDecision(r, 0, { choice: card.id });
  choose(r, "endPrelude");
  const c = decision(r.game, 0).choices.find(
    (c) => c.op === "action" && c.action === "move" && c.cost === "pip",
  );
  applyDecision(r, 0, { choice: c.id });
  choose(r, "moveFrom");
  return r;
}
test("one destination command selects and moves atomically, charges one pip, and undoes in one step", () => {
  const r = movingRoom(),
    before = structuredClone(r.game),
    cursor = r.history.cursor;
  const value = decision(r.game, 0).form.options.map((o) => o.id);
  const preview = transition(r.game, 0, { value });
  const destination = decision(preview, 0).choices[0].system;
  applyMovement(r, 0, { value, destination });
  assert.equal(r.history.cursor, cursor + 1);
  assert.equal(r.game.turn.pips, before.turn.pips - 1);
  for (const id of value)
    assert.equal(r.game.pieces.find((p) => p.id === id).system, destination);
  const moved = structuredClone(r.game);
  travelHistory(r, 0, "undo");
  assert.deepEqual(normalized(r.game), normalized(before));
  travelHistory(r, 0, "redo");
  assert.deepEqual(normalized(r.game), normalized(moved));
});
test("invalid destination, empty fleet, foreign pieces and wrong actor never partially mutate a move", () => {
  const r = movingRoom(),
    original = structuredClone(r),
    value = decision(r.game, 0).form.options.map((o) => o.id);
  const destination = decision(transition(r.game, 0, { value }), 0).choices[0]
    .system;
  for (const [actor, input] of [
    [0, { value, destination: "invalid" }],
    [0, { value: [], destination }],
    [0, { value: [r.game.pieces.find((p) => p.owner === 1).id], destination }],
    [1, { value, destination }],
  ]) {
    assert.throws(() => applyMovement(r, actor, input));
    assert.deepEqual(r, original);
  }
});
