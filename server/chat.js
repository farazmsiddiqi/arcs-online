import { generateRuling, mentionsArcy } from "./arcy.js";
import { refereeContext, snapshotLabel } from "./arcy-context.js";

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const positive = (value, fallback) =>
  Number.isInteger(+value) && +value > 0 ? Math.min(+value, 10000) : fallback;
const interrupted =
  "I was interrupted by a server restart. Retry and I’ll check the current board.";
export function createChatService(
  db,
  {
    load,
    broadcast,
    generate = generateRuling,
    enabled = () => !!process.env.OPENAI_API_KEY,
    now = Date.now,
  } = {},
) {
  db.exec(`CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, seat INTEGER NOT NULL,
    client_id TEXT, role TEXT NOT NULL, text TEXT NOT NULL, created INTEGER NOT NULL,
    status TEXT NOT NULL, reply_to INTEGER, payload TEXT NOT NULL DEFAULT '{}', updated INTEGER NOT NULL DEFAULT 0,
    UNIQUE(room,seat,client_id));
    CREATE INDEX IF NOT EXISTS chat_by_room ON chat_messages(room,id);
    CREATE TABLE IF NOT EXISTS arcy_usage (room TEXT NOT NULL, seat INTEGER NOT NULL, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS arcy_usage_time ON arcy_usage(created);`);
  // Additive migration: existing chat and game saves remain untouched.
  if (
    !db
      .prepare("PRAGMA table_info(chat_messages)")
      .all()
      .some((c) => c.name === "thread_id")
  ) {
    db.exec("ALTER TABLE chat_messages ADD COLUMN thread_id INTEGER");
    db.exec("UPDATE chat_messages SET thread_id=reply_to WHERE role='arcy'");
  }
  db.exec(
    "CREATE INDEX IF NOT EXISTS chat_threads ON chat_messages(room,thread_id,id)",
  );
  db.prepare(
    "UPDATE chat_messages SET status='error',text=?,payload='{}' WHERE role='arcy' AND status='pending'",
  ).run(interrupted);
  const active = new Map();
  const insert = db.prepare(
    "INSERT INTO chat_messages(room,seat,client_id,role,text,created,status,reply_to,payload,thread_id) VALUES(?,?,?,?,?,?,?,?,?,?)",
  );
  const decode = (row) => ({
    id: row.id,
    seat: row.seat,
    role: row.role,
    text: row.text,
    created: row.created,
    updated: row.updated || row.created,
    status: row.status,
    replyTo: row.reply_to,
    threadId: row.thread_id,
    ...JSON.parse(row.payload),
  });
  function view(id, before = Number.MAX_SAFE_INTEGER, thread = null) {
    if (
      thread !== null &&
      !db
        .prepare(
          "SELECT id FROM chat_messages WHERE room=? AND id=? AND thread_id IS NULL",
        )
        .get(id, thread)
    )
      fail(404, "Thread not found.");
    const rows =
      thread === null
        ? db
            .prepare(
              "SELECT * FROM chat_messages WHERE room=? AND id<? ORDER BY id DESC LIMIT 101",
            )
            .all(id, before)
        : db
            .prepare(
              "SELECT * FROM chat_messages WHERE room=? AND thread_id=? AND id<? ORDER BY id DESC LIMIT 101",
            )
            .all(id, thread, before);
    const page = rows.slice(0, 100).reverse();
    const roots = new Set(page.map((m) => m.thread_id ?? m.id));
    if (thread !== null) roots.add(thread);
    const combined = new Map(page.map((m) => [m.id, m]));
    const threadCounts = {};
    for (const root of roots) {
      const parent = db
        .prepare("SELECT * FROM chat_messages WHERE room=? AND id=?")
        .get(id, root);
      if (parent) combined.set(parent.id, parent);
      const stats = db
        .prepare(
          "SELECT count(*) count, max(role='arcy') arcy FROM chat_messages WHERE room=? AND thread_id=?",
        )
        .get(id, root);
      threadCounts[root] = { count: stats.count, arcy: !!stats.arcy };
    }
    return {
      enabled: enabled(),
      messages: [...combined.values()].sort((a, b) => a.id - b.id).map(decode),
      hasOlder: rows.length > 100,
      nextBefore: page[0]?.id ?? before,
      threadCounts,
    };
  }
  const update = (id, status, text, payload) =>
    db
      .prepare(
        "UPDATE chat_messages SET status=?,text=?,payload=?,updated=MAX(updated+1,created+1,?) WHERE id=?",
      )
      .run(status, text, JSON.stringify(payload), now(), id);
  function checkAI(id, seat) {
    if (active.has(id))
      fail(
        429,
        "Arcy is already checking a question at this table. You can still send a message without @arcy.",
      );
    if (active.size >= 4)
      fail(429, "Arcy is helping other tables. Please try again shortly.");
    const day = now() - 86400000;
    db.prepare("DELETE FROM arcy_usage WHERE created<?").run(day);
    const count = (sql) => db.prepare(sql).get(id, seat, now() - 15000).n;
    if (
      count(
        "SELECT count(*) n FROM arcy_usage WHERE room=? AND seat=? AND created>?",
      )
    )
      fail(429, "Give Arcy a few seconds before asking another question.");
    const roomLimit = positive(process.env.ARCY_TABLE_DAILY_LIMIT, 60);
    const globalLimit = positive(process.env.ARCY_DAILY_LIMIT, 300);
    if (
      db.prepare("SELECT count(*) n FROM arcy_usage WHERE room=?").get(id).n >=
      roomLimit
    )
      fail(
        429,
        "This table has reached its referee question limit for 24 hours. Player chat is still available.",
      );
    if (db.prepare("SELECT count(*) n FROM arcy_usage").get().n >= globalLimit)
      fail(
        429,
        "The referee has reached today’s question limit. Player chat is still available.",
      );
  }
  function start(id, seat, question, replyId, context) {
    const label = snapshotLabel(context);
    if (!enabled()) {
      update(
        replyId,
        "error",
        "Arcy isn’t connected yet. Your host can enable the referee; player chat is ready to use.",
        { snapshot: label },
      );
      return;
    }
    db.prepare("INSERT INTO arcy_usage VALUES(?,?,?)").run(id, seat, now());
    const room = load(id).room;
    const reply = db
      .prepare("SELECT thread_id FROM chat_messages WHERE room=? AND id=?")
      .get(id, replyId);
    const root = db
      .prepare("SELECT * FROM chat_messages WHERE room=? AND id=?")
      .get(id, reply.thread_id);
    const recent = db
      .prepare(
        "SELECT * FROM chat_messages WHERE room=? AND thread_id=? AND id<? AND status='complete' ORDER BY id DESC LIMIT 7",
      )
      .all(id, reply.thread_id, replyId)
      .reverse();
    const conversation = [root, ...recent]
      .filter(Boolean)
      .map(decode)
      .map((m) => ({ ...m, name: room.seats[m.seat]?.name ?? "Player" }));
    const work = Promise.resolve()
      .then(() =>
        generate({
          question,
          context,
          conversation,
          onStage: (stage) => {
            update(replyId, "pending", stage, { snapshot: label });
            broadcast(id);
          },
        }),
      )
      .then((answer) => {
        // Only write chat rows after awaiting the model. Saving the captured room
        // here would roll back any turns taken while Arcy was thinking.
        const { usage, ...publicAnswer } = answer;
        update(replyId, "complete", "", {
          snapshot: label,
          answer: publicAnswer,
        });
      })
      .catch(() => {
        update(
          replyId,
          "error",
          "I couldn’t finish a verified ruling. Please retry—I won’t guess when I can’t check the sources.",
          { snapshot: label },
        );
      })
      .finally(() => {
        active.delete(id);
        broadcast(id);
      });
    active.set(id, work);
  }
  function send(id, seat, { text, clientId, replyTo = null }) {
    if (
      typeof text !== "string" ||
      !text.trim() ||
      text.length > 1500 ||
      typeof clientId !== "string" ||
      !/^[a-zA-Z0-9_-]{16,80}$/.test(clientId)
    )
      fail(400, "Write a message of 1–1,500 characters.");
    text = text.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
    if (!text) fail(400, "Write a message first.");
    if (replyTo !== null && (!Number.isSafeInteger(replyTo) || replyTo < 1))
      fail(400, "Invalid reply reference.");
    const parent =
      replyTo === null
        ? null
        : db
            .prepare("SELECT * FROM chat_messages WHERE room=? AND id=?")
            .get(id, replyTo);
    if (replyTo !== null && !parent)
      fail(404, "Reply message not found at this table.");
    const threadId = parent ? (parent.thread_id ?? parent.id) : null;
    const existing = db
      .prepare(
        "SELECT * FROM chat_messages WHERE room=? AND seat=? AND client_id=?",
      )
      .get(id, seat, clientId);
    if (existing) {
      if (existing.text !== text || existing.reply_to !== replyTo)
        fail(409, "This message was already sent with different text.");
      return view(id);
    }
    if (
      db
        .prepare(
          "SELECT count(*) n FROM chat_messages WHERE room=? AND seat=? AND role='player' AND created>?",
        )
        .get(id, seat, now() - 60000).n >= 20
    )
      fail(429, "Please slow down—20 messages per minute is the table limit.");
    const ask =
        mentionsArcy(text) ||
        (threadId !== null &&
          !!db
            .prepare(
              "SELECT id FROM chat_messages WHERE room=? AND thread_id=? AND role='arcy' LIMIT 1",
            )
            .get(id, threadId)),
      room = load(id).room;
    if (ask && enabled()) checkAI(id, seat);
    const context = ask ? refereeContext(room, seat) : null;
    let replyId;
    db.exec("BEGIN IMMEDIATE");
    try {
      const message = insert.run(
        id,
        seat,
        clientId,
        "player",
        text,
        now(),
        "complete",
        replyTo,
        "{}",
        threadId,
      );
      if (ask)
        replyId = Number(
          insert.run(
            id,
            seat,
            null,
            "arcy",
            "Consulting the rulebook",
            now(),
            "pending",
            Number(message.lastInsertRowid),
            JSON.stringify({ snapshot: snapshotLabel(context) }),
            threadId ?? Number(message.lastInsertRowid),
          ).lastInsertRowid,
        );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    if (ask) start(id, seat, text, replyId, context);
    broadcast(id);
    return view(id);
  }
  function retry(id, seat, messageId) {
    const message = db
      .prepare(
        "SELECT * FROM chat_messages WHERE room=? AND id=? AND role='arcy'",
      )
      .get(id, messageId);
    if (!message) fail(404, "Referee message not found.");
    if (seat !== message.seat && seat !== 0)
      fail(403, "Only the asker or host can retry this question.");
    if (message.status !== "error")
      fail(409, "This question is already being answered or has a ruling.");
    if (!enabled()) fail(503, "The referee is not connected yet.");
    checkAI(id, seat);
    const question = db
      .prepare("SELECT text FROM chat_messages WHERE room=? AND id=?")
      .get(id, message.reply_to)?.text;
    if (!question) fail(404, "Original question not found.");
    const context = refereeContext(load(id).room, message.seat);
    update(message.id, "pending", "Consulting the current board", {
      snapshot: snapshotLabel(context),
    });
    start(id, message.seat, question, message.id, context);
    broadcast(id);
    return view(id);
  }
  return { view, send, retry, idle: () => Promise.all([...active.values()]) };
}
