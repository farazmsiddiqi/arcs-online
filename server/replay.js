import { gzipSync, gunzipSync } from "node:zlib";
import { viewFor } from "../game/engine.js";

// Persist the public projection, never an engine state, private hand, pending
// choice, RNG seed, or command payload. Every seat receives the same archive.
export function replayProjection(game) {
  const view = structuredClone(viewFor(game, -1));
  delete view.me;
  delete view.decision;
  delete view.interaction;
  delete view.resourceArrangement;
  return view;
}
function visiblePosition(view) {
  const { revision, activity, ...position } = view;
  return JSON.stringify(position);
}
export function createReplayStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS replay_frames (
    room TEXT NOT NULL, revision INTEGER NOT NULL, created INTEGER NOT NULL,
    chapter INTEGER NOT NULL, round INTEGER NOT NULL, player INTEGER NOT NULL,
    turn_key TEXT NOT NULL, turn_number INTEGER NOT NULL, label TEXT NOT NULL,
    snapshot BLOB NOT NULL, PRIMARY KEY(room, revision));`);
  const last = db.prepare(
    "SELECT * FROM replay_frames WHERE room=? ORDER BY revision DESC LIMIT 1",
  );
  const insert = db.prepare(
    "INSERT OR IGNORE INTO replay_frames VALUES(?,?,?,?,?,?,?,?,?,?)",
  );
  function record(id, game, before = null) {
    if (!game) return;
    const previous = last.get(id);
    if (previous && previous.revision >= game.revision) return;
    const view = replayProjection(game);
    if (
      previous &&
      visiblePosition(JSON.parse(gunzipSync(previous.snapshot))) ===
        visiblePosition(view)
    )
      return;
    const source = before ?? game;
    const turnKey = `${source.chapter}:${source.round}:${source.current}:${source.phase === "draft" ? "draft" : "turn"}`;
    const turn = previous
      ? previous.turn_number + (previous.turn_key === turnKey ? 0 : 1)
      : 0;
    const fresh = before
      ? game.log.filter((e) => e.id > (before.log.at(-1)?.id ?? 0))
      : [];
    const label = !previous
      ? game.revision === 0
        ? "Starting position"
        : "Earliest recorded position"
      : fresh.map((e) => e.text).join(" ") ||
        (before?.turn?.prelude && !game.turn?.prelude
          ? "Prelude complete"
          : "Public board updated");
    insert.run(
      id,
      game.revision,
      Date.now(),
      source.chapter,
      source.round,
      source.current,
      turnKey,
      turn,
      label.slice(0, 1500),
      gzipSync(JSON.stringify(view)),
    );
  }
  function summary(id, after = -1) {
    const rows = db
      .prepare(
        `SELECT revision,created,chapter,round,player,turn_number AS turn,label
      FROM replay_frames WHERE room=? AND revision>? ORDER BY revision LIMIT 501`,
      )
      .all(id, after);
    const frames = rows.slice(0, 500);
    const bounds = db
      .prepare(
        "SELECT min(revision) first,max(revision) latest,count(*) count FROM replay_frames WHERE room=?",
      )
      .get(id);
    return {
      frames,
      ...bounds,
      nextAfter: rows.length > 500 ? frames.at(-1).revision : null,
    };
  }
  function frame(id, revision) {
    const row = db
      .prepare("SELECT snapshot FROM replay_frames WHERE room=? AND revision=?")
      .get(id, revision);
    return row ? JSON.parse(gunzipSync(row.snapshot)) : null;
  }
  function positions(id, revisions) {
    return db
      .prepare(
        `SELECT revision,snapshot FROM replay_frames WHERE room=? AND revision IN (${revisions.map(() => "?").join(",")}) ORDER BY revision`,
      )
      .all(id, ...revisions)
      .map((row) => ({
        revision: row.revision,
        game: JSON.parse(gunzipSync(row.snapshot)),
      }));
  }
  function recent(id) {
    const rows = db
      .prepare(
        "SELECT revision,snapshot FROM replay_frames WHERE room=? ORDER BY revision DESC LIMIT 24",
      )
      .all(id);
    return rows
      .reverse()
      .map((row) => ({
        revision: row.revision,
        game: JSON.parse(gunzipSync(row.snapshot)),
      }));
  }
  return { record, summary, frame, positions, recent };
}
