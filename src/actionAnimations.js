import { animationEvents } from "./pieceMotion.js";
// Presentation data comes only from the seat-filtered public view. Never inspect
// hand identities, decisions, pending tasks, or private chat for animation cues.
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const countHand = (hand) => (Array.isArray(hand) ? hand.length : (hand ?? 0));
const count = (list, value) => (list ?? []).filter((x) => x === value).length;
export function actionChanges(before, after) {
  if (
    !before ||
    !after ||
    (!after._replay && after.revision <= before.revision)
  )
    return [];
  if (!after._replay && after.log?.at(-1)?.history) return [];
  const changes = [],
    add = (kind, data = {}) => changes.push({ kind, ...data });
  const oldPieces = new Map(before.pieces.map((p) => [p.id, p]));
  for (const piece of after.pieces) {
    const old = oldPieces.get(piece.id);
    if (!old)
      add("build", {
        system: piece.system,
        piece: piece.id,
        owner: piece.owner,
        pieceType: piece.type,
        damaged: piece.damaged,
      });
    else if (old.system !== piece.system)
      add("move", {
        system: piece.system,
        from: old.system,
        piece: piece.id,
        owner: piece.owner,
      });
    else if (old.damaged && !piece.damaged)
      add("repair", {
        pieceType: piece.type,
        system: piece.system,
        piece: piece.id,
        owner: piece.owner,
      });
    else if (!old.damaged && piece.damaged)
      add("damage", {
        system: piece.system,
        owner: piece.owner,
        piece: piece.id,
        pieceType: piece.type,
      });
  }
  for (const piece of before.pieces) {
    if (!after.pieces.some((p) => p.id === piece.id))
      add("remove", {
        system: piece.system,
        owner: piece.owner,
        piece: piece.id,
        pieceType: piece.type,
        damaged: piece.damaged,
      });
  }
  for (const player of after.players) {
    const old = before.players.find((p) => p.id === player.id);
    if (!old) continue;
    const owner = player.id;
    for (const resource of ["material", "fuel", "weapon", "relic", "psionic"]) {
      const delta =
        count(player.resources, resource) - count(old.resources, resource);
      if (delta) add("resource", { owner, resource, delta });
    }
    if (!same(old.resources, player.resources)) add("arrange", { owner });
    for (const field of [
      "cards",
      "leader",
      "trophies",
      "captives",
      "outrage",
    ]) {
      if (!same(old[field], player[field])) add(field, { owner });
    }
    if (old.power !== player.power)
      add("power", { owner, delta: player.power - old.power });
    if (countHand(old.hand) !== countHand(player.hand)) add("hand", { owner });
  }
  after.court.forEach((card, index) => {
    if (!same(before.court[index], card)) add("court", { index });
    if (before.court[index]?.id === card.id)
      card.agents.forEach((n, owner) => {
        const delta = n - before.court[index].agents[owner];
        if (delta) add("influence", { index, owner, delta });
      });
  });
  if (!same(before.played, after.played) || !same(before.lead, after.lead))
    add("play", {
      cardMove:
        after._replay?.direction < 0
          ? before.played.length === after.played.length + 1
          : after.played.length === before.played.length + 1,
      played:
        after.played.length > before.played.length
          ? after.played.at(-1)
          : before.played.at(-1),
      returning:
        after.played.length < before.played.length &&
        after._replay?.direction < 0,
    });
  if (!same(before.markers, after.markers)) add("ambition");
  if (before.initiative !== after.initiative || before.seized !== after.seized)
    add("initiative");
  if (before.chapter !== after.chapter) add("chapter");
  if (
    before.current !== after.current ||
    before.phase !== after.phase ||
    before.turn?.prelude !== after.turn?.prelude
  )
    add("turn");
  for (const [system, resource] of Object.entries(after.overrides ?? {})) {
    if (before.overrides?.[system] !== resource)
      add("reshape", { system, resource });
  }
  const fresh = animationEvents(before, after);
  for (const event of fresh) {
    if (event.animation?.kind === "tax") add("tax", event.animation);
  }
  if (after.lastBattle && !same(before.lastBattle, after.lastBattle))
    add("battle", { system: after.lastBattle.system });
  return changes;
}
// A rollback resets the baseline; it must not masquerade as a build or attack.
export function isForwardUpdate(before, after) {
  return (
    !!before &&
    (after._replay
      ? after._replay.animate &&
        !!before._replay &&
        after._replay.sequence !== before._replay.sequence
      : after.revision > before.revision &&
        (after.log?.at(-1)?.id ?? 0) >= (before.log?.at(-1)?.id ?? 0))
  );
}
export function animationTargets(change) {
  const selectors = [];
  if (change.owner !== undefined)
    selectors.push(`[data-player-area="${change.owner}"]`);
  if (change.kind === "court")
    selectors.push(`[data-court-slot="${change.index}"]`);
  if (change.kind === "resource")
    selectors.push(`[data-supply-resource="${change.resource}"]`);
  if (["play", "initiative", "turn", "hand"].includes(change.kind))
    selectors.push(".round-table");
  if (["ambition", "power", "chapter"].includes(change.kind))
    selectors.push(".shared-board");
  return selectors;
}
