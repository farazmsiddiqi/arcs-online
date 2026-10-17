import { actionChanges, isForwardUpdate } from "./actionAnimations.js";
import { animationEvents } from "./pieceMotion.js";
import { CARDS } from "../game/data.js";
import { worldScenery } from "./boardAtmosphere.js";

// Only public pieces, public Court cards and recorded outcomes enter a scene.
export function cinematicPlan(before, after) {
  if (
    !before ||
    after._replay ||
    after.revision !== before.revision + 1 ||
    before.phase === "draft" ||
    !isForwardUpdate(before, after) ||
    after.log?.at(-1)?.history
  )
    return null;
  const changes = actionChanges(before, after),
    events = animationEvents(before, after);
  const impact = ["destroy", "damage", "loot"]
    .map((type) => events.find((e) => e.effect?.type === type))
    .find(Boolean);
  const roll = changes.find((c) => c.kind === "battle");
  const main =
    changes.find((c) => c.kind === "move") ??
    changes.find((c) => ["build", "repair", "tax", "reshape"].includes(c.kind));
  const secure = events.find((e) => e.animation?.kind === "secure")?.animation;
  const influence = changes.find((c) => c.kind === "influence" && c.delta > 0);
  const declaration = after.markers.some(
    (m, i) => m.ambition && m.ambition !== before.markers[i]?.ambition,
  );
  const scored = changes.filter((c) => c.kind === "power" && c.delta > 0);
  if (
    !impact &&
    !roll &&
    !main &&
    !secure &&
    !influence &&
    !declaration &&
    !scored.length
  )
    return null;
  const kind = impact
    ? impact.effect.type === "loot"
      ? "raid"
      : impact.effect.type
    : roll
      ? "battle"
      : (main?.kind ??
        (secure
          ? "secure"
          : influence
            ? "influence"
            : scored.length
              ? "score"
              : "ambition"));
  const system = impact?.effect.system ?? roll?.system ?? main?.system;
  const owner =
    kind === "score"
      ? scored.length === 1
        ? scored[0].owner
        : null
      : kind === "ambition"
        ? (events.find((e) => e.declaration)?.declaration.player ??
          after.current)
        : (impact?.effect.dealer ??
          impact?.effect.owner ??
          (roll
            ? after.lastBattle.attacker
            : (main?.owner ??
              secure?.owner ??
              influence?.owner ??
              after.current)));
  const defender = impact?.effect.owner ?? after.lastBattle?.defender;
  const publicPiece = (p) => ({
    id: p.id,
    owner: p.owner,
    type: p.type,
    damaged: p.damaged,
    system: p.system,
  });
  const affected = changes
    .filter((c) => c.kind === main?.kind && c.system === system)
    .map((c) => c.piece);
  const pieces = (
    kind === "move"
      ? after.pieces.filter((p) => affected.includes(p.id))
      : before.pieces.filter((p) => p.system === system)
  ).map(publicPiece);
  const target =
    before.pieces.find((p) => p.id === impact?.effect.piece) ??
    after.pieces.find((p) => p.id === main?.piece);
  const titles = {
    battle: "Opening salvo",
    damage: "Impact",
    destroy: "Confirmed destruction",
    raid: "Raid extraction",
    move: "Fleet in transit",
    build: "Construction",
    repair: "Repairs underway",
    tax: "Resource extraction",
    reshape: "A world transformed",
    secure: "Guild secured",
    influence: "Influence the Court",
    ambition: "An ambition declared",
    score: "Power earned",
  };
  const card = secure?.card ?? (influence && after.court[influence.index]?.id);
  return {
    id: after.revision,
    kind,
    system,
    from: main?.from,
    owner,
    defender,
    title:
      kind === "battle" &&
      before.lastBattle?.revision === after.lastBattle?.revision
        ? "Battle dice rerolled"
        : titles[kind],
    duration: ["battle", "move"].includes(kind)
      ? 4400
      : ["damage", "destroy", "raid"].includes(kind)
        ? 2600
        : 3200,
    name: after.players[owner]?.name ?? "The table",
    color: after.players[owner]?.color ?? "#d7bd85",
    rival: after.players[defender]?.name,
    pieces,
    target: target ? publicPiece(target) : null,
    world: worldScenery(after.clusters, after.overrides).find(
      (w) => w.id === system,
    ),
    resource: impact?.effect.resource ?? main?.resource,
    cargoCount: kind === "tax" ? (main.gained ?? 0) : kind === "raid" ? 1 : 0,
    count: main ? Math.max(1, affected.length) : influence?.delta,
    card: card && CARDS[card] ? { id: card, name: CARDS[card].name } : null,
    dice: roll
      ? after.lastBattle.dice.map((d) => ({
          type: d.type,
          faces: [...d.faces],
        }))
      : [],
    outcomes: events
      .filter((e) => e.effect && e.effect.system === system)
      .map((e) => ({ type: e.effect.type, piece: e.effect.piece })),
    summary:
      impact?.text ??
      events
        .map((e) => e.text)
        .join(" ")
        .slice(0, 350),
  };
}
export function scenePhase(scene, step) {
  return (
    {
      battle: [
        "Approach",
        "Exchange of fire",
        "Dice result · assign hits at the table",
      ],
      move: ["Departure", "Crossing the Reach", "Arrival"],
      build: ["Fabrication", "Assembly", "Ready"],
      repair: ["Docking", "Restoration", "Ready"],
      tax: ["Surface collection", "Cargo transfer", "Collected"],
      raid: ["Infiltration", "Extraction", "Loot recovered"],
      destroy: ["Target acquired", "Impact", "Aftermath"],
      damage: ["Target acquired", "Impact", "Damage recorded"],
    }[scene.kind]?.[step] ??
    ["The Reach", "Action in progress", "Recorded at the table"][step]
  );
}
