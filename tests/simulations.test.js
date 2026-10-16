import test from "node:test";
import assert from "node:assert/strict";
import { createGame, transition } from "../game/engine.js";
import { autoInput, exploreInput } from "../game/autoplay.js";
import { assertDeepInvariants, assertRevealTracked } from "./invariants.js";
for (let seed = 1; seed <= 30; seed++)
  test(`seeded full game ${seed}: ${2 + (seed % 3)} players, ${seed % 2 === 0 ? "Leaders & Lore" : "base"}`, () => {
    let counter = seed * 9813;
    const random = () => {
      counter = (Math.imul(counter, 1664525) + 1013904223) >>> 0;
      return counter / 4294967296;
    };
    let s = createGame(
      ["A", "B", "C", "D"].slice(0, 2 + (seed % 3)),
      { leaders: seed % 2 === 0, doubleLore: seed % 4 === 0 },
      seed,
    );
    let steps = 0;
    while (s.phase !== "over" && steps++ < 8000) {
      const p = s.pending[0]?.p ?? s.current,
        before = s;
      s = transition(s, p, autoInput(s, random));
      assertDeepInvariants(s);
      assertRevealTracked(before, s);
    }
    assert.equal(s.phase, "over", `stuck after ${steps} decisions`);
    assert.ok(s.chapter <= 5);
    assert.ok(
      s.players[s.winner].power === Math.max(...s.players.map((p) => p.power)),
    );
  });
for (let seed = 1; seed <= 60; seed++)
  test(`explored full game ${seed}: ${2 + (seed % 3)} players, ${seed % 2 === 0 ? "Leaders & Lore" : "base"}`, () => {
    let counter = seed * 7919;
    const random = () => {
      counter = (Math.imul(counter, 1664525) + 1013904223) >>> 0;
      return counter / 4294967296;
    };
    let s = createGame(
      ["A", "B", "C", "D"].slice(0, 2 + (seed % 3)),
      { leaders: seed % 2 === 0, doubleLore: seed % 4 === 0 },
      seed,
    );
    assertDeepInvariants(s);
    let steps = 0;
    while (s.phase !== "over" && steps++ < 20000) {
      const p = s.pending[0]?.p ?? s.current,
        before = s;
      s = transition(s, p, exploreInput(s, random));
      assertDeepInvariants(s);
      assertRevealTracked(before, s);
    }
    assert.equal(s.phase, "over", `stuck after ${steps} decisions`);
  });
