import {
  decision,
  transition,
  ambitionValues,
  capacity,
  piecesAt,
} from "./engine.js";
import { ACTION_CARDS } from "./data.js";

// A conservative fallback, not a competitive opponent. It uses the acting
// player's legal choices and public board; never rival hands or deck order.
const resourceValue = (s, p, r) => {
  const ambition = {
    material: "tycoon",
    fuel: "tycoon",
    relic: "keeper",
    psionic: "empath",
  }[r];
  return (
    (s.markers.some((m) => m.ambition === ambition) ? 4 : 0) +
    ({ relic: 4, psionic: 4, material: 3, fuel: 2, weapon: 1 }[r] ?? 0) +
    (s.players[p].resources.includes(r) ? 0 : 1)
  );
};
function targetValue(s, p, c) {
  const piece = s.pieces.find((x) => x.id === c.piece);
  if (c.op === "repairTarget") return piece?.type === "ship" ? 8 : 9;
  if (c.op === "secureTarget") return 12;
  if (c.op === "taxTarget")
    return s.players[p].resources.filter(Boolean).length < capacity(s, p)
      ? 8
      : -1;
  if (c.op === "buildTarget") {
    const threat = piecesAt(s, c.system).filter(
      (x) => x.owner !== p && x.type === "ship",
    ).length;
    return (c.kind === "city" ? 7 : c.kind === "ship" ? 6 : 5) - threat;
  }
  if (c.op === "influenceTarget" || c.op === "bold") {
    const agents = s.court[c.index].agents;
    const needed =
      Math.max(...agents.filter((_, i) => i !== p)) + 1 - agents[p];
    return needed > 0 ? 6 - needed / 10 : 1;
  }
  if (c.op === "battleTarget") {
    const ours = piecesAt(s, c.system, p, "ship").length;
    const theirs = piecesAt(s, c.system, c.defender, "ship").length;
    // Safe skirmish dice can hit ships. Do not launch raids or bombard cities
    // automatically, or spend a pip attacking an empty fleet.
    return theirs && ours > theirs ? 3 + Math.min(ours - theirs, 3) / 10 : -1;
  }
  return -1;
}
function actionValue(s, p, c) {
  if (c.cost !== "pip" || c.action === "move") return -1;
  const next = transition(s, p, { choice: c.id });
  return Math.max(
    -1,
    ...decision(next, p).choices.map((x) => targetValue(next, p, x)),
  );
}
export function timeoutInput(s) {
  const p = s.pending[0]?.p ?? s.current,
    t = s.pending[0],
    d = decision(s, p);
  if (d.form) {
    const f = d.form;
    if (f.kind === "dice") {
      // Skirmish has no self-hits or interception. Minimums still come from
      // the rules engine (including Rebel); six is the physical dice limit.
      return { value: { skirmish: Math.min(6, f.max), assault: 0, raid: 0 } };
    }
    const options = [...f.options];
    if (t?.type === "rerollSelect") {
      const blanks = options.filter((x) => !t.dice[Number(x.id)].faces.length);
      return { value: blanks.slice(0, f.max).map((x) => x.id) };
    }
    if (t?.type === "moveSelect") {
      // Complete the already-chosen move as a fleet rather than stranding a
      // single ship. The form supplies Leader-specific limits.
      return { value: options.slice(0, f.max).map((x) => x.id) };
    }
    return { value: options.slice(0, f.min).map((x) => x.id) };
  }
  const score = (c) => {
    if (!t) {
      if (c.op === "play") {
        const next = transition(s, p, { choice: c.id });
        const best = Math.max(
          0,
          ...decision(next, p)
            .choices.filter((x) => x.op === "action")
            .map((x) => actionValue(next, p, x)),
        );
        return 20 + best * next.turn.pips - ACTION_CARDS[c.card].rank / 10;
      }
      if (c.op === "endPrelude") return 100; // Keep saved resources and Guilds.
      if (c.op === "action") return actionValue(s, p, c);
      if (c.op === "declare") {
        // Never declare once the turn has revealed anything (item 16), even
        // where the printed "before actions" window still allows it.
        if (s.turn.revealed) return -10;
        const values = ambitionValues(s, c.ambition);
        return values[p] >
          Math.max(
            ...values.filter((_, i) => i !== p),
            s.players.length === 2 ? s.neutral[c.ambition] : 0,
          )
          ? 15
          : -2;
      }
      if (c.op === "endTurn" || c.op === "pass") return 0;
      if (c.op === "draft") return 1;
      return -10;
    }
    if (c.op === "hit") return pieceHitValue(s, p, c);
    if (c.op === "discard")
      return -resourceValue(s, p, s.players[p].resources[c.index]);
    if (c.op === "gain" || c.op === "taxResource")
      return 15 + resourceValue(s, p, c.resource);
    if (
      ["stealCard", "stealResource", "ransack", "repairBonus", "bold"].includes(
        c.op,
      )
    )
      return 15;
    if (c.op === "swapSlot") return c.index === t.index ? 20 : 0;
    if (c.op === "skip" || c.op === "resolve" || c.op === "withoutBonus")
      return 0;
    if (c.op === "cancel" || c.op === "arrangePick") return -20;
    // Rerolling with no blank dice would select nothing and not spend the
    // ability, so only reroll when there is a blank die to replace.
    if (c.op === "reroll")
      return t.dice.some(
        (x) => !x.faces.length && (c.dieType === "any" || x.type === c.dieType),
      )
        ? 1
        : -1;
    if (t.type === "action" || t.type === "freeChoice")
      return targetValue(s, p, c);
    if (c.op === "moveTo") {
      const enemy = piecesAt(s, c.system).filter(
        (x) => x.owner !== p && x.type === "ship",
      ).length;
      return (
        (piecesAt(s, c.system, p).some((x) => x.type !== "ship") ? 5 : 1) -
        enemy * 3
      );
    }
    // Optional abilities are left unused unless explicitly valued above.
    return d.choices.some((x) => x.op === "skip") ? -1 : 1;
  };
  const ranked = d.choices
    .map((c) => ({ c, score: score(c) }))
    .sort((a, b) => b.score - a.score || a.c.id - b.c.id);
  if (!ranked.length) throw new Error(`No legal timeout decision: ${d.title}`);
  return { choice: ranked[0].c.id };
}
function pieceHitValue(s, p, c) {
  const piece = s.pieces.find((x) => x.id === c.piece);
  // Preserve our pieces; destroy an opponent's already-damaged pieces first.
  return (piece.owner === p ? !piece.damaged : piece.damaged) ? 10 : 1;
}
