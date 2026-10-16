// Regenerates tests/fixtures/ux-states.json.gz: one saved engine state per
// decision kind (pending task type, `preludeRoot`, `actionsRoot`, or the
// phase), each the richest example the drivers reached. Both bots play
// seeded games, so the output is deterministic for a given engine.
//   node scripts/ux-fixtures.mjs            # rewrite the fixture
//   GAMES=400 node scripts/ux-fixtures.mjs  # more explore seeds
import { createGame, decision, transition, viewFor } from "../game/engine.js";
import { autoInput, exploreInput } from "../game/autoplay.js";
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const explored = Number(process.env.GAMES ?? 240),
  out = new URL("../tests/fixtures/ux-states.json.gz", import.meta.url),
  fixtures = {},
  counts = {};
const keyOf = (s) =>
  s.pending[0]?.type ??
  (s.phase === "turn"
    ? s.turn.prelude
      ? "preludeRoot"
      : "actionsRoot"
    : s.phase);
function play(seed, driver, label) {
  let randomSeed = seed * 9187;
  const rng = () =>
    (randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0) /
    4294967296;
  let s = createGame(
    ["A", "B", "C", "D"].slice(0, 2 + (seed % 3)),
    { leaders: seed % 2 === 0, doubleLore: seed % 4 === 0 },
    seed,
  );
  for (let n = 0; n < 6000 && s.phase !== "over"; n++) {
    const p = s.pending[0]?.p ?? s.current,
      key = keyOf(s),
      d = decision(s, p),
      choices = d.choices.length + (d.form?.options?.length ?? 0);
    counts[key] = (counts[key] ?? 0) + 1;
    if (!fixtures[key] || choices > fixtures[key].choices)
      fixtures[key] = { seed: `${label}:${seed}`, choices, raw: s };
    s = transition(s, p, driver(s, rng));
  }
  if (s.phase === "over" && !fixtures.over)
    fixtures.over = { seed: `${label}:${seed}`, choices: 0, raw: s };
}
for (let seed = 1; seed <= explored; seed++)
  play(seed, exploreInput, "explore");
for (let seed = 1; seed <= 60; seed++) play(seed, autoInput, "auto");
for (const f of Object.values(fixtures)) {
  viewFor(f.raw, f.raw.pending[0]?.p ?? f.raw.current); // must render
  delete f.choices;
}
writeFileSync(out, gzipSync(JSON.stringify(fixtures)));
console.log(
  `${Object.keys(fixtures).length} states: ${Object.keys(fixtures).sort().join(" ")}`,
);
