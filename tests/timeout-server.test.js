import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { createGame, decision, transition } from "../game/engine.js";
import { initClock } from "../server/clock.js";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
test("persisted timeout runs without browsers, journals automatic moves, and stops at the next turn", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "arcs-timeout-"));
  const db = new DatabaseSync(path.join(dir, "arcs.sqlite"));
  db.exec(
    "CREATE TABLE rooms(id TEXT PRIMARY KEY, invite_hash TEXT NOT NULL, host_hash TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL)",
  );
  let game = createGame(["A", "B"], { initiative: 0 }, 37);
  while (game.pending.length)
    game = transition(game, game.pending[0].p, {
      choice: decision(game, game.pending[0].p).choices.find(
        (c) => c.op === "skip",
      ).id,
    });
  const hash = createHash("sha256").update("test-seat").digest("hex");
  const room = {
    game,
    revision: 0,
    status: "playing",
    capacity: 2,
    seats: [
      { name: "A", keyHash: hash },
      { name: "B", keyHash: "unused" },
    ],
    options: { timer: { mode: "live", turn: 60, expiry: "auto" } },
  };
  initClock(room, Date.now() - 61000);
  for (const [id, expiry] of [
    ["AUTO", "auto"],
    ["OVERTIME", "overtime"],
    ["PAUSE", "pause"],
  ]) {
    const copy = structuredClone(room);
    copy.clock.config.expiry = expiry;
    db.prepare("INSERT INTO rooms VALUES(?,?,?,?,?)").run(
      id,
      hash,
      hash,
      JSON.stringify(copy),
      Date.now(),
    );
  }
  const probe = net.createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  let child,
    output = "";
  const stop = async () => {
    if (child?.exitCode === null) {
      const done = new Promise((r) => child.once("exit", r));
      child.kill("SIGTERM");
      await done;
    }
  };
  const start = async () => {
    child = spawn(process.execPath, ["server/index.js"], {
      env: { ...process.env, PORT: String(port), DATA_DIR: dir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    for (let i = 0; i < 100; i++) {
      if (output.includes("Arcs listening")) return;
      await delay(25);
    }
    throw new Error(output);
  };
  t.after(async () => {
    await stop();
    db.close();
    await rm(dir, { recursive: true, force: true });
  });
  const saved = (id) =>
    JSON.parse(db.prepare("SELECT data FROM rooms WHERE id=?").get(id).data);
  await start();
  // No page, socket or GET request drives this timer.
  for (let i = 0; i < 100 && saved("AUTO").game.revision === game.revision; i++)
    await delay(50);
  assert.ok(saved("AUTO").game.revision > game.revision, output);
  await stop();
  output = "";
  await start(); // Finish an already-started automatic turn after a restart.
  for (let i = 0; i < 400 && saved("AUTO").clock.key === room.clock.key; i++)
    await delay(50);
  const after = saved("AUTO");
  assert.notEqual(after.clock.key, room.clock.key, output);
  assert.deepEqual(after.clock.spent, [0, 0]);
  const rev = after.game.revision;
  await delay(1600);
  assert.equal(saved("AUTO").game.revision, rev);
  for (const id of ["OVERTIME", "PAUSE"])
    assert.deepEqual(saved(id).game, game);
  assert.ok(
    db
      .prepare("SELECT action FROM events WHERE room='AUTO'")
      .all()
      .every((e) => JSON.parse(e.action).automatic === "timer"),
  );
  const response = await fetch(`http://127.0.0.1:${port}/api/rooms/AUTO`, {
    headers: { Authorization: "Bearer test-seat" },
  });
  const view = await response.json();
  assert.equal(typeof view.game.players[1].hand, "number");
  assert.equal(view.game.rng, undefined);
  assert.equal(view.history.canUndo, false);
  assert.ok(!output.includes("Timed-out turn paused"), output);
});
