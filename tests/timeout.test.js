import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  createGame,
  decision,
  transition,
  assertInvariants,
} from "../game/engine.js";
import { timeoutInput } from "../game/timeout-policy.js";
import { resolveTimeout } from "../server/timeout.js";
import {
  initClock,
  clockView,
  changeClock,
  followClock,
  assertClockOpen,
  validateTimer,
} from "../server/clock.js";
import { historyView } from "../server/history.js";
const fixtures = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/ux-states.json.gz", import.meta.url)),
  ),
);
function room(game = fixtures.card.raw) {
  const r = {
    game: structuredClone(game),
    seats: game.players.map((p) => ({ name: p.name })),
    options: { timer: { mode: "live", turn: 60, expiry: "auto" } },
  };
  initClock(r, 0);
  return r;
}
test("AI expiry is the default for new timers; explicit alternatives stay intact", () => {
  assert.equal(validateTimer({ mode: "live" }).expiry, "auto");
  for (const expiry of ["pause", "overtime"])
    assert.equal(validateTimer({ mode: "live", expiry }).expiry, expiry);
});
test("timeout finishes only this card turn, commits history, logs AI and gives the next actor a full allowance", () => {
  const r = room(),
    key = r.clock.key,
    p = r.clock.actor;
  assert.equal(resolveTimeout(r, 59999), null);
  assert.throws(() => assertClockOpen(r, 60000), /AI/);
  let steps = 0;
  while (r.clock.key === key && r.clock.actor === p && steps++ < 100)
    assert.ok(resolveTimeout(r, 60000));
  assert.ok(steps < 100);
  assert.equal(resolveTimeout(r, 60000), null);
  assert.equal(clockView(r, 60000).remainingMs, 60000);
  assert.equal(historyView(r, p).canUndo, false);
  assert.ok(r.game.log.some((x) => x.automatic));
  assert.equal(
    r.notices.filter((x) => x.text.includes("timer expired")).length,
    1,
  );
  // The takeover notice names the seat whose clock expired.
  assert.equal(r.notices.find((x) => x.text.includes("timer expired")).p, p);
});
test("off, overtime, pause-on-expiry, manual pause and host extensions never trigger automatic moves", () => {
  for (const patch of [
    { mode: "off" },
    { expiry: "overtime" },
    { expiry: "pause" },
  ]) {
    const r = room();
    Object.assign(r.clock.config, patch);
    const before = structuredClone(r);
    assert.equal(resolveTimeout(r, 100000), null);
    assert.deepEqual(r, before);
  }
  const r = room();
  changeClock(r, 0, { operation: "pause" }, 60000);
  assert.equal(resolveTimeout(r, 200000), null);
  changeClock(r, 0, { operation: "extend", seconds: 60 }, 200000);
  changeClock(r, 0, { operation: "resume" }, 200000);
  assert.equal(resolveTimeout(r, 259999), null);
  assert.ok(resolveTimeout(r, 260000));
});
test("a timed-out responder resolves their response without using the turn owner's clock", () => {
  const game = structuredClone(fixtures.hits.raw),
    response = game.pending[0].p;
  // Isolate a valid casualty response during a rival's card turn.
  game.current = (response + 1) % game.players.length;
  game.pending = [game.pending[0]];
  const r = room(game),
    owner = game.current;
  let steps = 0;
  while (r.clock.actor === response && steps++ < 30)
    assert.ok(resolveTimeout(r, 60000));
  assert.ok(steps < 30);
  assert.equal(r.clock.actor, owner);
  assert.equal(clockView(r, 60000).remainingMs, 60000);
  assert.equal(resolveTimeout(r, 60000), null);
  // When the original timed-out player receives another response in the same
  // card turn, their spent allowance persists; it is not reset by the handoff.
  r.game.pending = [{ type: "arrangeResources", p: response }];
  followClock(r, 60000);
  assert.ok(resolveTimeout(JSON.parse(JSON.stringify(r)), 60000));
});
test("timeout policy can resolve every saved UX decision through the authoritative engine", () => {
  for (const [name, fixture] of Object.entries(fixtures)) {
    const s = fixture.raw;
    if (s.phase === "over") continue;
    const p = s.pending[0]?.p ?? s.current;
    assert.doesNotThrow(
      () => assertInvariants(transition(s, p, timeoutInput(s))),
      name,
    );
  }
});
test("timeout preserves unspent Prelude resources and selects safe dice", () => {
  const prelude = fixtures.preludeRoot.raw;
  assert.equal(
    decision(prelude, prelude.current).choices[timeoutInput(prelude).choice].op,
    "endPrelude",
  );
  const dice = timeoutInput(fixtures.dice.raw).value;
  assert.equal(dice.assault, 0);
  assert.equal(dice.raid, 0);
  assert.ok(dice.skirmish > 0);
});
for (let seed = 1; seed <= 12; seed++)
  test(`automatic full game ${seed}: rules-valid and bounded`, () => {
    let s = createGame(
      ["A", "B", "C", "D"].slice(0, 2 + (seed % 3)),
      { leaders: seed % 2 === 0, doubleLore: seed % 4 === 0 },
      seed,
    );
    let count = 0;
    while (s.phase !== "over" && count++ < 5000) {
      const p = s.pending[0]?.p ?? s.current,
        input = timeoutInput(s);
      assert.ok(
        !s.turn?.revealed ||
          decision(s, p).choices[input.choice]?.op !== "declare",
        "the timeout policy declared after a reveal",
      );
      s = transition(s, p, input);
    }
    assert.equal(s.phase, "over", `failed after ${count} decisions`);
  });
