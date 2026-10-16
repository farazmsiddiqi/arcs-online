import assert from "node:assert/strict";
import { assertInvariants } from "../game/engine.js";
import { CARDS, ACTION_CARDS, AMBITIONS, RESOURCES } from "../game/data.js";

// Test-only conservation checks layered on the engine's own assertInvariants.
// Kept out of the engine so a false positive fails a test, never a live game.
const COURT = Object.keys(CARDS).filter((id) => /^BC\d/.test(id));
const MARKERS = [
  { up: [2, 0], down: [4, 2] },
  { up: [3, 2], down: [6, 3] },
  { up: [5, 3], down: [9, 4] },
];
const PIECES = ["ship", "city", "starport", "agent"];
const deckFor = (n) =>
  Object.values(ACTION_CARDS)
    .filter((c) => n === 4 || (c.rank !== 1 && c.rank !== 7))
    .map((c) => c.id)
    .sort();
const validPlayer = (s, p) =>
  Number.isInteger(p) && p >= 0 && p < s.players.length;

export function assertDeepInvariants(s) {
  assertInvariants(s);
  const n = s.players.length;

  // Actors.
  if (s.phase !== "over") {
    assert.ok(
      validPlayer(s, s.current),
      `Invalid current player ${s.current}.`,
    );
    for (const t of s.pending)
      assert.ok(validPlayer(s, t.p), `Pending ${t.type} has actor ${t.p}.`);
  }
  assert.ok(validPlayer(s, s.initiative), "Invalid initiative holder.");

  // Turn and Prelude state.
  if (s.phase === "turn") {
    assert.ok(s.turn, "Turn phase without a turn.");
    assert.ok(
      Number.isInteger(s.turn.pips) && s.turn.pips >= 0,
      `Turn pips are ${s.turn.pips}.`,
    );
  } else assert.equal(s.turn, null, `Turn left open in ${s.phase} phase.`);
  if (!s.turn?.prelude)
    assert.deepEqual(s.held, [], "Resources held outside Prelude.");

  // Power. The rulebook names no track maximum, so only the floor is checked.
  for (const p of s.players)
    assert.ok(
      Number.isInteger(p.power) && p.power >= 0,
      `${p.name} has Power ${p.power}.`,
    );

  // Agents: physical agents never exceed 10. Outrage may use placeholder
  // pieces when no agent is in supply (rulebook, Outrage and Piece Limits),
  // so it is checked separately rather than added to the total.
  const captured = s.players.flatMap((h) => [
    ...h.captives.map((x) => ({ ...x, holder: h.id, kind: "captive" })),
    ...h.trophies.map((x) => ({ ...x, holder: h.id, kind: "trophy" })),
  ]);
  for (const p of s.players) {
    const physical =
      s.pieces.filter((x) => x.owner === p.id && x.type === "agent").length +
      s.court.reduce((t, c) => t + (c.agents[p.id] ?? 0), 0) +
      captured.filter((x) => x.owner === p.id && x.type === "agent").length +
      (p.scrap.agent ?? 0);
    assert.ok(physical <= 10, `${p.name} has ${physical} agents in play.`);
    assert.ok(
      new Set(p.outrage).size === p.outrage.length &&
        p.outrage.every((r) => RESOURCES.includes(r)),
      `${p.name} has invalid Outrage ${JSON.stringify(p.outrage)}.`,
    );
  }
  for (const c of s.court)
    assert.ok(
      c.agents.length === n &&
        c.agents.every((a) => Number.isInteger(a) && a >= 0),
      `Court lane ${c.id} has agents ${JSON.stringify(c.agents)}.`,
    );

  // Captives and trophies.
  for (const x of captured) {
    assert.ok(validPlayer(s, x.owner), `A ${x.kind} has owner ${x.owner}.`);
    assert.notEqual(x.owner, x.holder, `A player holds their own ${x.kind}.`);
    assert.ok(
      x.kind === "captive" ? x.type === "agent" : PIECES.includes(x.type),
      `A ${x.kind} has type ${x.type}.`,
    );
  }
  const ids = [...s.pieces, ...captured].map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, "A piece id is reused.");

  // Ambition markers: three fixed markers; after each chapter the lowest
  // unflipped one flips (rulebook, Clean Up & Flip Ambition).
  assert.deepEqual(
    s.markers.map((m) => m.id),
    [0, 1, 2],
    "Ambition markers are missing or reordered.",
  );
  const flips = Math.min(3, s.phase === "over" ? s.chapter : s.chapter - 1);
  s.markers.forEach((m, i) => {
    assert.equal(
      m.flipped,
      i < flips,
      `Marker ${i} flip state in chapter ${s.chapter}.`,
    );
    assert.deepEqual(
      [m.high, m.low],
      MARKERS[i][m.flipped ? "down" : "up"],
      `Marker ${i} values.`,
    );
    assert.ok(
      m.ambition === null || AMBITIONS.includes(m.ambition),
      `Marker ${i} ambition ${m.ambition}.`,
    );
  });

  // Court cards: every base Court card is in exactly one place.
  const court = [
    ...s.court.map((c) => c.id).filter(Boolean),
    ...s.courtDeck,
    ...s.courtDiscard,
    ...s.players.flatMap((p) => p.cards),
    ...s.unions.map((u) => u.card),
  ]
    .filter((id) => /^BC\d/.test(id))
    .sort();
  assert.deepEqual(court, [...COURT].sort(), "Court cards are not conserved.");

  // Action cards: hands, played cards and both discard piles hold the whole
  // deck. No hand-size cap: the rulebook has none, and Unions or Call to
  // Action can legitimately take a hand above six.
  if (s.phase !== "draft" && s.phase !== "setup")
    assert.deepEqual(
      [
        ...s.players.flatMap((p) => p.hand),
        ...s.played.map((x) => x.card),
        ...s.discardUp.map((x) => x.card),
        ...s.discardDown,
      ].sort(),
      deckFor(n),
      "Action cards are not conserved.",
    );
  // Only cards played face up reach the face-up pile, in round order.
  s.discardUp.forEach((x, i) => {
    assert.ok(
      ["lead", "surpass", "pivot"].includes(x.mode),
      `Face-up discard ${x.card} was played as ${x.mode}.`,
    );
    assert.ok(
      validPlayer(s, x.player) && x.round >= (s.discardUp[i - 1]?.round ?? 1),
      `Face-up discard ${x.card} has a bad player or round.`,
    );
  });
  return true;
}

// Item 16: anything the server's undo history treats as new information
// (server/history.js historyBoundary) must also mark the turn revealed, which
// closes lenient declare and seize timing. Checked across one transition, so
// a reveal path the engine forgets to mark fails a simulation.
export function assertRevealTracked(before, after) {
  if (!before.turn || !after.turn || before.current !== after.current) return;
  const why = [];
  if (before.rng !== after.rng) why.push("dice or a shuffle");
  if (before.courtDeck.some((id) => !after.courtDeck.includes(id)))
    why.push("a Court deck draw");
  if (before.discardDown.some((id) => !after.discardDown.includes(id)))
    why.push("an action discard draw");
  if (
    after.players.some((p, i) =>
      p.hand.some((c) => !before.players[i].hand.includes(c)),
    )
  )
    why.push("a card entering a hand");
  if (after.pending.some((t) => /^farseers(Swap|Give)$/.test(t.type)))
    why.push("a rival hand seen");
  if ((after.pending[0]?.p ?? after.current) !== after.current)
    why.push("another player's decision");
  if (why.length)
    assert.ok(
      after.turn.revealed,
      `Turn not marked revealed after ${why.join(", ")}.`,
    );
  // The other direction: nothing marks a reveal without one. Railgun Arrays
  // is the one reveal with no trace in the state diff (it fires before dice).
  else if (!before.turn.revealed && after.turn.revealed)
    assert.ok(
      after.turn.revealed === "rival" &&
        after.pending.some(
          (t) =>
            t.type === "dice" &&
            after.players[t.defender].cards.includes("L12"),
        ),
      `Turn marked revealed (${after.turn.revealed}) with nothing revealed.`,
    );
}
