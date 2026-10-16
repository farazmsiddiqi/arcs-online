import { drawLog } from "./turnHistory.js";
// Pure view helpers for the "Action discard" panel. Only face-up information
// exists in the view; the face-down pile is a count and nothing else.
const MODE_LABELS = { lead: "Led", surpass: "Surpassed", pivot: "Pivoted" };
export const modeLabel = (mode) => MODE_LABELS[mode] ?? "Played";

const describe = (players) => (x) => ({
  card: x.card,
  mode: x.mode,
  modeLabel: modeLabel(x.mode),
  player: x.player,
  playerName: players[x.player]?.name ?? `Seat ${x.player + 1}`,
  color: players[x.player]?.color ?? null,
});
const byRound = (cards, players) =>
  cards.reduce((rounds, x) => {
    if (rounds.at(-1)?.round !== x.round)
      rounds.push({ round: x.round, cards: [] });
    rounds.at(-1).cards.push(describe(players)(x));
    return rounds;
  }, []);

// The newest merge of this chapter, from the log (the pile is rebuilt at each
// chapter start, so earlier chapters' merges no longer matter). Null when the
// log holds none, including when an old merge has scrolled out of the log.
function lastMerge(game) {
  const entry = (game?.log ?? []).findLast(
    (e) => e.merge && e.merge.chapter === game.chapter,
  );
  if (!entry) return null;
  const players = game.players ?? [];
  return {
    eventId: entry.id,
    round: entry.merge.round,
    count: entry.merge.cards.length,
    rounds: byRound(entry.merge.cards, players),
  };
}

export function discardPanelModel(game) {
  const players = game?.players ?? [];
  const rounds = (game?.discardUp ?? []).map(({ round, cards }) => ({
    round,
    cards: cards.map(describe(players)),
  }));
  const faceUpCount = rounds.reduce((n, r) => n + r.cards.length, 0);
  const faceDownCount = Number.isFinite(game?.discardDownCount)
    ? game.discardDownCount
    : 0;
  return {
    rounds,
    faceUpCount,
    faceDownCount,
    total: faceUpCount + faceDownCount,
    merge: lastMerge(game),
    draws: drawLog(game),
  };
}
