import { CARDS } from "../game/data.js";

// C-6: one-click choices that commit, or reveal a card, before the player has
// had a second look. `confirmFor` returns the wording of the confirm step for
// such a choice, or null when the choice needs no confirm. It reads only the
// player's own view, so it never names a hidden card.
//
// Placing an agent (influence, Bold) is not confirmed: Undo covers it. Ransack
// is, because it takes the card and refills the Court just as Secure does.
// Not confirmed on purpose: a Copy play (the card goes down face down, so
// undoing it reveals nothing) and the End turn button (it already has its own
// review in CommandPanel).
export const CONFIRM_OPS = [
  "pass",
  "play",
  "secureTarget",
  "ransack",
  "battleTarget",
];

const isCopy = (c) => c.op === "play" && c.mode === "copy";
const owns = (game, seat, id) =>
  game.players[seat]?.leader === id || game.players[seat]?.cards?.includes(id);

export function confirmFor(choice, game) {
  if (!choice || !CONFIRM_OPS.includes(choice.op) || isCopy(choice))
    return null;
  if (choice.op === "pass")
    return {
      title: "Pass the initiative?",
      body: "You skip leading this round. The initiative marker goes to the next player with cards and the round ends. If everyone with cards passes in a row, the chapter ends. Passing cannot be undone.",
      confirm: "Confirm & pass",
    };
  if (choice.op === "play")
    return {
      title: `${choice.label}?`,
      body: "This card is played face up: every player sees it. If you undo later, they will still know it was in your hand.",
      confirm: "Confirm & play",
    };
  if (choice.op === "secureTarget" || choice.op === "ransack") {
    const card = CARDS[choice.card],
      refill = game.courtDeckCount > 0,
      detail =
        card?.kind === "vox"
          ? "Its Vox effect resolves now, then it is discarded."
          : choice.op === "ransack"
            ? "You take this card and take the rival agents on it as trophies."
            : "You take this card and capture the rival agents on it.";
    return {
      title: `${choice.op === "ransack" ? "Ransack" : "Secure"} ${card?.name ?? "this card"}?`,
      body: `${detail} ${
        refill
          ? "The Court then refills, which commits earlier decisions; Undo will no longer be available."
          : "The Court deck is empty, so nothing refills."
      }`,
      confirm:
        choice.op === "ransack" ? "Confirm & ransack" : "Confirm & secure",
    };
  }
  const defender = game.players[choice.defender],
    response = [
      ["L15", "Predictive Sensors"],
      ["L12", "Railgun Arrays"],
    ]
      .filter(([id]) => owns(game, choice.defender, id))
      .map(([, name]) => name);
  return {
    title: `${choice.label}?`,
    body: `You choose your dice next, and rolling cannot be undone.${
      response.length
        ? ` ${defender.name} holds ${response.join(" and ")} and may respond first, which commits earlier decisions.`
        : ""
    }`,
    confirm: "Confirm & start battle",
  };
}
