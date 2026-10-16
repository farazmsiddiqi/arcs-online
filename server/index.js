import express from "express";
import { WebSocketServer } from "ws";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGame, viewFor, RuleError } from "../game/engine.js";
import { autoInput } from "../game/autoplay.js";
import { migrateRoom, backupLegacyRooms } from "./migrate.js";
import { resolveTimeout } from "./timeout.js";
import {
  applyMovement,
  applyResourceArrangement,
  applyDecision,
  historyView,
  travelHistory,
} from "./history.js";
import {
  validateTimer,
  initClock,
  clockView,
  settleClock,
  followClock,
  assertClockOpen,
  changeClock,
  addNotice,
} from "./clock.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.env.DATA_DIR ?? path.join(root, "var");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, "arcs.sqlite"));
db.exec(
  "PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY, invite_hash TEXT NOT NULL, host_hash TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS events(room TEXT NOT NULL, revision INTEGER NOT NULL, actor INTEGER, action TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(room,revision));",
);
if (backupLegacyRooms(db, dir))
  console.log(
    "Created pre-upgrade SQLite backup: backups/before-save-v1.sqlite",
  );
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "24kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.headers.origin) {
    let origin;
    try {
      origin = new URL(req.headers.origin);
    } catch {
      return res.status(403).json({ error: "Invalid origin." });
    }
    if (
      origin.host !== req.get("host") &&
      !["localhost:5173", "127.0.0.1:5173"].includes(origin.host)
    )
      return res
        .status(403)
        .json({ error: "This request came from another site." });
  }
  next();
});
const token = () => randomBytes(24).toString("base64url");
const hash = (x) => createHash("sha256").update(String(x)).digest("hex");
const safe = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const limit = new Map();
app.use("/api", (req, res, next) => {
  const key =
    req.ip +
    ":" +
    (req.method === "POST" && req.path === "/rooms" ? "create" : "all");
  const now = Date.now();
  const rec = limit.get(key) ?? { start: now, count: 0 };
  if (now - rec.start > 60000) {
    rec.start = now;
    rec.count = 0;
  }
  rec.count++;
  limit.set(key, rec);
  if (rec.count > (key.endsWith("create") ? 12 : 500))
    return res
      .status(429)
      .json({ error: "Too many requests. Please wait a moment." });
  next();
});
const load = (id) => {
  const row = db.prepare("SELECT * FROM rooms WHERE id=?").get(id);
  if (!row) throw Object.assign(new Error("Table not found."), { status: 404 });
  return { ...row, room: migrateRoom(JSON.parse(row.data)) };
};
const save = (row) =>
  db
    .prepare("UPDATE rooms SET data=?,updated=? WHERE id=?")
    .run(JSON.stringify(row.room), Date.now(), row.id);
const auth = (row, key) => {
  const h = hash(key ?? "");
  const p = row.room.seats.findIndex((s) => safe(s.keyHash, h));
  if (p < 0)
    throw Object.assign(new Error("Your seat key is missing or invalid."), {
      status: 403,
    });
  return p;
};
const getKey = (req) => req.get("authorization")?.replace(/^Bearer /, "");
function publicRoom(row, p) {
  return {
    id: row.id,
    status: row.room.status,
    capacity: row.room.capacity,
    options: row.room.options,
    seats: row.room.seats.map((s, id) => ({
      id,
      name: s.name,
      connected: connections.get(row.id)?.some((c) => c.p === id) ?? false,
    })),
    host: p === 0,
    me: p,
    revision: row.room.revision,
    history: historyView(row.room, p),
    clock: clockView(row.room),
    notices: row.room.notices ?? [],
    game: row.room.game ? viewFor(row.room.game, p) : null,
  };
}
const connections = new Map();
function broadcast(id) {
  const cs = connections.get(id) ?? [];
  if (!cs.length) return;
  const row = load(id);
  for (const c of cs)
    if (c.ws.readyState === 1) c.ws.send(JSON.stringify(publicRoom(row, c.p)));
}
app.get("/api/health", (req, res) =>
  res.json({ ok: true, version: "0.1.0", storage: "sqlite" }),
);
app.post("/api/rooms", (req, res) => {
  const { name, players = 4, options = {}, practice = false } = req.body;
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 32 ||
    ![2, 3, 4].includes(players)
  )
    return res
      .status(400)
      .json({ error: "Enter your name and choose 2–4 players." });
  const id = randomBytes(4).toString("hex").toUpperCase(),
    invite = token(),
    key = token();
  const room = {
    status: "lobby",
    capacity: players,
    revision: 0,
    options: {
      leaders: !!options.leaders,
      doubleLore: !!options.doubleLore,
      setupId: options.setupId,
      timer: validateTimer(options.timer),
    },
    seats: [{ name: name.trim(), keyHash: hash(key) }],
    game: null,
    practice: !!practice,
  };
  if (practice) {
    for (let i = 1; i < players; i++)
      room.seats.push({
        name: `Practice ${i + 1}`,
        keyHash: hash(token()),
        bot: true,
      });
    room.game = createGame(
      room.seats.map((s) => s.name),
      room.options,
      randomBytes(4).readUInt32LE(),
    );
    room.status = "playing";
  }
  initClock(room);
  db.prepare("INSERT INTO rooms VALUES(?,?,?,?,?)").run(
    id,
    hash(invite),
    hash(key),
    JSON.stringify(room),
    Date.now(),
  );
  res.status(201).json({ id, key, invite, ...publicRoom(load(id), 0) });
  if (practice) scheduleBot(id);
});
app.post("/api/rooms/:id/join", (req, res) => {
  const row = load(req.params.id);
  if (!safe(hash(req.body.invite ?? ""), row.invite_hash))
    return res.status(403).json({ error: "This invitation is invalid." });
  if (row.room.status !== "lobby" || row.room.seats.length >= row.room.capacity)
    return res
      .status(409)
      .json({ error: "This table has started or all seats are occupied." });
  const name = String(req.body.name ?? "").trim();
  if (!name || name.length > 32)
    return res.status(400).json({ error: "Enter a name (1–32 characters)." });
  if (row.room.seats.some((x) => x.name.toLowerCase() === name.toLowerCase()))
    return res
      .status(409)
      .json({ error: "That name is already taken at this table." });
  const key = token();
  row.room.seats.push({ name, keyHash: hash(key) });
  row.room.revision++;
  save(row);
  const p = row.room.seats.length - 1;
  res.json({ key, ...publicRoom(row, p) });
  broadcast(row.id);
});
app.get("/api/rooms/:id", (req, res) => {
  const row = load(req.params.id);
  const p = auth(row, getKey(req));
  res.json(publicRoom(row, p));
  if (row.room.practice) scheduleBot(row.id);
});
app.post("/api/rooms/:id/start", (req, res) => {
  const row = load(req.params.id),
    p = auth(row, getKey(req));
  if (p !== 0)
    return res.status(403).json({ error: "Only the host can begin the game." });
  if (
    row.room.status !== "lobby" ||
    row.room.seats.length !== row.room.capacity
  )
    return res.status(409).json({ error: "Wait until every seat is filled." });
  row.room.game = createGame(
    row.room.seats.map((s) => s.name),
    row.room.options,
    randomBytes(4).readUInt32LE(),
  );
  row.room.status = "playing";
  followClock(row.room);
  row.room.revision++;
  save(row);
  res.json(publicRoom(row, p));
  broadcast(row.id);
});
app.post("/api/rooms/:id/action", (req, res) => {
  const row = load(req.params.id),
    p = auth(row, getKey(req));
  if (!row.room.game)
    return res.status(409).json({ error: "This game has not started." });
  if (req.body.revision !== row.room.game.revision)
    return res.status(409).json({
      error: "The table changed. Your view has been refreshed.",
      ...publicRoom(row, p),
    });
  assertClockOpen(row.room);
  settleClock(row.room);
  if (Object.hasOwn(req.body, "resourceArrangement"))
    applyResourceArrangement(row.room, p, req.body);
  else if (req.body.destination) applyMovement(row.room, p, req.body);
  else applyDecision(row.room, p, req.body);
  followClock(row.room);
  persistAction(row, p, req.body);
  res.json(publicRoom(row, p));
  broadcast(row.id);
  if (row.room.practice) scheduleBot(row.id);
});
function persistAction(row, p, input) {
  row.room.revision++;
  if (row.room.game?.phase === "over") row.room.status = "complete";
  db.exec("BEGIN IMMEDIATE");
  try {
    save(row);
    if (row.room.game)
      db.prepare("INSERT INTO events VALUES(?,?,?,?,?)").run(
        row.id,
        row.room.game.revision,
        p,
        JSON.stringify(input),
        Date.now(),
      );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
for (const control of ["history", "timer"])
  app.post(`/api/rooms/:id/${control}`, (req, res) => {
    const row = load(req.params.id),
      p = auth(row, getKey(req));
    const revision = row.room.game?.revision ?? row.room.revision;
    if (req.body.revision !== revision)
      return res.status(409).json({
        error: "The table changed. Your view has been refreshed.",
        ...publicRoom(row, p),
      });
    if (control === "history") {
      assertClockOpen(row.room);
      settleClock(row.room);
      travelHistory(row.room, p, req.body.direction);
      followClock(row.room);
    } else {
      changeClock(row.room, p, req.body);
      if (row.room.game) row.room.game.revision++;
    }
    persistAction(row, p, { control, ...req.body });
    res.json(publicRoom(row, p));
    broadcast(row.id);
    if (row.room.practice) scheduleBot(row.id);
  });
app.get("/api/rooms/:id/export", (req, res) => {
  const row = load(req.params.id),
    p = auth(row, getKey(req));
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="arcs-${row.id}-journal.json"`,
  );
  res.json({ game: publicRoom(row, p), exportedAt: new Date().toISOString() });
});
app.use(
  "/assets",
  express.static(path.join(root, "public/assets"), {
    maxAge: "7d",
    immutable: true,
  }),
);
if (existsSync(path.join(root, "dist"))) {
  app.use(express.static(path.join(root, "dist"), { maxAge: "1h" }));
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.join(root, "dist/index.html")),
  );
}
app.use((err, req, res, next) => {
  if (!(err instanceof RuleError) && !err.status) console.error(err);
  res.status(err instanceof RuleError ? 400 : (err.status ?? 500)).json({
    error:
      err instanceof RuleError || err.status
        ? err.message
        : "The action could not be completed. Your saved game is unchanged.",
  });
});
const server = app.listen(Number(process.env.PORT ?? 3001), "0.0.0.0", () =>
  console.log(`Arcs listening on ${process.env.PORT ?? 3001}`),
);
const wss = new WebSocketServer({ server, path: "/socket", maxPayload: 2048 });
wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));
  let registered = false;
  const timer = setTimeout(() => {
    if (!registered) ws.close(1008, "Authenticate first");
  }, 5000);
  ws.on("message", (data) => {
    if (registered) return;
    try {
      const { id, key } = JSON.parse(data.toString()),
        row = load(id),
        p = auth(row, key);
      registered = true;
      clearTimeout(timer);
      const list = connections.get(id) ?? [];
      list.push({ p, ws });
      connections.set(id, list);
      broadcast(id);
      ws.on("close", () => {
        connections.set(
          id,
          (connections.get(id) ?? []).filter((c) => c.ws !== ws),
        );
        broadcast(id);
      });
    } catch {
      ws.close(1008, "Invalid seat key");
    }
  });
});
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    if (ws.readyState === 1) ws.ping();
  }
  for (const [k, v] of limit)
    if (Date.now() - v.start > 120000) limit.delete(k);
}, 30000).unref();
// Scan persisted clocks even with no connected browsers. Restarting the server
// must not cancel a timeout or restart the player's allowance.
const timedRoomFilter = `json_extract(data, '$.status') = 'playing'
      AND json_extract(data, '$.clock.config.expiry') = 'auto'
      AND json_extract(data, '$.clock.config.mode') != 'off'
      AND json_extract(data, '$.clock.paused') = 0`;
// Avoid reparsing every untimed room's saved history on each clock tick.
db.exec(
  `CREATE INDEX IF NOT EXISTS automatic_timer_rooms ON rooms(id) WHERE ${timedRoomFilter}`,
);
const timedRoomIds = db.prepare(
  `SELECT id FROM rooms WHERE ${timedRoomFilter}`,
);
const timeoutTimer = setInterval(() => {
  const rows = timedRoomIds.all();
  for (const { id } of rows) {
    const row = load(id);
    try {
      const result = resolveTimeout(row.room);
      if (!result) continue;
      persistAction(row, result.actor, result.input);
      broadcast(id);
      if (row.room.practice) scheduleBot(id);
    } catch (e) {
      // Keep the last saved state and expose a recoverable stop, not a retry loop.
      const saved = load(id);
      saved.room.clock.paused = true;
      addNotice(
        saved.room,
        "Automatic play could not resolve this decision. The table is paused; the host can add time and resume for a manual choice.",
        saved.room.clock.actor,
      );
      save(saved);
      broadcast(id);
      console.error("Timed-out turn paused:", id, e.message);
    }
  }
}, 750);
timeoutTimer.unref();
const botTimers = new Map();
function scheduleBot(id) {
  if (botTimers.has(id)) return;
  botTimers.set(
    id,
    setTimeout(() => {
      botTimers.delete(id);
      try {
        const row = load(id),
          s = row.room.game;
        if (!s || s.phase === "over") return;
        const p = s.pending[0]?.p ?? s.current;
        if (!row.room.seats[p]?.bot) return;
        const input = autoInput(s);
        if (clockView(row.room).blocked) return;
        settleClock(row.room);
        applyDecision(row.room, p, input);
        followClock(row.room);
        persistAction(row, p, input);
        broadcast(id);
        scheduleBot(id);
      } catch (e) {
        console.error("Practice rival stopped:", e.message);
      }
    }, 450),
  );
}
process.on("SIGTERM", () => {
  clearInterval(timeoutTimer);
  for (const ws of wss.clients) ws.close(1001, "Server restarting");
  server.close(() => {
    db.close();
    process.exit(0);
  });
});
