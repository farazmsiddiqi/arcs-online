import { useRef } from "react";
import {
  KeyRound,
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
  Shield,
  Trophy,
  Users,
} from "lucide-react";
import { CARDS, RESOURCES } from "../game/data.js";
import { cardImage } from "./Cards.jsx";
import { sprite } from "./Board.jsx";
import ResourceTray from "./ResourceTray.jsx";
import RuleHelp from "./RuleHelp.jsx";
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const reference = {
  material: "Build / Repair",
  fuel: "Move",
  weapon: "Enable battles",
  relic: "Secure",
  psionic: "Lead suit action",
};
function CapturedPieces({ kind, player, game }) {
  const pieces = player[kind] ?? [];
  const Icon = kind === "trophies" ? Trophy : Users;
  return (
    <section
      className={`mat-captured ${kind}`}
      aria-label={`${cap(kind)}: ${pieces.length}`}
      title={`Returned to owners at chapter end if ${kind === "trophies" ? "Warlord" : "Tyrant"} was declared`}
    >
      <header>
        {cap(kind)} <b>{pieces.length}</b>
      </header>
      <div className="captured-pieces">
        {pieces.length ? (
          pieces.map((p, i) => (
            <img
              key={p.id ?? i}
              src={sprite(p.owner, p.type)}
              alt={`${game.players[p.owner]?.name} ${p.type}`}
              title={`${game.players[p.owner]?.name} ${p.type}`}
              style={{ "--piece-tilt": `${((i % 5) - 2) * 7}deg` }}
            />
          ))
        ) : (
          <Icon className="mat-watermark" aria-hidden="true" />
        )}
      </div>
      <small>{kind === "trophies" ? "Warlord" : "Tyrant"}</small>
    </section>
  );
}
export default function PlayerTable({
  game,
  playerId = game.me ?? 0,
  readOnly = false,
  live,
  busy,
  children,
  onInspect,
  onResource,
  onAction,
  resourceFocus,
}) {
  const ownedTrack = useRef(null);
  const me = game.players[playerId],
    actor =
      !readOnly &&
      playerId === game.me &&
      live &&
      game.decision?.actor === game.me,
    arranging = actor && !!game.resourceArrangement,
    keys = game.resourceKeys?.[playerId] ?? [3, 1, 1, 2, 1, 3],
    capacity = game.capacities?.[playerId] ?? me.resources.length,
    citySupply = game.supplies?.[playerId]?.city,
    owned = [me.leader, ...me.cards].filter(Boolean),
    handSize = Array.isArray(me.hand) ? me.hand.length : (me.hand ?? 0);
  return (
    <section
      className={`hand-tray player-table ${readOnly ? "public-player-table" : ""}`}
      aria-label={readOnly ? `${me.name}’s play area` : "Your player board"}
      style={{ "--player-color": me.color }}
    >
      <div className="player-table-inner">
        <header className="player-table-heading">
          <span className="commander-mark" />
          <strong>
            {me.name} <span>· {readOnly ? "Play area" : "Your play area"}</span>
          </strong>
          <span>{me.power} Power</span>
        </header>
        {game.supplies?.[playerId] && (
          <div className="mat-supplies" aria-label="Pieces in supply">
            {["ship", "agent", "starport"].map((type) => (
              <div key={type}>
                <img src={sprite(playerId, type)} alt="" />
                <strong>{game.supplies[playerId][type]}</strong>
                <span>
                  {type === "ship"
                    ? "Ships"
                    : type === "agent"
                      ? "Agents"
                      : "Starports"}
                  <small>in supply</small>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="personal-tabletop">
          <div className={`player-mat ${arranging ? "arranging" : ""}`}>
            <header className="mat-heading">
              <span>Resources</span>
              <small>{capacity} open slots</small>
              <RuleHelp
                label="How does your player board work?"
                info={{
                  title: "Your player board",
                  summary:
                    "Resources in slots. Cities in reserve. Rival pieces below.",
                  detail:
                    "Slot keys are the cost to steal a resource in a raid. Building cities opens resource slots; the last two cities also reveal scoring bonuses. Captured rival agents go in Captives (Tyrant); rival pieces you destroy go in Trophies (Warlord). Both return to their owners at chapter end only if that ambition was declared. Resource spending happens during Prelude; card abilities may change what a resource can do.",
                  page: 17,
                }}
              />
            </header>
            {arranging ? (
              <ResourceTray
                key={game.revision}
                game={game}
                busy={busy}
                onAction={onAction}
              />
            ) : (
              <div
                className="mat-resource-track"
                aria-label={`${me.name}’s stored resources`}
              >
                {Array.from(
                  { length: Math.max(6, capacity, me.resources.length) },
                  (_, i) => {
                    const r = me.resources[i],
                      open = i < capacity,
                      usable =
                        actor &&
                        game.turn?.prelude &&
                        !game.activity?.resolving &&
                        game.decision.choices.some(
                          (c) => c.group === `Prelude · slot ${i + 1}`,
                        ),
                      selected =
                        resourceFocus &&
                        resourceFocus.revision === game.revision &&
                        resourceFocus.index === i;
                    return (
                      <button
                        key={i}
                        className={`mat-resource ${open ? "open" : "locked"} ${usable ? "usable" : ""} ${selected ? "selected" : ""}`}
                        aria-label={`Resource slot ${i + 1}: ${r ? cap(r) : open ? "Empty" : "Locked"}${open ? `, ${keys[i]} raid keys` : r ? ", over capacity" : ", build cities to open"}`}
                        title={
                          usable
                            ? "Choose this token’s Prelude actions"
                            : open
                              ? "Resources can be spent during Prelude"
                              : r
                                ? "Over capacity · resolve the current resource decision"
                                : "Build cities to open more resource slots"
                        }
                        aria-pressed={usable ? selected : undefined}
                        disabled={!usable || busy}
                        onClick={() => onResource(i)}
                      >
                        <span className="mat-slot-keys">
                          <KeyRound size={10} />
                          {!open && r
                            ? "—"
                            : (keys[i] ?? [3, 1, 1, 2, 1, 3][i] ?? "—")}
                        </span>
                        {r ? (
                          <img src={`/assets/${r}.webp`} alt="" />
                        ) : open ? (
                          <span className="resource-socket" />
                        ) : (
                          <LockKeyhole className="locked-slot" size={18} />
                        )}
                        <small>{r ? cap(r) : open ? "Empty" : "Locked"}</small>
                      </button>
                    );
                  },
                )}
              </div>
            )}
            {citySupply != null && (
              <div
                className="mat-city-track"
                aria-label={`${citySupply} unbuilt cities`}
              >
                <span>Cities</span>
                {Array.from({ length: 5 }, (_, i) => (
                  <span
                    className={`city-reserve ${i < citySupply ? "occupied" : "built"}`}
                    key={i}
                    title={
                      i < citySupply
                        ? "Unbuilt city"
                        : "City removed from supply"
                    }
                  >
                    {i < citySupply ? (
                      <img src={sprite(playerId, "city")} alt="Unbuilt city" />
                    ) : (
                      <span>△</span>
                    )}
                  </span>
                ))}
                <small>
                  {citySupply === 0
                    ? "+5 city bonus"
                    : citySupply === 1
                      ? "+2 city bonus"
                      : "Build to uncover slots"}
                </small>
              </div>
            )}
            <div className="mat-lower">
              <div
                className="mat-reference"
                aria-label="Resource reference and outrage"
              >
                {RESOURCES.map((r) => (
                  <div
                    key={r}
                    className={me.outrage.includes(r) ? "outraged" : ""}
                    title={`${cap(r)}${me.outrage.includes(r) ? " · Outrage" : ""}: ${reference[r]}`}
                  >
                    <span>
                      <img src={`/assets/${r}.webp`} alt="" />
                      {me.outrage.includes(r) && (
                        <img
                          className="outrage-agent"
                          src={sprite(playerId, "agent")}
                          alt="Outrage"
                        />
                      )}
                    </span>
                    <small>{reference[r]}</small>
                  </div>
                ))}
              </div>
              <CapturedPieces kind="trophies" player={me} game={game} />
              <CapturedPieces kind="captives" player={me} game={game} />
            </div>
          </div>
          <section
            className="owned-table-cards"
            aria-label={`${me.name}’s owned cards`}
          >
            <header>
              Leader, Lore & Guilds <span>{owned.length}</span>
            </header>
            <div className="owned-card-spread" ref={ownedTrack}>
              {owned.map((id, i) => (
                <button
                  className="owned-table-card"
                  key={id}
                  aria-label={`Inspect ${me.name}’s ${CARDS[id].name}`}
                  onClick={() => onInspect(id)}
                  style={{ "--card-tilt": `${((i % 3) - 1) * 2}deg` }}
                >
                  <img src={cardImage(id)} alt={CARDS[id].name} />
                  <span>{CARDS[id].name}</span>
                </button>
              ))}
              {!owned.length && (
                <p className="empty-owned">
                  Secured Guilds and other owned cards go here.
                </p>
              )}
            </div>
            {owned.length > 1 && (
              <nav
                className="owned-card-browse"
                aria-label="Browse your owned cards"
              >
                <button
                  aria-label="Previous owned cards"
                  onClick={() =>
                    ownedTrack.current?.scrollBy({
                      left: -80,
                      behavior: matchMedia("(prefers-reduced-motion: reduce)")
                        .matches
                        ? "instant"
                        : "smooth",
                    })
                  }
                >
                  <ChevronLeft size={14} />
                </button>
                <span>{owned.length} cards</span>
                <button
                  aria-label="Next owned cards"
                  onClick={() =>
                    ownedTrack.current?.scrollBy({
                      left: 80,
                      behavior: matchMedia("(prefers-reduced-motion: reduce)")
                        .matches
                        ? "instant"
                        : "smooth",
                    })
                  }
                >
                  <ChevronRight size={14} />
                </button>
              </nav>
            )}
          </section>
        </div>
        <section
          className={`personal-hand ${actor && game.phase === "card" ? "hand-active" : ""}`}
          aria-label={
            readOnly
              ? `${handSize} face-down action cards`
              : "Your private action cards"
          }
        >
          <div className="hand-label">
            <span className="eyebrow">{readOnly ? "HAND" : "YOUR HAND"}</span>
            <strong>{handSize} action cards</strong>
            <span className="private-hand-note">
              <Shield size={10} />
              {readOnly ? "Faces hidden" : "Only you"}
            </span>
          </div>
          {readOnly ? (
            <div className="hidden-hand" aria-hidden="true">
              {Array.from({ length: handSize }, (_, i) => (
                <img
                  key={i}
                  src="/assets/card-back.webp"
                  alt=""
                  style={{ "--fan": `${(i - (handSize - 1) / 2) * 2}deg` }}
                />
              ))}
              {!handSize && <span>No cards in hand</span>}
            </div>
          ) : (
            children
          )}
        </section>
      </div>
    </section>
  );
}
