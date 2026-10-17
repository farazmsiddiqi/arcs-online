const labels = {
  influenceTarget: "Influence",
  secureTarget: "Secure",
  bold: "Influence",
  ransack: "Ransack",
  confirmInfluence: "Confirm",
};
export function courtActions(game, card) {
  if (!card || game.decision?.actor !== game.me) return [];
  return (game.decision.choices ?? [])
    .filter((c) => c.card === card && labels[c.op])
    .map((c) => ({ ...c, actionLabel: labels[c.op] }));
}
