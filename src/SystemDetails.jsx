import { MAP } from "../game/data.js";
import { sprite } from "./Board.jsx";
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
export default function SystemDetails({ game, systemId, onPlayer, onClose }) {
  const system = MAP[systemId],
    pieces = game.pieces.filter((p) => p.system === systemId),
    controller = game.players[game.controls?.[systemId]],
    resource = game.overrides?.[systemId] ?? system.resource,
    buildings = pieces.filter(
      (p) => p.type === "city" || p.type === "starport",
    );
  return (
    <div className="system-details">
      <span className="eyebrow">
        SYSTEM · {systemId.replace("-", " / ").toUpperCase()}
      </span>
      <header>
        <div>
          <h2>
            Sector {system.cluster}{" "}
            <span>
              {system.symbol === "gate"
                ? "✧"
                : system.symbol === "arrow"
                  ? "▲"
                  : system.symbol === "hex"
                    ? "⬡"
                    : "☾"}
            </span>
          </h2>
          <p>
            {cap(system.symbol)}{" "}
            {system.symbol === "gate" ? "· Transit gate" : "system"}
          </p>
        </div>
        {resource && (
          <div className="system-resource">
            <img src={`/assets/${resource}.webp`} alt="" />
            <span>{cap(resource)}</span>
          </div>
        )}
      </header>
      <div
        className="system-control"
        style={{ "--player-color": controller?.color ?? "#a59c8e" }}
      >
        <span className="commander-mark" />
        {controller
          ? `${controller.name} controls this system`
          : "No player controls this system"}
      </div>
      {!!system.slots && (
        <section className="system-slots">
          <h3>
            Building sites{" "}
            <small>
              {buildings.length} / {system.slots} occupied
            </small>
          </h3>
          <div>
            {Array.from({ length: system.slots }, (_, i) => (
              <span key={i} className={buildings[i] ? "occupied" : "vacant"}>
                {buildings[i] ? (
                  <>
                    <img
                      src={sprite(
                        buildings[i].owner,
                        buildings[i].type,
                        buildings[i].damaged,
                      )}
                      alt=""
                    />
                    <small>
                      {game.players[buildings[i].owner].name} ·{" "}
                      {buildings[i].type}
                      {buildings[i].damaged ? " · damaged" : ""}
                    </small>
                  </>
                ) : (
                  <>
                    <span>＋</span>
                    <small>Empty site</small>
                  </>
                )}
              </span>
            ))}
          </div>
        </section>
      )}
      <section className="system-fleets">
        <h3>Fleets present</h3>
        {game.players.map((player) => {
          const ships = pieces.filter(
            (p) => p.owner === player.id && p.type === "ship",
          );
          if (!ships.length) return null;
          return (
            <div
              className="system-fleet"
              key={player.id}
              style={{ "--player-color": player.color }}
            >
              <button onClick={() => onPlayer(player.id)}>
                {player.name}
                <span>View play area ↗</span>
              </button>
              <div className="system-ships">
                {ships.map((p) => (
                  <img
                    key={p.id}
                    src={sprite(p.owner, "ship", p.damaged)}
                    alt={`${p.damaged ? "Damaged" : "Fresh"} ship`}
                  />
                ))}
              </div>
              <small>
                {ships.filter((p) => !p.damaged).length} fresh ·{" "}
                {ships.filter((p) => p.damaged).length} damaged
              </small>
            </div>
          );
        })}
        {!pieces.some((p) => p.type === "ship") && (
          <p className="system-empty">No ships stationed here.</p>
        )}
      </section>
      <details className="system-rules">
        <summary>How is control decided?</summary>
        <p>
          Control requires strictly more fresh ships than each rival. Damaged
          ships do not count. Ties leave the system uncontrolled; card abilities
          can modify control.
        </p>
      </details>
      <button className="system-back" onClick={onClose}>
        Return to the map →
      </button>
    </div>
  );
}
