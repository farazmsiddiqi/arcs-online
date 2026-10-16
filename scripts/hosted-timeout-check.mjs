import assert from "node:assert/strict";
const base = process.env.TEST_URL;
if (!base) throw new Error("Set TEST_URL to the release being verified.");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const request = async (path, key, body) => {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`${r.status}: ${data.error}`);
  return data;
};
const created = await request("/api/rooms", null, {
  name: "Release timer check",
  players: 2,
});
const root = `/api/rooms/${created.id}`;
const guest = await request(root + "/join", null, {
  name: "Next-player clock check",
  invite: created.invite,
});
const keys = [created.key, guest.key];
let state = await request(root + "/start", created.key, {});
try {
  for (let i = 0; i < 8; i++) {
    const p = state.game.decision.actor,
      view = await request(root, keys[p]);
    if (view.game.decision.choices.some((c) => c.op === "play")) {
      state = view;
      break;
    }
    const skip = view.game.decision.choices.find((c) => c.op === "skip");
    assert.ok(skip);
    state = await request(root + "/action", keys[p], {
      revision: view.game.revision,
      choice: skip.id,
    });
  }
  state = await request(root + "/timer", created.key, {
    revision: state.game.revision,
    operation: "configure",
    config: { mode: "live", turn: 60, expiry: "auto" },
  });
  const turn = state.clock.key;
  const deadline = Date.now() + 110000;
  // Deliberately no browser or socket connection and no action requests.
  while (state.clock.key === turn && Date.now() < deadline) {
    await delay(1500);
    state = await request(root, created.key);
  }
  assert.notEqual(
    state.clock.key,
    turn,
    "expired turn must complete automatically",
  );
  assert.ok(state.game.log.some((e) => e.automatic));
  assert.ok(state.notices.some((n) => n.text.includes("timer expired")));
  assert.ok(
    state.clock.remainingMs > 45000,
    "next actor receives a fresh allowance",
  );
  assert.equal(typeof state.game.players[1].hand, "number");
  console.log(
    JSON.stringify({
      hostedTimeout: true,
      room: created.id,
      noBrowserRequired: true,
      automaticLog: true,
      nextPlayerFullClock: true,
      privateHands: true,
    }),
  );
} finally {
  // Leave the dedicated verification table untimed rather than running forever.
  const latest = await request(root, created.key);
  await request(root + "/timer", created.key, {
    revision: latest.game.revision,
    operation: "configure",
    config: { mode: "off", expiry: "auto" },
  });
}
