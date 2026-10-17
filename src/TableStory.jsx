import { Sparkles, ArrowRight, Clock3 } from "lucide-react";
import { ACTION_CARDS } from "../game/data.js";
import { cardImage } from "./Cards.jsx";
import { cap, declarationsFor } from "./tableContext.js";
import { AmbitionIcon, AmbitionMarker } from "./SharedBoard.jsx";
export function RoundStory({ game, onInspect, onPlayer }) {
  const lead = game.lead,
    declarations = declarationsFor(game);
  const leader = lead?.player ?? game.roundLeader ?? game.initiative;
  const order = game.players.map((_, i) => (leader + i) % game.players.length);
  return (
    <section className="round-story round-table" aria-label="This round">
      <div className="round-label">
        <span className="eyebrow">THIS ROUND</span>
        <strong>Cards on the table</strong>
        <small>
          {lead
            ? `${cap(lead.suit)} · beat ${lead.rank} to surpass`
            : "Waiting for the lead card"}
        </small>
        {declarations.map((d, i) => (
          <small className="declaration-note" key={i}>
            <span className="round-declaration-marker">
              <AmbitionIcon ambition={d.ambition} />
              <AmbitionMarker marker={d} />
              <span>
                {d.name ?? game.players[d.player]?.name} declared{" "}
                {cap(d.ambition)}
              </span>
            </span>
          </small>
        ))}
        {lead?.rank === 0 && (
          <small className="lead-rule">
            Zero marker: printed action pips are unchanged.
          </small>
        )}
      </div>
      <div className="round-seats">
        {order.map((p) => {
          const played = (game.played ?? []).find((c) => c.player === p),
            isLead = lead?.player === p;
          const id = isLead ? lead.id : played?.card;
          return (
            <div
              key={p}
              className={`round-seat ${isLead ? "is-lead" : ""} ${played && !isLead ? "played-response" : ""}`}
            >
              <button
                className="round-card"
                disabled={!id}
                onClick={() => onInspect(id)}
                aria-label={
                  id
                    ? `Inspect ${isLead ? "lead " : ""}${game.players[p].name}'s ${played?.mode ?? "lead"}`
                    : played
                      ? `${game.players[p].name} copied face down`
                      : `${game.players[p].name} has not played`
                }
              >
                {id || played ? (
                  <img
                    src={id ? cardImage(id) : "/assets/card-back.webp"}
                    alt=""
                  />
                ) : (
                  <span className="empty-play">
                    {game.phase === "draft"
                      ? "Drafting"
                      : game.decision?.actor === p
                        ? "Choosing…"
                        : "Not played"}
                  </span>
                )}
                {isLead && lead.rank === 0 && <b className="zero-marker">0</b>}
              </button>
              <div>
                <strong>
                  {game.players[p].name}
                  {p === game.me ? " · you" : ""}
                </strong>
                <span>
                  {isLead
                    ? "LEAD"
                    : played
                      ? played.mode === "copy"
                        ? "Copy · face down"
                        : cap(played.mode)
                      : "Waiting"}
                  {id && (
                    <>
                      {" "}
                      ·{" "}
                      <span
                        className={
                          isLead && lead.rank === 0 ? "printed-rank" : ""
                        }
                      >
                        {ACTION_CARDS[id].rank}
                      </span>
                      {isLead && lead.rank === 0 ? " → 0" : ""}
                    </>
                  )}
                </span>
                <div
                  className="round-player-power"
                  style={{ "--player": game.players[p].color }}
                  aria-label={`${game.players[p].name}: ${game.players[p].power} Power${p === game.initiative ? ", holds initiative" : ""}`}
                >
                  <span className="power-piece" aria-hidden="true" />
                  <b>{game.players[p].power}</b> Power
                  {p === game.initiative && (
                    <span className="round-initiative">
                      <span aria-hidden="true">◆</span>{" "}
                      {game.seized ? "Seized" : "Initiative"}
                    </span>
                  )}
                </div>
                <button
                  className="view-play-area"
                  onClick={() => onPlayer?.(p)}
                  aria-label={`View ${game.players[p].name}’s play area`}
                >
                  View play area <span aria-hidden="true">↗</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
export function TurnBeacon({ game, connected, onJump }) {
  const actor = game.decision?.actor,
    mine = actor === game.me;
  return (
    <div
      className={`turn-beacon ${mine ? "is-yours" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="beacon-icon">
        {mine ? <Sparkles size={16} /> : <Clock3 size={16} />}
      </span>
      <div>
        <strong>
          {game.phase === "over"
            ? game.decision.title
            : mine
              ? "Your move"
              : `${game.players[actor]?.name ?? "The table"} is playing`}
        </strong>
        <span>
          {connected
            ? (game.activity?.label ?? game.decision?.title)
            : "Reconnecting — your last saved position is shown"}
        </span>
      </div>
      {game.phase !== "draft" && game.phase !== "over" && (
        <span className="beacon-stage">
          {game.phase === "card"
            ? "1 · Play card"
            : game.turn?.prelude
              ? "2 · Prelude"
              : "3 · Actions"}
          {game.activity?.resolving ? " · Resolve" : ""}
        </span>
      )}
      {mine && (
        <button onClick={onJump}>
          Go to action <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}
