import { decision } from "./engine.js";
// Practice rivals are deliberately simple; legal choices come only from the engine.
export function autoInput(s, rng = Math.random) {
  const p = s.pending[0]?.p ?? s.current,
    d = decision(s, p),
    t = s.pending[0];
  if (d.form) {
    const f = d.form;
    if (f.kind === "dice") {
      const dice = { skirmish: 0, assault: 0, raid: 0 },
        total = Math.min(18, f.max);
      for (let i = 0; i < total; i++) {
        const allowed = ["skirmish", "assault", "raid"].filter(
          (k) =>
            dice[k] < (k === "raid" ? f.raidMax : 6) &&
            (!f.corsair || k !== "assault" || dice.assault < dice.skirmish),
        );
        if (!allowed.length) break;
        dice[allowed[Math.floor(rng() * allowed.length)]]++;
      }
      return { value: dice };
    }
    return { value: f.options.slice(0, f.min).map((x) => x.id) };
  }
  let cs = d.choices.filter(
    (c) => !["arrangePick", "cancel", "pass", "withoutBonus"].includes(c.op),
  );
  if (s.phase === "turn" && !t) {
    const declares = cs.filter((c) => c.op === "declare"),
      actions = cs.filter((c) => c.op === "action");
    cs = declares.length
      ? declares
      : actions.length
        ? actions
        : cs.filter((c) => c.op === "endTurn");
  }
  if (!cs.length) cs = d.choices;
  if (!cs.length) throw new Error(`No legal choice: ${d.title}`);
  return { choice: cs[Math.floor(rng() * cs.length)].id };
}
// Test-only explorer: samples every legal op, including the ones autoInput
// skips (Prelude resource actions, Guild/Lore Preludes, Seize, Pass, Prepare,
// Back), and random legal subsets of form options.
const WEIGHTS = {
  pass: 0.15,
  cancel: 0.3,
  arrangePick: 0.2,
  endTurn: 0.5,
};
const pick = (xs, rng) => xs[Math.floor(rng() * xs.length)];
function subset(f, rng) {
  const options = [...f.options].sort(() => rng() - 0.5),
    hi = Math.min(f.max, options.length),
    size = f.min + Math.floor(rng() * (hi - f.min + 1)),
    perSystem = {},
    out = [];
  for (const o of options) {
    if (out.length >= size) break;
    if (f.maxPerSystem && o.system) {
      if ((perSystem[o.system] ?? 0) >= f.maxPerSystem) continue;
      perSystem[o.system] = (perSystem[o.system] ?? 0) + 1;
    }
    out.push(o.id);
  }
  return out;
}
export function exploreInput(s, rng = Math.random) {
  const p = s.pending[0]?.p ?? s.current,
    d = decision(s, p);
  if (d.form) {
    const f = d.form;
    if (f.kind === "dice") {
      const dice = { skirmish: 0, assault: 0, raid: 0 },
        total = f.min + Math.floor(rng() * (Math.min(18, f.max) - f.min + 1));
      for (let i = 0; i < total; i++) {
        const allowed = ["skirmish", "assault", "raid"].filter(
          (k) =>
            dice[k] < (k === "raid" ? f.raidMax : 6) &&
            (!f.corsair || k !== "assault" || dice.assault < dice.skirmish),
        );
        if (!allowed.length) break;
        dice[pick(allowed, rng)]++;
      }
      return { value: dice };
    }
    return { value: subset(f, rng) };
  }
  if (!d.choices.length) throw new Error(`No legal choice: ${d.title}`);
  // Pick an op first, then a choice within it, so rare ops are not drowned
  // out by long lists of targets.
  const groups = {};
  for (const c of d.choices) {
    const key =
      c.op === "action" ? `action:${c.cost === "pip" ? "pip" : "spend"}` : c.op;
    (groups[key] ??= []).push(c);
  }
  const keys = Object.keys(groups),
    weight = (k) => WEIGHTS[k] ?? 1;
  let r = rng() * keys.reduce((t, k) => t + weight(k), 0),
    key = keys.at(-1);
  for (const k of keys)
    if ((r -= weight(k)) < 0) {
      key = k;
      break;
    }
  return { choice: pick(groups[key], rng).id };
}
