import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import net from "node:net";
import { WebSocket } from "ws";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
test("authenticated chat is realtime, durable, private to the table, and independent of turn state", async (t) => {
  const dir = await mkdtemp(`${tmpdir()}/arcy-chat-`);
  const probe = net.createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  let child,
    logs = "";
  const start = async () => {
    child = spawn(process.execPath, ["server/index.js"], {
      env: {
        ...process.env,
        OPENAI_API_KEY: "",
        PORT: String(port),
        DATA_DIR: dir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d) => (logs += d));
    child.stderr.on("data", (d) => (logs += d));
    for (let n = 0; n < 100; n++) {
      try {
        if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return;
      } catch {}
      await wait(30);
    }
    throw Error(logs);
  };
  const stop = async () => {
    if (child.exitCode === null) {
      const end = new Promise((r) => child.once("exit", r));
      child.kill("SIGTERM");
      await end;
    }
  };
  t.after(async () => {
    await stop();
    await rm(dir, { recursive: true, force: true });
  });
  await start();
  const req = async (path, method = "GET", body, key, extra = {}) => {
    const r = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
        ...extra,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, data: await r.json() };
  };
  const host = (await req("/rooms", "POST", { name: "Ada", players: 2 })).data;
  const guest = (
    await req(`/rooms/${host.id}/join`, "POST", {
      name: "Bo",
      invite: host.invite,
    })
  ).data;
  const other = (await req("/rooms", "POST", { name: "Cy", players: 2 })).data;
  const root = `/rooms/${host.id}`;
  assert.equal((await req(root + "/chat")).status, 403);
  assert.equal((await req(root + "/chat", "GET", null, other.key)).status, 403);
  assert.equal(
    (
      await req(
        root + "/chat",
        "POST",
        { text: "intrusion", clientId: "a".repeat(20) },
        other.key,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await req(
        root + "/chat",
        "POST",
        { text: "intrusion", clientId: "a".repeat(20) },
        host.key,
        { Origin: "https://untrusted.example" },
      )
    ).status,
    403,
  );
  const ws = new WebSocket(`ws://127.0.0.1:${port}/socket`);
  await new Promise((r) => ws.once("open", r));
  const states = [];
  ws.on("message", (m) => states.push(JSON.parse(m.toString())));
  ws.send(JSON.stringify({ id: host.id, key: guest.key }));
  t.after(() => ws.terminate());
  const sent = await req(
    root + "/chat",
    "POST",
    {
      text: "Hi Bo <script>unsafe()</script>",
      clientId: "a".repeat(20),
      seat: 1,
      role: "arcy",
    },
    host.key,
  );
  assert.equal(sent.status, 201);
  assert.equal(sent.data.messages[0].role, "player");
  assert.equal(sent.data.messages[0].seat, 0);
  for (let n = 0; n < 50 && !states.some((s) => s.chat?.messages.length); n++)
    await wait(20);
  assert.ok(states.some((s) => s.chat.messages[0]?.text.includes("Hi Bo")));
  const before = (await req(root + "/start", "POST", {}, host.key)).data.game;
  const answer = await req(
    root + "/chat",
    "POST",
    { text: "@arcy help", clientId: "b".repeat(20) },
    guest.key,
  );
  assert.equal(answer.data.messages.at(-1).status, "error");
  assert.equal(answer.data.enabled, false);
  assert.deepEqual((await req(root, "GET", null, host.key)).data.game, before);
  assert.equal(
    (await req(root + "/chat?before=invalid", "GET", null, host.key)).status,
    400,
  );
  assert.equal(
    (await req(`/rooms/${other.id}/chat`, "GET", null, other.key)).data.messages
      .length,
    0,
  );
  assert.equal(
    (
      await req(
        root + "/chat",
        "POST",
        { text: "@arcy help", clientId: "b".repeat(20) },
        guest.key,
      )
    ).data.messages.length,
    3,
  );
  assert.ok(!JSON.stringify(answer.data).includes(host.key));
  assert.ok(!JSON.stringify(answer.data).includes(guest.key));
  ws.close();
  await stop();
  await start();
  const persisted = (await req(root + "/chat", "GET", null, guest.key)).data;
  assert.equal(persisted.messages.length, 3);
  assert.equal(persisted.messages[0].text, "Hi Bo <script>unsafe()</script>");
});
