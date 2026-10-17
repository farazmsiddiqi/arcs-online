import test from "node:test";
import assert from "node:assert/strict";
import { createReplayCache, replayBatch } from "../src/replayCache.js";
const response = (revisions) => ({
  positions: revisions.map((revision) => ({ revision, game: { revision } })),
});
const tick = () => new Promise((resolve) => setImmediate(resolve));
test("24 consecutive positions share one request and subsequent steps are synchronous cache reads", async () => {
  const cache = createReplayCache();
  const frames = Array.from({ length: 48 }, (_, i) => ({ revision: i * 2 }));
  let calls = 0;
  const fetcher = async (revisions) => {
    calls++;
    await tick();
    return response(revisions);
  };
  await Promise.all(
    Array.from({ length: 24 }, (_, i) =>
      cache.load(replayBatch(frames, i), fetcher),
    ),
  );
  assert.equal(calls, 1);
  for (let i = 0; i < 24; i++) assert.equal(cache.get(i * 2).revision, i * 2);
  await cache.load(replayBatch(frames, 20), fetcher);
  assert.equal(calls, 1);
  await cache.load(replayBatch(frames, 24), fetcher);
  assert.equal(calls, 2);
});
test("LRU bounds memory and protects recently visited positions", () => {
  const cache = createReplayCache(3);
  cache.seed(response([1, 2, 3]).positions);
  cache.get(1);
  cache.seed(response([4]).positions);
  assert.equal(cache.size, 3);
  assert.equal(cache.get(2), undefined);
  assert.equal(cache.get(1).revision, 1);
});
test("cold seeks have at most two requests in flight and newest queued seek is prioritized", async () => {
  const cache = createReplayCache();
  const started = [],
    finish = new Map();
  let active = 0,
    peak = 0;
  const fetcher = (revisions) => {
    started.push(revisions[0]);
    active++;
    peak = Math.max(peak, active);
    return new Promise((resolve) =>
      finish.set(revisions[0], () => {
        active--;
        resolve(response(revisions));
      }),
    );
  };
  const loads = [1, 2, 3, 4].map((n) => cache.load([n], fetcher));
  await tick();
  assert.deepEqual(started, [1, 2]);
  finish.get(1)();
  await tick();
  assert.deepEqual(started, [1, 2, 4]);
  finish.get(2)();
  await tick();
  assert.deepEqual(started, [1, 2, 4, 3]);
  finish.get(4)();
  finish.get(3)();
  await Promise.all(loads);
  assert.equal(peak, 2);
});
test("failed requests release their slot and can be retried", async () => {
  const cache = createReplayCache();
  await assert.rejects(
    cache.load([1], async () => {
      throw new Error("offline");
    }),
    /offline/,
  );
  await tick();
  await cache.load([1], async (revisions) => response(revisions));
  assert.equal(cache.get(1).revision, 1);
});
test("sessions have isolated caches and latest bootstrap makes opening replay immediate", () => {
  const a = createReplayCache(),
    b = createReplayCache();
  a.seed(response([40, 41]).positions);
  assert.equal(a.get(41).revision, 41);
  assert.equal(b.get(41), undefined);
});
