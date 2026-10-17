import test from "node:test";
import assert from "node:assert/strict";
import { createGame, decision, transition, viewFor } from "../game/engine.js";
import { exploreInput } from "../game/autoplay.js";
import { CONFIRM_OPS, confirmFor } from "../src/confirmStep.js";
import { CARDS } from "../game/data.js";

// C-6: which choices get a confirm step, and what it says.
const vox = Object.values(CARDS).find((c) => c.kind === "vox"),
  guild = Object.values(CARDS).find((c) => c.kind === "guild");
const table = (over = {}) => ({
  courtDeckCount: 5,
  players: [
    { name: "A", leader: null, cards: [] },
    { name: "B", leader: null, cards: [] },
  ],
  ...over,
});

test("pass, face-up plays, secure and battle get a confirm; Copy plays, End turn and the rest do not", () => {
  assert.ok(confirmFor({ op: "pass", label: "Pass initiative" }, table()));
  for (const mode of ["lead", "pivot", "surpass"])
    assert.ok(
      confirmFor({ op: "play", mode, label: "Lead Aggression 4" }, table()),
      mode,
    );
  assert.equal(
    confirmFor({ op: "play", mode: "copy", label: "Copy" }, table()),
    null,
  );
  assert.ok(confirmFor({ op: "secureTarget", card: guild.id }, table()));
  assert.ok(
    confirmFor({ op: "battleTarget", defender: 1, label: "Battle B" }, table()),
  );
  assert.match(
    confirmFor({ op: "ransack", card: guild.id }, table()).title,
    /^Ransack /,
  );
  for (const op of [
    "endTurn",
    "action",
    "moveTo",
    "influenceTarget",
    "bold",
    "skip",
    "cancel",
  ])
    assert.equal(confirmFor({ op }, table()), null, op);
  assert.equal(confirmFor(undefined, table()), null);
});

test("wording follows the rules: Vox resolves first, an empty Court deck does not refill, a defender's response cards are named", () => {
  const secure = (card, game) =>
    confirmFor({ op: "secureTarget", card }, game).body;
  assert.match(secure(vox.id, table()), /Vox effect resolves now/);
  assert.match(secure(guild.id, table()), /capture the rival agents/);
  assert.match(secure(guild.id, table()), /Court then refills/);
  assert.match(
    secure(guild.id, table({ courtDeckCount: 0 })),
    /nothing refills/,
  );
  const battle = (cards, leader = null) =>
    confirmFor(
      { op: "battleTarget", defender: 1, label: "Battle B · 1 ☾" },
      table({
        players: [
          { name: "A", leader: null, cards: [] },
          { name: "B", leader, cards },
        ],
      }),
    );
  assert.doesNotMatch(battle([]).body, /respond first/);
  assert.match(battle(["L15"]).body, /B holds Predictive Sensors and may/);
  assert.match(
    battle(["L12"], null).body,
    /B holds Railgun Arrays and may respond first/,
  );
  assert.match(
    battle(["L15", "L12"]).body,
    /Predictive Sensors and Railgun Arrays/,
  );
  assert.equal(battle([]).title, "Battle B · 1 ☾?");
});

test("on real views from played games: every pass, face-up play, secure and battle is confirmed, nothing else, and it never throws", () => {
  const seen = {};
  for (let seed = 1; seed <= 12; seed++) {
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
    for (let steps = 0; s.phase !== "over" && steps < 4000; steps++) {
      const p = s.pending[0]?.p ?? s.current,
        view = viewFor(s, p);
      for (const c of decision(s, p).choices ?? []) {
        const step = confirmFor(c, view),
          expected =
            CONFIRM_OPS.includes(c.op) &&
            !(c.op === "play" && c.mode === "copy");
        assert.equal(!!step, expected, `${c.op} ${c.mode ?? ""}`);
        if (step) {
          const key = c.op === "play" ? `play:${c.mode}` : c.op;
          seen[key] = (seen[key] ?? 0) + 1;
          assert.ok(step.title && step.body && step.confirm);
          // Nothing in the wording may depend on a hidden card.
          assert.ok(!/undefined|null|NaN/.test(step.title + step.body), key);
        }
      }
      s = transition(s, p, exploreInput(s, random));
    }
  }
  for (const key of [
    "pass",
    "play:lead",
    "play:pivot",
    "play:surpass",
    "secureTarget",
    "battleTarget",
  ])
    assert.ok(seen[key] > 0, `no ${key} reached in the sample games`);
});

test("every shared draft pick confirms the exact card and handoff, including the final double-Lore pick", () => {
  for (const doubleLore of [false, true]) {
    let state = createGame(
      ["Ada", "Bo", "Cy"],
      { leaders: true, doubleLore },
      23,
    );
    let picks = 0;
    while (state.phase === "draft") {
      const actor = state.current,
        view = viewFor(state, actor),
        choice = decision(state, actor).choices[0];
      const before = structuredClone(state),
        review = confirmFor(choice, view);
      assert.equal(review.card, choice.card);
      assert.match(review.title, new RegExp(CARDS[choice.card].name));
      assert.deepEqual(state, before); // Preparing or cancelling a review never commits a pick.
      const after = transition(state, actor, { choice: choice.id });
      if (after.phase === "draft") {
        assert.ok(
          review.body.includes(
            `${after.players[after.current].name} picks next`,
          ),
        );
        assert.equal(review.confirm, "Confirm pick & pass");
      } else {
        assert.match(review.body, /finishes the shared draft/);
        assert.equal(review.confirm, "Confirm & finish draft");
      }
      state = after;
      picks++;
    }
    assert.equal(picks, 3 * (doubleLore ? 3 : 2));
  }
});
