import {
  CARDS,
  RESOURCES,
  AMBITIONS,
  SUITS,
  COLORS,
  ACTION_CARDS,
  DICE,
  LEADER_SETUP,
  MAP,
  SETUPS,
  adjacent,
  RESOURCE_KEYS,
} from "./data.js";
export class RuleError extends Error {}
const ok = (v, m) => {
  if (!v) throw new RuleError(m);
};
const cap = (s) => s?.[0]?.toUpperCase() + s?.slice(1);
const remove = (a, v) => {
  const i = a.indexOf(v);
  if (i >= 0) a.splice(i, 1);
};
export const has = (s, p, id) =>
  s.players[p].cards.includes(id) || s.players[p].leader === id;
export const active = (s, a) => s.markers.some((m) => m.ambition === a);
export const piecesAt = (s, system, owner, type) =>
  s.pieces.filter(
    (x) =>
      (!system || x.system === system) &&
      (owner === undefined || x.owner === owner) &&
      (!type || x.type === type),
  );
export function control(s, system) {
  const counts = s.players.map(
    (p) => piecesAt(s, system, p.id, "ship").filter((x) => !x.damaged).length,
  );
  const n = Math.max(...counts);
  return n > 0 && counts.filter((x) => x === n).length === 1
    ? counts.indexOf(n)
    : null;
}
export function pool(s, p, type) {
  const available =
    (type === "city"
      ? 5
      : type === "starport"
        ? 5
        : type === "ship"
          ? 15
          : 10) -
    s.pieces.filter((x) => x.owner === p && x.type === type).length -
    s.players
      .flatMap((x) => [...x.trophies, ...x.captives])
      .filter((x) => x.owner === p && x.type === type).length -
    (s.players[p].scrap[type] ?? 0) -
    (type === "agent"
      ? s.court.reduce((n, c) => n + (c.agents[p] ?? 0), 0) +
        s.players[p].outrage.length
      : 0);
  return type === "agent" ? Math.max(0, available) : available;
}

export const capacity = (s, p) =>
  [6, 6, 6, 4, 3, 2][pool(s, p, "city")] + (has(s, p, "L13") ? 1 : 0);
export const resourceKeysFor = (s, p) => [
  ...RESOURCE_KEYS.slice(0, [6, 6, 6, 4, 3, 2][pool(s, p, "city")]),
  ...(has(s, p, "L13") ? [4] : []),
];
const cityBonus = (s, p) =>
  pool(s, p, "city") === 0 ? 5 : pool(s, p, "city") === 1 ? 2 : 0;
export const icons = (s, p, r) =>
  s.players[p].resources.filter((x) => x === r).length +
  s.players[p].cards.filter(
    (c) => CARDS[c]?.kind === "guild" && CARDS[c].resource === r,
  ).length;
export const systems = (s) =>
  Object.keys(MAP).filter((id) => s.clusters.includes(MAP[id].cluster));
export const planetType = (s, id) => s.overrides[id] ?? MAP[id].resource;
export function cityTypes(s, piece) {
  return MAP[piece.system].symbol === "gate"
    ? [
        ...new Set(
          piecesAt(s, null, undefined, "city")
            .filter(
              (x) =>
                MAP[x.system].cluster === MAP[piece.system].cluster &&
                MAP[x.system].symbol !== "gate",
            )
            .map((x) => planetType(s, x.system)),
        ),
      ]
    : [planetType(s, piece.system)];
}
// Item 16 (lenient timing): records the first new information a turn reveals
// (a roll or shuffle, a card drawn, a hand seen, a rival's response).
// Declaring and seizing close once the turn has both acted and revealed.
function reveal(s, reason) {
  if (s.turn && !s.turn.revealed) s.turn.revealed = reason;
}
export function random(s) {
  reveal(s, "dice");
  let a = (s.rng += 0x6d2b79f5);
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}
export function shuffle(s, list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// `at` places an event in the table history: the chapter and round it
// happened in and whose turn it was (the player in `current`).
export const log = (s, text, detail = {}) =>
  s.log.push({
    id: ++s.eventId,
    text,
    ...detail,
    at: { chapter: s.chapter, round: s.round, player: s.current },
  });
const title = (id) => CARDS[id]?.name ?? id;
// Dice faces are public. One short phrase per die type, for log lines.
const faceText = (faces) => (faces.length ? faces.join("+") : "blank");
const diceText = (dice) =>
  Object.keys(DICE)
    .flatMap((type) => {
      const of = dice.filter((d) => d.type === type);
      return of.length
        ? [`${type} ${of.map((d) => faceText(d.faces)).join(", ")}`]
        : [];
    })
    .join("; ") || "no dice";
const copyDice = (dice) =>
  dice.map((d) => ({ type: d.type, faces: [...d.faces] }));
// `battles` keeps every roll of the game (the view groups it by chapter);
// `lastBattle` stays the latest one for the live dice displays.
function recordBattle(s, battle) {
  s.lastBattle = battle;
  s.battles.push({
    ...battle,
    dice: copyDice(battle.dice),
    rerolls: [],
    at: { chapter: s.chapter, round: s.round, player: s.current },
  });
}
// Called after dice were rerolled in place: refresh the record and name it.
function recordReroll(s, ability) {
  const b = s.battles.at(-1);
  if (!b) return;
  b.dice = copyDice(s.lastBattle.dice);
  b.rerolls.push(ability);
}
export function place(s, p, type, system, n = 1, damaged = false) {
  const ids = [];
  for (let i = 0; i < n && pool(s, p, type) > 0; i++) {
    const v = { id: `p${++s.pieceId}`, owner: p, type, system, damaged };
    s.pieces.push(v);
    ids.push(v.id);
  }
  return ids;
}
const cardDeck = (n) =>
  Object.values(ACTION_CARDS)
    .filter((c) => n === 4 || (c.rank !== 1 && c.rank !== 7))
    .map((c) => c.id);
export function createGame(names, options = {}, seed = Date.now() >>> 0) {
  ok(names.length >= 2 && names.length <= 4, "Arcs supports 2–4 players.");
  let s = {
    schema: 1,
    rng: seed,
    revision: 0,
    eventId: 0,
    pieceId: 0,
    phase: "setup",
    chapter: 1,
    round: 1,
    initiative: 0,
    current: 0,
    roundLeader: 0,
    seized: false,
    passes: [],
    lead: null,
    played: [],
    turn: null,
    options: { leaders: !!options.leaders, doubleLore: !!options.doubleLore },
    players: names.map((name, id) => ({
      id,
      name: String(name).trim().slice(0, 32) || `Commander ${id + 1}`,
      color: COLORS[id],
      power: 0,
      hand: [],
      cards: [],
      leader: null,
      resources: [],
      trophies: [],
      captives: [],
      outrage: [],
      scrap: {},
      acquired: [],
    })),
    pieces: [],
    supply: Object.fromEntries(RESOURCES.map((r) => [r, 5])),
    held: [],
    court: [],
    courtDeck: [],
    courtDiscard: [],
    discardUp: [],
    discardDown: [],
    markers: [
      { id: 0, high: 2, low: 0, flipped: false, ambition: null },
      { id: 1, high: 3, low: 2, flipped: false, ambition: null },
      { id: 2, high: 5, low: 3, flipped: false, ambition: null },
    ],
    neutral: { tycoon: 0, tyrant: 0, warlord: 0, keeper: 0, empath: 0 },
    pending: [],
    overrides: {},
    unions: [],
    log: [],
    lastBattle: null,
    battles: [],
    scoreHistory: [],
  };
  s.initiative = options.initiative ?? Math.floor(random(s) * names.length);
  s.current = s.initiative;
  s.roundLeader = s.initiative;
  const setupIds = Object.keys(SETUPS).filter(
    (k) => SETUPS[k].players === names.length,
  );
  s.setupId =
    options.setupId ?? setupIds[Math.floor(random(s) * setupIds.length)];
  ok(
    SETUPS[s.setupId]?.players === names.length,
    "Choose a setup for this player count.",
  );
  s.clusters = SETUPS[s.setupId].clusters;
  if (names.length === 2)
    for (const m of Object.values(MAP).filter(
      (m) => m.resource && !s.clusters.includes(m.cluster),
    )) {
      s.supply[m.resource]--;
      s.neutral[
        {
          material: "tycoon",
          fuel: "tycoon",
          weapon: "warlord",
          relic: "keeper",
          psionic: "empath",
        }[m.resource]
      ]++;
    }
  s.courtDeck = shuffle(
    s,
    Object.keys(CARDS).filter((id) => /^BC\d/.test(id)),
  );
  for (let i = 0; i < (names.length === 2 ? 3 : 4); i++)
    s.court.push({ id: s.courtDeck.shift(), agents: names.map(() => 0) });
  log(
    s,
    `A new game begins. ${names.length} commanders · ${SETUPS[s.setupId].name}.`,
  );
  if (options.leaders) {
    s.phase = "draft";
    s.draft = {
      leaders: shuffle(s, Object.keys(LEADER_SETUP)).slice(0, names.length + 1),
      lore: shuffle(
        s,
        Object.keys(CARDS).filter((id) => /^L\d/.test(id)),
      ).slice(0, names.length * (options.doubleLore ? 2 : 1) + 1),
      remaining: [],
    };
    s.current = (s.initiative + names.length - 1) % names.length;
    s.draft.remaining = Object.keys(CARDS).filter(
      (id) => /^L\d/.test(id) && !s.draft.lore.includes(id),
    );
  } else setupPlayers(s);
  pump(s);
  return s;
}
function setupPlayers(s) {
  const n = s.players.length;
  for (let order = 0; order < n; order++) {
    const p = (s.initiative + order) % n,
      pl = s.players[p],
      [a, b, ...cc] = SETUPS[s.setupId].positions[order];
    const l = LEADER_SETUP[pl.leader] ?? [
      planetType(s, a),
      planetType(s, b),
      3,
      "city",
      3,
      "starport",
      2,
    ];
    if (pl.leader === "LEAD10") pl.scrap = { ship: 2, agent: 3 };
    if (pl.leader === "LEAD13") pl.scrap = { city: 2 };
    place(s, p, "ship", a, l[2]);
    if (l[3]) place(s, p, l[3], a);
    place(s, p, "ship", b, l[4]);
    if (l[5]) place(s, p, l[5], b);
    for (const c of cc) place(s, p, "ship", c, l[6]);
    pl.resources = Array(capacity(s, p)).fill(null);
    for (const r of l.slice(0, 2)) gain(s, p, r);
    pl.needsArrange = false;
    if (pl.leader === "LEAD02") pl.outrage = ["material", "fuel"];
    if (pl.leader === "LEAD16") pl.outrage = ["material"];
    if (pl.leader === "LEAD09") {
      const choices = shuffle(s, s.draft.remaining).slice(0, 5);
      s.draft.remaining = s.draft.remaining.filter((x) => !choices.includes(x));
      s.pending.push({ type: "archivist", p, choices, left: 2 });
    }
  }
  s.phase = "card";
  s.current = s.initiative;
  deal(s);
  log(s, "Fleets deployed. Six action cards dealt to every commander.");
}
function deal(s) {
  const deck = shuffle(s, cardDeck(s.players.length));
  for (const p of s.players) p.hand = deck.splice(0, 6);
  s.discardDown = shuffle(s, deck);
  s.discardUp = [];
  if (s.players.length === 2)
    s.pending.push({ type: "mulligan", p: (s.initiative + 1) % 2 });
}
// Rulebook Fine Print, Split Discard Piles: cards played face up go to their
// own pile (`discardUp`, kept with the round for the table's viewer); draws
// take the bottom of the face-down pile, shuffling both piles together first
// when it is short.
function drawDiscard(s, n, meta = {}) {
  if (s.discardDown.length < n && s.discardUp.length) {
    const up = s.discardUp.length,
      // These cards were played face up, so naming them leaks nothing. Only
      // the face-up pile is recorded: never a face-down card or the order.
      merge = {
        chapter: s.chapter,
        round: s.round,
        cards: s.discardUp.map((x) => ({ ...x })),
      };
    s.discardDown = shuffle(s, [
      ...s.discardDown,
      ...s.discardUp.map((x) => x.card),
    ]);
    s.discardUp = [];
    meta.merged = true;
    log(
      s,
      `The face-down action discard is short: ${up} face-up ${up === 1 ? "card is" : "cards are"} shuffled into it.`,
      { merge },
    );
  }
  return s.discardDown.splice(0, n);
}
// What the table history records about a draw from the action discard: who,
// how many, why, and whether the face-up pile was shuffled in first. Never
// which cards.
const drawRecord = (player, count, via, meta) => ({
  player,
  count,
  via,
  merged: !!meta.merged,
});
function gain(s, p, r) {
  if (!r || s.supply[r] <= 0) return false;
  s.players[p].needsArrange = true;
  s.supply[r]--;
  addToken(s.players[p], r);
  return true;
}
// Moves the resource on a card's slot with the card when it is stolen.
function carryCardSlot(s, from, to) {
  const f = s.players[from],
    t = s.players[to];
  if (!(f.cardSlot ?? true)) return;
  const held = f.resources.pop() ?? null;
  f.cardSlot = false;
  t.resources.push(held);
  t.cardSlot = true;
}
// Ancient Holdings (L13) adds a slot that is always the last index. `cardSlot`
// records whether the array currently ends with it, so board slots can grow
// and shrink around it without moving the token it holds.
function addToken(pl, r) {
  const empty = pl.resources.indexOf(null);
  if (empty >= 0) pl.resources[empty] = r;
  else pl.resources.splice(pl.resources.length - (pl.cardSlot ? 1 : 0), 0, r);
}
function cleanResources(s) {
  for (const p of s.players) {
    const card = has(s, p.id, "L13"),
      cap = capacity(s, p.id),
      boardCap = cap - (card ? 1 : 0),
      had = p.cardSlot ?? card;
    let held = had ? (p.resources.pop() ?? null) : null;
    if (had && !card && held) {
      // Rulebook: a card that is buried, discarded or scrapped returns its
      // resources to the supply (a stolen card carries them; see steal).
      s.supply[held]++;
      held = null;
    }
    if (p.resources.length > boardCap) p.needsArrange = true;
    if (p.resources.length < boardCap)
      p.resources.push(...Array(boardCap - p.resources.length).fill(null));
    while (p.resources.length > boardCap && p.resources.includes(null))
      remove(p.resources, null);
    // An empty card slot absorbs a board token that would otherwise overflow.
    if (card && !held && p.resources.length > boardCap)
      held = p.resources.pop();
    if (card) p.resources.push(held);
    p.cardSlot = card;
    if (
      p.resources.length > cap &&
      !s.pending.some((t) => t.type === "overflow" && t.p === p.id)
    ) {
      s.pending.unshift({ type: "overflow", p: p.id });
      return false;
    }
  }
  for (const p of s.players)
    if (
      p.needsArrange &&
      !s.pending.some((t) => t.type === "arrangeResources" && t.p === p.id)
    ) {
      p.needsArrange = false;
      s.pending.unshift({ type: "arrangeResources", p: p.id });
      return false;
    }
  return true;
}
function discardResource(s, p, index, hold = false) {
  const pl = s.players[p],
    r = pl.resources[index];
  ok(r, "No resource in this slot.");
  pl.resources[index] = null;
  if (hold) s.held.push(r);
  else s.supply[r]++;
  return r;
}
function discardCard(s, p, id, bury = false) {
  remove(s.players[p].cards, id);
  (bury ? s.courtDeck : s.courtDiscard).push(id);
}
function outrage(s, p, r) {
  if (!r) return;
  const pl = s.players[p];
  for (let i = pl.resources.length - 1; i >= 0; i--)
    if (pl.resources[i] === r) discardResource(s, p, i);
  for (const id of [...pl.cards])
    if (
      CARDS[id]?.kind === "guild" &&
      CARDS[id].resource === r &&
      !["BC01", "BC07", "BC15", "BC19", "BC21"].includes(id)
    )
      discardCard(s, p, id);
  if (!pl.outrage.includes(r)) pl.outrage.push(r);
  log(s, `${pl.name} provokes ${r} Outrage.`);
}
function secure(s, p, index, ransack = false) {
  const lane = s.court[index];
  ok(lane?.id, "That Court slot is empty.");
  const id = lane.id;
  for (let owner = 0; owner < s.players.length; owner++)
    if (owner !== p)
      for (let i = 0; i < lane.agents[owner]; i++)
        s.players[p][ransack ? "trophies" : "captives"].push({
          id: `p${++s.pieceId}`,
          type: "agent",
          owner,
        });
  lane.agents.fill(0);
  lane.id = null;
  s.players[p].cards.push(id);
  s.players[p].acquired.push(id);
  log(
    s,
    `${s.players[p].name} ${ransack ? "ransacks" : "secures"} ${title(id)}.`,
    { card: id, animation: { kind: "secure", index, owner: p, card: id } },
  );
  if (CARDS[id].kind === "vox")
    s.pending.unshift({ type: "vox", p, id, index });
  else refill(s, index);
}
function refill(s, i) {
  if (!s.court[i].id && !s.court[i].temporary) {
    s.court[i].id = s.courtDeck.shift() ?? null;
    if (s.court[i].id) reveal(s, "deck");
  }
}
function push(s, ...tasks) {
  s.pending.unshift(...tasks.filter(Boolean));
}
function pushEffects(s, tasks) {
  if (tasks.length > 1)
    push(s, { type: "effects", p: s.turn ? s.current : s.initiative, tasks });
  else push(s, ...tasks);
}
function finishVox(s, t, shuffleBack = false) {
  discardCard(s, t.p, t.id);
  if (shuffleBack) {
    remove(s.courtDiscard, t.id);
    s.courtDeck = shuffle(s, [...s.courtDeck, t.id]);
  }
  refill(s, t.index);
}
const choose = (label, op, data = {}, extra = {}) => ({
  label,
  op,
  ...data,
  ...extra,
});
const sysName = (id) =>
  `${MAP[id].cluster} ${MAP[id].symbol === "gate" ? "Gate" : MAP[id].symbol === "arrow" ? "▲" : MAP[id].symbol === "hex" ? "⬡" : "☾"}`;
const pieceName = (s, x) =>
  `${s.players[x.owner].name} ${x.damaged ? "damaged " : ""}${x.type} · ${sysName(x.system)}`;
const copied = (s) => ["copy", "pivot"].includes(s.turn?.mode);
function canSeize(s, p) {
  return !s.seized && s.initiative !== p;
}
function seize(s, p) {
  ok(canSeize(s, p), "The initiative cannot be seized now.");
  s.initiative = p;
  s.seized = true;
  log(s, `${s.players[p].name} seizes the initiative.`);
}
function canDeclare(s, p) {
  return (
    s.markers.some((x) => !x.ambition) &&
    (!has(s, p, "LEAD07") ||
      s.players[p].cards.some((id) => CARDS[id].kind === "guild"))
  );
}
// `lead` marks the lead-card declaration, which is limited to once per turn.
// Declarations from Populist Demands and Tycoon's Ambition are separate cards
// with their own limits, so they never use up the lead card's.
function declare(s, p, a, zero, paid = false, lead = false) {
  ok(paid || canDeclare(s, p), "No ambition can be declared.");
  if (has(s, p, "LEAD07") && !paid) {
    push(s, { type: "generous", p, ambition: a, zero, lead });
    return;
  }
  const marker = s.markers
    .filter((m) => !m.ambition)
    .sort((a, b) => b.high - a.high)[0];
  const was = active(s, a);
  marker.ambition = a;
  const placesZero = !!(
    zero && !(has(s, p, "BC18") && ["keeper", "empath"].includes(a))
  );
  if (placesZero) s.lead.rank = 0;
  const declaration = {
    player: p,
    ambition: a,
    high: marker.high,
    low: marker.low,
    zero: placesZero,
  };
  if (s.lead) (s.lead.declarations ??= []).push(declaration);
  if (lead) s.turn.leadDeclared = true;
  s.roundDeclared = true;
  log(s, `${s.players[p].name} declares ${a} (${marker.high}/${marker.low}).`, {
    declaration,
  });
  const tasks = [];

  if (has(s, p, "LEAD04"))
    tasks.push({ type: "gainChoice", p, count: 1, reason: "Ambitious" });
  if (has(s, p, "LEAD08")) tasks.push({ type: "bold", p, used: [] });
  if (has(s, p, "LEAD12") && !was && s.courtDeck.length)
    tasks.push({ type: "noble", p, reason: "Noble · Connected" });
  if (has(s, p, "BC17"))
    tasks.push({ type: "farseersRival", p, reason: "Farseers" });
  pushEffects(s, tasks);
}
function endPrelude(s) {
  for (const r of s.held) s.supply[r]++;
  s.held = [];
  s.turn.prelude = false;
}
function pay(s, p, cost, action) {
  ok(s.turn && s.current === p, "It is not your turn.");
  if (cost === "pip") {
    ok(s.turn.pips > 0, "No action pips remain.");
    ok(
      SUITS[s.turn.suit].includes(action) ||
        (action === "battle" && s.turn.weapons),
      "This card does not allow that action.",
    );
    endPrelude(s);
    s.turn.pips--;
  } else if (typeof cost === "number") {
    ok(s.turn.prelude, "Resources can be spent only in Prelude.");
    const r = discardResource(s, p, cost, true);
    const allowed = resourceActions(s, p, r);
    ok(allowed.includes(action), "This resource does not allow that action.");
  } else if (cost === "free") {
  } else throw new RuleError("Unknown action cost");
  s.turn.acted = true;
}
function resourceActions(s, p, r) {
  const types = [
    r,
    ...[
      ["BC01", "material"],
      ["BC07", "fuel"],
      ["BC15", "weapon"],
      ["BC19", "psionic"],
      ["BC21", "relic"],
    ]
      .filter(([id]) => has(s, p, id))
      .map(([, r]) => r),
  ];
  return [
    ...new Set(
      types
        .filter(
          (t) =>
            !s.players[p].outrage.includes(t) ||
            has(
              s,
              p,
              {
                material: "BC01",
                fuel: "BC07",
                weapon: "BC15",
                psionic: "BC19",
                relic: "BC21",
              }[t],
            ),
        )
        .flatMap(
          (t) =>
            ({
              material: ["build", "repair"],
              fuel: ["move"],
              weapon: ["weapons"],
              relic: ["secure"],
              psionic: SUITS[s.lead?.suit] ?? [],
            })[t],
        ),
    ),
  ];
}
function actionLabel(a, cost, r) {
  return `${cap(a)}${cost === "pip" ? "" : ` · spend ${r}`}`;
}
function eligibleCities(s, p) {
  return s.pieces
    .filter((x) => x.type === "city")
    .filter((x) => {
      const loyal = x.owner === p,
        ctrl = control(s, x.system),
        inspiring =
          has(s, p, "LEAD13") && piecesAt(s, x.system, p, "ship").length > 0,
        bond = has(s, p, "L20") && active(s, "empath");
      if (has(s, p, "LEAD13") && loyal) return false;
      if (has(s, p, "LEAD04") && ctrl !== p) return false;
      return (
        (loyal || ctrl === p || inspiring || bond) &&
        (!s.turn.taxed.includes(x.id) ||
          (has(s, p, "L23") && active(s, "warlord")))
      );
    });
}
function eligiblePorts(s, p) {
  return s.pieces.filter(
    (x) =>
      x.type === "starport" &&
      (x.owner === p || (has(s, p, "L20") && active(s, "empath"))) &&
      !s.turn.built.includes(x.id),
  );
}
function buildSites(s, p, type) {
  return systems(s).filter((id) => {
    if (!piecesAt(s, id, p).length) return false;
    const m = MAP[id],
      buildings = piecesAt(s, id).filter((x) => x.type !== "ship");
    if (m.symbol === "gate")
      return (
        has(s, p, type === "city" ? "L11" : "L08") &&
        !buildings.some((x) => x.type === type)
      );
    return buildings.filter((x) => !x.cloud).length < m.slots;
  });
}
function taxTargets(s, p) {
  let cs = eligibleCities(s, p).map((x) =>
    choose(
      `Tax ${pieceName(s, x)}`,
      "taxTarget",
      { piece: x.id },
      { system: x.system },
    ),
  );
  if (has(s, p, "LEAD13"))
    for (const id of systems(s).filter(
      (id) => MAP[id].slots && piecesAt(s, id, p, "ship").length,
    ))
      for (
        let i = piecesAt(s, id).filter(
          (x) => x.type !== "ship" && !x.cloud,
        ).length;
        i < MAP[id].slots;
        i++
      ) {
        const key = `empty:${id}:${i}`;
        if (
          !s.turn.taxed.includes(key) ||
          (has(s, p, "L23") && active(s, "warlord"))
        )
          cs.push(
            choose(`Tax empty slot · ${sysName(id)}`, "taxTarget", {
              empty: key,
              system: id,
            }),
          );
      }
  return cs;
}
function actionTargets(s, p, a) {
  let choices = [];
  if (a === "tax") choices = taxTargets(s, p);
  if (a === "build") {
    for (const type of ["city", "starport"])
      if (pool(s, p, type) > 0)
        for (const id of buildSites(s, p, type))
          choices.push(
            choose(`Build ${type} · ${sysName(id)}`, "buildTarget", {
              kind: type,
              system: id,
            }),
          );
    if (pool(s, p, "ship") > 0)
      for (const b of eligiblePorts(s, p))
        choices.push(
          choose(`Build ship · ${sysName(b.system)}`, "buildTarget", {
            kind: "ship",
            system: b.system,
            port: b.id,
          }),
        );
    if (
      pool(s, p, "ship") === 0 &&
      has(s, p, "LEAD10") &&
      !s.turn.used.includes("ruthless")
    ) {
      for (const port of s.pieces.filter(
        (x) =>
          x.type === "starport" &&
          (x.owner === p || (has(s, p, "L20") && active(s, "empath"))),
      ))
        choices.push(
          choose(
            `Ruthless · hit starport with no ships in supply · ${sysName(port.system)}`,
            "ruthlessEmptyBuild",
            { piece: port.id, system: port.system },
          ),
        );
    }
    if (pool(s, p, "city") > 0 && has(s, p, "L09"))
      for (const id of systems(s).filter(
        (id) =>
          MAP[id].slots &&
          piecesAt(s, id, p).length &&
          !piecesAt(s, id).some((x) => x.cloud) &&
          s.players[p].resources.includes(planetType(s, id)),
      ))
        choices.push(
          choose(`Build cloud city · ${sysName(id)}`, "cloudTarget", {
            system: id,
          }),
        );
  }
  if (a === "repair")
    choices = piecesAt(s, null, p)
      .filter((x) => x.damaged)
      .map((x) =>
        choose(
          `Repair ${pieceName(s, x)}`,
          "repairTarget",
          { piece: x.id },
          { system: x.system },
        ),
      );
  if (a === "influence" && pool(s, p, "agent") > 0)
    choices = s.court.flatMap((c, index) =>
      c.id
        ? [
            choose(
              `Influence ${title(c.id)}`,
              "influenceTarget",
              { index },
              { card: c.id },
            ),
          ]
        : [],
    );
  if (a === "secure")
    choices = s.court.flatMap((c, index) =>
      c.id &&
      c.agents[p] > 0 &&
      c.agents.every((n, i) => i === p || n < c.agents[p]) &&
      !(has(s, p, "LEAD08") && CARDS[c.id].kind === "guild" && c.agents[p] < 2)
        ? [
            choose(
              `Secure ${title(c.id)}`,
              "secureTarget",
              { index },
              { card: c.id },
            ),
          ]
        : [],
    );
  if (a === "move")
    choices = systems(s)
      .filter((id) => piecesAt(s, id, p, "ship").length)
      .map((system) =>
        choose(`Move from ${sysName(system)}`, "moveFrom", { system }),
      );
  if (a === "battle")
    choices = systems(s)
      .filter((id) => piecesAt(s, id, p, "ship").length)
      .flatMap((system) =>
        s.players
          .filter((pl) => pl.id !== p && piecesAt(s, system, pl.id).length)
          .map((pl) =>
            choose(`Battle ${pl.name} · ${sysName(system)}`, "battleTarget", {
              system,
              defender: pl.id,
            }),
          ),
      );
  return choices;
}
function mainChoices(s, p) {
  const pl = s.players[p],
    t = s.turn;
  if (s.phase === "draft") {
    return [
      ...(!pl.leader
        ? s.draft.leaders.map((card) =>
            choose(`Choose ${title(card)}`, "draft", { card }, { card }),
          )
        : []),
      ...(pl.cards.length < (s.options.doubleLore ? 2 : 1)
        ? s.draft.lore.map((card) =>
            choose(`Choose ${title(card)}`, "draft", { card }, { card }),
          )
        : []),
    ];
  }
  if (s.phase === "card")
    return [
      ...pl.hand.flatMap((card) => {
        const c = ACTION_CARDS[card];
        return !s.lead
          ? [
              choose(`Lead ${cap(c.suit)} ${c.rank}`, "play", {
                card,
                mode: "lead",
              }),
            ]
          : [
              choose(`Copy with ${cap(c.suit)} ${c.rank}`, "play", {
                card,
                mode: "copy",
              }),
              ...(c.suit !== s.lead.suit
                ? [
                    choose(`Pivot · ${cap(c.suit)} ${c.rank}`, "play", {
                      card,
                      mode: "pivot",
                    }),
                  ]
                : c.rank > s.lead.rank
                  ? [
                      choose(`Surpass · ${cap(c.suit)} ${c.rank}`, "play", {
                        card,
                        mode: "surpass",
                      }),
                    ]
                  : []),
            ];
      }),
      ...(!s.lead ? [choose("Pass initiative", "pass")] : []),
    ];
  if (s.phase !== "turn") return [];
  const out = [];
  let latticeListed = false;
  // Item 16 (rulebook, Turn Etiquette): declaring and seizing come before
  // actions, but stay open after them until the turn reveals something new.
  if (!t.acted || !t.revealed) {
    const played = ACTION_CARDS[t.card];
    // Upstart and Galactic Bards print "before taking any actions".
    const lead = t.mode === "lead" && !(t.acted && has(s, p, "LEAD04")),
      bards =
        !t.acted &&
        has(s, p, "BC25") &&
        ["surpass", "pivot"].includes(t.mode) &&
        !s.roundDeclared;
    if (!t.leadDeclared && canDeclare(s, p) && (lead || bards)) {
      for (const ambition of played.rank === 7
        ? AMBITIONS
        : played.ambition
          ? [played.ambition]
          : [])
        out.push(
          choose(
            `Declare ${cap(ambition)}`,
            "declare",
            { ambition, zero: t.mode === "lead" },
            { group: "Before actions" },
          ),
        );
    }
    if (canSeize(s, p) && !t.seizeDecision) {
      for (const card of pl.hand)
        out.push(
          choose(
            `Seize · discard ${cap(ACTION_CARDS[card].suit)} ${ACTION_CARDS[card].rank}`,
            "seize",
            { card },
            { group: "Before actions" },
          ),
        );
      // Lattice Spies: "Before any other actions".
      if (!t.acted && has(s, p, "BC16") && !pl.acquired.includes("BC16")) {
        latticeListed = true;
        out.push(
          choose(
            "Seize with Lattice Spies",
            "guild",
            { card: "BC16" },
            { group: "Before actions" },
          ),
        );
      }
    }
  }
  const costs = [
    ...(t.pips > 0
      ? [
          {
            cost: "pip",
            acts: [
              ...SUITS[t.suit],
              ...(t.weapons && !SUITS[t.suit].includes("battle")
                ? ["battle"]
                : []),
            ],
          },
        ]
      : []),
    ...(t.prelude
      ? pl.resources.flatMap((r, i) =>
          r ? [{ cost: i, acts: resourceActions(s, p, r), r }] : [],
        )
      : []),
  ];
  for (const { cost, acts, r } of costs)
    for (const action of acts) {
      if (action === "weapons" && !t.weapons)
        out.push(
          choose(
            "Prepare weapons",
            "weapons",
            { cost },
            { group: `Prelude · slot ${cost + 1}` },
          ),
        );
      else if (
        actionTargets(s, p, action).length ||
        specialTargets(s, p, action, cost).length ||
        (cost === "pip" &&
          copied(s) &&
          ((action === "secure" &&
            has(s, p, "LEAD07") &&
            actionTargets(s, p, "influence").length) ||
            (action === "battle" &&
              has(s, p, "LEAD06") &&
              actionTargets(s, p, "move").length)))
      )
        out.push(
          choose(
            actionLabel(action, cost, r),
            "action",
            { action, cost },
            {
              group:
                cost === "pip" ? "Card actions" : `Prelude · slot ${cost + 1}`,
            },
          ),
        );
    }
  if (t.prelude)
    for (const card of pl.cards.filter((c) => !pl.acquired.includes(c)))
      // Lattice Spies is already listed under "Before actions" when it can seize.
      if (!(card === "BC16" && latticeListed) && preludeAvailable(s, p, card))
        out.push(
          choose(
            title(card),
            "guild",
            { card },
            { card, group: "Prelude · abilities" },
          ),
        );

  if (t.prelude)
    out.push(choose("Finish Prelude", "endPrelude", {}, { group: "Turn" }));
  out.push(choose("End turn", "endTurn", {}, { group: "Turn" }));
  return out;
}
export function decision(s, p) {
  if (s.phase === "over")
    return {
      actor: null,
      title: `${s.players[s.winner].name} wins`,
      choices: [],
    };
  const task = s.pending[0];
  let actor = task?.p ?? s.current;
  if (actor !== p)
    return {
      actor,
      title: `Waiting for ${s.players[actor]?.name}`,
      choices: [],
    };
  if (task) {
    const d = taskDecision(s, task);
    return {
      actor,
      ...d,
      ...(d.form && task.back ? { canCancel: true } : {}),
      context: {
        kind: task.type,
        source: CARDS[task.card ?? task.id] ? (task.card ?? task.id) : null,
        resource: task.resource ?? null,
        action: task.action ?? null,
      },
      choices:
        d.choices?.map((c, id) => ({
          ...c,
          ...(c.piece && !c.system
            ? { system: s.pieces.find((p) => p.id === c.piece)?.system }
            : {}),
          id,
        })) ?? [],
    };
  }
  return {
    actor,
    title:
      s.phase === "draft"
        ? "Draft a leader or lore"
        : s.phase === "card"
          ? s.lead
            ? "Respond to the lead card"
            : "Lead the round"
          : s.turn.prelude
            ? "Your Prelude"
            : "Take your actions",
    choices: mainChoices(s, p).map((c, id) => ({ ...c, id })),
  };
}
export function transition(state, p, input) {
  const s = structuredClone(state);
  const d = decision(s, p);
  ok(d.actor === p, "Wait for your turn.");
  if (d.form && input.cancel) {
    ok(d.canCancel, "There is nothing to go back to.");
    cancelTask(s, s.pending.shift());
  } else if (d.form) {
    resolveForm(s, s.pending.shift(), input.value);
  } else {
    ok(Number.isInteger(input.choice), "Choose a legal action.");
    const c = d.choices[input.choice];
    ok(c, "This choice is not available.");
    if (s.pending.length) resolveTask(s, s.pending.shift(), c);
    else resolveMain(s, p, c);
  }
  pump(s);
  // Another player now has a decision; what they choose is new information.
  if ((s.pending[0]?.p ?? s.current) !== s.current) reveal(s, "rival");
  s.revision++;
  assertInvariants(s);
  return s;
}
// "Back" from a decision opened by choosing something earlier. Nothing is
// paid or changed before the form is confirmed, so Back re-offers the parent
// task exactly as it was (a `required` flag and its rollback ride along).
function cancelTask(s, t) {
  if (typeof t.actedBefore === "boolean") s.turn.acted = t.actedBefore;
  if (t.back) push(s, t.back);
}
function resolveMain(s, p, c) {
  const pl = s.players[p];
  switch (c.op) {
    case "draft":
      if (CARDS[c.card].kind === "leader") {
        pl.leader = c.card;
        remove(s.draft.leaders, c.card);
      } else {
        pl.cards.push(c.card);
        remove(s.draft.lore, c.card);
      }
      log(s, `${pl.name} drafts ${title(c.card)}.`, { card: c.card });
      if (
        s.players.every(
          (x) => x.leader && x.cards.length === (s.options.doubleLore ? 2 : 1),
        )
      ) {
        setupPlayers(s);
      } else {
        do {
          s.current = (s.current + s.players.length - 1) % s.players.length;
        } while (
          s.players[s.current].leader &&
          s.players[s.current].cards.length === (s.options.doubleLore ? 2 : 1)
        );
      }
      break;
    case "play": {
      remove(pl.hand, c.card);
      const ac = ACTION_CARDS[c.card];
      if (!s.lead) {
        s.lead = { ...ac, player: p };
        s.roundLeader = p;
      }
      s.played.push({
        card: c.card,
        player: p,
        mode: c.mode,
        faceup: c.mode !== "copy",
      });
      s.phase = "turn";
      s.passes = [];
      pl.acquired = [];
      s.turn = {
        card: c.card,
        suit: c.mode === "copy" ? s.lead.suit : ac.suit,
        pips: ["lead", "surpass"].includes(c.mode) ? ac.pips : 1,
        mode: c.mode,
        prelude: true,
        acted: false,
        revealed: false,
        leadDeclared: false,
        taxed: [],
        built: [],
        used: [],
        weapons: false,
      };
      if (c.mode === "surpass" && ac.rank === 7 && canSeize(s, p)) seize(s, p);
      log(
        s,
        `${pl.name} ${c.mode === "copy" ? "copies the lead" : `${c.mode}s with ${cap(ac.suit)} ${ac.rank}`}.`,
        { card: c.mode === "copy" ? null : c.card },
      );
      break;
    }
    case "pass":
      s.passes.push(p);
      log(s, `${pl.name} passes initiative.`);
      // The marker passes on even with the last pass, so the first passer
      // opens the next chapter (and heads the game-end tie-break order).
      for (let i = 0; i < s.players.length; i++) {
        s.initiative = (s.initiative + 1) % s.players.length;
        if (s.players[s.initiative].hand.length) break;
      }
      if (
        s.players
          .filter((x) => x.hand.length)
          .every((x) => s.passes.includes(x.id))
      )
        endChapter(s);
      else {
        s.current = s.initiative;
        s.roundLeader = s.initiative;
        s.round++;
      }
      break;
    case "declare":
      declare(s, p, c.ambition, c.zero, false, true);
      break;
    case "seize":
      remove(pl.hand, c.card);
      s.played.push({ card: c.card, player: p, mode: "seize", faceup: false });
      seize(s, p);
      s.turn.seizeDecision = true;
      break;
    case "action":
      push(s, { type: "action", p, action: c.action, cost: c.cost });
      break;
    case "weapons":
      pay(s, p, c.cost, "weapons");
      s.turn.weapons = true;
      log(s, `${pl.name} prepares weapons.`);
      break;
    case "guild":
      usePrelude(s, p, c.card);
      break;
    case "endPrelude":
      endPrelude(s);
      break;
    case "endTurn":
      endPrelude(s);
      if (
        !s.pieces.some(
          (x) => x.owner === p && ["ship", "starport"].includes(x.type),
        ) &&
        pool(s, p, "ship") > 0
      )
        push(s, { type: "revive", p });
      else finishTurn(s);
      break;
  }
}
function finishTurn(s) {
  const p = s.current,
    n = s.players.length;
  log(s, `${s.players[p].name} ends their turn.`);
  s.turn = null;
  s.phase = "card";
  for (let i = 1; i < n; i++) {
    const next = (p + i) % n;
    if (next === s.roundLeader) break;
    if (s.players[next].hand.length) {
      s.current = next;
      return;
    }
  }
  endRound(s);
}
function endRound(s) {
  if (!s.seized) {
    const highest = s.played
      .filter((x) => x.mode === "surpass")
      .sort((a, b) => ACTION_CARDS[b.card].rank - ACTION_CARDS[a.card].rank)[0];
    if (highest) s.initiative = highest.player;
  }
  for (const u of s.unions) {
    const idx = s.played.findIndex((x) => x.card === u.target);
    if (idx >= 0) {
      const c = s.played.splice(idx, 1)[0];
      s.players[u.p].hand.push(c.card);
      s.courtDiscard.push(u.card);
      log(
        s,
        `${s.players[u.p].name} retrieves ${cap(ACTION_CARDS[c.card].suit)} ${ACTION_CARDS[c.card].rank} with ${title(u.card)}.`,
      );
    }
  }
  s.unions = [];
  for (const x of s.played)
    if (x.faceup)
      s.discardUp.push({
        card: x.card,
        player: x.player,
        mode: x.mode,
        round: s.round,
      });
    else s.discardDown.push(x.card);
  s.played = [];
  s.lead = null;
  s.seized = false;
  s.roundDeclared = false;
  s.current = s.initiative;
  s.roundLeader = s.initiative;
  s.round++;
  if (s.players.every((x) => !x.hand.length)) endChapter(s);
  else if (!s.players[s.current].hand.length) {
    do {
      s.initiative = (s.initiative + 1) % s.players.length;
    } while (!s.players[s.initiative].hand.length);
    s.current = s.initiative;
    s.roundLeader = s.initiative;
  }
}
export function ambitionValues(s, a) {
  return s.players.map((p) =>
    a === "tycoon"
      ? icons(s, p.id, "material") +
        icons(s, p.id, "fuel") +
        (has(s, p.id, "BC03") ? s.supply.material : 0) +
        (has(s, p.id, "BC06") ? s.supply.fuel : 0)
      : a === "keeper"
        ? icons(s, p.id, "relic")
        : a === "empath"
          ? icons(s, p.id, "psionic")
          : a === "tyrant"
            ? p.captives.length
            : p.trophies.length,
  );
}
export function scoreAmbition(s, a) {
  const markers = s.markers.filter((m) => m.ambition === a);
  if (!markers.length) return [];
  const vals = ambitionValues(s, a),
    all = [...vals, ...(s.players.length === 2 ? [s.neutral[a]] : [])];
  const high = Math.max(...all),
    tied = all.filter((n) => n === high).length > 1;
  const second = Math.max(...all.filter((n) => n < high), 0);
  const secondTied = all.filter((n) => n === second).length > 1;
  const awards = s.players.map((p, i) => {
    if (vals[i] === 0) return 0;
    const first = vals[i] === high && !tied;
    const runner =
      (vals[i] === high && tied) ||
      (!tied && vals[i] === second && !secondTied);
    const penalized =
      (a === "tyrant" && p.leader === "LEAD01") ||
      (a === "empath" && p.leader === "LEAD06") ||
      (a === "tycoon" && p.leader === "LEAD09");
    if (p.leader === "LEAD12" && !first) return 0;
    if (penalized) return first ? markers.reduce((v, m) => v + m.low, 0) : 0;
    return first
      ? markers.reduce((v, m) => v + m.high, 0) + cityBonus(s, i)
      : runner
        ? markers.reduce((v, m) => v + m.low, 0)
        : 0;
  });
  return awards;
}
function endChapter(s) {
  s.pending = [];
  s.phase = "scoring";
  endPreludeIf(s);
  const summary = { chapter: s.chapter, ambitions: [] };
  for (const a of AMBITIONS) {
    const awards = scoreAmbition(s, a);
    if (!awards.length) continue;
    const values = ambitionValues(s, a);
    summary.ambitions.push({ ambition: a, values, awards });
    awards.forEach((power, p) => (s.players[p].power += power));
    log(
      s,
      `${cap(a)} scores: ${awards.map((n, p) => `${s.players[p].name} +${n}`).join(", ")}.`,
    );
  }
  s.scoreHistory.push(summary);
  const war = active(s, "warlord"),
    tyr = active(s, "tyrant"),
    tyc = active(s, "tycoon");
  for (const p of s.players) {
    if (war) p.trophies = [];
    if (tyr) p.captives = [];
    for (const r of ["material", "fuel"])
      if (
        s.players.some(
          (other) =>
            other.id !== p.id &&
            has(s, other.id, r === "material" ? "BC03" : "BC06"),
        ) ||
        (r === "fuel" && p.leader === "LEAD03" && tyc)
      )
        for (let i = 0; i < p.resources.length; i++)
          if (p.resources[i] === r) discardResource(s, p.id, i);
  }
  const m = s.markers
    .filter((x) => !x.flipped)
    .sort((a, b) => a.high - b.high)[0];
  if (m) {
    [m.high, m.low] = [
      [4, 2],
      [6, 3],
      [9, 4],
    ][m.id];
    m.flipped = true;
  }
  for (const marker of s.markers) marker.ambition = null;
  if (
    s.chapter === 5 ||
    s.players.some((p) => p.power >= { 2: 33, 3: 30, 4: 27 }[s.players.length])
  ) {
    const order = Array.from(
      { length: s.players.length },
      (_, i) => (s.initiative + i) % s.players.length,
    );
    s.winner = order.sort((a, b) => s.players[b].power - s.players[a].power)[0];
    s.phase = "over";
    s.turn = null;
    log(
      s,
      `${s.players[s.winner].name} wins with ${s.players[s.winner].power} Power.`,
    );
    return;
  }
  s.chapter++;
  s.round = 1;
  s.lead = null;
  s.played = [];
  s.unions = [];
  s.turn = null;
  s.seized = false;
  s.passes = [];
  s.current = s.initiative;
  s.roundLeader = s.initiative;
  s.phase = "card";
  deal(s);
  log(s, `Chapter ${s.chapter} begins.`);
}
function endPreludeIf(s) {
  if (s.turn) endPrelude(s);
}
function taskDecision(s, t) {
  const p = t.p,
    pl = s.players[p];
  let choices = [],
    titleText = "Choose an option";
  const skip = choose("Skip", "skip");
  switch (t.type) {
    case "freedomSeize":
      return {
        title: "Song of Freedom · seize initiative?",
        choices: [
          ...(canSeize(s, p)
            ? [choose("Seize initiative", "freedomSeize")]
            : []),
          skip,
        ],
      };
    case "effects":
      return {
        title: "Choose which simultaneous effect resolves next",
        description:
          "The player taking their turn chooses the order. Each effect keeps its own decision-maker.",
        choices: t.tasks.map((effect, index) =>
          choose(
            `${s.players[effect.p].name} · ${effect.reason ?? { bold: "Demagogue · Bold", ruthless: "Overseer · Ruthless", mythic: "Shaper · Mythic", predictive: "Predictive Sensors", railgun: "Railgun Arrays" }[effect.type] ?? effect.type}`,
            "effect",
            { index },
          ),
        ),
      };
    case "arrangeResources":
      return {
        title: "Arrange your resources",
        description:
          "After gaining resources or losing slots, you may rearrange them. Higher key costs protect valuables from raids.",
        choices: [
          ...pl.resources.flatMap((r, index) =>
            r
              ? [
                  choose(`Move ${r} from slot ${index + 1}`, "arrangePick", {
                    index,
                  }),
                ]
              : [],
          ),
          choose("Keep this arrangement", "skip"),
        ],
      };
    case "mulligan":
      return {
        title: "Keep your hand or take one mulligan",
        description:
          "Only the player without initiative may redraw, once per chapter.",
        choices: [
          choose("Keep these cards", "skip"),
          choose("Draw six new cards", "mulligan"),
        ],
      };
    case "archivist":
      return {
        title: `Archivist · keep ${t.left} more lore`,
        choices: t.choices.map((card) =>
          choose(title(card), "take", { card }, { card }),
        ),
      };
    case "overflow":
      return {
        title: "Choose a resource to discard",
        description: `Your ${capacity(s, p)} resource slots are full.`,
        choices: pl.resources.flatMap((r, index) =>
          r
            ? [choose(`Discard ${r} · slot ${index + 1}`, "discard", { index })]
            : [],
        ),
      };
    case "revive":
      return {
        title: "Rebuild your fleet",
        description:
          "With no ships or starports, place up to 3 fresh ships at any gate.",
        choices: systems(s)
          .filter((id) => MAP[id].symbol === "gate")
          .map((system) =>
            choose(`Reappear at ${sysName(system)}`, "revive", { system }),
          ),
      };
    case "action": {
      if (
        !t.configured &&
        t.cost === "pip" &&
        copied(s) &&
        ((t.action === "battle" && has(s, p, "LEAD06")) ||
          (t.action === "secure" && has(s, p, "LEAD07")))
      ) {
        const bonus = t.action === "battle" ? "move" : "influence";
        return {
          title:
            t.action === "battle"
              ? "Warrior · Tactical"
              : "Feastbringer · Charismatic",
          choices: [
            choose(`${cap(bonus)} before ${t.action}`, "bonusBefore", {
              bonus,
            }),
            choose(`${cap(bonus)} after ${t.action}`, "bonusAfter", { bonus }),
            choose(`Just ${t.action}`, "withoutBonus"),
            choose("Back", "cancel"),
          ],
        };
      }
      choices = [
        ...actionTargets(s, p, t.action).filter(
          (c) =>
            c.op !== "cloudTarget" ||
            s.players[p].resources.some(
              (r, i) => i !== t.cost && r === planetType(s, c.system),
            ),
        ),
        ...(t.cost === "free" ? [] : specialTargets(s, p, t.action, t.cost)),
      ];
      titleText = `${cap(t.action)} · choose a target`;
      if (!t.required) {
        if (t.cost === "free") choices.push(skip);
        else choices.push(choose("Back", "cancel"));
      }
      break;
    }
    case "moveSelect":
      return {
        title: "Choose ships to move",
        description: has(s, p, "LEAD05")
          ? "Rebel: move no more than two ships at a time."
          : "Fresh and damaged ships may move together.",
        form: {
          kind: "pieces",
          options: piecesAt(s, t.system, p, "ship").map((x) => ({
            id: x.id,
            label: pieceName(s, x),
          })),
          min: 1,
          max: has(s, p, "LEAD05") ? 2 : 15,
        },
      };
    case "moveTo":
      return {
        title: "Choose an adjacent destination",
        choices: [
          ...adjacent(t.system, s.clusters).map((system) =>
            choose(`Move to ${sysName(system)}`, "moveTo", { system }),
          ),
          ...(t.back ? [choose("Back", "cancel")] : []),
        ],
      };
    case "catapult":
      return {
        title: "Continue the catapult move?",
        description:
          "Leave ships here, or keep any of the moving fleet in transit.",
        choices: [
          choose("Finish catapult move", "skip"),
          ...adjacent(t.system, s.clusters)
            .filter((x) => !t.visited.includes(x))
            .map((system) =>
              choose(`Continue to ${sysName(system)}`, "continue", { system }),
            ),
        ],
      };
    case "catapultSelect":
      return {
        title: "Choose ships to continue (others stay here)",
        form: {
          kind: "pieces",
          options: s.pieces
            .filter((x) => t.ids.includes(x.id))
            .map((x) => ({ id: x.id, label: pieceName(s, x) })),
          min: 1,
          max: t.ids.length,
        },
      };
    case "sprinter": {
      const ships = s.pieces.filter((x) => t.ids.includes(x.id) && !x.damaged);
      return {
        title: "Sprinter Drives · move fresh ships once more",
        choices: [
          ...[...new Set(ships.map((x) => x.system))].map((system) =>
            choose(`Move fresh ships from ${sysName(system)}`, "sprint", {
              system,
            }),
          ),
          skip,
        ],
      };
    }
    case "sprintSelect":
      return {
        title: "Choose fresh ships for the extra move",
        form: {
          kind: "pieces",
          options: s.pieces
            .filter(
              (x) =>
                t.ids.includes(x.id) && x.system === t.system && !x.damaged,
            )
            .map((x) => ({ id: x.id, label: pieceName(s, x) })),
          min: 1,
          max: has(s, p, "LEAD05") ? 2 : 15,
        },
      };
    case "predictive":
      return {
        title: "Predictive Sensors · reinforce this battle",
        description:
          "Move any number of fresh ships from adjacent systems into the battle.",
        form: {
          kind: "pieces",
          options: s.pieces
            .filter(
              (x) =>
                x.owner === p &&
                x.type === "ship" &&
                !x.damaged &&
                adjacent(t.system, s.clusters).includes(x.system),
            )
            .map((x) => ({
              id: x.id,
              label: pieceName(s, x),
              system: x.system,
            })),
          min: 0,
          max: 15,
          maxPerSystem: has(s, p, "LEAD05") ? 2 : 15,
        },
      };
    case "dice": {
      const ships = piecesAt(s, t.system, p, "ship"),
        raidAllowed =
          piecesAt(s, t.system, t.defender).some((x) => x.type !== "ship") ||
          !piecesAt(s, null, t.defender).some((x) => x.type !== "ship");
      let raid = raidAllowed ? 6 : has(s, p, "L17") ? 1 : 0;
      if (
        has(s, t.defender, "L05") &&
        piecesAt(s, t.system, t.defender, "starport").some((x) => !x.damaged)
      )
        raid = 0;
      return {
        title: "Choose your battle dice",
        description:
          "Skirmish is safe. Assault hits harder. Raid steals resources and Guild cards.",
        form: {
          kind: "dice",
          min: has(s, p, "LEAD05") ? 2 : 0,
          max:
            ships.length +
            (has(s, p, "LEAD05") ? 2 : 0) +
            (has(s, p, "BC08") && MAP[t.system].symbol === "gate" ? 2 : 0),
          raidMax: raid,
          corsair: has(s, p, "LEAD11"),
        },
      };
    }
    case "reroll": {
      choices = rerollChoices(s, t);
      return {
        title: "Battle roll · resolve or reroll",
        description: "Each ability may reroll its eligible dice once.",
        choices: [...choices, choose("Resolve dice", "resolve")],
        dice: t.dice,
      };
    }
    case "rerollSelect":
      return {
        title: `${t.ability} · choose dice to reroll`,
        form: {
          kind: "diceSelect",
          options: t.dice
            .map((d, i) => ({
              id: String(i),
              label: `${d.type}: ${d.faces.join(" + ") || "blank"}`,
              type: d.type,
            }))
            .filter((x) => t.dieType === "any" || x.type === t.dieType),
          min: 0,
          max: t.max,
        },
        dice: t.dice,
      };
    case "hits": {
      const all = piecesAt(s, t.system, t.target).filter(
        (x) => t.kind !== "self" || !t.attackers || t.attackers.includes(x.id),
      );
      const xs =
        t.kind === "building"
          ? all.filter((x) => x.type !== "ship")
          : t.kind === "self"
            ? all.filter((x) => x.type === "ship")
            : all.some((x) => x.type === "ship")
              ? all.filter((x) => x.type === "ship")
              : all.filter((x) => x.type !== "ship");
      return {
        title: `Assign ${t.left} ${t.kind === "self" ? "attacker" : t.kind === "building" ? "building" : "defender"} hit${t.left === 1 ? "" : "s"}`,
        description: "A fresh piece is damaged. A damaged piece is destroyed.",
        choices: xs.map((x) =>
          choose(pieceName(s, x), "hit", { piece: x.id }, { system: x.system }),
        ),
        dice: s.lastBattle?.dice,
      };
    }
    case "ransack":
      return {
        title: "Ransack the Court",
        description:
          "Destroying a city lets you secure a card with that defender’s agents. Rival agents become Trophies.",
        choices: [
          ...s.court.flatMap((c, index) =>
            c.id && c.agents[t.defender] > 0
              ? [choose(title(c.id), "ransack", { index }, { card: c.id })]
              : [],
          ),
        ],
      };
    case "raid":
      return {
        title: `Raid · ${t.keys} key${t.keys === 1 ? "" : "s"} remaining`,
        description:
          "Steal one item at a time. Sworn Guardians must be stolen before protected items.",
        choices: [
          ...stealChoices(s, p, t.defender, t.keys, true),
          choose("Finish raid", "skip"),
        ],
      };
    case "repairBonus":
      return {
        title: `${t.reason} · repair ${t.left} ship${t.left === 1 ? "" : "s"}`,
        choices: [
          ...piecesAt(s, t.system, p, "ship")
            .filter(
              (x) => x.damaged && (!t.attackers || t.attackers.includes(x.id)),
            )
            .map((x) =>
              choose(pieceName(s, x), "repairBonus", { piece: x.id }),
            ),
        ],
      };
    case "gainChoice":
      return {
        title: `${t.reason ?? "Gain"} · choose ${t.count} resource${t.count === 1 ? "" : "s"}`,
        choices: [
          ...RESOURCES.filter((r) => s.supply[r] > 0).map((resource) =>
            choose(`Gain ${resource}`, "gain", { resource }),
          ),
          ...(t.reason === "Ambitious" ||
          !RESOURCES.some((r) => s.supply[r] > 0)
            ? [skip]
            : []),
        ],
      };
    case "taxType":
      return {
        title: "Choose the gate city’s resource type",
        choices: t.resources.map((resource) =>
          choose(cap(resource), "taxResource", { resource }),
        ),
      };
    case "agitatorWeapon":
      return {
        title: "Agitator · discard a Weapon",
        description: "Choose which Weapon to discard for the intercept.",
        choices: pl.resources.flatMap((r, index) =>
          r === "weapon"
            ? [
                choose(`Discard weapon · slot ${index + 1}`, "agitatorPay", {
                  index,
                }),
              ]
            : [],
        ),
      };
    case "cloudCost":
      return {
        title: "Pay for Cloud Cities",
        choices: pl.resources.flatMap((r, index) =>
          r === planetType(s, t.system) && index !== t.cost
            ? [choose(`Spend ${r} · slot ${index + 1}`, "cloudPay", { index })]
            : [],
        ),
      };
    case "ruthless":
      return {
        title: "Overseer · Ruthless",
        description:
          "Hit the building to repeat its tax or ship-building action. Once per turn.",
        choices: [
          choose(
            `Hit the ${t.action === "tax" ? "city" : "starport"} and ${t.action} again`,
            "ruthless",
          ),
          skip,
        ],
      };
    case "mythic":
      return {
        title: "Shaper · change this planet’s type?",
        description: "Place a resource over its planet icon permanently.",
        choices: [
          ...pl.resources.flatMap((r, index) =>
            r ? [choose(`Place ${r}`, "mythic", { index })] : [],
          ),
          ...["material", "fuel"]
            .filter(
              (r) =>
                s.supply[r] > 0 &&
                has(s, p, r === "material" ? "BC03" : "BC06"),
            )
            .map((resource) =>
              choose(`Place cartel ${resource}`, "mythic", { resource }),
            ),
          skip,
        ],
      };
    case "generous": {
      const rivals = s.players.filter((x) => x.id !== p),
        min = Math.min(...rivals.map((x) => x.power)),
        order = turnOrder(s);
      const rival = order.find((i) => i !== p && s.players[i].power === min);
      return {
        title: `Feastbringer · give a Guild to ${s.players[rival].name}`,
        choices: pl.cards
          .filter((id) => CARDS[id].kind === "guild")
          .map((card) =>
            choose(title(card), "give", { card, to: rival }, { card }),
          ),
      };
    }
    case "bold":
      return {
        title: "Demagogue · influence Court cards",
        description: "You may influence each card once.",
        choices: [
          ...s.court.flatMap((c, index) =>
            c.id && !t.used.includes(index) && pool(s, p, "agent") > 0
              ? [choose(title(c.id), "bold", { index }, { card: c.id })]
              : [],
          ),
          skip,
        ],
      };
    case "farseersRival":
      return {
        title: "Farseers · inspect a rival hand",
        choices: s.players
          .filter((x) => x.id !== p && x.hand.length)
          .map((x) =>
            choose(`Look at ${x.name}’s hand`, "inspectHand", { rival: x.id }),
          ),
      };
    case "farseersSwap":
      return {
        title: `Farseers · ${s.players[t.rival].name}’s hand`,
        description: "Swap one card, or keep your hand.",
        choices: [
          ...s.players[t.rival].hand.map((card) =>
            choose(
              `Take ${cap(ACTION_CARDS[card].suit)} ${ACTION_CARDS[card].rank}`,
              "swapTake",
              { card },
            ),
          ),
          skip,
        ],
      };
    case "farseersGive":
      return {
        title: "Farseers · give one of your cards",
        choices: pl.hand.map((card) =>
          choose(
            `Give ${cap(ACTION_CARDS[card].suit)} ${ACTION_CARDS[card].rank}`,
            "swapGive",
            { card },
          ),
        ),
      };
    case "vox":
      return voxDecision(s, t);
    case "prelude":
      return preludeDecision(s, t);
    case "special":
      return specialDecision(s, t);
    case "influenceReview":
      return {
        title: "Elder · Review your Influence",
        description: `Your agent is on ${title(t.card)}. Inspect any Court card, or undo to choose a different one. Confirm when ready to let play continue.`,
        choices: [
          choose("Confirm Influence & continue", "confirmInfluence", {
            card: t.card,
          }),
        ],
      };
    case "freeChoice":
      return {
        title: t.reason,
        choices: [...actionTargets(s, p, t.action), skip],
      };
    case "steal":
      return {
        title: "Choose what to steal",
        choices: [
          ...s.players
            .filter((x) => x.id !== p)
            .flatMap((x) => stealChoices(s, p, x.id, 99, false)),
          skip,
        ],
      };
    case "interest":
      return {
        title: `${title(t.card)} · take ${t.resource}`,
        choices:
          s.supply[t.resource] > 0
            ? [choose(`Gain ${t.resource}`, "interestGain"), skip]
            : [
                ...s.players
                  .filter((x) => x.id !== p)
                  .flatMap((x) =>
                    stealChoices(s, p, x.id, 99, false).filter(
                      (c) =>
                        c.op === "stealResource" &&
                        x.resources[c.index] === t.resource,
                    ),
                  ),
                skip,
              ],
      };
    case "placeFleet":
      return {
        title: "Choose a system you control",
        choices: [
          ...systems(s)
            .filter((id) => control(s, id) === p)
            .map((system) =>
              choose(`Place 3 ships · ${sysName(system)}`, "placeFleet", {
                system,
              }),
            ),
          skip,
        ],
      };
    case "union":
      return {
        title: "Choose a played card to retrieve at round end",
        choices: [
          ...s.played
            .filter(
              (x) =>
                x.faceup &&
                ACTION_CARDS[x.card].suit === t.suit &&
                !s.unions.some((u) => u.target === x.card),
            )
            .map((x) =>
              choose(`${cap(t.suit)} ${ACTION_CARDS[x.card].rank}`, "union", {
                target: x.card,
              }),
            ),
          skip,
        ],
      };
    case "farseersDiscard":
      return {
        title: "Farseers · discard any action cards",
        description:
          "Draw one card per discarded action card, plus one for Farseers.",
        form: {
          kind: "cards",
          options: pl.hand.map((id) => ({
            id,
            label: `${cap(ACTION_CARDS[id].suit)} ${ACTION_CARDS[id].rank}`,
          })),
          min: 0,
          max: pl.hand.length,
        },
      };
    case "relicFence":
      return {
        title: "Relic Fence · discard a resource",
        choices: [
          ...pl.resources.flatMap((r, index) =>
            r ? [choose(`Discard ${r}`, "fence", { index })] : [],
          ),
          choose("Back", "cancel"),
        ],
      };
    case "reorder":
      return {
        title: "Arrange resources",
        description:
          "Choose the slot to swap with your selected resource. Key costs are fixed to slots.",
        choices: pl.resources.map((r, index) =>
          choose(
            `Slot ${index + 1} · ${r ?? "empty"} · ${resourceKeysFor(s, p)[index]} keys`,
            "swapSlot",
            { index },
          ),
        ),
      };
    default:
      throw new Error(`Unknown task ${t.type}`);
  }
  return { title: titleText, choices };
}
function resolveTask(s, t, c) {
  const p = t.p,
    pl = s.players[p];
  if (c.op === "skip" || c.op === "cancel") {
    if (c.op === "cancel" && t.back) cancelTask(s, t);
    if (t.type === "catapult") finishMove(s, t);
    if (t.type === "vox") resolveVox(s, t, c);
    if (c.op === "skip" && t.type === "raid" && !t.stolen)
      log(
        s,
        `${pl.name} ends the raid on ${s.players[t.defender].name} without stealing.`,
        { battle: true },
      );
    return;
  }
  switch (t.type) {
    case "freedomSeize":
      seize(s, p);
      break;
    case "effects": {
      const next = t.tasks[c.index],
        remaining = t.tasks.filter((_, i) => i !== c.index);
      pushEffects(s, remaining);
      push(s, next);
      break;
    }
    case "arrangeResources":
      push(s, { type: "reorder", p, index: c.index }, t);
      break;
    case "mulligan": {
      const old = pl.hand;
      const meta = {};
      pl.hand = drawDiscard(s, 6, meta);
      s.discardDown = shuffle(s, [...s.discardDown, ...old]);
      log(s, `${pl.name} takes a mulligan.`, {
        draw: drawRecord(p, pl.hand.length, "mulligan", meta),
      });
      break;
    }
    case "archivist":
      pl.cards.push(c.card);
      remove(t.choices, c.card);
      if (t.left > 1) push(s, { ...t, left: t.left - 1 });
      break;
    case "overflow":
      discardResource(s, p, c.index);
      break;
    case "revive":
      place(s, p, "ship", c.system, 3);
      log(s, `${pl.name} rebuilds their fleet at ${sysName(c.system)}.`);
      finishTurn(s);
      break;
    case "action": {
      if (c.op.startsWith("bonus") || c.op === "withoutBonus") {
        const again = { ...t, configured: true };
        if (c.op === "bonusBefore") {
          const rollback = structuredClone(s);
          push(
            s,
            {
              type: "action",
              p,
              action: c.bonus,
              cost: "free",
              configured: true,
            },
            { ...again, required: true, rollback },
          );
        } else if (c.op === "bonusAfter") {
          // Same guard as bonusBefore: once chosen, the paid action is
          // mandatory, so the queued free bonus can never outlive it.
          const rollback = structuredClone(s);
          push(
            s,
            { ...again, required: true, rollback },
            {
              type: "action",
              p,
              action: c.bonus,
              cost: "free",
              configured: true,
            },
          );
        } else push(s, again);
        break;
      }
      if (c.op === "special") {
        push(s, {
          type: "special",
          p,
          card: c.card,
          cost: t.cost,
          action: t.action,
          required: t.required,
          back: t,
        });
        break;
      }
      if (c.op === "moveFrom") {
        push(s, {
          type: "moveSelect",
          p,
          system: c.system,
          cost: t.cost,
          back: t,
        });
        break;
      }
      if (c.op === "cloudTarget") {
        push(s, { type: "cloudCost", p, system: c.system, cost: t.cost });
        break;
      }
      pay(s, p, t.cost, t.action);
      resolveStandard(s, p, c, t.cost);
      break;
    }
    case "freeChoice":
      resolveStandard(s, p, c, "free", t);
      // Beloved is an out-of-turn decision. Keep the defender's window open
      // until they accept the placement; otherwise handing control back would
      // immediately commit it and make a misclick impossible to undo.
      if (c.op === "influenceTarget" && t.reason === "Elder · Beloved")
        push(s, {
          type: "influenceReview",
          p,
          card: s.court[c.index].id,
          reason: "Elder · Review Influence",
        });
      break;
    case "influenceReview":
      break;
    case "moveTo":
      executeMove(s, { ...t, to: c.system });
      break;
    case "catapult":
      push(s, { ...t, type: "catapultSelect", to: c.system, back: t });
      break;
    case "sprinter":
      push(s, { ...t, type: "sprintSelect", system: c.system, back: t });
      break;
    case "reroll":
      if (c.op === "resolve") {
        resolveBattleDice(s, t);
      } else {
        push(s, {
          ...t,
          type: "rerollSelect",
          ability: c.ability,
          dieType: c.dieType,
          max: c.max,
          back: t,
        });
      }
      break;
    case "hits": {
      const x = s.pieces.find((x) => x.id === c.piece);
      if (t.left > 1) push(s, { ...t, left: t.left - 1 });
      hit(s, x, t.dealer, t.battle);
      break;
    }
    case "ransack":
      secure(s, p, c.index, true);
      break;
    case "raid": {
      steal(s, p, c, t.system);
      push(s, { ...t, keys: t.keys - c.keys, stolen: (t.stolen ?? 0) + 1 });
      break;
    }
    case "repairBonus":
      s.pieces.find((x) => x.id === c.piece).damaged = false;
      if (t.left > 1) push(s, { ...t, left: t.left - 1 });
      break;
    case "gainChoice":
      gain(s, p, c.resource);
      if (t.count > 1) push(s, { ...t, count: t.count - 1 });
      break;
    case "taxType":
      taxGain(s, p, t.piece, c.resource, t.cost, t.repeat);
      break;
    case "agitatorWeapon":
      ok(pl.resources[c.index] === "weapon", "Choose a Weapon.");
      discardResource(s, p, c.index);
      break;
    case "cloudCost":
      discardResource(s, p, c.index);
      pay(s, p, t.cost, "build");
      build(s, p, "city", t.system, null, true);
      break;
    case "ruthless": {
      s.turn.used.push("ruthless");
      const x = s.pieces.find((x) => x.id === t.piece);
      const types = x.type === "city" ? cityTypes(s, x) : [];
      push(s, {
        type: "ruthlessRepeat",
        p,
        action: t.action,
        piece: structuredClone(x),
        resources: types,
        cost: t.cost,
      });
      hit(s, x, p, false);
      break;
    }
    case "mythic": {
      const r = c.resource ?? pl.resources[c.index];
      if (c.resource) s.supply[r]--;
      else pl.resources[c.index] = null;
      s.overrides[t.system] = r;
      log(s, `${pl.name} reshapes ${sysName(t.system)} into a ${r} planet.`);
      break;
    }
    case "generous":
      remove(pl.cards, c.card);
      s.players[c.to].cards.push(c.card);
      declare(s, p, t.ambition, t.zero, true, t.lead);
      break;
    case "bold":
      s.court[c.index].agents[p]++;
      push(s, { ...t, used: [...t.used, c.index] });
      break;
    case "farseersRival":
      reveal(s, "hand");
      push(s, { type: "farseersSwap", p, rival: c.rival });
      break;
    case "farseersSwap":
      if (pl.hand.length)
        push(s, { type: "farseersGive", p, rival: t.rival, take: c.card });
      break;
    case "farseersGive":
      remove(pl.hand, c.card);
      remove(s.players[t.rival].hand, t.take);
      pl.hand.push(t.take);
      s.players[t.rival].hand.push(c.card);
      log(s, `${pl.name} swaps an action card using Farseers.`);
      break;
    case "vox":
      resolveVox(s, t, c);
      break;
    case "prelude":
      resolvePrelude(s, t, c);
      break;
    case "special":
      resolveSpecial(s, t, c);
      break;
    case "steal":
      steal(s, p, c);
      break;
    case "interest":
      if (c.op === "interestGain") gain(s, p, t.resource);
      else steal(s, p, c);
      if (pl.resources.filter(Boolean).length < capacity(s, p)) push(s, t);
      break;
    case "placeFleet":
      place(s, p, "ship", c.system, 3);
      break;
    case "union":
      remove(pl.cards, t.card);
      s.unions.push({ p, card: t.card, target: c.target });
      s.turn.acted = true;
      break;
    case "relicFence":
      discardResource(s, p, c.index);
      gain(s, p, "relic");
      s.turn.used.push("BC24");
      s.turn.acted = true;
      break;
    case "reorder":
      [pl.resources[t.index], pl.resources[c.index]] = [
        pl.resources[c.index],
        pl.resources[t.index],
      ];
      break;
  }
}
function resolveForm(s, t, value) {
  const form = taskDecision(s, t).form;
  const p = t.p;
  if (form.kind === "dice") {
    ok(
      value &&
        ["skirmish", "assault", "raid"].every(
          (k) => Number.isInteger(value[k]) && value[k] >= 0 && value[k] <= 6,
        ),
      "Choose 0–6 dice of each type.",
    );
    ok(
      value.skirmish + value.assault + value.raid >= (form.min ?? 0),
      "Rebel must collect two extra dice.",
    );
    ok(
      value.skirmish + value.assault + value.raid <= form.max,
      "Too many dice for your fleet.",
    );
    ok(value.raid <= form.raidMax, "Raid dice are not allowed here.");
    ok(
      !form.corsair || value.assault <= value.skirmish,
      "Corsair cannot collect more assault than skirmish dice.",
    );
    const dice = Object.keys(DICE).flatMap((type) =>
      Array.from({ length: value[type] }, () => ({
        type,
        faces: DICE[type][Math.floor(random(s) * 6)],
      })),
    );
    const b = {
      ...t,
      type: "reroll",
      dice,
      used: [],
      freshAttack: piecesAt(s, t.system, p, "ship").filter((x) => !x.damaged)
        .length,
    };
    recordBattle(s, {
      attacker: p,
      defender: t.defender,
      system: t.system,
      dice,
      revision: s.revision + 1,
    });
    push(s, b);
    log(
      s,
      `${s.players[p].name} rolls ${dice.length} dice against ${s.players[t.defender].name}: ${diceText(dice)}.`,
      { battle: true },
    );
    return;
  }
  ok(
    Array.isArray(value) &&
      new Set(value).size === value.length &&
      value.length >= form.min &&
      value.length <= form.max &&
      value.every((id) => form.options.some((o) => o.id === id)),
    "Select a valid set.",
  );
  if (t.type === "sprintSelect") {
    // One group, one extra move: the other ships get no further sprint.
    push(s, {
      type: "moveTo",
      p,
      system: t.system,
      ids: value,
      cost: "free",
      paid: true,
      extra: true,
      visited: [t.system],
      allIds: value,
      back: t,
    });
    return;
  }
  if (t.type === "moveSelect") {
    push(s, {
      ...t,
      type: "moveTo",
      ids: value,
      allIds: value,
      visited: [t.system],
      extra: false,
      back: t,
    });
    return;
  }
  if (t.type === "catapultSelect") {
    executeMove(s, { ...t, ids: value, paid: true });
    return;
  }
  if (t.type === "predictive") {
    const origins = [
      ...new Set(value.map((id) => s.pieces.find((x) => x.id === id).system)),
    ];
    for (const origin of origins) {
      const ids = value.filter(
        (id) => s.pieces.find((x) => x.id === id).system === origin,
      );
      ok(
        ids.length <= form.maxPerSystem,
        "Rebel may move at most two ships from each system.",
      );
      gatePortEntry(s, p, t.system);
      for (const id of ids) s.pieces.find((x) => x.id === id).system = t.system;
    }
    log(s, `${s.players[p].name} reinforces with ${value.length} fresh ships.`);
    return;
  }
  if (t.type === "rerollSelect") {
    const before = value.map((id) => faceText(t.dice[Number(id)].faces));
    for (const id of value) {
      const i = Number(id);
      t.dice[i].faces = DICE[t.dice[i].type][Math.floor(random(s) * 6)];
    }
    s.lastBattle.dice = t.dice;
    if (value.length) {
      recordReroll(s, t.ability);
      log(
        s,
        `${s.players[p].name} rerolls ${value.length} ${value.length === 1 ? "die" : "dice"} (${t.ability}): ${value.map((id, k) => `${before[k]} → ${faceText(t.dice[Number(id)].faces)}`).join(", ")}.`,
        { battle: true },
      );
    }
    push(s, {
      ...t,
      type: "reroll",
      used: value.length ? [...t.used, t.ability] : t.used,
    });
    return;
  }
  if (t.type === "farseersDiscard") {
    reveal(s, "deck");
    for (const id of value) remove(s.players[p].hand, id);
    // Discard, then draw: whether the face-down pile is short counts these.
    s.discardDown.push(...shuffle(s, value));
    const meta = {},
      drawn = drawDiscard(s, value.length + 1, meta);
    s.players[p].hand.push(...drawn);
    log(s, `${s.players[p].name} draws ${drawn.length} cards with Farseers.`, {
      draw: drawRecord(p, drawn.length, "farseers", meta),
    });
    return;
  }
  if (t.type === "special") {
    resolveSpecialForm(s, t, value);
    return;
  }
  throw new Error(`Unknown form ${t.type}`);
}
function resolveStandard(s, p, c, cost, parent) {
  if (c.op === "ruthlessEmptyBuild") {
    s.turn.used.push("ruthless");
    hit(
      s,
      s.pieces.find((x) => x.id === c.piece),
      p,
      false,
    );
  }
  if (c.op === "taxTarget") {
    const piece = c.piece
      ? s.pieces.find((x) => x.id === c.piece)
      : { id: c.empty, system: c.system, owner: p, type: "city", empty: true };
    s.turn.taxed.push(piece.id);
    const types = piece.empty
      ? [planetType(s, piece.system)]
      : cityTypes(s, piece);
    if (types.length > 1)
      push(s, {
        type: "taxType",
        p,
        piece: structuredClone(piece),
        resources: types,
        cost,
      });
    else taxGain(s, p, piece, types[0], cost);
  }
  if (c.op === "buildTarget")
    build(s, p, c.kind, c.system, c.port, false, cost);
  if (c.op === "repairTarget") {
    const x = s.pieces.find((x) => x.id === c.piece);
    x.damaged = false;
    log(s, `${s.players[p].name} repairs a ${x.type} at ${sysName(x.system)}.`);
  }
  if (c.op === "influenceTarget") {
    s.court[c.index].agents[p]++;
    log(s, `${s.players[p].name} influences ${title(s.court[c.index].id)}.`);
    if (cost === "pip" && copied(s) && has(s, p, "LEAD12"))
      push(s, {
        type: "action",
        p,
        action: "influence",
        cost: "free",
        configured: true,
      });
  }
  if (c.op === "secureTarget") secure(s, p, c.index);
  if (c.op === "moveFrom")
    push(s, {
      type: "moveSelect",
      p,
      system: c.system,
      cost: "free",
      back: parent,
    });
  if (c.op === "battleTarget") beginBattle(s, p, c.system, c.defender);
}
function taxGain(s, p, piece, r, cost, repeat = false) {
  const gained = gain(s, p, r);
  if (
    piece.owner !== p &&
    !(
      has(s, p, "L20") &&
      active(s, "empath") &&
      control(s, piece.system) !== p
    ) &&
    pool(s, piece.owner, "agent") > 0
  )
    s.players[p].captives.push({
      id: `p${++s.pieceId}`,
      owner: piece.owner,
      type: "agent",
    });
  if (cost === "pip" && copied(s)) {
    if (has(s, p, "LEAD02")) gain(s, p, "psionic");
    if (has(s, p, "LEAD03")) gain(s, p, "fuel");
    if (has(s, p, "LEAD15")) gain(s, p, "weapon");
  }
  log(
    s,
    `${s.players[p].name} taxes ${sysName(piece.system)} for ${r ?? "no resource"}.`,
    {
      animation: {
        kind: "tax",
        system: piece.system,
        piece: piece.id,
        owner: p,
        resource: r,
        gained,
      },
    },
  );
  const tasks = [];
  if (
    has(s, p, "LEAD10") &&
    !s.turn.used.includes("ruthless") &&
    !piece.empty &&
    !repeat &&
    s.pieces.some((x) => x.id === piece.id)
  )
    tasks.push({ type: "ruthless", p, action: "tax", piece: piece.id, cost });
  if (
    has(s, p, "LEAD14") &&
    !s.overrides[piece.system] &&
    MAP[piece.system].resource &&
    RESOURCES.some((r) => hasResource(s, p, r))
  )
    tasks.push({ type: "mythic", p, system: piece.system });
  pushEffects(s, tasks);
}
function build(
  s,
  p,
  kind,
  system,
  port,
  cloud = false,
  cost = "free",
  repeat = false,
) {
  const ctrl = control(s, system),
    damage =
      ctrl !== null && ctrl !== p && !(kind === "ship" && has(s, p, "L05"));
  const ids = place(s, p, kind, system, 1, damage);
  if (cloud && ids.length) s.pieces.find((x) => x.id === ids[0]).cloud = true;
  if (port) s.turn.built.push(port);
  log(
    s,
    `${s.players[p].name} builds a ${damage ? "damaged " : ""}${kind} at ${sysName(system)}.`,
  );
  if (
    port &&
    has(s, p, "LEAD10") &&
    !s.turn.used.includes("ruthless") &&
    !repeat
  )
    push(s, { type: "ruthless", p, action: "build", piece: port, cost });
}
function gatePortEntry(s, p, dest) {
  const before = control(s, dest);
  if (
    MAP[dest].symbol === "gate" &&
    before !== null &&
    before !== p &&
    has(s, before, "L08") &&
    piecesAt(s, dest, before, "starport").some((x) => !x.damaged) &&
    pool(s, p, "agent") > 0
  )
    s.players[before].captives.push({
      id: `p${++s.pieceId}`,
      owner: p,
      type: "agent",
    });
}
function executeMove(s, t) {
  const p = t.p,
    origin = t.system,
    dest = t.to;
  ok(
    adjacent(origin, s.clusters).includes(dest),
    "These systems are not adjacent.",
  );
  if (!t.paid) pay(s, p, t.cost, "move");
  const before = control(s, dest);
  const sourceStarport = piecesAt(s, origin, undefined, "starport").some(
    (x) => x.owner === p || (has(s, p, "L20") && active(s, "empath")),
  );
  const catapult =
    t.catapult ??
    (has(s, p, "LEAD14") ? MAP[origin].symbol === "gate" : sourceStarport);
  gatePortEntry(s, p, dest);
  for (const id of t.ids) {
    const x = s.pieces.find((x) => x.id === id);
    ok(x?.system === origin, "That ship is no longer at the origin.");
    x.system = dest;
  }
  log(
    s,
    `${s.players[p].name} moves ${t.ids.length} ship${t.ids.length === 1 ? "" : "s"} from ${sysName(origin)} to ${sysName(dest)}.`,
    { movement: { from: origin, to: dest, owner: p, count: t.ids.length } },
  );

  const next = {
    ...t,
    type: "catapult",
    system: dest,
    catapult,
    visited: [...(t.visited ?? []), dest],
    paid: true,
  };
  if (
    catapult &&
    MAP[dest].symbol === "gate" &&
    (before === null || before === p) &&
    adjacent(dest, s.clusters).some((x) => !next.visited.includes(x))
  )
    push(s, next);
  else finishMove(s, next);
}
function finishMove(s, t) {
  if (has(s, t.p, "L03") && !t.extra)
    push(s, {
      type: "sprinter",
      p: t.p,
      ids: t.allIds.filter((id) =>
        s.pieces.some((x) => x.id === id && !x.damaged),
      ),
    });
}
function beginBattle(s, p, system, defender) {
  const attackers = piecesAt(s, system, p, "ship").map((x) => x.id);
  const beforeTrophies = s.players[p].trophies.length;
  push(s, {
    type: "dice",
    p,
    defender,
    system,
    attackers,
    allFresh: piecesAt(s, system, p, "ship").every((x) => !x.damaged),
    beforeTrophies,
  });
  const tasks = [];
  if (has(s, defender, "L15"))
    tasks.push({ type: "predictive", p: defender, system });
  if (has(s, defender, "L12"))
    tasks.push({
      type: "railgun",
      p: defender,
      attacker: p,
      system,
      attackers,
    });
  pushEffects(s, tasks);
}
function rerollChoices(s, t) {
  const p = t.p,
    choices = [];
  for (const [card, ability, dieType, max, condition] of [
    ["BC13", "Skirmishers", "skirmish", icons(s, p, "weapon"), true],
    ["L14", "Seeker Torpedoes", "assault", t.freshAttack, true],
    [
      "LEAD11",
      "Corsair",
      "raid",
      RESOURCES.filter((r) => hasResource(s, p, r)).length,
      true,
    ],
    ["L19", "Empath’s Vision", "any", 18, active(s, "empath")],
  ])
    if (
      has(s, p, card) &&
      condition &&
      !t.used.includes(ability) &&
      max > 0 &&
      t.dice.some((d) => dieType === "any" || d.type === dieType)
    )
      choices.push(
        choose(`Reroll · ${ability}`, "reroll", { ability, dieType, max }),
      );
  return choices;
}
function resolveBattleDice(s, t) {
  const f = t.dice.flatMap((d) => d.faces),
    count = (k) => f.filter((x) => x === k).length;
  let intercept = count("intercept");
  if (has(s, t.p, "L06") && t.allFresh) intercept = Math.max(0, intercept - 1);
  if (has(s, t.defender, "L04") && t.dice.some((d) => d.type === "assault"))
    intercept++;
  const tasks = [];
  if (count("self"))
    tasks.push({
      type: "hits",
      p: t.p,
      target: t.p,
      dealer: t.defender,
      system: t.system,
      left: count("self"),
      kind: "self",
      battle: true,
      attackers: t.attackers,
    });
  if (intercept) {
    let hits = piecesAt(s, t.system, t.defender, "ship").filter(
      (x) => !x.damaged,
    ).length;
    if (has(s, t.defender, "LEAD15")) {
      hits = icons(s, t.defender, "weapon");
      const slots = s.players[t.defender].resources
        .map((r, i) => (r === "weapon" ? i : -1))
        .filter((i) => i >= 0);
      if (slots.length === 1) discardResource(s, t.defender, slots[0]);
      else if (slots.length > 1)
        tasks.push({ type: "agitatorWeapon", p: t.defender });
    }
    if (hits)
      tasks.push({
        type: "hits",
        p: t.p,
        target: t.p,
        dealer: t.defender,
        system: t.system,
        left: hits,
        kind: "self",
        battle: true,
        attackers: t.attackers,
      });
  }
  if (count("hit"))
    tasks.push({
      type: "hits",
      p: t.p,
      target: t.defender,
      dealer: t.p,
      system: t.system,
      left: count("hit"),
      kind: "hit",
      battle: true,
    });
  if (count("building"))
    tasks.push({
      type: "hits",
      p: t.p,
      target: t.defender,
      dealer: t.p,
      system: t.system,
      left: count("building"),
      kind: "building",
      battle: true,
    });
  if (count("key"))
    tasks.push({
      type: "raid",
      p: t.p,
      defender: t.defender,
      system: t.system,
      keys: count("key"),
      attackers: t.attackers,
    });
  tasks.push({
    type: "battleEnd",
    p: t.p,
    defender: t.defender,
    system: t.system,
    beforeTrophies: t.beforeTrophies ?? s.players[t.p].trophies.length,
    attackers: t.attackers,
  });
  push(s, ...tasks);
}
function hit(s, x, dealer, battle) {
  if (!x.damaged) {
    x.damaged = true;
    log(
      s,
      `${s.players[x.owner].name}’s ${x.type} is damaged at ${sysName(x.system)}.`,
      {
        effect: {
          type: "damage",
          system: x.system,
          piece: x.id,
          pieceType: x.type,
          owner: x.owner,
          dealer,
          battle,
        },
      },
    );
    return;
  }
  destroy(s, x, dealer, battle);
}
function destroy(s, x, dealer, battle) {
  remove(s.pieces, x);
  if (dealer !== x.owner)
    s.players[dealer].trophies.push({ id: x.id, type: x.type, owner: x.owner });
  log(
    s,
    `${s.players[x.owner].name}’s ${x.type} is destroyed at ${sysName(x.system)}.`,
    {
      effect: {
        type: "destroy",
        system: x.system,
        piece: x.id,
        pieceType: x.type,
        owner: x.owner,
        dealer,
        battle,
      },
    },
  );
  if (x.type === "city") {
    const types = cityTypes(s, x);
    for (const r of types) outrage(s, dealer, r);
    if (dealer !== x.owner && !(battle && has(s, x.owner, "LEAD01")))
      push(s, { type: "ransack", p: dealer, defender: x.owner });
  }
}
function hasResource(s, p, r) {
  return (
    s.players[p].resources.includes(r) ||
    (s.supply[r] > 0 && has(s, p, { material: "BC03", fuel: "BC06" }[r]))
  );
}
function protectedItem(s, p, defender, kind, r, id) {
  if (kind === "card" && id === "BC22")
    return (
      has(s, defender, "L22") &&
      active(s, "keeper") &&
      hasResource(s, defender, CARDS[id].resource)
    );
  if (has(s, defender, "BC22")) return true;
  if (
    kind === "resource" &&
    has(s, defender, "L21") &&
    active(s, "keeper") &&
    hasResource(s, p, r)
  )
    return true;
  if (
    kind === "card" &&
    has(s, defender, "L22") &&
    active(s, "keeper") &&
    hasResource(s, defender, CARDS[id].resource)
  )
    return true;
  return false;
}
function stealChoices(s, p, defender, keys, raid) {
  const pl = s.players[defender];
  return [
    ...pl.resources.flatMap((r, index) =>
      r &&
      (!raid || resourceKeysFor(s, defender)[index] <= keys) &&
      !protectedItem(s, p, defender, "resource", r)
        ? [
            choose(
              `${cap(r)} from ${pl.name}${raid ? ` · ${resourceKeysFor(s, defender)[index]} keys` : ""}`,
              "stealResource",
              { defender, index, keys: resourceKeysFor(s, defender)[index] },
            ),
          ]
        : [],
    ),
    ...pl.cards
      .filter(
        (id) =>
          CARDS[id].kind === "guild" &&
          CARDS[id].meta.keys <= keys &&
          !protectedItem(s, p, defender, "card", null, id),
      )
      .map((card) =>
        choose(
          `${title(card)} from ${pl.name}${raid ? ` · ${CARDS[card].meta.keys} keys` : ""}`,
          "stealCard",
          { defender, card, keys: CARDS[card].meta.keys },
          { card },
        ),
      ),
  ];
}
function steal(s, p, c, system = null) {
  if (c.op === "stealResource") {
    s.players[p].needsArrange = true;
    const r = s.players[c.defender].resources[c.index];
    s.players[c.defender].resources[c.index] = null;
    addToken(s.players[p], r);
    log(
      s,
      `${s.players[p].name} steals ${r} from ${s.players[c.defender].name}.`,
      {
        effect: {
          type: "loot",
          system,
          resource: r,
          owner: p,
          from: c.defender,
        },
      },
    );
  } else {
    remove(s.players[c.defender].cards, c.card);
    if (c.card === "L13") carryCardSlot(s, c.defender, p);
    if (c.card === "BC22") s.courtDeck.push(c.card);
    else {
      s.players[p].cards.push(c.card);
    }
    log(
      s,
      `${s.players[p].name} steals ${title(c.card)}${c.card === "BC22" ? " and buries it" : ""}.`,
      {
        effect: {
          type: "loot",
          system,
          card: c.card,
          owner: p,
          from: c.defender,
        },
      },
    );
  }
}
function turnOrder(s) {
  return Array.from(
    { length: s.players.length },
    (_, i) => (s.initiative + i) % s.players.length,
  );
}
const fleetCards = ["BC12", "BC13", "BC14", "BC15"];
function preludeAvailable(s, p, id) {
  const pl = s.players[p],
    t = s.turn;
  if (
    ["BC02", "BC09", "BC03", "BC06", "BC08", "BC17", "BC20", "BC23"].includes(
      id,
    )
  )
    return true;
  if (["BC04", "BC05", "BC10", "BC11"].includes(id))
    return s.played.some(
      (x) =>
        x.faceup &&
        ACTION_CARDS[x.card].suit ===
          {
            BC04: "administration",
            BC05: "construction",
            BC10: "mobilization",
            BC11: "aggression",
          }[id],
    );
  if (fleetCards.includes(id)) return true;
  if (id === "BC16") return !t.acted;
  if (id === "BC24")
    return (
      !t.used.includes(id) && pl.resources.some(Boolean) && s.supply.relic > 0
    );
  if (["L19", "L21", "L23", "L25", "L28"].includes(id)) return true;
  if (id === "L24")
    return (
      active(s, "warlord") && pl.trophies.length > 0 && pool(s, p, "agent") > 0
    );
  if (id === "L27")
    return (
      active(s, "tycoon") &&
      !t.acted &&
      !t.used.includes(id) &&
      canDeclare(s, p) &&
      AMBITIONS.some((a) => !active(s, a))
    );
  return false;
}
function usePrelude(s, p, card) {
  const pl = s.players[p];
  ok(preludeAvailable(s, p, card), "That ability is not available.");
  const union = ["BC04", "BC05", "BC10", "BC11"].includes(card);
  // A Union, Relic Fence or a Lore Prelude is an action only once it does
  // something; Skip, Done or Back backs out of it (C10). See resolveTask and
  // resolvePrelude.
  if (
    !["BC16", "BC24", "L27", "L19", "L21", "L23", "L24", "L25", "L28"].includes(
      card,
    ) &&
    !union
  )
    s.turn.acted = true;
  if (union) {
    push(s, {
      type: "union",
      p,
      card,
      suit: {
        BC04: "administration",
        BC05: "construction",
        BC10: "mobilization",
        BC11: "aggression",
      }[card],
    });
    return;
  }
  if (["BC02", "BC09"].includes(card)) {
    discardCard(s, p, card);
    push(s, {
      type: "interest",
      p,
      card,
      resource: card === "BC02" ? "material" : "fuel",
    });
    return;
  }
  if (["BC03", "BC06"].includes(card)) {
    discardCard(s, p, card);
    push(s, { type: "prelude", p, card });
    return;
  }
  if (card === "BC08") {
    discardCard(s, p, card);
    push(s, {
      type: "prelude",
      p,
      card,
      gates: systems(s).filter((id) => MAP[id].symbol === "gate"),
    });
    return;
  }
  if (fleetCards.includes(card)) {
    discardCard(s, p, card);
    push(s, { type: "placeFleet", p });
    return;
  }
  if (card === "BC16") {
    discardCard(s, p, card);
    if (canSeize(s, p)) seize(s, p);
    return;
  }
  if (card === "BC17") {
    discardCard(s, p, card);
    push(s, { type: "farseersDiscard", p });
    return;
  }
  if (card === "BC20") {
    discardCard(s, p, card);
    push(s, { type: "steal", p });
    return;
  }
  if (card === "BC23") {
    discardCard(s, p, card);
    for (const r of ["material", "fuel", "weapon"]) gain(s, p, r);
    return;
  }
  if (card === "BC24") {
    push(s, { type: "relicFence", p });
    return;
  }
  push(s, { type: "prelude", p, card });
}
function preludeDecision(s, t) {
  const p = t.p,
    pl = s.players[p],
    card = t.card;
  const choices = [];
  if (["BC03", "BC06"].includes(card)) {
    const r = card === "BC03" ? "material" : "fuel";
    choices.push(
      ...s.players
        .filter((x) => x.id !== p)
        .flatMap((x) =>
          stealChoices(s, p, x.id, 99, false).filter(
            (c) => c.op === "stealResource" && x.resources[c.index] === r,
          ),
        ),
    );
  }
  if (card === "BC08" && pool(s, p, "ship") > 0)
    choices.push(
      ...t.gates.map((system) =>
        choose(`Place a ship · ${sysName(system)}`, "gatekeeper", { system }),
      ),
    );
  if (["L19", "L21", "L23", "L25", "L28"].includes(card)) {
    const resources = {
      L19: ["psionic"],
      L21: ["relic"],
      L23: ["weapon"],
      L25: ["weapon"],
      L28: ["material", "fuel"],
    }[card];
    choices.push(
      choose("Discard this lore to clear Outrage", "clearOutrage", {
        resources,
      }),
    );
  }
  if (card === "L24" && active(s, "warlord") && pool(s, p, "agent") > 0)
    choices.push(
      ...pl.trophies.map((x, index) =>
        choose(
          `Return ${s.players[x.owner].name} ${x.type} to influence`,
          "spendTrophy",
          { index },
        ),
      ),
    );
  if (
    card === "L25" &&
    active(s, "tyrant") &&
    actionTargets(s, p, "secure").length
  )
    choices.push(
      ...pl.captives.map((x, index) =>
        choose(
          `Return ${s.players[x.owner].name} captive to secure`,
          "spendCaptive",
          { index },
        ),
      ),
    );
  if (card === "L27")
    choices.push(
      ...AMBITIONS.filter((a) => !active(s, a)).map((ambition) =>
        choose(
          `Discard all fuel & material · declare ${ambition}`,
          "tycoonDeclare",
          { ambition },
        ),
      ),
    );
  if (
    card === "L28" &&
    active(s, "tycoon") &&
    pl.resources.some((r) => ["material", "fuel"].includes(r))
  )
    choices.push(
      choose("Trade Material and Fuel for new resources", "tycoonTrade"),
    );
  if (card !== "BC08" || !choices.length) choices.push(choose("Done", "skip"));
  return { title: title(card), choices };
}
function resolvePrelude(s, t, c) {
  const p = t.p,
    pl = s.players[p];
  // Using a Lore Prelude is an action (Tycoon's Ambition's declaration is not).
  const actedBefore = s.turn.acted;
  if (
    ["clearOutrage", "spendTrophy", "spendCaptive", "tycoonTrade"].includes(
      c.op,
    )
  )
    s.turn.acted = true;
  if (c.op.startsWith("steal")) steal(s, p, c);
  if (c.op === "gatekeeper") {
    place(s, p, "ship", c.system);
    const gates = t.gates.filter((x) => x !== c.system);
    if (gates.length && pool(s, p, "ship") > 0) push(s, { ...t, gates });
  }
  if (c.op === "clearOutrage") {
    discardCard(s, p, t.card);
    pl.outrage = pl.outrage.filter((r) => !c.resources.includes(r));
  }
  if (c.op === "spendTrophy") {
    pl.trophies.splice(c.index, 1);
    push(s, {
      type: "action",
      p,
      action: "influence",
      cost: "free",
      configured: true,
    });
  }
  if (c.op === "spendCaptive") {
    pl.captives.splice(c.index, 1);
    push(s, {
      type: "action",
      p,
      action: "secure",
      cost: "free",
      configured: true,
    });
  }
  if (c.op === "tycoonDeclare") {
    pl.resources.forEach((r, i) => {
      if (["material", "fuel"].includes(r)) discardResource(s, p, i);
    });
    declare(s, p, c.ambition, false);
    s.turn.used.push("L27");
  }
  if (c.op === "tycoonTrade")
    push(s, {
      actedBefore,
      back: t,
      type: "special",
      p,
      card: "L28",
      action: "trade",
      cost: "free",
      stage: "select",
    });
}
function voxDecision(s, t) {
  const p = t.p,
    id = t.id;
  let choices = [];
  if (id === "BC26")
    choices = s.clusters.map((cluster) =>
      choose(`Place 1 ship in each system · sector ${cluster}`, "uprising", {
        cluster,
      }),
    );
  if (id === "BC27" && canDeclare(s, p))
    choices = AMBITIONS.map((ambition) =>
      choose(`Declare ${ambition}`, "populist", { ambition }),
    );
  if (id === "BC28")
    choices = RESOURCES.map((resource) =>
      choose(`Provoke ${resource} Outrage for everyone`, "outrageAll", {
        resource,
      }),
    );
  if (id === "BC29")
    choices = piecesAt(s, null, undefined, "city")
      .filter((x) => control(s, x.system) === p)
      .map((x) =>
        choose(
          `Return ${pieceName(s, x)}`,
          "freedom",
          { piece: x.id },
          { system: x.system },
        ),
      );
  if (id === "BC30")
    choices = s.players
      .filter((x) => x.id !== p)
      .flatMap((x) =>
        stealChoices(s, p, x.id, 99, false).filter((c) => c.op === "stealCard"),
      );
  if (id === "BC31") choices = [choose("Draw an action card", "call")];
  if (!["BC26", "BC31"].includes(id)) choices.push(choose("Continue", "skip"));
  return {
    title: title(id),
    description: CARDS[id].text?.replaceAll("*", ""),
    choices,
  };
}
function resolveVox(s, t, c) {
  const p = t.p;
  const queued = s.pending.length;
  if (c.op === "uprising") {
    const ids = systems(s).filter((x) => MAP[x].cluster === c.cluster);
    if (pool(s, p, "ship") < 4)
      push(s, { type: "prelude", p, card: "BC08", gates: ids });
    else for (const id of ids) place(s, p, "ship", id);
  }
  if (c.op === "populist") declare(s, p, c.ambition, false);
  if (c.op === "outrageAll")
    for (const pl of s.players) outrage(s, pl.id, c.resource);
  if (c.op === "freedom") {
    remove(
      s.pieces,
      s.pieces.find((x) => x.id === c.piece),
    );
    if (canSeize(s, p)) push(s, { type: "freedomSeize", p });
  }
  if (c.op === "stealCard") steal(s, p, c);
  if (c.op === "call" && s.discardDown.length + s.discardUp.length) {
    reveal(s, "deck");
    const meta = {},
      drawn = drawDiscard(s, 1, meta);
    s.players[p].hand.push(...drawn);
    log(
      s,
      `${s.players[p].name} draws ${drawn.length} ${drawn.length === 1 ? "card" : "cards"} with Call to Action.`,
      { draw: drawRecord(p, drawn.length, "call", meta) },
    );
  }
  if (t.id === "BC30") {
    const guilds = s.courtDiscard.filter((id) => CARDS[id].kind === "guild");
    s.courtDiscard = s.courtDiscard.filter((id) => CARDS[id].kind !== "guild");
    s.courtDeck = shuffle(s, [...s.courtDeck, ...guilds]);
  }
  // Anything the effect queued (a declaration's Noble/Bold/Farseers/Generous,
  // Uprising's Prelude, Freedom's seize) is part of resolving the card, so the
  // discard and Court refill wait behind it.
  const deferred = s.pending.length - queued;
  if (deferred)
    s.pending.splice(deferred, 0, {
      type: "voxFinish",
      p,
      id: t.id,
      index: t.index,
    });
  else finishVox(s, t, t.id === "BC29");
}
function specialTargets(s, p, action, cost) {
  const pl = s.players[p],
    out = [];
  const add = (id, label, condition = true) => {
    if (has(s, p, id) && condition)
      out.push(choose(label, "special", { card: id }, { card: id }));
  };
  if (action === "build") {
    add("BC02", "Manufacture · Mining Interest", s.supply.material > 0);
    add("BC09", "Synthesize · Shipping Interest", s.supply.fuel > 0);
    add("BC12", "Pressgang · Prison Wardens", pl.captives.length > 0);
    add(
      "L01",
      "Summon · Tool-Priests",
      !s.turn.used.includes("L01") &&
        pool(s, p, "ship") > 0 &&
        piecesAt(s, null, undefined, "city").some(
          (x) => control(s, x.system) === p,
        ),
    );
    add(
      "L10",
      "Nurture · Living Structures",
      eligibleCities(s, p).some((x) => x.owner === p),
    );
    add(
      "L26",
      "Annex · Tyrant’s Authority",
      active(s, "tyrant") &&
        s.pieces.some(
          (x) =>
            x.type !== "ship" &&
            control(s, x.system) === p &&
            pool(s, p, x.type) > 0,
        ),
    );
  }
  if (action === "influence")
    add("BC12", "Execute · Prison Wardens", pl.captives.length > 0);
  if (action === "battle") {
    add(
      "BC14",
      "Abduct · Court Enforcers",
      s.court.some(
        (c) =>
          c.id &&
          c.agents.reduce((n, v, i) => n + (i === p ? 0 : v), 0) > 0 &&
          c.agents.reduce((n, v, i) => n + (i === p ? 0 : v), 0) <
            icons(s, p, "weapon"),
      ),
    );
    add(
      "L02",
      "Fire Rifles · Galactic Rifles",
      systems(s).some(
        (id) =>
          piecesAt(s, id, p, "ship").some((x) => !x.damaged) &&
          adjacent(id, s.clusters).some((next) =>
            piecesAt(s, next).some((x) => x.owner !== p),
          ),
      ),
    );
  }
  if (action === "tax")
    add("BC23", "Trade · Elder Broker", tradePairs(s, p, cost).length > 0);
  if (action === "repair")
    add(
      "L10",
      "Prune · Living Structures",
      piecesAt(s, null, p).some(
        (x) =>
          x.type !== "ship" &&
          !x.cloud &&
          MAP[x.system].slots > 0 &&
          pool(s, p, x.type === "city" ? "starport" : "city") > 0,
      ),
    );
  if (action === "move") {
    add(
      "L16",
      "Guide · Force Beams",
      s.pieces.some(
        (x) =>
          x.type === "starport" &&
          x.owner === p &&
          !x.damaged &&
          (piecesAt(s, x.system, undefined, "ship").length ||
            adjacent(x.system, s.clusters).some(
              (id) => piecesAt(s, id, undefined, "ship").length,
            )),
      ),
    );
    add(
      "L18",
      "Martyr · Survival Overrides",
      piecesAt(s, null, p, "ship").some((x) => !x.damaged),
    );
  }
  return out;
}
// `cost` is the slot index when the Trade is paid with a resource. That token
// is spent before the swap, so it cannot also be the one given away.
function tradePairs(s, p, cost) {
  const pl = s.players[p],
    choices = [];
  for (const city of piecesAt(s, null, undefined, "city").filter(
    (x) => x.owner !== p && control(s, x.system) === p,
  ))
    for (const r of cityTypes(s, city))
      for (let take = 0; take < s.players[city.owner].resources.length; take++)
        if (s.players[city.owner].resources[take] === r)
          for (let give = 0; give < pl.resources.length; give++)
            if (
              give !== cost &&
              pl.resources[give] &&
              !hasResource(s, city.owner, pl.resources[give])
            )
              choices.push(
                choose(
                  `Trade ${pl.resources[give]} for ${r} with ${s.players[city.owner].name}`,
                  "trade",
                  { rival: city.owner, take, give },
                  { system: city.system },
                ),
              );
  return choices;
}
function specialDecision(s, t) {
  const p = t.p,
    pl = s.players[p],
    id = t.card;
  let choices = [],
    form;
  if (id === "BC02" || id === "BC09")
    choices = [
      choose(`Gain 1 ${id === "BC02" ? "material" : "fuel"}`, "manufacture"),
    ];
  if (id === "BC12")
    form = {
      kind: "pieces",
      options: pl.captives.map((x) => ({
        id: x.id,
        label: `${s.players[x.owner].name} captive`,
      })),
      min: 0,
      max: pl.captives.length,
    };
  if (id === "BC14")
    choices = s.court.flatMap((c, index) =>
      c.id &&
      c.agents.reduce((n, v, i) => n + (i === p ? 0 : v), 0) <
        icons(s, p, "weapon")
        ? [
            choose(
              `Abduct agents from ${title(c.id)}`,
              "abduct",
              { index },
              { card: c.id },
            ),
          ]
        : [],
    );
  if (id === "BC23") choices = tradePairs(s, p, t.cost);
  if (id === "L01")
    choices = piecesAt(s, null, undefined, "city")
      .filter((x) => control(s, x.system) === p)
      .map((x) =>
        choose(
          `Summon at ${sysName(x.system)}`,
          "summon",
          { piece: x.id },
          { system: x.system },
        ),
      );
  if (id === "L10" && t.action === "build")
    choices = eligibleCities(s, p)
      .filter((x) => x.owner === p)
      .map((x) =>
        choose(
          `Nurture ${pieceName(s, x)}`,
          "nurture",
          { piece: x.id },
          { system: x.system },
        ),
      );
  if (id === "L10" && t.action === "repair")
    choices = piecesAt(s, null, p)
      .filter(
        (x) =>
          x.type !== "ship" &&
          !x.cloud &&
          MAP[x.system].slots > 0 &&
          pool(s, p, x.type === "city" ? "starport" : "city") > 0,
      )
      .map((x) =>
        choose(
          `Replace ${x.type} with ${x.type === "city" ? "starport" : "city"} · ${sysName(x.system)}`,
          "prune",
          { piece: x.id },
          { system: x.system },
        ),
      );
  if (id === "L18")
    choices = piecesAt(s, null, p, "ship")
      .filter((x) => !x.damaged)
      .flatMap((x) => [
        choose(
          `Sacrifice ${pieceName(s, x)} only`,
          "martyr",
          { own: x.id },
          { system: x.system },
        ),
        ...piecesAt(s, x.system, undefined, "ship")
          .filter((v) => v.owner !== p)
          .map((v) =>
            choose(
              `Sacrifice a ship · destroy ${pieceName(s, v)}`,
              "martyr",
              { own: x.id, target: v.id },
              { system: x.system },
            ),
          ),
      ]);
  if (id === "L26")
    choices = s.pieces
      .filter(
        (x) =>
          x.type !== "ship" &&
          control(s, x.system) === p &&
          pool(s, p, x.type) > 0,
      )
      .map((x) =>
        choose(
          `Annex ${pieceName(s, x)}`,
          "annex",
          { piece: x.id },
          { system: x.system },
        ),
      );
  if (id === "L02" && !t.stage)
    choices = systems(s)
      .filter((id) => piecesAt(s, id, p, "ship").some((x) => !x.damaged))
      .flatMap((system) =>
        adjacent(system, s.clusters).flatMap((target) =>
          s.players
            .filter((pl) => pl.id !== p && piecesAt(s, target, pl.id).length)
            .map((pl) =>
              choose(
                `Fire from ${sysName(system)} at ${pl.name} · ${sysName(target)}`,
                "rifles",
                { system, target, defender: pl.id },
              ),
            ),
        ),
      );
  if (id === "L02" && t.stage === "dice")
    choices = Array.from(
      {
        length:
          Math.min(
            6,
            piecesAt(s, t.system, p, "ship").filter((x) => !x.damaged).length,
          ) + 1,
      },
      (_, n) => choose(`Roll ${n} skirmish dice`, "rifleDice", { n }),
    );
  if (id === "L02" && t.stage === "reroll")
    form = {
      kind: "diceSelect",
      options: t.dice.map((d, i) => ({
        id: String(i),
        label: d.faces.join(" + ") || "Blank",
      })),
      min: 0,
      max: t.dice.length,
    };
  if (id === "L16" && !t.stage)
    choices = systems(s)
      .filter((id) => piecesAt(s, id, undefined, "ship").length)
      .flatMap((system) =>
        adjacent(system, s.clusters)
          .filter((target) =>
            [system, target].some((id) =>
              piecesAt(s, id, p, "starport").some((x) => !x.damaged),
            ),
          )
          .map((target) =>
            choose(
              `Guide ships · ${sysName(system)} to ${sysName(target)}`,
              "guide",
              { system, target },
            ),
          ),
      );
  if (id === "L16" && t.stage === "ships")
    form = {
      kind: "pieces",
      options: piecesAt(s, t.system, undefined, "ship").map((x) => ({
        id: x.id,
        label: pieceName(s, x),
      })),
      min: 1,
      max: 60,
    };
  if (id === "L28")
    form = {
      kind: "resources",
      options: pl.resources.flatMap((r, i) =>
        ["material", "fuel"].includes(r)
          ? [{ id: String(i), label: `${cap(r)} · slot ${i + 1}` }]
          : [],
      ),
      min: 1,
      max: pl.resources.length,
    };
  return {
    title: title(id),
    description: CARDS[id]?.text?.replaceAll("*", ""),
    ...(form
      ? { form }
      : {
          choices: [
            ...choices,
            ...(t.required ? [] : [choose("Back", "cancel")]),
          ],
        }),
  };
}
function resolveSpecial(s, t, c) {
  const p = t.p,
    pl = s.players[p];
  if (c.op === "rifles") {
    push(s, { ...t, stage: "dice", back: t, ...c });
    return;
  }
  if (c.op === "guide") {
    push(s, { ...t, stage: "ships", back: t, ...c });
    return;
  }
  pay(s, p, t.cost, t.action);
  if (c.op === "manufacture")
    gain(s, p, t.card === "BC02" ? "material" : "fuel");
  if (c.op === "abduct") {
    const court = s.court[c.index];
    for (let owner = 0; owner < s.players.length; owner++)
      if (owner !== p) {
        for (let i = 0; i < court.agents[owner]; i++)
          pl.captives.push({ id: `p${++s.pieceId}`, owner, type: "agent" });
        court.agents[owner] = 0;
      }
  }
  if (c.op === "trade") {
    [pl.resources[c.give], s.players[c.rival].resources[c.take]] = [
      s.players[c.rival].resources[c.take],
      pl.resources[c.give],
    ];
  }
  if (c.op === "summon") {
    const city = s.pieces.find((x) => x.id === c.piece);
    s.turn.used.push("L01");
    build(s, p, "ship", city.system, null, false, "free");
  }
  if (c.op === "nurture")
    resolveStandard(s, p, { op: "taxTarget", piece: c.piece }, t.cost);
  if (c.op === "prune") {
    const x = s.pieces.find((x) => x.id === c.piece),
      kind = x.type === "city" ? "starport" : "city";
    const id = place(s, p, kind, x.system, 1, x.damaged)[0];
    if (x.cloud && id) s.pieces.find((x) => x.id === id).cloud = true;
    remove(s.pieces, x);
  }
  if (c.op === "martyr") {
    const own = s.pieces.find((x) => x.id === c.own),
      target = s.pieces.find((x) => x.id === c.target);
    remove(s.pieces, own);
    if (target) destroy(s, target, p, false);
  }
  if (c.op === "annex") {
    const x = s.pieces.find((x) => x.id === c.piece);
    const id = place(s, p, x.type, x.system, 1, x.damaged)[0];
    if (x.cloud && id) s.pieces.find((x) => x.id === id).cloud = true;
    remove(s.pieces, x);
  }
  if (c.op === "rifleDice") {
    const dice = Array.from({ length: c.n }, () => ({
      type: "skirmish",
      faces: DICE.skirmish[Math.floor(random(s) * 6)],
    }));
    recordBattle(s, {
      attacker: p,
      defender: t.defender,
      system: t.target,
      dice,
      revision: s.revision + 1,
      rifles: true,
    });
    log(
      s,
      `${pl.name} fires ${dice.length} skirmish ${dice.length === 1 ? "die" : "dice"} at ${s.players[t.defender].name}: ${diceText(dice)}.`,
      { battle: true },
    );
    if (has(s, p, "L19") && active(s, "empath"))
      push(s, { ...t, stage: "reroll", dice, back: undefined });
    else rifleHits(s, t, dice);
  }
  log(s, `${pl.name} uses ${title(t.card)}.`);
}
function rifleHits(s, t, dice) {
  const n = dice.flatMap((d) => d.faces).filter((x) => x === "hit").length;
  if (n)
    push(s, {
      type: "hits",
      p: t.p,
      target: t.defender,
      dealer: t.p,
      system: t.target,
      left: n,
      kind: "hit",
      battle: false,
    });
}
function resolveSpecialForm(s, t, value) {
  const p = t.p,
    pl = s.players[p];
  if (t.card === "L02") {
    const before = value.map((id) => faceText(t.dice[Number(id)].faces));
    for (const id of value)
      t.dice[Number(id)].faces = DICE.skirmish[Math.floor(random(s) * 6)];
    s.lastBattle.dice = t.dice;
    if (value.length) {
      recordReroll(s, "Empath’s Vision");
      log(
        s,
        `${pl.name} rerolls ${value.length} ${value.length === 1 ? "die" : "dice"} (Empath’s Vision): ${value.map((id, k) => `${before[k]} → ${faceText(t.dice[Number(id)].faces)}`).join(", ")}.`,
        { battle: true },
      );
    }
    rifleHits(s, t, t.dice);
    return;
  }
  if (t.card !== "L28") pay(s, p, t.cost, t.action);
  if (t.card === "BC12") {
    const selected = pl.captives.filter((x) => value.includes(x.id));
    pl.captives = pl.captives.filter((x) => !value.includes(x.id));
    if (t.action === "influence") pl.trophies.push(...selected);
    else if (selected.length)
      push(s, {
        type: "gainChoice",
        p,
        count: selected.length,
        reason: "Pressgang",
      });
  }
  if (t.card === "L16")
    for (const id of value) s.pieces.find((x) => x.id === id).system = t.target;
  if (t.card === "L28") {
    for (const id of value) discardResource(s, p, Number(id));
    push(s, {
      type: "gainChoice",
      p,
      count: value.length,
      reason: "Tycoon’s Charm",
    });
  }
  log(s, `${pl.name} uses ${title(t.card)}.`);
}
function pump(s) {
  for (let guard = 0; guard < 100; guard++) {
    if (s.phase === "over") return;
    if (!cleanResources(s)) return;
    const t = s.pending[0];
    if (!t) return;
    let auto = true;
    switch (t.type) {
      case "action":
        if (t.required && !actionTargets(s, t.p, t.action).length) {
          const revision = s.revision;
          Object.assign(s, t.rollback);
          s.revision = revision;
          log(
            s,
            "Bonus action undone: its required follow-up has no legal target.",
          );
        } else auto = false;
        break;
      case "noble": {
        s.pending.shift();
        const id = s.courtDeck.shift();
        if (id) {
          reveal(s, "deck");
          const index = s.court.length;
          s.court.push({ id, agents: s.players.map(() => 0), temporary: true });
          secure(s, t.p, index);
        }
        break;
      }
      case "railgun":
        s.pending.shift();
        if (piecesAt(s, t.system, t.p, "ship").some((x) => !x.damaged)) {
          reveal(s, "rival"); // The defender's card responds.
          push(s, {
            type: "hits",
            p: t.attacker,
            target: t.attacker,
            dealer: t.p,
            system: t.system,
            left: 1,
            kind: "self",
            battle: true,
            attackers: t.attackers,
          });
        }
        break;
      case "reroll":
        if (t.dice.length) auto = false;
        else {
          s.pending.shift();
          resolveBattleDice(s, t);
        }
        break;
      case "dice":
        if (!piecesAt(s, t.system, t.p, "ship").length) {
          s.pending.shift();
          push(s, {
            ...t,
            type: "battleEnd",
            beforeTrophies: s.players[t.p].trophies.length,
          });
        } else auto = false;
        break;
      case "hits": {
        const all = piecesAt(s, t.system, t.target).filter(
          (x) =>
            t.kind !== "self" || !t.attackers || t.attackers.includes(x.id),
        );
        if (
          !all.some((x) =>
            t.kind === "self"
              ? x.type === "ship"
              : t.kind === "building"
                ? x.type !== "ship"
                : true,
          ) ||
          t.left <= 0
        )
          s.pending.shift();
        else auto = false;
        break;
      }
      case "raid": {
        const alive = piecesAt(s, t.system, t.p, "ship").some(
            (x) => !t.attackers || t.attackers.includes(x.id),
          ),
          affordable = stealChoices(s, t.p, t.defender, t.keys, true).length;
        if (!alive || t.keys <= 0 || !affordable) {
          s.pending.shift();
          // Say why a raid came to nothing; one that stole something is
          // already in the log.
          if (!t.stolen) {
            const who = s.players[t.p].name,
              from = s.players[t.defender].name;
            log(
              s,
              `${who}’s raid on ${from} steals nothing: ${
                !alive
                  ? "no attacking ship survived"
                  : t.keys <= 0
                    ? "no keys left"
                    : stealChoices(s, t.p, t.defender, 99, true).length
                      ? `nothing ${from} holds costs ${t.keys} key${t.keys === 1 ? "" : "s"} or fewer`
                      : `${from} has nothing that can be stolen`
              }.`,
              { battle: true },
            );
          }
        } else auto = false;
        break;
      }
      case "battleEnd": {
        s.pending.shift();
        const tasks = [];
        if (has(s, t.p, "L07"))
          tasks.push({
            type: "repairBonus",
            p: t.p,
            system: t.system,
            left: 1,
            reason: "Repair Drones",
            attackers: t.attackers,
          });
        for (const p of [t.p, t.defender])
          if (has(s, p, "LEAD16"))
            tasks.push({
              type: "repairBonus",
              p,
              system: t.system,
              left: s.pieces.filter(
                (x) => x.type === "starport" && control(s, x.system) === p,
              ).length,
              reason: "Quartermaster",
            });
        if (
          has(s, t.defender, "LEAD01") &&
          s.players[t.p].trophies.length > t.beforeTrophies
        )
          tasks.push({
            type: "freeChoice",
            p: t.defender,
            action: "influence",
            reason: "Elder · Beloved",
          });
        pushEffects(s, tasks);
        break;
      }
      case "voxFinish":
        s.pending.shift();
        finishVox(s, t, t.id === "BC29");
        break;
      case "ruthlessRepeat":
        s.pending.shift();
        if (t.action === "tax") {
          if (t.resources.length > 1)
            push(s, {
              type: "taxType",
              p: t.p,
              piece: t.piece,
              resources: t.resources,
              cost: "free",
              repeat: true,
            });
          else taxGain(s, t.p, t.piece, t.resources[0], "free", true);
        } else build(s, t.p, "ship", t.piece.system, null, false, "free", true);
        break;
      case "repairBonus":
        if (
          t.left <= 0 ||
          !piecesAt(s, t.system, t.p, "ship").some(
            (x) => x.damaged && (!t.attackers || t.attackers.includes(x.id)),
          )
        )
          s.pending.shift();
        else auto = false;
        break;
      case "overflow":
        if (s.players[t.p].resources.filter(Boolean).length <= capacity(s, t.p))
          s.pending.shift();
        else auto = false;
        break;
      case "farseersRival":
        if (!s.players.some((x) => x.id !== t.p && x.hand.length))
          s.pending.shift();
        else auto = false;
        break;
      case "ransack":
        if (!s.court.some((c) => c.id && c.agents[t.defender] > 0))
          s.pending.shift();
        else auto = false;
        break;
      case "sprinter":
        if (!s.pieces.some((x) => t.ids.includes(x.id) && !x.damaged))
          s.pending.shift();
        else auto = false;
        break;
      case "interest":
        if (s.players[t.p].resources.filter(Boolean).length >= capacity(s, t.p))
          s.pending.shift();
        else auto = false;
        break;
      case "freedomSeize":
        if (!canSeize(s, t.p)) s.pending.shift();
        else auto = false;
        break;
      default:
        auto = false;
    }
    if (!auto) return;
  }
  throw new Error("Rule resolution exceeded its step limit.");
}
function publicActivity(s) {
  const t = s.pending[0];
  const labels = {
    dice: "Choosing battle dice",
    reroll: "Resolving battle dice",
    hits: "Assigning battle hits",
    raid: "Resolving a raid",
    ransack: "Ransacking the Court",
    predictive: "Choosing reinforcements",
    moveSelect: "Selecting ships to move",
    moveTo: "Choosing a destination",
    catapult: "Resolving a catapult move",
    arrangeResources: "Arranging resources",
    reorder: "Arranging resources",
    overflow: "Choosing resources to keep",
    farseersRival: "Using Farseers",
    farseersDiscard: "Using Farseers",
    farseersSwap: "Using Farseers",
    farseersGive: "Using Farseers",
    generous: "Giving a Guild before declaring",
    effects: "Choosing effect order",
  };
  return {
    label: t
      ? (labels[t.type] ?? "Resolving an action or ability")
      : s.phase === "draft"
        ? "Drafting a leader or lore"
        : s.phase === "card"
          ? s.lead
            ? "Choosing a response card"
            : "Choosing the lead card"
          : s.phase === "over"
            ? "Game complete"
            : s.turn?.prelude
              ? "Taking Prelude actions"
              : "Taking card actions",
    system: t?.system && MAP[t.system] ? t.system : null,
    resolving: !!t,
  };
}
export function viewFor(s, p) {
  const d = decision(s, p);
  const out = {
    schema: s.schema,
    revision: s.revision,
    phase: s.phase,
    draft:
      s.phase === "draft"
        ? { leaders: s.draft.leaders, lore: s.draft.lore }
        : null,
    chapter: s.chapter,
    round: s.round,
    initiative: s.initiative,
    current: s.current,
    roundLeader: s.roundLeader,
    seized: s.seized,
    setupId: s.setupId,
    clusters: s.clusters,
    lead: s.lead,
    turn: s.turn ? { ...s.turn } : null,
    played: s.played.map((c) => ({ ...c, card: c.faceup ? c.card : null })),
    players: s.players.map(({ needsArrange, ...pl }) => ({
      ...pl,
      hand: pl.id === p ? pl.hand : pl.hand.length,
    })),
    pieces: s.pieces,
    court: s.court.filter((c) => !c.temporary),
    courtDeckCount: s.courtDeck.length,
    courtDiscard: s.courtDiscard,
    // Every face-up card shown is certainly in the pile; the face-down pile
    // is a count only. Read defensively: saved games may predate the split.
    discardUp: (s.discardUp ?? []).reduce((rounds, { round, ...card }) => {
      if (rounds.at(-1)?.round !== round) rounds.push({ round, cards: [] });
      rounds.at(-1).cards.push(card);
      return rounds;
    }, []),
    discardDownCount: s.discardDown.length,
    supply: s.supply,
    markers: s.markers,
    neutral: s.neutral,
    overrides: s.overrides,
    controls: Object.fromEntries(systems(s).map((id) => [id, control(s, id)])),
    log: s.log,
    lastBattle: s.lastBattle,
    battles: s.battles,
    scoreHistory: s.scoreHistory,
    winner: s.winner,
    options: s.options,
    battleContext: (() => {
      const t = s.pending.find((t) => t.defender !== undefined && t.system);
      if (
        !t ||
        ![
          "dice",
          "reroll",
          "rerollSelect",
          "hits",
          "raid",
          "battleEnd",
          "predictive",
        ].includes(t.type)
      )
        return null;
      const defender = t.defender,
        attacker = t.p;
      const defenderBuildings = piecesAt(s, t.system, defender).some(
        (x) => x.type !== "ship",
      );
      const noBuildings = !piecesAt(s, null, defender).some(
        (x) => x.type !== "ship",
      );
      const protectedPort =
        has(s, defender, "L05") &&
        piecesAt(s, t.system, defender, "starport").some((x) => !x.damaged);
      return {
        attacker,
        defender,
        system: t.system,
        freshDefenders: piecesAt(s, t.system, defender, "ship").filter(
          (x) => !x.damaged,
        ).length,
        raidReason: protectedPort
          ? "Raiding is blocked by the defender’s fresh starport and Hidden Harbors."
          : defenderBuildings
            ? "Raid dice are allowed because the defender has a building in this system."
            : noBuildings
              ? "Raid dice are allowed because the defender has no buildings on the map."
              : has(s, attacker, "L17")
                ? "Raiding is normally unavailable here; your ability permits one raid die."
                : "Raid dice are unavailable: the defender has buildings elsewhere, but none here.",
        cards: [
          ...new Set(
            [
              s.players[attacker].leader,
              ...s.players[attacker].cards,
              s.players[defender].leader,
              ...s.players[defender].cards,
            ].filter(Boolean),
          ),
        ],
      };
    })(),
    interaction: (() => {
      const t = s.pending[0];
      if (!t || t.p !== p) return null;
      if (
        [
          "moveSelect",
          "moveTo",
          "catapult",
          "catapultSelect",
          "sprintSelect",
        ].includes(t.type)
      )
        return {
          kind: t.type,
          origin: t.system,
          ids: t.ids ?? [],
          destination: t.to ?? null,
          cost: t.cost,
          destinations:
            t.type === "moveSelect" ? adjacent(t.system, s.clusters) : [],
        };
      if (t.type === "action" && t.action === "move")
        return { kind: "moveOrigin", cost: t.cost };
      return null;
    })(),
    resourceArrangement:
      s.pending[0]?.p === p &&
      (s.pending[0]?.type === "arrangeResources" ||
        (s.pending[0]?.type === "reorder" &&
          s.pending[1]?.type === "arrangeResources"))
        ? {
            selected:
              s.pending[0].type === "reorder" ? s.pending[0].index : null,
          }
        : null,
    // Public activity describes the step, never its private choices or card identities.
    activity: publicActivity(s),
    decision: d,
    me: p,
    ambitionValues: Object.fromEntries(
      AMBITIONS.map((a) => [a, ambitionValues(s, a)]),
    ),
    ambitionAwards: Object.fromEntries(
      AMBITIONS.map((a) => [a, scoreAmbition(s, a)]),
    ),
    supplies: s.players.map((pl) =>
      Object.fromEntries(
        ["ship", "city", "starport", "agent"].map((type) => [
          type,
          pool(s, pl.id, type),
        ]),
      ),
    ),
    resourceKeys: s.players.map((pl) => resourceKeysFor(s, pl.id)),
    capacities: s.players.map((pl) => capacity(s, pl.id)),
  };
  if (out.turn) {
    delete out.turn.card;
    delete out.turn.used;
    delete out.turn.taxed;
    delete out.turn.built;
  }
  return out;
}
export function assertInvariants(s) {
  ok(
    new Set(s.pieces.map((x) => x.id)).size === s.pieces.length,
    "Duplicate piece identity.",
  );
  for (const x of s.pieces)
    ok(
      s.clusters.includes(MAP[x.system]?.cluster),
      "A piece entered an out-of-play system.",
    );
  for (const p of s.players) {
    ok(p.power >= 0, "Power cannot be negative in the base game.");
    for (const type of ["ship", "city", "starport"])
      ok(pool(s, p.id, type) >= 0, `Too many ${type} pieces.`);
    ok(
      p.resources.every((r) => r === null || RESOURCES.includes(r)),
      "Unknown resource.",
    );
  }
  for (const r of RESOURCES) {
    const out =
      Object.values(MAP).filter(
        (m) => m.resource === r && !s.clusters.includes(m.cluster),
      ).length * (s.players.length === 2 ? 1 : 0);
    const total =
      s.supply[r] +
      s.players.reduce(
        (n, p) => n + p.resources.filter((x) => x === r).length,
        0,
      ) +
      s.held.filter((x) => x === r).length +
      Object.values(s.overrides).filter((x) => x === r).length +
      out;
    ok(total === 5, `${r} supply accounting is inconsistent (${total}).`);
    ok(s.supply[r] >= 0, "The resource supply is empty.");
  }
  const cards = [
    ...s.players.flatMap((p) => p.hand),
    ...s.played.map((x) => x.card),
    ...s.discardUp.map((x) => x.card),
    ...s.discardDown,
  ];
  if (s.phase !== "draft" && s.phase !== "setup")
    ok(new Set(cards).size === cards.length, "An action card is duplicated.");
  return true;
}
