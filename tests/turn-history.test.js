import test from "node:test";
import assert from "node:assert/strict";
import { groupTurns, drawLog, drawVia } from "../src/turnHistory.js";

const players = [
  { name: "Ana", color: "red" },
  { name: "Bo", color: "blue" },
];
const at = (chapter, round, player) => ({ chapter, round, player });

test("groups consecutive events by chapter, round and turn owner", () => {
  const log = [
    { id: 1, text: "old line" },
    { id: 2, text: "a", at: at(1, 1, 0) },
    { id: 3, text: "b", at: at(1, 1, 0) },
    { id: 4, text: "c", at: at(1, 1, 1) },
    { id: 5, text: "d", at: at(1, 2, 1) },
    { id: 6, text: "e", at: at(1, 2, 0) },
    { id: 7, text: "f", at: at(1, 2, 0) },
  ];
  const g = groupTurns({ players, log });
  assert.deepEqual(
    g.map((x) => [x.key, x.entries.map((e) => e.id)]),
    [
      ["earlier", [1]],
      ["1:1:0", [2, 3]],
      ["1:1:1", [4]],
      ["1:2:1", [5]],
      ["1:2:0", [6, 7]],
    ],
  );
  assert.equal(g[0].legacy, true);
  assert.equal(g[1].name, "Ana");
  assert.equal(g[2].color, "blue");
  assert.deepEqual(groupTurns({}), []);
});

test("an unbroken log is never trimmed: every entry lands in exactly one group", () => {
  const log = Array.from({ length: 500 }, (_, i) => ({
    id: i + 1,
    text: "x",
    at: at(1, 1 + Math.floor(i / 7), i % 2),
  }));
  const g = groupTurns({ players, log });
  assert.equal(
    g.reduce((n, x) => n + x.entries.length, 0),
    500,
  );
});

test("the draw log lists who drew how many and why, counts only", () => {
  const log = [
    { id: 1, text: "t" },
    {
      id: 2,
      text: "B draws 2 cards with Farseers.",
      at: at(1, 2, 1),
      draw: { player: 1, count: 2, via: "farseers", merged: true },
    },
    {
      id: 3,
      text: "x",
      at: at(1, 3, 0),
      draw: { player: 0, count: 1, via: "call", merged: false },
    },
  ];
  const d = drawLog({ players, log });
  assert.deepEqual(d, [
    {
      eventId: 2,
      chapter: 1,
      round: 2,
      player: 1,
      playerName: "Bo",
      count: 2,
      via: "farseers",
      viaLabel: "Farseers",
      merged: true,
    },
    {
      eventId: 3,
      chapter: 1,
      round: 3,
      player: 0,
      playerName: "Ana",
      count: 1,
      via: "call",
      viaLabel: "Call to Action",
      merged: false,
    },
  ]);
  assert.equal(drawVia("?"), "Draw");
  assert.deepEqual(drawLog({}), []);
});

test("a played game's log groups cleanly into turns and never loses an entry", async () => {
  const { createGame, transition, viewFor } = await import("../game/engine.js");
  const { autoInput } = await import("../game/autoplay.js");
  let seed = 4242;
  const rng = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let s = createGame(["A", "B", "C"], {}, 7);
  for (let n = 0; n < 10000 && s.phase !== "over"; n++)
    s = transition(s, s.pending[0]?.p ?? s.current, autoInput(s, rng));
  assert.equal(s.phase, "over");
  const v = viewFor(s, 0);
  assert.equal(v.log.length, s.log.length);
  assert.ok(v.log.length > 150, "the full log is sent");
  const groups = groupTurns(v);
  assert.equal(
    groups.reduce((n, g) => n + g.entries.length, 0),
    v.log.length,
  );
  assert.ok(groups.every((g) => !g.legacy && g.name));
  assert.ok(groups.every((g, i) => i === 0 || g.key !== groups[i - 1].key));
  for (const d of drawLog(v)) assert.ok(d.count >= 1 && d.round >= 1);
});
