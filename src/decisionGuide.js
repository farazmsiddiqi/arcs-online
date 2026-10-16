import { ACTION_CARDS, CARDS } from "../game/data.js";
export const STATE_GUIDES = {
  freedomSeize: [
    "Take next round’s initiative, or leave it unchanged.",
    "Return to the current turn.",
  ],
  effects: [
    "Choose the effect you want to resolve first. Order can matter.",
    "Resolve that effect, then choose among those remaining.",
  ],
  arrangeResources: [
    "Keep your positions or rearrange the tokens. This is optional.",
    "Done returns to the interrupted action or turn.",
  ],
  reorder: [
    "Move tokens between slots; protection stays with the slot.",
    "Done saves the entire arrangement.",
  ],
  mulligan: [
    "Keep your opening hand, or replace it once.",
    "A redraw reveals new cards and cannot be undone.",
  ],
  archivist: [
    "Choose the Lore you want to keep. Inspect the art before choosing.",
    "Continue until the required Lore have been kept.",
  ],
  overflow: [
    "Choose a resource to return to the supply. You have more tokens than slots.",
    "Repeat only if still over capacity, then arrange the survivors.",
  ],
  revive: [
    "Choose a gate on the map for your replacement fleet.",
    "Resolve the rebuild, then finish your turn.",
  ],
  action: [
    "Choose a highlighted target for this action.",
    "Resolve its effects, then return to your action choices.",
  ],
  moveSelect: [
    "Your eligible fleet is selected when it fits the limit. Adjust it, then choose a destination.",
    "Click a glowing destination to move in one step.",
  ],
  moveTo: [
    "Choose an adjacent destination on the map.",
    "Move the selected ships together.",
  ],
  catapult: [
    "Stop here, or choose a highlighted system to continue.",
    "You choose which ships continue; others stay behind.",
  ],
  catapultSelect: [
    "Select the ships that should continue; leave the others here.",
    "Move the selected ships along your chosen route.",
  ],
  sprinter: [
    "Choose a highlighted origin to use the extra move, or skip it.",
    "Only eligible fresh ships can use this move.",
  ],
  sprintSelect: [
    "Choose fresh ships for the extra move.",
    "Resolve their movement before returning to your turn.",
  ],
  predictive: [
    "Select reinforcements, or continue with none.",
    "Chosen fresh ships enter this battle before it proceeds.",
  ],
  dice: [
    "Start with Skirmish, or adjust your pool before rolling.",
    "The roll commits earlier decisions and may cause losses.",
  ],
  reroll: [
    "Keep the roll, or use an available reroll ability.",
    "Choose eligible dice if rerolling; otherwise assign results.",
  ],
  rerollSelect: [
    "Select only the dice you want to reroll. None is a valid choice.",
    "New results replace those dice and cannot be undone.",
  ],
  hits: [
    "Click the piece that should take the next hit.",
    "Fresh becomes damaged; damaged is destroyed.",
  ],
  ransack: [
    "Choose a Court card to ransack.",
    "Resolve the card and any resulting effects.",
  ],
  raid: [
    "Choose what to steal with your remaining raid keys.",
    "Costs come from the target’s slot or Guild; skip to stop.",
  ],
  repairBonus: [
    "Click an eligible damaged ship, or skip this repair.",
    "Repeat until the bonus is used or declined.",
  ],
  gainChoice: [
    "Choose the resource token you want from the available supply.",
    "Resolve gains and any required storage decisions.",
  ],
  taxType: [
    "Choose the resource type for this gate city’s Tax.",
    "Gain that resource, then resolve the Tax effects.",
  ],
  agitatorWeapon: [
    "Choose which Weapon token to discard for the Agitator intercept.",
    "Discard that slot’s Weapon, then the battle continues with the hits.",
  ],
  cloudCost: [
    "Choose the matching resource to pay for the Cloud City.",
    "Spend that exact slot’s token and resolve the build.",
  ],
  ruthless: [
    "Decide whether another action is worth a hit to your building.",
    "Resolve the extra action, or continue without it.",
  ],
  mythic: [
    "Choose a token to change this planet permanently, or skip.",
    "That token becomes the planet’s resource type.",
  ],
  generous: [
    "Choose a Guild to give to the indicated rival.",
    "The transfer resolves before the declaration continues.",
  ],
  bold: [
    "Choose a Court card to influence, or stop.",
    "Each Court card may receive this effect once.",
  ],
  farseersRival: [
    "Choose whose hand to inspect. This reveals private information.",
    "Choose a card to exchange, or keep your hand.",
  ],
  farseersSwap: [
    "Choose a revealed card to take, or keep your current hand.",
    "If taking a card, choose one of yours to give back.",
  ],
  farseersGive: [
    "Choose the action card you will give back.",
    "Complete the exchange.",
  ],
  vox: [
    "Resolve the secured Vox using its printed effect.",
    "Finish its choices, then return to the interrupted turn.",
  ],
  prelude: [
    "Resolve this ability’s choices; its card explains the effect.",
    "Finish the ability before choosing another Prelude action.",
  ],
  special: [
    "Choose the target or payment for this card ability.",
    "Finish its effects before returning to the action.",
  ],
  freeChoice: [
    "Choose a target for this bonus action, or skip it.",
    "Resolve the bonus before the original action continues.",
  ],
  steal: [
    "Choose an available resource or Guild to take.",
    "Resolve its transfer and any storage decisions.",
  ],
  interest: [
    "Take the offered resource, or stop collecting.",
    "Continue while the ability allows it and space remains.",
  ],
  placeFleet: [
    "Choose a system you control on the map.",
    "Place the available fleet, then resume your turn.",
  ],
  union: [
    "Choose an eligible played card to reserve for round end.",
    "It returns at the round boundary, not immediately.",
  ],
  farseersDiscard: [
    "Select any cards to replace. Keeping all of them is allowed.",
    "Draw replacements plus the Farseers card; this reveals new information.",
  ],
  relicFence: [
    "Choose the resource you want to trade away.",
    "Discard it and gain a relic, then arrange resources if needed.",
  ],
};
export function guideFor(game) {
  const kind = game.decision?.context?.kind;
  if (kind && STATE_GUIDES[kind]) return STATE_GUIDES[kind];
  if (game.phase === "over")
    return [
      "The game is complete. Compare final Power and chapter scoring.",
      "History and card references remain available.",
    ];
  if (game.phase === "draft")
    return [
      "Choose a leader or Lore; inspect cards before drafting.",
      "Fill your draft requirements, then begin the first card turn.",
    ];
  if (game.phase === "card")
    return [
      "Select a card, then choose how to play it. Selection alone does not play it.",
      "Your mode determines the action suit and pip budget.",
    ];
  if (game.turn?.prelude)
    return [
      "Optional: declare, seize, spend a resource, or use an ability.",
      "Finish Prelude keeps your card pips and closes resource spending.",
    ];
  return [
    "Choose an action; highlighted objects show where it can happen.",
    "Resolve each action fully, then use another pip or end your turn.",
  ];
}
export function choiceObject(c, game) {
  const card = c.card ?? (ACTION_CARDS[c.target] ? c.target : null);
  if (card && (CARDS[card] || ACTION_CARDS[card]))
    return { kind: "card", id: card };
  const piece = game.pieces?.find((p) => p.id === (c.piece ?? c.own));
  if (piece) return { kind: "piece", piece };
  if (c.op === "spendTrophy" || c.op === "spendCaptive") {
    const p =
      game.players[game.me][c.op === "spendTrophy" ? "trophies" : "captives"][
        c.index
      ];
    if (p) return { kind: "piece", piece: p };
  }
  const resource =
    c.resource ??
    (c.op === "weapons" ? game.players[game.me]?.resources[c.cost] : null) ??
    (c.op === "manufacture"
      ? { BC02: "material", BC09: "fuel" }[game.decision.context?.source]
      : null) ??
    (c.op === "stealResource"
      ? game.players[c.defender]?.resources[c.index]
      : ["discard", "cloudPay", "mythic", "fence", "swapSlot"].includes(c.op)
        ? game.players[game.me]?.resources[c.index]
        : c.op === "interestGain"
          ? game.decision.context?.resource
          : null);
  if (resource)
    return {
      kind: "resource",
      resource,
      keys:
        c.keys ??
        (Number.isInteger(c.index)
          ? game.resourceKeys?.[c.defender ?? game.me]?.[c.index]
          : null),
    };
  if (c.ambition) return { kind: "ambition", ambition: c.ambition };
  const player = c.rival ?? c.defender ?? c.to;
  if (Number.isInteger(player))
    return { kind: "player", player: game.players[player] };
  if (c.cluster) return { kind: "sector", cluster: c.cluster };
  if (c.n !== undefined) return { kind: "count", n: c.n };
  if (c.op === "effect") return { kind: "sequence", n: c.index + 1 };
  return { kind: "symbol", op: c.op };
}
export function dicePreset(form, mode = "skirmish") {
  const pool = { skirmish: 0, assault: 0, raid: 0 };
  const order =
    mode === "raid"
      ? ["raid", "skirmish", "assault"]
      : mode === "assault"
        ? ["assault", "skirmish", "raid"]
        : ["skirmish"];
  for (let n = 0; n < Math.min(form.max, 18); n++) {
    const type = order.find(
      (t) =>
        pool[t] < (t === "raid" ? form.raidMax : 6) &&
        (!form.corsair || t !== "assault" || pool.assault < pool.skirmish),
    );
    if (!type) break;
    pool[type]++;
  }
  return pool;
}
