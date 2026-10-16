import { DICE, CARDS } from "../game/data.js";
import { OUTCOMES, dieStats, poolStats, percent } from "./battleOdds.js";
import { cap } from "./tableContext.js";
export function DiceSymbol({ symbol }) {
  return symbol === "key" ? (
    <svg
      className="dice-symbol"
      viewBox="0 0 24 24"
      aria-label="Raid key"
      role="img"
    >
      <circle cx="7" cy="7" r="4" />
      <path d="M10 10L21 21M17 17L20 14M14 14L17 11" />
    </svg>
  ) : (
    <span aria-label={OUTCOMES[symbol]?.label}>{OUTCOMES[symbol]?.icon}</span>
  );
}
export function PoolOdds({ dice }) {
  const stats = poolStats(dice),
    n = Object.values(dice).reduce((a, b) => a + Number(b), 0);
  return (
    <div className="pool-odds" aria-label="Selected dice probabilities">
      <strong>
        {n
          ? `${n} dice · chance of at least one symbol`
          : "Choose dice to preview your odds"}
      </strong>
      {n > 0 && (
        <div>
          {Object.entries(OUTCOMES).map(([s, o]) => (
            <span key={s}>
              <b>
                <DiceSymbol symbol={s} /> {percent(stats[s].chance)}
              </b>
              <small>{o.label}</small>
            </span>
          ))}
        </div>
      )}
      <small>
        Raw dice, before rerolls and card effects. Symbols may appear together;
        percentages do not add up to 100%.
      </small>
    </div>
  );
}
export default function BattleGuide({ game, dice }) {
  const b = game.battleContext;
  return (
    <>
      <span className="eyebrow gold">BATTLE · KNOW YOUR DICE</span>
      <h2>Choose your risks</h2>
      <p>
        Every die has six equally likely faces. Mix up to six of each type,
        within your fleet’s current dice allowance.
      </p>
      <div className="dice-guide-grid">
        {Object.keys(DICE).map((type) => (
          <section key={type}>
            <h3>{cap(type)}</h3>
            <p>
              {type === "skirmish"
                ? "Ship hits, with no self-hit or intercept symbols."
                : type === "assault"
                  ? "More ship hits, with a risk of damage to your own fleet."
                  : "Building hits and raid keys, with a risk to your own fleet."}
            </p>
            <div className="die-faces" aria-label={`${type} six faces`}>
              {DICE[type].map((f, i) => (
                <span
                  key={i}
                  title={f.map((s) => OUTCOMES[s].label).join(" + ") || "Blank"}
                >
                  <b>
                    {f.length
                      ? f.map((s, j) => <DiceSymbol key={j} symbol={s} />)
                      : "—"}
                  </b>
                  <small>1/6</small>
                </span>
              ))}
            </div>
            <ul>
              {Object.entries(OUTCOMES)
                .filter(([s]) => dieStats(type, s).chance > 0)
                .map(([s, o]) => (
                  <li key={s}>
                    <span>
                      <DiceSymbol symbol={s} /> {o.label}
                    </span>
                    <b>{percent(dieStats(type, s).chance)}</b>
                  </li>
                ))}
            </ul>
            <small>Chance of at least one symbol on one die.</small>
          </section>
        ))}
      </div>
      <PoolOdds dice={dice} />
      <div className="battle-definitions">
        {[
          [
            "✹ Ship hit",
            "Hit defending ships first, then buildings if no defending ships remain. A hit damages a fresh piece; another hit destroys a damaged piece. Hits are not guaranteed kills.",
          ],
          [
            "× Self hit",
            "Each symbol deals one hit to your attacking fleet. These are resolved before hits on the defender.",
          ],
          [
            "↩ Intercept",
            "If at least one intercept remains, your fleet takes one hit per fresh defending ship. Multiple intercept symbols do not multiply that damage. Card abilities can change this.",
          ],
          [
            "△ Building hit",
            "Assign a hit to a defending city or starport. Destroying a city causes Outrage and may trigger a Court ransack.",
          ],
          [
            "Raid key",
            "Spend keys to steal eligible resources or Guilds. Key costs vary; keys do not automatically steal an item or damage a city.",
          ],
        ].map(([label, text]) => (
          <div key={label}>
            <strong>{label}</strong>
            <p>{text}</p>
          </div>
        ))}
      </div>
      {b && (
        <section className="battle-context">
          <h3>This battle</h3>
          <p>
            {game.players[b.attacker].name} attacks{" "}
            {game.players[b.defender].name}. {b.freshDefenders} fresh defending
            ships normally threaten {b.freshDefenders} intercept hits.
          </p>
          <p>{b.raidReason}</p>
          {b.cards.length > 0 && (
            <>
              <p>
                These participating commanders’ cards may modify battle. Inspect
                their text before treating raw dice odds as damage predictions.
              </p>
              <ul>
                {b.cards.map((id) => (
                  <li key={id}>
                    <strong>{CARDS[id]?.name}</strong>:{" "}
                    {(CARDS[id]?.text ?? "")
                      .replaceAll("*", "")
                      .replaceAll("`", "")}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      <a
        className="reference-link"
        href="https://buriedgiant.com/arcs/Arcs_Base_Rulebook.pdf#page=14"
        target="_blank"
        rel="noreferrer"
      >
        Official battle rules ↗
      </a>
    </>
  );
}
