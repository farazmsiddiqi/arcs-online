import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createGame, transition } from "../game/engine.js";
import { exploreInput } from "../game/autoplay.js";
import { createReplayStore, replayProjection } from "../server/replay.js";
import { replayPresentation, turnDestination } from "../src/replayModel.js";
import { actionChanges, isForwardUpdate } from "../src/actionAnimations.js";
import { actionSound } from "../src/gameAudio.js";
const fixture = () => createGame(["A", "B"], { initiative: 0 }, 91);
test("replay archive persists only public information and returns immutable copies", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const store = createReplayStore(db),
      game = fixture();
    game.played.push({
      player: 1,
      faceup: false,
      card: game.players[1].hand[0],
    });
    store.record("table", game);
    const frame = store.frame("table", 0);
    assert.ok(frame.players.every((p) => typeof p.hand === "number"));
    assert.equal(frame.played.at(-1).card, null);
    for (const key of [
      "rng",
      "pending",
      "courtDeck",
      "deck",
      "decision",
      "interaction",
      "resourceArrangement",
      "me",
    ])
      assert.equal(frame[key], undefined, key);
    frame.players[0].power = 100;
    assert.equal(store.frame("table", 0).players[0].power, 0);
    assert.equal(store.frame("other", 0), null);
    assert.equal(store.frame("table", 9999), null);
    store.record("table", game);
    assert.equal(store.summary("table").count, 1);
    const same = structuredClone(game);
    same.revision++;
    store.record("table", same, game);
    assert.equal(
      store.summary("table").count,
      1,
      "ignore invisible revision-only saves",
    );
  } finally {
    db.close();
  }
});
test("archive reproduces legal transitions, grouping turns, without mutating games", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const store = createReplayStore(db);
    let game = fixture();
    store.record("table", game);
    for (let step = 0; step < 100; step++) {
      const before = game;
      const input = exploreInput(game, () => ((step * 37) % 99) / 100);
      game = transition(game, game.pending[0]?.p ?? game.current, input);
      const unchanged = structuredClone(game);
      store.record("table", game, before);
      assert.deepEqual(game, unchanged);
      const frame = store.frame("table", game.revision);
      if (frame)
        assert.deepEqual(
          frame,
          JSON.parse(JSON.stringify(replayProjection(game))),
        );
    }
    const frames = store.summary("table").frames;
    assert.ok(frames.length > 10);
    assert.ok(frames.at(-1).turn > 0);
    const reopened = createReplayStore(db);
    assert.deepEqual(reopened.summary("table"), store.summary("table"));
    assert.deepEqual(
      store.summary("table", frames[2].revision).frames,
      frames.slice(3),
    );
  } finally {
    db.close();
  }
});
test("replay cursors paginate, and real undo appends instead of overwriting history", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const store = createReplayStore(db),
      game = fixture();
    for (let n = 0; n < 505; n++) {
      game.revision = n;
      game.players[0].power = n % 10;
      store.record("x", game);
    }
    const page = store.summary("x");
    assert.equal(page.frames.length, 500);
    assert.equal(page.nextAfter, 499);
    assert.equal(store.summary("x", page.nextAfter).frames.length, 5);
    const undo = fixture();
    undo.revision = 505;
    undo.log.push({ id: 1, text: "A undid a decision", history: true });
    store.record("x", undo, game);
    assert.equal(store.frame("x", 504).players[0].power, 4);
    assert.equal(store.frame("x", 505).players[0].power, 0);
  } finally {
    db.close();
  }
});
test("personal replay is read-only and reverse steps reverse physical changes", () => {
  const position = replayProjection(fixture());
  const first = replayPresentation(position, 0, {
    sequence: 1,
    direction: 1,
    animate: false,
  });
  assert.equal(first.decision.actor, null);
  assert.deepEqual(first.decision.choices, []);
  const moved = structuredClone(position);
  moved.revision++;
  moved.pieces[0].system = "6-gate";
  const forward = replayPresentation(moved, 0, {
    sequence: 2,
    direction: 1,
    animate: true,
  });
  const reverse = replayPresentation(position, 0, {
    sequence: 3,
    direction: -1,
    animate: true,
  });
  assert.equal(isForwardUpdate(first, forward), true);
  assert.equal(isForwardUpdate(forward, reverse), true);
  const out = actionChanges(first, forward).find((c) => c.kind === "move");
  const back = actionChanges(forward, reverse).find((c) => c.kind === "move");
  assert.equal(out.from, back.system);
  assert.equal(out.system, back.from);
  assert.equal(
    isForwardUpdate(
      first,
      replayPresentation(moved, 0, { sequence: 4, animate: false }),
    ),
    false,
  );
  assert.equal(position._replay, undefined);
});
test("turn navigation stays inside the archive", () => {
  const frames = [0, 0, 1, 1, 1, 2].map((turn) => ({ turn }));
  assert.equal(turnDestination(frames, 0, -1), 0);
  assert.equal(turnDestination(frames, 1, 1), 2);
  assert.equal(turnDestination(frames, 4, -1), 1);
  assert.equal(turnDestination(frames, 5, 1), 5);
});
test("sound cues distinguish physical actions and prioritize combat over bookkeeping", () => {
  for (const kind of ["move", "build", "repair", "tax"])
    assert.equal(actionSound([{ kind }]), kind);
  assert.equal(
    actionSound([{ kind: "resource" }, { kind: "damage" }]),
    "battle",
  );
  assert.equal(
    actionSound([{ kind: "resource" }], [{ effect: { type: "destroy" } }]),
    "destroy",
  );
  assert.equal(actionSound([{ kind: "play" }, { kind: "turn" }]), "card");
  assert.equal(actionSound([]), null);
});

test("keyboard shortcuts never hijack typing, browser shortcuts, IME, or repeat keys", async () => {
  const { shortcutFor } = await import("../src/keyboardShortcuts.js");
  assert.equal(shortcutFor({ key: "c" }), "chat");
  assert.equal(shortcutFor({ key: "?" }), "help");
  assert.equal(
    shortcutFor({ key: "ArrowLeft" }, { replay: true }),
    "replay-back",
  );
  assert.equal(shortcutFor({ key: "ArrowLeft" }), null);
  for (const flag of [
    "ctrlKey",
    "metaKey",
    "altKey",
    "isComposing",
    "repeat",
    "defaultPrevented",
  ])
    assert.equal(shortcutFor({ key: "c", [flag]: true }), null);
  assert.equal(
    shortcutFor({ key: "c", target: { closest: () => true } }),
    null,
  );
  assert.equal(
    shortcutFor({ key: "c", target: { isContentEditable: true } }),
    null,
  );
  assert.equal(
    shortcutFor(
      {
        key: " ",
        target: { closest: (selector) => selector.includes("button") },
      },
      { replay: true },
    ),
    null,
  );
});
