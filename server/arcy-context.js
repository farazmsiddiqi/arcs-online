import { viewFor } from "../game/engine.js";
import { ACTION_CARDS, CARDS, MAP, DICE } from "../game/data.js";

// A separate allowlist, never a spread of room/game state. Even the asker has
// no private-hand channel to Arcy: all answers belong to the shared table.
export function refereeContext(room, asker) {
  if (!room.game)
    return {
      status: "lobby",
      asker,
      players: room.seats.map((s, id) => ({ id, name: s.name })),
    };
  const v = viewFor(room.game, -1);
  const players = v.players.map((p) => ({
    id: p.id,
    name: p.name,
    power: p.power,
    handCount: p.hand,
    leader: p.leader ?? null,
    cards: p.cards,
    resources: p.resources,
    trophies: p.trophies,
    captives: p.captives,
    outrage: p.outrage,
    resourceKeys: v.resourceKeys[p.id],
    capacity: v.capacities[p.id],
    supply: v.supplies[p.id],
  }));
  const ids = new Set([
    ...players.flatMap((p) => [p.leader, ...p.cards]),
    ...v.court.map((c) => c.id),
    ...(v.draft?.leaders ?? []),
    ...(v.draft?.lore ?? []),
  ]);
  return {
    status: room.status,
    asker,
    revision: v.revision,
    chapter: v.chapter,
    round: v.round,
    phase: v.phase,
    draft: v.draft
      ? {
          leaders: v.draft.leaders.map((id) => ({ id, name: CARDS[id].name })),
          lore: v.draft.lore.map((id) => ({ id, name: CARDS[id].name })),
          choosingPlayer: v.current,
          instruction:
            "Public shared draft pool. Explain these visible options when asked; never recommend or rank them. Each player picks a Leader and the configured number of Lore cards.",
        }
      : null,
    currentPlayer: v.current,
    decisionActor: v.decision.actor,
    activity: v.activity,
    initiative: v.initiative,
    seized: v.seized,
    lead: v.lead
      ? {
          player: v.lead.player,
          suit: v.lead.suit,
          rank: v.lead.rank,
          card: v.lead.id,
          declarations: v.lead.declarations ?? [],
        }
      : null,
    turn: v.turn
      ? {
          suit: v.turn.suit,
          remainingPips: v.turn.pips,
          prelude: v.turn.prelude,
          weapons: v.turn.weapons,
          leadDeclared: !!v.turn.leadDeclared,
          informationRevealed: !!v.turn.revealed,
        }
      : null,
    played: v.played.map((p) => ({
      player: p.player,
      mode: p.mode,
      faceup: p.faceup,
      card: p.faceup ? p.card : null,
    })),
    players,
    pieces: v.pieces,
    court: v.court,
    courtDeckCount: v.courtDeckCount,
    courtDiscard: v.courtDiscard,
    discardUp: v.discardUp,
    discardDownCount: v.discardDownCount,
    supply: v.supply,
    markers: v.markers,
    ambitionValues: v.ambitionValues,
    ambitionAwards: v.ambitionAwards,
    neutralAmbitionRival: v.players.length === 2 ? v.neutral : null,
    winner: v.winner ?? null,
    systems: Object.values(MAP)
      .filter((m) => v.clusters.includes(m.cluster))
      .map((m) => ({
        ...m,
        control: v.controls[m.id] ?? null,
        planetOverride: v.overrides?.[m.id] ?? null,
      })),
    cardNames: Object.fromEntries(
      [...ids].filter((id) => CARDS[id]).map((id) => [id, CARDS[id].name]),
    ),
    actionCards: ACTION_CARDS,
    diceFaces: DICE,
    battle: v.battleContext,
    lastBattle: v.lastBattle ?? null,
    currentTurnEvents: v.log
      .filter(
        (e) =>
          e.at?.chapter === v.chapter &&
          e.at?.round === v.round &&
          e.at?.player === v.current,
      )
      .slice(-60)
      .map((e) => ({ text: e.text, at: e.at })),
    recentEvents: v.log.slice(-24).map((e) => ({ text: e.text, at: e.at })),
    tableRules: {
      scope: "Arcs base game and Leaders & Lore, no Blighted Reach campaign",
      leaders: !!room.options?.leaders,
      doubleLore: !!room.options?.doubleLore,
      splitDiscard:
        "Official optional split-discard variant is enabled. Older saved hidden discards remain hidden.",
      timing:
        "Lenient declare/seize timing until new information is revealed, subject to relevant modifiers (§22.7).",
      authority:
        "The state reports this implementation. If it conflicts with a published rule, explain the discrepancy; do not use the implementation as proof of a rule.",
    },
  };
}
export const snapshotLabel = (context) => ({
  revision: context.revision ?? null,
  chapter: context.chapter ?? null,
  round: context.round ?? null,
  player: context.currentPlayer ?? null,
});
