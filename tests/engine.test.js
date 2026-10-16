import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  log,
  decision,
  transition as engineTransition,
  viewFor,
  control,
  pool,
  capacity,
  resourceKeysFor,
  place,
  ambitionValues,
  scoreAmbition,
} from "../game/engine.js";
import {
  AMBITIONS,
  CARDS,
  ACTION_CARDS,
  DICE,
  MAP,
  SETUPS,
  LEADER_SETUP,
  RESOURCES,
  adjacent,
} from "../game/data.js";
import { timeoutInput } from "../game/timeout-policy.js";
import { exploreInput } from "../game/autoplay.js";
import { assertDeepInvariants } from "./invariants.js";
// Every move any test makes must leave a state that passes the deep checks.
const transition = (s, p, input) => {
  const next = engineTransition(s, p, input);
  assertDeepInvariants(next);
  return next;
};
function settle(s) {
  let n = 0;
  while (s.pending[0]?.type === "arrangeResources" && n++ < 20) {
    const p = s.pending[0].p;
    s = transition(s, p, {
      choice: decision(s, p).choices.find((c) => c.op === "skip").id,
    });
  }
  return s;
}
function fixture() {
  let s = settle(
    createGame(
      ["A", "B", "C", "D"],
      { initiative: 0, setupId: "4SETUP01" },
      37,
    ),
  );
  s.phase = "turn";
  s.turn = {
    card: s.players[0].hand[0],
    suit: "administration",
    pips: 4,
    mode: "lead",
    prelude: true,
    acted: false,
    revealed: false,
    leadDeclared: false,
    taxed: [],
    built: [],
    used: [],
    weapons: false,
  };
  s.current = 0;
  s.lead = { ...ACTION_CARDS["administration-2"], rank: 2, player: 0 };
  return s;
}
// Unlike fixture(), reaches later states only through real plays. The opening
// deal may be arranged, by swapping cards so each stays in exactly one place.
function table(hands = {}, players = 4) {
  const s = settle(
    createGame(
      ["A", "B", "C", "D"].slice(0, players),
      { initiative: 0, setupId: `${players}SETUP01` },
      37,
    ),
  );
  for (const [p, cards] of Object.entries(hands))
    for (const card of cards) {
      const mine = s.players[p].hand;
      if (mine.includes(card)) continue;
      const spare = mine.find((c) => !cards.includes(c)),
        from =
          s.players.find((pl) => pl.hand.includes(card))?.hand ?? s.discardDown;
      from[from.indexOf(card)] = spare;
      mine[mine.indexOf(spare)] = card;
    }
  assertDeepInvariants(s);
  return s;
}
const play = (s, card, mode) =>
  choose(s, "play", (c) => c.card === card && c.mode === mode);
const endTurn = (s) => choose(s, "endTurn");
const copyAndEnd = (s) =>
  endTurn(play(s, s.players[s.current].hand[0], "copy"));
function passChapter(s) {
  const chapter = s.chapter;
  while (s.chapter === chapter && s.phase !== "over") s = choose(s, "pass");
  return s;
}
function choose(s, op, filter = () => true, p = s.pending[0]?.p ?? s.current) {
  const d = decision(s, p),
    c = d.choices.find((c) => c.op === op && filter(c));
  assert.ok(c, `Missing ${op}: ${d.title} ${JSON.stringify(d.choices)}`);
  return settle(transition(s, p, { choice: c.id }));
}
function form(s, value, p = s.pending[0]?.p ?? s.current) {
  return settle(transition(s, p, { value }));
}
function task(s, t) {
  s.pending = [{ p: 0, ...t }];
  return s;
}
function own(s, id, p = 0) {
  for (const pl of s.players) pl.cards = pl.cards.filter((c) => c !== id);
  s.courtDeck = s.courtDeck.filter((c) => c !== id);
  s.courtDiscard = s.courtDiscard.filter((c) => c !== id);
  for (const lane of s.court) if (lane.id === id) lane.id = null;
  s.players[p].cards.push(id);
  return s;
}
function resources(s, p, rs) {
  for (const r of s.players[p].resources) if (r) s.supply[r]++;
  s.players[p].resources = Array(capacity(s, p)).fill(null);
  s.players[p].cardSlot = s.players[p].cards.includes("L13");
  rs.forEach((r, i) => {
    assert.ok(s.supply[r] > 0);
    s.supply[r]--;
    s.players[p].resources[i] = r;
  });
  return s;
}
function clear(s) {
  s.pieces = [];
  for (const p of s.players) resources(s, p.id, []);
  return s;
}
function act(s, a, targetOp, pred = () => true, cost = "pip") {
  s = choose(s, "action", (c) => c.action === a && c.cost === cost);
  return choose(s, targetOp, pred);
}
function diceState() {
  let s = clear(fixture());
  const sys = "1-arrow";
  place(s, 0, "ship", sys, 3);
  place(s, 1, "ship", sys, 2);
  place(s, 1, "city", sys);
  return task(s, {
    type: "dice",
    system: sys,
    defender: 1,
    attackers: s.pieces.filter((x) => x.owner === 0).map((x) => x.id),
    allFresh: true,
  });
}

test("all official base/LL content and action cards are present", () => {
  const cs = Object.values(CARDS).filter((c) => c.product !== "blightedreach");
  assert.equal(cs.length, 87);
  assert.equal(cs.filter((c) => c.kind === "leader").length, 16);
  assert.equal(cs.filter((c) => c.kind === "lore").length, 28);
  assert.equal(cs.filter((c) => c.kind === "guild").length, 25);
  assert.equal(cs.filter((c) => c.kind === "vox").length, 6);
  assert.equal(Object.keys(ACTION_CARDS).length, 28);
  assert.equal(Object.keys(SETUPS).length, 12);
});
for (const [id, set] of Object.entries(SETUPS))
  test(`official setup ${id}: legal clusters, pieces, hands, finite supplies`, () => {
    const s = createGame(
      ["A", "B", "C", "D"].slice(0, set.players),
      { setupId: id, initiative: 0 },
      52,
    );
    assertDeepInvariants(s);
    assert.equal(s.court.length, set.players === 2 ? 3 : 4);
    for (const p of s.players) {
      assert.equal(p.hand.length, 6);
      assert.equal(
        s.pieces.filter((x) => x.owner === p.id && x.type === "ship").length,
        set.players === 2 ? 10 : 8,
      );
      assert.equal(pool(s, p.id, "city"), 4);
      assert.equal(pool(s, p.id, "starport"), 4);
    }
    if (set.players !== 4)
      assert.ok(
        s.players
          .flatMap((p) => p.hand)
          .every((c) => ![1, 7].includes(ACTION_CARDS[c].rank)),
      );
  });
// Read off the 16 leader cards (the image URLs in data/cards.json): the two
// resource tokens, then boxes A, B, C as ships, building (null: none).
const LEADER_CARDS = {
  LEAD01: ["relic", "material", 3, "city", 3, "starport", 2],
  LEAD02: ["psionic", "relic", 3, "city", 3, "starport", 2],
  LEAD03: ["fuel", "fuel", 3, "city", 3, "starport", 2],
  LEAD04: ["psionic", "material", 4, "city", 3, "starport", 2],
  LEAD05: ["material", "weapon", 4, "starport", 4, null, 2],
  LEAD06: ["weapon", "material", 3, "city", 3, "starport", 2],
  LEAD07: ["relic", "material", 3, "city", 3, "city", 3],
  LEAD08: ["psionic", "weapon", 3, "city", 3, "starport", 2],
  LEAD09: ["relic", "relic", 3, "city", 3, "city", 2],
  LEAD10: ["fuel", "material", 3, "city", 3, "starport", 2],
  LEAD11: ["fuel", "weapon", 4, "starport", 3, null, 2],
  LEAD12: ["psionic", "psionic", 3, "city", 3, "starport", 2],
  LEAD13: ["relic", "weapon", 4, null, 3, null, 2],
  LEAD14: ["relic", "material", 3, "city", 3, null, 3],
  LEAD15: ["fuel", "material", 3, "city", 4, "starport", 2],
  LEAD16: ["fuel", "weapon", 4, "starport", 3, null, 2],
};
test("leader setup data matches the printed cards", () => {
  assert.deepEqual(LEADER_SETUP, LEADER_CARDS);
});
for (const id of Object.keys(LEADER_SETUP))
  test(`${id} ${CARDS[id].name}: full draft, setup and supply conservation`, () => {
    let s = createGame(["A", "B", "C"], { leaders: true, initiative: 0 }, 29);
    s.draft.leaders = [
      id,
      ...Object.keys(LEADER_SETUP)
        .filter((x) => x !== id)
        .slice(0, 3),
    ];
    let n = 0;
    while (s.phase === "draft" && n++ < 20) {
      const p = s.current,
        d = decision(s, p);
      const c = d.choices.find((c) => c.card === id) ?? d.choices[0];
      s = transition(s, p, { choice: c.id });
    }
    s = settle(s);
    while (s.pending[0]?.type === "archivist") s = choose(s, "take");
    assertDeepInvariants(s);
    const pl = s.players.find((p) => p.leader === id);
    assert.ok(pl);
    assert.equal(pl.cards.length, id === "LEAD09" ? 3 : 1);
    if (id === "LEAD02") assert.deepEqual(pl.outrage, ["material", "fuel"]);
    if (id === "LEAD10") assert.deepEqual(pl.scrap, { ship: 2, agent: 3 });
    if (id === "LEAD13") assert.equal(pl.scrap.city, 2);
    if (id === "LEAD16") assert.deepEqual(pl.outrage, ["material"]);
    // Starting resources and pieces: the two tokens, then boxes A, B and C of
    // the leader card (ships plus the building, if any) at the setup card's
    // systems for this seat.
    const [r1, r2, a, aBuilding, b, bBuilding, c] = LEADER_SETUP[id],
      seat = (pl.id - s.initiative + 3) % 3,
      [sysA, sysB, ...sysC] = SETUPS[s.setupId].positions[seat],
      at = (system, type) =>
        s.pieces.filter(
          (x) => x.owner === pl.id && x.system === system && x.type === type,
        ).length;
    assert.deepEqual(pl.resources.filter(Boolean).sort(), [r1, r2].sort());
    assert.equal(at(sysA, "ship"), a);
    assert.equal(at(sysA, "city") + at(sysA, "starport"), aBuilding ? 1 : 0);
    assert.equal(at(sysA, aBuilding ?? "city"), aBuilding ? 1 : 0);
    assert.equal(at(sysB, "ship"), b);
    assert.equal(at(sysB, "city") + at(sysB, "starport"), bBuilding ? 1 : 0);
    assert.equal(at(sysB, bBuilding ?? "city"), bBuilding ? 1 : 0);
    for (const system of sysC) {
      assert.equal(at(system, "ship"), c);
      assert.equal(at(system, "city") + at(system, "starport"), 0);
    }
    assert.equal(
      s.pieces.filter((x) => x.owner === pl.id).length,
      a + (aBuilding ? 1 : 0) + b + (bBuilding ? 1 : 0) + c * sysC.length,
    );
  });
test("control counts fresh ships only and ties remove control", () => {
  let s = clear(fixture());
  place(s, 0, "ship", "1-gate", 2);
  place(s, 1, "ship", "1-gate", 1);
  assert.equal(control(s, "1-gate"), 0);
  s.pieces[0].damaged = true;
  assert.equal(control(s, "1-gate"), null);
  s.pieces[1].damaged = true;
  assert.equal(control(s, "1-gate"), 1);
});
test("every adjacency is reciprocal and excludes closed sectors", () => {
  for (const setup of Object.values(SETUPS))
    for (const id of Object.keys(MAP).filter((x) =>
      setup.clusters.includes(MAP[x].cluster),
    ))
      for (const next of adjacent(id, setup.clusters)) {
        assert.ok(setup.clusters.includes(MAP[next].cluster));
        assert.ok(adjacent(next, setup.clusters).includes(id), `${id}/${next}`);
      }
});
test("unavailable actions and wrong actors reject transactionally", () => {
  const s = fixture(),
    original = structuredClone(s);
  assert.throws(() => transition(s, 1, { choice: 0 }), /turn/);
  assert.throws(() => transition(s, 0, { choice: 99999 }), /available/);
  assert.deepEqual(s, original);
});
test("private views hide rival hands, face-down cards, deck order and RNG", () => {
  let s = fixture();
  s.played = [{ player: 1, card: "aggression-1", mode: "copy", faceup: false }];
  const v = viewFor(s, 0);
  assert.equal(typeof v.players[1].hand, "number");
  assert.equal(v.played[0].card, null);
  for (const key of ["rng", "courtDeck", "discard", "pending"])
    assert.equal(v[key], undefined);
  assert.equal(v.players[0].hand.length, 6);
});
test("copy, pivot and surpass obey suit and rank; pips match physical cards", () => {
  // Reached by real play: A leads Administration 2, then B responds.
  let s = table({
    0: ["administration-2"],
    1: ["administration-1", "administration-3", "aggression-4"],
  });
  s = endTurn(play(s, "administration-2", "lead"));
  const cs = decision(s, 1).choices;
  const offers = (card) => cs.filter((c) => c.card === card).map((c) => c.mode);
  assert.deepEqual(offers("administration-1"), ["copy"]);
  assert.deepEqual(offers("administration-3"), ["copy", "surpass"]);
  assert.deepEqual(offers("aggression-4"), ["copy", "pivot"]);
  const turn = (card, mode) => {
    const t = play(s, card, mode);
    assertDeepInvariants(t);
    return [t.turn.suit, t.turn.pips, t.played.at(-1).faceup];
  };
  // Copy: one action of the lead suit, played face down.
  assert.deepEqual(turn("aggression-4", "copy"), ["administration", 1, false]);
  // Surpass: every pip on the played card, lead suit.
  assert.deepEqual(turn("administration-3", "surpass"), [
    "administration",
    ACTION_CARDS["administration-3"].pips,
    true,
  ]);
  // Pivot: one action of the played card's own suit; the lead suit stays.
  assert.deepEqual(turn("aggression-4", "pivot"), ["aggression", 1, true]);
  assert.equal(play(s, "aggression-4", "pivot").lead.suit, "administration");
  assert.ok(ACTION_CARDS["aggression-4"].pips > 1);
});
test("declaring takes the highest marker, zeroes lead, can stack ambition", () => {
  let s = fixture();
  s.turn.card = "administration-2";
  s = choose(s, "declare");
  assert.equal(s.markers[2].ambition, "tycoon");
  assert.equal(s.lead.rank, 0);
  assert.ok(!decision(s, 0).choices.some((c) => c.op === "declare"));
});
test("BC18 Secret Order preserves lead rank on Keeper declaration", () => {
  let s = own(fixture(), "BC18");
  s.turn.card = "administration-5";
  s = choose(s, "declare");
  assert.equal(s.lead.rank, 2);
  assert.equal(s.markers[2].ambition, "keeper");
});
test("BC25 Galactic Bards allow Pivot declaration only before actions and once per round", () => {
  let s = own(fixture(), "BC25");
  s.turn.mode = "pivot";
  s.turn.card = "aggression-4";
  assert.ok(decision(s, 0).choices.some((c) => c.op === "declare"));
  s.roundDeclared = true;
  assert.ok(!decision(s, 0).choices.some((c) => c.op === "declare"));
});
test("resource Prelude is held outside supply, then returned at first pip", () => {
  let s = resources(fixture(), 0, ["material"]);
  const supply = s.supply.material;
  s = choose(s, "action", (c) => c.action === "build" && c.cost === 0);
  s = choose(s, "buildTarget", (c) => c.kind === "ship");
  assert.equal(s.supply.material, supply);
  assert.deepEqual(s.held, ["material"]);
  s = act(
    s,
    "tax",
    "taxTarget",
    (c) => s.pieces.find((x) => x.id === c.piece)?.owner === 0,
  );
  assert.equal(s.held.length, 0);
  assert.equal(s.turn.prelude, false);
  assert.ok(!decision(s, 0).choices.some((c) => typeof c.cost === "number"));
});
for (const [id, r, a] of [
  ["BC01", "material", "build"],
  ["BC07", "fuel", "move"],
  ["BC15", "weapon", "weapons"],
  ["BC19", "psionic", "tax"],
  ["BC21", "relic", "secure"],
])
  test(`${id} converts another resource and ignores its Outrage`, () => {
    let s = resources(own(fixture(), id), 0, ["relic"]);
    s.players[0].outrage = [r];
    if (a === "secure") s.court[0].agents[0] = 1;
    assert.ok(
      decision(s, 0).choices.some(
        (c) => c.cost === 0 && (c.action === a || c.op === a),
      ),
    );
  });
test("tax city once per turn, capture only rival supply agents", () => {
  let s = clear(fixture());
  place(s, 0, "ship", "1-arrow", 2);
  const id = place(s, 1, "city", "1-arrow")[0];
  s = act(s, "tax", "taxTarget", (c) => c.piece === id);
  assert.equal(s.players[0].captives.length, 1);
  assert.ok(
    !decision(s, 0).choices.some((c) => c.action === "tax" && c.cost === "pip"),
  );
  // With the Weapon supply empty the tax gains nothing, but still captures
  // (rulebook p.12, "even if you didn't gain the resource").
  s = clear(fixture());
  place(s, 0, "ship", "1-arrow", 2);
  const city = place(s, 1, "city", "1-arrow")[0];
  resources(s, 1, ["weapon", "weapon"]);
  resources(s, 2, ["weapon", "weapon"]);
  resources(s, 3, ["weapon"]);
  assert.equal(s.supply.weapon, 0);
  s = act(s, "tax", "taxTarget", (c) => c.piece === city);
  assert.deepEqual(s.players[0].resources.filter(Boolean), []);
  assert.deepEqual(held(s.players[0], "captives"), [[1, "agent"]]);
  assertDeepInvariants(s);
});
test("build damaged under rival control; one ship build per starport", () => {
  let s = clear(fixture());
  place(s, 1, "ship", "1-arrow");
  const port = place(s, 0, "starport", "1-arrow")[0];
  s.turn.suit = "construction";
  s = act(s, "build", "buildTarget", (c) => c.port === port);
  assert.equal(
    s.pieces.find((x) => x.owner === 0 && x.type === "ship").damaged,
    true,
  );
  s = choose(s, "action", (c) => c.action === "build");
  assert.ok(!decision(s, 0).choices.some((c) => c.port === port));
});
test("secure needs strict influence majority and captures rival agents", () => {
  let s = fixture();
  s.turn.suit = "aggression";
  s.court[0].agents = [2, 1, 0, 0];
  const id = s.court[0].id;
  s = act(s, "secure", "secureTarget", (c) => c.index === 0);
  assert.ok(s.players[0].cards.includes(id) || CARDS[id].kind === "vox");
  assert.equal(s.players[0].captives.length, 1);
  assert.equal(s.court[0].agents[0], 0);
});
test("ambition scoring handles first ties, second ties, zero, neutral", () => {
  let s = fixture();
  s.markers[2].ambition = "warlord";
  s.players.forEach(
    (p, i) =>
      (p.trophies = Array([3, 3, 1, 0][i]).fill({ owner: 2, type: "ship" })),
  );
  assert.deepEqual(scoreAmbition(s, "warlord"), [3, 3, 0, 0]);
  s.players[0].trophies.push({ owner: 2, type: "ship" });
  s.players[2].trophies.push(
    { owner: 2, type: "ship" },
    { owner: 2, type: "ship" },
  );
  assert.deepEqual(scoreAmbition(s, "warlord"), [5, 0, 0, 0]);
});
for (const [leader, a] of [
  ["LEAD01", "tyrant"],
  ["LEAD06", "empath"],
  ["LEAD09", "tycoon"],
])
  test(`${leader} scoring penalty`, () => {
    // Card text: no Power for second place, second-place Power for first
    // place, and no bonus city Power. The 5/3 marker is on the ambition.
    const score = (values) => {
      const s = table();
      s.players[0].leader = leader;
      // A has built every city, so a normal first place would add 5.
      for (const system of [
        "4-arrow",
        "4-crescent",
        "6-crescent",
        "1-crescent",
      ])
        place(s, 0, "city", system);
      s.markers[2].ambition = a;
      values.forEach((n, p) => {
        resources(
          s,
          p,
          a === "tyrant"
            ? []
            : Array(n).fill(a === "empath" ? "psionic" : "material"),
        );
        s.players[p].captives =
          a === "tyrant"
            ? Array.from({ length: n }, (_, i) => ({
                id: `c${p}-${i}`,
                owner: (p + 1) % 4,
                type: "agent",
              }))
            : [];
      });
      assertDeepInvariants(s);
      return scoreAmbition(s, a);
    };
    // First: the low value only, no city bonus; B is still second.
    assert.deepEqual(score([2, 1, 0, 0]), [3, 3, 0, 0]);
    // Tied for first is second place for both: A gains nothing.
    assert.deepEqual(score([1, 1, 0, 0]), [0, 3, 0, 0]);
    // Second place: nothing.
    assert.deepEqual(score([1, 2, 0, 0]), [0, 5, 0, 0]);
  });
test("LEAD12 Noble receives no tied first Power", () => {
  let s = fixture();
  s.players[0].leader = "LEAD12";
  s.markers[2].ambition = "warlord";
  s.players[0].trophies = [{ owner: 1, type: "ship" }];
  s.players[1].trophies = [{ owner: 2, type: "ship" }];
  assert.equal(scoreAmbition(s, "warlord")[0], 0);
});
for (const [id, r] of [
  ["BC03", "material"],
  ["BC06", "fuel"],
])
  test(`${id} cartel supply counts toward Tycoon`, () => {
    let s = own(fixture(), id);
    const without = structuredClone(s);
    without.players[0].cards = [];
    assert.equal(
      ambitionValues(s, "tycoon")[0] - ambitionValues(without, "tycoon")[0],
      1 + s.supply[r],
    );
  });
for (const [id, r] of [
  ["BC02", "material"],
  ["BC09", "fuel"],
])
  test(`${id} alternative Build produces ${r}`, () => {
    let s = resources(own(fixture(), id), 0, []);
    s.turn.suit = "construction";
    s = choose(s, "action", (c) => c.action === "build" && c.cost === "pip");
    s = choose(s, "special", (c) => c.card === id);
    s = choose(s, "manufacture");
    assert.ok(s.players[0].resources.includes(r));
    assert.equal(s.turn.pips, 3);
  });
for (const [id, suit] of [
  ["BC04", "administration"],
  ["BC05", "construction"],
  ["BC10", "mobilization"],
  ["BC11", "aggression"],
])
  test(`${id} Union targets face-up matching cards only`, () => {
    let s = own(fixture(), id);
    s.played = [
      { card: `${suit}-3`, faceup: true, player: 1, mode: "surpass" },
      { card: `${suit}-4`, faceup: false, player: 2, mode: "copy" },
    ];
    for (const p of s.players)
      p.hand = p.hand.filter((c) => !s.played.some((v) => v.card === c));
    s.discardDown = s.discardDown.filter(
      (c) => !s.played.some((v) => v.card === c),
    );
    s = choose(s, "guild", (c) => c.card === id);
    assert.deepEqual(
      decision(s, 0)
        .choices.filter((c) => c.op === "union")
        .map((c) => c.target),
      [`${suit}-3`],
    );
  });
test("BC16 Lattice can be discarded when initiative cannot be seized", () => {
  let s = own(fixture(), "BC16");
  s = choose(s, "guild", (c) => c.card === "BC16");
  assert.ok(!s.players[0].cards.includes("BC16"));
  assert.equal(s.initiative, 0);
});
test("BC24 Relic Fence is limited to once per turn", () => {
  let s = resources(own(fixture(), "BC24"), 0, ["fuel"]);
  s = choose(s, "guild", (c) => c.card === "BC24");
  s = choose(s, "fence");
  assert.ok(s.players[0].resources.includes("relic"));
  assert.ok(
    !decision(s, 0).choices.some((c) => c.card === "BC24" && c.op === "guild"),
  );
});
test("BC22 Sworn Guardians must be stolen first and are buried", () => {
  let s = own(diceState(), "BC22", 1);
  s = own(s, "BC01", 1);
  s = task(s, { type: "raid", defender: 1, system: "1-arrow", keys: 10 });
  const cs = decision(s, 0).choices.filter((c) => c.op !== "skip");
  assert.equal(cs.length, 1);
  assert.equal(cs[0].card, "BC22");
  s = choose(s, "stealCard");
  assert.equal(s.courtDeck.at(-1), "BC22");
  assert.ok(
    decision(s, 0).choices.some(
      (c) => c.op === "stealResource" || c.card === "BC01",
    ),
  );
});
test("BC29 Song of Freedom initiative seizure remains optional", () => {
  let s = own(fixture(), "BC29");
  s.initiative = 1;
  s.court[0].id = null;
  s = task(s, { type: "vox", id: "BC29", index: 0 });
  s = choose(s, "freedom");
  assert.equal(s.pending[0].type, "freedomSeize");
  s = choose(s, "skip");
  assert.equal(s.initiative, 1);
});
test("LEAD05 Rebel requires extra two dice, with finite dice supply", () => {
  let s = diceState();
  s.players[0].leader = "LEAD05";
  assert.equal(decision(s, 0).form.min, 2);
  assert.equal(decision(s, 0).form.max, 5);
  assert.throws(() => form(s, { skirmish: 1, assault: 0, raid: 0 }), /extra/);
  assert.throws(
    () => form(s, { skirmish: 6, assault: 0, raid: 0 }),
    /Too many/,
  );
  assert.equal(
    form(s, { skirmish: 2, assault: 0, raid: 0 }).lastBattle.dice.length,
    2,
  );
});
test("LEAD11 Corsair rejects more assault than skirmish dice", () => {
  let s = diceState();
  s.players[0].leader = "LEAD11";
  assert.throws(() => form(s, { skirmish: 0, assault: 1, raid: 0 }), /Corsair/);
});
test("L04 Mirror Plating intercept is not removed by L06 Signal Breaker", () => {
  let s = own(own(diceState(), "L06"), "L04", 1);
  s.pending[0] = {
    ...s.pending[0],
    type: "reroll",
    dice: [{ type: "assault", faces: [] }],
    used: [],
    allFresh: true,
  };
  s = choose(s, "resolve");
  assert.equal(s.pending[0].type, "hits");
  assert.equal(s.pending[0].target, 0);
  assert.equal(s.pending[0].left, 2);
});
test("L05 Hidden Harbors prohibits all raid dice against fresh port", () => {
  let s = own(diceState(), "L05", 1);
  place(s, 1, "starport", "1-arrow");
  assert.equal(decision(s, 0).form.raidMax, 0);
  assert.throws(() => form(s, { skirmish: 0, assault: 0, raid: 1 }), /Raid/);
});
test("L17 Raider Exosuits allows only one raid against building-free system", () => {
  let s = diceState();
  s.pieces.find((x) => x.type === "city").system = "1-hex";
  assert.equal(decision(s, 0).form.raidMax, 0);
  own(s, "L17");
  assert.equal(decision(s, 0).form.raidMax, 1);
});
test("new ships placed during a battle cannot absorb attacking hits", () => {
  let s = diceState();
  const attackers = s.pending[0].attackers;
  const fresh = place(s, 0, "ship", "1-arrow")[0];
  s = task(s, {
    type: "hits",
    system: "1-arrow",
    target: 0,
    dealer: 1,
    left: 1,
    kind: "self",
    battle: true,
    attackers,
  });
  assert.ok(!decision(s, 0).choices.some((c) => c.piece === fresh));
});
test("L13 Ancient Holdings has fixed four-key slot after current board slots", () => {
  let s = clear(own(fixture(), "L13"));
  assert.equal(capacity(s, 0), 3);
  assert.deepEqual(resourceKeysFor(s, 0), [3, 1, 4]);
  place(s, 0, "city", "1-arrow");
  assert.deepEqual(resourceKeysFor(s, 0), [3, 1, 1, 4]);
});
// A6: the L13 slot is always the last index; board slots grow and shrink
// around it. These tests check the token never moves, and that tokens are
// conserved (assertDeepInvariants checks supply + slots + held = 5 each).
const tokens = (s) =>
  s.players.flatMap((p) => p.resources.filter(Boolean)).length +
  RESOURCES.reduce((n, r) => n + s.supply[r], 0) +
  s.held.length;
test("L13 card token stays on the four-key slot when a city is built", () => {
  let s = clear(own(fixture(), "L13"));
  s.players[0].resources[2] = "relic";
  s.supply.relic--;
  const port = place(s, 0, "starport", "1-arrow")[0];
  place(s, 0, "ship", "1-arrow");
  const before = tokens(s);
  s.turn.suit = "construction";
  s = act(s, "build", "buildTarget", (c) => c.kind === "city");
  assert.equal(capacity(s, 0), 4);
  assert.equal(s.players[0].resources.length, 4);
  assert.equal(s.players[0].resources[3], "relic");
  assert.equal(resourceKeysFor(s, 0)[3], 4);
  assert.deepEqual(s.players[0].resources.slice(0, 3), [null, null, null]);
  assert.equal(tokens(s), before);
  assertDeepInvariants(s);
  assert.ok(port);
});
test("L13 card token stays put when a city is lost; a board token overflows", () => {
  let s = clear(own(fixture(), "L13"));
  place(s, 0, "city", "1-arrow", 2);
  s = task(s, { type: "arrangeResources" });
  s = choose(s, "skip");
  assert.equal(capacity(s, 0), 5);
  const full = ["material", "fuel", "weapon", "relic", "psionic"];
  // Four board slots plus the card slot, all full; the card holds the psionic.
  full.forEach((r, i) => {
    s.players[0].resources[i] = r;
    s.supply[r]--;
  });
  const before = tokens(s);
  s.pieces = s.pieces.filter((x) => x.type !== "city");
  place(s, 0, "city", "1-arrow", 1);
  s = task(s, { type: "arrangeResources" });
  s = transition(s, 0, {
    choice: decision(s, 0).choices.find((c) => c.op === "skip").id,
  });
  assert.equal(s.pending[0].type, "overflow");
  assert.equal(
    s.players[0].resources.length,
    capacity(s, 0) + 1,
    "board over capacity, card slot still last",
  );
  assert.equal(s.players[0].resources.at(-1), "psionic");
  s = choose(s, "discard", (c) => c.index === 0);
  assert.equal(s.players[0].resources.length, capacity(s, 0));
  assert.equal(s.players[0].resources.at(-1), "psionic");
  assert.equal(resourceKeysFor(s, 0).at(-1), 4);
  assert.equal(tokens(s), before);
  assertDeepInvariants(s);
});
test("L13 empty card slot is the one shed when a city is lost", () => {
  let s = clear(own(fixture(), "L13"));
  place(s, 0, "city", "1-arrow", 2);
  s = task(s, { type: "arrangeResources" });
  s = choose(s, "skip");
  s.players[0].resources[1] = "fuel";
  s.supply.fuel--;
  s.pieces = s.pieces.filter((x) => x.type !== "city");
  s = task(s, { type: "arrangeResources" });
  s = choose(s, "skip");
  assert.equal(capacity(s, 0), 3);
  assert.deepEqual(s.players[0].resources, ["fuel", null, null]);
  assert.equal(resourceKeysFor(s, 0).at(-1), 4);
  assertDeepInvariants(s);
});
test("L13 raid prices the card token at four keys", () => {
  let s = clear(own(diceState(), "L13", 1));
  s.players[1].resources = [null, null, "relic"];
  s.supply.relic--;
  s = task(s, { type: "raid", defender: 1, system: "1-arrow", keys: 3 });
  assert.ok(!decision(s, 0).choices.some((c) => c.op === "stealResource"));
  s = task(s, { type: "raid", defender: 1, system: "1-arrow", keys: 4 });
  const c = decision(s, 0).choices.find((c) => c.op === "stealResource");
  assert.equal(c.index, 2);
  assert.equal(c.keys, 4);
});
test("L13 gaining a resource on a full board lands before the card slot", () => {
  let s = clear(own(fixture(), "L13"));
  s = task(s, { type: "arrangeResources" });
  s = choose(s, "skip");
  const pl = s.players[0];
  ["material", "fuel", "psionic"].forEach((r, i) => {
    pl.resources[i] = r;
    s.supply[r]--;
  });
  const before = tokens(s);
  task(s, { type: "gainChoice", p: 0, count: 1, reason: "test" });
  s = choose(s, "gain", (c) => c.resource === "relic");
  assert.equal(s.pending[0].type, "overflow");
  assert.deepEqual(s.players[0].resources, [
    "material",
    "fuel",
    "relic",
    "psionic",
  ]);
  // Discarding the card token moves the board overflow into the card slot
  // rather than looping on the overflow prompt.
  s = choose(s, "discard", (c) => c.index === 3);
  assert.equal(s.pending[0]?.type === "overflow", false);
  assert.equal(s.players[0].resources.length, 3);
  assert.equal(s.players[0].resources.filter(Boolean).length, 3);
  assert.equal(tokens(s), before);
  assertDeepInvariants(s);
});
test("L13 gained mid-game appends the slot; discarded, its token returns to the supply", () => {
  let s = resources(fixture(), 0, ["material", "fuel"]);
  const before = tokens(s);
  own(s, "L13");
  s = task(s, { type: "arrangeResources" });
  s = choose(s, "skip");
  assert.deepEqual(s.players[0].resources.slice(0, 2), ["material", "fuel"]);
  assert.equal(s.players[0].resources.length, capacity(s, 0));
  assert.equal(s.players[0].resources.at(-1), null);
  s.players[0].resources[s.players[0].resources.length - 1] = "relic";
  s.supply.relic--;
  const relics = s.supply.relic;
  s.players[0].cards = s.players[0].cards.filter((c) => c !== "L13");
  s.courtDiscard.push("L13");
  s = task(s, { type: "arrangeResources" });
  s = choose(s, "skip");
  assert.equal(s.players[0].resources.length, capacity(s, 0));
  assert.deepEqual(s.players[0].resources.filter(Boolean), [
    "material",
    "fuel",
  ]);
  assert.equal(s.supply.relic, relics + 1);
  assert.equal(tokens(s), before);
  assertDeepInvariants(s);
});
test("L13 stolen with a token on it: the token goes with the card", () => {
  // The engine only lets Guilds be stolen today, so make L13 stealable for
  // this test to exercise the transfer.
  const real = { kind: CARDS.L13.kind, meta: CARDS.L13.meta };
  CARDS.L13.kind = "guild";
  CARDS.L13.meta = { keys: 1 };
  try {
    let s = clear(own(diceState(), "L13", 1));
    s.players[1].resources[2] = "relic";
    s.supply.relic--;
    const before = tokens(s);
    s = task(s, { type: "raid", defender: 1, system: "1-arrow", keys: 10 });
    s = choose(s, "stealCard", (c) => c.card === "L13");
    assert.equal(s.players[0].resources.length, capacity(s, 0));
    assert.equal(s.players[0].resources.at(-1), "relic");
    assert.equal(resourceKeysFor(s, 0).at(-1), 4);
    assert.equal(s.players[1].resources.length, capacity(s, 1));
    assert.ok(!s.players[1].resources.includes("relic"));
    assert.equal(tokens(s), before);
    assertDeepInvariants(s);
  } finally {
    Object.assign(CARDS.L13, real);
  }
});
test("L11 Gate Stations can tax an untyped gate city for a captive", () => {
  let s = clear(own(fixture(), "L11"));
  place(s, 0, "ship", "1-gate");
  const city = place(s, 1, "city", "1-gate")[0];
  s = act(s, "tax", "taxTarget", (c) => c.piece === city);
  assert.equal(s.players[0].captives.length, 1);
});
test("L18 Survival Overrides permits sacrificing without a rival target", () => {
  let s = own(fixture(), "L18");
  s.turn.suit = "mobilization";
  s = choose(s, "action", (c) => c.action === "move" && c.cost === "pip");
  s = choose(s, "special", (c) => c.card === "L18");
  const before = s.pieces.length;
  s = choose(s, "martyr", (c) => !c.target);
  assert.equal(s.pieces.length, before - 1);
});
test("L22 Keeper’s Solidarity protects material guilds using cartel supply", () => {
  let s = own(own(own(diceState(), "L22", 1), "BC03", 1), "BC01", 1);
  resources(s, 1, []);
  s.markers[2].ambition = "keeper";
  task(s, { type: "steal" });
  assert.ok(
    !decision(s, 0).choices.some(
      (c) => c.defender === 1 && c.op === "stealCard",
    ),
  );
});
for (const id of ["L19", "L21", "L23", "L25", "L28"])
  test(`${id} discard clears matching Outrage`, () => {
    let s = own(fixture(), id);
    s.players[0].outrage = [
      {
        L19: "psionic",
        L21: "relic",
        L23: "weapon",
        L25: "weapon",
        L28: "material",
      }[id],
    ];
    s = choose(s, "guild", (c) => c.card === id);
    s = choose(s, "clearOutrage");
    assert.deepEqual(s.players[0].outrage, []);
    assert.ok(!s.players[0].cards.includes(id));
  });
test("resource rearrangement is allowed after gain, not arbitrarily in turn", () => {
  let s = fixture();
  assert.ok(!decision(s, 0).choices.some((c) => c.op === "reorder"));
  s = task(s, { type: "gainChoice", count: 1 });
  const c = decision(s, 0).choices.find((c) => c.op === "gain");
  s = transition(s, 0, { choice: c.id });
  assert.equal(s.pending[0].type, "arrangeResources");
});
test("LEAD07 bonus influence is rolled back if Secure remains illegal", () => {
  let s = fixture();
  s.players[0].leader = "LEAD07";
  s.turn.suit = "aggression";
  s.turn.mode = "copy";
  s.turn.pips = 1;
  s.court.forEach((c) => (c.agents = [0, 2, 0, 0]));
  s = choose(s, "action", (c) => c.action === "secure" && c.cost === "pip");
  s = choose(s, "bonusBefore");
  s = choose(s, "influenceTarget");
  assert.ok(s.court.every((c) => c.agents[0] === 0));
  assert.equal(s.turn.pips, 1);
  assert.match(s.log.at(-1).text, /undone/);
});
test("LEAD12 declaration draws exactly one court card without refilling invisible lane", () => {
  let s = fixture();
  s.players[0].leader = "LEAD12";
  s.turn.card = "administration-2";
  const guild = s.courtDeck.find((id) => CARDS[id].kind === "guild");
  s.courtDeck = [guild, ...s.courtDeck.filter((id) => id !== guild)];
  const n = s.courtDeck.length;
  s = choose(s, "declare");
  assert.equal(s.courtDeck.length, n - 1);
  assert.ok(s.players[0].cards.includes(guild));
  assert.ok(
    !decision(s, 0).choices.some((c) => c.op === "guild" && c.card === guild),
  );
});
for (const [leader, r] of [
  ["LEAD02", "psionic"],
  ["LEAD03", "fuel"],
  ["LEAD15", "weapon"],
])
  test(`${leader} copied tax grants its extra resource`, () => {
    let s = resources(fixture(), 0, []);
    s.players[0].leader = leader;
    s.turn.mode = "copy";
    s = act(
      s,
      "tax",
      "taxTarget",
      (c) => s.pieces.find((x) => x.id === c.piece)?.owner === 0,
    );
    assert.ok(s.players[0].resources.includes(r));
  });
test("LEAD04 Upstart cannot tax uncontrolled loyal cities and gains a declaration resource", () => {
  let s = clear(fixture());
  s.players[0].leader = "LEAD04";
  place(s, 0, "city", "1-arrow");
  assert.ok(!decision(s, 0).choices.some((c) => c.action === "tax"));
  s.turn.card = "administration-2";
  s = choose(s, "declare");
  assert.equal(s.pending[0].type, "gainChoice");
  s = choose(s, "gain", (c) => c.resource === "material");
  assert.ok(s.players[0].resources.includes("material"));
});
test("LEAD08 Demagogue needs two agents for Guild secure but one for Vox", () => {
  let s = table({ 0: ["aggression-1"] });
  s.players[0].leader = "LEAD08";
  putCourt(putCourt(putCourt(s, "BC01", 0), "BC26", 1), "BC02", 2);
  s.court[0].agents[0] = 1;
  s.court[1].agents[0] = 1;
  s.court[2].agents[0] = 2;
  s = play(s, "aggression-1", "lead");
  s = choose(s, "action", (c) => c.action === "secure" && c.cost === "pip");
  const offered = (s) =>
    decision(s, 0)
      .choices.filter((c) => c.op === "secureTarget")
      .map((c) => c.index);
  // One agent on a Guild card is not enough; a Vox card and two agents are.
  assert.deepEqual(offered(s), [1, 2]);
  s = choose(s, "secureTarget", (c) => c.index === 2);
  assert.ok(s.players[0].cards.includes("BC02"));
  assertDeepInvariants(s);
});
test("LEAD13 Anarchist taxes an empty slot and cannot tax loyal cities", () => {
  let s = clear(fixture());
  s.players[0].leader = "LEAD13";
  place(s, 0, "ship", "1-arrow");
  place(s, 0, "city", "1-arrow");
  s = choose(s, "action", (c) => c.action === "tax" && c.cost === "pip");
  assert.ok(decision(s, 0).choices.some((c) => c.empty));
  assert.ok(!decision(s, 0).choices.some((c) => c.piece));
  s = choose(s, "taxTarget");
  assert.ok(s.players[0].resources.includes("weapon"));
});
test("LEAD14 Shaper can permanently change a planet using cartel material", () => {
  let s = clear(own(fixture(), "BC03"));
  s.players[0].leader = "LEAD14";
  s = task(s, { type: "mythic", system: "1-arrow" });
  const before = s.supply.material;
  s = choose(s, "mythic", (c) => c.resource === "material");
  assert.equal(s.overrides["1-arrow"], "material");
  assert.equal(s.supply.material, before - 1);
  assertDeepInvariants(s);
});
test("LEAD10 Overseer repeats a tax by damaging its building", () => {
  let s = resources(fixture(), 0, []);
  s.players[0].leader = "LEAD10";
  const city = s.pieces.find((x) => x.owner === 0 && x.type === "city");
  s = act(s, "tax", "taxTarget", (c) => c.piece === city.id);
  s = choose(s, "ruthless");
  assert.equal(s.players[0].resources.filter(Boolean).length, 2);
  assert.ok(s.pieces.find((x) => x.id === city.id).damaged);
  assert.ok(s.turn.used.includes("ruthless"));
});
test("LEAD15 Agitator replaces interception with weapon icons and discards one weapon", () => {
  let s = resources(own(diceState(), "BC15", 1), 1, ["weapon"]);
  s.players[1].leader = "LEAD15";
  s.pending[0] = {
    ...s.pending[0],
    type: "reroll",
    dice: [{ type: "assault", faces: ["intercept"] }],
    used: [],
    allFresh: true,
  };
  s = choose(s, "resolve");
  assert.equal(s.pending[0].left, 2);
  assert.equal(s.players[1].resources.filter((r) => r === "weapon").length, 0);
});
test("LEAD16 Quartermaster repairs based on controlled rival starports too", () => {
  let s = diceState();
  s.players[0].leader = "LEAD16";
  place(s, 0, "ship", "1-arrow");
  s.pieces.find((x) => x.owner === 0).damaged = true;
  place(s, 2, "starport", "1-arrow");
  s = task(s, {
    type: "reroll",
    defender: 1,
    system: "1-arrow",
    dice: [],
    used: [],
    beforeTrophies: 0,
  });
  s = choose(s, "resolve");
  assert.equal(s.pending[0].type, "repairBonus");
  s = choose(s, "repairBonus");
  assert.ok(s.pieces.filter((x) => x.owner === 0).every((x) => !x.damaged));
});
test("L01 Tool-Priests summons at controlled rival cities once per turn", () => {
  let s = clear(own(fixture(), "L01"));
  place(s, 0, "ship", "1-arrow");
  place(s, 1, "city", "1-arrow");
  s.turn.suit = "construction";
  s = choose(s, "action", (c) => c.action === "build" && c.cost === "pip");
  s = choose(s, "special", (c) => c.card === "L01");
  s = choose(s, "summon");
  assert.equal(
    s.pieces.filter((x) => x.owner === 0 && x.type === "ship").length,
    2,
  );
  assert.ok(s.turn.used.includes("L01"));
});
test("L02 Galactic Rifles use fresh ships and ignore battle-only reroll modifiers", () => {
  let s = clear(own(own(fixture(), "L02"), "BC13"));
  place(s, 0, "ship", "1-arrow", 2);
  s.pieces[0].damaged = true;
  place(s, 1, "ship", "1-gate");
  s.turn.suit = "aggression";
  s = choose(s, "action", (c) => c.action === "battle" && c.cost === "pip");
  s = choose(s, "special", (c) => c.card === "L02");
  s = choose(s, "rifles");
  assert.equal(
    decision(s, 0).choices.filter((c) => c.op === "rifleDice").length,
    2,
  );
  s = choose(s, "rifleDice", (c) => c.n === 1);
  assert.notEqual(s.pending[0]?.type, "reroll");
});
test("L03 Sprinter Drives moves grouped fresh ships; damaged ships get no extra move", () => {
  let s = clear(own(fixture(), "L03"));
  const ids = place(s, 0, "ship", "1-arrow", 3);
  s.pieces[2].damaged = true;
  s.turn.suit = "mobilization";
  s = act(s, "move", "moveFrom", (c) => c.system === "1-arrow");
  s = form(s, ids);
  s = choose(s, "moveTo", (c) => c.system === "1-gate");
  s = choose(s, "sprint");
  const opts = decision(s, 0).form.options;
  assert.equal(opts.length, 2);
  s = form(
    s,
    opts.map((x) => x.id),
  );
  s = choose(s, "moveTo", (c) => c.system === "1-hex");
  assert.equal(s.pieces.filter((x) => x.system === "1-hex").length, 2);
  assert.equal(s.pieces.find((x) => x.damaged).system, "1-gate");
});
// A9: Sprinter Drives is one group, one extra move. Catapulting ships through
// two gates leaves groups at both, but only one of them may sprint.
const sprintOffers = (s) =>
  s.pending[0]?.type === "sprinter" ||
  s.pending[0]?.type === "sprintSelect" ||
  s.pending.some((t) => t.type === "sprinter");
test("L03 Sprinter Drives moves one group after a Catapult drops groups at two gates", () => {
  let s = clear(own(fixture(), "L03"));
  const ids = place(s, 0, "ship", "1-arrow", 4);
  place(s, 0, "starport", "1-arrow");
  s.turn.suit = "mobilization";
  s = act(s, "move", "moveFrom", (c) => c.system === "1-arrow");
  s = form(s, ids);
  s = choose(s, "moveTo", (c) => c.system === "1-gate");
  s = choose(s, "continue", (c) => c.system === "2-gate");
  s = form(s, ids.slice(0, 2));
  s = choose(s, "skip");
  assert.equal(s.pieces.filter((x) => x.system === "1-gate").length, 2);
  assert.equal(s.pieces.filter((x) => x.system === "2-gate").length, 2);
  const offered = decision(s, 0).choices.filter((c) => c.op === "sprint");
  assert.deepEqual(offered.map((c) => c.system).sort(), ["1-gate", "2-gate"]);
  s = choose(s, "sprint", (c) => c.system === "1-gate");
  s = form(s, ids.slice(2));
  s = choose(s, "moveTo", (c) => c.system === "1-hex");
  assert.equal(s.pieces.filter((x) => x.system === "1-hex").length, 2);
  assert.ok(!sprintOffers(s), "the 2-gate group gets no sprint of its own");
  assert.equal(s.pieces.filter((x) => x.system === "2-gate").length, 2);
  assertDeepInvariants(s);
});
test("L03 Sprinter Drives gives the ships left behind no further move", () => {
  let s = clear(own(fixture(), "L03"));
  const ids = place(s, 0, "ship", "1-arrow", 3);
  s.turn.suit = "mobilization";
  s = act(s, "move", "moveFrom", (c) => c.system === "1-arrow");
  s = form(s, ids);
  s = choose(s, "moveTo", (c) => c.system === "1-gate");
  s = choose(s, "sprint");
  s = form(s, [ids[0]]);
  s = choose(s, "moveTo", (c) => c.system === "1-hex");
  assert.ok(!sprintOffers(s));
  assert.ok(!decision(s, 0).choices.some((c) => c.op === "sprint"));
  assert.equal(s.pieces.filter((x) => x.system === "1-hex").length, 1);
  assert.equal(s.pieces.filter((x) => x.system === "1-gate").length, 2);
  assertDeepInvariants(s);
});
test("L03 Sprinter Drives bonus move may Catapult, with no second bonus after it", () => {
  let s = clear(own(fixture(), "L03"));
  const ids = place(s, 0, "ship", "1-hex", 2);
  place(s, 0, "starport", "1-gate");
  s.turn.suit = "mobilization";
  s = act(s, "move", "moveFrom", (c) => c.system === "1-hex");
  s = form(s, ids);
  s = choose(s, "moveTo", (c) => c.system === "1-gate");
  s = choose(s, "sprint");
  s = form(s, ids);
  s = choose(s, "moveTo", (c) => c.system === "6-gate");
  s = choose(s, "continue", (c) => c.system === "5-gate");
  s = form(s, ids);
  s = choose(s, "skip");
  assert.equal(s.pieces.filter((x) => x.system === "5-gate").length, 2);
  assert.ok(!sprintOffers(s));
  assert.equal(s.pending.length, 0);
  assertDeepInvariants(s);
});
test("L08 Gate Ports captures once per group entering a controlled gate", () => {
  let s = clear(own(fixture(), "L08", 1));
  const ids = place(s, 0, "ship", "1-arrow", 2);
  place(s, 1, "ship", "1-gate", 3);
  place(s, 1, "starport", "1-gate");
  s.turn.suit = "mobilization";
  s = act(s, "move", "moveFrom", (c) => c.system === "1-arrow");
  s = form(s, ids);
  s = choose(s, "moveTo", (c) => c.system === "1-gate");
  assert.equal(s.players[1].captives.length, 1);
});
test("L09 Cloud Cities cannot spend the same token for the action and cloud cost", () => {
  let s = clear(own(fixture(), "L09"));
  place(s, 0, "ship", "1-hex");
  resources(s, 0, ["material"]);
  s = choose(s, "action", (c) => c.action === "build" && c.cost === 0);
  assert.ok(!decision(s, 0).choices.some((c) => c.op === "cloudTarget"));
  s = fixture();
  own(s, "L09");
  s.turn.suit = "construction";
  resources(s, 0, ["relic"]);
  s = choose(s, "action", (c) => c.action === "build" && c.cost === "pip");
  s = choose(s, "cloudTarget");
  s = choose(s, "cloudPay");
  assert.ok(s.pieces.some((x) => x.cloud));
  assert.equal(s.players[0].resources.filter(Boolean).length, 0);
});
test("L10 Living Structures Prune preserves damaged status and returns original piece", () => {
  let s = clear(own(fixture(), "L10"));
  place(s, 0, "starport", "1-arrow", 1, true);
  s.turn.suit = "construction";
  s = choose(s, "action", (c) => c.action === "repair" && c.cost === "pip");
  s = choose(s, "special");
  s = choose(s, "prune");
  assert.equal(s.pieces[0].type, "city");
  assert.equal(s.pieces[0].damaged, true);
});
test("L12 Railgun hit occurs before collecting dice, while Signal Breaker records initial freshness", () => {
  let s = own(own(diceState(), "L12", 1), "L06");
  s.pending = [];
  s.turn.suit = "aggression";
  s = act(s, "battle", "battleTarget");
  assert.equal(s.pending[0].type, "hits");
  s = choose(s, "hit");
  assert.equal(s.pending[0].type, "dice");
  assert.equal(s.pending[0].allFresh, true);
  assert.equal(s.pieces.filter((x) => x.owner === 0 && x.damaged).length, 1);
});
test("L15 Predictive Sensors cannot move damaged ships; Rebel limit applies per origin", () => {
  let s = clear(own(fixture(), "L15", 1));
  s.players[1].leader = "LEAD05";
  place(s, 1, "ship", "1-arrow", 3);
  place(s, 1, "ship", "1-hex", 1, true);
  task(s, { type: "predictive", p: 1, system: "1-gate" });
  assert.equal(decision(s, 1).form.options.length, 3);
  assert.throws(
    () =>
      form(
        s,
        decision(s, 1).form.options.map((x) => x.id),
        1,
      ),
    /two ships/,
  );
});
test("L16 Force Beams ignores Rebel group limit and moves any ownership", () => {
  let s = clear(own(fixture(), "L16"));
  s.players[0].leader = "LEAD05";
  place(s, 0, "starport", "1-gate");
  place(s, 0, "ship", "1-gate", 2);
  place(s, 1, "ship", "1-gate", 2);
  s.turn.suit = "mobilization";
  s = choose(s, "action", (c) => c.action === "move" && c.cost === "pip");
  s = choose(s, "special", (c) => c.card === "L16");
  s = choose(
    s,
    "guide",
    (c) => c.system === "1-gate" && c.target === "1-arrow",
  );
  s = form(
    s,
    decision(s, 0).form.options.map((x) => x.id),
  );
  assert.equal(s.pieces.filter((x) => x.system === "1-arrow").length, 4);
});
test("L20 Empath’s Bond permits remote tax without captives and rival starport building", () => {
  let s = clear(own(fixture(), "L20"));
  s.markers[2].ambition = "empath";
  const city = place(s, 1, "city", "1-arrow")[0];
  place(s, 1, "starport", "1-hex");
  s = act(s, "tax", "taxTarget", (c) => c.piece === city);
  assert.equal(s.players[0].captives.length, 0);
  s.turn.suit = "construction";
  s = choose(s, "action", (c) => c.action === "build" && c.cost === "pip");
  assert.ok(
    decision(s, 0).choices.some(
      (c) => c.kind === "ship" && c.system === "1-hex",
    ),
  );
});
test("L21 Keeper’s Trust blocks stealing a resource the thief already has", () => {
  let s = resources(own(diceState(), "L21", 1), 0, ["fuel"]);
  resources(s, 1, ["fuel"]);
  s.markers[2].ambition = "keeper";
  task(s, { type: "steal" });
  assert.ok(
    !decision(s, 0).choices.some(
      (c) => c.defender === 1 && c.op === "stealResource",
    ),
  );
});
test("L23 Warlord’s Cruelty allows repeated taxes while Warlord is declared", () => {
  let s = clear(own(fixture(), "L23"));
  s.markers[2].ambition = "warlord";
  const id = place(s, 0, "city", "1-arrow")[0];
  s = act(s, "tax", "taxTarget", (c) => c.piece === id);
  s = act(s, "tax", "taxTarget", (c) => c.piece === id);
  assert.equal(s.players[0].resources.filter((x) => x === "weapon").length, 2);
});
test("L24 Warlord’s Terror spends a trophy for influence", () => {
  let s = own(fixture(), "L24");
  s.markers[2].ambition = "warlord";
  s.players[0].trophies = [{ id: "test-agent", owner: 1, type: "agent" }];
  s = choose(s, "guild", (c) => c.card === "L24");
  s = choose(s, "spendTrophy");
  s = choose(s, "influenceTarget", (c) => c.index === 0);
  assert.equal(s.players[0].trophies.length, 0);
  assert.equal(s.court[0].agents[0], 1);
});
test("L25 Tyrant’s Ego spends a captive for secure", () => {
  let s = own(fixture(), "L25");
  s.markers[2].ambition = "tyrant";
  s.players[0].captives = [{ id: "test-agent", owner: 1, type: "agent" }];
  s.court[0].agents[0] = 1;
  s = choose(s, "guild", (c) => c.card === "L25");
  s = choose(s, "spendCaptive");
  s = choose(s, "secureTarget", (c) => c.index === 0);
  assert.equal(s.players[0].captives.length, 0);
});
test("L26 Tyrant’s Authority annexes rather than destroys, with no Outrage", () => {
  let s = clear(own(fixture(), "L26"));
  s.markers[2].ambition = "tyrant";
  place(s, 0, "ship", "1-arrow");
  place(s, 1, "city", "1-arrow", 1, true);
  s.turn.suit = "construction";
  s = choose(s, "action", (c) => c.action === "build" && c.cost === "pip");
  s = choose(s, "special", (c) => c.card === "L26");
  s = choose(s, "annex");
  assert.ok(
    s.pieces.some((x) => x.type === "city" && x.owner === 0 && x.damaged),
  );
  assert.equal(s.players[0].outrage.length, 0);
  assert.equal(s.players[0].trophies.length, 0);
});
test("L27 Tycoon’s Ambition declares undeclared ambition without zero marker", () => {
  let s = resources(own(fixture(), "L27"), 0, ["fuel", "material"]);
  s.markers[2].ambition = "tycoon";
  s = choose(s, "guild", (c) => c.card === "L27");
  s = choose(s, "tycoonDeclare", (c) => c.ambition === "keeper");
  assert.equal(s.markers[1].ambition, "keeper");
  assert.equal(s.lead.rank, 2);
  assert.equal(s.players[0].resources.filter(Boolean).length, 0);
});
// A3: the lead card, Populist Demands and Tycoon's Ambition are different
// cards, so none of them uses up another's declaration. Securing Populist
// Demands usually refills the Court, which closes the lead declaration (item
// 16), so these setups inject the vox task; the M6 tests cover the real-play
// case with an empty Court deck.
const declaredBy = (s, p = 0) =>
  s.lead.declarations.filter((d) => d.player === p).map((d) => d.ambition);
const leadDeclare = (s) => choose(s, "declare", (c) => c.ambition === "tycoon");
const tycoonDeclare = (s, ambition = "keeper") => {
  s = choose(s, "guild", (c) => c.card === "L27");
  return choose(s, "tycoonDeclare", (c) => c.ambition === ambition);
};
// A vox task for player 0. The card has just been secured from Court lane 0: it
// is in player 0's cards, as `secure` leaves it, and the card that was in the
// lane is back in the deck, so every Court card is in one place until the vox
// discards it.
const voxTask = (s, id) => {
  own(s, id);
  if (s.court[0].id) s.courtDeck.push(s.court[0].id);
  s.court[0].id = null;
  return task(s, { type: "vox", id, index: 0 });
};
const populistTask = (s) => voxTask(s, "BC27");
const tycoonSetup = () => {
  const s = resources(own(fixture(), "L27"), 0, ["fuel", "material"]);
  s.turn.card = "administration-2";
  s.markers[2].ambition = "tycoon";
  return s;
};
test("Populist Demands does not use up the lead card's declaration", () => {
  let s = clear(fixture());
  s.turn.card = "administration-2";
  populistTask(s);
  s = choose(s, "populist", (c) => c.ambition === "warlord");
  assert.equal(s.markers[2].ambition, "warlord");
  assert.ok(!s.turn.leadDeclared);
  assert.equal(s.lead.rank, 2);
  s = leadDeclare(s);
  assert.equal(s.markers[1].ambition, "tycoon");
  assert.equal(s.lead.rank, 0, "the lead declaration still places the zero");
  assert.deepEqual(declaredBy(s), ["warlord", "tycoon"]);
  assert.ok(!decision(s, 0).choices.some((c) => c.op === "declare"));
  assertDeepInvariants(s);
});
test("Populist Demands through Feastbringer's Generous still leaves the lead declaration", () => {
  let s = own(own(own(clear(fixture()), "LEAD07"), "BC01"), "BC02");
  s.turn.card = "administration-2";
  populistTask(s);
  s = choose(s, "populist", (c) => c.ambition === "warlord");
  s = choose(s, "give", (c) => c.card === "BC01");
  assert.equal(s.markers[2].ambition, "warlord");
  assert.ok(!s.turn.leadDeclared);
  assert.ok(decision(s, 0).choices.some((c) => c.op === "declare"));
});
// A8: everything a Populist Demands declaration triggers resolves before the
// Court refills. populistTask() leaves lane 0 empty; the deck top is what the
// refill (and Noble's Connected draw) would take.
const populistDeck = (s) => {
  const keep = s.courtDeck.filter((id) => CARDS[id].kind === "guild");
  const [first, second] = keep;
  s.courtDeck = [
    first,
    second,
    ...s.courtDeck.filter((id) => id !== first && id !== second),
  ];
  return [first, second];
};
test("Populist Demands: Noble's Connected takes the former top card, then the Court refills", () => {
  let s = clear(fixture());
  s.players[0].leader = "LEAD12";
  s.turn.card = "administration-2";
  populistTask(s);
  const [first, second] = populistDeck(s);
  const n = s.courtDeck.length;
  s = choose(s, "populist", (c) => c.ambition === "warlord");
  assert.ok(s.players[0].cards.includes(first), "Noble drew the old top card");
  assert.equal(s.court[0].id, second, "the refill is the next card");
  assert.equal(s.courtDeck.length, n - 2);
  assert.ok(s.courtDiscard.includes("BC27"));
  assert.equal(s.pending.length, 0);
  assertDeepInvariants(s);
});
test("Populist Demands: the Court slot stays empty while Demagogue's Bold resolves", () => {
  let s = clear(fixture());
  s.players[0].leader = "LEAD08";
  s.turn.card = "administration-2";
  populistTask(s);
  const [first] = populistDeck(s);
  s = choose(s, "populist", (c) => c.ambition === "warlord");
  assert.equal(s.pending[0].type, "bold");
  assert.equal(s.court[0].id, null, "no refill yet");
  assert.ok(
    !decision(s, 0).choices.some((c) => c.op === "bold" && c.index === 0),
    "the empty slot is not an influence target",
  );
  assert.equal(s.courtDeck[0], first);
  s = choose(s, "skip");
  assert.equal(s.court[0].id, first, "refilled once Bold is done");
  assert.equal(s.pending.length, 0);
  assertDeepInvariants(s);
});
test("Populist Demands through Generous refills only after the declaration's effects", () => {
  let s = own(own(own(clear(fixture()), "LEAD07"), "BC01"), "BC02");
  s.turn.card = "administration-2";
  populistTask(s);
  const [first] = populistDeck(s);
  s = choose(s, "populist", (c) => c.ambition === "warlord");
  assert.equal(s.pending[0].type, "generous");
  assert.equal(s.court[0].id, null);
  s = choose(s, "give", (c) => c.card === "BC01");
  assert.equal(s.markers[2].ambition, "warlord");
  assert.equal(s.court[0].id, first);
  assert.equal(s.pending.length, 0);
  assertDeepInvariants(s);
});
test("Populist Demands with nothing triggered still refills at once", () => {
  let s = clear(fixture());
  s.turn.card = "administration-2";
  populistTask(s);
  const [first] = populistDeck(s);
  s = choose(s, "populist", (c) => c.ambition === "warlord");
  assert.equal(s.court[0].id, first);
  assert.equal(s.pending.length, 0);
  assertDeepInvariants(s);
});
test("Mass Uprising: the Court refills only after the Prelude placements", () => {
  let s = clear(fixture());
  place(s, 0, "ship", "2-arrow", 12);
  voxTask(s, "BC26");
  const [first] = populistDeck(s);
  s = choose(s, "uprising", (c) => c.cluster === 1);
  assert.equal(s.pending[0].type, "prelude");
  assert.equal(s.court[0].id, null, "no refill while choosing systems");
  assert.ok(!s.courtDiscard.includes("BC26"));
  for (let i = 0; i < 3; i++) s = choose(s, "gatekeeper");
  assert.equal(s.pieces.filter((x) => x.system.startsWith("1-")).length, 3);
  assert.equal(s.court[0].id, first);
  assert.ok(s.courtDiscard.includes("BC26"));
  assert.equal(s.pending.length, 0);
  assertDeepInvariants(s);
});
test("Song of Freedom: the Court refills only after the seize choice", () => {
  let s = clear(fixture());
  place(s, 0, "city", "1-arrow");
  place(s, 0, "ship", "1-arrow");
  s.initiative = 1;
  voxTask(s, "BC29");
  s = choose(s, "freedom");
  assert.equal(s.pending[0].type, "freedomSeize");
  assert.equal(s.court[0].id, null, "no refill before seizing or declining");
  s = choose(s, "skip");
  assert.equal(s.initiative, 1);
  // The card is shuffled into the deck before the refill, so the new card is
  // not predictable; Song of Freedom may even be the one dealt.
  assert.ok(s.court[0].id);
  assert.ok(
    [...s.courtDeck, s.court[0].id].includes("BC29"),
    "Song of Freedom is shuffled back",
  );
  assert.equal(s.pending.length, 0);
  assertDeepInvariants(s);
});
test("the lead declaration through Generous still uses up the lead card's", () => {
  let s = own(own(fixture(), "LEAD07"), "BC01");
  s.turn.card = "administration-2";
  s = leadDeclare(s);
  assert.ok(!s.turn.leadDeclared, "not until the guild is given");
  s = choose(s, "give", (c) => c.card === "BC01");
  assert.ok(s.turn.leadDeclared);
  assert.ok(!decision(s, 0).choices.some((c) => c.op === "declare"));
});
test("Tycoon's Ambition after the lead declaration places a second marker", () => {
  let s = tycoonSetup();
  s = leadDeclare(s);
  s = tycoonDeclare(s);
  assert.deepEqual(declaredBy(s), ["tycoon", "keeper"]);
  assert.equal(s.markers.filter((m) => m.ambition).length, 3);
  assert.equal(s.lead.rank, 0, "only the lead declaration places the zero");
  assertDeepInvariants(s);
});
test("Tycoon's Ambition before the lead declaration leaves the lead one available", () => {
  let s = tycoonSetup();
  s = tycoonDeclare(s);
  assert.ok(!s.turn.leadDeclared);
  assert.ok(!s.turn.acted, "declaring is not an action");
  assert.equal(s.lead.rank, 2);
  s = leadDeclare(s);
  assert.deepEqual(declaredBy(s), ["keeper", "tycoon"]);
  assert.equal(s.markers.filter((m) => m.ambition).length, 3);
  assert.equal(s.lead.rank, 0);
  assertDeepInvariants(s);
});
test("with every marker placed, no further declaration is offered", () => {
  for (const order of ["lead first", "card first"]) {
    let s = tycoonSetup();
    if (order === "lead first") s = tycoonDeclare(leadDeclare(s));
    else s = leadDeclare(tycoonDeclare(s));
    const cs = decision(s, 0).choices;
    assert.ok(!cs.some((c) => c.op === "declare"), order);
    assert.ok(!cs.some((c) => c.op === "guild" && c.card === "L27"), order);
    assert.throws(() => leadDeclare(s));
  }
});
test("Tycoon's Ambition is once per turn even with markers left", () => {
  let s = tycoonSetup();
  s = tycoonDeclare(s);
  assert.equal(s.markers.filter((m) => !m.ambition).length, 1);
  resources(s, 0, ["fuel", "material"]);
  assert.ok(
    !decision(s, 0).choices.some((c) => c.op === "guild" && c.card === "L27"),
  );
});
test("L28 Tycoon’s Charm offers no trade without Material or Fuel", () => {
  let s = resources(own(fixture(), "L28"), 0, ["relic", "psionic"]);
  s.markers[2].ambition = "tycoon";
  s = choose(s, "guild", (c) => c.card === "L28");
  assert.ok(!decision(s, 0).choices.some((c) => c.op === "tycoonTrade"));
  assertDeepInvariants(s);
});
test("L28 Tycoon’s Charm offers the trade with one Fuel and the timeout bot can finish it", () => {
  let s = resources(own(fixture(), "L28"), 0, ["relic", "fuel"]);
  s.markers[2].ambition = "tycoon";
  s = choose(s, "guild", (c) => c.card === "L28");
  s = choose(s, "tycoonTrade");
  const f = decision(s, 0).form;
  assert.deepEqual(
    f.options.map((o) => o.id),
    ["1"],
  );
  s = settle(transition(s, 0, timeoutInput(s)));
  assert.equal(s.pending[0].type, "gainChoice");
  assert.deepEqual(s.players[0].resources.filter(Boolean), ["relic"]);
  s = settle(transition(s, 0, timeoutInput(s)));
  assert.equal(s.players[0].resources.filter(Boolean).length, 2);
  assertDeepInvariants(s);
});
test("L28 Tycoon’s Charm trades selected material/fuel for resources", () => {
  let s = resources(own(fixture(), "L28"), 0, ["material", "fuel"]);
  s.markers[2].ambition = "tycoon";
  s = choose(s, "guild", (c) => c.card === "L28");
  s = choose(s, "tycoonTrade");
  s = form(s, ["0", "1"]);
  s = choose(s, "gain", (c) => c.resource === "relic");
  s = choose(s, "gain", (c) => c.resource === "psionic");
  assert.deepEqual(s.players[0].resources.filter(Boolean), [
    "relic",
    "psionic",
  ]);
});
for (const [id, type, max] of [
  ["BC13", "skirmish", 2],
  ["L14", "assault", 3],
  ["L19", "raid", 18],
])
  test(`${id} reroll limits and once per battle use`, () => {
    let s = own(diceState(), id);
    resources(s, 0, ["weapon", "fuel"]);
    s.markers[2].ambition = "empath";
    s.pending[0] = {
      ...s.pending[0],
      type: "reroll",
      dice: [{ type, faces: [] }],
      used: [],
      freshAttack: 3,
    };
    s.lastBattle = { attacker: 0, defender: 1, system: "1-arrow", dice: [] };
    const before = decision(s, 0).choices.find((c) => c.op === "reroll");
    assert.equal(before.max, max);
    s.lastBattle = { dice: s.pending[0].dice };
    s = choose(s, "reroll");
    s = form(s, ["0"]);
    assert.ok(!decision(s, 0).choices.some((c) => c.op === "reroll"));
  });
test("BC12 Prison Wardens executes captives into trophies", () => {
  let s = own(fixture(), "BC12");
  s.players[0].captives = [{ id: "captured-agent", owner: 1, type: "agent" }];
  s = choose(s, "action", (c) => c.action === "influence" && c.cost === "pip");
  s = choose(s, "special", (c) => c.card === "BC12");
  s = form(s, ["captured-agent"]);
  assert.equal(s.players[0].captives.length, 0);
  assert.equal(s.players[0].trophies.length, 1);
});
test("BC14 Court Enforcers requires strictly fewer rival agents than weapon icons", () => {
  let s = resources(own(fixture(), "BC14"), 0, ["weapon"]);
  s.turn.suit = "aggression";
  s.court[0].agents = [0, 1, 0, 0];
  s = choose(s, "action", (c) => c.action === "battle" && c.cost === "pip");
  s = choose(s, "special", (c) => c.card === "BC14");
  s = choose(s, "abduct", (c) => c.index === 0);
  assert.equal(s.players[0].captives.length, 1);
  assert.equal(s.court[0].agents[1], 0);
});
test("BC20 Silver-Tongues can steal Guild cards and use their Prelude immediately", () => {
  let s = own(own(fixture(), "BC20"), "BC23", 1);
  s = choose(s, "guild", (c) => c.card === "BC20");
  s = choose(s, "stealCard", (c) => c.card === "BC23");
  assert.ok(
    decision(s, 0).choices.some((c) => c.op === "guild" && c.card === "BC23"),
  );
});
test("BC23 Elder Broker Trade bypasses Sworn Guardians and exchanges resources", () => {
  let s = clear(own(own(fixture(), "BC23"), "BC22", 1));
  place(s, 1, "city", "1-arrow");
  place(s, 0, "ship", "1-arrow");
  resources(s, 0, ["fuel"]);
  resources(s, 1, ["weapon"]);
  s = choose(s, "action", (c) => c.action === "tax" && c.cost === "pip");
  s = choose(s, "special", (c) => c.card === "BC23");
  s = choose(s, "trade");
  assert.ok(s.players[0].resources.includes("weapon"));
  assert.ok(s.players[1].resources.includes("fuel"));
});
test("simultaneous declaration effects let current player choose order", () => {
  let s = own(fixture(), "BC17");
  s.players[0].leader = "LEAD04";
  s.turn.card = "administration-2";
  s = choose(s, "declare");
  assert.equal(s.pending[0].type, "effects");
  assert.equal(decision(s, 0).choices.length, 2);
  s = choose(s, "effect", (c) => c.index === 1);
  assert.equal(s.pending[0].type, "farseersRival");
});
test("Feastbringer pays Guild before declaration, so a given-away Farseers does not trigger", () => {
  let s = own(fixture(), "BC17");
  s.players[0].leader = "LEAD07";
  s.turn.card = "administration-2";
  s = choose(s, "declare");
  assert.ok(s.markers.every((m) => !m.ambition));
  s = choose(s, "give");
  assert.equal(s.markers[2].ambition, "tycoon");
  assert.equal(s.pending.length, 0);
  assert.ok(s.players[1].cards.includes("BC17"));
});
test("BC08 Gatekeepers adds optional dice at gates and places ships in each active gate", () => {
  let s = clear(own(fixture(), "BC08"));
  place(s, 0, "ship", "1-gate");
  place(s, 1, "ship", "1-gate");
  task(s, { type: "dice", system: "1-gate", defender: 1 });
  assert.equal(decision(s, 0).form.max, 3);
  s.pending = [];
  s = choose(s, "guild", (c) => c.card === "BC08");
  while (s.pending[0]?.type === "prelude") s = choose(s, "gatekeeper");
  for (const cluster of s.clusters)
    assert.ok(
      s.pieces.some((x) => x.owner === 0 && x.system === `${cluster}-gate`),
    );
});
test("L07 Repair Drones only repairs an attacking ship and cannot skip required repair", () => {
  let s = own(diceState(), "L07");
  const attackers = s.pending[0].attackers;
  const original = s.pieces.find((x) => x.owner === 0);
  original.damaged = true;
  place(s, 0, "ship", "1-arrow", 1, true);
  task(s, {
    type: "reroll",
    system: "1-arrow",
    defender: 1,
    attackers,
    dice: [],
    used: [],
  });
  s = choose(s, "resolve");
  assert.equal(s.pending[0].type, "repairBonus");
  const cs = decision(s, 0).choices;
  assert.deepEqual(
    cs.map((c) => c.piece),
    [original.id],
  );
  assert.ok(!cs.some((c) => c.op === "skip"));
  s = choose(s, "repairBonus");
  assert.equal(s.pieces.find((x) => x.id === original.id).damaged, false);
});
test("city destruction creates Outrage, keeps Loyal guild, and requires eligible Ransack", () => {
  let s = clear(own(own(fixture(), "BC15"), "BC13"));
  const city = place(s, 1, "city", "1-arrow", 1, true)[0];
  s.court[0].agents = [0, 1, 1, 0];
  task(s, {
    type: "hits",
    system: "1-arrow",
    target: 1,
    dealer: 0,
    left: 1,
    kind: "building",
    battle: true,
  });
  s = choose(s, "hit", (c) => c.piece === city);
  assert.ok(s.players[0].outrage.includes("weapon"));
  assert.ok(s.players[0].cards.includes("BC15"));
  assert.ok(!s.players[0].cards.includes("BC13"));
  assert.equal(s.pending[0].type, "ransack");
  assert.ok(decision(s, 0).choices.every((c) => c.op === "ransack"));
  s = choose(s, "ransack");
  assert.equal(s.players[0].trophies.length, 3);
});
test("LEAD01 Elder forbids battle Ransack and offers Beloved influence", () => {
  let s = clear(fixture());
  s.players[1].leader = "LEAD01";
  const city = place(s, 1, "city", "1-arrow", 1, true)[0];
  task(s, {
    type: "hits",
    system: "1-arrow",
    target: 1,
    dealer: 0,
    left: 1,
    kind: "building",
    battle: true,
  });
  s.pending.push({
    type: "battleEnd",
    p: 0,
    defender: 1,
    system: "1-arrow",
    beforeTrophies: 0,
  });
  s = choose(s, "hit", (c) => c.piece === city);
  assert.equal(s.pending[0].type, "freeChoice");
  assert.equal(s.pending[0].p, 1);
  s = choose(s, "influenceTarget", (c) => c.index === 0, 1);
  assert.equal(s.court[0].agents[1], 1);
});
test("LEAD06 Warrior copied battle bonus moves before a required legal battle", () => {
  let s = clear(fixture());
  s.players[0].leader = "LEAD06";
  const ships = place(s, 0, "ship", "1-arrow");
  place(s, 1, "ship", "1-gate");
  s.turn.suit = "aggression";
  s.turn.mode = "copy";
  s.turn.pips = 1;
  s = choose(s, "action", (c) => c.action === "battle" && c.cost === "pip");
  s = choose(s, "bonusBefore");
  s = choose(s, "moveFrom");
  s = form(s, ships);
  s = choose(s, "moveTo", (c) => c.system === "1-gate");
  assert.ok(decision(s, 0).choices.every((c) => c.op === "battleTarget"));
  s = choose(s, "battleTarget");
  assert.equal(s.turn.pips, 0);
  assert.equal(s.pending[0].type, "dice");
});
test("two-player mulligan exchanges six cards once with no duplication", () => {
  let s = createGame(["A", "B"], { initiative: 0 }, 8);
  const old = [...s.players[1].hand];
  s = choose(s, "mulligan", () => true, 1);
  assert.equal(s.players[1].hand.length, 6);
  assert.ok(s.players[1].hand.every((c) => !old.includes(c)));
  assert.equal(s.pending.length, 0);
  assertDeepInvariants(s);
});
test("chapter five finishes with Power winner and initiative tie-break", () => {
  let s = table();
  while (s.chapter < 5) s = passChapter(s);
  // Everyone passes once more. The final pass still hands the marker on, so
  // the first passer (player 0) holds it at scoring and wins the tie.
  assert.equal(s.initiative, 0);
  let t = structuredClone(s);
  t.players[0].power = 10;
  t.players[3].power = 10;
  t = passChapter(t);
  assert.equal(t.phase, "over");
  assert.equal(t.initiative, 0);
  assert.equal(t.winner, 0);
  assertDeepInvariants(t);
  // Seat 0 holding the marker cannot tell "the holder", "the lowest seat" and
  // "earliest clockwise from the holder" apart. C seizes in real play, so C
  // holds the marker at scoring.
  s = endTurn(play(s, s.players[0].hand[0], "lead"));
  s = copyAndEnd(s);
  s = play(s, s.players[2].hand[0], "copy");
  s = copyAndEnd(endTurn(choose(s, "seize")));
  assert.equal(s.initiative, 2);
  const finish = (powers) => {
    let t = structuredClone(s);
    powers.forEach((n, p) => (t.players[p].power = n));
    t = passChapter(t);
    assert.equal(t.phase, "over");
    assert.equal(t.initiative, 2);
    assertDeepInvariants(t);
    return t.winner;
  };
  // B and D tie above the holder: D is earlier clockwise from C, not B.
  assert.equal(finish([0, 10, 5, 10]), 3);
  // The holder in the tie wins it, over the lower seat B.
  assert.equal(finish([0, 10, 10, 0]), 2);
  // A clear Power lead still wins outright.
  assert.equal(finish([11, 10, 10, 10]), 0);
});
test("game-end tie-break counts clockwise from the first passer, not the last", () => {
  let s = table();
  while (s.chapter < 5) s = passChapter(s);
  s.initiative = s.current = s.roundLeader = 2;
  s.players[1].power = 10;
  s.players[3].power = 10;
  s = passChapter(s);
  assert.equal(s.phase, "over");
  assert.equal(s.initiative, 2);
  // Clockwise from player 2 reaches 3 before 1.
  assert.equal(s.winner, 3);
  assertDeepInvariants(s);
});
test("ending a scored chapter clears trophies/captives and flips lowest marker", () => {
  let s = table({ 0: ["aggression-4", "administration-3"] });
  s.players[0].trophies = [{ owner: 1, type: "agent", id: "test-trophy" }];
  s.players[0].captives = [{ owner: 1, type: "agent", id: "test-captive" }];
  s = play(s, "aggression-4", "lead");
  s = endTurn(choose(s, "declare", (c) => c.ambition === "warlord"));
  for (let i = 1; i < 4; i++) s = copyAndEnd(s);
  s = play(s, "administration-3", "lead");
  s = endTurn(choose(s, "declare", (c) => c.ambition === "tyrant"));
  for (let i = 1; i < 4; i++) s = copyAndEnd(s);
  s = passChapter(s);
  assert.equal(s.chapter, 2);
  // Warlord took the 5/3 marker and Tyrant the 3/2 marker.
  assert.equal(s.players[0].power, 8);
  assert.equal(s.players[0].trophies.length, 0);
  assert.equal(s.players[0].captives.length, 0);
  assert.deepEqual([s.markers[0].high, s.markers[0].low], [4, 2]);
  assert.ok(s.markers.every((m) => !m.ambition));
  assertDeepInvariants(s);
});
test("free bonus actions cannot be replaced with new actions that require paid pips/resources", () => {
  const s = own(fixture(), "BC12");
  s.players[0].captives = [{ id: "captive", owner: 1, type: "agent" }];
  task(s, {
    type: "action",
    action: "influence",
    cost: "free",
    configured: true,
  });
  assert.ok(!decision(s, 0).choices.some((c) => c.op === "special"));
});
test("Living Structures cannot prune a Cloud City or gate building under publisher errata", () => {
  const s = clear(own(fixture(), "L10"));
  const city = place(s, 0, "city", "1-arrow")[0];
  s.pieces.find((x) => x.id === city).cloud = true;
  place(s, 0, "starport", "1-gate");
  task(s, { type: "special", card: "L10", action: "repair", cost: "pip" });
  assert.ok(!decision(s, 0).choices.some((c) => c.op === "prune"));
});
test("Outrage placeholders reserve future agents without a negative displayed supply", () => {
  const s = fixture();
  s.players[0].outrage = ["material", "fuel"];
  s.court[0].agents[0] = 10;
  assert.equal(pool(s, 0, "agent"), 0);
  s.court[0].agents[0] = 7;
  assert.equal(pool(s, 0, "agent"), 1);
});
test("consecutive voluntary initiative passes end the chapter", () => {
  let s = table();
  for (let i = 0; i < 4; i++) s = choose(s, "pass");
  assert.equal(s.chapter, 2);
  assert.ok(s.players.every((p) => p.hand.length === 6));
  // The last pass hands the marker on, so the first passer opens chapter 2.
  assert.equal(s.initiative, 0);
  assert.equal(s.current, 0);
  assert.equal(s.roundLeader, 0);
  assert.deepEqual(s.passes, []);
  assertDeepInvariants(s);
});
test("the first passer opens the next chapter wherever the marker started", () => {
  let s = table();
  s.initiative = s.current = s.roundLeader = 2;
  for (let i = 0; i < 4; i++) {
    assert.equal(s.chapter, 1);
    s = choose(s, "pass");
  }
  assert.equal(s.chapter, 2);
  assert.equal(s.initiative, 2);
  assert.equal(s.current, 2);
  assertDeepInvariants(s);
});
test("a player out of cards is skipped by passes and not waited for", () => {
  let s = settle(createGame(["A", "B", "C"], { initiative: 0 }, 3));
  s.discardDown.push(...s.players[1].hand.splice(0));
  assertDeepInvariants(s);
  s = choose(s, "pass");
  assert.equal(s.initiative, 2);
  assert.equal(s.current, 2);
  assert.equal(s.chapter, 1);
  s = choose(s, "pass");
  // Only players 0 and 2 hold cards and both have passed: the chapter ends,
  // and the marker went to player 0, who passed first.
  assert.equal(s.chapter, 2);
  assert.equal(s.initiative, 0);
  assert.equal(s.current, 0);
  assertDeepInvariants(s);
});
test("seize uses an extra hidden card and cannot be repeated this round", () => {
  let s = table();
  s = endTurn(play(s, s.players[0].hand[0], "lead"));
  s = play(s, s.players[1].hand[0], "copy");
  const n = s.players[1].hand.length;
  s = choose(s, "seize");
  assert.equal(s.players[1].hand.length, n - 1);
  assert.equal(s.initiative, 1);
  assert.equal(s.seized, true);
  assert.equal(viewFor(s, 0).played.at(-1).card, null);
  assert.ok(!decision(s, 1).choices.some((c) => c.op === "seize"));
  assertDeepInvariants(s);
});
test("weapons unlock battles for pips, never for fuel or psionic actions of another suit", () => {
  let s = resources(fixture(), 0, ["weapon", "psionic"]);
  s = choose(s, "weapons", (c) => c.cost === 0);
  const system = s.pieces.find(
    (x) => x.owner === 0 && x.type === "ship",
  ).system;
  place(s, 1, "ship", system);
  const cs = decision(s, 0).choices;
  assert.ok(cs.some((c) => c.action === "battle" && c.cost === "pip"));
  assert.ok(
    !cs.some((c) => c.action === "battle" && typeof c.cost === "number"),
  );
  s = choose(s, "endPrelude");
  assert.equal(s.held.length, 0);
});
test("fleet elimination revives three fresh ships at a chosen active gate", () => {
  let s = clear(fixture());
  s = choose(s, "endTurn");
  assert.equal(s.pending[0].type, "revive");
  s = choose(s, "revive", (c) => c.system === "1-gate");
  assert.equal(
    s.pieces.filter((x) => x.owner === 0 && x.system === "1-gate").length,
    3,
  );
  assert.equal(s.current, 1);
});
for (const [id, r] of [
  ["BC02", "material"],
  ["BC09", "fuel"],
])
  test(`${id} discarded Interest fills empty slots then steals after supply empties`, () => {
    let s = own(fixture(), id);
    for (const p of s.players) resources(s, p.id, []);
    resources(s, 1, [r, r, r]);
    resources(s, 2, [r]);
    s = choose(s, "guild", (c) => c.card === id);
    s = choose(s, "interestGain");
    s = choose(s, "stealResource", (c) => c.defender === 1);
    s = choose(s, "stealResource", (c) => c.defender === 1);
    assert.equal(s.players[0].resources.filter((x) => x === r).length, 3);
    assert.equal(s.supply[r], 0);
    assert.ok(s.courtDiscard.includes(id));
  });
for (const [id, r] of [
  ["BC03", "material"],
  ["BC06", "fuel"],
])
  test(`${id} discarded Cartel steals one resource`, () => {
    let s = own(fixture(), id);
    resources(s, 0, []);
    resources(s, 1, [r]);
    s = choose(s, "guild", (c) => c.card === id);
    s = choose(s, "stealResource", (c) => c.defender === 1);
    assert.ok(s.players[0].resources.includes(r));
    assert.ok(s.courtDiscard.includes(id));
  });
for (const id of ["BC12", "BC13", "BC14", "BC15"])
  test(`${id} discard deploys three ships in a controlled system`, () => {
    let s = own(fixture(), id);
    const n = pool(s, 0, "ship");
    s = choose(s, "guild", (c) => c.card === id);
    s = choose(s, "placeFleet");
    assert.equal(pool(s, 0, "ship"), n - 3);
    assert.ok(s.courtDiscard.includes(id));
  });
test("BC17 Farseers declared inspection is private and swaps exactly one card", () => {
  let s = own(fixture(), "BC17");
  s.turn.card = "administration-2";
  s = choose(s, "declare");
  s = choose(s, "inspectHand", (c) => c.rival === 1);
  assert.equal(viewFor(s, 2).decision.choices.length, 0);
  const take = decision(s, 0).choices.find((c) => c.op === "swapTake").card;
  const give = s.players[0].hand[0];
  s = choose(s, "swapTake", (c) => c.card === take);
  s = choose(s, "swapGive", (c) => c.card === give);
  assert.ok(s.players[0].hand.includes(take));
  assert.ok(s.players[1].hand.includes(give));
  assert.equal(s.players[0].hand.length, 6);
  assert.equal(s.players[1].hand.length, 6);
});
test("BC17 Farseers can discard itself alone to draw one action card", () => {
  let s = own(fixture(), "BC17");
  const n = s.players[0].hand.length;
  s = choose(s, "guild", (c) => c.card === "BC17");
  s = form(s, []);
  assert.equal(s.players[0].hand.length, n + 1);
  assert.ok(s.courtDiscard.includes("BC17"));
});
test("BC23 Elder Broker discard gains all three different resources", () => {
  let s = resources(own(fixture(), "BC23"), 0, []);
  s = choose(s, "guild", (c) => c.card === "BC23");
  assert.deepEqual(s.players[0].resources.filter(Boolean), [
    "material",
    "fuel",
    "weapon",
  ]);
});
test("resource rearrangement swaps occupied and empty slots without creating tokens", () => {
  let s = resources(fixture(), 0, ["relic", "fuel"]);
  task(s, { type: "arrangeResources" });
  s = choose(s, "arrangePick", (c) => c.index === 0);
  s = choose(s, "swapSlot", (c) => c.index === 1);
  assert.deepEqual(s.players[0].resources.slice(0, 2), ["fuel", "relic"]);
  assertDeepInvariants(s);
});
test("gate city tax chooses from all planet-city types in the cluster", () => {
  let s = clear(fixture());
  place(s, 1, "city", "1-arrow");
  place(s, 2, "city", "1-hex");
  const gate = place(s, 0, "city", "1-gate")[0];
  s = act(s, "tax", "taxTarget", (c) => c.piece === gate);
  assert.deepEqual(
    decision(s, 0).choices.map((c) => c.resource),
    ["weapon", "material"],
  );
  s = choose(s, "taxResource", (c) => c.resource === "material");
  assert.ok(s.players[0].resources.includes("material"));
});
test("Living Structures Nurture taxes and applies Mystic’s copied tax modifier", () => {
  let s = resources(own(fixture(), "L10"), 0, []);
  s.players[0].leader = "LEAD02";
  s.turn.mode = "copy";
  s.turn.suit = "construction";
  s = choose(s, "action", (c) => c.action === "build" && c.cost === "pip");
  s = choose(s, "special", (c) => c.card === "L10");
  s = choose(s, "nurture");
  assert.ok(s.players[0].resources.includes("psionic"));
});
test("Prison Wardens Pressgang returns captives and grants one resource each", () => {
  let s = resources(own(fixture(), "BC12"), 0, []);
  s.players[0].captives = [
    { id: "a", type: "agent", owner: 1 },
    { id: "b", type: "agent", owner: 2 },
  ];
  s.turn.suit = "construction";
  s = choose(s, "action", (c) => c.action === "build" && c.cost === "pip");
  s = choose(s, "special", (c) => c.card === "BC12");
  s = form(s, ["a", "b"]);
  assert.equal(s.players[0].captives.length, 0);
  s = choose(s, "gain", (c) => c.resource === "relic");
  s = choose(s, "gain", (c) => c.resource === "psionic");
  assert.equal(s.players[0].resources.filter(Boolean).length, 2);
});
test("Empath’s Vision also rerolls Galactic Rifles outside battle", () => {
  let s = clear(own(own(fixture(), "L02"), "L19"));
  s.markers[2].ambition = "empath";
  place(s, 0, "ship", "1-arrow");
  place(s, 1, "ship", "1-gate");
  s.turn.suit = "aggression";
  s = choose(s, "action", (c) => c.action === "battle" && c.cost === "pip");
  s = choose(s, "special", (c) => c.card === "L02");
  s = choose(s, "rifles");
  s = choose(s, "rifleDice", (c) => c.n === 1);
  assert.equal(s.pending[0].stage, "reroll");
  s = form(s, ["0"]);
  assert.notEqual(s.pending[0]?.stage, "reroll");
});
test("highest Surpass wins initiative when nobody seized it", () => {
  let s = table({
    0: ["administration-2"],
    1: ["administration-3"],
    2: ["administration-6"],
  });
  s = endTurn(play(s, "administration-2", "lead"));
  s = endTurn(play(s, "administration-3", "surpass"));
  s = endTurn(play(s, "administration-6", "surpass"));
  s = copyAndEnd(s);
  assert.equal(s.initiative, 2);
  assert.equal(s.current, 2);
  assertDeepInvariants(s);
});
test("Union retrieval happens at round end and returns its card to the discard", () => {
  const target = "administration-3";
  let s = own(table({ 0: [target] }), "BC04", 1);
  s = endTurn(play(s, target, "lead"));
  s = play(s, s.players[1].hand[0], "copy");
  s = choose(s, "guild", (c) => c.card === "BC04");
  s = endTurn(choose(s, "union", (c) => c.target === target));
  assert.deepEqual(s.unions, [{ p: 1, card: "BC04", target }]);
  s = copyAndEnd(copyAndEnd(s));
  assert.ok(s.players[1].hand.includes(target));
  assert.ok(s.courtDiscard.includes("BC04"));
  assert.equal(s.unions.length, 0);
  assertDeepInvariants(s);
});
test("Corsair counts resource types held on Cartels for its raid reroll limit", () => {
  let s = resources(own(diceState(), "BC03"), 0, ["fuel"]);
  s.players[0].leader = "LEAD11";
  s.pending[0] = {
    ...s.pending[0],
    type: "reroll",
    dice: [{ type: "raid", faces: [] }],
    used: [],
    freshAttack: 3,
  };
  assert.equal(
    decision(s, 0).choices.find((c) => c.ability === "Corsair").max,
    2,
  );
});
test("Elder Broker cannot give a resource type that a rival holds through a Cartel", () => {
  let s = clear(own(own(fixture(), "BC23"), "BC06", 1));
  place(s, 1, "city", "1-arrow");
  place(s, 0, "ship", "1-arrow");
  resources(s, 0, ["fuel"]);
  resources(s, 1, ["weapon"]);
  task(s, { type: "special", card: "BC23", action: "tax", cost: "pip" });
  assert.ok(!decision(s, 0).choices.some((c) => c.op === "trade"));
});
// A5: a resource-paid Trade spends its slot first, so that slot is never offered.
function brokerTable(mine, theirs) {
  let s = clear(own(fixture(), "BC23"));
  place(s, 1, "city", "1-arrow");
  place(s, 0, "ship", "1-arrow");
  resources(s, 0, mine);
  resources(s, 1, theirs);
  return s;
}
test("Elder Broker Trade paid with a resource never offers the paying slot", () => {
  let s = brokerTable(["psionic", "fuel"], ["weapon"]);
  const before = tokens(s);
  s = choose(s, "action", (c) => c.action === "tax" && c.cost === 0);
  s = choose(s, "special", (c) => c.card === "BC23");
  const trades = decision(s, 0).choices.filter((c) => c.op === "trade");
  assert.ok(trades.length > 0);
  assert.ok(trades.every((c) => c.give === 1));
  s = choose(s, "trade");
  assert.deepEqual(s.players[0].resources, [null, "weapon"]);
  assert.deepEqual(s.players[1].resources.filter(Boolean), ["fuel"]);
  assert.deepEqual(s.held, ["psionic"]);
  assert.equal(tokens(s), before);
  assertDeepInvariants(s);
});
test("Elder Broker Trade is not offered when the only giveable token pays for it", () => {
  let s = brokerTable(["psionic", "weapon"], ["weapon"]);
  // The Broker has no weapon to give (the rival holds one), so the paying
  // psionic is the only candidate; the Trade must not be offered.
  s = choose(s, "action", (c) => c.action === "tax" && c.cost === 0);
  assert.ok(!decision(s, 0).choices.some((c) => c.card === "BC23"));
  assertDeepInvariants(s);
});
test("Elder Broker Trade paid with a pip still offers every slot", () => {
  let s = brokerTable(["psionic", "fuel"], ["weapon"]);
  s = choose(s, "action", (c) => c.action === "tax" && c.cost === "pip");
  s = choose(s, "special", (c) => c.card === "BC23");
  const gives = decision(s, 0)
    .choices.filter((c) => c.op === "trade")
    .map((c) => c.give);
  assert.deepEqual(gives, [0, 1]);
});
test("Overseer may use Ruthless to hit a starport when no ships remain in supply", () => {
  let s = clear(fixture());
  s.players[0].leader = "LEAD10";
  place(s, 0, "ship", "1-arrow", 15);
  const port = place(s, 0, "starport", "1-arrow")[0];
  s.turn.suit = "construction";
  s = choose(s, "action", (c) => c.action === "build" && c.cost === "pip");
  s = choose(s, "ruthlessEmptyBuild");
  assert.equal(s.pieces.find((x) => x.id === port).damaged, true);
  assert.ok(s.turn.used.includes("ruthless"));
  assert.equal(s.turn.pips, 3);
  assert.equal(pool(s, 0, "ship"), 0);
});
test("public draft candidates are visible to every player while the unused lore deck stays private", () => {
  const s = createGame(["A", "B", "C"], { leaders: true, initiative: 0 }, 5);
  const observer = viewFor(s, 0);
  assert.deepEqual(observer.draft.leaders, s.draft.leaders);
  assert.deepEqual(observer.draft.lore, s.draft.lore);
  assert.equal(observer.draft.remaining, undefined);
  assert.equal(observer.decision.choices.length, 0);
});

test("public declaration context retains printed rank, declarer and marker after turn ends", () => {
  let s = fixture();
  s.turn.card = "mobilization-2";
  s.turn.suit = "mobilization";
  s.lead = { ...ACTION_CARDS["mobilization-2"], player: 0 };
  s = choose(s, "declare", (c) => c.ambition === "tycoon");
  s = choose(s, "endTurn");
  const v = viewFor(s, 1);
  assert.equal(v.lead.rank, 0);
  assert.deepEqual(v.lead.declarations, [
    { player: 0, ambition: "tycoon", high: 5, low: 3, zero: true },
  ]);
  assert.equal(ACTION_CARDS[v.lead.id].rank, 2);
});

test("declaration context distinguishes a declaration that preserves rank", () => {
  let s = fixture();
  own(s, "BC18");
  s.turn.card = "administration-5";
  s.lead = { ...ACTION_CARDS["administration-5"], player: 0 };
  s = choose(s, "declare");
  assert.equal(s.lead.rank, 5);
  assert.equal(viewFor(s, 2).lead.declarations[0].zero, false);
});
// A4/C6: choosing the "after" bonus commits to the paid action. There is no
// Back that could strand the queued free bonus, and an impossible main action
// rolls the whole choice back to the action list.
const beforeBonus = (leader, suit, main) => {
  let s = table({ 0: [`${suit}-4`] });
  s = play(s, `${suit}-4`, "lead");
  s = endTurn(choose(s, "declare"));
  s.players[1].leader = leader;
  s = play(
    s,
    s.players[1].hand.find((c) => c.startsWith(suit)),
    "copy",
  );
  assert.equal(s.current, 1);
  // Give the paid action a legal target, so the choice is not undone at once.
  if (main === "battle") {
    place(s, 0, "ship", "1-arrow");
    place(s, 1, "ship", "1-arrow");
  } else s.court.forEach((c) => (c.agents = [0, 2, 0, 0]));
  return s;
};
const afterBonus = (leader, suit, main) =>
  choose(
    beforeBonus(leader, suit, main),
    "action",
    (c) => c.action === main && c.cost === "pip",
  );
for (const [leader, suit, bonus, main] of [
  ["LEAD06", "aggression", "move", "battle"],
  ["LEAD07", "aggression", "influence", "secure"],
])
  test(`${leader} "${bonus} after" then Back cannot leave a free ${bonus} queued`, () => {
    let s = afterBonus(leader, suit, main);
    const pips = s.turn.pips;
    s = choose(s, "bonusAfter");
    const d = decision(s, 1);
    assert.ok(!d.choices.some((c) => c.op === "cancel" || c.op === "skip"));
    assert.equal(s.turn.pips, pips);
    assert.deepEqual(
      s.pending.map((t) => [t.action, t.cost, !!t.required]),
      [
        [main, "pip", true],
        [bonus, "free", false],
      ],
    );
    assertDeepInvariants(s);
  });
for (const [leader, suit, bonus, main] of [
  ["LEAD06", "aggression", "move", "battle"],
  ["LEAD07", "aggression", "influence", "secure"],
])
  test(`${leader} "${bonus} after" is undone whole if the ${main} has no legal target`, () => {
    let s = afterBonus(leader, suit, main);
    if (main === "battle")
      s.pieces = s.pieces.filter((x) => x.system !== "1-arrow");
    else s.court.forEach((c) => (c.agents = [0, 0, 2, 0]));
    const pips = s.turn.pips;
    s = choose(s, "bonusAfter");
    assert.equal(s.pending.length, 0);
    assert.equal(s.turn.pips, pips);
    assert.match(s.log.at(-1).text, /undone/);
    assert.ok(
      decision(s, 1).choices.some(
        (c) => c.op === "action" && c.action === main,
      ),
    );
    assertDeepInvariants(s);
  });
// Removing standardOnly offers Galactic Rifles on the pip-paid battle; its own
// Back button must not become a second way to drop the paid action.
for (const when of ["bonusAfter", "bonusBefore"])
  test(`Warrior ${when} then Galactic Rifles offers no Back`, () => {
    let s = own(afterBonus("LEAD06", "aggression", "battle"), "L02", 1);
    const pips = s.turn.pips;
    s = choose(s, when);
    if (when === "bonusBefore") {
      const ship = s.pieces.find((x) => x.owner === 1 && x.type === "ship");
      s = choose(s, "moveFrom", (c) => c.system === ship.system);
      s = form(s, [ship.id]);
      s = choose(s, "moveTo");
    }
    s = choose(s, "special", (c) => c.card === "L02");
    const d = decision(s, 1);
    assert.ok(!d.choices.some((c) => c.op === "cancel" || c.op === "skip"));
    assert.equal(s.turn.pips, pips);
    assertDeepInvariants(s);
  });

// ---- M5: battle decision fixes (A2, A10, A11) ----
// Elder protects only battles. Galactic Rifles is a new action, not Battle;
// its FAQ explicitly excludes abilities that modify Battle.
for (const [leader, battle, ransacks] of [
  ["LEAD01", false, true],
  ["LEAD01", true, false],
  ["LEAD02", false, true],
])
  test(`${battle ? "Battle" : "Galactic Rifles"} destroying a city of ${leader} ${ransacks ? "ransacks" : "pushes no ransack"}`, () => {
    let s = clear(fixture());
    s.players[1].leader = leader;
    const city = place(s, 1, "city", "1-arrow", 1, true)[0];
    const lane = s.court.find((c) => c.id);
    s.players[1].agents--;
    lane.agents[1] = (lane.agents[1] ?? 0) + 1;
    task(s, {
      type: "hits",
      system: "1-arrow",
      target: 1,
      dealer: 0,
      left: 1,
      kind: "hit",
      battle,
    });
    s = choose(s, "hit", (c) => c.piece === city);
    assert.ok(!s.pieces.some((x) => x.id === city));
    assert.ok(s.players[0].outrage.length > 0, "Outrage provoked");
    assert.equal(
      s.pending.some((t) => t.type === "ransack"),
      ransacks,
    );
    assertDeepInvariants(s);
  });
test("LEAD15 Agitator with several Weapons chooses which slot to discard", () => {
  let s = resources(own(diceState(), "BC15", 1), 1, [
    "weapon",
    "fuel",
    "weapon",
  ]);
  s.players[1].leader = "LEAD15";
  s.pending[0] = {
    ...s.pending[0],
    type: "reroll",
    dice: [{ type: "assault", faces: ["intercept"] }],
    used: [],
    allFresh: true,
  };
  s = choose(s, "resolve");
  assert.equal(s.pending[0].type, "agitatorWeapon");
  assert.equal(s.pending[0].p, 1);
  assert.equal(s.players[1].resources.filter((r) => r === "weapon").length, 2);
  s = choose(s, "agitatorPay", (c) => c.index === 2, 1);
  assert.deepEqual(s.players[1].resources.slice(0, 3), [
    "weapon",
    "fuel",
    null,
  ]);
  assert.equal(s.pending[0].type, "hits");
  assert.equal(s.pending[0].left, 3);
  assertDeepInvariants(s);
});
test("LEAD15 Agitator intercept is defined by the roll, not by fresh ships", () => {
  let s = resources(own(diceState(), "BC15", 1), 1, ["weapon"]);
  s.players[1].leader = "LEAD15";
  for (const x of s.pieces)
    if (x.owner === 1 && x.type === "ship") x.damaged = true;
  s.pending[0] = {
    ...s.pending[0],
    type: "reroll",
    dice: [{ type: "assault", faces: ["intercept"] }],
    used: [],
    allFresh: true,
  };
  s = choose(s, "resolve");
  assert.equal(s.pending[0].type, "hits");
  assert.equal(s.pending[0].left, 2);
  assert.equal(s.players[1].resources.filter((r) => r === "weapon").length, 0);
  assertDeepInvariants(s);
});
test("rerolling no dice keeps the ability available; rerolling one spends it", () => {
  let s = own(diceState(), "L14", 0);
  s.pending[0] = {
    ...s.pending[0],
    type: "reroll",
    dice: [{ type: "assault", faces: [] }],
    used: [],
    freshAttack: 3,
  };
  s.lastBattle = { attacker: 0, defender: 1, system: "1-arrow", dice: [] };
  const ability = (s) => decision(s, 0).choices.some((c) => c.op === "reroll");
  assert.ok(ability(s));
  s = choose(s, "reroll");
  s = form(s, []);
  assert.equal(s.pending[0].type, "reroll");
  assert.deepEqual(s.pending[0].used, []);
  assert.ok(ability(s));
  s = choose(s, "reroll");
  s = form(s, ["0"]);
  assert.equal(s.pending[0].used.length, 1);
  assert.ok(!ability(s));
});
test("a battle with 0 dice skips the resolve-or-reroll step; Repair Drones still fires", () => {
  let s = own(diceState(), "L07", 0);
  s.pieces.find((x) => x.owner === 0).damaged = true;
  s = form(s, { skirmish: 0, assault: 0, raid: 0 });
  assert.equal(s.pending[0].type, "repairBonus");
  assertDeepInvariants(s);
});
for (const type of ["effects", "farseersDiscard"])
  test(`non-actors see the specific activity label for ${type}`, () => {
    const s = fixture();
    task(s, { type, p: 0 });
    const label = viewFor(s, 1).activity.label;
    assert.notEqual(label, "Resolving an action or ability");
  });

// ---- M6: lenient declare and seize timing (item 16, C10) ----
// Declaring and seizing stay open after actions until the turn reveals
// something new. These tests reach each boundary through real plays.
const declares = (s, p = s.current) =>
  decision(s, p).choices.some((c) => c.op === "declare");
const seizes = (s, p = s.current) =>
  decision(s, p).choices.some((c) => c.op === "seize");
// Finishes whatever is queued (a battle, a response) with the timeout policy.
function resolveAll(s) {
  for (let n = 0; s.pending.length && n < 50; n++)
    s = settle(transition(s, s.pending[0].p, timeoutInput(s)));
  assert.equal(s.pending.length, 0);
  return s;
}
function moveFleet(s, from, to, cost = "pip") {
  s = act(s, "move", "moveFrom", (c) => c.system === from, cost);
  s = form(
    s,
    decision(s, s.current).form.options.map((o) => o.id),
  );
  return choose(s, "moveTo", (c) => c.system === to);
}
// Player 0 leads Aggression 2 (Tycoon) with a rival ship in its 1-gate fleet.
function battleTable() {
  const s = table({ 0: ["aggression-2"] });
  place(s, 1, "ship", "1-gate", 1);
  return play(s, "aggression-2", "lead");
}
// Puts `id` into Court lane `i` by swapping it with that lane's card, so every
// card stays in exactly one place.
function putCourt(s, id, i) {
  const at = s.court.findIndex((c) => c.id === id);
  if (at === i) return s;
  if (at >= 0) [s.court[at].id, s.court[i].id] = [s.court[i].id, id];
  else {
    const list = s.courtDeck.includes(id) ? s.courtDeck : s.courtDiscard;
    [list[list.indexOf(id)], s.court[i].id] = [s.court[i].id, id];
  }
  return s;
}
// Court lane 1 holds `id` with one agent of player 0's, and the Court deck is
// emptied into the discard, so securing the card refills nothing.
function soleCourtCard(s, id) {
  s.courtDeck = s.courtDeck.filter((c) => c !== id);
  s.courtDiscard.push(s.court[1].id, ...s.courtDeck);
  s.courtDeck = [];
  s.court[1] = { id, agents: s.players.map((_, i) => (i === 0 ? 1 : 0)) };
  return s;
}
test("declaring stays open after a build and still places the zero marker", () => {
  let s = play(table(), "construction-2", "lead");
  s = act(s, "build", "buildTarget", (c) => c.kind === "ship");
  assert.ok(s.turn.acted);
  assert.equal(s.turn.revealed, false);
  assert.ok(declares(s));
  s = choose(s, "declare");
  assert.equal(s.markers[2].ambition, "tycoon");
  assert.equal(s.lead.rank, 0, "a late lead declaration still places the zero");
  assert.ok(!declares(s));
  assertDeepInvariants(s);
});
test("declaring stays open after a tax that captures an agent", () => {
  let s = table();
  place(s, 0, "ship", "4-hex", 4);
  s = play(s, "administration-2", "lead");
  s = act(s, "tax", "taxTarget", (c) => c.system === "4-hex");
  assert.equal(s.players[0].captives.length, 1);
  assert.equal(s.turn.revealed, false);
  s = choose(s, "declare");
  assert.equal(s.lead.rank, 0);
  assertDeepInvariants(s);
});
test("declaring stays open after a Prelude Fuel move", () => {
  let s = play(resources(table(), 0, ["fuel"]), "construction-2", "lead");
  s = moveFleet(s, "4-arrow", "4-crescent", 0);
  assert.ok(s.turn.prelude && s.turn.acted);
  assert.equal(s.turn.revealed, false);
  s = choose(s, "declare");
  assert.equal(s.markers[2].ambition, "tycoon");
  assertDeepInvariants(s);
});
test("declaring closes after a battle roll, and every view says why", () => {
  let s = battleTable();
  assert.ok(declares(s));
  s = act(s, "battle", "battleTarget", (c) => c.system === "1-gate");
  s = form(s, { skirmish: 2, assault: 0, raid: 0 });
  assert.equal(s.turn.revealed, "dice");
  s = resolveAll(s);
  assert.ok(s.turn.pips > 0, "the turn goes on");
  assert.ok(!declares(s));
  assert.equal(viewFor(s, 0).turn.revealed, "dice");
  assert.equal(viewFor(s, 2).turn.revealed, "dice");
  assertDeepInvariants(s);
});
test("declaring closes after a secure refills the Court", () => {
  let s = table({ 0: ["aggression-2"] });
  s.court[1].agents[0] = 1;
  const top = s.courtDeck[0];
  s = play(s, "aggression-2", "lead");
  s = act(s, "secure", "secureTarget", (c) => c.index === 1);
  assert.equal(s.court[1].id, top);
  assert.equal(s.turn.revealed, "deck");
  assert.ok(!declares(s));
  assertDeepInvariants(s);
});
// A3 in real play (M2 could only inject the vox task): securing Populist
// Demands normally refills the Court, which closes the lead declaration, so
// both declarations need a Court deck with nothing left to reveal.
test("with an empty Court deck, the lead declaration follows Populist Demands in real play", () => {
  let s = soleCourtCard(table({ 0: ["aggression-2"] }), "BC27");
  s = play(s, "aggression-2", "lead");
  s = act(s, "secure", "secureTarget", (c) => c.index === 1);
  s = choose(s, "populist", (c) => c.ambition === "warlord");
  assert.equal(s.court[1].id, null, "nothing to refill");
  assert.equal(s.turn.revealed, false);
  s = choose(s, "declare");
  assert.deepEqual(declaredBy(s), ["warlord", "tycoon"]);
  assert.equal(s.lead.rank, 0);
  assertDeepInvariants(s);
});
test("Call to Action's draw closes declaring even when nothing refills the Court", () => {
  let s = soleCourtCard(table({ 0: ["aggression-2"] }), "BC31");
  s = play(s, "aggression-2", "lead");
  const hand = s.players[0].hand.length;
  s = act(s, "secure", "secureTarget", (c) => c.index === 1);
  s = choose(s, "call");
  assert.equal(s.players[0].hand.length, hand + 1);
  assert.equal(s.court[1].id, null);
  assert.equal(s.turn.revealed, "deck");
  assert.ok(!declares(s));
  assertDeepInvariants(s);
});
for (const leader of [null, "LEAD04"])
  test(`skipping a Union is not an action and leaves declaring open${leader ? " for Upstart" : ""} (C10)`, () => {
    let s = own(table(), "BC04");
    s.players[0].leader = leader;
    s = play(s, "administration-2", "lead");
    s = choose(s, "guild", (c) => c.card === "BC04");
    s = choose(s, "skip");
    assert.ok(!s.turn.acted);
    assert.ok(s.players[0].cards.includes("BC04"));
    assert.ok(declares(s));
    // Placing it is an action, which closes Upstart's declaration only.
    s = choose(s, "guild", (c) => c.card === "BC04");
    s = choose(s, "union", (c) => c.target === "administration-2");
    assert.ok(s.turn.acted);
    assert.equal(declares(s), !leader);
    assertDeepInvariants(s);
  });
test("Upstart's declaration closes after any action, even with nothing revealed", () => {
  let s = table();
  s.players[0].leader = "LEAD04";
  s = play(s, "construction-2", "lead");
  assert.ok(declares(s));
  s = act(s, "build", "buildTarget", (c) => c.kind === "ship");
  assert.equal(s.turn.revealed, false);
  assert.ok(!declares(s));
});
test("Tycoon's Ambition closes after any other action; the lead declaration stays open", () => {
  let s = resources(own(table(), "L27"), 0, ["material", "fuel"]);
  s.markers[2].ambition = "tycoon";
  s = play(s, "construction-2", "lead");
  const tycoon = (s) =>
    decision(s, 0).choices.some((c) => c.op === "guild" && c.card === "L27");
  assert.ok(tycoon(s));
  s = act(s, "build", "buildTarget", (c) => c.kind === "ship", 0);
  assert.ok(s.turn.prelude && s.turn.acted);
  assert.ok(!tycoon(s));
  assert.ok(declares(s));
  assertDeepInvariants(s);
});
test("Galactic Bards' declaration closes after any action; seizing stays open", () => {
  let s = own(table(), "BC25", 1);
  s = play(
    endTurn(play(s, "construction-2", "lead")),
    "mobilization-5",
    "pivot",
  );
  assert.ok(declares(s));
  s = moveFleet(s, "4-hex", "4-crescent");
  assert.equal(s.turn.revealed, false);
  assert.ok(!declares(s));
  assert.ok(seizes(s));
});
test("seizing stays open after a move and still discards an extra card face down", () => {
  let s = endTurn(play(table(), "construction-2", "lead"));
  s = play(s, "mobilization-5", "pivot");
  s = moveFleet(s, "4-hex", "4-crescent");
  assert.ok(s.turn.acted);
  assert.equal(s.turn.revealed, false);
  const hand = s.players[1].hand.length;
  s = choose(s, "seize");
  assert.equal(s.players[1].hand.length, hand - 1);
  assert.equal(s.initiative, 1);
  assert.ok(s.seized);
  assert.deepEqual(
    { ...s.played.at(-1), card: null },
    { card: null, player: 1, mode: "seize", faceup: false },
  );
  assert.equal(viewFor(s, 0).played.at(-1).card, null);
  assertDeepInvariants(s);
});
test("seizing closes after a battle roll", () => {
  let s = table();
  place(s, 0, "ship", "6-gate", 1);
  s = endTurn(play(s, "construction-2", "lead"));
  s = play(s, "aggression-5", "pivot");
  assert.ok(seizes(s));
  s = act(s, "battle", "battleTarget", (c) => c.system === "6-gate");
  s = resolveAll(form(s, { skirmish: 2, assault: 0, raid: 0 }));
  assert.equal(s.turn.revealed, "dice");
  assert.ok(!seizes(s));
  assertDeepInvariants(s);
});
test("Railgun Arrays firing closes declaring even with no dice rolled", () => {
  let s = own(battleTable(), "L12", 1);
  const rng = s.rng;
  s = act(s, "battle", "battleTarget", (c) => c.system === "1-gate");
  assert.equal(s.turn.revealed, "rival");
  s = choose(s, "hit");
  s = resolveAll(form(s, { skirmish: 0, assault: 0, raid: 0 }));
  assert.equal(s.rng, rng, "no dice were rolled");
  assert.ok(!declares(s));
  assertDeepInvariants(s);
});
test("a Predictive Sensors response closes declaring even with no dice rolled", () => {
  let s = own(battleTable(), "L15", 1);
  s = act(s, "battle", "battleTarget", (c) => c.system === "1-gate");
  assert.equal(s.pending[0].p, 1);
  assert.equal(s.turn.revealed, "rival");
  s = form(s, []);
  s = resolveAll(form(s, { skirmish: 0, assault: 0, raid: 0 }));
  assert.ok(!declares(s));
  assertDeepInvariants(s);
});
// The rulebook puts declaring and seizing before Prelude actions, in either
// order. A reveal triggered by a declaration (Noble, Farseers) happens inside
// that window, so it closes them only once an action follows.
test("Noble's draw on Tycoon's Ambition leaves the lead declaration open until an action", () => {
  let s = resources(own(table(), "L27"), 0, ["material", "fuel"]);
  s.players[0].leader = "LEAD12";
  s.markers[2].ambition = "tycoon";
  const top = s.courtDeck[0];
  s = play(s, "construction-2", "lead");
  s = choose(s, "guild", (c) => c.card === "L27");
  s = choose(s, "tycoonDeclare", (c) => c.ambition === "keeper");
  assert.ok(s.players[0].cards.includes(top), "Noble secured the deck top");
  assert.equal(s.turn.revealed, "deck");
  assert.ok(!s.turn.acted);
  assert.ok(declares(s));
  s = act(s, "build", "buildTarget", (c) => c.kind === "ship");
  assert.ok(!declares(s));
  assertDeepInvariants(s);
});
test("Farseers' look on a Galactic Bards declaration leaves seizing open until an action", () => {
  let s = own(own(table(), "BC25", 1), "BC17", 1);
  s = play(
    endTurn(play(s, "construction-2", "lead")),
    "mobilization-5",
    "pivot",
  );
  s = choose(s, "declare");
  s = choose(s, "inspectHand", (c) => c.rival === 0);
  s = choose(s, "skip");
  assert.equal(s.turn.revealed, "hand");
  assert.ok(seizes(s));
  s = moveFleet(s, "4-hex", "4-crescent");
  assert.ok(!seizes(s));
  assertDeepInvariants(s);
});
test("the timeout policy never declares after a reveal", () => {
  // Player 0 leads Keeper holding the only Relic, so declaring is worth it.
  const ready = () => {
    const s = table({ 0: ["aggression-5"] });
    place(s, 1, "ship", "1-gate", 1);
    return choose(play(s, "aggression-5", "lead"), "endPrelude");
  };
  const pick = (s) => decision(s, 0).choices[timeoutInput(s).choice].op;
  assert.equal(pick(ready()), "declare");
  // The printed window can outlast a reveal (Noble, Farseers); the bot still
  // passes it up.
  let s = ready();
  s.turn.revealed = "deck";
  assert.ok(declares(s));
  assert.notEqual(pick(s), "declare");
  s = act(ready(), "battle", "battleTarget", (c) => c.system === "1-gate");
  s = resolveAll(form(s, { skirmish: 2, assault: 0, raid: 0 }));
  assert.ok(!declares(s));
  assert.notEqual(pick(s), "declare");
});
// A Lore Prelude opened and closed with Done does nothing, so like a skipped
// Union it is not an action; Upstart shows it, since its declaration closes
// at the first action whatever has been revealed.
const LORE_SETUP = {
  L24: (s) => {
    s.markers[0].ambition = "warlord";
    s.players[0].trophies.push({
      id: `p${++s.pieceId}`,
      type: "ship",
      owner: 1,
    });
  },
  L25: (s) => {
    s.markers[0].ambition = "tyrant";
    s.players[0].captives.push({
      id: `p${++s.pieceId}`,
      type: "agent",
      owner: 1,
    });
    s.court[1].agents[0] = 1;
  },
  L28: (s) => {
    s.markers[0].ambition = "tycoon";
    resources(s, 0, ["material"]);
  },
};
function upstartLore(card) {
  const s = own(table(), card);
  s.players[0].leader = "LEAD04";
  LORE_SETUP[card]?.(s);
  return choose(
    play(s, "construction-2", "lead"),
    "guild",
    (c) => c.card === card,
  );
}
for (const card of ["L19", "L21", "L23", "L24", "L25", "L28"])
  test(`opening ${CARDS[card].name}'s Prelude and pressing Done is not an action`, () => {
    const s = choose(upstartLore(card), "skip");
    assert.ok(!s.turn.acted);
    assert.ok(s.players[0].cards.includes(card));
    assert.ok(declares(s), "Upstart can still declare");
    assertDeepInvariants(s);
  });
for (const [card, use] of [
  ["L19", (s) => choose(s, "clearOutrage")],
  ["L24", (s) => choose(choose(s, "spendTrophy"), "skip")],
  ["L25", (s) => choose(choose(s, "spendCaptive"), "skip")],
  ["L28", (s) => choose(form(choose(s, "tycoonTrade"), ["0"]), "gain")],
])
  test(`using ${CARDS[card].name}'s Prelude is an action`, () => {
    const s = use(upstartLore(card));
    assert.ok(s.turn.acted);
    assert.ok(!declares(s), "Upstart's declaration closes");
    assertDeepInvariants(s);
  });

// M7, item 3 (Solution A): the rulebook's split discard piles. Face-up plays
// go to a public face-up pile; copies, seizes, each chapter's leftovers and
// Farseers' own discards go face down; every draw takes the face-down bottom.
const cardLabel = (id) =>
  `${ACTION_CARDS[id].suit[0].toUpperCase()}${ACTION_CARDS[id].suit.slice(1)} ${ACTION_CARDS[id].rank}`;
// Log lines added since `before` name no action card, in text or detail.
function assertLogNamesNoCard(before, after) {
  const added = after.log.filter((e) => e.id > before.eventId);
  for (const e of added) {
    for (const id of Object.keys(ACTION_CARDS))
      assert.ok(
        !e.text.includes(cardLabel(id)) && e.card !== id,
        `Log names ${id}: ${e.text}`,
      );
    // A merge entry may carry the face-up cards it shuffled in, and nothing
    // else: every card in the entry was in the face-up pile beforehand.
    if (e.merge) {
      assert.deepEqual(Object.keys(e), ["id", "text", "merge", "at"]);
      assert.deepEqual(Object.keys(e.merge), ["chapter", "round", "cards"]);
      assert.deepEqual(e.merge.cards, before.discardUp);
    }
  }
  return added;
}
// Round 1: lead, surpass and pivot face up; a copy and a seize face down.
function splitRound() {
  let s = table({
    0: ["administration-2"],
    1: ["administration-4"],
    2: ["aggression-3"],
    3: ["construction-5", "mobilization-6"],
  });
  const leftovers = [...s.discardDown];
  s = endTurn(play(s, "administration-2", "lead"));
  s = endTurn(play(s, "administration-4", "surpass"));
  s = endTurn(play(s, "aggression-3", "pivot"));
  s = play(s, "construction-5", "copy");
  s = endTurn(choose(s, "seize", (c) => c.card === "mobilization-6"));
  return { s, leftovers };
}
// 3p, round 1 with no copies: three face-up cards, the two leftovers face
// down. Player 1 surpassed, so leads round 2 holding Farseers.
function farseersRound3p() {
  let s = table(
    {
      0: ["administration-2"],
      1: ["administration-4"],
      2: ["aggression-3"],
    },
    3,
  );
  const leftovers = [...s.discardDown];
  s = endTurn(play(s, "administration-2", "lead"));
  s = endTurn(play(s, "administration-4", "surpass"));
  s = endTurn(play(s, "aggression-3", "pivot"));
  assert.equal(s.current, 1);
  s = own(s, "BC17", 1);
  return { s, leftovers };
}
const farseers = (s, discards) =>
  form(
    choose(s, "guild", (c) => c.card === "BC17"),
    discards,
  );
test("split piles: face-up plays go up with their round; copies, seizes and leftovers go face down", () => {
  const { s, leftovers } = splitRound();
  assert.equal(leftovers.length, 4);
  assert.equal(s.round, 2);
  assert.deepEqual(s.discardUp, [
    { card: "administration-2", player: 0, mode: "lead", round: 1 },
    { card: "administration-4", player: 1, mode: "surpass", round: 1 },
    { card: "aggression-3", player: 2, mode: "pivot", round: 1 },
  ]);
  assert.deepEqual(s.discardDown, [
    ...leftovers,
    "construction-5",
    "mobilization-6",
  ]);
  assert.equal(s.discard, undefined);
  assertDeepInvariants(s);
});
test("split piles: every chapter deals its leftovers face down and empties the face-up pile", () => {
  for (const [n, left] of [
    [2, 8],
    [3, 2],
    [4, 4],
  ]) {
    const s = createGame(["A", "B", "C", "D"].slice(0, n), {}, 11);
    assert.equal(s.discardDown.length, left, `${n} players`);
    assert.deepEqual(s.discardUp, []);
  }
  let { s } = splitRound();
  s = passChapter(s);
  assert.equal(s.chapter, 2);
  assert.deepEqual(s.discardUp, []);
  assert.equal(s.discardDown.length, 4);
  assertDeepInvariants(s);
});
test("split piles: Farseers draws the face-down bottom, never a face-up card", () => {
  let { s, leftovers } = splitRound();
  s = own(s, "BC17", 3);
  s = play(s, s.players[3].hand[0], "lead");
  const up = structuredClone(s.discardUp),
    discards = s.players[3].hand.slice(0, 2),
    before = s;
  s = farseers(s, discards);
  assert.deepEqual(s.players[3].hand.slice(-3), leftovers.slice(0, 3));
  assert.deepEqual(s.discardUp, up);
  assert.deepEqual(s.discardDown.slice(0, 3), [
    leftovers[3],
    "construction-5",
    "mobilization-6",
  ]);
  assert.deepEqual(s.discardDown.slice(3).sort(), [...discards].sort());
  assert.equal(assertLogNamesNoCard(before, s).length, 1);
  assertDeepInvariants(s);
});
// The old single pile returned round 1's lead as the third card here.
test("split piles: 3p with no copies, a 3-card Farseers dig takes both leftovers and one of its own discards", () => {
  let { s, leftovers } = farseersRound3p();
  assert.equal(leftovers.length, 2);
  s = play(s, s.players[1].hand[0], "lead");
  const discards = s.players[1].hand.slice(0, 2),
    before = s;
  s = farseers(s, discards);
  const drawn = s.players[1].hand.slice(-3);
  assert.deepEqual(drawn.slice(0, 2), leftovers);
  assert.ok(discards.includes(drawn[2]));
  for (const { card } of s.discardUp)
    assert.ok(!s.players[1].hand.includes(card), card);
  assert.equal(s.discardUp.length, 3, "no merge: the pile was not short");
  assert.deepEqual(
    s.discardDown,
    discards.filter((c) => c !== drawn[2]),
  );
  assertLogNamesNoCard(before, s);
  assertDeepInvariants(s);
});
test("split piles: a short face-down pile is shuffled together with the face-up pile before Farseers draws", () => {
  let { s } = farseersRound3p();
  // Earlier draws (Call to Action, another dig) took both leftovers.
  s.players[2].hand.push(...s.discardDown.splice(0));
  s = play(s, s.players[1].hand[0], "lead");
  const discard = s.players[1].hand[0],
    up = s.discardUp.map((x) => x.card),
    before = s;
  s = farseers(s, [discard]);
  assert.deepEqual(s.discardUp, []);
  assert.equal(s.discardDown.length, 2);
  assert.deepEqual(
    [...s.players[1].hand.slice(-2), ...s.discardDown].sort(),
    [discard, ...up].sort(),
  );
  assert.deepEqual(
    assertLogNamesNoCard(before, s).map((e) => e.text),
    [
      "The face-down action discard is short: 3 face-up cards are shuffled into it.",
      "B draws 2 cards with Farseers.",
    ],
  );
  const drawEntry = s.log.find((e) => e.draw);
  assert.deepEqual(drawEntry.draw, {
    player: 1,
    count: 2,
    via: "farseers",
    merged: true,
  });
  assert.deepEqual(drawEntry.at, {
    chapter: s.chapter,
    round: s.round,
    player: s.current,
  });
  const merged = s.log.find((e) => e.merge).merge;
  assert.equal(merged.chapter, s.chapter);
  assert.equal(merged.round, s.round);
  assert.deepEqual(
    merged.cards.map((x) => x.card),
    up,
  );
  assert.ok(merged.cards.every((x) => "player" in x && x.mode && x.round));
  // The same entry reaches every seat's view, still face-up cards only.
  assert.deepEqual(viewFor(s, 0).log.find((e) => e.merge).merge, merged);
  const v = viewFor(s, 0);
  assert.deepEqual(v.discardUp, []);
  assert.equal(v.discardDownCount, 2);
  assertDeepInvariants(s);
});
test("BC17 Farseers draws from a short discard after shuffling selected cards into it", () => {
  let { s, leftovers } = farseersRound3p();
  // Another draw took one leftover, so the face-down pile holds a single card.
  s.players[2].hand.push(s.discardDown.shift());
  s = play(s, s.players[1].hand[0], "lead");
  const discards = s.players[1].hand.slice(0, 2),
    up = structuredClone(s.discardUp),
    kept = s.players[1].hand.length - 2;
  s = farseers(s, discards);
  // Two discards and Farseers itself mean three draws: the lone card, then the
  // two discards (shuffled in on top of it). No merge, as the pile held three.
  assert.equal(s.players[1].hand.length, kept + 3);
  const drawn = s.players[1].hand.slice(-3);
  assert.equal(drawn[0], leftovers[1]);
  assert.deepEqual(drawn.slice(1).sort(), [...discards].sort());
  assert.deepEqual(s.discardDown, []);
  assert.deepEqual(s.discardUp, up);
  assert.ok(s.courtDiscard.includes("BC17"));
  assertDeepInvariants(s);
});
// Round 1 leaves two face-up cards and two copies; player 0 keeps the
// initiative and secures Call to Action with Aggression 2 in round 2.
function callToAction() {
  let s = soleCourtCard(
    table({ 0: ["administration-2", "aggression-2"], 1: ["aggression-3"] }),
    "BC31",
  );
  s = endTurn(play(s, "administration-2", "lead"));
  s = endTurn(play(s, "aggression-3", "pivot"));
  s = copyAndEnd(copyAndEnd(s));
  assert.equal(s.current, 0);
  assert.equal(s.discardUp.length, 2);
  return play(s, "aggression-2", "lead");
}
test("split piles: Call to Action draws the face-down bottom, merging first when it is empty", () => {
  let s = callToAction();
  const bottom = s.discardDown[0],
    up = structuredClone(s.discardUp);
  s = act(s, "secure", "secureTarget", (c) => c.index === 1);
  let before = s;
  s = choose(s, "call");
  assert.equal(s.players[0].hand.at(-1), bottom);
  assert.deepEqual(s.discardUp, up);
  assertLogNamesNoCard(before, s);
  assert.deepEqual(s.log.findLast((e) => e.draw).draw, {
    player: 0,
    count: 1,
    via: "call",
    merged: false,
  });
  assertDeepInvariants(s);

  s = callToAction();
  s.players[3].hand.push(...s.discardDown.splice(0));
  s = act(s, "secure", "secureTarget", (c) => c.index === 1);
  before = s;
  s = choose(s, "call");
  assert.ok(up.some((x) => x.card === s.players[0].hand.at(-1)));
  assert.deepEqual(s.discardUp, []);
  assert.equal(s.discardDown.length, 1);
  assert.equal(s.turn.revealed, "deck");
  assert.ok(
    assertLogNamesNoCard(before, s).some((e) =>
      e.text.startsWith("The face-down action discard is short: 2 face-up"),
    ),
  );
  assert.deepEqual(s.log.findLast((e) => e.draw).draw, {
    player: 0,
    count: 1,
    via: "call",
    merged: true,
  });
  assertDeepInvariants(s);
});
test("split piles: the 2p mulligan draws the face-down bottom and shuffles the old hand in", () => {
  let s = createGame(["A", "B"], { initiative: 0 }, 8);
  const old = [...s.players[1].hand],
    pile = [...s.discardDown],
    before = s;
  assert.equal(pile.length, 8);
  s = choose(s, "mulligan", () => true, 1);
  assert.deepEqual(s.players[1].hand, pile.slice(0, 6));
  assert.deepEqual(
    [...s.discardDown].sort(),
    [...old, ...pile.slice(6)].sort(),
  );
  assert.deepEqual(s.discardUp, []);
  assertLogNamesNoCard(before, s);
  assertDeepInvariants(s);
});
test("split piles: views list face-up cards by round, count face-down ones, and the log never names a face-down card", () => {
  let { s } = splitRound();
  const lead = s.players[3].hand[0];
  s = endTurn(play(s, lead, "lead"));
  s = copyAndEnd(copyAndEnd(copyAndEnd(s)));
  assert.equal(s.round, 3);
  assert.equal(s.discardDown.length, 9);
  for (let p = 0; p < 4; p++) {
    const v = viewFor(s, p);
    assert.deepEqual(v.discardUp, [
      {
        round: 1,
        cards: [
          { card: "administration-2", player: 0, mode: "lead" },
          { card: "administration-4", player: 1, mode: "surpass" },
          { card: "aggression-3", player: 2, mode: "pivot" },
        ],
      },
      { round: 2, cards: [{ card: lead, player: 3, mode: "lead" }] },
    ]);
    assert.equal(v.discardDownCount, 9);
    assert.equal(v.discardDown, undefined);
    assert.equal(v.discard, undefined);
    const text = JSON.stringify(v);
    for (const id of s.discardDown) {
      assert.ok(!text.includes(`"${id}"`), `view ${p} names ${id}`);
      assert.ok(
        v.log.every((e) => !e.text.includes(cardLabel(id))),
        `log names ${id}`,
      );
    }
  }
  assertDeepInvariants(s);
});
test("the view's log is never capped, and every entry is placed in a chapter, round and turn", () => {
  const s = createGame(["A", "B", "C"], { initiative: 0 }, 5);
  for (let i = 0; i < 400; i++) log(s, `event ${i}`);
  const v = viewFor(s, 0);
  assert.equal(v.log.length, s.log.length);
  assert.ok(s.log.length >= 400);
  assert.ok(
    v.log.every(
      (e) =>
        e.at &&
        "chapter" in e.at &&
        "round" in e.at &&
        e.at.player !== undefined,
    ),
  );
});

// C-7: Back on forms that open from an earlier choice.
test("Back from the fleet selection re-offers the move origins with nothing paid", () => {
  let s = play(table(), "construction-2", "lead");
  s = endTurn(s);
  s = play(s, "mobilization-5", "pivot");
  s = act(s, "move", "moveFrom", (c) => c.system === "4-hex");
  const pips = s.turn.pips,
    before = JSON.stringify(s.pieces);
  assert.ok(decision(s, s.current).canCancel);
  s = settle(transition(s, s.current, { cancel: true }));
  assert.equal(s.turn.pips, pips);
  assert.equal(JSON.stringify(s.pieces), before);
  assert.ok(decision(s, s.current).choices.some((c) => c.op === "moveFrom"));
  assert.ok(!decision(s, s.current).form);
  s = choose(s, "moveFrom", (c) => c.system === "4-hex");
  assert.ok(decision(s, s.current).form);
  assertDeepInvariants(s);
});
test("Back is refused on a form with nothing to go back to", () => {
  const s = diceState();
  assert.ok(!decision(s, s.current).canCancel);
  assert.throws(() => transition(s, s.current, { cancel: true }));
});
test("Back from Relic Fence discards nothing and returns to the Prelude", () => {
  let s = resources(own(fixture(), "BC24"), 0, ["fuel"]);
  s.turn.card = "administration-2";
  s = choose(s, "guild", (c) => c.card === "BC24");
  assert.equal(s.pending[0].type, "relicFence");
  s = choose(s, "cancel");
  assert.equal(s.pending.length, 0);
  assert.deepEqual(s.players[0].resources.filter(Boolean), ["fuel"]);
  assert.ok(!s.turn.used.includes("BC24"));
});

test("Back from a free move's fleet selection re-offers the free move", () => {
  let s = clear(fixture());
  place(s, 0, "ship", "1-arrow", 2);
  s = task(s, {
    type: "freeChoice",
    action: "move",
    reason: "Test free move",
  });
  s = choose(s, "moveFrom");
  assert.ok(decision(s, 0).canCancel);
  s = settle(transition(s, 0, { cancel: true }));
  assert.equal(s.pending[0].type, "freeChoice");
  assert.ok(decision(s, 0).choices.some((c) => c.op === "skip"));
  assertDeepInvariants(s);
});
test("Back from a paid-bonus free move returns to the free action, which can still be skipped", () => {
  let s = afterBonus("LEAD06", "aggression", "battle");
  s = choose(s, "bonusBefore");
  const ship = s.pieces.find((x) => x.owner === 1 && x.type === "ship");
  s = choose(s, "moveFrom", (c) => c.system === ship.system);
  s = settle(transition(s, s.pending[0].p, { cancel: true }));
  assert.equal(s.pending[0].action, "move");
  assert.ok(decision(s, s.pending[0].p).choices.some((c) => c.op === "skip"));
});
test("Back from the destination returns to fleet selection on the first hop only", () => {
  let s = play(table(), "construction-2", "lead");
  s = endTurn(s);
  s = play(s, "mobilization-5", "pivot");
  s = act(s, "move", "moveFrom", (c) => c.system === "4-hex");
  const pips = s.turn.pips,
    before = JSON.stringify(s.pieces);
  s = form(
    s,
    decision(s, s.current).form.options.map((o) => o.id),
  );
  assert.ok(decision(s, s.current).choices.some((c) => c.op === "cancel"));
  s = choose(s, "cancel");
  assert.ok(decision(s, s.current).form);
  assert.equal(s.turn.pips, pips);
  assert.equal(JSON.stringify(s.pieces), before);
  // Back again returns to the origins; the move can then be completed.
  s = settle(transition(s, s.current, { cancel: true }));
  s = choose(s, "moveFrom", (c) => c.system === "4-hex");
  s = form(
    s,
    decision(s, s.current).form.options.map((o) => o.id),
  );
  s = choose(s, "moveTo", (c) => c.system === "4-crescent");
  assert.equal(s.turn.pips, pips - 1);
  assert.ok(
    !s.pending.some((t) => t.type === "moveTo"),
    "no destination step is left behind",
  );
  assertDeepInvariants(s);
});
// Battle visibility (C-8): dice faces and raid outcomes reach the log.
const rolled = (s) => s.lastBattle.dice;
const faceWords = (faces) => (faces.length ? faces.join("+") : "blank");
test("a battle roll logs every face, and the record keeps the dice", () => {
  let s = form(diceState(), { skirmish: 1, assault: 1, raid: 1 });
  const line = s.log.findLast((e) => e.battle);
  assert.match(line.text, /^A rolls 3 dice against B: /);
  for (const d of rolled(s))
    assert.ok(line.text.includes(`${d.type} `), line.text);
  assert.ok(
    line.text.includes(
      rolled(s)
        .filter((d) => d.type === "skirmish")
        .map((d) => faceWords(d.faces))
        .join(", "),
    ),
    line.text,
  );
  assert.equal(s.battles.length, 1);
  assert.equal(s.battles[0].at.chapter, s.chapter);
  assert.deepEqual(s.battles[0].dice, rolled(s));
  assert.deepEqual(s.battles[0].rerolls, []);
  assert.equal(viewFor(s, 1).battles.length, 1);
});
test("a reroll logs the old and new faces and names the ability", () => {
  let s = resources(own(diceState(), "BC13"), 0, ["weapon"]);
  s = form(s, { skirmish: 2, assault: 0, raid: 0 });
  const first = rolled(s).map((d) => faceWords(d.faces));
  s = choose(s, "reroll", (c) => c.ability === "Skirmishers");
  s = form(s, ["0", "1"]);
  const line = s.log.findLast((e) => e.battle);
  assert.match(line.text, /^A rerolls 2 dice \(Skirmishers\): /);
  rolled(s).forEach((d, i) =>
    assert.ok(
      line.text.includes(`${first[i]} → ${faceWords(d.faces)}`),
      line.text,
    ),
  );
  assert.equal(s.battles.length, 1);
  assert.deepEqual(s.battles[0].rerolls, ["Skirmishers"]);
  assert.deepEqual(s.battles[0].dice, rolled(s));
  // Choosing no dice changes nothing and logs nothing.
  const n = s.log.length;
  s = choose(s, "resolve");
  assert.ok(s.log.slice(n).every((e) => !/rerolls/.test(e.text)));
});
test("Galactic Rifles log their dice and an Empath’s Vision reroll", () => {
  let s = clear(own(own(fixture(), "L02"), "L19"));
  s.markers[2].ambition = "empath";
  place(s, 0, "ship", "1-arrow");
  place(s, 1, "ship", "1-gate");
  s.turn.suit = "aggression";
  s = choose(s, "action", (c) => c.action === "battle" && c.cost === "pip");
  s = choose(s, "special", (c) => c.card === "L02");
  s = choose(s, "rifles");
  s = choose(s, "rifleDice", (c) => c.n === 1);
  let line = s.log.findLast((e) => e.battle);
  assert.match(line.text, /^A fires 1 skirmish die at B: skirmish /);
  assert.equal(s.battles.length, 1);
  assert.equal(s.battles[0].rifles, true);
  s = form(s, ["0"]);
  line = s.log.findLast((e) => e.battle);
  assert.match(line.text, /^A rerolls 1 die \(Empath’s Vision\): /);
  assert.deepEqual(s.battles[0].rerolls, ["Empath’s Vision"]);
  assert.deepEqual(s.battles[0].dice, rolled(s));
});
// Resolve a roll of one key into a raid, then see how the raid is logged.
const raidFrom = (s, attackers) => {
  s.pending[0] = {
    ...s.pending[0],
    type: "reroll",
    dice: [{ type: "raid", faces: ["key"] }],
    used: [],
    attackers,
  };
  return choose(s, "resolve");
};
const raidLog = (s) => s.log.findLast((e) => /steals nothing/.test(e.text));
test("a raid with no surviving attacker logs why it stole nothing", () => {
  let s = diceState();
  resources(s, 1, ["fuel"]);
  s = raidFrom(s, ["gone"]);
  assert.match(raidLog(s).text, /^A’s raid on B steals nothing: no attacking/);
});
test("a raid with no keys left logs why it stole nothing", () => {
  let s = diceState();
  s.pending = [
    { type: "gainChoice", p: 0, count: 1 },
    { type: "raid", p: 0, defender: 1, system: "1-arrow", keys: 0 },
  ];
  s = choose(s, "gain");
  assert.match(raidLog(s).text, /steals nothing: no keys left\.$/);
});
test("a raid with nothing affordable logs why it stole nothing", () => {
  let s = diceState();
  s.players[1].cards = [];
  resources(s, 1, []);
  let t = raidFrom(structuredClone(s), undefined);
  assert.match(raidLog(t).text, /B has nothing that can be stolen\.$/);
  // One resource, but in a slot (3 keys) dearer than the roll gave.
  resources(s, 1, ["fuel"]);
  t = raidFrom(structuredClone(s), undefined);
  assert.match(raidLog(t).text, /nothing B holds costs 1 key or fewer\.$/);
});
test("finishing a raid by hand without stealing is logged", () => {
  let s = diceState();
  resources(s, 1, ["fuel", "fuel"]);
  s.players[1].resources[0] = null;
  s.supply.fuel++;
  s = raidFrom(s, undefined);
  s = choose(s, "skip");
  assert.equal(
    s.log.findLast((e) => /without stealing/.test(e.text)).text,
    "A ends the raid on B without stealing.",
  );
});
test("a raid that steals something does not log a failure", () => {
  let s = diceState();
  resources(s, 1, ["fuel", "fuel"]);
  s.players[1].resources[0] = null;
  s.supply.fuel++;
  s = raidFrom(s, undefined);
  s = choose(s, "stealResource");
  assert.equal(raidLog(s), undefined);
  assert.ok(!s.log.some((e) => /without stealing/.test(e.text)));
});

// ---- M14: battle and turn/scoring regression tests (F-2, item 14) ----
// Expected values come from the rulebook (Battle, p.15-16; Playing a Chapter,
// p.8-11; Ending a Chapter, p.18-19), not from the engine.
const die = (type, ...faces) => {
  assert.ok(
    DICE[type].some((f) => JSON.stringify(f) === JSON.stringify(faces)),
    `${type} has no face ${faces}`,
  );
  return { type, faces };
};
// Player 0 leads Aggression 4 and battles `defender` at `system`. The roll is
// then set to `dice` (real faces), so each test controls what it resolves.
function battleWith(s, system, defender, dice) {
  s = play(s, "aggression-4", "lead");
  s = act(
    s,
    "battle",
    "battleTarget",
    (c) => c.system === system && c.defender === defender,
  );
  const n = { skirmish: 0, assault: 0, raid: 0 };
  for (const d of dice) n[d.type]++;
  s = form(s, n);
  s.pending[0].dice = structuredClone(dice);
  s.lastBattle.dice = s.pending[0].dice;
  return s;
}
const hitTypes = (s, p = 0) =>
  decision(s, p).choices.map(
    (c) => c.op === "hit" && s.pieces.find((x) => x.id === c.piece).type,
  );
const held = (pl, key) => pl[key].map((x) => [x.owner, x.type]);
test("battle hits reach defending buildings only after the last defending ship", () => {
  let s = table({ 0: ["aggression-4"] });
  place(s, 1, "ship", "4-arrow");
  const port = place(s, 1, "starport", "4-arrow")[0];
  s = battleWith(s, "4-arrow", 1, [
    die("assault", "hit", "hit"),
    die("skirmish", "hit"),
  ]);
  s = choose(s, "resolve");
  assert.deepEqual(hitTypes(s), ["ship"]);
  s = choose(s, "hit");
  // Damaged, the ship is still a defending ship: the next hit must take it.
  assert.deepEqual(hitTypes(s), ["ship"]);
  s = choose(s, "hit");
  assert.deepEqual(hitTypes(s), ["starport"]);
  s = choose(s, "hit");
  assert.equal(s.pieces.find((x) => x.id === port).damaged, true);
  assert.deepEqual(held(s.players[0], "trophies"), [[1, "ship"]]);
  assert.equal(s.pending.length, 0);
  assertDeepInvariants(s);
});
test("building hits ignore defending ships; a raid offers only what its keys afford", () => {
  let s = table({ 0: ["aggression-4"] });
  place(s, 1, "ship", "4-arrow");
  place(s, 1, "starport", "4-arrow");
  const dice = Array.from({ length: 3 }, () => die("raid", "building", "key"));
  s = battleWith(s, "4-arrow", 1, dice);
  s = choose(s, "resolve");
  assert.deepEqual(hitTypes(s), ["starport"]);
  s = choose(s, "hit");
  s = choose(s, "hit");
  // The third building hit has no building left and is dropped.
  assert.equal(s.pending[0].type, "raid");
  assert.equal(s.pending[0].keys, 3);
  // B holds Material in slot 1 (3 keys) and Psionic in slot 2 (1 key).
  assert.deepEqual(s.players[1].resources, ["material", "psionic", null]);
  assert.deepEqual(resourceKeysFor(s, 1), [3, 1, 1]);
  const offers = (s) =>
    decision(s, 0)
      .choices.filter((c) => c.op === "stealResource")
      .map((c) => [c.index, c.keys]);
  assert.deepEqual(offers(s), [
    [0, 3],
    [1, 1],
  ]);
  s = choose(s, "stealResource", (c) => c.index === 1);
  // Two keys left cannot pay the 3-key slot, so the raid ends by itself.
  assert.ok(!s.pending.some((t) => t.type === "raid"));
  assert.deepEqual(s.players[1].resources, ["material", null, null]);
  assert.deepEqual(held(s.players[0], "trophies"), [[1, "starport"]]);
  assertDeepInvariants(s);
});
test("intercepts do not stack: one hit per fresh defending ship, however many were rolled", () => {
  let s = table({ 0: ["aggression-4"] });
  place(s, 1, "ship", "4-arrow", 2);
  place(s, 1, "ship", "4-arrow", 1, true);
  s = battleWith(
    s,
    "4-arrow",
    1,
    Array.from({ length: 3 }, () => die("assault", "intercept", "hit")),
  );
  s = choose(s, "resolve");
  assert.deepEqual(
    s.pending.filter((t) => t.type === "hits").map((t) => [t.kind, t.left]),
    [
      ["self", 2],
      ["hit", 3],
    ],
  );
  assertDeepInvariants(s);
});
test("attacking ships destroyed by self-hits and intercepts are the defender's Trophies", () => {
  let s = table({ 0: ["aggression-4"] });
  place(s, 1, "ship", "4-arrow");
  s = battleWith(s, "4-arrow", 1, [
    die("assault", "self", "hit"),
    die("assault", "intercept", "hit"),
  ]);
  s = choose(s, "resolve");
  const mine = s.pieces.find((x) => x.owner === 0 && x.system === "4-arrow");
  // The self-hit, then the intercept (one fresh defender), on the same ship.
  s = choose(s, "hit", (c) => c.piece === mine.id);
  s = choose(s, "hit", (c) => c.piece === mine.id);
  assert.ok(!s.pieces.includes(mine));
  assert.deepEqual(held(s.players[1], "trophies"), [[0, "ship"]]);
  assert.deepEqual(held(s.players[0], "trophies"), []);
  s = choose(s, "hit");
  s = choose(s, "hit");
  assert.deepEqual(held(s.players[0], "trophies"), [[1, "ship"]]);
  assertDeepInvariants(s);
});
test("a raid ends by itself when no attacking ship survives the self-hits", () => {
  let s = table({ 0: ["aggression-4"] });
  place(s, 0, "ship", "4-hex", 1, true);
  const before = structuredClone(s.players[1].resources);
  s = battleWith(s, "4-hex", 1, [die("raid", "self", "key")]);
  s = choose(s, "resolve");
  s = choose(s, "hit");
  assert.ok(!s.pieces.some((x) => x.owner === 0 && x.system === "4-hex"));
  assert.equal(s.pending.length, 0);
  assert.deepEqual(s.players[1].resources, before);
  assert.deepEqual(held(s.players[1], "trophies"), [[0, "ship"]]);
  assertDeepInvariants(s);
});
test("raid dice need a defending building here, or no defender building anywhere", () => {
  const start = (noBuildings) => {
    let s = table({ 0: ["aggression-4"] });
    if (noBuildings)
      s.pieces = s.pieces.filter((x) => x.owner !== 1 || x.type === "ship");
    place(s, 1, "ship", "4-arrow");
    s = play(s, "aggression-4", "lead");
    return act(s, "battle", "battleTarget", (c) => c.system === "4-arrow");
  };
  let s = start(false);
  // B's city and starport stand elsewhere: no raid dice.
  assert.equal(decision(s, 0).form.raidMax, 0);
  assert.throws(
    () => transition(s, 0, { value: { skirmish: 0, assault: 0, raid: 1 } }),
    /Raid dice/,
  );
  s = start(true);
  assert.equal(decision(s, 0).form.raidMax, 6);
  s = form(s, { skirmish: 0, assault: 0, raid: 3 });
  assert.deepEqual(
    s.lastBattle.dice.map((d) => d.type),
    ["raid", "raid", "raid"],
  );
  assertDeepInvariants(s);
});
test("damaged attacking ships count toward the dice limit", () => {
  let s = table({ 0: ["aggression-4"] });
  const ships = s.pieces.filter(
    (x) => x.owner === 0 && x.type === "ship" && x.system === "4-arrow",
  );
  assert.equal(ships.length, 3);
  ships[0].damaged = ships[1].damaged = true;
  place(s, 1, "ship", "4-arrow");
  s = play(s, "aggression-4", "lead");
  s = act(s, "battle", "battleTarget", (c) => c.system === "4-arrow");
  assert.equal(decision(s, 0).form.max, 3);
  assert.throws(
    () => transition(s, 0, { value: { skirmish: 2, assault: 2, raid: 0 } }),
    /Too many dice/,
  );
  s = form(s, { skirmish: 2, assault: 1, raid: 0 });
  assert.equal(s.lastBattle.dice.length, 3);
});
test("no fleet revival while a starport stands or no ship is left in supply", () => {
  const noFleet = (keepPort) => {
    const s = table();
    s.pieces = s.pieces.filter(
      (x) =>
        x.owner !== 0 ||
        x.type === "city" ||
        (keepPort && x.type === "starport"),
    );
    return play(s, s.players[0].hand[0], "lead");
  };
  let s = endTurn(noFleet(true));
  assert.equal(s.current, 1);
  assert.ok(!s.pending.some((t) => t.type === "revive"));
  // Every ship of A's is a rival Trophy: there is nothing to place.
  s = noFleet(false);
  s.players[1].trophies = Array.from({ length: 15 }, (_, i) => ({
    id: `t${i}`,
    owner: 0,
    type: "ship",
  }));
  assert.equal(pool(s, 0, "ship"), 0);
  s = endTurn(s);
  assert.equal(s.current, 1);
  assert.ok(!s.pending.some((t) => t.type === "revive"));
  assertDeepInvariants(s);
  // With ships in supply, the same table must revive.
  s = endTurn(noFleet(false));
  assert.equal(s.pending[0].type, "revive");
});
test("a 7 lead may declare any ambition, a 1 lead none, others only their own", () => {
  const offered = (card) =>
    decision(play(table({ 0: [card] }), card, "lead"), 0)
      .choices.filter((c) => c.op === "declare")
      .map((c) => c.ambition);
  assert.deepEqual(offered("administration-7").sort(), [
    "empath",
    "keeper",
    "tycoon",
    "tyrant",
    "warlord",
  ]);
  assert.deepEqual(offered("aggression-1"), []);
  assert.deepEqual(offered("aggression-4"), ["warlord"]);
  let s = play(table({ 0: ["administration-7"] }), "administration-7", "lead");
  s = choose(s, "declare", (c) => c.ambition === "keeper");
  assert.equal(s.markers[2].ambition, "keeper");
  assert.equal(s.lead.rank, 0);
  assertDeepInvariants(s);
});
test("surpassing with a 7 seizes the initiative and still takes the 7's actions", () => {
  let s = table({ 0: ["administration-2"], 1: ["administration-7"] });
  s = endTurn(play(s, "administration-2", "lead"));
  s = play(s, "administration-7", "surpass");
  assert.equal(s.initiative, 1);
  assert.equal(s.seized, true);
  assert.equal(s.turn.pips, ACTION_CARDS["administration-7"].pips);
  assert.ok(!seizes(s, 1));
  s = copyAndEnd(copyAndEnd(endTurn(s)));
  assert.equal(s.round, 2);
  assert.equal(s.initiative, 1);
  assert.equal(s.current, 1);
  assertDeepInvariants(s);
});
test("a 7 Surpass after a seize this round does not seize; the seizer keeps the initiative", () => {
  let s = table({ 0: ["administration-2"], 2: ["administration-7"] });
  s = endTurn(play(s, "administration-2", "lead"));
  s = play(s, s.players[1].hand[0], "copy");
  s = endTurn(choose(s, "seize"));
  s = play(s, "administration-7", "surpass");
  assert.equal(s.initiative, 1);
  assert.equal(s.turn.pips, ACTION_CARDS["administration-7"].pips);
  s = copyAndEnd(endTurn(s));
  // Player 2 surpassed highest, but a seized initiative stays put.
  assert.equal(s.round, 2);
  assert.equal(s.initiative, 1);
  assert.equal(s.current, 1);
  assertDeepInvariants(s);
});
test("with no Surpass the initiative stays with its holder, even past a higher Pivot", () => {
  let s = table({ 0: ["administration-2"], 1: ["aggression-5"] });
  s = endTurn(play(s, "administration-2", "lead"));
  s = endTurn(play(s, "aggression-5", "pivot"));
  s = copyAndEnd(copyAndEnd(s));
  assert.equal(s.round, 2);
  assert.equal(s.initiative, 0);
  assert.equal(s.current, 0);
  assertDeepInvariants(s);
});
test("a player who ran out of cards mid-chapter is skipped in later rounds", () => {
  let s = table();
  s = endTurn(play(s, s.players[0].hand[0], "lead"));
  s = play(s, s.players[1].hand[0], "copy");
  s = copyAndEnd(copyAndEnd(endTurn(choose(s, "seize"))));
  // B seized, leads rounds 2 to 5 and runs out of cards first.
  for (let round = 2; round <= 5; round++) {
    assert.equal(s.current, 1);
    s = endTurn(play(s, s.players[1].hand[0], "lead"));
    for (let i = 0; i < 3; i++) s = copyAndEnd(s);
  }
  assert.deepEqual(
    s.players.map((p) => p.hand.length),
    [1, 0, 1, 1],
  );
  // The holder has no cards, so the next player with cards leads.
  assert.equal(s.initiative, 2);
  assert.equal(s.current, 2);
  s = endTurn(play(s, s.players[2].hand[0], "lead"));
  s = copyAndEnd(s);
  assert.equal(s.current, 0);
  s = copyAndEnd(s);
  // B is not waited for: the round and the chapter end after A.
  assert.equal(s.chapter, 2);
  assert.equal(s.current, 2);
  assertDeepInvariants(s);
});
test("bonus city Power is added once per won ambition, however many markers it holds", () => {
  let s = table({ 0: ["aggression-4", "administration-4"] });
  // A has built every city, uncovering both the +2 and +3 slots.
  for (const system of ["4-arrow", "4-crescent", "6-crescent", "1-crescent"])
    place(s, 0, "city", system);
  assert.equal(pool(s, 0, "city"), 0);
  s.players[0].trophies = [
    { id: "t1", owner: 2, type: "agent" },
    { id: "t2", owner: 3, type: "agent" },
  ];
  s.players[1].trophies = [{ id: "t3", owner: 2, type: "agent" }];
  for (const card of ["aggression-4", "administration-4"]) {
    s = play(s, card, "lead");
    s = endTurn(choose(s, "declare", (c) => c.ambition === "warlord"));
    for (let i = 1; i < 4; i++) s = copyAndEnd(s);
  }
  s = passChapter(s);
  // Markers 5/3 and 3/2 on Warlord: first 5+3 plus 5 once, second 3+2.
  assert.deepEqual(
    s.players.map((p) => p.power),
    [13, 5, 0, 0],
  );
  assertDeepInvariants(s);
});
for (const [players, goal] of [
  [4, 27],
  [3, 30],
  [2, 33],
])
  test(`${players} players: a chapter ending with ${goal} Power ends the game early`, () => {
    const chapterWith = (power) => {
      let s = table({}, players);
      if (players === 2) s = choose(s, "skip", () => true, 1);
      s.players[1].power = power;
      return passChapter(s);
    };
    let s = chapterWith(goal - 1);
    assert.equal(s.chapter, 2);
    assert.notEqual(s.phase, "over");
    s = chapterWith(goal);
    assert.equal(s.phase, "over");
    assert.equal(s.chapter, 1);
    assert.equal(s.winner, 1);
    assertDeepInvariants(s);
  });
test("each chapter end flips the lowest unflipped marker, through chapter 3", () => {
  let s = table();
  const values = () => s.markers.map((m) => [m.high, m.low]);
  assert.deepEqual(values(), [
    [2, 0],
    [3, 2],
    [5, 3],
  ]);
  for (const expected of [
    [
      [4, 2],
      [3, 2],
      [5, 3],
    ],
    [
      [4, 2],
      [6, 3],
      [5, 3],
    ],
    [
      [4, 2],
      [6, 3],
      [9, 4],
    ],
    [
      [4, 2],
      [6, 3],
      [9, 4],
    ],
  ]) {
    s = passChapter(s);
    assert.deepEqual(values(), expected, `after chapter ${s.chapter - 1}`);
  }
  assert.equal(s.chapter, 5);
  assertDeepInvariants(s);
});
test("after scoring, a Cartel makes rivals discard its resource and Lavish discards Fuel", () => {
  let s = own(table({ 0: ["aggression-2"] }), "BC03", 0);
  s.players[1].leader = "LEAD03";
  resources(s, 0, ["material", "fuel"]);
  resources(s, 1, ["fuel", "material"]);
  resources(s, 2, ["material", "fuel"]);
  s = play(s, "aggression-2", "lead");
  s = endTurn(choose(s, "declare", (c) => c.ambition === "tycoon"));
  for (let i = 1; i < 4; i++) s = copyAndEnd(s);
  s = passChapter(s);
  assert.equal(s.chapter, 2);
  // Tycoon was counted before the discards.
  const tycoon = s.scoreHistory[0].ambitions.find(
    (x) => x.ambition === "tycoon",
  );
  assert.deepEqual(tycoon.values.slice(1, 3), [2, 2]);
  const kept = (p) => s.players[p].resources.filter(Boolean).sort();
  assert.deepEqual(kept(0), ["fuel", "material"]);
  assert.deepEqual(kept(1), []);
  assert.deepEqual(kept(2), ["fuel"]);
  assert.deepEqual(kept(3), ["weapon"]);
  assertDeepInvariants(s);
});
test("Lavish keeps Fuel when Tycoon was not scored", () => {
  let s = table();
  s.players[1].leader = "LEAD03";
  resources(s, 1, ["fuel"]);
  s = passChapter(s);
  assert.equal(s.chapter, 2);
  assert.deepEqual(s.players[1].resources.filter(Boolean), ["fuel"]);
});
for (const r of RESOURCES)
  test(`Outraged ${r} cannot be spent for its Prelude action without its Loyal guild`, () => {
    const spends = (outraged) => {
      let s = table({ 0: ["administration-2"] });
      if (outraged) s.players[0].outrage = [r];
      // A Relic needs a Secure target to be spendable at all.
      s.court[0].agents[0] = 1;
      resources(s, 0, [r, r === "fuel" ? "material" : "fuel"]);
      s = play(s, "administration-2", "lead");
      return decision(s, 0).choices.filter((c) => c.cost === 0);
    };
    assert.ok(spends(false).length > 0);
    assert.deepEqual(spends(true), []);
  });
test("two players: the out-of-play planets' resources score as a third player", () => {
  let s = table({}, 2);
  // Rulebook setup K: Material and Fuel on Tycoon, Weapons on Warlord, and so on.
  const out = Object.values(MAP).filter(
    (m) => m.resource && !s.clusters.includes(m.cluster),
  );
  const count = (...rs) => out.filter((m) => rs.includes(m.resource)).length;
  assert.deepEqual(s.neutral, {
    tycoon: count("material", "fuel"),
    tyrant: 0,
    warlord: count("weapon"),
    keeper: count("relic"),
    empath: count("psionic"),
  });
  assert.equal(out.length, 6);
  s.neutral = { tycoon: 2, tyrant: 0, warlord: 1, keeper: 0, empath: 1 };
  resources(s, 0, ["material", "fuel", "psionic"]);
  resources(s, 1, ["material", "psionic", "psionic"]);
  s.players[0].trophies = [{ id: "t1", owner: 1, type: "agent" }];
  s.markers[2].ambition = "tycoon";
  s.markers[1].ambition = "empath";
  s.markers[0].ambition = "warlord";
  // Tycoon: A ties the neutral 2 for first, so A is second; B places nowhere.
  assert.deepEqual(scoreAmbition(s, "tycoon"), [3, 0]);
  // Empath: B first; A ties the neutral 1 for second, so nobody is second.
  assert.deepEqual(scoreAmbition(s, "empath"), [0, 3]);
  // Warlord: the neutral Weapon is a Trophy; A ties it for first.
  assert.deepEqual(scoreAmbition(s, "warlord"), [0, 0]);
});
test("a city returned from Trophies covers a resource slot and forces a discard", () => {
  let s = table({ 0: ["aggression-4"] });
  const city = s.pieces.find((x) => x.owner === 1 && x.type === "city");
  s.pieces = s.pieces.filter((x) => x !== city);
  s.players[0].trophies.push({ id: city.id, owner: 1, type: "city" });
  resources(s, 1, ["material", "psionic", "fuel"]);
  assert.equal(capacity(s, 1), 3);
  s = play(s, "aggression-4", "lead");
  s = endTurn(choose(s, "declare", (c) => c.ambition === "warlord"));
  for (let i = 1; i < 4; i++) s = copyAndEnd(s);
  s = passChapter(s);
  assert.equal(s.chapter, 2);
  assert.deepEqual(s.players[0].trophies, []);
  assert.equal(capacity(s, 1), 2);
  assert.deepEqual(
    s.pending.map((t) => [t.type, t.p]),
    [["overflow", 1]],
  );
  s = choose(s, "discard", (c) => c.index === 2, 1);
  assert.deepEqual(s.players[1].resources, ["material", "psionic"]);
  assert.equal(s.pending.length, 0);
  assertDeepInvariants(s);
});
test("Catapult: control is checked before entry and the move stops at a planet", () => {
  // A's starport fleet sits at 6-hex; B holds 6-gate with two ships.
  let s = play(table({ 0: ["aggression-4"] }), "aggression-4", "lead");
  const fleet = s.pieces.filter(
    (x) => x.owner === 0 && x.type === "ship" && x.system === "6-hex",
  );
  const moveFrom6hex = (s, ships) => {
    s = act(s, "move", "moveFrom", (c) => c.system === "6-hex");
    s = form(
      s,
      ships.map((x) => x.id),
    );
    return choose(s, "moveTo", (c) => c.system === "6-gate");
  };
  // B controls the gate before entry: no Catapult, though A then controls it.
  s = moveFrom6hex(s, fleet.slice(0, 2));
  assert.equal(s.pending.length, 0);
  // Now tied (2 against 2), nobody controls it: the move may continue.
  s = moveFrom6hex(s, fleet.slice(2));
  assert.equal(s.pending[0].type, "catapult");
  s = choose(s, "continue", (c) => c.system === "1-gate");
  s = form(s, [fleet[2].id]);
  // 1-gate is A's own: still going. A planet ends it.
  assert.equal(s.pending[0].type, "catapult");
  s = choose(s, "continue", (c) => c.system === "1-hex");
  s = form(s, [fleet[2].id]);
  assert.equal(s.pending.length, 0);
  assert.equal(s.pieces.find((x) => x.id === fleet[2].id).system, "1-hex");
  assert.equal(s.turn.pips, 0);
  assertDeepInvariants(s);
});
test("Catapult: no Catapult from a Rival starport, even one you control", () => {
  let s = table({ 0: ["aggression-4"] });
  // A outnumbers D's fleet at D's starport system 1-arrow.
  const ships = place(s, 0, "ship", "1-arrow", 4);
  assert.equal(control(s, "1-arrow"), 0);
  s = play(s, "aggression-4", "lead");
  s = act(s, "move", "moveFrom", (c) => c.system === "1-arrow");
  s = form(s, ships);
  s = choose(s, "moveTo", (c) => c.system === "1-gate");
  assert.equal(s.pending.length, 0);
  assertDeepInvariants(s);
});

// ---- M14: committed-step sweep (after A4) ----
// Back may only rewind. After it the table must be exactly as it was when the
// decision it returns to was offered: nothing paid, queued or flagged by the
// step backed out of. Only the revision and the log may move.
const rewound = (s) => {
  const { revision, log, eventId, ...rest } = structuredClone(s);
  return rest;
};
const backInput = (s) => {
  const d = decision(s, s.pending[0]?.p ?? s.current),
    cancel = d.choices.find((c) => c.op === "cancel");
  if (d.form) return d.canCancel ? { cancel: true } : null;
  return cancel ? { choice: cancel.id } : null;
};
function back(s) {
  const input = backInput(s);
  assert.ok(
    input,
    `No Back on "${decision(s, s.pending[0]?.p ?? s.current).title}"`,
  );
  return transition(s, s.pending[0]?.p ?? s.current, input);
}
const assertRewinds = (before, at) =>
  assert.deepEqual(rewound(back(at)), rewound(before));
const captive = (s) =>
  s.players[0].captives.push({ id: "c-sweep", owner: 1, type: "agent" });
// Each special action, paid with a pip or with a Psionic in the Prelude.
for (const [card, lead, action, setup = () => {}, stages = []] of [
  ["BC02", "construction-2", "build"],
  ["BC09", "construction-2", "build"],
  ["BC12", "construction-2", "build", captive],
  ["BC12", "administration-2", "influence", captive],
  [
    "BC14",
    "aggression-1",
    "battle",
    (s) => {
      resources(s, 0, ["weapon", "psionic"]);
      s.court.find((c) => c.id).agents[1] = 1;
    },
  ],
  [
    "BC23",
    "administration-2",
    "tax",
    (s) => {
      place(s, 1, "city", "4-arrow");
      resources(s, 1, ["relic"]);
      resources(s, 0, ["relic", "psionic", "fuel"]);
    },
  ],
  ["L01", "construction-2", "build"],
  ["L10", "construction-2", "build"],
  ["L10", "construction-2", "repair"],
  ["L26", "construction-3", "build", (s) => place(s, 1, "starport", "4-arrow")],
  ["L02", "aggression-1", "battle", () => {}, ["rifles"]],
  ["L16", "aggression-1", "move", () => {}, ["guide"]],
  ["L18", "aggression-1", "move"],
])
  for (const cost of ["pip", 1])
    test(`Back from ${CARDS[card].name} (${action}, paid with ${cost === "pip" ? "a pip" : "Psionic"}) rewinds each step`, () => {
      let s = own(table({ 0: [lead] }), card);
      setup(s);
      s = play(s, lead, "lead");
      // Tyrant's Authority needs Tyrant declared.
      if (card === "L26")
        s = choose(s, "declare", (c) => c.ambition === "tyrant");
      assert.equal(s.players[0].resources[1], "psionic");
      const main = s;
      s = choose(s, "action", (c) => c.action === action && c.cost === cost);
      assertRewinds(main, s);
      const targets = s;
      s = choose(s, "special", (c) => c.card === card);
      assertRewinds(targets, s);
      for (const op of stages) {
        const stage = s;
        s = choose(s, op);
        assertRewinds(stage, s);
      }
      assertDeepInvariants(s);
    });
test("Back from a second Prelude resource action rewinds to the Prelude with the first still held", () => {
  let s = table({ 0: ["construction-2"] });
  s.court.find((c) => c.id).agents[0] = 1;
  s = play(s, "construction-2", "lead");
  s = choose(s, "action", (c) => c.action === "build" && c.cost === 1);
  s = choose(s, "buildTarget", (c) => c.kind === "ship");
  assert.deepEqual(s.held, ["psionic"]);
  const prelude = s;
  s = choose(s, "action", (c) => c.action === "secure" && c.cost === 0);
  assertRewinds(prelude, s);
  assertDeepInvariants(s);
});
for (const [leader, main] of [
  ["LEAD06", "battle"],
  ["LEAD07", "secure"],
])
  test(`${leader} bonus prompt: Back rewinds to the action list with nothing paid`, () => {
    assertRewinds(
      beforeBonus(leader, "aggression", main),
      afterBonus(leader, "aggression", main),
    );
  });
test("Warrior's free move before battle: Back from its steps rewinds; skipping it leaves the battle owed", () => {
  const free = choose(
    afterBonus("LEAD06", "aggression", "battle"),
    "bonusBefore",
  );
  const ship = free.pieces.find((x) => x.owner === 1 && x.type === "ship");
  let s = choose(free, "moveFrom", (c) => c.system === ship.system);
  assertRewinds(free, s);
  const fleet = s;
  s = form(s, [ship.id]);
  assertRewinds(fleet, s);
  s = choose(free, "skip");
  assert.equal(backInput(s), null);
  assert.deepEqual(
    s.pending.map((t) => [t.action, t.cost, !!t.required]),
    [["battle", "pip", true]],
  );
  assertDeepInvariants(s);
});
test("Back from Sprinter Drives' and a Catapult's ship choice rewinds to their prompt", () => {
  let s = own(table({ 0: ["aggression-1"] }), "L03");
  place(s, 0, "ship", "6-gate", 2);
  s = play(s, "aggression-1", "lead");
  // 2 against B's 2 at 6-gate: uncontrolled, so the Catapult may continue.
  s = act(s, "move", "moveFrom", (c) => c.system === "6-hex");
  s = form(
    s,
    decision(s, 0).form.options.map((o) => o.id),
  );
  s = choose(s, "moveTo", (c) => c.system === "6-gate");
  assert.equal(s.pending[0].type, "catapult");
  const catapult = s;
  s = choose(s, "continue", (c) => c.system === "6-crescent");
  assertRewinds(catapult, s);
  s = form(s, [s.pending[0].ids[0]]);
  assert.equal(s.pending[0].type, "sprinter");
  const sprinter = s;
  s = choose(s, "sprint");
  assertRewinds(sprinter, s);
  assertDeepInvariants(s);
});
test("Back from choosing dice to reroll rewinds to the roll", () => {
  let s = own(table({ 0: ["aggression-4"] }), "BC13");
  place(s, 1, "ship", "4-arrow");
  s = battleWith(s, "4-arrow", 1, [die("skirmish"), die("skirmish", "hit")]);
  const roll = s;
  s = choose(s, "reroll");
  assertRewinds(roll, s);
});
test("Back from Tycoon's Charm's trade rewinds to its Prelude, not counted as an action", () => {
  let s = own(table({ 0: ["aggression-2"] }), "L28");
  resources(s, 0, ["material", "fuel"]);
  s = play(s, "aggression-2", "lead");
  s = choose(s, "declare", (c) => c.ambition === "tycoon");
  s = choose(s, "guild", (c) => c.card === "L28");
  const prelude = s;
  s = choose(s, "tycoonTrade");
  assert.equal(s.turn.acted, true);
  assertRewinds(prelude, s);
  assertDeepInvariants(s);
});
// Found by the sweep (M14): opening Relic Fence used to count as an action,
// so Back closed "before any actions" options such as Lattice Spies.
test("Back from Relic Fence rewinds; using it is an action", () => {
  let s = own(own(table({ 0: ["administration-2"] }), "BC24"), "BC16");
  s = play(s, "administration-2", "lead");
  const main = s;
  const spies = (s) => decision(s, 0).choices.some((c) => c.card === "BC16");
  assert.ok(spies(main));
  s = choose(s, "guild", (c) => c.card === "BC24");
  assertRewinds(main, s);
  s = choose(s, "fence", (c) => c.index === 1);
  assert.equal(s.turn.acted, true);
  assert.ok(!spies(s));
  assertDeepInvariants(s);
});
// A Vox resolves when secured: none of its prompts offers Back, and it leaves
// nothing queued once resolved.
function courtLane(s, id, p = 0) {
  const at = s.court.findIndex((c) => c.id === id),
    list = s.courtDeck.includes(id) ? s.courtDeck : s.courtDiscard;
  if (at >= 0) [s.court[at].id, s.court[1].id] = [s.court[1].id, id];
  else [list[list.indexOf(id)], s.court[1].id] = [s.court[1].id, id];
  s.court[1].agents[p] = 1;
  return s;
}
for (const id of ["BC26", "BC27", "BC28", "BC29", "BC30", "BC31"])
  test(`${CARDS[id].name}: no prompt offers Back once secured, and nothing stays queued`, () => {
    let s = courtLane(table({ 0: ["aggression-1"] }), id);
    s = play(s, "aggression-1", "lead");
    s = act(s, "secure", "secureTarget", (c) => c.card === id);
    assert.equal(s.pending[0].type, "vox");
    for (let n = 0; s.pending.length && n < 30; n++) {
      assert.equal(backInput(s), null, decision(s, s.pending[0].p).title);
      s = settle(transition(s, s.pending[0].p, timeoutInput(s)));
    }
    assert.equal(s.pending.length, 0);
    assert.ok([...s.courtDiscard, ...s.courtDeck].includes(id));
    assert.equal(s.turn.pips, ACTION_CARDS["aggression-1"].pips - 1);
    assertDeepInvariants(s);
  });
// Random play with every leader and many special cards in hand: every Back
// the explorer meets must rewind to a state already seen this turn.
const SWEEP_CARDS = [
  ...["BC02", "BC08", "BC09", "BC12", "BC13", "BC14", "BC23", "BC24"],
  ...["L01", "L02", "L03", "L09", "L10", "L14", "L16", "L18", "L19"],
  ...["L24", "L25", "L26", "L28"],
];
test("committed-step sweep: every Back met in explored play rewinds", () => {
  const leaders = Object.keys(LEADER_SETUP),
    sites = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    let counter = seed * 4253;
    const random = () => {
      counter = (Math.imul(counter, 1664525) + 1013904223) >>> 0;
      return counter / 4294967296;
    };
    let s = settle(
      createGame(
        ["A", "B", "C", "D"],
        { initiative: 0, setupId: "4SETUP01" },
        seed,
      ),
    );
    s.players.forEach(
      (p, i) => (p.leader = leaders[(seed * 4 + i) % leaders.length]),
    );
    SWEEP_CARDS.forEach((id, k) => own(s, id, (k + seed) % 4));
    for (const lane of s.court) lane.id ??= s.courtDeck.shift();
    assertDeepInvariants(s);
    let seen = [],
      turn;
    for (let n = 0; n < 250 && s.phase !== "over"; n++) {
      const p = s.pending[0]?.p ?? s.current;
      if (turn !== `${s.chapter}:${s.round}:${s.current}`) {
        turn = `${s.chapter}:${s.round}:${s.current}`;
        seen = [];
      }
      const now = JSON.stringify(rewound(s)),
        input = backInput(s),
        t = s.pending[0];
      seen.push(now);
      if (input) {
        sites.add(`${t?.type}:${t?.card ?? t?.action ?? ""}`);
        const after = JSON.stringify(rewound(transition(s, p, input)));
        assert.ok(
          seen.includes(after),
          `seed ${seed} step ${n}: Back from ${t?.type} ${t?.card ?? t?.action ?? ""} did not rewind`,
        );
      }
      s = transition(s, p, exploreInput(s, random));
    }
  }
  // Guard against the sweep quietly reaching fewer kinds of Back.
  assert.ok(sites.size >= 20, `only ${sites.size} Back sites: ${[...sites]}`);
});

// ---- M15: leader and lore card backfill (C7, C5) ----
// Expected values come from the card text (game/data.js CARDS), the rulebook
// (Leaders & Lore, p.21) and data/faq.json, not from the engine.
test("Demagogue Bold: declaring lets you influence each Court card once, as far as agents last", () => {
  let s = table({ 0: ["administration-2"] });
  s.players[0].leader = "LEAD08";
  // Nine agents already on lane 0 leave exactly one in the supply for lane 3.
  s.court[0].agents[0] = 9;
  s = play(s, "administration-2", "lead");
  s = choose(s, "declare");
  assert.equal(s.pending[0].type, "bold");
  const open = (s) =>
    decision(s, 0)
      .choices.filter((c) => c.op === "bold")
      .map((c) => c.index);
  assert.deepEqual(open(s), [0, 1, 2, 3]);
  s = choose(s, "bold", (c) => c.index === 1);
  assert.equal(s.court[1].agents[0], 1);
  assert.equal(pool(s, 0, "agent"), 0);
  assert.deepEqual(open(s), [], "no agents left: only Done");
  s = choose(s, "skip");
  assert.equal(s.pending.length, 0);
  assertDeepInvariants(s);
  // With agents to spare, each card can be chosen only once.
  s = table({ 0: ["administration-2"] });
  s.players[0].leader = "LEAD08";
  s = choose(play(s, "administration-2", "lead"), "declare");
  s = choose(s, "bold", (c) => c.index === 2);
  assert.deepEqual(open(s), [0, 1, 3]);
  s = choose(s, "bold", (c) => c.index === 0);
  s = choose(s, "bold", (c) => c.index === 3);
  assert.deepEqual(open(s), [1]);
  s = choose(s, "skip");
  assert.deepEqual(
    s.court.map((c) => c.agents[0]),
    [1, 0, 1, 1],
  );
  assert.equal(s.pending.length, 0);
  assertDeepInvariants(s);
});
test("Demagogue Paranoid: a Ransack may take a Guild card the Demagogue could not secure", () => {
  let s = clear(table({ 0: ["aggression-4"] }));
  s.players[0].leader = "LEAD08";
  putCourt(s, "BC01", 0);
  // Only the defender's single agent is on the card; the Demagogue has none.
  s.court[0].agents[1] = 1;
  place(s, 0, "ship", "4-arrow", 2);
  const city = place(s, 1, "city", "4-arrow")[0];
  s = battleWith(s, "4-arrow", 1, [die("assault", "hit", "hit")]);
  s = choose(s, "resolve");
  s = choose(s, "hit");
  s = choose(s, "hit");
  assert.ok(!s.pieces.some((x) => x.id === city));
  assert.equal(s.pending[0].type, "ransack");
  s = choose(s, "ransack", (c) => c.card === "BC01");
  assert.ok(s.players[0].cards.includes("BC01"));
  assert.deepEqual(held(s.players[0], "trophies"), [
    [1, "city"],
    [1, "agent"],
  ]);
  assert.equal(s.court[0].agents[1], 0);
  assertDeepInvariants(s);
});
// Noble's Influential: a copied or pivoted influence may be taken twice, with
// one pip. A lead, another leader, or a resource-paid influence gets one.
for (const [mode, lead, own1] of [
  ["copy", "administration-2", "administration-3"],
  ["pivot", "aggression-4", "administration-3"],
])
  test(`Noble Influential: a ${mode}d influence may influence twice for one pip`, () => {
    let s = table({ 0: [lead], 1: [own1] });
    s.players[1].leader = "LEAD12";
    s = endTurn(play(s, lead, "lead"));
    s = play(s, own1, mode);
    const pips = s.turn.pips;
    s = choose(
      s,
      "action",
      (c) => c.action === "influence" && c.cost === "pip",
    );
    s = choose(s, "influenceTarget", (c) => c.index === 0);
    assert.equal(s.pending[0].cost, "free");
    s = choose(s, "influenceTarget", (c) => c.index === 1);
    assert.equal(s.pending.length, 0);
    assert.equal(s.turn.pips, pips - 1);
    assert.deepEqual(
      s.court.map((c) => c.agents[1]),
      [1, 1, 0, 0],
    );
    assertDeepInvariants(s);
  });
test("Noble Influential: not on a lead, and not for another leader's copy", () => {
  let s = table({ 0: ["administration-2"] });
  s.players[0].leader = "LEAD12";
  s = play(s, "administration-2", "lead");
  s = act(s, "influence", "influenceTarget", (c) => c.index === 0);
  assert.equal(s.pending.length, 0);
  assert.equal(s.court[0].agents[0], 1);
  s = table({ 0: ["administration-2"], 1: ["administration-3"] });
  s = endTurn(play(s, "administration-2", "lead"));
  s = play(s, "administration-3", "copy");
  s = act(s, "influence", "influenceTarget", (c) => c.index === 0);
  assert.equal(s.pending.length, 0);
});
test("Shaper Ancient: no Catapult from a starport, Catapult from a gate", () => {
  const moved = (leader, from, to) => {
    let s = table({ 0: ["aggression-4"] });
    s.players[0].leader = leader;
    // Leave the gates empty, so entering them is not a controlled entry.
    s.pieces = s.pieces.filter((x) => !["6-gate", "1-gate"].includes(x.system));
    place(s, 0, "ship", "6-gate");
    s = play(s, "aggression-4", "lead");
    s = act(s, "move", "moveFrom", (c) => c.system === from);
    s = form(s, [
      decision(s, 0).form.options.find(
        (o) => s.pieces.find((x) => x.id === o.id).system === from,
      ).id,
    ]);
    s = choose(s, "moveTo", (c) => c.system === to);
    assertDeepInvariants(s);
    return s.pending[0]?.type;
  };
  // 6-hex holds Player 0's starport and fleet; 6-gate is adjacent to it.
  assert.equal(moved(null, "6-hex", "6-gate"), "catapult");
  assert.equal(moved("LEAD14", "6-hex", "6-gate"), undefined);
  // From a gate with no starport: only the Shaper may Catapult.
  assert.equal(moved(null, "6-gate", "1-gate"), undefined);
  assert.equal(moved("LEAD14", "6-gate", "1-gate"), "catapult");
});
test("Rebel Disorganized: a normal move takes at most two ships", () => {
  const start = (leader) => {
    let s = table({ 0: ["aggression-4"] });
    s.players[0].leader = leader;
    s = play(s, "aggression-4", "lead");
    return act(s, "move", "moveFrom", (c) => c.system === "6-hex");
  };
  const ids = (s) => decision(s, 0).form.options.map((o) => o.id);
  let s = start("LEAD05");
  assert.ok(ids(s).length >= 3);
  assert.equal(decision(s, 0).form.max, 2);
  assert.throws(() => form(s, ids(s).slice(0, 3)), /valid set/);
  s = form(s, ids(s).slice(0, 2));
  s = choose(s, "moveTo", (c) => c.system === "6-gate");
  assert.equal(
    s.pieces.filter((x) => x.system === "6-gate" && x.owner === 0).length,
    2,
  );
  assertDeepInvariants(s);
  // Any other leader moves all of them at once.
  s = start(null);
  assert.equal(decision(s, 0).form.max, 15);
  s = form(s, ids(s).slice(0, 3));
  assert.equal(s.pending[0].type, "moveTo");
});
test("Anarchist Inspiring: taxes a Rival city, ignoring control, only where it has a ship", () => {
  const offered = (leader) => {
    let s = clear(table({ 0: ["administration-4"] }));
    s.players[0].leader = leader;
    place(s, 0, "ship", "1-arrow");
    // The Rival controls both cities; only 1-arrow holds a ship of ours.
    place(s, 1, "ship", "1-arrow", 2);
    place(s, 1, "city", "1-arrow");
    place(s, 1, "ship", "1-hex", 2);
    place(s, 1, "city", "1-hex");
    s = play(s, "administration-4", "lead");
    return s;
  };
  const taxable = (s) =>
    decision(s, 0)
      .choices.filter((c) => c.op === "taxTarget" && c.piece)
      .map((c) => s.pieces.find((x) => x.id === c.piece).system);
  let s = offered("LEAD13");
  s = choose(s, "action", (c) => c.action === "tax" && c.cost === "pip");
  assert.deepEqual(taxable(s), ["1-arrow"]);
  s = choose(s, "taxTarget", (c) => c.piece);
  assert.deepEqual(s.players[0].resources.filter(Boolean), ["weapon"]);
  assert.deepEqual(held(s.players[0], "captives"), [[1, "agent"]]);
  assertDeepInvariants(s);
  // Without the leader the Rival's controlled cities cannot be taxed at all.
  s = offered(null);
  assert.ok(!decision(s, 0).choices.some((c) => c.action === "tax"));
});
// "Just battle" / "Just secure" skip the bonus: the paid action stands alone.
for (const [leader, main] of [
  ["LEAD06", "battle"],
  ["LEAD07", "secure"],
])
  test(`${leader} "Just ${main}" takes no bonus and queues none`, () => {
    const prompt = afterBonus(leader, "aggression", main);
    const pips = prompt.turn.pips;
    let s = choose(prompt, "withoutBonus");
    assert.equal(s.turn.pips, pips, "nothing is paid by choosing");
    // Back from the target list is Back from the bonus prompt: the action list.
    assertRewinds(beforeBonus(leader, "aggression", main), s);
    s = choose(
      s,
      main === "battle" ? "battleTarget" : "secureTarget",
      (c) => main === "battle" || CARDS[c.card].kind === "guild",
    );
    assert.equal(s.turn.pips, pips - 1);
    assert.ok(!s.pending.some((t) => t.type === "action"));
    if (main === "battle") {
      assert.equal(s.pending[0].type, "dice");
      s = resolveAll(s);
      assert.equal(
        s.pieces.filter((x) => x.owner === 1 && x.system === "1-arrow").length,
        1,
        "the Warrior's ship stayed where it fought",
      );
    } else {
      assert.equal(s.pending.length, 0);
      assert.equal(s.players[1].cards.length, 1);
      assert.equal(
        s.court.reduce((n, c) => n + c.agents[1], 0),
        6,
        "no bonus influence",
      );
    }
    assertDeepInvariants(s);
  });
// Court Enforcers' Abduct is a battle action, so the Warrior's move may come
// before or after it; the pip is paid once.
for (const when of ["bonusBefore", "bonusAfter"])
  test(`Warrior ${when} then Abduct: one pip, a free move around it`, () => {
    let s = own(beforeBonus("LEAD06", "aggression", "battle"), "BC14", 1);
    for (const lane of s.court) lane.id ??= s.courtDeck.shift();
    // Court Enforcers is a Weapon icon itself: with this Weapon, two in all.
    resources(s, 1, ["weapon"]);
    s.court[2].agents[0] = 1;
    s.court[3].agents[0] = 2;
    s = choose(s, "action", (c) => c.action === "battle" && c.cost === "pip");
    const pips = s.turn.pips;
    s = choose(s, when);
    if (when === "bonusBefore") s = choose(s, "skip");
    s = choose(s, "special", (c) => c.card === "BC14");
    assert.equal(backInput(s), null);
    // Two icons beat a card holding one Rival agent, not one holding two.
    assert.deepEqual(
      decision(s, 1)
        .choices.filter((c) => c.op === "abduct")
        .map((c) => c.index),
      [0, 1, 2],
    );
    s = choose(s, "abduct", (c) => c.index === 2);
    assert.deepEqual(held(s.players[1], "captives"), [[0, "agent"]]);
    assert.deepEqual(
      s.court.map((c) => c.agents[0]),
      [0, 0, 0, 2],
    );
    assert.equal(s.turn.pips, pips - 1);
    assert.deepEqual(
      s.pending.map((t) => [t.action, t.cost]),
      when === "bonusAfter" ? [["move", "free"]] : [],
    );
    assertDeepInvariants(s);
  });

test("L05 Hidden Harbors: ships are built fresh in a Rival-controlled system, other buildings are not", () => {
  const built = (lore) => {
    let s = clear(table({ 0: ["construction-4"] }));
    if (lore) own(s, "L05");
    for (const lane of s.court) lane.id ??= s.courtDeck.shift();
    place(s, 0, "starport", "4-arrow");
    place(s, 1, "ship", "4-arrow", 2);
    assert.equal(control(s, "4-arrow"), 1);
    s = play(s, "construction-4", "lead");
    s = act(
      s,
      "build",
      "buildTarget",
      (c) => c.kind === "ship" && c.system === "4-arrow",
    );
    s = act(
      s,
      "build",
      "buildTarget",
      (c) => c.kind === "city" && c.system === "4-arrow",
    );
    assertDeepInvariants(s);
    const mine = (type) =>
      s.pieces.findLast(
        (x) => x.owner === 0 && x.type === type && x.system === "4-arrow",
      ).damaged;
    return [mine("ship"), mine("city")];
  };
  assert.deepEqual(built(false), [true, true]);
  assert.deepEqual(built(true), [false, true]);
});
// FAQ (Gate Ports, Gate Stations): a gate holds at most one of each building
// in total, even if the card changed hands. The two types do not block each
// other.
test("L08 Gate Ports and L11 Gate Stations: gate buildings need the card, one of each per gate in total", () => {
  // What building at 1-gate offers, from the action list (none: no build).
  const offers = (s) =>
    decision(s, s.current).choices.some((c) => c.action === "build")
      ? decision(
          choose(s, "action", (c) => c.action === "build"),
          s.current,
        )
          .choices.filter(
            (c) =>
              c.op === "buildTarget" &&
              c.system === "1-gate" &&
              c.kind !== "ship",
          )
          .map((c) => c.kind)
          .sort()
      : [];
  const start = (lore) => {
    let s = clear(table({ 0: ["construction-4"], 1: ["construction-3"] }));
    for (const id of lore) own(s, id);
    for (const lane of s.court) lane.id ??= s.courtDeck.shift();
    place(s, 0, "ship", "1-gate");
    place(s, 1, "ship", "1-gate");
    place(s, 0, "starport", "6-hex");
    place(s, 1, "starport", "6-hex");
    return play(s, "construction-4", "lead");
  };
  const gateBuild = (s, kind) =>
    act(
      s,
      "build",
      "buildTarget",
      (c) => c.kind === kind && c.system === "1-gate",
    );
  assert.deepEqual(offers(start([])), []);
  assert.deepEqual(offers(start(["L08"])), ["starport"]);
  assert.deepEqual(offers(start(["L11"])), ["city"]);
  assert.deepEqual(offers(start(["L08", "L11"])), ["city", "starport"]);
  // A starport there leaves room for a city, but not a second starport, for
  // its owner or, if the card is passed on, anyone else.
  let s = gateBuild(start(["L08", "L11"]), "starport");
  assert.deepEqual(offers(s), ["city"]);
  s = endTurn(s);
  own(s, "L08", 1);
  own(s, "L11", 1);
  s = play(s, "construction-3", "copy");
  assert.deepEqual(offers(s), ["city"]);
  s = gateBuild(s, "city");
  assert.deepEqual(offers(s), []);
  assertDeepInvariants(s);
});
test("L11 Gate Stations: a gate city is every type in its cluster, taxed and Outraged for each", () => {
  const gate = (lead, cities, cityOwner = 1) => {
    let s = clear(table({ 0: [lead] }));
    own(s, "L11", 1);
    for (const lane of s.court) lane.id ??= s.courtDeck.shift();
    place(s, 0, "ship", "1-gate", 2);
    const city = place(s, cityOwner, "city", "1-gate")[0];
    for (const [owner, system] of cities) place(s, owner, "city", system);
    return [s, city];
  };
  // Cluster 1: arrow Weapon, crescent Fuel, hex Material.
  const cluster = [
    [2, "1-arrow"],
    [3, "1-crescent"],
    [1, "1-hex"],
  ];
  let [s, city] = gate("administration-4", cluster);
  s = play(s, "administration-4", "lead");
  s = act(s, "tax", "taxTarget", (c) => c.piece === city);
  assert.equal(s.pending[0].type, "taxType");
  assert.deepEqual(s.pending[0].resources, ["weapon", "fuel", "material"]);
  s = choose(s, "taxResource", (c) => c.resource === "fuel");
  assert.deepEqual(s.players[0].resources.filter(Boolean), ["fuel"]);
  assert.deepEqual(held(s.players[0], "captives"), [[1, "agent"]]);
  assertDeepInvariants(s);
  // Destroying it Outrages every one of those types.
  [s, city] = gate("aggression-4", cluster);
  s = battleWith(s, "1-gate", 1, [die("assault", "hit", "hit")]);
  s = choose(s, "resolve");
  s = choose(choose(s, "hit"), "hit");
  assert.ok(!s.pieces.some((x) => x.id === city));
  assert.deepEqual(s.players[0].outrage.sort(), ["fuel", "material", "weapon"]);
  assertDeepInvariants(resolveAll(s));
  // Only the cities of its own cluster count: with none, it has no type.
  [s, city] = gate("aggression-4", [[2, "4-arrow"]]);
  s = battleWith(s, "1-gate", 1, [die("assault", "hit", "hit")]);
  s = choose(s, "resolve");
  s = choose(choose(s, "hit"), "hit");
  assert.ok(!s.pieces.some((x) => x.id === city));
  assert.deepEqual(s.players[0].outrage, []);
  assertDeepInvariants(resolveAll(s));
});
// Empath's Bond works only while Empath is declared.
test("L20 Empath's Bond: Rival starports build ships, damaged in a Rival-controlled system", () => {
  const ships = (declare) => {
    let s = own(clear(table({ 0: ["construction-6"] })), "L20");
    for (const lane of s.court) lane.id ??= s.courtDeck.shift();
    place(s, 1, "starport", "4-arrow");
    place(s, 1, "ship", "4-arrow", 2);
    place(s, 1, "starport", "4-hex");
    s = play(s, "construction-6", "lead");
    if (declare) s = choose(s, "declare", (c) => c.ambition === "empath");
    if (!decision(s, 0).choices.some((c) => c.action === "build")) return [];
    s = choose(s, "action", (c) => c.action === "build" && c.cost === "pip");
    const sites = decision(s, 0)
      .choices.filter((c) => c.kind === "ship")
      .map((c) => c.system)
      .sort();
    if (!declare) return sites;
    s = choose(s, "buildTarget", (c) => c.system === "4-arrow");
    s = act(s, "build", "buildTarget", (c) => c.system === "4-hex");
    const at = (system) =>
      s.pieces.find((x) => x.owner === 0 && x.system === system);
    assert.equal(at("4-arrow").damaged, true);
    assert.equal(at("4-hex").damaged, false);
    assertDeepInvariants(s);
    return sites;
  };
  assert.deepEqual(ships(true), ["4-arrow", "4-hex"]);
  assert.deepEqual(ships(false), []);
});
test("L20 Empath's Bond: Catapult from a Rival starport, and Captives only where you control the city", () => {
  const moved = (declare) => {
    let s = own(clear(table({ 0: ["aggression-6"] })), "L20");
    for (const lane of s.court) lane.id ??= s.courtDeck.shift();
    place(s, 1, "starport", "4-hex");
    place(s, 0, "ship", "4-hex", 2);
    s = play(s, "aggression-6", "lead");
    if (declare) s = choose(s, "declare", (c) => c.ambition === "empath");
    s = moveFleet(s, "4-hex", "4-gate");
    assertDeepInvariants(s);
    return s.pending[0]?.type;
  };
  assert.equal(moved(true), "catapult");
  assert.equal(moved(false), undefined);
  // The Bond ends Captives only for a city you do not control; with control
  // the ordinary tax, Captive included, is kept (BUILD-PLAN section 9).
  const tax = (mine) => {
    let s = own(clear(table({ 0: ["administration-6"] })), "L20");
    for (const lane of s.court) lane.id ??= s.courtDeck.shift();
    const city = place(s, 1, "city", "4-arrow")[0];
    place(s, mine ? 0 : 1, "ship", "4-arrow", 2);
    s = play(s, "administration-6", "lead");
    s = choose(s, "declare", (c) => c.ambition === "empath");
    s = act(s, "tax", "taxTarget", (c) => c.piece === city);
    assertDeepInvariants(s);
    return s.players[0].captives.length;
  };
  assert.equal(tax(false), 0);
  assert.equal(tax(true), 1);
});
test("L06 Signal Breaker: one rolled intercept is ignored only if every attacker started fresh", () => {
  const hitsOnMe = (damagedStart, dice) => {
    let s = own(table({ 0: ["aggression-4"] }), "L06");
    for (const lane of s.court) lane.id ??= s.courtDeck.shift();
    place(s, 0, "ship", "4-arrow", 2);
    if (damagedStart) place(s, 0, "ship", "4-arrow", 1, true);
    place(s, 1, "ship", "4-arrow", 2);
    s = battleWith(s, "4-arrow", 1, dice);
    s = choose(s, "resolve");
    assertDeepInvariants(s);
    return s.pending.filter((t) => t.type === "hits" && t.target === 0).length
      ? s.pending.find((t) => t.type === "hits" && t.target === 0).left
      : 0;
  };
  const one = [die("assault", "intercept", "hit")];
  const two = [one[0], die("assault", "intercept", "hit")];
  assert.equal(hitsOnMe(false, one), 0, "its only intercept is ignored");
  assert.equal(hitsOnMe(false, two), 2, "one of two is ignored: one per ship");
  assert.equal(hitsOnMe(true, one), 2, "a damaged attacker: not ignored");
});
test("L13 Ancient Holdings: the token on the card counts for ambitions and can pay a Prelude action", () => {
  let s = clear(own(table({ 0: ["administration-2"] }), "L13"));
  for (const lane of s.court) lane.id ??= s.courtDeck.shift();
  s.players[0].resources[2] = "relic";
  s.supply.relic--;
  assert.deepEqual(resourceKeysFor(s, 0), [3, 1, 4]);
  assert.equal(ambitionValues(s, "keeper")[0], 1);
  s.court[0].agents[0] = 1;
  s = play(s, "administration-2", "lead");
  // Relic secures; the slot index is the card's, the last.
  s = choose(s, "action", (c) => c.action === "secure" && c.cost === 2);
  s = choose(s, "secureTarget");
  assert.equal(s.players[0].resources[2], null);
  assert.deepEqual(s.held, ["relic"]);
  assert.equal(ambitionValues(s, "keeper")[0], 0);
  assertDeepInvariants(s);
});
test("L18 Survival Overrides: sacrifices a fresh Loyal ship to destroy a non-Loyal one as a Trophy", () => {
  let s = clear(own(table({ 0: ["aggression-1"] }), "L18"));
  for (const lane of s.court) lane.id ??= s.courtDeck.shift();
  const [fresh] = place(s, 0, "ship", "4-arrow");
  const [hurt] = place(s, 0, "ship", "4-arrow", 1, true);
  const [rival, rivalHurt] = [
    place(s, 1, "ship", "4-arrow")[0],
    place(s, 2, "ship", "4-arrow", 1, true)[0],
  ];
  s = play(s, "aggression-1", "lead");
  s = choose(s, "action", (c) => c.action === "move" && c.cost === "pip");
  const pips = s.turn.pips;
  s = choose(s, "special", (c) => c.card === "L18");
  const offers = decision(s, 0).choices.filter((c) => c.op === "martyr");
  assert.ok(
    offers.every((c) => c.own === fresh),
    "only a fresh ship",
  );
  assert.deepEqual(
    offers.map((c) => c.target ?? null),
    [null, rival, rivalHurt],
  );
  s = choose(s, "martyr", (c) => c.target === rivalHurt);
  const left = s.pieces.map((x) => x.id);
  assert.ok(!left.includes(fresh) && !left.includes(rivalHurt));
  assert.ok(left.includes(hurt) && left.includes(rival));
  assert.deepEqual(held(s.players[0], "trophies"), [[2, "ship"]]);
  assert.equal(s.turn.pips, pips - 1);
  assertDeepInvariants(s);
});
// Tycoon's Charm Prelude: clear Material and Fuel Outrage by discarding it.
for (const [before, after] of [
  [["fuel", "relic"], ["relic"]],
  [["material"], []],
  [
    ["weapon", "material", "fuel", "psionic"],
    ["weapon", "psionic"],
  ],
])
  test(`L28 Tycoon's Charm clears ${before} Outrage, leaving ${after.length ? after : "none"}`, () => {
    let s = own(table({ 0: ["administration-2"] }), "L28");
    for (const lane of s.court) lane.id ??= s.courtDeck.shift();
    s.players[0].outrage = [...before];
    const agents = pool(s, 0, "agent");
    s = play(s, "administration-2", "lead");
    s = choose(s, "guild", (c) => c.card === "L28");
    // Tycoon is not declared: only the Outrage clear is offered.
    assert.ok(!decision(s, 0).choices.some((c) => c.op === "tycoonTrade"));
    s = choose(s, "clearOutrage");
    assert.deepEqual(s.players[0].outrage, after);
    assert.equal(pool(s, 0, "agent"), agents + before.length - after.length);
    assert.ok(!s.players[0].cards.includes("L28"));
    assert.ok(s.courtDiscard.includes("L28"));
    assert.equal(s.turn.acted, true);
    assertDeepInvariants(s);
  });

// ---- M16: Guild, Vox, Errata and FAQ backfill (C12, E1, E2) ----
// Player 0 leads Aggression 1 and secures `id` from Court lane 1 with a real
// play, so the Vox prompt is the first thing pending. `prep` may arrange the
// table first (cards are handed over with giveCard so each stays in one place).
const secureVox = (id, prep = () => {}) => {
  const s = table({ 0: ["aggression-1"] });
  prep(s);
  return act(
    play(courtLane(s, id), "aggression-1", "lead"),
    "secure",
    "secureTarget",
    (c) => c.card === id,
  );
};
// What a resolved Vox leaves behind: the pip is spent, nothing is queued and
// lane 1 (where the card was) holds a card again.
function assertVoxDone(s, id) {
  assert.equal(s.pending.length, 0);
  assert.equal(s.turn.pips, ACTION_CARDS["aggression-1"].pips - 1);
  assert.ok(!s.players[0].cards.includes(id));
  assert.ok(s.court[1].id, "the Court lane is refilled");
}
test("Mass Uprising: one fresh ship in each system of the chosen cluster, then discarded", () => {
  let s = secureVox("BC26");
  const before = new Set(s.pieces.map((x) => x.id));
  assert.deepEqual(
    decision(s, 0)
      .choices.filter((c) => c.op === "uprising")
      .map((c) => c.cluster),
    s.clusters,
  );
  s = choose(s, "uprising", (c) => c.cluster === 1);
  const added = s.pieces.filter(
    (x) => x.owner === 0 && x.type === "ship" && !before.has(x.id),
  );
  assert.deepEqual(added.map((x) => x.system).sort(), [
    "1-arrow",
    "1-crescent",
    "1-gate",
    "1-hex",
  ]);
  assert.ok(added.every((x) => !x.damaged));
  assert.ok(s.courtDiscard.includes("BC26"));
  assertVoxDone(s, "BC26");
});
test("Populist Demands: declares any ambition, keeps the lead's rank, and is optional", () => {
  let s = secureVox("BC27");
  assert.deepEqual(
    decision(s, 0)
      .choices.filter((c) => c.op === "populist")
      .map((c) => c.ambition),
    AMBITIONS,
  );
  const rank = s.lead.rank;
  s = choose(s, "populist", (c) => c.ambition === "empath");
  assert.equal(s.markers[2].ambition, "empath");
  assert.equal(s.lead.rank, rank, "no zero marker (errata)");
  assert.ok(s.lead.declarations.at(-1).zero === false);
  assert.ok(s.courtDiscard.includes("BC27"));
  assertVoxDone(s, "BC27");
  // Skipping declares nothing and still discards the card.
  s = choose(secureVox("BC27"), "skip");
  assert.ok(s.markers.every((m) => !m.ambition));
  assert.ok(s.courtDiscard.includes("BC27"));
  assertVoxDone(s, "BC27");
});
test("Populist Demands offers only a skip once every marker is placed", () => {
  const s = courtLane(table({ 0: ["aggression-1"] }), "BC27");
  s.markers.forEach((m, i) => (m.ambition = AMBITIONS[i]));
  const at = act(play(s, "aggression-1", "lead"), "secure", "secureTarget");
  assert.deepEqual(
    decision(at, 0).choices.map((c) => c.op),
    ["skip"],
  );
});
test("Outrage Spreads: every player, the securer included, provokes the chosen Outrage", () => {
  let s = secureVox("BC28");
  const supply = s.supply.material,
    held = s.players.reduce(
      (n, p) => n + p.resources.filter((r) => r === "material").length,
      0,
    );
  assert.ok(held >= 2);
  s = choose(s, "outrageAll", (c) => c.resource === "material");
  for (const p of s.players) {
    assert.deepEqual(p.outrage, ["material"]);
    assert.ok(!p.resources.includes("material"));
  }
  assert.equal(s.supply.material, supply + held);
  assert.ok(s.courtDiscard.includes("BC28"));
  assertVoxDone(s, "BC28");
});
test("Outrage Spreads is optional: skipping provokes nothing", () => {
  const s = choose(secureVox("BC28"), "skip");
  assert.ok(s.players.every((p) => p.outrage.length === 0));
  assert.ok(s.courtDiscard.includes("BC28"));
  assertVoxDone(s, "BC28");
});
test("Call to Action draws the bottom of the face-down discard, then is discarded", () => {
  let s = secureVox("BC31");
  const bottom = s.discardDown[0],
    n = s.players[0].hand.length;
  s = choose(s, "call");
  assert.equal(s.players[0].hand.length, n + 1);
  assert.equal(s.players[0].hand.at(-1), bottom);
  assert.ok(s.courtDiscard.includes("BC31"));
  assertVoxDone(s, "BC31");
});
// Moves Court cards to the Court discard pile from wherever they are (a lane
// is refilled from the deck), so every card stays in one place.
function toCourtDiscard(s, ...ids) {
  for (const id of ids) {
    const lane = s.court.find((c) => c.id === id);
    if (lane) lane.id = s.courtDeck.shift();
    else if (s.courtDeck.includes(id)) remove(s.courtDeck, id);
    else {
      assert.ok(s.courtDiscard.includes(id), `${id} is somewhere else`);
      continue;
    }
    s.courtDiscard.push(id);
  }
  return s;
}
const remove = (list, x) => list.splice(list.indexOf(x), 1);
// Hands `id` to player `p`, refilling any lane it leaves.
function giveCard(s, id, p) {
  own(s, id, p);
  for (const lane of s.court) lane.id ??= s.courtDeck.shift();
  return s;
}
// Player 0 secures Guild Struggle in a game where the Court discard already
// holds Guild cards BC01 and BC21 and the Vox card BC28.
function guildStruggle(hold = {}) {
  const s = courtLane(table({ 0: ["aggression-1"] }), "BC30");
  toCourtDiscard(s, "BC01", "BC21", "BC28");
  for (const [p, ids] of Object.entries(hold))
    for (const id of ids) giveCard(s, id, Number(p));
  return act(play(s, "aggression-1", "lead"), "secure", "secureTarget");
}
const shuffledBack = (s) => {
  assert.ok(!s.courtDiscard.some((id) => CARDS[id].kind === "guild"));
  assert.ok(s.courtDeck.includes("BC01") && s.courtDeck.includes("BC21"));
  assert.ok(s.courtDiscard.includes("BC28"), "a Vox card stays discarded");
  assert.ok(s.courtDiscard.includes("BC30"), "Guild Struggle is discarded");
  assert.ok(!s.courtDeck.includes("BC30"));
};
test("Guild Struggle: steals one Guild card from a Rival, then shuffles the Guild discards into the deck", () => {
  let s = guildStruggle({ 1: ["BC23", "BC24"] });
  const steals = decision(s, 0).choices.filter((c) => c.op === "stealCard");
  assert.deepEqual(steals.map((c) => c.card).sort(), ["BC23", "BC24"]);
  s = choose(s, "stealCard", (c) => c.card === "BC24");
  assert.deepEqual(s.players[0].cards.slice(-1), ["BC24"]);
  assert.deepEqual(s.players[1].cards, ["BC23"]);
  shuffledBack(s);
  assertVoxDone(s, "BC30");
});
test("Guild Struggle still reshuffles the Guild discards when the theft is declined", () => {
  let s = guildStruggle({ 1: ["BC23"] });
  s = choose(s, "skip");
  assert.deepEqual(s.players[1].cards, ["BC23"]);
  assert.deepEqual(s.players[0].cards, []);
  shuffledBack(s);
  assertVoxDone(s, "BC30");
});
test("Guild Struggle steals only Guild cards, and Sworn Guardians shield the rest", () => {
  const s = guildStruggle({ 1: ["BC22", "BC23"], 2: ["BC01"] });
  // Player 1's Guardians protect their other cards, but can be stolen first.
  assert.deepEqual(
    decision(s, 0)
      .choices.filter((c) => c.op !== "skip")
      .map((c) => [c.op, c.card])
      .sort(),
    [
      ["stealCard", "BC01"],
      ["stealCard", "BC22"],
    ],
  );
});
test("Guild Struggle: stolen Sworn Guardians are buried in the Court deck", () => {
  let s = guildStruggle({ 1: ["BC22"] });
  s = choose(s, "stealCard", (c) => c.card === "BC22");
  assert.ok(!s.players[0].cards.includes("BC22"));
  assert.ok(!s.players[1].cards.includes("BC22"));
  assert.ok(s.courtDeck.includes("BC22"));
  shuffledBack(s);
  assertVoxDone(s, "BC30");
});
// Player 1 pivots into Aggression 1 and secures Song of Freedom from lane 1,
// while player 0 holds the initiative. Player 1 controls its own 4-hex city and
// (after 4 extra ships) player 0's 4-arrow city.
function songOfFreedom() {
  const s = courtLane(
    table({ 0: ["construction-2"], 1: ["aggression-1"] }),
    "BC29",
    1,
  );
  place(s, 1, "ship", "4-arrow", 4);
  const lead = endTurn(play(s, "construction-2", "lead"));
  return act(
    play(lead, "aggression-1", "pivot"),
    "secure",
    "secureTarget",
    (c) => c.card === "BC29",
  );
}
const cityAt = (s, system) =>
  s.pieces.find((x) => x.type === "city" && x.system === system);
test("Song of Freedom returns any city you control, a Rival's too, with no Outrage", () => {
  let s = songOfFreedom();
  const offered = decision(s, 1)
    .choices.filter((c) => c.op === "freedom")
    .map((c) => c.system)
    .sort();
  assert.deepEqual(offered, ["4-arrow", "4-hex"]);
  const rivals = pool(s, 0, "city");
  s = choose(s, "freedom", (c) => c.system === "4-arrow");
  assert.ok(!cityAt(s, "4-arrow"));
  assert.equal(pool(s, 0, "city"), rivals + 1);
  assert.deepEqual(
    s.players.map((p) => p.outrage),
    [[], [], [], []],
  );
  assert.deepEqual(s.players[0].captives, []);
  assert.deepEqual(s.players[1].trophies, []);
  assertDeepInvariants(s);
});
test("Song of Freedom: a Rival whose full resource slots shrink chooses what to discard", () => {
  let s = songOfFreedom();
  resources(s, 0, ["relic", "psionic", "fuel"]);
  s = choose(s, "freedom", (c) => c.system === "4-arrow");
  assert.equal(s.pending[0].type, "overflow");
  assert.equal(s.pending[0].p, 0, "the owner of the resources decides");
  s = choose(s, "discard", (c) => c.label.includes("psionic"));
  assert.deepEqual(s.players[0].resources.filter(Boolean).sort(), [
    "fuel",
    "relic",
  ]);
  assert.equal(s.pending[0].type, "freedomSeize", "then the seize choice");
  assertDeepInvariants(s);
});
test("Song of Freedom: the securer may then seize the initiative, and the card is shuffled into the deck", () => {
  let s = songOfFreedom();
  s = choose(s, "freedom", (c) => c.system === "4-hex");
  assert.equal(s.pending[0].type, "freedomSeize");
  s = choose(s, "freedomSeize");
  assert.equal(s.initiative, 1);
  assert.equal(s.seized, true);
  assert.ok(!s.courtDiscard.includes("BC29"));
  assert.ok(
    s.courtDeck.includes("BC29") || s.court.some((c) => c.id === "BC29"),
    "back in the Court deck (or dealt straight into the refilled lane)",
  );
  assert.ok(s.court[1].id, "the lane is refilled after the seize choice");
  assert.equal(s.pending.length, 0);
  assertDeepInvariants(s);
});
test("Song of Freedom: declining the seize, or the return, leaves the initiative alone", () => {
  let s = choose(
    choose(songOfFreedom(), "freedom", (c) => c.system === "4-hex"),
    "skip",
  );
  assert.equal(s.initiative, 0);
  assert.ok(!s.seized);
  assert.ok(!s.courtDiscard.includes("BC29"));
  // Declining the return offers no seize at all.
  s = choose(songOfFreedom(), "skip");
  assert.equal(s.pending.length, 0);
  assert.equal(s.initiative, 0);
  assert.ok(cityAt(s, "4-hex"));
  assert.ok(!s.courtDiscard.includes("BC29"));
  assertDeepInvariants(s);
});
test("Song of Freedom offers no seize to the holder of the initiative", () => {
  const s = choose(secureVox("BC29"), "freedom");
  assert.equal(s.pending.length, 0, "nothing to seize");
  assert.equal(s.initiative, 0);
  assert.ok(!s.courtDiscard.includes("BC29"));
});
// The Loyal guilds: kept on Outrage, and any resource can be spent as theirs.
const LOYAL = [
  ["BC01", "material", "BC02", "build"],
  ["BC07", "fuel", "BC08", "move"],
  ["BC15", "weapon", "BC13", "weapons"],
  ["BC19", "psionic", "BC18", "tax"],
  ["BC21", "relic", "BC23", "secure"],
];
for (const [id, r, other, op] of LOYAL) {
  test(`${CARDS[id].name} is kept on ${r} Outrage; another ${r} guild is discarded`, () => {
    let s = secureVox("BC28", (s) => {
      giveCard(s, id, 0);
      giveCard(s, other, 0);
      giveCard(s, other === "BC02" ? "BC03" : "BC22", 1);
      resources(s, 0, [r]);
    });
    s = choose(s, "outrageAll", (c) => c.resource === r);
    assert.ok(s.players[0].cards.includes(id));
    assert.ok(!s.players[0].cards.includes(other));
    assert.ok(s.courtDiscard.includes(other));
    assert.deepEqual(s.players[0].resources.filter(Boolean), []);
    assert.deepEqual(s.players[0].outrage, [r]);
    assert.ok(s.players[1].cards.every((c) => CARDS[c].resource !== r));
    assert.ok(s.courtDiscard.includes("BC28"));
    assertDeepInvariants(s);
  });
  // Slot 0 holds a Fuel (a Material for Loyal Pilots), never the guild's own
  // resource, while that resource is Outraged.
  test(`${CARDS[id].name}: any resource is spent as ${r}, ignoring ${r} Outrage`, () => {
    const ops = (card) => {
      const s = table({ 0: ["administration-2"] });
      if (card) giveCard(s, card, 0);
      s.players[0].outrage = [r];
      s.court[0].agents[0] = 1;
      resources(s, 0, [r === "fuel" ? "material" : "fuel"]);
      return decision(play(s, "administration-2", "lead"), 0)
        .choices.filter((c) => c.cost === 0)
        .map((c) => c.action ?? c.op);
    };
    assert.ok(!ops(null).includes(op), `${op} without ${id}`);
    assert.ok(ops(id).includes(op), `${op} with ${id}`);
  });
}
test("after scoring, Cartels make rivals discard even when Tycoon was not scored", () => {
  let s = giveCard(giveCard(table(), "BC03", 0), "BC06", 1);
  resources(s, 0, ["material", "fuel"]);
  resources(s, 1, ["material", "fuel"]);
  resources(s, 2, ["material", "fuel", "weapon"]);
  s = passChapter(s);
  assert.equal(s.chapter, 2);
  assert.deepEqual(s.scoreHistory[0].ambitions, [], "no ambition scored");
  const kept = (p) => s.players[p].resources.filter(Boolean).sort();
  // Player 0 holds the Material Cartel, player 1 the Fuel Cartel.
  assert.deepEqual(kept(0), ["material"]);
  assert.deepEqual(kept(1), ["fuel"]);
  assert.deepEqual(kept(2), ["weapon"]);
  assert.deepEqual(kept(3), ["weapon"]);
  assertDeepInvariants(s);
});
const lattice = (s) =>
  decision(s, s.current).choices.some(
    (c) => c.op === "guild" && c.card === "BC16",
  );
test("BC16 Lattice Spies seizes the initiative before any action, without discarding a card", () => {
  let s = giveCard(
    table({ 0: ["construction-2"], 1: ["construction-3"] }),
    "BC16",
    1,
  );
  s = endTurn(play(s, "construction-2", "lead"));
  s = play(s, "construction-3", "copy");
  assert.ok(lattice(s));
  const hand = s.players[1].hand.length;
  s = choose(s, "guild", (c) => c.card === "BC16");
  assert.equal(s.initiative, 1);
  assert.equal(s.seized, true);
  assert.ok(s.courtDiscard.includes("BC16"));
  assert.ok(!s.players[1].cards.includes("BC16"));
  assert.equal(s.players[1].hand.length, hand, "no hand card discarded");
  // The seize carries into the next round.
  s = endTurn(s);
  s = copyAndEnd(copyAndEnd(s));
  assert.equal(s.initiative, 1);
  assert.equal(s.current, 1);
  assert.equal(s.round, 2);
  assertDeepInvariants(s);
});
test("BC16 Lattice Spies closes after any action, and does nothing once the initiative is seized", () => {
  let s = giveCard(
    table({ 0: ["construction-2"], 1: ["construction-3"] }),
    "BC16",
    1,
  );
  resources(s, 1, ["material"]);
  s = endTurn(play(s, "construction-2", "lead"));
  s = play(s, "construction-3", "copy");
  assert.ok(lattice(s));
  // A Material spent in the Prelude is an action; the Prelude is still open
  // but "before any other actions" has passed.
  s = act(s, "build", "buildTarget", (c) => c.kind === "ship", 0);
  assert.ok(s.turn.prelude && s.turn.acted);
  assert.ok(!lattice(s), "not offered after an action");
  // Another player seizes first: a later Lattice Spies is only discarded.
  let t = giveCard(
    table({ 0: ["construction-2"], 1: ["construction-3"] }),
    "BC16",
    2,
  );
  t = endTurn(play(t, "construction-2", "lead"));
  t = endTurn(
    choose(play(t, "construction-3", "copy"), "seize", (c) => c.card),
  );
  assert.equal(t.initiative, 1);
  t = play(t, t.players[2].hand[0], "copy");
  assert.ok(lattice(t), "still offered, as a plain discard");
  t = choose(t, "guild", (c) => c.card === "BC16");
  assert.equal(t.initiative, 1);
  assert.ok(t.courtDiscard.includes("BC16"));
  assertDeepInvariants(t);
});
// Player 0 leads Administration 2 and spends Silver-Tongues in the Prelude.
const silverTongues = (prep = () => {}) => {
  const s = table({ 0: ["administration-2"] });
  giveCard(s, "BC20", 0);
  prep(s);
  return choose(
    play(s, "administration-2", "lead"),
    "guild",
    (c) => c.card === "BC20",
  );
};
test("BC20 Silver-Tongues steals a resource from a Rival", () => {
  let s = silverTongues((s) => {
    resources(s, 0, ["relic"]);
    resources(s, 1, ["material", "fuel"]);
  });
  const offers = decision(s, 0)
    .choices.filter((c) => c.op === "stealResource")
    .map((c) => [c.defender, s.players[c.defender].resources[c.index]]);
  assert.deepEqual(
    offers.filter(([d]) => d === 1),
    [
      [1, "material"],
      [1, "fuel"],
    ],
  );
  const supply = structuredClone(s.supply);
  s = choose(s, "stealResource", (c) => c.defender === 1 && c.index === 1);
  assert.deepEqual(s.players[0].resources.filter(Boolean).sort(), [
    "fuel",
    "relic",
  ]);
  assert.deepEqual(s.players[1].resources.filter(Boolean), ["material"]);
  assert.deepEqual(s.supply, supply, "stolen, not gained from the supply");
  assert.ok(s.courtDiscard.includes("BC20"));
  assert.equal(s.pending.length, 0);
  assert.equal(s.turn.acted, true);
  assertDeepInvariants(s);
});
test("BC20 Silver-Tongues cannot steal resources behind Sworn Guardians, only the Guardians", () => {
  const s = silverTongues((s) => {
    giveCard(s, "BC22", 1);
    resources(s, 1, ["material"]);
  });
  assert.ok(
    !decision(s, 0).choices.some(
      (c) => c.op === "stealResource" && c.defender === 1,
    ),
  );
  assert.ok(
    decision(s, 0).choices.some(
      (c) => c.op === "stealCard" && c.card === "BC22",
    ),
  );
});
test("BC20 Silver-Tongues can be discarded with nothing to steal", () => {
  let s = silverTongues((s) => {
    for (const p of [1, 2, 3]) resources(s, p, []);
  });
  assert.deepEqual(
    decision(s, 0).choices.map((c) => c.op),
    ["skip"],
  );
  s = choose(s, "skip");
  assert.ok(s.courtDiscard.includes("BC20"));
  assert.ok(!s.players[0].cards.includes("BC20"));
  assertDeepInvariants(s);
});
// Player 0 leads Aggression 2 (and does not declare); player 1, holding
// Galactic Bards, plays `card` as a Surpass or Pivot.
function bards(card, mode) {
  const s = giveCard(table({ 0: ["aggression-2"], 1: [card] }), "BC25", 1);
  return play(endTurn(play(s, "aggression-2", "lead")), card, mode);
}
const declareOptions = (s) =>
  decision(s, s.current)
    .choices.filter((c) => c.op === "declare")
    .map((c) => c.ambition);
for (const [card, mode, ambition] of [
  ["aggression-4", "surpass", "warlord"],
  ["administration-5", "pivot", "keeper"],
])
  test(`BC25 Galactic Bards declare on a ${mode} without the zero marker`, () => {
    let s = bards(card, mode);
    assert.deepEqual(declareOptions(s), [ambition]);
    const rank = s.lead.rank;
    assert.equal(rank, 2, "the led card's rank");
    s = choose(s, "declare");
    assert.equal(s.markers[2].ambition, ambition);
    assert.equal(s.lead.rank, rank, "no zero marker on the led card");
    assert.equal(s.lead.declarations.at(-1).zero, false);
    assert.deepEqual(declareOptions(s), [], "once");
    assertDeepInvariants(s);
  });
test("BC25 Galactic Bards: a 7 declares any ambition", () => {
  const s = bards("aggression-7", "surpass");
  assert.deepEqual(declareOptions(s), AMBITIONS);
});
test("BC25 Galactic Bards: seizing and declaring work in either order", () => {
  const seizeCard = (s) => s.players[1].hand.find((c) => c !== "aggression-4");
  let s = bards("aggression-4", "surpass");
  s = choose(s, "seize", (c) => c.card === seizeCard(s));
  assert.equal(s.initiative, 1);
  assert.deepEqual(declareOptions(s), ["warlord"], "declare after seizing");
  s = choose(s, "declare");
  assert.equal(s.markers[2].ambition, "warlord");
  s = bards("aggression-4", "surpass");
  s = choose(s, "declare");
  assert.ok(seizes(s), "seize after declaring");
  s = choose(s, "seize", (c) => c.card === seizeCard(s));
  assert.equal(s.initiative, 1);
  assertDeepInvariants(s);
});
test("BC25 Galactic Bards cannot declare after the lead already declared this round", () => {
  let s = giveCard(
    table({ 0: ["aggression-2"], 1: ["aggression-4"] }),
    "BC25",
    1,
  );
  s = endTurn(choose(play(s, "aggression-2", "lead"), "declare"));
  s = play(s, "aggression-4", "surpass");
  assert.deepEqual(declareOptions(s), []);
});
test("BC25 Galactic Bards: a copy does not declare", () => {
  const s = giveCard(table({ 0: ["aggression-2"] }), "BC25", 1);
  const t = play(
    endTurn(play(s, "aggression-2", "lead")),
    s.players[1].hand[0],
    "copy",
  );
  assert.deepEqual(declareOptions(t), []);
});
// The Cartels' Tycoon count is covered where the ambitions are (BC03/BC06).
for (const [id, r, otherResource] of [
  ["BC03", "material", "fuel"],
  ["BC06", "fuel", "material"],
]) {
  const name = CARDS[id].name;
  test(`${name}: its supply is not a resource for Relic Fence`, () => {
    const turn = (slots) => {
      const s = giveCard(
        giveCard(table({ 0: ["administration-2"] }), id, 0),
        "BC24",
        0,
      );
      resources(s, 0, slots);
      return play(s, "administration-2", "lead");
    };
    assert.ok(turn([]).players[0].cards.includes(id));
    assert.ok(
      !decision(turn([]), 0).choices.some((c) => c.card === "BC24"),
      "nothing in the slots to discard",
    );
    // With a token in a slot only that slot is offered, never the supply.
    const before = turn([r]),
      s = choose(before, "guild", (c) => c.card === "BC24");
    assertRewinds(before, s);
    assert.deepEqual(
      decision(s, 0)
        .choices.filter((c) => c.op === "fence")
        .map((c) => c.index),
      [0],
    );
  });
  test(`${name}: its supply cannot be stolen`, () => {
    const s = giveCard(
      giveCard(table({ 0: ["administration-2"] }), id, 1),
      "BC20",
      0,
    );
    for (const p of [1, 2, 3]) resources(s, p, []);
    assert.ok(s.supply[r] > 0);
    const t = choose(
      play(s, "administration-2", "lead"),
      "guild",
      (c) => c.card === "BC20",
    );
    assert.ok(!decision(t, 0).choices.some((c) => c.op === "stealResource"));
  });
  test(`${name}: discarded in the Prelude with nothing to steal, or stealing only its own resource`, () => {
    const prelude = (slots) => {
      const s = giveCard(table({ 0: ["administration-2"] }), id, 0);
      resources(s, 1, slots);
      for (const p of [2, 3]) resources(s, p, []);
      return choose(
        play(s, "administration-2", "lead"),
        "guild",
        (c) => c.card === id,
      );
    };
    let s = prelude([otherResource]);
    assert.ok(s.courtDiscard.includes(id));
    assert.deepEqual(
      decision(s, 0).choices.map((c) => c.op),
      ["skip"],
      "a Rival's other resource is not stealable",
    );
    s = choose(s, "skip");
    assert.ok(!s.players[0].cards.includes(id));
    assert.equal(s.pending.length, 0);
    s = prelude([r, "relic"]);
    assert.deepEqual(
      decision(s, 0)
        .choices.filter((c) => c.op === "stealResource")
        .map((c) => s.players[c.defender].resources[c.index]),
      [r],
    );
    s = choose(s, "stealResource");
    assert.ok(s.players[0].resources.includes(r));
    assert.deepEqual(s.players[1].resources.filter(Boolean), ["relic"]);
    assertDeepInvariants(s);
  });
}

// ---- Errata (E1) ----
// Upstart's Callow reads "You cannot tax cities that you do not control", so
// Empath's Bond adds only Rival starports for building and Catapult moves.
test("Upstart cannot tax a city it does not control, even with Empath's Bond", () => {
  const taxed = (prep, bond) => {
    const s = table({ 0: ["administration-2"] });
    s.players[0].leader = "LEAD04";
    if (bond) {
      giveCard(s, "L20", 0);
      s.markers[2].ambition = "empath";
    }
    prep(s);
    const t = play(s, "administration-2", "lead");
    if (!decision(t, 0).choices.some((c) => c.action === "tax")) return [];
    const u = choose(
      t,
      "action",
      (c) => c.action === "tax" && c.cost === "pip",
    );
    return decision(u, 0)
      .choices.filter((c) => c.op === "taxTarget")
      .map((c) => u.pieces.find((x) => x.id === c.piece).system)
      .sort();
  };
  // Player 0's city at 4-arrow is controlled; player 1's at 4-hex is not.
  for (const bond of [false, true]) {
    assert.deepEqual(
      taxed(() => {}, bond),
      ["4-arrow"],
      `bond ${bond}`,
    );
    // Controlling the Rival city (4 ships to 3) makes it taxable again...
    assert.deepEqual(
      taxed((s) => place(s, 0, "ship", "4-hex", 4), bond),
      ["4-arrow", "4-hex"],
    );
    // ...and losing control of its own city makes that untaxable.
    assert.deepEqual(
      taxed((s) => place(s, 1, "ship", "4-arrow", 4), bond),
      [],
    );
  }
});
test("Upstart with Empath's Bond still builds ships at a Rival starport", () => {
  let s = table({ 0: ["construction-2"] });
  s.players[0].leader = "LEAD04";
  giveCard(s, "L20", 0);
  s.markers[2].ambition = "empath";
  s = play(s, "construction-2", "lead");
  s = choose(s, "action", (c) => c.action === "build" && c.cost === "pip");
  assert.ok(
    decision(s, 0).choices.some(
      (c) => c.kind === "ship" && c.system === "5-hex",
    ),
    "Player 1's starport at 5-hex builds for the Upstart",
  );
});
// Mirror Plating adds an intercept that is not rolled; the Agitator's Irregular
// ability reads "is intercepted", so it applies to that intercept too.
test("Agitator's Irregular applies to the intercept Mirror Plating adds", () => {
  const intercepted = (agitator) => {
    let s = table({ 0: ["aggression-4"] });
    giveCard(s, "L04", 1);
    if (agitator) s.players[1].leader = "LEAD15";
    resources(s, 1, ["weapon"]);
    place(s, 1, "ship", "4-arrow", 2);
    s = battleWith(s, "4-arrow", 1, [die("assault")]);
    s = choose(s, "resolve");
    assert.equal(s.pending[0].type, "hits");
    assert.equal(s.pending[0].target, 0, "the attacker is hit");
    return [
      s.pending[0].left,
      s.players[1].resources.filter((r) => r === "weapon").length,
    ];
  };
  // Two fresh defenders intercept twice over (one hit each); the Agitator
  // instead deals one hit per Weapon icon and discards a Weapon.
  assert.deepEqual(intercepted(false), [2, 1]);
  assert.deepEqual(intercepted(true), [1, 0]);
});
// Force Beams moves ships to an adjacent system ignoring move modifiers: a
// Rival's Gate Ports capture nothing, and the move never becomes a Catapult.
function forceBeams(rivalGate) {
  let s = clear(own(table({ 0: ["mobilization-2"] }), "L16"));
  for (const lane of s.court) lane.id ??= s.courtDeck.shift();
  place(s, 0, "starport", "4-arrow");
  place(s, 0, "ship", "4-arrow", 2);
  if (rivalGate) {
    giveCard(s, "L08", 1);
    place(s, 1, "starport", "4-gate");
    place(s, 1, "ship", "4-gate", 2);
  }
  return play(s, "mobilization-2", "lead");
}
for (const rivalGate of [true, false])
  test(`Force Beams into a ${rivalGate ? "Rival's Gate Ports gate" : "free gate"}: no capture and no Catapult, unlike a normal move`, () => {
    // A normal move from the starport: captured by Gate Ports, or a Catapult.
    const normal = moveFleet(forceBeams(rivalGate), "4-arrow", "4-gate");
    assert.equal(normal.players[1].captives.length, rivalGate ? 1 : 0);
    assert.equal(normal.pending[0]?.type, rivalGate ? undefined : "catapult");
    // Force Beams over the same hop.
    let s = choose(
      forceBeams(rivalGate),
      "action",
      (c) => c.action === "move" && c.cost === "pip",
    );
    s = choose(s, "special", (c) => c.card === "L16");
    const guides = s;
    s = choose(
      s,
      "guide",
      (c) => c.system === "4-arrow" && c.target === "4-gate",
    );
    assertRewinds(guides, s);
    s = form(
      s,
      decision(s, 0).form.options.map((o) => o.id),
    );
    assert.equal(
      s.pieces.filter((x) => x.owner === 0 && x.system === "4-gate").length,
      2,
    );
    assert.deepEqual(s.players[1].captives, []);
    assert.equal(s.pending.length, 0);
    assert.equal(s.turn.pips, ACTION_CARDS["mobilization-2"].pips - 1);
    assertDeepInvariants(s);
  });
// ---- Unions ----
test("a Union leaves the player's cards once placed, so it cannot be stolen", () => {
  const stealable = (s) =>
    decision(s, s.current)
      .choices.filter((c) => c.op === "stealCard")
      .map((c) => c.card)
      .sort();
  const table1 = () => {
    const s = giveCard(
      giveCard(table({ 0: ["administration-3"] }), "BC04", 1),
      "BC23",
      1,
    );
    return s;
  };
  // Before it is placed the Union is an ordinary Guild card.
  let s = giveCard(table1(), "BC20", 0);
  s = choose(
    play(s, "administration-3", "lead"),
    "guild",
    (c) => c.card === "BC20",
  );
  assert.deepEqual(stealable(s), ["BC04", "BC23"]);
  // Placed beside the lead, it is out of the player's cards and out of reach.
  s = giveCard(table1(), "BC20", 2);
  s = endTurn(play(s, "administration-3", "lead"));
  s = play(s, s.players[1].hand[0], "copy");
  const before = s;
  s = choose(s, "guild", (c) => c.card === "BC04");
  // Opening the Union is not an action: skipping it leaves the table as it was.
  assert.deepEqual(rewound(choose(s, "skip")), rewound(before));
  s = endTurn(choose(s, "union", (c) => c.target === "administration-3"));
  assert.ok(!s.players[1].cards.includes("BC04"));
  assert.deepEqual(s.unions, [
    { p: 1, card: "BC04", target: "administration-3" },
  ]);
  s = play(s, s.players[2].hand[0], "copy");
  s = choose(s, "guild", (c) => c.card === "BC20");
  assert.deepEqual(stealable(s), ["BC23"]);
  assertDeepInvariants(s);
});

// ---- FAQ (E2) ----
// Swaps Court cards so the deck's top cards are `ids`, in order, wherever they
// were (a lane, the deck or the discard); every card stays in one place.
function deckTop(s, ...ids) {
  ids.forEach((id, i) => {
    const lists = [
      ...s.court.map((lane) => [lane, "id"]),
      ...s.courtDeck.map((_, k) => [s.courtDeck, k]),
      ...s.courtDiscard.map((_, k) => [s.courtDiscard, k]),
    ];
    const from = lists.find(([o, k]) => o[k] === id);
    assert.ok(from, `${id} is in the Court`);
    [from[0][from[1]], s.courtDeck[i]] = [s.courtDeck[i], id];
  });
  return s;
}
// Noble leads Aggression 2 and declares Tycoon, so Connected draws and secures
// the deck's top card.
function nobleDeclares(...top) {
  const s = deckTop(table({ 0: ["aggression-2"] }), ...top);
  s.players[0].leader = "LEAD12";
  return choose(
    play(s, "aggression-2", "lead"),
    "declare",
    (c) => c.ambition === "tycoon",
  );
}
test("Noble's Connected: a drawn Populist Demands that declares a new ambition triggers it again", () => {
  let s = nobleDeclares("BC27", "BC24");
  assert.equal(s.pending[0].type, "vox", "Populist Demands was secured");
  s = choose(s, "populist", (c) => c.ambition === "warlord");
  assert.deepEqual(
    s.markers.map((m) => m.ambition),
    [null, "warlord", "tycoon"],
  );
  assert.deepEqual(s.players[0].cards, ["BC24"], "the next top card was drawn");
  assert.ok(s.courtDiscard.includes("BC27"));
  assert.equal(s.pending.length, 0);
  assertDeepInvariants(s);
});
test("Noble's Connected does not trigger again for an ambition that is already declared", () => {
  let s = nobleDeclares("BC27", "BC24");
  s = choose(s, "populist", (c) => c.ambition === "tycoon");
  assert.deepEqual(s.players[0].cards, []);
  assert.equal(s.courtDeck[0], "BC24", "the next card stays on the deck");
  assert.equal(s.pending.length, 0);
  assertDeepInvariants(s);
});
test("Noble's Connected: Farseers drawn by it does not see the declaration", () => {
  const s = nobleDeclares("BC17");
  assert.deepEqual(s.players[0].cards, ["BC17"]);
  assert.equal(s.pending.length, 0, "no look at a Rival's hand");
  assertDeepInvariants(s);
});
// Overseer's Ruthless: the hit is a free extra action, once per turn.
const overseer = (card = "administration-2") => {
  const s = table({ 0: [card] });
  s.players[0].leader = "LEAD10";
  return s;
};
test("Overseer's Ruthless on a tax: Outrage first, then the resource; the repeat costs no pip", () => {
  let s = overseer();
  const city = s.pieces.find((x) => x.owner === 0 && x.type === "city");
  city.damaged = true;
  s = play(s, "administration-2", "lead");
  const pips = s.turn.pips;
  s = act(s, "tax", "taxTarget", (c) => c.piece === city.id);
  assert.equal(s.pending[0].type, "ruthless");
  assert.deepEqual(s.players[0].resources, ["relic", "psionic", "relic"]);
  s = choose(s, "ruthless");
  // 4-arrow is a Relic planet: the destroyed city's Outrage discards both
  // Relics, then the repeated tax gains one.
  assert.ok(!s.pieces.some((x) => x.id === city.id));
  assert.deepEqual(s.players[0].outrage, ["relic"]);
  assert.deepEqual(s.players[0].resources.filter(Boolean).sort(), [
    "psionic",
    "relic",
  ]);
  assert.equal(s.turn.pips, pips - 1, "only the first tax cost a pip");
  assert.equal(s.pending.length, 0);
  assertDeepInvariants(s);
});
test("Overseer's Ruthless is once per turn: a ship built with it leaves no hit for a tax", () => {
  let s = overseer();
  const city = s.pieces.find((x) => x.owner === 0 && x.type === "city");
  resources(s, 0, ["material"]);
  s = play(s, "administration-2", "lead");
  // Prelude: spend Material to build a ship at the starport, and hit it.
  s = act(s, "build", "buildTarget", (c) => c.kind === "ship", 0);
  assert.equal(s.pending[0].type, "ruthless");
  s = choose(s, "ruthless");
  assert.ok(s.turn.used.includes("ruthless"));
  s = act(s, "tax", "taxTarget", (c) => c.piece === city.id);
  assert.equal(s.pending.length, 0, "no second Ruthless this turn");
  assertDeepInvariants(s);
});
test("Overseer may hit a building to tax or build even when the action yields nothing", () => {
  let s = overseer();
  const city = s.pieces.find((x) => x.owner === 0 && x.type === "city");
  // Rivals hold all five Relics, so the tax gains nothing.
  resources(s, 0, []);
  resources(s, 1, ["relic", "relic", "relic"]);
  resources(s, 2, ["relic", "relic"]);
  assert.equal(s.supply.relic, 0);
  s = play(s, "administration-2", "lead");
  s = act(s, "tax", "taxTarget", (c) => c.piece === city.id);
  assert.equal(s.pending[0].type, "ruthless");
  s = choose(s, "ruthless");
  assert.equal(s.pieces.find((x) => x.id === city.id).damaged, true);
  assert.ok(s.turn.used.includes("ruthless"));
  assertDeepInvariants(s);
});
// Cloud Cities: a city outside the slots, one total per planet, paid with one
// resource of the planet's type even when that type is Outraged.
function cloudTable() {
  const s = table({ 0: ["construction-2"] });
  giveCard(s, "L09", 0);
  place(s, 0, "ship", "4-hex");
  return s;
}
const cloudSites = (s) =>
  decision(s, 0)
    .choices.filter((c) => c.op === "cloudTarget")
    .map((c) => c.system);
test("Cloud Cities can be paid with an Outraged resource", () => {
  let s = cloudTable();
  s.players[0].outrage = ["material"];
  resources(s, 0, ["material"]);
  s = play(s, "construction-2", "lead");
  s = choose(s, "action", (c) => c.action === "build" && c.cost === "pip");
  assert.deepEqual(cloudSites(s), ["4-hex"]);
  s = choose(s, "cloudTarget");
  s = choose(s, "cloudPay");
  assert.ok(
    s.pieces.some((x) => x.owner === 0 && x.cloud && x.system === "4-hex"),
  );
  assert.deepEqual(s.players[0].resources.filter(Boolean), []);
  assert.deepEqual(s.players[0].outrage, ["material"]);
  assertDeepInvariants(s);
});
test("Cloud Cities: one extra city per planet in total, even after the card changes hands", () => {
  const offered = (cloudCity) => {
    const s = cloudTable();
    // 4-hex is a Material planet where player 0 has a ship.
    resources(s, 0, ["material"]);
    if (cloudCity) {
      const [id] = place(s, 1, "city", "4-hex");
      s.pieces.find((x) => x.id === id).cloud = true;
    }
    const t = choose(
      play(s, "construction-2", "lead"),
      "action",
      (c) => c.action === "build" && c.cost === "pip",
    );
    return cloudSites(t);
  };
  assert.deepEqual(offered(false), ["4-hex"]);
  assert.deepEqual(
    offered(true),
    [],
    "player 1's Cloud City already stands there",
  );
});
test("Cloud Cities must pay with a resource of the planet's type", () => {
  let s = cloudTable();
  resources(s, 0, ["fuel", "relic"]);
  s = choose(
    play(s, "construction-2", "lead"),
    "action",
    (c) => c.action === "build" && c.cost === "pip",
  );
  assert.ok(
    !cloudSites(s).includes("4-hex"),
    "no Material for a Material planet",
  );
  assert.deepEqual(
    cloudSites(s),
    ["4-arrow"],
    "but the Relic planet where it holds a Relic",
  );
});
test("Keeper's Trust counts the thief's Cartel supply as resources the thief has", () => {
  const stolen = (cartel) => {
    const s = giveCard(
      giveCard(table({ 0: ["administration-2"] }), "L21", 1),
      "BC20",
      0,
    );
    if (cartel) giveCard(s, "BC03", 0);
    s.markers[2].ambition = "keeper";
    resources(s, 0, []);
    resources(s, 1, ["material", "fuel"]);
    for (const p of [2, 3]) resources(s, p, []);
    const t = choose(
      play(s, "administration-2", "lead"),
      "guild",
      (c) => c.card === "BC20",
    );
    return decision(t, 0)
      .choices.filter((c) => c.op === "stealResource")
      .map((c) => t.players[c.defender].resources[c.index]);
  };
  assert.deepEqual(stolen(false), ["material", "fuel"]);
  assert.deepEqual(
    stolen(true),
    ["fuel"],
    "Material is the thief's through the Cartel",
  );
});
test("Raider Exosuits: one raid die against a system without buildings, none of the limit when the defender has no building anywhere", () => {
  const raidMax = (noBuildings, exosuits) => {
    let s = table({ 0: ["aggression-4"] });
    if (exosuits) giveCard(s, "L17", 0);
    if (noBuildings)
      s.pieces = s.pieces.filter((x) => x.owner !== 1 || x.type === "ship");
    place(s, 1, "ship", "4-arrow");
    s = play(s, "aggression-4", "lead");
    s = act(s, "battle", "battleTarget", (c) => c.system === "4-arrow");
    return decision(s, 0).form.raidMax;
  };
  assert.equal(raidMax(false, false), 0);
  assert.equal(raidMax(false, true), 1, "buildings elsewhere: limit of one");
  assert.ok(raidMax(true, false) > 1);
  assert.equal(
    raidMax(true, true),
    raidMax(true, false),
    "no buildings anywhere: no limit",
  );
});
test("Predictive Sensors reinforce only from adjacent systems, and the move is never a Catapult", () => {
  let s = giveCard(battleTable(), "L15", 1);
  place(s, 1, "ship", "1-arrow", 2);
  place(s, 1, "starport", "1-arrow");
  s = act(s, "battle", "battleTarget", (c) => c.system === "1-gate");
  const options = decision(s, 1).form.options;
  // Adjacent systems only: not the ships at 5-hex, where a starport stands.
  assert.deepEqual([...new Set(options.map((o) => o.system))].sort(), [
    "1-arrow",
    "6-gate",
  ]);
  s = form(
    s,
    options.map((o) => o.id),
  );
  assert.equal(
    s.pieces.filter((x) => x.owner === 1 && x.system === "1-gate").length,
    5,
    "the battle's one ship, two from 1-arrow and two from 6-gate",
  );
  assert.ok(!s.pending.some((t) => t.type === "catapult"));
  assert.equal(s.pending[0].type, "dice");
  assertDeepInvariants(s);
});
test("Tycoon's Ambition works with no Material or Fuel, and leaves a Cartel's supply alone", () => {
  let s = giveCard(own(table({ 0: ["construction-2"] }), "L27"), "BC03", 0);
  resources(s, 0, []);
  s.markers[2].ambition = "tycoon";
  const supply = structuredClone(s.supply);
  s = choose(
    play(s, "construction-2", "lead"),
    "guild",
    (c) => c.card === "L27",
  );
  s = choose(s, "tycoonDeclare", (c) => c.ambition === "keeper");
  assert.equal(s.markers[1].ambition, "keeper");
  assert.equal(s.lead.rank, 2, "no zero marker");
  assert.deepEqual(s.supply, supply);
  assertDeepInvariants(s);
});
test("Corsair rerolls only once", () => {
  let s = resources(diceState(), 0, ["fuel", "relic"]);
  s.players[0].leader = "LEAD11";
  s.pending[0] = {
    ...s.pending[0],
    type: "reroll",
    dice: [{ type: "raid", faces: [] }],
    used: [],
    freshAttack: 3,
  };
  s.lastBattle = { attacker: 0, defender: 1, system: "1-arrow", dice: [] };
  const corsair = (s) =>
    decision(s, 0).choices.some((c) => c.ability === "Corsair");
  assert.ok(corsair(s));
  s = form(
    choose(s, "reroll", (c) => c.ability === "Corsair"),
    ["0"],
  );
  assert.ok(!corsair(s), "spent for this battle");
  assertDeepInvariants(s);
});
test("Warrior's Tactical move can be a Catapult move, with a different ship fighting the battle", () => {
  let s = beforeBonus("LEAD06", "aggression", "battle");
  // Player 1 controls 5-gate, so the Catapult from the 5-hex starport enters it
  // and may go on.
  place(s, 1, "ship", "5-gate", 3);
  s = choose(s, "action", (c) => c.action === "battle" && c.cost === "pip");
  const pips = s.turn.pips;
  s = choose(s, "bonusBefore");
  const origin = s;
  s = choose(s, "moveFrom", (c) => c.system === "5-hex");
  assertRewinds(origin, s);
  s = form(
    s,
    decision(s, 1).form.options.map((o) => o.id),
  );
  s = choose(s, "moveTo", (c) => c.system === "5-gate");
  assert.deepEqual(
    s.pending.map((t) => t.type),
    ["catapult", "action"],
    "the Catapult goes on, the battle is still owed",
  );
  s = choose(s, "continue", (c) => c.system === "6-gate");
  s = form(
    s,
    decision(s, 1).form.options.map((o) => o.id),
  );
  s = choose(s, "skip");
  assert.equal(
    s.pieces.filter((x) => x.owner === 1 && x.system === "6-gate").length,
    5,
  );
  assert.equal(s.turn.pips, pips, "the move was free");
  // The battle is fought by the ship already at 1-arrow, not the moved ones.
  s = choose(s, "battleTarget", (c) => c.system === "1-arrow");
  assert.equal(s.pending[0].type, "dice");
  assert.equal(s.pending[0].attackers.length, 1);
  assert.equal(s.turn.pips, pips - 1);
  assertDeepInvariants(s);
});
test("Lattice Spies is listed once: under Before actions when it can seize, as a plain Prelude discard otherwise", () => {
  const listed = (s) =>
    decision(s, s.current).choices.filter(
      (c) => c.op === "guild" && c.card === "BC16",
    );
  let s = giveCard(
    table({ 0: ["construction-2"], 1: ["construction-3"] }),
    "BC16",
    1,
  );
  s = play(
    endTurn(play(s, "construction-2", "lead")),
    "construction-3",
    "copy",
  );
  assert.deepEqual(
    listed(s).map((c) => c.group),
    ["Before actions"],
  );
  // The initiative holder cannot seize, but may still discard it.
  let t = giveCard(table({ 0: ["construction-2"] }), "BC16", 0);
  t = play(t, "construction-2", "lead");
  assert.deepEqual(
    listed(t).map((c) => c.group),
    ["Prelude · abilities"],
  );
});
