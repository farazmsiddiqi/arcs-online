import { existsSync, mkdirSync, renameSync, chmodSync, rmSync } from "node:fs";
import { resolve } from "node:path";

// Upgrade server-owned saved state only. Never accept game state from clients.
// This is deliberately additive: no reshuffle, reset, identity change, or new
// public information. The next normal save persists the upgraded representation.
const VERSION = 1;
export function migrateRoom(room) {
  if (room.saveVersion >= VERSION) return room;
  const upgradeTimer = (config) => {
    if (!config || config.turn !== undefined || config.seconds === undefined)
      return;
    config.turn = config.mode === "off" ? 0 : config.seconds;
    config.bank ??= 0;
    config.increment ??= 0;
    delete config.seconds;
  };
  const seen = new WeakSet();
  const visit = (value) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value.players) && Array.isArray(value.pending)) {
      const legacy = Array.isArray(value.discard);
      value.discardDown ??= legacy ? value.discard : [];
      value.discardUp ??= [];
      delete value.discard;
      if (legacy) {
        // Before the fix, an unpaid "bonus after" prompt could be cancelled
        // while leaving its free bonus queued. Reopen just that unpaid choice
        // using the corrected flow; nothing on the board has happened yet.
        for (let i = 0; i < value.pending.length - 1; i++) {
          const paid = value.pending[i],
            bonus = value.pending[i + 1];
          if (
            paid.type === "action" &&
            paid.standardOnly &&
            !paid.required &&
            paid.cost === "pip" &&
            bonus.type === "action" &&
            bonus.cost === "free" &&
            paid.p === bonus.p &&
            ((paid.action === "battle" && bonus.action === "move") ||
              (paid.action === "secure" && bonus.action === "influence"))
          ) {
            paid.configured = false;
            delete paid.standardOnly;
            value.pending.splice(i + 1, 1);
          }
        }
      }
      value.battles ??= value.lastBattle
        ? [
            {
              ...structuredClone(value.lastBattle),
              rerolls: [],
              // Pre-upgrade saves did not record the battle's chapter/round.
              at: null,
            },
          ]
        : [];
      if (value.turn) {
        value.turn.leadDeclared ??= !!value.turn.declared;
        // Old saves did not record reveals. Keep their pre-existing strict
        // timing for the current turn; normal timing begins next turn.
        value.turn.revealed ??= legacy && value.turn.acted ? "legacy" : false;
        delete value.turn.declared;
      }
    }
    // Pending legacy Feastbringer declarations always consumed the old
    // per-turn declaration flag, regardless of their source.
    if (value.type === "generous" && value.lead === undefined)
      value.lead = true;
    // Covers history before/after states and nested pending rollback states.
    for (const nested of Object.values(value)) visit(nested);
  };
  visit(room.game);
  visit(room.history);
  upgradeTimer(room.options?.timer);
  upgradeTimer(room.clock?.config);
  // Do not reset since, spent, total, bonus, pause, or takeover state.
  room.saveVersion = VERSION;
  return room;
}

// Take a consistent SQLite snapshot before the first startup that can upgrade
// old saves. Build it under a temporary name so an interrupted copy never looks
// like a completed backup. Failure aborts startup rather than risking the saves.
export function backupLegacyRooms(db, directory) {
  const old = db
    .prepare(
      `SELECT 1 FROM rooms WHERE
    json_type(data, '$.game.discard') = 'array' OR
    json_type(data, '$.clock.config.seconds') IS NOT NULL LIMIT 1`,
    )
    .get();
  if (!old) return null;
  const folder = resolve(directory, "backups");
  const target = resolve(folder, "before-save-v1.sqlite");
  if (existsSync(target)) return null;
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    db.prepare("VACUUM INTO ?").run(temporary);
    chmodSync(temporary, 0o600);
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
  return target;
}
