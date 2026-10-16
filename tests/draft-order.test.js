import test from "node:test";
import assert from "node:assert/strict";
import { draftOrder } from "../src/draftOrder.js";
import { createGame, viewFor, decision, transition } from "../game/engine.js";
const view = (s, p = s.current) => viewFor(s, p);
test("order starts right of the initiative holder, goes counterclockwise, initiative last", () => {
  for (const initiative of [0, 1, 2]) {
    const s = createGame(["A", "B", "C"], { leaders: true, initiative }, 3);
    const { chips, passes } = draftOrder(view(s));
    assert.equal(passes, 2);
    assert.equal(chips.length, 6);
    assert.deepEqual(
      chips.slice(0, 3).map((c) => c.seat),
      [(initiative + 2) % 3, (initiative + 1) % 3, initiative],
    );
    assert.deepEqual(
      chips.slice(3).map((c) => c.seat),
      chips.slice(0, 3).map((c) => c.seat),
    );
    assert.equal(chips[2].initiative, true);
    assert.equal(chips.filter((c) => c.initiative).length, 2);
  }
});
test("two lore each means three passes", () => {
  const s = createGame(
    ["A", "B", "C", "D"],
    { leaders: true, doubleLore: true, initiative: 1 },
    4,
  );
  assert.equal(draftOrder(view(s)).chips.length, 12);
});
test("the strip follows the engine through a whole draft", () => {
  for (const [names, opts, seed] of [
    [["A", "B"], { leaders: true, initiative: 1 }, 7],
    [["A", "B", "C"], { leaders: true, initiative: 2 }, 8],
    [
      ["A", "B", "C", "D"],
      { leaders: true, doubleLore: true, initiative: 3 },
      9,
    ],
  ]) {
    let s = createGame(names, opts, seed),
      picks = 0;
    while (s.phase === "draft") {
      const v = view(s),
        order = draftOrder(v);
      assert.equal(order.made, picks);
      assert.equal(order.current, s.current, `pick ${picks}`);
      assert.equal(order.chips.filter((c) => c.state === "current").length, 1);
      assert.equal(order.chips.filter((c) => c.state === "done").length, picks);
      // done chips name what that seat actually took, in order
      order.chips
        .filter((c) => c.state === "done")
        .forEach((c) => assert.ok(c.card, `chip ${c.index} has its card`));
      const d = decision(s, s.current);
      // alternate leader-first and lore-first so both orders are exercised
      const choice = (picks % 2 ? [...d.choices].reverse() : d.choices)[0];
      s = transition(s, s.current, { choice: choice.id });
      picks++;
    }
    assert.equal(picks, names.length * (opts.doubleLore ? 3 : 2));
  }
});
test("a done chip shows the card taken at that pick, even lore before leader", () => {
  let s = createGame(["A", "B"], { leaders: true, initiative: 0 }, 5);
  const seat = s.current;
  const loreId = s.draft.lore.find((id) => id.startsWith("L"));
  const pick = decision(s, seat).choices.find((c) => c.card === loreId);
  s = transition(s, seat, { choice: pick.id });
  const { chips } = draftOrder(view(s));
  assert.equal(chips[0].card, loreId);
  assert.equal(chips[0].kind, "lore");
  assert.equal(chips[0].state, "done");
  assert.equal(chips[1].state, "current");
  assert.equal(chips[2].state, "next");
});
test("an Archivist chip carries the note flag and the strip names no private cards", () => {
  let s = createGame(["A", "B"], { leaders: true, initiative: 0 }, 11);
  s.draft.leaders[0] = "LEAD09";
  const seat = s.current;
  const pick = decision(s, seat).choices.find((c) => c.card === "LEAD09");
  s = transition(s, seat, { choice: pick.id });
  const { chips } = draftOrder(view(s));
  assert.equal(chips[0].archivist, true);
  assert.equal(chips.filter((c) => c.archivist).length, 1);
  assert.ok(Object.keys(chips[0]).every((k) => k !== "choices"));
});
