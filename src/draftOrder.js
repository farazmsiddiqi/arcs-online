import { CARDS } from "../game/data.js";
// Leaders & Lore draft order (rulebook p.21): the player to the right of the
// initiative holder picks first, then counterclockwise, and the initiative
// holder picks last. The engine repeats that cycle until everyone has a
// leader and their lore, so every player gets 1 + loreCount picks.
// Pure and derived from the view only: seats are player indexes, clockwise
// order is increasing index.
export function draftOrder(game) {
  const n = game.players.length,
    loreCount = game.options?.doubleLore ? 2 : 1,
    passes = 1 + loreCount,
    first = (game.initiative + n - 1) % n,
    seats = Array.from({ length: n }, (_, i) => (first - i + n) % n),
    made = game.players.reduce(
      (sum, p) => sum + (p.leader ? 1 : 0) + p.cards.length,
      0,
    );
  // What each seat took, in pick order, from the public log (drafted cards
  // are named there, and only drafted cards carry a `card` before the draft
  // ends). Falls back to leader-then-lore if the log lacks them.
  const owned = game.players.map((p) => new Set([p.leader, ...p.cards])),
    took = game.players.map(() => []);
  for (const e of game.log ?? [])
    if (e.card && owned[e.at?.player]?.has(e.card))
      took[e.at.player].push(e.card);
  game.players.forEach((p, i) => {
    if (took[i].length !== (p.leader ? 1 : 0) + p.cards.length)
      took[i] = [p.leader, ...p.cards].filter(Boolean);
  });
  const used = game.players.map(() => 0);
  const chips = [];
  for (let pass = 0; pass < passes; pass++)
    for (const seat of seats) {
      const index = chips.length,
        done = index < made,
        card = done ? (took[seat][used[seat]++] ?? null) : null;
      chips.push({
        index,
        pass,
        seat,
        state: done ? "done" : index === made ? "current" : "next",
        card,
        kind: card ? CARDS[card]?.kind : null,
        initiative: seat === game.initiative,
        // Archivist keeps extra Lore chosen privately after the draft; the
        // note names no cards.
        archivist: card === "LEAD09",
      });
    }
  return { chips, passes, made, current: chips[made]?.seat ?? null };
}
