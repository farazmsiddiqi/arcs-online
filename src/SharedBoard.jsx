import { AMBITIONS } from "../game/data.js";
import { cap } from "./tableContext.js";
import { ambitionLabels, ambitionStanding } from "./sharedBoard.js";

export function AmbitionIcon({ ambition }) {
  const resources = {
    tycoon: ["material", "fuel"],
    keeper: ["relic"],
    empath: ["psionic"],
  }[ambition];
  return (
    <span className={`shared-ambition-icon ${ambition}`} aria-hidden="true">
      {resources ? (
        resources.map((r) => <img key={r} src={`/assets/${r}.webp`} alt="" />)
      ) : ambition === "tyrant" ? (
        <img src="/assets/y-agent.webp" alt="" />
      ) : (
        <>
          <img src="/assets/y-ship.webp" alt="" />
          <img src="/assets/y-starport.webp" alt="" />
        </>
      )}
    </span>
  );
}
export function AmbitionMarker({ marker }) {
  return (
    <span
      className={`physical-ambition-marker ${marker.flipped ? "flipped" : ""}`}
      aria-label={`${marker.high} Power for first, ${marker.low} for second`}
    >
      <b>{marker.high}</b>
      <small>{marker.low}</small>
    </span>
  );
}
export default function SharedBoard({ game, onAmbition }) {
  const threshold = { 2: 33, 3: 30, 4: 27 }[game.players.length];
  const available = game.markers
    .filter((m) => !m.ambition)
    .sort((a, b) => b.high - a.high);
  return (
    <aside className="shared-board" aria-label="Shared game board">
      <div className="shared-chapter">
        <strong>
          Chapter {game.chapter}
          <small> of 5</small>
        </strong>
        <span>Round {game.round}</span>
      </div>
      <ol className="chapter-spaces" aria-label="Chapter track">
        {[1, 2, 3, 4, 5].map((n) => (
          <li
            key={n}
            className={
              n === game.chapter ? "current" : n < game.chapter ? "past" : ""
            }
            aria-current={n === game.chapter ? "step" : undefined}
          >
            <span>{n}</span>
          </li>
        ))}
      </ol>
      <div className="shared-ambition-heading">
        <span>CHAPTER AMBITIONS</span>
        <small>1st / 2nd Power</small>
      </div>
      <div className="shared-ambitions">
        {AMBITIONS.map((a) => {
          const standing = ambitionStanding(game, a),
            declared = standing.markers.length > 0;
          const leaderText = !standing.leaders.length
            ? "No one ahead"
            : `${standing.tied ? "Tied: " : "Ahead: "}${standing.leaders.map((p) => p.name).join(" & ")} · ${standing.high}`;
          return (
            <button
              key={a}
              className={`shared-ambition ${declared ? "declared" : "undeclared"}`}
              onClick={() => onAmbition(a)}
              aria-label={`${cap(a)}. ${declared ? "Declared" : "Undeclared"}. ${leaderText}. View counts and scoring.`}
            >
              <AmbitionIcon ambition={a} />
              <span className="shared-ambition-name">
                <strong>{cap(a)}</strong>
                <small>{declared ? leaderText : "Not declared"}</small>
              </span>
              <span className="shared-ambition-markers">
                {declared ? (
                  standing.markers.map((m) => (
                    <AmbitionMarker key={m.id} marker={m} />
                  ))
                ) : (
                  <span className="empty-marker" aria-hidden="true">
                    —
                  </span>
                )}
              </span>
              {declared && standing.leaders.length > 0 && (
                <span
                  className="ambition-leading-pieces"
                  title={`${leaderText} · ${standing.high} ${ambitionLabels[a].toLowerCase()}`}
                >
                  {standing.leaders.map((p) => (
                    <i key={p.id ?? p.name} style={{ "--player": p.color }} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        className="available-ambition-markers"
        aria-label="Undeclared ambition markers"
      >
        <span>{available.length ? "To declare" : "No markers left"}</span>
        <div>
          {available.map((m) => (
            <AmbitionMarker key={m.id} marker={m} />
          ))}
        </div>
      </div>
      <small className="shared-board-help">
        {threshold}+ Power ends the game at chapter end. Select an ambition for
        counts & rules.
      </small>
    </aside>
  );
}
