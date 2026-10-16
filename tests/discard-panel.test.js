import test from "node:test";
import assert from "node:assert/strict";
import { discardPanelModel, modeLabel } from "../src/discardPanel.js";

const players = [
  { name: "Ana", color: "red" },
  { name: "Bo", color: "blue" },
];

test("groups face-up cards by round with player and mode", () => {
  const m = discardPanelModel({
    players,
    discardDownCount: 5,
    discardUp: [
      {
        round: 1,
        cards: [
          { card: "a1", player: 0, mode: "lead" },
          { card: "a2", player: 1, mode: "surpass" },
        ],
      },
      { round: 2, cards: [{ card: "a3", player: 1, mode: "pivot" }] },
    ],
  });
  assert.equal(m.faceUpCount, 3);
  assert.equal(m.faceDownCount, 5);
  assert.equal(m.total, 8);
  assert.deepEqual(
    m.rounds.map((r) => r.round),
    [1, 2],
  );
  assert.equal(m.rounds[0].cards[1].playerName, "Bo");
  assert.equal(m.rounds[0].cards[1].modeLabel, "Surpassed");
  assert.equal(m.rounds[1].cards[0].color, "blue");
});

test("old or empty states are safe and expose no face-down data", () => {
  const m = discardPanelModel({ players });
  assert.deepEqual(m, {
    rounds: [],
    faceUpCount: 0,
    faceDownCount: 0,
    total: 0,
    merge: null,
    draws: [],
  });
  assert.deepEqual(Object.keys(discardPanelModel({ discardDown: ["x"] })), [
    "rounds",
    "faceUpCount",
    "faceDownCount",
    "total",
    "merge",
    "draws",
  ]);
  assert.equal(modeLabel("weird"), "Played");
});

test("the last merge of the current chapter is listed by round; older chapters are ignored", () => {
  const entry = (id, chapter, cards) => ({
    id,
    text: "short",
    merge: { chapter, round: 3, cards },
  });
  const game = {
    players,
    chapter: 2,
    log: [
      entry(4, 1, [{ card: "old", player: 0, mode: "lead", round: 1 }]),
      entry(9, 2, [{ card: "x", player: 0, mode: "lead", round: 1 }]),
      { id: 10, text: "other" },
      entry(12, 2, [
        { card: "y", player: 1, mode: "surpass", round: 1 },
        { card: "z", player: 0, mode: "pivot", round: 2 },
      ]),
    ],
  };
  const merge = discardPanelModel(game).merge;
  assert.equal(merge.eventId, 12);
  assert.equal(merge.count, 2);
  assert.deepEqual(
    merge.rounds.map((r) => [r.round, r.cards.map((c) => c.card)]),
    [
      [1, ["y"]],
      [2, ["z"]],
    ],
  );
  assert.equal(merge.rounds[0].cards[0].playerName, "Bo");
  assert.equal(discardPanelModel({ ...game, chapter: 3 }).merge, null);
});
