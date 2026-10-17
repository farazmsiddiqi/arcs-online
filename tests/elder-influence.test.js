import test from "node:test";
import assert from "node:assert/strict";
import { createGame, decision, transition, viewFor } from "../game/engine.js";
import {
  applyDecision,
  travelHistory,
  historyView,
} from "../server/history.js";
import { autoInput } from "../game/autoplay.js";
import { timeoutInput } from "../game/timeout-policy.js";
import { courtActions } from "../src/courtActions.js";

function battleRoom() {
  let game = createGame(["Attacker", "Elder"], { initiative: 0 }, 37);
  while (game.pending.length) {
    const p = game.pending[0].p;
    game = transition(game, p, {
      choice: decision(game, p).choices.find((c) => c.op === "skip").id,
    });
  }
  const room = { game };
  applyDecision(room, 0, {
    choice: decision(room.game, 0).choices.find((c) => c.op === "play").id,
  });
  applyDecision(room, 0, {
    choice: decision(room.game, 0).choices.find((c) => c.op === "endPrelude")
      .id,
  });
  game = room.game;
  game.players[1].leader = "LEAD01";
  const ship = game.pieces.find((p) => p.type === "ship" && p.owner === 1);
  ship.damaged = true;
  game.pending = [
    {
      type: "hits",
      p: 0,
      system: ship.system,
      target: 1,
      dealer: 0,
      left: 1,
      kind: "ship",
      battle: true,
    },
    {
      type: "battleEnd",
      p: 0,
      defender: 1,
      system: ship.system,
      beforeTrophies: game.players[0].trophies.length,
    },
  ];
  const hit = decision(game, 0).choices.find(
    (c) => c.op === "hit" && c.piece === ship.id,
  );
  applyDecision(room, 0, { choice: hit.id });
  assert.equal(room.game.pending[0].reason, "Elder · Beloved");
  return { room, ship: ship.id };
}
function influence(room, index = 0) {
  applyDecision(room, 1, {
    choice: decision(room.game, 1).choices.find(
      (c) => c.op === "influenceTarget" && c.index === index,
    ).id,
  });
}
const publicCounts = (s) => ({
  pips: s.turn.pips,
  court: s.court.map((c) => c.agents),
  trophies: s.players[0].trophies,
});

test("Elder retains control after Beloved and can undo/redo without undoing the battle", () => {
  const { room, ship } = battleRoom();
  const before = structuredClone(room.game);
  assert.equal(
    historyView(room, 1).canUndo,
    false,
    "battle is already committed",
  );
  influence(room);
  assert.equal(room.game.pending[0].type, "influenceReview");
  assert.equal(decision(room.game, 1).actor, 1);
  assert.equal(historyView(room, 1).canUndo, true);
  assert.equal(historyView(room, 0).canUndo, false);
  assert.equal(room.game.court[0].agents[1], before.court[0].agents[1] + 1);
  assert.equal(
    room.game.turn.pips,
    before.turn.pips,
    "bonus spends no attacker pips",
  );
  const placed = structuredClone(room.game);
  travelHistory(room, 1, "undo");
  assert.deepEqual(publicCounts(room.game), publicCounts(before));
  assert.equal(room.game.pending[0].reason, "Elder · Beloved");
  assert.equal(
    room.game.pieces.some((p) => p.id === ship),
    false,
    "destroyed ship remains destroyed",
  );
  assert.equal(historyView(room, 1).canUndo, false, "cannot rewind the battle");
  travelHistory(room, 1, "redo");
  assert.deepEqual(publicCounts(room.game), publicCounts(placed));
  assert.equal(room.game.pending[0].type, "influenceReview");
});

test("Elder may change the target; confirmation commits and resumes the interrupted turn", () => {
  const { room } = battleRoom();
  const agents = room.game.court.map((c) => c.agents[1]);
  influence(room);
  travelHistory(room, 1, "undo");
  influence(room, 1);
  assert.equal(room.game.court[0].agents[1], agents[0]);
  assert.equal(room.game.court[1].agents[1], agents[1] + 1);
  assert.equal(historyView(room, 1).canRedo, false);
  const choice = decision(room.game, 1).choices[0];
  assert.equal(choice.op, "confirmInfluence");
  assert.throws(() => applyDecision(room, 0, { choice: choice.id }));
  applyDecision(room, 1, { choice: choice.id });
  assert.equal(room.game.pending[0]?.type, undefined);
  assert.equal(decision(room.game, 0).actor, 0);
  assert.equal(historyView(room, 1).canUndo, false);
  assert.throws(() => travelHistory(room, 1, "undo"));
});

test("reaction review survives persistence and can be completed by bot or timeout", () => {
  const { room } = battleRoom();
  influence(room);
  const restored = JSON.parse(JSON.stringify(room));
  assert.equal(historyView(restored, 1).canUndo, true);
  const auto = autoInput(restored.game, () => 0);
  assert.equal(
    decision(restored.game, 1).choices[auto.choice].op,
    "confirmInfluence",
  );
  const timed = timeoutInput(restored.game);
  assert.equal(
    decision(restored.game, 1).choices[timed.choice].op,
    "confirmInfluence",
  );
  applyDecision(restored, 1, timed);
  assert.equal(decision(restored.game, 0).actor, 0);
});

test("Court action buttons belong only to the deciding player and keep inspection separate", () => {
  const { room } = battleRoom();
  const own = viewFor(room.game, 1),
    rival = viewFor(room.game, 0),
    card = room.game.court[0].id;
  assert.equal(courtActions(own, card)[0].actionLabel, "Influence");
  assert.deepEqual(courtActions(rival, card), []);
  influence(room);
  assert.equal(
    courtActions(viewFor(room.game, 1), card)[0].actionLabel,
    "Confirm",
  );
  assert.deepEqual(courtActions(viewFor(room.game, 0), card), []);
});
