// Public positions only. Bounded LRU; concurrent readers share each batch.
export const REPLAY_BATCH = 24;
export function createReplayCache(capacity = 144) {
  const entries = new Map(),
    pending = new Map();
  const queue = [];
  let active = 0;
  function get(revision) {
    const value = entries.get(revision);
    if (value) {
      entries.delete(revision);
      entries.set(revision, value);
    }
    return value;
  }
  function seed(positions) {
    for (const { revision, game } of positions) {
      entries.delete(revision);
      entries.set(revision, game);
    }
    while (entries.size > capacity) entries.delete(entries.keys().next().value);
  }
  function pump() {
    while (active < 2 && queue.length) {
      // The latest requested position takes priority over obsolete scrub targets.
      const task = queue.pop();
      active++;
      Promise.resolve()
        .then(() => task.fetcher(task.revisions))
        .then((result) => seed(result.positions))
        .then(task.resolve, task.reject)
        .finally(() => {
          active--;
          pending.delete(task.key);
          pump();
        });
    }
  }
  function load(revisions, fetcher) {
    if (revisions.every((r) => entries.has(r))) return Promise.resolve();
    const key = revisions.join(",");
    if (pending.has(key)) {
      const queued = queue.findIndex((task) => task.key === key);
      if (queued >= 0) queue.push(queue.splice(queued, 1)[0]);
      return pending.get(key);
    }
    const promise = new Promise((resolve, reject) =>
      queue.push({ key, revisions, fetcher, resolve, reject }),
    );
    pending.set(key, promise);
    pump();
    return promise;
  }
  return {
    get,
    seed,
    load,
    get size() {
      return entries.size;
    },
  };
}
export function replayBatch(frames, index) {
  const start = Math.floor(index / REPLAY_BATCH) * REPLAY_BATCH;
  return frames.slice(start, start + REPLAY_BATCH).map((f) => f.revision);
}
