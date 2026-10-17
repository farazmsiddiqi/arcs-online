import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createGame, viewFor } from "../game/engine.js";
import { chatReferences, referenceOnly } from "../server/chat-references.js";
import { createChatService } from "../server/chat.js";
import { STATE_MENTIONS } from "../game/chat-mentions.js";
const room = {
  status: "playing",
  options: { leaders: true },
  seats: [{ name: "Ada" }, { name: "Bo" }],
  game: createGame(["Ada", "Bo"], { leaders: true }, 71),
};
for (const [id] of STATE_MENTIONS)
  test(`@${id} returns deterministic public game facts`, () => {
    const a = chatReferences(room, 0, `@${id}`),
      b = chatReferences(room, 1, `@${id}`);
    assert.deepEqual(a, b);
    assert.equal(a.length, 1);
    assert.ok(a[0].rows.length);
    assert.equal(a[0].snapshot.revision, room.game.revision);
    assert.ok(!JSON.stringify(a).includes("undefined"));
  });
test("player reference exposes hand count and public supply, never private card identities", () => {
  const result = chatReferences(room, 0, "@Bo");
  const rows = result[0].rows;
  assert.equal(
    rows.find((r) => r.label === "Hand").value,
    `${room.game.players[1].hand.length} face-down cards`,
  );
  assert.ok(rows.find((r) => r.label === "Supply"));
  for (const id of room.game.players[1].hand)
    assert.ok(!JSON.stringify(result).includes(id));
});
test("bare references never invoke the model, even privately or inside an Arcy thread", async () => {
  const db = new DatabaseSync(":memory:");
  let calls = 0;
  const s = createChatService(db, {
    load: () => ({ room }),
    broadcast: () => {},
    enabled: () => true,
    generate: async () => {
      calls++;
      return {
        status: "ruling",
        paragraphs: [],
        assumptions: [],
        followUp: "",
      };
    },
  });
  const result = s.send("room", 0, {
    text: "@turn @scores",
    clientId: "deterministic-public",
  });
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].references.length, 2);
  const priv = s.send("room", 1, {
    text: "@board",
    clientId: "deterministic-private",
    private: true,
  });
  assert.equal(priv.messages.at(-1).references[0].id, "board");
  s.send("room", 0, {
    text: "@arcy explain repair",
    clientId: "arcy-thread-start",
  });
  await s.idle();
  assert.equal(calls, 1);
  const root = s
    .view("room")
    .messages.find((m) => m.text === "@arcy explain repair").id;
  s.send("room", 0, {
    text: "@turn",
    clientId: "deterministic-followup",
    replyTo: root,
  });
  await s.idle();
  assert.equal(calls, 1);
  assert.ok(
    s.view("room", undefined, root, 0).messages.at(-1).references.length,
  );
  db.close();
});
test("references are bounded and exact, not email addresses or partial player names", () => {
  assert.equal(referenceOnly("@turn @Ada!", room.seats), true);
  assert.equal(referenceOnly("Explain @turn", room.seats), false);
  assert.deepEqual(chatReferences(room, 0, "person@turn.com @AdaLong"), []);
  assert.equal(chatReferences(room, 0, "@turn @turn").length, 1);
  const lobby = { seats: room.seats };
  assert.equal(
    chatReferences(lobby, 0, "@turn")[0].rows[0].value,
    "Waiting in the lobby",
  );
});
