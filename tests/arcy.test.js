import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createGame, transition, decision } from "../game/engine.js";
import {
  initialSources,
  searchRules,
  SOURCE_BY_ID,
  ARCY_SOURCES,
} from "../server/arcy-corpus.js";
import { refereeContext } from "../server/arcy-context.js";
import {
  mentionsArcy,
  validateAnswer,
  generateRuling,
} from "../server/arcy.js";
import { createChatService } from "../server/chat.js";

const room = () => {
  const r = {
    status: "playing",
    seats: [
      { name: "Ada", keyHash: "PRIVATE_KEY" },
      { name: "Bo", keyHash: "PRIVATE_OTHER_KEY" },
    ],
    options: {},
    game: createGame(["Ada", "Bo"], {}, 71),
  };
  while (r.game.pending.length) {
    const p = r.game.pending[0].p;
    const d = decision(r.game, p);
    r.game = transition(r.game, p, {
      choice: (d.choices.find((c) => c.op === "skip") ?? d.choices[0]).id,
    });
  }
  return r;
};
const source = SOURCE_BY_ID.get("rule-7.4");
const valid = () => ({
  status: "ruling",
  paragraphs: [
    {
      text: "Repair stands up one damaged Loyal ship or flips one damaged Loyal building. This can be anywhere on the map.",
      evidence: [
        {
          sourceId: source.id,
          quote:
            "Stand up 1 damaged Loyal ship, or flip over 1 damaged Loyal building.",
        },
      ],
    },
  ],
  assumptions: [],
  followUp: "",
});
const result = () => validateAnswer(valid(), [source]);
const completion = (answer) => ({
  status: "completed",
  output: [
    {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: JSON.stringify(answer) }],
    },
  ],
  usage: { total_tokens: 20 },
});

test("Arcy mention boundaries, case and unicode do not accidentally trigger on email or names", () => {
  for (const s of [
    "@arcy hi",
    "Hi @ArCy, can I repair?",
    "(@arcy)",
    "hey!@arcy?",
  ])
    assert.equal(mentionsArcy(s), true, s);
  for (const s of [
    "arcy",
    "person@arcy.com",
    "@arcybot",
    "@arcy_2",
    "@arcyé",
    "é@arcy",
  ])
    assert.equal(mentionsArcy(s), false, s);
});
test("corpus retains full battle sequence and exact publisher citations without campaign setup", () => {
  assert.ok(ARCY_SOURCES.length > 200);
  assert.ok(SOURCE_BY_ID.get("rule-7.7").text.includes("Raid Dice Limit"));
  assert.ok(SOURCE_BY_ID.get("rule-7.7").text.includes("Ransack"));
  for (const id of ["rule-3.2", "rule-3.3", "rule-2.4"])
    assert.equal(SOURCE_BY_ID.has(id), false);
  for (const s of ARCY_SOURCES) {
    assert.ok(s.text);
    assert.match(s.url, /^https:\/\/(rules|cards)\.buriedgiant\.com\//);
  }
});
const retrievalCases = [
  [
    "Can Elder stop Galactic Rifles from ransacking the Court?",
    ["card-LEAD01", "card-L02", "faq-L02-1"],
  ],
  ["How do I tax a rival city?", ["rule-7.1"]],
  ["Do damaged ships count for control?", ["rule-4.6"]],
  ["Can I repair a ship anywhere?", ["rule-7.4"]],
  ["Do we both get first place Power when tied on Tycoon?", ["rule-6.2"]],
  ["Can I build a ship at a starport I built this turn?", ["rule-7.2"]],
  ["Can I catapult through a gate controlled by a rival?", ["rule-7.3"]],
  ["What can I spend resources on in the prelude?", ["rule-9.1", "rule-8.1"]],
  ["Can I secure with equal agents?", ["rule-7.6"]],
  ["How many raid dice can I collect?", ["rule-7.7"]],
  ["How do I copy or pivot the lead card?", ["rule-5.2"]],
  ["What happens to action cards discarded face down?", ["rule-22.8"]],
  ["Can players give or trade pieces freely?", ["rule-22.5"]],
  ["How do I rearrange resources in slots?", ["rule-9.2"]],
  ["When can I use a newly acquired Guild?", ["rule-10.1"]],
];
for (const [question, ids] of retrievalCases)
  test(`retrieval: ${question}`, () => {
    const hits = searchRules(question, { limit: 12 }).map((s) => s.id);
    for (const id of ids)
      assert.ok(hits.includes(id), `${id} missing from ${hits}`);
  });
test("public referee context excludes every hand, deck order, pending stack and credentials", () => {
  const r = room();
  r.game.players[0].hand = ["SECRET_HAND_A"];
  r.game.players[1].hand = ["SECRET_HAND_B"];
  r.game.discardDown = ["SECRET_DISCARD"];
  r.game.courtDeck = ["SECRET_DECK"];
  r.game.rng = "SECRET_RNG";
  r.game.pending = [
    {
      type: "farseersSwap",
      p: 0,
      hand: ["SECRET_FARSEERS"],
      back: { secret: "SECRET_ROLLBACK" },
    },
  ];
  r.game.played = [
    { player: 0, faceup: false, card: "SECRET_COPY", mode: "copy" },
  ];
  const context = refereeContext(r, 0),
    json = JSON.stringify(context);
  assert.ok(!json.includes("SECRET"));
  assert.ok(!json.includes("PRIVATE"));
  assert.equal(context.players[0].handCount, 1);
  assert.equal(context.played[0].card, null);
  assert.equal(context.discardDownCount, 1);
  assert.equal(context.decisionActor, 0);
  assert.equal(context.activity.label, "Using Farseers");
  assert.equal(context.pending, undefined);
  assert.equal(context.history, undefined);
  assert.equal(context.rng, undefined);
});
test("two-player context includes the public neutral ambition rival", () => {
  const r = room();
  r.game.neutral.tycoon = 4;
  assert.deepEqual(refereeContext(r, 0).neutralAmbitionRival, r.game.neutral);
});
test("context correctly identifies lead, played seat and current player without affecting game", () => {
  const r = room(),
    before = structuredClone(r.game);
  const lead = decision(r.game, r.game.current).choices.find(
    (c) => c.op === "play",
  );
  r.game = transition(r.game, r.game.current, { choice: lead.id });
  const snapshot = structuredClone(r.game),
    c = refereeContext(r, 1);
  assert.equal(c.lead.player, r.game.current);
  assert.equal(c.lead.card, r.game.lead.id);
  assert.equal(c.played[0].player, r.game.current);
  assert.equal(c.asker, 1);
  assert.equal(c.currentPlayer, r.game.current);
  r.game.turn.leadDeclared = true;
  assert.equal(refereeContext(r, 1).turn.leadDeclared, true);
  r.game.turn.leadDeclared = snapshot.turn.leadDeclared;
  assert.deepEqual(r.game, snapshot);
  assert.equal(before.phase, "card");
});
test("citation validation accepts exact evidence and rejects fabricated sources or quotes", () => {
  assert.equal(result().paragraphs[0].evidence[0].url, source.url);
  for (const edit of [
    (a) => (a.paragraphs[0].evidence[0].sourceId = "made-up"),
    (a) =>
      (a.paragraphs[0].evidence[0].quote =
        "You can repair all ships for free."),
    (a) => (a.paragraphs[0].evidence = []),
  ]) {
    const a = valid();
    edit(a);
    assert.throws(() => validateAnswer(a, [source]));
  }
  assert.throws(() => validateAnswer({ ...valid(), paragraphs: [] }, [source]));
});
test("agent uses retrieval tools, a separate review pass, store:false and validated final citations", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(options.headers.Authorization, "Bearer test-secret");
    const body = JSON.parse(options.body);
    requests.push(body);
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    const data =
      body.text.format.name === "arcy_scope"
        ? completion({ category: "rules" })
        : requests.length === 2
          ? {
              status: "completed",
              output: [
                {
                  type: "function_call",
                  name: "search_rules",
                  call_id: "search-1",
                  arguments: JSON.stringify({
                    query: "Repair damaged Loyal ship",
                  }),
                },
              ],
            }
          : completion(
              body.text.format.name === "arcy_review"
                ? { containsStrategy: false, answer: valid() }
                : valid(),
            );
    return { ok: true, json: async () => data };
  };
  const r = await generateRuling({
    question: "@arcy Can I repair here?",
    context: refereeContext(room(), 0),
    apiKey: "test-secret",
    fetchImpl,
  });
  assert.equal(requests.length, 4);
  assert.ok(requests[2].input.some((x) => x.type === "function_call_output"));
  assert.ok(requests[3].instructions.includes("Independently verify EVERY"));
  assert.equal(r.status, "ruling");
  assert.ok(!JSON.stringify(requests).includes("test-secret"));
  assert.equal(r.usage.calls, 4);
});
test("agent rejects unverified final output and provider error details", async () => {
  const bad = valid();
  bad.paragraphs[0].evidence[0].quote = "NOT A REAL QUOTE";
  await assert.rejects(
    generateRuling({
      question: "repair",
      context: {},
      apiKey: "test",
      fetchImpl: async (url, options) => {
        const name = JSON.parse(options.body).text.format.name;
        return {
          ok: true,
          json: async () =>
            completion(
              name === "arcy_scope"
                ? { category: "rules" }
                : name === "arcy_review"
                  ? { containsStrategy: false, answer: bad }
                  : bad,
            ),
        };
      },
    }),
    /citation/,
  );
  await assert.rejects(
    generateRuling({
      question: "repair",
      context: {},
      apiKey: "test",
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        json: async () => ({ secret: "do not print" }),
      }),
    }),
    /unavailable \(401\)/,
  );
});
function chatHarness(t, options = {}) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const r = room();
  let clock = 100000;
  const api = createChatService(db, {
    load: () => ({ room: r }),
    broadcast: () => {},
    enabled: () => true,
    generate: async () => result(),
    now: () => clock,
    ...options,
  });
  return { db, r, api, tick: () => (clock += 16000) };
}
const message = (text, suffix = "1111111111111111") => ({
  text,
  clientId: suffix,
});
test("chat persists shared conversation without changing game revisions and deduplicates retries", async (t) => {
  const { api, r } = chatHarness(t);
  const before = structuredClone(r);
  api.send("table", 0, message("Hello everyone"));
  api.send("table", 0, message("Hello everyone"));
  assert.equal(api.view("table").messages.length, 1);
  assert.deepEqual(r, before);
  assert.throws(
    () => api.send("table", 0, message("Different text")),
    /already sent/,
  );
  assert.equal(api.view("other-table").messages.length, 0);
});
test("pending AI never overwrites turns made while it is thinking", async (t) => {
  let finish;
  const gate = new Promise((resolve) => (finish = resolve));
  const { api, r } = chatHarness(t, {
    generate: async () => {
      await gate;
      return result();
    },
  });
  api.send("table", 0, message("@arcy Can I repair?"));
  assert.equal(api.view("table").messages[1].status, "pending");
  const choice = decision(r.game, r.game.current).choices.find(
    (c) => c.op === "play",
  );
  r.game = transition(r.game, r.game.current, { choice: choice.id });
  const afterTurn = structuredClone(r.game);
  finish();
  await api.idle();
  const answer = api.view("table").messages[1];
  assert.equal(answer.status, "complete");
  assert.equal(answer.snapshot.revision, afterTurn.revision - 1);
  assert.deepEqual(r.game, afterTurn);
});
test("only mentions invoke AI, room concurrency limits allow normal player chat", async (t) => {
  let finish,
    calls = 0;
  const gate = new Promise((resolve) => (finish = resolve));
  const { api } = chatHarness(t, {
    generate: async () => {
      calls++;
      await gate;
      return result();
    },
  });
  api.send("table", 0, message("@arcy repair?"));
  assert.throws(
    () => api.send("table", 1, message("@arcy move?", "2222222222222222")),
    /busy checking/,
  );
  api.send("table", 1, message("Hello", "3333333333333333"));
  finish();
  await api.idle();
  assert.equal(calls, 1);
  assert.equal(api.view("table").messages.length, 3);
});
test("provider failures are safe, retry uses latest snapshot, and ownership is enforced", async (t) => {
  let calls = 0;
  const { api, r, tick } = chatHarness(t, {
    generate: async () => {
      if (++calls === 1) throw Error("SECRET_PROVIDER_BODY");
      return result();
    },
  });
  api.send("table", 1, message("@arcy repair?"));
  await api.idle();
  const error = api.view("table").messages[1];
  assert.equal(error.status, "error");
  assert.ok(!JSON.stringify(error).includes("SECRET"));
  assert.throws(() => api.retry("table", 2, error.id), /asker or host/);
  tick();
  r.game.revision += 1;
  api.retry("table", 0, error.id);
  await api.idle();
  assert.equal(api.view("table").messages[1].status, "complete");
  assert.equal(
    api.view("table").messages[1].snapshot.revision,
    r.game.revision,
  );
});
test("disabled referee leaves chat usable and restart turns interrupted replies into retryable errors", async (t) => {
  const { db, api } = chatHarness(t, { enabled: () => false });
  api.send("table", 0, message("@arcy help"));
  assert.equal(api.view("table").messages[1].status, "error");
  assert.equal(api.view("table").enabled, false);
  db.prepare(
    "UPDATE chat_messages SET status='pending' WHERE role='arcy'",
  ).run();
  const restarted = createChatService(db, {
    load: () => ({ room: room() }),
    broadcast: () => {},
    enabled: () => false,
  });
  assert.match(restarted.view("table").messages[1].text, /restart/);
});
test("messages are bounded, per-seat throttled and pagination does not cross tables", (t) => {
  const { api, db } = chatHarness(t);
  for (const text of ["", "a".repeat(1501), null])
    assert.throws(() => api.send("table", 0, message(text)), /characters/);
  for (let i = 0; i < 20; i++)
    api.send("table", 0, message(`message ${i}`, String(i).padStart(16, "0")));
  assert.throws(
    () => api.send("table", 0, message("too many", "z".repeat(16))),
    /slow down/,
  );
  for (let i = 0; i < 120; i++)
    db.prepare(
      "INSERT INTO chat_messages(room,seat,role,text,created,status) VALUES('table',1,'player',?,1,'complete')",
    ).run(String(i));
  const page = api.view("table");
  assert.equal(page.messages.length, 100);
  assert.equal(page.hasOlder, true);
  const earlier = api.view("table", page.messages[0].id);
  assert.equal(earlier.messages.length, 40);
  assert.equal(earlier.hasOlder, false);
  assert.ok(earlier.messages.at(-1).id < page.messages[0].id);
  assert.equal(api.view("other").messages.length, 0);
});
test("question budgets persist independently of message history and ordinary chat remains available", async (t) => {
  const { api, db, tick } = chatHarness(t);
  for (let n = 0; n < 60; n++)
    db.prepare("INSERT INTO arcy_usage VALUES(?,?,?)").run("table", 0, 80000);
  assert.throws(
    () => api.send("table", 0, message("@arcy repair?")),
    /question limit/,
  );
  api.send("table", 0, message("We can still talk", "ordinary-message1"));
  assert.equal(api.view("table").messages.length, 1);
  const restart = createChatService(db, {
    load: () => ({ room: room() }),
    broadcast: () => {},
    enabled: () => true,
    now: () => 100000,
  });
  assert.throws(
    () => restart.send("table", 0, message("@arcy repair?")),
    /question limit/,
  );
});
test("an in-flight question is idempotent and does not double-charge the daily budget", async (t) => {
  let finish;
  const gate = new Promise((r) => (finish = r));
  const { api, db } = chatHarness(t, {
    generate: async () => {
      await gate;
      return result();
    },
  });
  const request = message("@arcy Repair?");
  api.send("table", 0, request);
  api.send("table", 0, request);
  assert.equal(db.prepare("SELECT count(*) n FROM arcy_usage").get().n, 1);
  assert.equal(api.view("table").messages.length, 2);
  finish();
  await api.idle();
});
test("a public-state-only answer does not need a fabricated rule citation", () => {
  const answer = validateAnswer(
    {
      status: "context",
      paragraphs: [{ text: "This is Chapter 1, Round 1.", evidence: [] }],
      assumptions: [],
      followUp: "",
    },
    [],
  );
  assert.equal(answer.status, "context");
});

test("lobby questions retrieve rules before players have game boards", () => {
  const c = refereeContext({ seats: [{ name: "Ada" }], game: null }, 0);
  assert.ok(initialSources("How do I play?", c).length > 3);
});

test("strategy gate never sends the board to an answering model and uses a fixed refusal", async () => {
  const requests = [];
  const result = await generateRuling({
    question: "@arcy Pick my best move",
    context: { secretBoardMarker: "BOARD_SENTINEL" },
    apiKey: "test",
    fetchImpl: async (url, options) => {
      const b = JSON.parse(options.body);
      requests.push(b);
      return {
        ok: true,
        json: async () => completion({ category: "strategy" }),
      };
    },
  });
  assert.equal(requests.length, 1);
  assert.equal(result.status, "strategy");
  assert.ok(!JSON.stringify(requests).includes("BOARD_SENTINEL"));
  assert.match(result.paragraphs[0].text, /can’t recommend moves/);
  assert.deepEqual(result.paragraphs[0].evidence, []);
});
test("independent review withholds coaching even when the input gate permitted the question", async () => {
  const unsafe = {
    ...valid(),
    followUp: "You should attack Bo to maximize Power.",
  };
  const result = await generateRuling({
    question: "Explain battle",
    context: {},
    apiKey: "test",
    fetchImpl: async (url, options) => {
      const name = JSON.parse(options.body).text.format.name;
      return {
        ok: true,
        json: async () =>
          completion(
            name === "arcy_scope"
              ? { category: "rules" }
              : name === "arcy_review"
                ? { containsStrategy: true, answer: unsafe }
                : unsafe,
          ),
      };
    },
  });
  assert.equal(result.status, "strategy");
  assert.ok(!JSON.stringify(result).includes("attack Bo"));
});
test("missing or malformed strategy checks fail closed", async () => {
  for (const category of [undefined, "approved"]) {
    await assert.rejects(
      generateRuling({
        question: "help",
        context: {},
        apiKey: "test",
        fetchImpl: async () => ({
          ok: true,
          json: async () => completion({ category }),
        }),
      }),
      /scope/,
    );
  }
  await assert.rejects(
    generateRuling({
      question: "repair",
      context: {},
      apiKey: "test",
      fetchImpl: async (url, options) => ({
        ok: true,
        json: async () =>
          completion(
            JSON.parse(options.body).text.format.name === "arcy_scope"
              ? { category: "rules" }
              : valid(),
          ),
      }),
    }),
    /fair-play/,
  );
});

test("referee sees the public draft pool and retrieves its card rules without exposing undrafted reserve", () => {
  const r = room();
  r.game = createGame(["Ada", "Bo"], { leaders: true }, 71);
  const before = structuredClone(r.game);
  const context = refereeContext(r, 0);
  assert.deepEqual(
    context.draft.leaders.map((c) => c.id),
    r.game.draft.leaders,
  );
  assert.deepEqual(
    context.draft.lore.map((c) => c.id),
    r.game.draft.lore,
  );
  assert.equal(context.draft.choosingPlayer, r.game.current);
  const sources = initialSources("the leader opts", context);
  for (const c of [...context.draft.leaders, ...context.draft.lore]) {
    assert.ok(c.name);
    assert.ok(
      sources.some((s) => s.cardId === c.id),
      c.name,
    );
    assert.equal(context.cardNames[c.id], c.name);
  }
  assert.equal(context.draft.remaining, undefined);
  assert.deepEqual(r.game, before);
});

test("thread replies are persistent, scoped to their root, and invoke Arcy without a repeat mention", async (t) => {
  const calls = [];
  const { api, tick, db } = chatHarness(t, {
    generate: async (args) => {
      calls.push(args);
      return result();
    },
  });
  const first = api.send("table", 0, message("@arcy explain Repair"));
  const root = first.messages[0].id;
  await api.idle();
  api.send("table", 1, message("unrelated table discussion", "u".repeat(16)));
  tick();
  api.send("table", 1, {
    ...message("without ships?", "r".repeat(16)),
    replyTo: first.messages[1].id,
  });
  await api.idle();
  assert.equal(calls.length, 2);
  assert.ok(
    calls[1].conversation.some((m) => m.text === "@arcy explain Repair"),
  );
  assert.ok(!calls[1].conversation.some((m) => m.text.includes("unrelated")));
  const thread = api.view("table", undefined, root);
  assert.equal(thread.messages.length, 4);
  assert.equal(thread.threadCounts[root].count, 3);
  assert.equal(thread.threadCounts[root].arcy, true);
  assert.ok(thread.messages.slice(1).every((m) => m.threadId === root));
  const restored = createChatService(db, {
    load: () => ({ room: room() }),
    broadcast: () => {},
    enabled: () => true,
  });
  assert.deepEqual(
    restored.view("table", undefined, root).messages,
    thread.messages,
  );
});

test("thread references cannot cross tables, spoof IDs, or redirect an idempotent request", (t) => {
  const { api } = chatHarness(t);
  const root = api.send("table", 0, message("Hi")).messages[0].id;
  assert.throws(
    () => api.send("other", 0, { ...message("reply"), replyTo: root }),
    /not found/,
  );
  assert.throws(() => api.view("other", undefined, root), /not found/);
  for (const replyTo of ["1", -1, 1.5, {}])
    assert.throws(
      () => api.send("table", 0, { ...message("reply"), replyTo }),
      /Invalid/,
    );
  assert.throws(
    () => api.send("table", 0, { ...message("Hi"), replyTo: root }),
    /already sent/,
  );
});

test("ordinary player threads never invoke Arcy and old roots survive paginated thread history", async (t) => {
  let calls = 0;
  const { api, db } = chatHarness(t, {
    generate: async () => {
      calls++;
      return result();
    },
  });
  const root = api.send("table", 0, message("ordinary topic")).messages[0].id;
  api.send("table", 1, {
    ...message("ordinary reply", "r".repeat(16)),
    replyTo: root,
  });
  await api.idle();
  assert.equal(calls, 0);
  const insert = db.prepare(
    "INSERT INTO chat_messages(room,seat,role,text,created,status,thread_id,reply_to) VALUES('table',1,'player',?,1,'complete',?,?)",
  );
  for (let i = 0; i < 120; i++) insert.run(`reply ${i}`, root, root);
  const page = api.view("table", undefined, root);
  assert.equal(page.messages.length, 101); // root + last 100 replies
  assert.equal(page.messages[0].id, root);
  assert.equal(page.threadCounts[root].count, 121);
  assert.ok(page.hasOlder);
  const previous = api.view("table", page.nextBefore, root);
  assert.equal(previous.messages.length, 22);
  assert.equal(previous.hasOlder, false);
  assert.ok(previous.messages.slice(1).every((m) => m.id < page.nextBefore));
});

test("existing chat database gains threads without losing messages", (t) => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec(`CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, seat INTEGER NOT NULL, client_id TEXT, role TEXT NOT NULL, text TEXT NOT NULL, created INTEGER NOT NULL, status TEXT NOT NULL, reply_to INTEGER, payload TEXT NOT NULL DEFAULT '{}', updated INTEGER NOT NULL DEFAULT 0, UNIQUE(room,seat,client_id));
  INSERT INTO chat_messages(room,seat,role,text,created,status) VALUES('table',0,'player','@arcy help',1,'complete');
  INSERT INTO chat_messages(room,seat,role,text,created,status,reply_to) VALUES('table',0,'arcy','answer',2,'complete',1);`);
  const api = createChatService(db, {
    load: () => ({ room: room() }),
    broadcast: () => {},
  });
  const saved = api.view("table", undefined, 1);
  assert.equal(saved.messages[1].text, "answer");
  assert.equal(saved.messages[1].threadId, 1);
  assert.equal(saved.threadCounts[1].count, 1);
});
