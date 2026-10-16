import test from "node:test";
import assert from "node:assert/strict";
import { createGame, decision, transition, viewFor } from "../game/engine.js";
import { migrateRoom } from "../server/migrate.js";
import { clockView, initClock, validateTimer } from "../server/clock.js";
import { applyDecision, travelHistory } from "../server/history.js";

function legacy(game) {
  const s = structuredClone(game);
  s.discard = [...s.discardDown, ...s.discardUp.map((x) => x.card)];
  delete s.discardDown;
  delete s.discardUp;
  delete s.battles;
  if (s.turn) {
    s.turn.declared = s.turn.leadDeclared;
    delete s.turn.leadDeclared;
    delete s.turn.revealed;
  }
  return s;
}
function table() {
  let game = createGame(["Host", "Guest"], { initiative: 0 }, 37);
  while (game.pending.length) {
    const p = game.pending[0].p;
    game = transition(game, p, {
      choice: decision(game, p).choices.find((c) => c.op === "skip").id,
    });
  }
  return { game, seats: [{ name: "Host" }, { name: "Guest" }], options: {} };
}
test("legacy tables retain private discard order, hands, board, RNG and revisions", () => {
  const r = table();
  r.game = legacy(r.game);
  const old = structuredClone(r.game);
  migrateRoom(r);
  assert.deepEqual(r.game.discardDown, old.discard);
  assert.deepEqual(r.game.discardUp, []);
  for (const key of [
    "players",
    "pieces",
    "rng",
    "current",
    "initiative",
    "revision",
    "log",
    "courtDeck",
  ])
    assert.deepEqual(r.game[key], old[key], key);
  const v = viewFor(r.game, 0);
  assert.equal(v.players[1].hand, old.players[1].hand.length);
  assert.equal(v.discardDownCount, old.discard.length);
  for (const field of ["discard", "discardDown", "courtDeck", "rng", "pending"])
    assert.equal(v[field], undefined);
  const again = structuredClone(r);
  migrateRoom(r);
  assert.deepEqual(r, again, "migration is idempotent");
});
test("legacy undo, redo and rollback snapshots are upgraded too", () => {
  const r = table();
  const play = decision(r.game, 0).choices.find((c) => c.op === "play");
  applyDecision(r, 0, { choice: play.id });
  r.game = legacy(r.game);
  for (const step of r.history.steps) {
    step.before = legacy(step.before);
    step.after = legacy(step.after);
  }
  migrateRoom(r);
  travelHistory(r, 0, "undo");
  assert.doesNotThrow(() => viewFor(r.game, 0));
  travelHistory(r, 0, "redo");
  assert.doesNotThrow(() => viewFor(r.game, 0));
  const nested = table();
  nested.game = legacy(nested.game);
  const snapshot = structuredClone(nested.game);
  const originalDiscard = [...snapshot.discard];
  nested.game.pending.push({ type: "action", p: 0, rollback: snapshot });
  migrateRoom(nested);
  assert.deepEqual(
    nested.game.pending[0].rollback.discardDown,
    originalDiscard,
  );
  assert.ok(Array.isArray(nested.game.pending[0].rollback.battles));
});
test("migration cannot reopen a used declaration or reveal window", () => {
  const r = table();
  applyDecision(r, 0, {
    choice: decision(r.game, 0).choices.find((c) => c.op === "play").id,
  });
  r.game = legacy(r.game);
  r.game.turn.declared = true;
  r.game.turn.acted = true;
  migrateRoom(r);
  assert.equal(r.game.turn.leadDeclared, true);
  assert.equal(r.game.turn.revealed, "legacy");
  assert.equal(
    decision(r.game, 0).choices.some((c) => c.op === "declare"),
    false,
  );
});
test("legacy clocks retain their limit, elapsed time, pause and expiry", () => {
  const r = table();
  r.options.timer = { mode: "live", seconds: 60, expiry: "auto" };
  r.clock = {
    config: { ...r.options.timer },
    key: "1:1:0",
    actor: 0,
    since: 1000,
    spent: [12000, 0],
    total: [12000, 0],
    bonus: [5000, 0],
    paused: false,
  };
  r.game = legacy(r.game);
  migrateRoom(r);
  initClock(r, 1000);
  assert.equal(r.clock.since, 1000);
  assert.equal(clockView(r, 21000).remainingMs, 33000);
  assert.equal(clockView(r, 55000).blocked, true);
  assert.equal(r.options.timer.turn, 60);
  r.clock.paused = true;
  assert.equal(clockView(r, 100000).remainingMs, 53000);
  assert.equal(clockView(r, 100000).paused, true);
  assert.deepEqual(
    validateTimer({ mode: "live", seconds: 60, expiry: "auto" }),
    { mode: "live", turn: 60, bank: 0, increment: 0, expiry: "auto" },
  );
});
test("new time banks and current-format game state are unchanged by migration", () => {
  const r = table();
  r.options.timer = {
    mode: "live",
    bank: 900,
    turn: 120,
    increment: 10,
    expiry: "pause",
  };
  initClock(r, 1000);
  const before = structuredClone(r);
  migrateRoom(r);
  delete r.saveVersion;
  assert.deepEqual(r, before);
});

test("legacy unpaid bonus prompts cannot retain the free-action cancellation exploit", () => {
  for (const [action, bonus] of [
    ["battle", "move"],
    ["secure", "influence"],
  ]) {
    const r = table();
    r.game = legacy(r.game);
    r.game.pending = [
      {
        type: "action",
        p: 0,
        action,
        cost: "pip",
        configured: true,
        standardOnly: true,
      },
      { type: "action", p: 0, action: bonus, cost: "free", configured: true },
    ];
    migrateRoom(r);
    assert.equal(r.game.pending.length, 1);
    assert.equal(r.game.pending[0].configured, false);
    assert.equal(r.game.pending[0].cost, "pip");
  }
});
test("an in-flight legacy declaration still consumes the turn declaration flag", () => {
  const r = table();
  r.game = legacy(r.game);
  r.game.pending = [{ type: "generous", p: 0, ambition: "tycoon", zero: true }];
  migrateRoom(r);
  assert.equal(r.game.pending[0].lead, true);
});
