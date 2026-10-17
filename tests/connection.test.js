import test from "node:test";
import assert from "node:assert/strict";
import {
  requestJSON,
  subscribeRoom,
  reconnectDelay,
} from "../src/connection.js";
test("deployment HTML/502 and transport errors are transient; writes are not replayed", async () => {
  let calls = 0;
  for (const fetcher of [
    async () => {
      calls++;
      return new Response("<html>Bad gateway</html>", { status: 502 });
    },
    async () => {
      calls++;
      throw Error("network");
    },
  ]) {
    await assert.rejects(
      requestJSON("/action", { method: "POST", body: { choice: 1 }, fetcher }),
      (e) => e.transient && /check/i.test(e.message),
    );
  }
  assert.equal(calls, 2);
  await assert.rejects(
    requestJSON("/room", {
      fetcher: async () =>
        new Response(JSON.stringify({ error: "Invalid seat" }), {
          status: 403,
        }),
    }),
    (e) => !e.transient && e.status === 403 && e.message === "Invalid seat",
  );
});
test("room subscription keeps the board through restart, rejects old reads, reconnects and cleans up", async () => {
  const tasks = new Map(),
    sockets = [],
    states = [],
    connected = [],
    errors = [],
    reads = [];
  let next = 0;
  class Socket {
    readyState = 0;
    constructor() {
      sockets.push(this);
    }
    send() {}
    close() {
      this.readyState = 3;
      this.onclose?.({ code: 1006 });
    }
    receive(data) {
      this.readyState = 1;
      this.onmessage({ data: JSON.stringify(data) });
    }
  }
  const stop = subscribeRoom({
    credentials: { id: "A", key: "secret" },
    onRoom: (s) => states.push(s),
    onConnected: (s) => connected.push(s),
    onError: (e) => errors.push(e),
    Socket,
    origin: { protocol: "http:", host: "test" },
    events: { addEventListener() {}, removeEventListener() {} },
    schedule: (fn, ms) => {
      tasks.set(++next, { fn, ms });
      return next;
    },
    cancel: (id) => tasks.delete(id),
    request: () =>
      new Promise((resolve, reject) => reads.push({ resolve, reject })),
  });
  sockets[0].receive({ id: "A", revision: 5 });
  reads[0].resolve({ id: "A", revision: 4 });
  await Promise.resolve();
  assert.deepEqual(
    states.map((s) => s.revision),
    [5],
  );
  sockets[0].close();
  assert.equal(connected.at(-1), false);
  const retry = [...tasks.entries()].find(([, t]) => t.ms < 10000);
  tasks.delete(retry[0]);
  retry[1].fn();
  sockets[1].receive({ id: "A", revision: 6 });
  assert.equal(connected.at(-1), true);
  const poll = [...tasks.entries()].find(([, t]) => t.ms === 15000);
  tasks.delete(poll[0]);
  poll[1].fn();
  reads[1].reject(Object.assign(Error("restart"), { transient: true }));
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(errors, []);
  assert.equal(states.at(-1).revision, 6);
  stop();
  assert.equal(tasks.size, 0);
  sockets[1].receive({ id: "A", revision: 9 });
  assert.equal(states.at(-1).revision, 6);
});
test("reconnection backs off with bounded jitter", () => {
  assert.ok(reconnectDelay(0, () => 0) < reconnectDelay(4, () => 0));
  assert.ok(reconnectDelay(999, () => 1) <= 12000);
});
