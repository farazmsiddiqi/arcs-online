import test from "node:test";
import assert from "node:assert/strict";
import { MAP } from "../game/data.js";
import {
  worldScenery,
  quietEncounter,
  REACH_STARS,
  WORLD_PALETTES,
} from "../src/boardAtmosphere.js";

test("atmosphere follows every legal active-cluster combination without decorating excluded worlds", () => {
  for (let mask = 0; mask < 64; mask++) {
    const clusters = Array.from({ length: 6 }, (_, i) => i + 1).filter(
      (i) => mask & (1 << (i - 1)),
    );
    const worlds = worldScenery(clusters);
    assert.deepEqual(
      worlds.map((w) => w.id),
      Object.values(MAP)
        .filter((s) => clusters.includes(s.cluster))
        .map((s) => s.id),
    );
    for (const world of worlds) {
      assert.ok(Number.isFinite(world.x) && Number.isFinite(world.y));
      assert.ok(
        world.color && Object.values(WORLD_PALETTES).includes(world.color),
      );
    }
  }
});
test("resource overrides change scenery without mutating setup or game data", () => {
  const clusters = Object.freeze([2, 3, 5, 6]);
  const overrides = Object.freeze({ "2-arrow": "relic" });
  const before = JSON.stringify(MAP);
  const world = worldScenery(clusters, overrides).find(
    (w) => w.id === "2-arrow",
  );
  assert.equal(world.kind, "relic");
  assert.equal(world.color, WORLD_PALETTES.relic);
  assert.equal(JSON.stringify(MAP), before);
});
test("decorative encounters stay in active worlds and never require randomness from the rules engine", () => {
  const worlds = worldScenery([2, 3, 5, 6]);
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const encounter = quietEncounter(worlds, i);
    assert.deepEqual(encounter, quietEncounter(worlds, i));
    assert.ok(worlds.includes(encounter.world));
    seen.add(encounter.kind);
  }
  assert.equal(seen.size, 3);
  assert.equal(quietEncounter([], 0), null);
});
test("background stars have a fixed small budget and remain inside the board", () => {
  assert.ok(REACH_STARS.length <= 32);
  for (const star of REACH_STARS) {
    assert.ok(star.x >= 0 && star.x <= 2528 && star.y >= 0 && star.y <= 1776);
    assert.ok(star.radius > 0 && star.radius <= 3);
  }
});
