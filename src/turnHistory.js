// Pure helpers that group the public table log into turns. Every log entry
// carries `at: { chapter, round, player }` (the player whose turn it was);
// entries from games saved before that gather under one "earlier" group.
export function groupTurns(game) {
  const players = game?.players ?? [],
    groups = [];
  for (const e of game?.log ?? []) {
    const at = e.at,
      key = at ? `${at.chapter}:${at.round}:${at.player}` : "earlier",
      last = groups.at(-1);
    if (last?.key === key) last.entries.push(e);
    else
      groups.push({
        key,
        legacy: !at,
        chapter: at?.chapter ?? null,
        round: at?.round ?? null,
        player: at?.player ?? null,
        name: at ? (players[at.player]?.name ?? `Seat ${at.player + 1}`) : null,
        color: at ? (players[at.player]?.color ?? null) : null,
        entries: [e],
      });
  }
  return groups;
}

const VIA = {
  farseers: "Farseers",
  call: "Call to Action",
  mulligan: "Mulligan",
};
export const drawVia = (via) => VIA[via] ?? "Draw";

// Draws from the action discard: who, how many, why, and whether the face-up
// pile was shuffled in first. Counts only: the log never says which cards.
export function drawLog(game) {
  const players = game?.players ?? [];
  return (game?.log ?? [])
    .filter((e) => e.draw)
    .map((e) => ({
      eventId: e.id,
      chapter: e.at?.chapter ?? null,
      round: e.at?.round ?? null,
      player: e.draw.player,
      playerName: players[e.draw.player]?.name ?? `Seat ${e.draw.player + 1}`,
      count: e.draw.count,
      via: e.draw.via,
      viaLabel: drawVia(e.draw.via),
      merged: !!e.draw.merged,
    }));
}
