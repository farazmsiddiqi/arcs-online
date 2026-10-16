import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const base = process.env.TEST_URL ?? "http://localhost:5173";
const post = async (path, body, key) => {
  const r = await fetch(base + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(body),
  });
  assert.ok(r.ok);
  return r.json();
};
const room = await post("/api/rooms", { name: "Tool host", players: 2 }),
  guest = await post(`/api/rooms/${room.id}/join`, {
    name: "Tool guest",
    invite: room.invite,
  });
const initial = await post(`/api/rooms/${room.id}/start`, {}, room.key);
const actor = initial.game.decision.actor,
  key = actor === 0 ? room.key : guest.key;
const b = await chromium.launch({ channel: process.env.PW_CHANNEL });
const c = await b.newContext();
await c.addInitScript(
  ({ id, key }) => {
    localStorage.setItem(`arcs-seat-${id}`, key);
    const registry = new Map();
    Object.defineProperty(document, "modelContext", {
      value: {
        registerTool(tool, { signal }) {
          registry.set(tool.name, tool);
          signal.addEventListener("abort", () => registry.delete(tool.name));
        },
      },
      configurable: true,
    });
    window.testRegistry = registry;
  },
  { id: room.id, key },
);
const p = await c.newPage();
try {
  await p.goto(`${base}/table/${room.id}`);
  await p.waitForFunction(
    () =>
      window.testRegistry.has("read_arcs_table") &&
      window.testRegistry.get("read_arcs_table").execute({}).revision === 0,
  );
  const result = await p.evaluate(async () => {
    const r = window.testRegistry,
      read = r.get("read_arcs_table"),
      submit = r.get("submit_arcs_decision");
    const first = read.execute({});
    const selected =
      first.decision.choices.find((c) => c.op === "skip") ??
      first.decision.choices[0];
    const applied = await submit.execute({
      revision: first.revision,
      choice: selected.id,
    });
    const after = read.execute({});
    let rejected = false;
    try {
      await submit.execute({ revision: after.revision, choice: 99999 });
    } catch {
      rejected = true;
    }
    const last = read.execute({});
    return {
      names: [...r.keys()],
      readOnly: read.annotations.readOnlyHint,
      mutating: submit.annotations.readOnlyHint,
      schema: !!submit.inputSchema,
      applied: applied.ok,
      revision: after.revision,
      actor: after.me,
      privateHand: Array.isArray(after.players[after.me].hand),
      rivalHidden: typeof after.players[1 - after.me].hand === "number",
      rejected,
      unchanged: last.revision === after.revision,
    };
  });
  assert.deepEqual(result.names, ["read_arcs_table", "submit_arcs_decision"]);
  assert.equal(result.readOnly, true);
  assert.equal(result.mutating, false);
  assert.equal(result.revision, 1);
  assert.ok(
    result.applied &&
      result.privateHand &&
      result.rivalHidden &&
      result.rejected &&
      result.unchanged,
  );
  console.log(
    JSON.stringify({
      registryHarness: true,
      registration: true,
      validActionUpdatesVisibleState: true,
      invalidActionRejected: true,
      privateProjection: true,
      nativeBrowserIntegration: "not independently available",
    }),
  );
} finally {
  await b.close();
}
