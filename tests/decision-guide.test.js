import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STATE_GUIDES,
  choiceObject,
  dicePreset,
  guideFor,
} from "../src/decisionGuide.js";
import { createGame, viewFor, decision, transition } from "../game/engine.js";
test("every explicit pending decision has an instruction and a next-step explanation", () => {
  const text = readFileSync(
    new URL("../game/engine.js", import.meta.url),
    "utf8",
  );
  const section = text.slice(
    text.indexOf("function taskDecision("),
    text.indexOf("function resolveTask("),
  );
  const kinds = [...section.matchAll(/case "([^"]+)":/g)].map((m) => m[1]);
  assert.equal(kinds.length, 44);
  for (const kind of kinds) {
    assert.equal(STATE_GUIDES[kind]?.length, 2, kind);
    assert.ok(
      STATE_GUIDES[kind].every((s) => s.length > 20),
      kind,
    );
  }
});
test("every dice preset respects minimum, pool size, type caps and Corsair restrictions", () => {
  for (let max = 2; max <= 19; max++)
    for (let raidMax = 0; raidMax <= 6; raidMax++)
      for (const corsair of [true, false])
        for (const min of [0, 2])
          for (const mode of ["skirmish", "assault", "raid"]) {
            const f = { max, raidMax, corsair, min },
              d = dicePreset(f, mode),
              n = d.skirmish + d.assault + d.raid;
            assert.ok(n >= min && n <= max);
            assert.ok(d.skirmish <= 6 && d.assault <= 6 && d.raid <= raidMax);
            if (corsair) assert.ok(d.assault <= d.skirmish);
          }
  assert.deepEqual(dicePreset({ max: 1, raidMax: 0 }), {
    skirmish: 1,
    assault: 0,
    raid: 0,
  });
  assert.deepEqual(dicePreset({ max: 0, raidMax: 0 }), {
    skirmish: 0,
    assault: 0,
    raid: 0,
  });
});
test("decision object presentation uses public structured fields without inferring unknown cards", () => {
  const game = {
    me: 0,
    players: [
      { resources: ["fuel"], trophies: [], captives: [] },
      { resources: ["relic"], name: "Rival" },
    ],
    pieces: [{ id: "s1", type: "ship", owner: 0 }],
    resourceKeys: [[3], [1]],
    decision: { context: { resource: "material" } },
  };
  assert.equal(
    choiceObject({ op: "discard", index: 0 }, game).resource,
    "fuel",
  );
  assert.equal(
    choiceObject({ op: "stealResource", defender: 1, index: 0, keys: 1 }, game)
      .resource,
    "relic",
  );
  assert.equal(choiceObject({ op: "interestGain" }, game).resource, "material");
  assert.equal(
    choiceObject({ op: "repairBonus", piece: "s1" }, game).kind,
    "piece",
  );
  assert.equal(choiceObject({ op: "effect", index: 0 }, game).kind, "sequence");
  assert.equal(
    choiceObject({ op: "union", target: "administration-5" }, game).kind,
    "card",
  );
  assert.equal(
    choiceObject({ op: "swapTake", card: "unknown-private-card" }, game).kind,
    "symbol",
  );
});
test("only acting seat receives ability decision context and private action-card choices", () => {
  let game = createGame(["A", "B", "C"], { initiative: 0 }, 3);
  game.pending = [{ type: "farseersSwap", p: 0, rival: 1 }];
  const owner = viewFor(game, 0),
    rival = viewFor(game, 2);
  assert.equal(owner.decision.context.kind, "farseersSwap");
  assert.equal(rival.decision.context, undefined);
  assert.deepEqual(rival.decision.choices, []);
  assert.equal(typeof rival.players[1].hand, "number");
  assert.ok(guideFor(owner)[0].includes("revealed"));
});
