import { ACTION_CARDS, CARDS, SUITS } from "../game/data.js";
export const cap = (s = "") => s[0]?.toUpperCase() + s.slice(1);
// Card and FAQ text uses a light markup: `symbol:x` icons, $link:Name$ card
// links, *emphasis*. Render it as plain text with the icons substituted.
export const rulesText = (s) =>
  (s ?? "")
    .replace(/\$link:([^$]+)\$/g, "$1")
    .replace(/`symbol:key`/g, "⚿")
    .replace(/`symbol:intercept`/g, "↩")
    .replace(/`symbol:hit`/g, "✹")
    .replaceAll("*", "")
    .replaceAll("`", "");
export const declarationsFor = (game) => game.lead?.declarations ?? [];
export function choiceHint(c, game) {
  const card = ACTION_CARDS[c.card];
  if (c.op === "play" && card) {
    const suit = c.mode === "copy" ? game.lead.suit : card.suit;
    const n = ["lead", "surpass"].includes(c.mode) ? card.pips : 1;
    return `${n} action${n === 1 ? "" : "s"} · ${SUITS[suit].map(cap).join(" / ")}${c.mode === "copy" ? " · played face down" : c.mode === "surpass" ? ` · beats the lead's ${game.lead.rank}` : c.mode === "pivot" ? " · played face up" : card.ambition ? ` · may declare ${cap(card.ambition)}` : card.rank === 7 ? " · may declare any ambition" : " · cannot declare an ambition"}`;
  }
  if (c.op === "declare") {
    const m = [...game.markers]
      .filter((m) => !m.ambition)
      .sort((a, b) => b.high - a.high)[0];
    const preserves =
      !c.zero ||
      (game.players[game.me].cards.includes("BC18") &&
        ["keeper", "empath"].includes(c.ambition));
    return `${m?.high ?? 0} / ${m?.low ?? 0} Power at chapter end · ${preserves ? "lead rank stays unchanged" : "lead rank becomes 0; action pips stay unchanged"}`;
  }
  if (c.op === "endPrelude")
    return "Keep your card pips. Resource spending and Prelude abilities close for this turn.";
  if (c.op === "endTurn")
    return game.turn?.pips > 0
      ? `Leave ${game.turn.pips} unused action pip${game.turn.pips === 1 ? "" : "s"} and pass to the next player.`
      : "Pass to the next player.";
  if (c.op === "seize")
    return "Discard this extra card face down. Lock initiative for next round; this round's lead stays the same.";
  if (c.op === "pass")
    return "Pass the lead opportunity without playing a card.";
  if (c.op === "action") {
    const meaning =
      {
        move: "Move ships to an adjacent system.",
        build: "Place a ship or building at a legal site.",
        tax: "Gain a city’s resource; taxing a rival also captures an agent.",
        repair: "Repair one of your damaged pieces.",
        influence: "Place an agent on a Court card.",
        secure: "Take a Court card where you have the most agents.",
        battle: "Choose a rival in your ships’ system, then choose dice.",
      }[c.action] ?? "";
    const cost =
      c.cost === "pip"
        ? `Spend 1 card pip${game.turn?.prelude ? "; this ends your Prelude" : ""}.`
        : typeof c.cost === "number"
          ? `Spend the resource in slot ${c.cost + 1}; keep your card pips.`
          : "Bonus action · no card pip spent.";
    return `${meaning} ${cost}`;
  }
  if (c.op === "secureTarget")
    return CARDS[c.card]?.kind === "vox"
      ? "Resolve its Vox effect now, then discard it."
      : "Take this Guild. Its Prelude ability becomes usable on a later turn.";
  return null;
}
