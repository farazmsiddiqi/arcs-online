import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { WebSocket } from "ws";
import { DatabaseSync } from "node:sqlite";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
// A real server process on a free port with its own data directory. `start`
// and `stop` can be repeated to restart it on the same data.
async function launch(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "arcs-test-"));
  const probe = net.createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const base = `http://127.0.0.1:${port}`;
  let child,
    logs = "";
  const start = async () => {
    child = spawn(process.execPath, ["server/index.js"], {
      env: { ...process.env, PORT: String(port), DATA_DIR: dir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d) => (logs += d));
    child.stderr.on("data", (d) => (logs += d));
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + "/api/health")).ok) return;
      } catch {}
      await delay(30);
    }
    throw new Error(logs);
  };
  const stop = async () => {
    if (child.exitCode === null) {
      const exited = new Promise((r) => child.once("exit", r));
      child.kill("SIGTERM");
      await exited;
    }
  };
  t.after(async () => {
    await stop();
    await rm(dir, { recursive: true, force: true });
  });
  const req = async (url, method = "GET", body, key, headers = {}) => {
    const response = await fetch(base + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  return { port, dir, start, stop, req };
}
test("real HTTP/WebSocket server: authorization, invite-only seats, atomic revisions, privacy, persistence", async (t) => {
  const { port, start, stop, req } = await launch(t);
  await start();
  const created = await req("/api/rooms", "POST", { name: "Host", players: 2 });
  assert.equal(created.status, 201);
  const { id, key, invite } = created.data;
  const root = `/api/rooms/${id}`;
  await t.test("no private state without a seat credential", async () => {
    assert.equal((await req(root)).status, 403);
    assert.equal((await req(root, "GET", null, "wrong")).status, 403);
    assert.equal(
      (await req(root + "/join", "POST", { name: "Thief", invite: "wrong" }))
        .status,
      403,
    );
  });
  await t.test("duplicate names are rejected", async () => {
    for (const name of ["Host", " host "]) {
      const dup = await req(root + "/join", "POST", { name, invite });
      assert.equal(dup.status, 409);
    }
  });
  const guest = await req(root + "/join", "POST", { name: "Friend", invite });
  assert.equal(guest.status, 200);
  const guestKey = guest.data.key;
  await t.test(
    "only host can start and seats cannot be overfilled",
    async () => {
      assert.equal(
        (await req(root + "/start", "POST", {}, guestKey)).status,
        403,
      );
      assert.equal(
        (await req(root + "/join", "POST", { name: "Extra", invite })).status,
        409,
      );
    },
  );
  let state = await req(root + "/start", "POST", {}, key);
  assert.equal(state.status, 200);
  assert.equal(state.data.game.players[0].hand.length, 6);
  assert.equal(typeof state.data.game.players[1].hand, "number");
  assert.equal(state.data.game.rng, undefined);
  await t.test(
    "cross-origin mutations and malformed origin rejected",
    async () => {
      assert.equal(
        (
          await req(root + "/action", "POST", {}, key, {
            Origin: "https://unrelated.example",
          })
        ).status,
        403,
      );
      assert.equal(
        (await req(root + "/action", "POST", {}, key, { Origin: "::bad" }))
          .status,
        403,
      );
    },
  );
  await t.test(
    "resource tray endpoint validates tokens and revision, commits once, and supports Undo",
    async () => {
      // Reach a real gain window by playing through ordinary legal turns.
      for (let n = 0; n < 80; n++) {
        const owner = state.data.game.decision.actor,
          credential = owner === 0 ? key : guestKey;
        const v = (await req(root, "GET", null, credential)).data.game;
        if (v.resourceArrangement) break;
        const cs = v.decision.choices;
        const c =
          cs.find((c) => c.op === "skip") ??
          cs.find(
            (c) => c.op === "play" && c.card.startsWith("administration"),
          ) ??
          cs.find((c) => c.op === "play") ??
          cs.find((c) => c.op === "endPrelude") ??
          cs.find(
            (c) => c.op === "action" && c.action === "tax" && c.cost === "pip",
          ) ??
          cs.find((c) => c.op === "taxTarget") ??
          cs.find((c) => c.op === "endTurn") ??
          cs[0];
        assert.ok(c);
        const result = await req(
          root + "/action",
          "POST",
          { revision: v.revision, choice: c.id },
          credential,
        );
        assert.equal(result.status, 200);
        state = result;
      }
      const owner = state.data.game.decision.actor,
        credential = owner === 0 ? key : guestKey;
      const view = (await req(root, "GET", null, credential)).data;
      assert.ok(view.game.resourceArrangement);
      const order = [...view.game.players[owner].resources].reverse(),
        revision = view.game.revision;
      const invalid = await req(
        root + "/action",
        "POST",
        { revision, resourceArrangement: [] },
        credential,
      );
      assert.equal(invalid.status, 400);
      assert.equal(
        (await req(root, "GET", null, credential)).data.game.revision,
        revision,
      );
      const result = await req(
        root + "/action",
        "POST",
        { revision, resourceArrangement: order },
        credential,
      );
      assert.equal(result.status, 200);
      assert.deepEqual(result.data.game.players[owner].resources, order);
      const stale = await req(
        root + "/action",
        "POST",
        { revision, resourceArrangement: order },
        credential,
      );
      assert.equal(stale.status, 409);
      const undo = await req(
        root + "/history",
        "POST",
        { revision: result.data.game.revision, direction: "undo" },
        credential,
      );
      assert.equal(undo.status, 200);
      assert.deepEqual(
        undo.data.game.players[owner].resources,
        view.game.players[owner].resources,
      );
      assert.ok(undo.data.game.resourceArrangement);
      state = await req(root, "GET", null, key);
    },
  );
  const initialRevision = state.data.game.revision;
  const actor = state.data.game.decision.actor;
  const actorKey = actor === 0 ? key : guestKey;
  const actorView = (await req(root, "GET", null, actorKey)).data;
  const choice =
    actorView.game.decision.choices.find((c) => c.op === "skip") ??
    actorView.game.decision.choices[0];
  const ws = new WebSocket(`ws://127.0.0.1:${port}/socket`);
  const messages = [];
  ws.on("message", (d) => messages.push(JSON.parse(d)));
  await new Promise((r) => ws.once("open", r));
  ws.send(JSON.stringify({ id, key: guestKey }));
  for (let i = 0; i < 50 && !messages.length; i++) await delay(20);
  assert.ok(messages.length);
  assert.equal(typeof messages[0].game.players[0].hand, "number");
  await t.test(
    "one accepted command broadcasts and stale retry cannot apply twice",
    async () => {
      const body = { revision: initialRevision, choice: choice.id };
      const success = await req(root + "/action", "POST", body, actorKey);
      assert.equal(success.status, 200);
      state = success;
      assert.equal(
        (await req(root + "/action", "POST", body, actorKey)).status,
        409,
      );
      for (
        let i = 0;
        i < 50 &&
        !messages.some((m) => m.game.revision === initialRevision + 1);
        i++
      )
        await delay(20);
      assert.ok(messages.some((m) => m.game.revision === initialRevision + 1));
    },
  );
  await t.test(
    "forged choices are rejected without changing saved state",
    async () => {
      const a = state.data.game.decision.actor;
      const correct = a === 0 ? key : guestKey;
      const before = (await req(root, "GET", null, correct)).data.game;
      assert.equal(
        (
          await req(
            root + "/action",
            "POST",
            { revision: before.revision, choice: 9999 },
            correct,
          )
        ).status,
        400,
      );
      assert.equal(
        (await req(root, "GET", null, correct)).data.game.revision,
        before.revision,
      );
    },
  );
  await t.test(
    "undo/redo routes enforce ownership, monotonic revisions, privacy and persisted clocks",
    async () => {
      let turnKey = key;
      let v = (await req(root, "GET", null, turnKey)).data;
      for (let n = 0; n < 8; n++) {
        turnKey = v.game.decision.actor === 0 ? key : guestKey;
        v = (await req(root, "GET", null, turnKey)).data;
        if (v.history.canUndo) break;
        const c =
          v.game.decision.choices.find((c) => c.op === "skip") ??
          v.game.decision.choices.find((c) => c.op === "play");
        assert.ok(c);
        v = (
          await req(
            root + "/action",
            "POST",
            { revision: v.game.revision, choice: c.id },
            turnKey,
          )
        ).data;
      }

      assert.equal(v.history.canUndo, true);
      const rivalKey = turnKey === key ? guestKey : key;
      assert.equal(
        (
          await req(
            root + "/history",
            "POST",
            { revision: v.game.revision, direction: "undo" },
            rivalKey,
          )
        ).status,
        400,
      );
      const beforeGame = v.game;
      v = (
        await req(
          root + "/history",
          "POST",
          { revision: v.game.revision, direction: "undo" },
          turnKey,
        )
      ).data;
      assert.equal(v.game.revision, beforeGame.revision + 1);
      assert.equal(v.history.canRedo, true);
      const stale = await req(
        root + "/history",
        "POST",
        { revision: beforeGame.revision, direction: "redo" },
        turnKey,
      );
      assert.equal(stale.status, 409);
      v = (
        await req(
          root + "/history",
          "POST",
          { revision: v.game.revision, direction: "redo" },
          turnKey,
        )
      ).data;
      assert.deepEqual(v.game.pieces, beforeGame.pieces);
      assert.deepEqual(v.game.turn, beforeGame.turn);
      assert.ok(!JSON.stringify(v.history).includes("courtDeck"));
      assert.equal(
        (
          await req(
            root + "/timer",
            "POST",
            { revision: v.game.revision, operation: "pause" },
            guestKey,
          )
        ).status,
        403,
      );
      v = (
        await req(
          root + "/timer",
          "POST",
          {
            revision: v.game.revision,
            operation: "configure",
            config: { mode: "live", turn: 300, expiry: "pause" },
          },
          key,
        )
      ).data;
      // The pre-bank `seconds` setting is still accepted, as the turn limit.
      assert.equal(v.clock.config.turn, 300);
      assert.equal(v.clock.config.bank, 0);
      v = (
        await req(
          root + "/timer",
          "POST",
          { revision: v.game.revision, operation: "pause" },
          key,
        )
      ).data;
      assert.equal(v.clock.blocked, true);
      assert.equal(
        (
          await req(
            root + "/history",
            "POST",
            { revision: v.game.revision, direction: "undo" },
            turnKey,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await req(
            root + "/action",
            "POST",
            { revision: v.game.revision, choice: 0 },
            turnKey,
          )
        ).status,
        400,
      );
      state = { data: v };
    },
  );
  ws.close();
  await new Promise((r) => ws.once("close", r));
  const before = (await req(root, "GET", null, key)).data;
  await stop();
  await start();
  await t.test(
    "server restart preserves board, private hand, revision and invite membership",
    async () => {
      const after = (await req(root, "GET", null, key)).data;
      assert.deepEqual(after.game, before.game);
      assert.deepEqual(after.history, before.history);
      assert.deepEqual(after.clock.spent, before.clock.spent);
      assert.equal(after.clock.paused, true);
      assert.equal(after.seats.length, 2);
      assert.equal(
        (await req(root + "/export", "GET", null, guestKey)).data.game.me,
        1,
      );
    },
  );
});
// Opens a socket and sends the seat credentials; `messages` collects every
// room view the server pushes.
async function connect(port, id, key) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/socket`);
  const messages = [];
  ws.on("message", (d) => messages.push(JSON.parse(d)));
  await new Promise((r) => ws.once("open", r));
  ws.send(JSON.stringify({ id, key }));
  return { ws, messages };
}
async function until(read, what, ms = 3000) {
  for (let i = 0; i < ms / 20; i++) {
    const value = read();
    if (value) return value;
    await delay(20);
  }
  throw new Error(`Timed out waiting for ${what}`);
}
const closed = (ws) => new Promise((r) => ws.once("close", (code) => r(code)));
const brief = (v) => ({
  revision: v.game.revision,
  actor: v.game.decision.actor,
  title: v.game.decision.title,
  choices: v.game.decision.choices.length,
});
test("reconnecting mid-decision restores the same decision, and a host extension reaches the returning seat", async (t) => {
  const { port, start, req } = await launch(t);
  await start();
  const { data: created } = await req("/api/rooms", "POST", {
    name: "Host",
    players: 2,
  });
  const { id, key: hostKey, invite } = created;
  const root = `/api/rooms/${id}`;
  const guestKey = (
    await req(root + "/join", "POST", { name: "Friend", invite })
  ).data.key;
  await req(root + "/start", "POST", {}, hostKey);
  const view = async (credential) =>
    (await req(root, "GET", null, credential)).data;
  const post = async (url, body, credential) =>
    req(root + url, "POST", body, credential);
  // A 5-minute live clock, so the host has a clock to extend.
  let v = await view(hostKey);
  assert.equal(
    (
      await post(
        "/timer",
        {
          revision: v.game.revision,
          operation: "configure",
          config: { mode: "live", turn: 300, expiry: "pause" },
        },
        hostKey,
      )
    ).status,
    200,
  );
  // Play ordinary legal moves until the guest (seat A) is mid-decision: a card
  // played and an action chosen, so a target prompt is open.
  const guest = 1;
  const credentials = [hostKey, guestKey];
  for (let n = 0; n < 40; n++) {
    const actor = (await view(hostKey)).game.decision.actor;
    v = await view(credentials[actor]);
    const d = v.game.decision;
    if (actor === guest && /choose a target/.test(d.title)) break;
    const pick =
      d.choices.find(
        (c) => actor === guest && c.op === "action" && c.cost === "pip",
      ) ??
      d.choices.find((c) => c.op === "play") ??
      d.choices.find((c) => c.op === "endTurn") ??
      d.choices.find((c) => c.op === "skip") ??
      d.choices[0];
    const r = await post(
      "/action",
      { revision: v.game.revision, choice: pick.id },
      credentials[actor],
    );
    assert.equal(r.status, 200);
  }
  v = await view(guestKey);
  const decision = brief(v);
  assert.equal(decision.actor, guest, "seat A has a decision pending");
  assert.match(decision.title, /choose a target/);
  assert.ok(decision.choices > 0);
  const host = await connect(port, id, hostKey);
  const first = await connect(port, id, guestKey);
  await until(() => first.messages.length, "the guest's first view");
  await until(
    () => host.messages.at(-1)?.seats[guest].connected,
    "the host seeing the guest online",
  );
  assert.deepEqual(brief(first.messages[0]), decision);

  // The guest's socket drops. Nothing about the table changes, and the host
  // still cannot act for them.
  first.ws.close();
  await until(
    () => host.messages.at(-1).seats[guest].connected === false,
    "the guest shown offline",
  );
  const offline = host.messages.at(-1);
  assert.equal(offline.game.revision, decision.revision);
  const forged = await post(
    "/action",
    { revision: decision.revision, choice: 0 },
    hostKey,
  );
  assert.equal(forged.status, 400);
  assert.deepEqual(brief(await view(guestKey)), decision);

  // Coming back: the first message is the whole per-seat view, unchanged.
  const back = await connect(port, id, guestKey);
  await until(() => back.messages.length, "the returning view");
  assert.deepEqual(brief(back.messages[0]), decision);
  assert.equal(back.messages[0].me, guest);
  assert.deepEqual(back.messages[0].game.decision, v.game.decision);
  await until(
    () => host.messages.at(-1).seats[guest].connected === true,
    "the guest shown online again",
  );

  // Offline again, the host adds time to the guest's clock. The change is a
  // new timer revision, and the returning seat sees it with the same decision.
  back.ws.close();
  await until(
    () => host.messages.at(-1).seats[guest].connected === false,
    "the guest offline again",
  );
  const extended = await post(
    "/timer",
    { revision: decision.revision, operation: "extend", seconds: 120 },
    hostKey,
  );
  assert.equal(extended.status, 200);
  assert.equal(extended.data.game.revision, decision.revision);
  assert.equal(extended.data.clock.revision, 2);
  const returned = await connect(port, id, guestKey);
  await until(() => returned.messages.length, "the view after the extension");
  const after = returned.messages[0];
  assert.equal(after.game.revision, decision.revision);
  assert.equal(after.game.decision.title, decision.title);
  assert.equal(after.game.decision.choices.length, decision.choices);
  assert.equal(after.clock.bonus[guest], 120000, "the guest's clock grew");
  // The guest's already displayed decision is still valid after a timer change.
  const move = await post(
    "/action",
    {
      revision: after.game.revision,
      choice: after.game.decision.choices[0].id,
    },
    guestKey,
  );
  assert.equal(move.status, 200);
  for (const c of [host, returned]) c.ws.close();
});
test("a socket that never authenticates, or sends a bad key, is closed", async (t) => {
  const { port, start, req } = await launch(t);
  await start();
  const { data: created } = await req("/api/rooms", "POST", {
    name: "Host",
    players: 2,
  });
  const silent = new WebSocket(`ws://127.0.0.1:${port}/socket`);
  t.after(() => silent.terminate());
  const silentClosed = closed(silent);
  const wrong = await connect(port, created.id, "wrong");
  assert.equal(await closed(wrong.ws), 1008);
  assert.equal(wrong.messages.length, 0);
  const started = Date.now();
  const code = await Promise.race([silentClosed, delay(6000).then(() => null)]);
  assert.equal(code, 1008, "closed within 6 s");
  assert.ok(Date.now() - started >= 4000, "after the 5 s grace period");
});

test("old persisted tables reconnect and save without losing cards or turn timers", async (t) => {
  const { dir, start, stop, req } = await launch(t);
  await start();
  const created = (
    await req("/api/rooms", "POST", { name: "Legacy host", players: 2 })
  ).data;
  const root = `/api/rooms/${created.id}`;
  const guest = (
    await req(root + "/join", "POST", {
      name: "Legacy guest",
      invite: created.invite,
    })
  ).data;
  await req(root + "/start", "POST", {}, created.key);
  await stop();
  const db = new DatabaseSync(path.join(dir, "arcs.sqlite"));
  const row = db.prepare("SELECT data FROM rooms WHERE id=?").get(created.id);
  const r = JSON.parse(row.data);
  r.game.discard = [
    ...r.game.discardDown,
    ...r.game.discardUp.map((x) => x.card),
  ];
  delete r.game.discardDown;
  delete r.game.discardUp;
  delete r.game.battles;
  delete r.saveVersion;
  const before = structuredClone(r.game);
  r.options.timer = { mode: "live", seconds: 60, expiry: "auto" };
  r.clock.config = { ...r.options.timer };
  r.clock.paused = true;
  r.clock.spent = [10000, 20000];
  db.prepare("UPDATE rooms SET data=? WHERE id=?").run(
    JSON.stringify(r),
    created.id,
  );
  db.close();
  await start();
  const backup = new DatabaseSync(
    path.join(dir, "backups/before-save-v1.sqlite"),
  );
  const preserved = JSON.parse(
    backup.prepare("SELECT data FROM rooms WHERE id=?").get(created.id).data,
  );
  backup.close();
  assert.deepEqual(preserved.game.discard, before.discard);
  assert.deepEqual(preserved.game.players, before.players);
  const restored = await req(root, "GET", null, created.key);
  assert.equal(restored.status, 200);
  assert.deepEqual(restored.data.game.players[0].hand, before.players[0].hand);
  assert.equal(
    restored.data.game.players[1].hand,
    before.players[1].hand.length,
  );
  assert.deepEqual(restored.data.game.pieces, before.pieces);
  assert.equal(restored.data.game.discardDownCount, before.discard.length);
  assert.deepEqual(restored.data.game.discardUp, []);
  assert.equal(restored.data.clock.config.turn, 60);
  assert.equal(
    restored.data.clock.remainingMs,
    60000 - r.clock.spent[r.clock.actor],
  );
  assert.equal(restored.data.clock.paused, true);
  const saved = await req(
    root + "/timer",
    "POST",
    { revision: restored.data.game.revision, operation: "pause" },
    created.key,
  );
  assert.equal(saved.status, 200);
  const check = new DatabaseSync(path.join(dir, "arcs.sqlite"));
  const stored = JSON.parse(
    check.prepare("SELECT data FROM rooms WHERE id=?").get(created.id).data,
  );
  check.close();
  assert.equal(stored.saveVersion, 1);
  assert.deepEqual(stored.game.discardDown, before.discard);
  assert.equal(stored.game.discard, undefined);
  assert.equal((await req(root, "GET", null, guest.key)).status, 200);
});

test("timer controls have independent revisions, preserve gameplay, and persist across redeploys", async (t) => {
  const { start, stop, req } = await launch(t);
  await start();
  const host = (await req("/api/rooms", "POST", { name: "Host", players: 2 }))
    .data;
  const root = `/api/rooms/${host.id}`;
  const guest = (
    await req(root + "/join", "POST", { name: "Guest", invite: host.invite })
  ).data;
  let v = (await req(root, "GET", null, host.key)).data;
  let reply = await req(
    root + "/timer",
    "POST",
    { operation: "restart", clockRevision: 0 },
    host.key,
  );
  assert.equal(reply.status, 200);
  assert.equal(reply.data.game, null);
  assert.equal(reply.data.clock.config.turn, 300);
  assert.equal(reply.data.clock.actor, null);
  v = (await req(root + "/start", "POST", {}, host.key)).data;
  const before = structuredClone(v.game);
  const history = structuredClone(v.history);
  reply = await req(
    root + "/timer",
    "POST",
    { operation: "remove", revision: -100, clockRevision: v.clock.revision },
    host.key,
  );
  assert.equal(
    reply.status,
    200,
    "stale game revision does not block clock controls",
  );
  assert.deepEqual(reply.data.game, before);
  assert.deepEqual(reply.data.history, history);
  assert.equal(reply.data.clock.config.mode, "off");
  const oldClock = v.clock.revision;
  v = reply.data;
  assert.equal(
    (
      await req(
        root + "/timer",
        "POST",
        { operation: "restart", clockRevision: oldClock },
        host.key,
      )
    ).status,
    409,
  );
  assert.equal(
    (await req(root + "/timer", "POST", { operation: "restart" }, guest.key))
      .status,
    403,
  );
  reply = await req(
    root + "/timer",
    "POST",
    { operation: "restart", clockRevision: v.clock.revision },
    host.key,
  );
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.data.game, before);
  assert.ok(reply.data.clock.remainingMs > 299000);
  v = reply.data;
  await stop();
  await start();
  reply = await req(root, "GET", null, host.key);
  assert.deepEqual(reply.data.game, before);
  assert.equal(reply.data.clock.revision, v.clock.revision);
  assert.equal(reply.data.clock.config.mode, "live");
  assert.ok(reply.data.clock.remainingMs <= v.clock.remainingMs);
});

test("replay reads are authenticated, public, immutable, and survive a server restart", async (t) => {
  const { start, stop, req } = await launch(t);
  await start();
  const {
    data: { id, key, invite },
  } = await req("/api/rooms", "POST", { name: "Replay host", players: 2 });
  const root = `/api/rooms/${id}`;
  const {
    data: { key: guestKey },
  } = await req(root + "/join", "POST", { name: "Replay guest", invite });
  const initial = await req(root + "/start", "POST", {}, key);
  assert.equal(initial.status, 200);
  assert.equal((await req(root + "/replay")).status, 403);
  assert.equal(
    (await req(root + "/replay/0", "GET", null, "invalid")).status,
    403,
  );
  const before = (await req(root, "GET", null, key)).data;
  const archive = (await req(root + "/replay", "GET", null, key)).data;
  assert.equal(archive.count, 1);
  const endpoint = root + `/replay/${archive.first}`;
  const host = (await req(endpoint, "GET", null, key)).data;
  const guest = (await req(endpoint, "GET", null, guestKey)).data;
  assert.deepEqual(host, guest);
  assert.ok(host.game.players.every((p) => typeof p.hand === "number"));
  assert.equal(host.game.decision, undefined);
  for (const invalid of ["-2", "1.5", "NaN"])
    assert.equal(
      (await req(root + "/replay/" + invalid, "GET", null, key)).status,
      400,
    );
  assert.equal(
    (await req(root + "/replay/999999", "GET", null, key)).status,
    404,
  );
  assert.equal(
    (await req(root + "/replay?after=garbage", "GET", null, key)).status,
    400,
  );
  assert.deepEqual((await req(root, "GET", null, key)).data.game, before.game);
  for (let i = 0; i < 8; i++) {
    const state = (await req(root, "GET", null, key)).data.game;
    const actorKey = state.decision.actor === 0 ? key : guestKey;
    const actor = (await req(root, "GET", null, actorKey)).data.game;
    const choice =
      actor.decision.choices.find((c) => c.op === "play") ??
      actor.decision.choices[0];
    const next = await req(
      root + "/action",
      "POST",
      { revision: actor.revision, choice: choice.id },
      actorKey,
    );
    assert.equal(next.status, 200);
    if ((await req(root + "/replay", "GET", null, key)).data.count > 1) break;
  }
  const manifest = (await req(root + "/replay", "GET", null, key)).data;
  assert.ok(manifest.count >= 2);
  assert.deepEqual(
    (await req(endpoint, "GET", null, key)).data,
    host,
    "old frame must not follow live play",
  );
  const saved = (await req(root, "GET", null, key)).data.game;
  await stop();
  await start();
  assert.deepEqual(
    (await req(root + "/replay", "GET", null, guestKey)).data,
    manifest,
  );
  assert.deepEqual((await req(root, "GET", null, key)).data.game, saved);
});
