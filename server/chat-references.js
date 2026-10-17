import {
  resolveChatMentions,
  mentionSegments,
  chatMentionOptions,
} from "../game/chat-mentions.js";
import { refereeContext, snapshotLabel } from "./arcy-context.js";
import { CARDS, ACTION_CARDS, AMBITIONS } from "../game/data.js";
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
const cardName = (id) =>
  CARDS[id]?.name ??
  (ACTION_CARDS[id]
    ? `${cap(ACTION_CARDS[id].suit)} ${ACTION_CARDS[id].rank}`
    : "Unknown card");
const systemName = (id) =>
  id ? `Sector ${id.split("-")[0]} · ${cap(id.split("-")[1])}` : "—";
const row = (label, value, extra = {}) => ({
  label,
  value: String(value),
  ...extra,
});
export function referenceOnly(text, players) {
  const segments = mentionSegments(text, chatMentionOptions(players));
  return (
    segments.some((s) => s.mention && s.mention.kind !== "referee") &&
    segments.every((s) => s.mention || /^[\s,.;:!?]*$/.test(s.text))
  );
}
// A deterministic response captured at send-time. Only the explicitly
// allowlisted public referee context is read, even in a private consultation.
export function chatReferences(room, seat, text) {
  const mentions = resolveChatMentions(text, room.seats).filter(
    (m) => m.kind !== "referee",
  );
  if (!mentions.length) return [];
  const c = refereeContext(room, seat),
    name = (id) => c.players.find((p) => p.id === id)?.name ?? "No player";
  return mentions.map((m) => {
    const result = {
      id: m.id,
      title: m.label,
      snapshot: snapshotLabel(c),
      rows: [],
    };
    if (c.status === "lobby") {
      result.rows = [
        row("Status", "Waiting in the lobby"),
        row("Players", c.players.map((p) => p.name).join(" · ")),
      ];
      return result;
    }
    const playerRows = (p) => [
      row("Power", p.power),
      row("Hand", `${p.handCount} face-down cards`),
      row(
        "Resources",
        p.resources
          .map((r, i) => `${i + 1}: ${r ? cap(r) : "Empty"}`)
          .join(" · "),
      ),
      row("Open slots", p.capacity),
      row("Raid keys", p.resourceKeys.join(" · ")),
      row(
        "Supply",
        Object.entries(p.supply)
          .map(([type, n]) => `${n} ${type}`)
          .join(" · "),
      ),
      row("Trophies", p.trophies.length),
      row("Captives", p.captives.length),
      row("Outrage", p.outrage.map(cap).join(" · ") || "None"),
      ...[p.leader, ...p.cards]
        .filter(Boolean)
        .map((id) =>
          row(CARDS[id]?.kind ?? "Card", cardName(id), { cardId: id }),
        ),
    ];
    if (m.kind === "player") {
      result.rows = playerRows(c.players.find((p) => p.id === m.playerId));
      return result;
    }
    switch (m.id) {
      case "turn":
        result.rows = [
          row("Chapter / round", `${c.chapter} / ${c.round}`),
          row("Player", name(c.currentPlayer)),
          row("Stage", c.activity?.label ?? cap(c.phase)),
          row("Decision belongs to", name(c.decisionActor)),
          ...(c.turn
            ? [
                row("Action suit", cap(c.turn.suit)),
                row("Card pips remaining", c.turn.remainingPips),
                row("Prelude", c.turn.prelude ? "Open" : "Finished"),
              ]
            : []),
          row("Initiative", name(c.initiative)),
        ];
        break;
      case "lead":
        result.rows = c.lead
          ? [
              row(
                "Lead",
                `${name(c.lead.player)} · ${cap(c.lead.suit)} ${c.lead.rank}`,
              ),
              row("Printed card", cardName(c.lead.card)),
              row(
                "Ambitions declared on lead",
                (c.lead.declarations ?? [])
                  .map((d) => cap(typeof d === "string" ? d : d.ambition))
                  .join(" · ") || "None",
              ),
              ...c.played.map((p) =>
                row(
                  name(p.player),
                  `${cap(p.mode)} · ${p.faceup ? cardName(p.card) : "Face-down card"}`,
                ),
              ),
            ]
          : [row("Lead", "No card has been led yet")];
        break;
      case "draft":
        result.rows = c.draft
          ? [
              row("Choosing", name(c.draft.choosingPlayer)),
              ...c.draft.leaders.map((x) =>
                row("Leader", x.name, { cardId: x.id }),
              ),
              ...c.draft.lore.map((x) => row("Lore", x.name, { cardId: x.id })),
            ]
          : [row("Draft", "No draft is in progress")];
        break;
      case "scores":
        result.rows = [
          row("Chapter", `${c.chapter} of 5`),
          ...c.players.map((p) => row(p.name, `${p.power} Power`)),
        ];
        break;
      case "resources":
        result.rows = [
          row(
            "Common supply",
            Object.entries(c.supply)
              .map(([r, n]) => `${cap(r)} ${n}`)
              .join(" · "),
          ),
          ...c.players.map((p) =>
            row(
              p.name,
              p.resources
                .map((r, i) => `${i + 1}: ${r ? cap(r) : "Empty"}`)
                .join(" · "),
            ),
          ),
        ];
        break;
      case "ambitions":
        result.rows = AMBITIONS.map((a) => {
          const markers = c.markers.filter((m) => m.ambition === a);
          return row(
            cap(a),
            `${markers.length ? markers.map((m) => `${m.high}/${m.low} Power`).join(" + ") : "Undeclared"} · ${c.players.map((p) => `${p.name}: ${c.ambitionValues[a][p.id]}`).join(", ")}${c.neutralAmbitionRival ? ` · Neutral: ${c.neutralAmbitionRival[a]}` : ""}`,
          );
        });
        break;
      case "court":
        result.rows = [
          row("Deck", `${c.courtDeckCount} cards`),
          ...c.court.map((x) =>
            row(
              cardName(x.id),
              c.players
                .map((p) => `${p.name}: ${x.agents?.[p.id] ?? 0} agents`)
                .join(" · "),
              { cardId: x.id },
            ),
          ),
        ];
        break;
      case "board":
        result.rows = c.systems.map((s) => {
          const pieces = c.pieces.filter((p) => p.system === s.id);
          return row(
            systemName(s.id),
            `${s.control === null ? "Uncontrolled" : `${name(s.control)} controls`} · ${s.planetOverride ?? s.resource ?? "Gate"} · ${
              pieces.length
                ? c.players
                    .map((p) => {
                      const own = pieces.filter((x) => x.owner === p.id);
                      return own.length
                        ? `${p.name}: ${["ship", "city", "starport"]
                            .map((t) => {
                              const ps = own.filter((x) => x.type === t);
                              return ps.length
                                ? `${ps.length} ${t}${ps.filter((x) => x.damaged).length ? ` (${ps.filter((x) => x.damaged).length} damaged)` : ""}`
                                : null;
                            })
                            .filter(Boolean)
                            .join(", ")}`
                        : null;
                    })
                    .filter(Boolean)
                    .join("; ")
                : "No pieces"
            }`,
          );
        });
        break;
      case "battle": {
        const b = c.battle ?? c.lastBattle;
        result.rows = b
          ? [
              row(
                "Status",
                c.battle ? "Resolving battle" : "Most recent battle",
              ),
              row("System", systemName(b.system)),
              row("Attacker", name(b.attacker)),
              row("Defender", name(b.defender)),
              ...(b.dice ?? []).map((d, i) =>
                row(
                  `Die ${i + 1} · ${cap(d.type)}`,
                  d.faces.length ? d.faces.map(cap).join(" · ") : "Blank",
                ),
              ),
            ]
          : [row("Battle", "No battle has taken place")];
        break;
      }
    }
    return result;
  });
}
