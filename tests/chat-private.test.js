import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createChatService } from "../server/chat.js";
import { createGame } from "../game/engine.js";
const setup = () => {
  const db = new DatabaseSync(":memory:");
  const room = {
    status: "playing",
    seats: [{ name: "Host" }, { name: "Guest" }],
    game: createGame(["Host", "Guest"], {}, 71),
  };
  const service = createChatService(db, {
    load: () => ({ room }),
    broadcast: () => {},
    enabled: () => false,
  });
  return { db, service, room };
};
test("private questions and replies are isolated from every other seat, including host, and remain private through threads", () => {
  const { db, service: s } = setup();
  const result = s.send("room", 1, {
    text: "Can I repair here? @Host",
    clientId: "private-question-01",
    private: true,
  });
  assert.equal(result.messages.length, 2);
  assert.ok(result.messages.every((m) => m.private));
  const [root, reply] = result.messages;
  for (const seat of [0, 2, null]) {
    assert.deepEqual(s.view("room", undefined, null, seat).messages, []);
    assert.deepEqual(s.view("room", undefined, null, seat).threadCounts, {});
    assert.throws(
      () => s.view("room", undefined, root.id, seat),
      (e) => e.status === 404,
    );
    assert.throws(
      () =>
        s.send("room", seat, {
          text: "intrude",
          clientId: "intrusion-attempt-01",
          replyTo: root.id,
        }),
      (e) => e.status === 404,
    );
    assert.throws(
      () => s.retry("room", seat, reply.id),
      (e) => e.status === 404,
    );
  }
  const follow = s.send("room", 1, {
    text: "And damaged ships?",
    clientId: "private-follow-up-01",
    replyTo: reply.id,
    private: false,
  });
  assert.equal(follow.messages.length, 4);
  assert.ok(follow.messages.every((m) => m.private));
  assert.equal(s.view("room", undefined, root.id, 1).messages.length, 4);
  assert.deepEqual(s.view("room", undefined, null, 0).messages, []);
  assert.equal(s.view("room", undefined, null, 1, "table").messages.length, 0);
  assert.equal(
    s.view("room", undefined, null, 1, "private").messages.length,
    4,
  );
  assert.throws(
    () =>
      s.send("room", 1, {
        text: "Can I repair here? @Host",
        clientId: "private-question-01",
        private: false,
      }),
    (e) => e.status === 409,
  );
  const restarted = createChatService(db, {
    load: () => ({ room: {} }),
    broadcast: () => {},
    enabled: () => false,
  });
  assert.equal(restarted.view("room", undefined, null, 1).messages.length, 4);
  assert.equal(restarted.view("room", undefined, null, 0).messages.length, 0);
  db.close();
});
test("public-thread visibility cannot silently become private and private conversation never enters public model context", async () => {
  const { db, service: s, room } = setup();
  const pub = s.send("room", 0, {
    text: "hello",
    clientId: "public-root-message",
  }).messages[0];
  assert.throws(
    () =>
      s.send("room", 1, {
        text: "reply",
        clientId: "public-root-reply-01",
        replyTo: pub.id,
        private: true,
      }),
    (e) => e.status === 400,
  );
  assert.ok(
    s.view("room", undefined, pub.id, 0).messages.every((m) => !m.private),
  );
  s.send("room", 1, {
    text: "SECRET CONSULT",
    clientId: "private-secret-test",
    private: true,
  });
  let passed;
  const ai = createChatService(db, {
    load: () => ({ room }),
    broadcast: () => {},
    enabled: () => true,
    generate: async (input) => {
      passed = input;
      return {
        status: "ruling",
        paragraphs: [],
        assumptions: [],
        followUp: "",
      };
    },
  });
  ai.send("room", 0, {
    text: "@arcy repair rules",
    clientId: "public-referee-ask",
  });
  await ai.idle();
  assert.ok(!JSON.stringify(passed).includes("SECRET CONSULT"));
  assert.ok(
    !JSON.stringify(ai.view("room", undefined, null, 0)).includes(
      "SECRET CONSULT",
    ),
  );
  db.close();
});
