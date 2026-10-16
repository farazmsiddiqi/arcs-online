import test from "node:test";
import assert from "node:assert/strict";
import { createGame, transition, decision, viewFor } from "../game/engine.js";
import { timeoutInput } from "../game/timeout-policy.js";

function strategic(value) {
  if (Array.isArray(value)) return value.map(strategic);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          !["name", "text", "label", "title", "description"].includes(key),
      )
      .map(([key, nested]) => [key, strategic(nested)]),
  );
}
for (const leaders of [false, true]) {
  test(`player names confer no rules, deal, dice or timeout advantage (${leaders ? "Leaders & Lore" : "base"})`, () => {
    const names = ["Sohum", "Faraz", "Guest One", "Guest Two"];
    let a = createGame(names, { leaders, doubleLore: leaders }, 77031);
    let b = createGame(
      [...names].reverse(),
      { leaders, doubleLore: leaders },
      77031,
    );
    let steps = 0;
    while (a.phase !== "over" && steps++ < 5000) {
      const p = a.pending[0]?.p ?? a.current;
      assert.deepEqual(strategic(a), strategic(b));
      assert.deepEqual(strategic(decision(a, p)), strategic(decision(b, p)));
      assert.deepEqual(timeoutInput(a), timeoutInput(b));
      const input = timeoutInput(a);
      a = transition(a, p, input);
      b = transition(b, p, input);
    }
    assert.equal(a.phase, "over");
    assert.deepEqual(strategic(a), strategic(b));
  });
}
test("nonacting views cannot reveal draw order, private hands or a copied card", () => {
  let s = createGame(
    ["Host", "Sohum", "Third", "Fourth"],
    { initiative: 0 },
    411,
  );
  const play = (op, filter = () => true) => {
    const p = s.pending[0]?.p ?? s.current;
    const c = decision(s, p).choices.find((c) => c.op === op && filter(c));
    assert.ok(c, op);
    s = transition(s, p, { choice: c.id });
  };
  play("play");
  play("endPrelude");
  play("endTurn");
  play("play", (c) => c.mode === "copy");
  for (let p = 0; p < 4; p++) {
    const v = viewFor(s, p);
    for (let q = 0; q < 4; q++)
      assert.equal(Array.isArray(v.players[q].hand), p === q);
    for (const key of ["rng", "pending", "courtDeck", "discardDown", "held"])
      assert.equal(v[key], undefined);
    assert.equal(v.played.find((c) => c.player === 1).card, null);
    assert.equal(v.turn.card, undefined);
    if (p !== 1) {
      assert.deepEqual(v.decision.choices, []);
      assert.equal(v.decision.form, undefined);
    }
  }
});
