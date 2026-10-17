import { RESOURCES } from "../game/data.js";
import { AmbitionIcon } from "./SharedBoard.jsx";
export const RESOURCE_GUIDE = {
  material: {
    name: "Material",
    action: "Build or repair",
    detail:
      "Spend one Material in your Prelude to build one ship or building, or repair one damaged piece.",
    rule: "Build a ship at your starport (once per starport per turn), or a city or starport in an empty slot in a system with one of your pieces. Building in a rival-controlled system places it damaged. Repair restores one damaged ship or building anywhere on the map.",
    ambition: "tycoon",
  },
  fuel: {
    name: "Fuel",
    action: "Move your fleet",
    detail: "Spend one Fuel in your Prelude to take one Move action.",
    rule: "Move any number of your ships from one system to an adjacent system. Starting at your starport lets you catapult onward through gates until you enter a rival-controlled gate or any planet.",
    ambition: "tycoon",
  },
  weapon: {
    name: "Weapon",
    action: "Unlock battles this turn",
    detail:
      "Spend one Weapon in your Prelude to let any of your card’s action pips pay for Battle actions this turn.",
    rule: "This does not give you a free battle or extra pips. You still spend a pip for each Battle and need your ships in the target system. A Weapon token itself does not count toward Warlord; trophies do.",
    ambition: null,
  },
  relic: {
    name: "Relic",
    action: "Secure a Court card",
    detail: "Spend one Relic in your Prelude to take one Secure action.",
    rule: "Take a Court card where you have more agents than each rival. Return your agents to your supply, capture rival agents on it, resolve its When Secured ability, then refill the Court.",
    ambition: "keeper",
  },
  psionic: {
    name: "Psionic",
    action: "Use the lead suit",
    detail:
      "Spend one Psionic in your Prelude to take one action listed on the lead card.",
    rule: "Use the suit of the round’s lead card, even if you played a different suit. This grants one action, not all of the lead card’s pips.",
    ambition: "empath",
  },
};
export default function ResourceDetails({ resource, game, onSelect }) {
  const info = RESOURCE_GUIDE[resource];
  const cartel = game.players.find((p) =>
    p.cards.includes(
      resource === "material" ? "BC03" : resource === "fuel" ? "BC06" : "",
    ),
  );
  return (
    <div className="resource-field-guide">
      <span className="eyebrow">RESOURCE FIELD GUIDE</span>
      <header>
        <img src={`/assets/${resource}.webp`} alt="" />
        <div>
          <h2>{info.name}</h2>
          <p>
            {game.supply?.[resource] ?? 0} in the supply
            {cartel ? ` · ${cartel.name} holds its Cartel` : ""}
          </p>
        </div>
      </header>
      <h3>{info.action}</h3>
      <p>{info.detail}</p>
      <div className="resource-rule-detail">{info.rule}</div>
      {info.ambition && (
        <div className="resource-ambition">
          <AmbitionIcon ambition={info.ambition} />
          <span>
            Each token you hold adds 1 to{" "}
            <strong>
              {info.ambition[0].toUpperCase() + info.ambition.slice(1)}
            </strong>
            . It scores only if that ambition is declared this chapter.
          </span>
        </div>
      )}
      <details>
        <summary>Holding, gaining & protecting resources</summary>
        <p>
          Tax a city to gain its planet’s resource from the supply. Tokens
          occupy resource slots on your player board. When gaining resources or
          losing slots, you may rearrange them and must discard any you cannot
          hold.
        </p>
        <p>
          A slot’s keys show the raid cost to steal its token. Outrage normally
          prevents spending resources of that type. Leader, Lore, and Guild
          abilities can change these rules.
        </p>
      </details>
      <nav aria-label="Explore resources">
        {RESOURCES.map((r) => (
          <button
            key={r}
            onClick={() => onSelect(r)}
            aria-pressed={r === resource}
            aria-label={`Explain ${RESOURCE_GUIDE[r].name}`}
          >
            <img src={`/assets/${r}.webp`} alt="" />
            {RESOURCE_GUIDE[r].name}
          </button>
        ))}
      </nav>
      <a
        href="https://rules.buriedgiant.com/?product=arcs&locale=en-US&printing=p1#9."
        target="_blank"
        rel="noreferrer"
      >
        Official rules · Resources ↗
      </a>
    </div>
  );
}
