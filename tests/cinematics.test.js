import test from "node:test";
import assert from "node:assert/strict";
import { createGame, viewFor } from "../game/engine.js";
import { cinematicPlan, scenePhase } from "../src/cinematicPlan.js";
import { frameCamera, boundedCamera } from "../src/cameraFraming.js";
import { CENTERS, slotCoords } from "../src/mapGeometry.js";
const fixture = () => viewFor(createGame(["A", "B"], { initiative: 0 }, 91), 0);
function mutate(fn) {
  const before = fixture(),
    after = structuredClone(before);
  after.revision++;
  fn(after, before);
  return { before, after, scene: cinematicPlan(before, after) };
}
test("roll scene retains exact dice without inventing destruction or revealing hands", () => {
  const { scene } = mutate((s) => {
    s.lastBattle = {
      attacker: 0,
      defender: 1,
      system: s.pieces[0].system,
      dice: [
        { type: "raid", faces: ["key"] },
        { type: "assault", faces: [] },
      ],
      revision: s.revision,
    };
  });
  assert.equal(scene.kind, "battle");
  assert.deepEqual(scene.dice, [
    { type: "raid", faces: ["key"] },
    { type: "assault", faces: [] },
  ]);
  assert.deepEqual(scene.outcomes, []);
  assert.ok(!JSON.stringify(scene).includes('"hand"'));
  assert.match(scenePhase(scene, 2), /assign hits/);
});
test("actual destruction identifies only the recorded piece and original sprite", () => {
  const { scene } = mutate((s, b) => {
    const p = b.pieces[0];
    s.pieces = s.pieces.filter((x) => x.id !== p.id);
    s.log.push({
      id: (b.log.at(-1)?.id ?? 0) + 1,
      text: "A ship is destroyed.",
      effect: {
        type: "destroy",
        piece: p.id,
        owner: p.owner,
        dealer: 1,
        system: p.system,
      },
    });
  });
  assert.equal(scene.kind, "destroy");
  assert.equal(scene.outcomes.length, 1);
  assert.equal(scene.target.id, scene.outcomes[0].piece);
  assert.equal(scene.duration, 2600);
});
test("movement includes only moved pieces, preserving origin and destination", () => {
  const { scene, before } = mutate((s) => {
    s.pieces[0].system = "6-gate";
  });
  assert.equal(scene.kind, "move");
  assert.equal(scene.from, before.pieces[0].system);
  assert.equal(scene.system, "6-gate");
  assert.equal(scene.pieces.length, 1);
});
test("construction and repair scenes use the resulting real piece", () => {
  const { scene } = mutate((s) => {
    s.pieces.push({
      id: "new",
      owner: 1,
      type: "starport",
      system: "6-gate",
      damaged: false,
    });
  });
  assert.equal(scene.kind, "build");
  assert.equal(scene.target.id, "new");
  assert.equal(scene.target.type, "starport");
  const before = fixture();
  before.pieces[0].damaged = true;
  const after = structuredClone(before);
  after.revision++;
  after.pieces[0].damaged = false;
  assert.equal(cinematicPlan(before, after).kind, "repair");
  assert.equal(cinematicPlan(before, after).target.damaged, false);
});
test("tax scenes require a recorded extraction and never invent a resource", () => {
  const { scene } = mutate((s, b) => {
    s.log.push({
      id: (b.log.at(-1)?.id ?? 0) + 1,
      text: "Taxes for no resource.",
      animation: {
        kind: "tax",
        system: s.pieces[0].system,
        piece: s.pieces[0].id,
        owner: 0,
        resource: null,
        gained: 0,
      },
    });
  });
  assert.equal(scene.kind, "tax");
  assert.equal(scene.resource, null);
  assert.equal(scene.cargoCount, 0);
});
test("initial snapshots, same revisions, replay and real undo do not launch cinematics", () => {
  const before = fixture();
  assert.equal(cinematicPlan(null, before), null);
  assert.equal(cinematicPlan(before, before), null);
  const after = structuredClone(before);
  after.revision++;
  after.pieces[0].system = "6-gate";
  after._replay = { animate: true, sequence: 2 };
  assert.equal(cinematicPlan(before, after), null);
  delete after._replay;
  after.log.push({ id: 9999, history: true, text: "Undo" });
  assert.equal(cinematicPlan(before, after), null);
});
test("scene planning does not mutate rules state", () => {
  const b = fixture(),
    a = structuredClone(b);
  a.revision++;
  a.pieces[0].system = "6-gate";
  const saved = JSON.stringify([b, a]);
  cinematicPlan(b, a);
  assert.equal(JSON.stringify([b, a]), saved);
});
test("camera frames full fleets and distant building slots within bounds at every system", () => {
  for (const id of Object.keys(CENTERS)) {
    const pieces = Array.from({ length: 15 }, (_, i) => ({
      id: i,
      type: "ship",
      system: id,
    }));
    const c = frameCamera([id], CENTERS, slotCoords, pieces, true);
    assert.ok(c.z >= 1 && c.z <= 4);
    for (const [x, y] of [CENTERS[id], ...(slotCoords[id] ?? [])]) {
      assert.ok(x >= c.x - 1264 / c.z && x <= c.x + 1264 / c.z, id);
      assert.ok(y >= c.y - 888 / c.z && y <= c.y + 888 / c.z, id);
    }
  }
  assert.equal(frameCamera(["not-a-system"], CENTERS, slotCoords), null);
});
test("wide camera includes both ends of long routes; limits prevent empty space", () => {
  const c = frameCamera(["1-crescent", "4-crescent"], CENTERS, slotCoords);
  assert.ok(c.z < 2);
  assert.deepEqual(boundedCamera({ x: -100, y: 99999, z: 0.1 }), {
    x: 1264,
    y: 888,
    z: 1,
  });
});

test("reconnect catch-up and chapter marker cleanup do not play misleading scenes", () => {
  const b = fixture(),
    a = structuredClone(b);
  a.revision += 8;
  a.pieces[0].system = "6-gate";
  assert.equal(cinematicPlan(b, a), null);
  const c = structuredClone(b);
  b.markers[0].ambition = "tycoon";
  c.revision++;
  assert.equal(cinematicPlan(b, c), null);
});

test("Court influence and securing with non-spatial log events do not crash or invent impacts", () => {
  const { scene } = mutate((s, b) => {
    s.court[0].agents[0]++;
    s.log.push({
      id: (b.log.at(-1)?.id ?? 0) + 1,
      text: "A influences the Court.",
    });
  });
  assert.equal(scene.kind, "influence");
  assert.ok(scene.card);
  assert.deepEqual(scene.outcomes, []);
  const secured = mutate((s, b) => {
    s.log.push({
      id: (b.log.at(-1)?.id ?? 0) + 1,
      text: "A secures a card.",
      animation: { kind: "secure", owner: 0, card: s.court[0].id },
    });
  }).scene;
  assert.equal(secured.kind, "secure");
  assert.deepEqual(secured.outcomes, []);
});
test("declarations and scoring tolerate ordinary public log entries", () => {
  for (const kind of ["ambition", "score"]) {
    const { scene } = mutate((s, b) => {
      if (kind === "ambition") s.markers[0].ambition = "tycoon";
      else s.players[1].power++;
      s.log.push({
        id: (b.log.at(-1)?.id ?? 0) + 1,
        text: "Public announcement",
      });
    });
    assert.equal(scene.kind, kind);
    assert.deepEqual(scene.outcomes, []);
    if (kind === "score") assert.equal(scene.owner, 1);
  }
});
