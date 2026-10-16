import { MAP } from "../game/data.js";
import { cap } from "./tableContext.js";
const FACE = {
  hit: "Ship hit",
  self: "Self hit",
  intercept: "Intercept",
  building: "Building hit",
  key: "Raid key",
};
export const battleList = (game) => game.battles ?? [];
function Battle({ game, b }) {
  return (
    <section className="battle-record-entry">
      <h3>
        {game.players[b.attacker].name} against {game.players[b.defender].name}
      </h3>
      <p>
        {b.at ? `Round ${b.at.round} · ` : ""}
        {b.rifles ? "Galactic Rifles at " : ""}Sector {MAP[b.system].cluster} ·{" "}
        {cap(MAP[b.system].symbol)}
        {b.rerolls?.length ? ` · Rerolled: ${b.rerolls.join(", ")}` : ""}
      </p>
      <div className="battle-record-dice">
        {b.dice.length === 0 && (
          <div>
            <span>No dice rolled</span>
          </div>
        )}
        {b.dice.map((die, i) => (
          <div key={i}>
            <strong>{cap(die.type)}</strong>
            <span>
              {die.faces.length
                ? die.faces.map((f) => FACE[f]).join(" · ")
                : "Blank"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
// Every battle of the game, newest first, grouped by chapter. The current
// chapter is open; earlier ones are folded away.
export default function BattleRecord({ game }) {
  const battles = battleList(game),
    chapterOf = (b) => b.at?.chapter ?? game.chapter,
    chapters = [...new Set(battles.map(chapterOf))].reverse();
  return (
    <>
      <span className="eyebrow gold">BATTLE RECORD</span>
      <h2>Battle dice</h2>
      <p>
        Final dice of each battle, including any rerolls. Hit assignment and
        raid choices appear in the table log.
      </p>
      {chapters.map((chapter) => {
        const rolls = battles.filter((b) => chapterOf(b) === chapter);
        return (
          <details
            key={chapter}
            className="battle-record-chapter"
            open={chapter === chapters[0]}
          >
            <summary>
              Chapter {chapter} · {rolls.length} roll
              {rolls.length === 1 ? "" : "s"}
            </summary>
            {[...rolls].reverse().map((b) => (
              <Battle key={battles.indexOf(b)} game={game} b={b} />
            ))}
          </details>
        );
      })}
    </>
  );
}
