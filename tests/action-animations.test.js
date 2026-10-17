import test from "node:test";
import assert from "node:assert/strict";
import { createGame, transition, viewFor } from "../game/engine.js";
import { exploreInput } from "../game/autoplay.js";
import {
  actionChanges,
  animationTargets,
  isForwardUpdate,
} from "../src/actionAnimations.js";

const fixture = () => viewFor(createGame(["A", "B"], { initiative: 0 }, 91), 0);
function change(fn) {
  const before = fixture(),
    after = structuredClone(before);
  after.revision++;
  fn(after);
  return actionChanges(before, after);
}
test("map changes identify construction, repair, movement and removal", () => {
  const changes = change((s) => {
    s.pieces[0].system = "6-gate";
    s.pieces[1].damaged = true;
    s.pieces.push({
      id: "new-ship",
      owner: 1,
      type: "ship",
      system: "1-gate",
      damaged: false,
    });
    s.pieces.splice(3, 1);
  });
  for (const kind of ["move", "damage", "build", "remove"])
    assert.ok(
      changes.some((c) => c.kind === kind),
      kind,
    );
  const before = fixture();
  before.pieces[0].damaged = true;
  const after = structuredClone(before);
  after.revision++;
  after.pieces[0].damaged = false;
  assert.ok(actionChanges(before, after).some((c) => c.kind === "repair"));
});
test("resources, Court, captured pieces, cards, scoring and turn phases have visual targets", () => {
  const changes = change((s) => {
    s.players[0].resources.push("material");
    s.players[0].power++;
    s.players[0].cards.push("BC03");
    s.players[0].trophies.push({ id: "t1", owner: 1, type: "ship" });
    s.players[0].captives.push({ id: "c1", owner: 1, type: "agent" });
    s.court[0].agents[0]++;
    s.markers[0].ambition = "keeper";
    s.played.push({ player: 0, faceup: false, card: null });
    s.phase = "turn";
  });
  for (const kind of [
    "resource",
    "power",
    "cards",
    "trophies",
    "captives",
    "court",
    "ambition",
    "play",
    "turn",
  ]) {
    const c = changes.find((c) => c.kind === kind);
    assert.ok(c, kind);
    assert.ok(animationTargets(c).length, kind);
  }
});
test("private hand identities never become animation data", () => {
  const changes = change((s) => {
    s.players[0].hand = ["private-secret"];
  });
  assert.ok(changes.some((c) => c.kind === "hand"));
  assert.ok(!JSON.stringify(changes).includes("private-secret"));
  const before = fixture(),
    after = structuredClone(before);
  after.revision++;
  after.players[0].hand.reverse();
  assert.deepEqual(actionChanges(before, after), []);
});
test("duplicates, initial snapshots, backward revisions and history restores do not replay actions", () => {
  const before = fixture();
  assert.equal(isForwardUpdate(null, before), false);
  assert.equal(isForwardUpdate(before, before), false);
  const after = structuredClone(before);
  after.revision--;
  assert.deepEqual(actionChanges(before, after), []);
  after.revision = before.revision + 1;
  after.players[0].resources.push("fuel");
  after.log.push({
    id: 999,
    history: "undo",
    text: "A undid their previous decision.",
  });
  assert.deepEqual(actionChanges(before, after), []);
});
test("tax and dice effects use explicit public metadata, not log prose", () => {
  const changes = change((s) => {
    s.log.push({
      id: 1000,
      text: "translated text",
      animation: {
        kind: "tax",
        system: "1-arrow",
        owner: 0,
        resource: "material",
      },
    });
    s.lastBattle = { system: "1-arrow", dice: [] };
  });
  assert.ok(changes.some((c) => c.kind === "tax" && c.resource === "material"));
  assert.ok(changes.some((c) => c.kind === "battle" && c.system === "1-arrow"));
});
test("legal multiplayer transitions generate identical public animations for both seats", () => {
  let seed = 72;
  const rng = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const covered = new Set();
  for (let i = 0; i < 4; i++) {
    let state = createGame(["A", "B"], { leaders: i % 2 === 0 }, 50 + i);
    for (let n = 0; n < 240 && state.phase !== "over"; n++) {
      const next = transition(
        state,
        state.pending[0]?.p ?? state.current,
        exploreInput(state, rng),
      );
      const a = actionChanges(viewFor(state, 0), viewFor(next, 0));
      const b = actionChanges(viewFor(state, 1), viewFor(next, 1));
      assert.deepEqual(a, b);
      a.forEach((c) => covered.add(c.kind));
      state = next;
    }
  }
  for (const kind of ["build", "move", "court", "resource", "play", "turn"])
    assert.ok(covered.has(kind), kind);
});
