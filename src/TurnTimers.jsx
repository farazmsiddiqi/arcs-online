import { useState, useEffect, useRef } from "react";
import { duration } from "./duration.js";
export function useClock(clock) {
  const [now, setNow] = useState(() => ({
    source: clock,
    at: performance.now(),
    tick: performance.now(),
  }));
  useEffect(() => {
    setNow({ source: clock, at: performance.now(), tick: performance.now() });
    const timer = setInterval(
      () => setNow((s) => ({ ...s, tick: performance.now() })),
      500,
    );
    return () => clearInterval(timer);
  }, [clock]);
  if (!clock) return null;
  const dt =
    now.source === clock &&
    !clock.paused &&
    !clock.complete &&
    clock.actor !== null
      ? now.tick - now.at
      : 0;
  const remaining = clock.remainingMs === null ? null : clock.remainingMs - dt;
  const pauseExpiry =
    ["pause", "auto"].includes(clock.config.expiry) &&
    remaining !== null &&
    remaining <= 0;
  const elapsed = pauseExpiry ? Math.max(0, clock.remainingMs) : dt;
  // The bank drains only once the response grace is used up, never in the draft.
  const grace = clock.graceMs ?? 0,
    drain = clock.draft ? 0 : Math.max(0, elapsed - grace),
    mine = (v, i, add) => v + (i === clock.actor ? add : 0);
  return {
    ...clock,
    remainingMs: pauseExpiry ? 0 : remaining,
    blocked: clock.blocked || pauseExpiry,
    spent: clock.spent.map((v, i) => mine(v, i, elapsed)),
    total: clock.total.map((v, i) => mine(v, i, elapsed)),
    charged: clock.charged?.map((v, i) => mine(v, i, drain)),
    bank: clock.bank?.map((v, i) => mine(v, i, -drain)) ?? null,
    graceMs: Math.max(0, grace - elapsed),
  };
}
// "5 min per turn, 40 min bank, +30 s": one line for a timer setting.
const short = (seconds) =>
  seconds >= 3600 && seconds % 3600 === 0
    ? `${seconds / 3600} h`
    : seconds >= 60 && seconds % 60 === 0
      ? `${seconds / 60} min`
      : `${seconds} s`;
function timerSummary(config) {
  if (!config || config.mode === "off") return "Untimed";
  const turn = config.turn ?? 0;
  return [
    turn && `${short(turn)} per turn`,
    config.bank && `${short(config.bank)} bank`,
    config.increment && `+${short(config.increment)}`,
  ]
    .filter(Boolean)
    .join(", ");
}
// The countdown to show. During a response's free time the bank is not
// draining, so show the bank itself and the free time beside it.
const inGrace = (c) => c.binding === "bank" && c.graceMs > 0 && !c.draft;
const shownMs = (c) => (inGrace(c) ? c.bank[c.actor] : c.remainingMs);
export function ClockChip({ clock, onClick }) {
  const c = useClock(clock);
  if (!c) return null;
  // With a bank, say which limit the countdown is: "turn 3:12" / "bank 24:50".
  const which = c.config.bank ? `${c.binding} ` : "";
  return (
    <button
      className={`clock-chip ${c.blocked ? "paused" : c.remainingMs !== null && c.remainingMs < 30000 ? "urgent" : ""}`}
      onClick={onClick}
      aria-label="Turn timers"
    >
      <span>◷</span>
      <span>
        {c.paused
          ? "Table paused"
          : c.blocked
            ? c.config.expiry === "auto"
              ? "AI finishing turn"
              : "Time expired"
            : c.complete
              ? "Game complete"
              : c.remainingMs === null
                ? "Untimed"
                : which + duration(shownMs(c))}
        <small>
          {c.remainingMs < 0
            ? `Overtime · ${c.binding === "bank" ? "time bank" : "turn timer"}`
            : inGrace(c) && !c.blocked && !c.paused
              ? `${duration(c.graceMs)} free first`
              : "Turn timers"}
        </small>
      </span>
    </button>
  );
}
// Flash "+0:30" on a seat's bank when an increment or the host adds to it.
function useBankGains(clock) {
  const gains = clock?.bank
    ? clock.bank.map(
        (_, i) => (clock.credit?.[i] ?? 0) + (clock.bankBonus?.[i] ?? 0),
      )
    : null;
  const signature = gains?.join() ?? "",
    previous = useRef(null),
    [shown, setShown] = useState([]);
  useEffect(() => {
    const before = previous.current;
    previous.current = gains;
    if (!before || !gains || before.length !== gains.length) return;
    const up = gains.map((g, i) => Math.max(0, g - before[i]));
    if (!up.some(Boolean)) return;
    setShown(up);
    const timer = setTimeout(() => setShown([]), 2400);
    return () => clearTimeout(timer);
  }, [signature]);
  return shown;
}
// The form edits each limit in the unit a player would set it in.
const UNITS = { live: 60, async: 3600 };
function formFrom(config) {
  const unit = UNITS[config.mode] ?? 60,
    turn = config.turn ?? 0,
    // A newly chosen mode starts as before: a turn limit only.
    fresh = ["turn", "bank"].every((k) => config[k] === undefined);
  return {
    mode: config.mode,
    expiry: config.expiry,
    turnOn: fresh || turn > 0,
    turn: turn ? turn / unit : config.mode === "async" ? 24 : 5,
    bankOn: (config.bank ?? 0) > 0,
    bank: config.bank ? config.bank / unit : config.mode === "async" ? 72 : 40,
    increment: config.increment ?? 0,
  };
}
function configFrom(form) {
  if (form.mode === "off") return { mode: "off", expiry: form.expiry };
  const unit = UNITS[form.mode];
  return {
    mode: form.mode,
    expiry: form.expiry,
    turn: form.turnOn ? Math.round(Number(form.turn) * unit) : 0,
    bank: form.bankOn ? Math.round(Number(form.bank) * unit) : 0,
    increment: form.bankOn ? Math.round(Number(form.increment)) : 0,
  };
}
export default function TurnTimers({ room, onControl, busy, error }) {
  const c = useClock(room.clock),
    config = c?.config ?? { mode: "off", expiry: "auto", turn: 0, bank: 0 },
    gains = useBankGains(room.clock);
  const [form, setForm] = useState(() => formFrom(config)),
    set = (patch) => setForm((f) => ({ ...f, ...patch })),
    applied = JSON.stringify(config),
    unit = form.mode === "async" ? "Hours" : "Minutes",
    draft = configFrom(form);
  // Show the table's settings again whenever they change (an Apply here or
  // in the host's other tab), so the form never offers stale values.
  useEffect(() => setForm(formFrom(config)), [applied]);
  return (
    <>
      <span className="eyebrow gold">PACE OF PLAY</span>
      <h2>Turn timers</h2>
      <p>
        A turn limit caps each card turn, from choosing your card through
        confirmation. A time bank lasts your whole game, and an increment is
        added to it whenever your card turn starts. With both, the tighter one
        applies. Actions, Back, Undo, and Redo never restart a clock. During
        another player’s response only their clock runs, and the first 10
        seconds of each response do not touch their bank. Draft picks never use
        the bank.
      </p>
      {c && (
        <>
          <div className="timer-hero">
            <strong>
              {c.paused
                ? "Paused"
                : c.blocked
                  ? c.config.expiry === "auto"
                    ? "AI finishing turn"
                    : "Time expired"
                  : c.remainingMs === null
                    ? "Untimed"
                    : duration(shownMs(c))}
            </strong>
            <span>
              {c.actor === null
                ? "No active decision"
                : `${room.seats[c.actor]?.name} is resolving a decision${
                    c.remainingMs === null
                      ? ""
                      : c.binding === "bank"
                        ? " on their time bank"
                        : c.draft && !c.config.turn
                          ? ` on the ${c.config.mode === "async" ? "24-hour" : "2-minute"} draft clock`
                          : " on the turn limit"
                  }`}
              {c.graceMs > 0 && c.bank && !c.draft && (
                <> · {duration(c.graceMs)} free response time first</>
              )}
            </span>
            {c.config.mode !== "off" && (
              <span className="timer-summary">
                {timerSummary(c.config)} · {c.config.mode}
              </span>
            )}
          </div>
          <div className="timer-players">
            {room.seats.map((p, i) => (
              <div key={i} className={i === c.actor ? "active" : ""}>
                <strong>
                  {p.name}
                  {i === c.actor ? " · active" : ""}
                </strong>
                <span>{duration(c.spent[i] ?? 0)} this turn</span>
                {c.bank ? (
                  <>
                    <span
                      className={`timer-bank${c.bank[i] <= 0 ? " empty" : ""}`}
                    >
                      {c.bank[i] < 0
                        ? `Bank overdrawn by ${duration(-c.bank[i])}`
                        : `Bank ${duration(c.bank[i])} left`}
                      {gains[i] > 0 && (
                        <em className="timer-gain">+{duration(gains[i])}</em>
                      )}
                    </span>
                    <meter
                      className="timer-bank-meter"
                      aria-label={`${p.name}'s time bank`}
                      min="0"
                      max={Math.max(c.config.bank * 1000, c.bank[i])}
                      value={Math.max(0, c.bank[i])}
                    />
                    <small>
                      {duration(c.charged?.[i] ?? 0)} charged to bank ·{" "}
                      {duration(c.total[i] ?? 0)} total
                    </small>
                  </>
                ) : (
                  <small>{duration(c.total[i] ?? 0)} total decision time</small>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {room.host ? (
        <>
          <div className="timer-controls">
            <button
              disabled={busy}
              onClick={() =>
                onControl({ operation: c?.paused ? "resume" : "pause" })
              }
            >
              {c?.paused ? "Resume table" : "Pause table"}
            </button>
            <button
              disabled={busy || config.mode === "off" || c?.actor === null}
              onClick={() =>
                onControl({
                  operation: "extend",
                  seconds: config.mode === "async" ? 3600 : 60,
                })
              }
            >
              Add {config.mode === "async" ? "1 hour" : "1 minute"}
            </button>
          </div>
          <fieldset className="timer-settings" disabled={busy}>
            <legend>Host settings</legend>
            <label htmlFor="timer-mode">Mode</label>
            <select
              id="timer-mode"
              value={form.mode}
              onChange={(e) => {
                const mode = e.target.value;
                set({
                  ...formFrom({ mode, expiry: form.expiry }),
                  ...(form.mode === "off" ? { expiry: "auto" } : {}),
                });
              }}
            >
              <option value="off">Untimed</option>
              <option value="live">Live · minutes</option>
              <option value="async">Asynchronous · hours</option>
            </select>
            {form.mode !== "off" && (
              <>
                <div className="timer-knob">
                  <label className="timer-toggle">
                    <input
                      type="checkbox"
                      checked={form.turnOn}
                      onChange={(e) => set({ turnOn: e.target.checked })}
                    />
                    Turn limit
                  </label>
                  <label>
                    {unit} per turn
                    <input
                      type="number"
                      min="1"
                      max={form.mode === "async" ? 168 : 60}
                      disabled={!form.turnOn}
                      value={form.turn}
                      onChange={(e) => set({ turn: e.target.value })}
                    />
                  </label>
                </div>
                <div className="timer-knob">
                  <label className="timer-toggle">
                    <input
                      type="checkbox"
                      checked={form.bankOn}
                      onChange={(e) => set({ bankOn: e.target.checked })}
                    />
                    Time bank
                  </label>
                  <label>
                    {unit} per player, whole game
                    <input
                      type="number"
                      min={form.mode === "async" ? 1 : 5}
                      max={form.mode === "async" ? 168 : 600}
                      disabled={!form.bankOn}
                      value={form.bank}
                      onChange={(e) => set({ bank: e.target.value })}
                    />
                  </label>
                  <label>
                    Increment · seconds added each turn
                    <input
                      type="number"
                      min="0"
                      max="600"
                      disabled={!form.bankOn}
                      value={form.increment}
                      onChange={(e) => set({ increment: e.target.value })}
                    />
                  </label>
                </div>
                <label>
                  When time runs out
                  <select
                    value={form.expiry}
                    onChange={(e) => set({ expiry: e.target.value })}
                  >
                    <option value="auto">AI finishes the turn</option>
                    <option value="overtime">Show overtime · allow play</option>
                    <option value="pause">Stop play · host adds time</option>
                  </select>
                </label>
              </>
            )}
            <p className="timer-summary">
              {draft.mode === "off" || draft.turn || draft.bank
                ? timerSummary(draft)
                : "Choose a turn limit, a time bank, or both."}
            </p>
            <p>
              Applying settings restarts the current turn’s allowance for
              everyone and removes added time. Time already charged to a bank
              stays charged. Pausing stops play and clocks. Disconnection does
              not pause a clock. With AI completion, expiry commits the
              remaining legal decisions and passes play onward; once a bank is
              empty with no increment, AI plays that player’s turns until the
              host adds time. AI preserves saved resources and favors
              conservative actions. It never forfeits a player. Pause or add
              time to interrupt automatic play. Adding time goes to the turn
              limit and the bank alike.
            </p>
            <button
              className="primary full"
              onClick={() =>
                onControl({ operation: "configure", config: draft })
              }
            >
              Apply timer settings
            </button>
          </fieldset>
        </>
      ) : (
        <p>The host controls timer settings, pauses, and extra time.</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {room.notices?.length > 0 && (
        <details className="timer-notices">
          <summary>Timer activity</summary>
          {[...room.notices].reverse().map((n) => (
            <p key={`${n.at}-${n.text}`}>{n.text}</p>
          ))}
        </details>
      )}
    </>
  );
}
