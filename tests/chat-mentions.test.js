import test from "node:test";
import assert from "node:assert/strict";
import {
  chatMentionOptions,
  mentionQuery,
  filterMentions,
  mentionSegments,
  resolveChatMentions,
} from "../game/chat-mentions.js";
const players = [
  { id: 0, name: "Ada" },
  { id: 1, name: "Practice 2" },
  { id: 2, name: "A+B (test)" },
  { id: 3, name: "board" },
];
test("mention picker finds the active query at the caret without matching emails or completed mentions", () => {
  assert.deepEqual(mentionQuery("hello @Pr"), {
    start: 6,
    end: 9,
    query: "Pr",
  });
  assert.deepEqual(mentionQuery("@arcy explain @le later", 17), {
    start: 14,
    end: 17,
    query: "le",
  });
  assert.equal(mentionQuery("person@example"), null);
  assert.equal(mentionQuery("@arcy "), null);
  assert.equal(mentionQuery("plain text"), null);
});
test("mention suggestions include players and public board references with reserved-name disambiguation", () => {
  const options = chatMentionOptions(players);
  assert.equal(filterMentions(options, "Practice")[0].token, "@Practice 2");
  assert.equal(options.find((o) => o.playerId === 3).token, "@player4");
  for (const token of [
    "@arcy",
    "@board",
    "@lead",
    "@turn",
    "@ambitions",
    "@court",
    "@battle",
    "@scores",
    "@resources",
  ])
    assert.ok(options.some((o) => o.token === token));
});
test("references resolve exact player names safely, preserve plain text, and avoid prefix collisions", () => {
  const text =
    "@arcy Does @Practice 2 control @board? @A+B (test) @player4 @arcybot person@arcy";
  const parts = mentionSegments(text, chatMentionOptions(players));
  assert.equal(parts.map((s) => s.text).join(""), text);
  assert.deepEqual(
    resolveChatMentions(text, players).map((m) => m.id),
    ["arcy", "player-1", "board", "player-2", "player-3"],
  );
  assert.deepEqual(
    resolveChatMentions("@Ada @Ada", players).map((m) => m.id),
    ["player-0"],
  );
});

test("player names cannot collide with referee invocation or another player fallback token", () => {
  const options = chatMentionOptions([
    { name: "Arcy QA" },
    { name: "player4" },
    { name: "Alice @arcy" },
    { name: "board" },
  ]);
  const players = options.filter((o) => o.kind === "player");
  assert.deepEqual(
    players.map((o) => o.token),
    ["@player1", "@player2", "@player3", "@player4"],
  );
  assert.equal(new Set(players.map((o) => o.token)).size, 4);
});

test("mention notifications honor visibility, authorship, and exact player references", async () => {
  const { isPlayerMention } = await import("../game/chat-mentions.js");
  const players = [
    { id: 0, name: "Nova" },
    { id: 1, name: "Orion" },
  ];
  const message = {
    role: "player",
    seat: 1,
    text: "Hey @Nova, please check this.",
  };
  assert.equal(isPlayerMention(message, 0, players), true);
  for (const change of [
    { private: true },
    { seat: 0 },
    { role: "arcy" },
    { text: "@NovaLong" },
    { text: "@turn" },
  ])
    assert.equal(isPlayerMention({ ...message, ...change }, 0, players), false);
});
