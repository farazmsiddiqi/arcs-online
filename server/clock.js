import { RuleError } from "../game/engine.js";
const actorOf = (s) =>
  !s || s.phase === "over" ? null : (s.pending[0]?.p ?? s.current);
const turnKey = (s) =>
  !s
    ? "lobby"
    : s.phase === "draft"
      ? `draft:${s.current}`
      : `${s.chapter}:${s.round}:${s.current}`;
// Item 6: three knobs, each in seconds and 0 = off. `turn` caps one card turn,
// `bank` is a whole-game allowance per player, `increment` is added to the bank
// each time that player's card turn starts.
// Draft picks with no turn limit: 2 minutes live, 24 hours async.
const GRACE_MS = 10000,
  DRAFT_TURN = { live: 120, async: 86400 };
const knobs = (config) =>
  config.mode === "off"
    ? { turn: 0, bank: 0, increment: 0 }
    : {
        turn: config.turn ?? 0,
        bank: config.bank ?? 0,
        increment: config.increment ?? 0,
      };
export function validateTimer(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RuleError("Choose timer settings.");
  const mode = value.mode ?? "off",
    expiry = value.expiry ?? "auto";
  if (
    !["off", "live", "async"].includes(mode) ||
    !["overtime", "pause", "auto"].includes(expiry)
  )
    throw new RuleError("Choose a valid timer mode and timeout behavior.");
  if (mode === "off") return { mode, expiry, turn: 0, bank: 0, increment: 0 };
  const live = mode === "live",
    // With no knob given, the default is a turn cap only.
    given = ["turn", "bank", "seconds"].some((k) => value[k] !== undefined),
    turn = value.turn ?? value.seconds ?? (given ? 0 : live ? 300 : 86400),
    bank = value.bank ?? 0,
    increment = value.increment ?? 0;
  if (
    !Number.isInteger(turn) ||
    (turn !== 0 &&
      (live ? turn < 60 || turn > 3600 : turn < 3600 || turn > 604800))
  )
    throw new RuleError(
      "Live turn limits support 1–60 minutes; async turn limits support 1–168 hours.",
    );
  if (
    !Number.isInteger(bank) ||
    (bank !== 0 &&
      (live ? bank < 300 || bank > 36000 : bank < 3600 || bank > 604800))
  )
    throw new RuleError(
      "Live time banks support 5–600 minutes; async time banks support 1–168 hours.",
    );
  if (!Number.isInteger(increment) || increment < 0 || increment > 600)
    throw new RuleError("The increment supports 0–10 minutes.");
  if (!turn && !bank)
    throw new RuleError("Set a turn limit, a time bank, or both.");
  if (increment && !bank)
    throw new RuleError("An increment needs a time bank to add to.");
  return { mode, expiry, turn, bank, increment };
}
// `spent` is this card turn's time, `bonus` the host's extra time for this
// card turn. `total` is all decision time, shown to players. `charged` is what
// the bank pays: `total` less response grace and draft picks. `credit` holds
// increments earned, `bankBonus` the host's extra bank time. `grace` is what
// is left of the current response stretch's free time.
const SEAT_FIELDS = [
  "spent",
  "total",
  "bonus",
  "charged",
  "credit",
  "bankBonus",
];
export function initClock(room, now = Date.now()) {
  if (room.clock) {
    for (const field of SEAT_FIELDS)
      room.clock[field] = room.seats.map((_, i) => room.clock[field]?.[i] ?? 0);
    return;
  }
  room.clock = {
    revision: 0,
    config: validateTimer(room.options?.timer),
    key: turnKey(room.game),
    actor: actorOf(room.game),
    since: now,
    ...Object.fromEntries(SEAT_FIELDS.map((f) => [f, room.seats.map(() => 0)])),
    grace: 0,
    paused: false,
  };
  creditTurn(room, now);
}
const isDraft = (c) => c.key.startsWith("draft:");
const seatValue = (c, field, i) => c[field]?.[i] ?? 0;
// Bank left for seat `i`, excluding any grace and the running stretch.
const bankBalance = (c, i) =>
  knobs(c.config).bank * 1000 +
  seatValue(c, "bankBonus", i) +
  seatValue(c, "credit", i) -
  seatValue(c, "charged", i);
// Time left on each enabled limit after `dt` more ms on the clock. The draft
// uses only a per-turn clock: the table's `turn`, else `DRAFT_TURN`. Grace is
// spent before the bank, so it counts as time left on the bank.
function limits(c, dt) {
  const a = c.actor,
    k = knobs(c.config),
    out = {};
  if (a === null || c.config.mode === "off") return out;
  const draft = isDraft(c),
    turn = draft ? k.turn || DRAFT_TURN[c.config.mode] : k.turn;
  if (turn)
    out.turn =
      turn * 1000 + seatValue(c, "bonus", a) - seatValue(c, "spent", a) - dt;
  if (k.bank && !draft) out.bank = bankBalance(c, a) + (c.grace ?? 0) - dt;
  return out;
}
const tightest = (l) =>
  Object.keys(l).reduce((m, k) => (m === null || l[k] < l[m] ? k : m), null);
export function clockView(room, now = Date.now()) {
  if (!room.clock) {
    const copy = { ...room };
    initClock(copy, now);
    return clockView(copy, now);
  }
  const c = room.clock,
    active = c.actor,
    stops = ["pause", "auto"].includes(c.config.expiry),
    copyOf = (f) => room.seats.map((_, i) => seatValue(c, f, i)),
    spent = copyOf("spent"),
    total = copyOf("total"),
    charged = copyOf("charged");
  let dt = active === null || c.paused ? 0 : Math.max(0, now - c.since);
  const start = limits(c, 0),
    binding = tightest(start);
  // Pause and AI expiry stop every clock at zero.
  if (binding && stops) dt = Math.min(dt, Math.max(0, start[binding]));
  const grace = c.grace ?? 0;
  if (active !== null) {
    spent[active] += dt;
    total[active] += dt;
    if (!isDraft(c) && knobs(c.config).bank)
      charged[active] += Math.max(0, dt - grace);
  }
  const remaining = binding ? limits(c, dt)[binding] : null,
    bank = knobs(c.config).bank
      ? room.seats.map((_, i) => bankBalance({ ...c, charged }, i))
      : null;
  return {
    revision: c.revision ?? 0,
    restartConfig:
      c.config.mode === "off"
        ? (c.lastConfig ?? validateTimer({ mode: "live" }))
        : c.config,
    config: {
      mode: c.config.mode,
      expiry: c.config.expiry,
      ...knobs(c.config),
    },
    actor: active,
    spent,
    total,
    charged,
    bonus: c.bonus,
    credit: copyOf("credit"),
    bankBonus: copyOf("bankBonus"),
    // Seat bank balances, the binding limit ("turn" or "bank") and the
    // actor's unused response grace; the client counts these down.
    bank,
    binding,
    graceMs: active === null ? 0 : Math.max(0, grace - dt),
    draft: isDraft(c),
    remainingMs: remaining,
    paused: c.paused,
    blocked: c.paused || (remaining !== null && remaining <= 0 && stops),
    complete: room.game?.phase === "over",
    key: c.key,
  };
}
export function settleClock(room, now = Date.now()) {
  initClock(room, now);
  const v = clockView(room, now),
    c = room.clock;
  c.spent = v.spent;
  c.total = v.total;
  c.charged = v.charged;
  c.grace = v.graceMs;
  c.since = now;
}
// The seat whose card turn it is; null outside card turns (draft, setup,
// scoring), where every decision counts as a response.
const turnOwner = (s) =>
  s && ["card", "turn"].includes(s.phase) ? s.current : null;
export function followClock(room, now = Date.now()) {
  initClock(room, now);
  const c = room.clock,
    key = turnKey(room.game),
    actor = actorOf(room.game);
  // A new response stretch starts whenever the actor or the turn changes.
  if (key !== c.key || actor !== c.actor)
    c.grace = actor !== null && actor !== turnOwner(room.game) ? GRACE_MS : 0;
  if (key !== c.key) {
    c.key = key;
    c.spent = room.seats.map(() => 0);
    c.bonus = room.seats.map(() => 0);
    c.takeovers = [];
  }
  c.actor = actor;
  c.since = now;
  creditTurn(room, now);
}
// Add the increment once per card turn, as it starts. A seat that starts a
// turn with an empty bank is announced once, until its bank refills.
function creditTurn(room, now) {
  const c = room.clock,
    s = room.game,
    k = knobs(c.config);
  if (turnOwner(s) === null || c.credited === c.key) return;
  c.credited = c.key;
  if (!k.bank) return;
  const p = s.current,
    empty = bankBalance(c, p) <= 0;
  c.credit[p] += k.increment * 1000;
  c.empty = room.seats.map((_, i) => c.empty?.[i] ?? false);
  if (!empty) c.empty[p] = false;
  else if (!c.empty[p]) {
    c.empty[p] = true;
    const name = room.seats[p].name;
    addNotice(
      room,
      k.increment
        ? `${name}'s time bank is empty. From now on each of their turns gets only the increment: ${span(k.increment)}.`
        : c.config.expiry === "auto"
          ? `${name}'s time bank is empty. AI will play their turns unless the host adds time.`
          : c.config.expiry === "pause"
            ? `${name}'s time bank is empty. Play stops at each of their turns until the host adds time.`
            : `${name}'s time bank is empty. They are playing in overtime.`,
      p,
      now,
    );
  }
}
export function assertClockOpen(room, now = Date.now()) {
  const c = clockView(room, now);
  if (c.blocked)
    throw new RuleError(
      c.paused
        ? "The table is paused. The host can resume in Turn timers."
        : c.config.expiry === "auto"
          ? "Time expired. AI is completing this decision; the host can pause or add time in Turn timers."
          : "The timer has expired. The host can add time in Turn timers.",
    );
}
// Every timer notice is written here. Browsers show a notice once, keyed on
// `at`, so each `at` must be later than the one before it; the newest 20 stay.
// `p` is the seat the notice is about (null for none).
export function addNotice(room, text, p, now = Date.now()) {
  const last = room.notices?.at(-1)?.at ?? 0;
  room.notices = [
    ...(room.notices ?? []),
    { text, at: Math.max(now, last + 1), p },
  ].slice(-20);
}
// "1 minute", "5 minutes", "24 hours": notices reach every player as toasts.
const span = (seconds) => {
  const [n, unit] =
    seconds >= 3600 && seconds % 3600 === 0
      ? [seconds / 3600, "hour"]
      : seconds >= 60 && seconds % 60 === 0
        ? [seconds / 60, "minute"]
        : [seconds, "second"];
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
};
// "5 minutes per turn, 40 minutes time bank, +30 seconds each turn".
const summary = (k) =>
  [
    k.turn && `${span(k.turn)} per turn`,
    k.bank && `${span(k.bank)} time bank`,
    k.increment && `+${span(k.increment)} each turn`,
  ]
    .filter(Boolean)
    .join(", ");
export function changeClock(room, p, input, now = Date.now()) {
  if (p !== 0)
    throw Object.assign(new Error("Only the host can change table timers."), {
      status: 403,
    });
  // Validate first so a malformed command cannot partially settle the clock.
  const config =
    input.operation === "configure" ? validateTimer(input.config) : null;
  if (
    !["configure", "restart", "remove", "pause", "resume", "extend"].includes(
      input.operation,
    )
  )
    throw new RuleError("Choose a valid timer control.");
  if (
    input.operation === "extend" &&
    (!Number.isInteger(input.seconds) ||
      input.seconds < 30 ||
      input.seconds > 86400)
  )
    throw new RuleError("Add between 30 seconds and 24 hours.");
  settleClock(room, now);
  const c = room.clock;
  let extended;
  const previous = c.config;
  if (["configure", "restart", "remove"].includes(input.operation)) {
    if (previous.mode !== "off") c.lastConfig = previous;
    c.config =
      input.operation === "restart"
        ? validateTimer(
            previous.mode === "off"
              ? (c.lastConfig ?? { mode: "live" })
              : previous,
          )
        : input.operation === "remove"
          ? validateTimer({ mode: "off", expiry: previous.expiry })
          : config;
    room.options.timer = c.config;
    // Banks keep the time already charged and the increments earned.
    c.spent = room.seats.map(() => 0);
    c.bonus = room.seats.map(() => 0);
    c.bankBonus = room.seats.map(() => 0);
    c.paused = false;
    c.takeovers = [];
    // A new/restarted bank starts now, never charging earlier untimed play.
    if (
      input.operation === "restart" ||
      (!knobs(previous).bank && knobs(c.config).bank)
    ) {
      c.charged = room.seats.map(() => 0);
      c.credit = room.seats.map(() => 0);
      c.empty = room.seats.map(() => false);
      delete c.credited;
      creditTurn(room, now);
    }
    c.grace =
      c.actor !== null && c.actor !== turnOwner(room.game) ? GRACE_MS : 0;
  }
  if (input.operation === "pause") c.paused = true;
  if (input.operation === "resume") c.paused = false;
  if (input.operation === "extend") {
    if (c.actor === null || c.config.mode === "off")
      throw new RuleError("Start a timed game before adding time.");
    // Extra time goes to every limit that can run out on this decision; the
    // draft runs on a turn clock only.
    const k = knobs(c.config),
      ms = input.seconds * 1000;
    extended = {
      turn: isDraft(c) || k.turn > 0,
      bank: !isDraft(c) && k.bank > 0,
    };
    if (extended.turn) c.bonus[c.actor] += ms;
    if (extended.bank) c.bankBonus[c.actor] += ms;
  }
  const text =
    input.operation === "restart"
      ? `Host ${previous.mode === "off" ? "started" : "restarted"} timers: ${summary(c.config)}. All allowances refilled; game position unchanged.`
      : input.operation === "remove"
        ? "Host removed the timer. Play continues untimed; game position unchanged."
        : input.operation === "configure"
          ? config.mode === "off"
            ? "Timer set to untimed. Current allowance restarted."
            : `Timer set to ${summary(config)} (${config.mode}). Current allowance restarted${config.bank ? "; banks keep the time already used" : ""}.`
          : input.operation === "extend"
            ? `Host added ${span(input.seconds)} to ${room.seats[c.actor].name}'s ${
                extended.turn && extended.bank
                  ? "turn clock and time bank"
                  : extended.bank
                    ? "time bank"
                    : "current clock"
              }.`
            : `Host ${input.operation === "pause" ? "paused" : "resumed"} the table.`;
  // `p` is the seat whose clock this touches (the player now on the clock), so
  // that player's tab can flash. Pause, resume and settings changes stop or
  // restart the same clock.
  addNotice(room, text, c.actor, now);
  c.revision = (c.revision ?? 0) + 1;
}
