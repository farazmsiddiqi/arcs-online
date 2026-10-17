import BoardCinema from "./BoardCinema.jsx";
import LivingBoard from "./LivingBoard.jsx";
import { useAtmosphere } from "./useAtmosphere.js";
import { piecePoint } from "./pieceMotion.js";
import { MapActionEffects } from "./ActionAnimations.jsx";
import useMapCamera from "./useMapCamera.js";
import { ZoomIn, ZoomOut, Scan, Focus } from "lucide-react";
import CombatEffects from "./CombatEffects.jsx";
import { useRef, useState, useEffect } from "react";
import { MAP } from "../game/data.js";
import { CENTERS, slotCoords, areas } from "./mapGeometry.js";
export const sprite = (owner, type, damaged = false) =>
  `/assets/${["r", "y", "b", "w"][owner]}-${type}${damaged ? "-damaged" : ""}.webp`;
export default function Board({
  game,
  actionEffects = [],
  selected,
  onSelect,
  selectedPieces = [],
  onPiece,
  onAction,
  onInspect,
  interactive = true,
  ambient = true,
}) {
  const atmosphere = useAtmosphere() && ambient;
  const [followActions, setFollowActions] = useState(
    () => localStorage.getItem("arcs-follow-actions") !== "off",
  );
  const camera = useMapCamera(
    followActions ? game.battleContext?.system : null,
    CENTERS,
    slotCoords,
    game.pieces,
  );
  useEffect(() => {
    if (!followActions) {
      camera.cancelTour();
      return;
    }
    if (!actionEffects.length) return;
    const lastBatch = actionEffects.at(-1).id.split("-")[0];
    const recent = actionEffects.filter(
      (e) => e.id.split("-")[0] === lastBatch,
    );
    camera.follow(recent);
  }, [actionEffects.at(-1)?.id, followActions]);
  const pieceActions = new Map(
    (interactive && game.decision?.actor === game.me
      ? (game.decision.choices ?? [])
      : []
    )
      .filter(
        (c) =>
          c.piece &&
          (game.decision.choices ?? []).filter(
            (other) => other.piece === c.piece,
          ).length === 1,
      )
      .map((c) => [c.piece, c]),
  );
  const boardChoices =
    interactive &&
    game.decision?.actor === game.me &&
    selected &&
    !game.interaction
      ? (game.decision.choices ?? []).filter((c) => c.system === selected)
      : [];
  const drag = useRef(null),
    suppressClick = useRef(false);
  const mine = interactive && game.decision?.actor === game.me;
  const selectable = new Set(
    mine && game.decision?.form?.kind === "pieces"
      ? game.decision.form.options.map((o) => o.id)
      : [],
  );
  const fleet = new Set(
    mine
      ? game.interaction?.kind === "moveTo"
        ? game.interaction.ids
        : game.interaction?.kind === "moveSelect"
          ? selectedPieces
          : []
      : [],
  );
  const [hovered, setHovered] = useState(null);
  const [flight, setFlight] = useState([]);
  const previous = useRef(game.pieces);
  const flightTimer = useRef(null);
  useEffect(() => () => clearTimeout(flightTimer.current), []);
  useEffect(() => {
    const moves =
      (!game._replay && game.log?.at(-1)?.history) ||
      game._replay?.animate === false
        ? []
        : game.pieces
            .filter((p) => {
              const old = previous.current.find((o) => o.id === p.id);
              return p.type === "ship" && old && old.system !== p.system;
            })
            .map((p) => ({
              id: p.id,
              owner: p.owner,
              damaged: p.damaged,
              fromPoint: piecePoint(
                { pieces: previous.current },
                previous.current.find((o) => o.id === p.id),
              ),
              toPoint: piecePoint(game, p),
              from: previous.current.find((o) => o.id === p.id).system,
              to: p.system,
            }));
    previous.current = game.pieces;
    if ((!game._replay && game.log?.at(-1)?.history) || !!game._replay)
      setFlight([]);
    if (
      !moves.length ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const now = Date.now();
    setFlight((old) => [
      ...old.filter(
        (m) =>
          !game._replay && m.expires > now && !moves.some((n) => n.id === m.id),
      ),
      ...moves.map((m) => ({
        ...m,
        key: `${game.revision}-${m.id}`,
        expires: now + 1500,
      })),
    ]);
  }, [game.revision, game._replay?.sequence]);
  useEffect(() => {
    if (!flight.length) return;
    flightTimer.current = setTimeout(
      () => setFlight((old) => old.filter((m) => m.expires > Date.now())),
      Math.max(0, Math.min(...flight.map((m) => m.expires)) - Date.now()),
    );
    return () => clearTimeout(flightTimer.current);
  }, [flight]);

  const route =
    hovered && game.interaction?.origin
      ? {
          a: CENTERS[game.interaction.origin],
          b: CENTERS[hovered],
        }
      : null;

  const targetSystems = new Set([
    ...(game.decision?.choices ?? []).map((c) => c.system).filter(Boolean),
    ...(mine ? (game.interaction?.destinations ?? []) : []),
  ]);
  const movementEvent = game.log?.filter((l) => l.movement).at(-1);
  const movement =
    movementEvent && movementEvent.id === game.log?.at(-1)?.id
      ? movementEvent.movement
      : null;
  const mv = movement
    ? { a: CENTERS[movement.from], b: CENTERS[movement.to] }
    : null;
  return (
    <div
      className="map-viewport"
      data-atmosphere={atmosphere && !game._replay ? "on" : "off"}
      data-zoom={camera.camera.z.toFixed(2)}
    >
      <BoardCinema game={game} enabled={ambient} />
      <div className="map-camera-controls" aria-label="Map camera">
        <button
          aria-label="Follow action camera"
          aria-pressed={followActions}
          onClick={() =>
            setFollowActions((value) => {
              localStorage.setItem("arcs-follow-actions", value ? "off" : "on");
              return !value;
            })
          }
        >
          <Focus size={16} />
          <span>Follow actions</span>
        </button>
        <button
          aria-label="Zoom in"
          onClick={() => camera.zoom(1.4)}
          disabled={camera.camera.z >= 3.99}
        >
          <ZoomIn size={17} />
        </button>
        <button
          aria-label="Zoom out"
          onClick={() => camera.zoom(1 / 1.4)}
          disabled={camera.camera.z <= 1.01}
        >
          <ZoomOut size={17} />
        </button>
        <button aria-label="Show whole map" onClick={camera.reset}>
          <Scan size={17} />
          <span>Overview</span>
        </button>
        {selected && (
          <>
            <button
              aria-label="Focus selected system"
              onClick={() => camera.focus(selected)}
            >
              <Focus size={17} />
            </button>
            <button onClick={onInspect}>System details</button>
          </>
        )}
      </div>
      {game.battleContext && (
        <div className="map-focus-caption">
          BATTLE · SECTOR {game.battleContext.system.split("-")[0]}
        </div>
      )}
      {boardChoices.length > 0 && (
        <div className="map-choice-tray">
          <span>
            SECTOR {selected.split("-")[0]} · {selected.split("-")[1]}
          </span>
          <h3>{game.decision.title}</h3>
          {boardChoices.map((c) => (
            <button
              key={c.id}
              disabled={!interactive}
              aria-label={c.label}
              onClick={() => onAction({ choice: c.id })}
            >
              {c.label.split(" · ")[0]}
              <span>→</span>
            </button>
          ))}
        </div>
      )}
      <svg
        ref={camera.svg}
        {...camera.handlers}
        className="physical-board"
        viewBox={camera.viewBox}
        role="img"
        aria-label="Original Arcs board with interactive ships, cities, starports and gates"
      >
        <defs>
          <filter id="pieceShadow">
            <feDropShadow dx="1" dy="5" stdDeviation="4" floodOpacity=".8" />
          </filter>
        </defs>
        <image href="/assets/map-no-slots.webp" width="2528" height="1776" />
        <LivingBoard
          clusters={game.clusters}
          overrides={game.overrides}
          enabled={atmosphere && !game._replay}
          quiet={!!game.battleContext || actionEffects.length > 0}
          selected={selected}
        />
        {areas.map(
          (pts, i) =>
            !game.clusters.includes(i + 1) && (
              <g key={i}>
                <path
                  d={pts}
                  transform="scale(1.35404392 1.35365854)"
                  fill="#171419e8"
                  pointerEvents="none"
                  data-out-of-play={i + 1}
                />
                <text
                  x={CENTERS[`${i + 1}-crescent`][0]}
                  y={CENTERS[`${i + 1}-crescent`][1]}
                  textAnchor="middle"
                  fill="#718289"
                  fontSize="25"
                  letterSpacing="5"
                >
                  OUT OF PLAY
                </text>
              </g>
            ),
        )}
        {Object.values(MAP)
          .filter((s) => game.clusters.includes(s.cluster))
          .map((s) => {
            const [x, y] = CENTERS[s.id],
              ships = game.pieces.filter(
                (p) => p.system === s.id && p.type === "ship",
              ),
              buildings = game.pieces.filter(
                (p) => p.system === s.id && p.type !== "ship",
              ),
              slots = slotCoords[s.id] ?? [];
            return (
              <g
                key={s.id}
                data-system={s.id}
                onPointerEnter={() => {
                  if (targetSystems.has(s.id)) setHovered(s.id);
                }}
                onPointerLeave={() => setHovered(null)}
                className={`physical-system ${selected === s.id ? "selected" : ""} ${targetSystems.has(s.id) ? "legal-target" : ""}`}
                tabIndex={0}
                role="button"
                aria-label={`${s.cluster} ${s.symbol}, ${ships.length} ships and ${buildings.length} buildings`}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  onSelect(s.id);
                }}
                onKeyDown={(e) => {
                  if (["Enter", " "].includes(e.key)) {
                    e.preventDefault();
                    onSelect(s.id);
                  }
                }}
              >
                <rect
                  x={x - 105}
                  y={y - 68}
                  width="210"
                  height="145"
                  rx="30"
                  className="system-target"
                />
                {targetSystems.has(s.id) && (
                  <circle cx={x} cy={y} r="118" className="legal-ring" />
                )}
                {selected === s.id && (
                  <rect
                    x={x - 116}
                    y={y - 77}
                    width="232"
                    height="164"
                    rx="32"
                    className="physical-select"
                  />
                )}
                <text
                  x={x}
                  y={y - 84}
                  textAnchor="middle"
                  className="system-overlay-label"
                >
                  {s.cluster}{" "}
                  {s.symbol === "gate"
                    ? "GATE"
                    : s.symbol === "arrow"
                      ? "▲"
                      : s.symbol === "hex"
                        ? "⬡"
                        : "☾"}
                </text>
                {selected === s.id && (
                  <g
                    className="selection-reticle"
                    pointerEvents="none"
                    transform={`translate(${x} ${y})`}
                  >
                    <path d="M-116 -52v-25h25 M91 -77h25v25 M116 52v25h-25 M-91 77h-25v-25" />
                  </g>
                )}
                {atmosphere &&
                  !game._replay &&
                  ships
                    .filter((p) => !p.damaged)
                    .map((piece) => {
                      const i = ships.indexOf(piece);
                      return (
                        <circle
                          key={`light-${piece.id}`}
                          className="ship-running-light"
                          cx={x - 79 + (i % 4) * 45}
                          cy={y - 14 + Math.floor(i / 4) * 35}
                          r="2.3"
                          fill={game.players[piece.owner]?.color ?? "#ead7ac"}
                          style={{ animationDelay: `${-(i % 4)}s` }}
                          pointerEvents="none"
                        />
                      );
                    })}
                {ships.length ? (
                  ships.map((piece, i) => (
                    <image
                      key={piece.id}
                      className={`board-piece board-ship ${pieceActions.has(piece.id) ? "piece-target" : ""} ${selectable.has(piece.id) ? "selectable-ship" : ""} ${selectedPieces.includes(piece.id) || fleet.has(piece.id) ? "picked-ship" : ""} ${fleet.has(piece.id) ? "draggable-ship" : ""}`}
                      data-piece={piece.id}
                      role={
                        selectable.has(piece.id) || pieceActions.has(piece.id)
                          ? "button"
                          : undefined
                      }
                      tabIndex={
                        selectable.has(piece.id) || pieceActions.has(piece.id)
                          ? 0
                          : undefined
                      }
                      aria-label={
                        pieceActions.get(piece.id)?.label ??
                        (selectable.has(piece.id)
                          ? `${selectedPieces.includes(piece.id) ? "Deselect" : "Select"} ${piece.damaged ? "damaged" : "fresh"} ship ${piece.id}`
                          : undefined)
                      }
                      aria-pressed={
                        selectable.has(piece.id)
                          ? selectedPieces.includes(piece.id)
                          : undefined
                      }
                      onClick={(e) => {
                        if (pieceActions.has(piece.id)) {
                          e.stopPropagation();
                          onAction({ choice: pieceActions.get(piece.id).id });
                          return;
                        }
                        if (suppressClick.current) {
                          suppressClick.current = false;
                          return;
                        }
                        if (selectable.has(piece.id)) {
                          e.stopPropagation();
                          onPiece(piece.id);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (
                          pieceActions.has(piece.id) &&
                          ["Enter", " "].includes(e.key)
                        ) {
                          e.preventDefault();
                          e.stopPropagation();
                          onAction({ choice: pieceActions.get(piece.id).id });
                          return;
                        }
                        if (
                          selectable.has(piece.id) &&
                          ["Enter", " "].includes(e.key)
                        ) {
                          e.preventDefault();
                          e.stopPropagation();
                          onPiece(piece.id);
                        }
                      }}
                      onPointerDown={(e) => {
                        if (fleet.has(piece.id)) {
                          e.preventDefault();
                          drag.current = { x: e.clientX, y: e.clientY };
                          e.currentTarget.setPointerCapture(e.pointerId);
                        }
                      }}
                      onPointerUp={(e) => {
                        if (!drag.current) return;
                        const moved =
                          Math.hypot(
                            e.clientX - drag.current.x,
                            e.clientY - drag.current.y,
                          ) > 8;
                        drag.current = null;
                        if (moved) {
                          suppressClick.current = true;
                          const dest = document
                            .elementFromPoint(e.clientX, e.clientY)
                            ?.closest("[data-system]")
                            ?.getAttribute("data-system");
                          if (dest && targetSystems.has(dest)) onSelect(dest);
                        }
                      }}
                      onPointerCancel={() => {
                        drag.current = null;
                      }}
                      opacity={
                        flight?.some((m) => m.id === piece.id) ||
                        (!matchMedia("(prefers-reduced-motion: reduce)")
                          .matches &&
                          actionEffects.some(
                            (e) =>
                              e.piece === piece.id &&
                              ["build", "repair"].includes(e.kind),
                          ))
                          ? 0
                          : 1
                      }
                      href={sprite(piece.owner, "ship", piece.damaged)}
                      x={x - 85 + (i % 4) * 45}
                      y={y - 40 + Math.floor(i / 4) * 35}
                      width="62"
                      height="53"
                      filter="url(#pieceShadow)"
                    />
                  ))
                ) : (
                  <circle cx={x} cy={y} r="7" fill="#e4d7a280" />
                )}
                {slots.map(([a, b], i) => (
                  <path
                    key={i}
                    d={`M${a},${b - 37} l34,59 h-68 Z`}
                    fill="#16181f88"
                    stroke="#cbc3a1"
                    strokeOpacity=".6"
                    strokeWidth="2"
                  />
                ))}
                {buildings.map((piece, i) => {
                  const slotIndex = buildings
                    .filter((v) => !v.cloud)
                    .indexOf(piece);
                  const [a, b] = piece.cloud
                    ? [x + 140, y + 80]
                    : (slots[slotIndex] ?? [x - 45 + i * 70, y + 74]);
                  return (
                    <image
                      key={piece.id}
                      className={`board-piece ${pieceActions.has(piece.id) ? "piece-target" : ""}`}
                      data-piece={piece.id}
                      role={pieceActions.has(piece.id) ? "button" : undefined}
                      tabIndex={pieceActions.has(piece.id) ? 0 : undefined}
                      aria-label={pieceActions.get(piece.id)?.label}
                      onClick={(e) => {
                        if (pieceActions.has(piece.id)) {
                          e.stopPropagation();
                          onAction({ choice: pieceActions.get(piece.id).id });
                        }
                      }}
                      onKeyDown={(e) => {
                        if (
                          pieceActions.has(piece.id) &&
                          ["Enter", " "].includes(e.key)
                        ) {
                          e.preventDefault();
                          e.stopPropagation();
                          onAction({ choice: pieceActions.get(piece.id).id });
                        }
                      }}
                      opacity={
                        !matchMedia("(prefers-reduced-motion: reduce)")
                          .matches &&
                        actionEffects.some(
                          (e) =>
                            e.piece === piece.id &&
                            ["build", "repair"].includes(e.kind),
                        )
                          ? 0
                          : 1
                      }
                      href={sprite(piece.owner, piece.type, piece.damaged)}
                      x={a - 43}
                      y={b - 45}
                      width="86"
                      height="86"
                      filter="url(#pieceShadow)"
                    />
                  );
                })}
                {game.overrides?.[s.id] && (
                  <image
                    href={`/assets/${game.overrides[s.id]}.webp`}
                    x={x + 65}
                    y={y - 65}
                    width="60"
                    height="60"
                  />
                )}
              </g>
            );
          })}
        {route?.a && route?.b && (
          <g className="route-preview" pointerEvents="none">
            <path
              d={`M${route.a.join(" ")} Q1264 888 ${route.b.join(" ")}`}
              fill="none"
              stroke="#ffdf9c"
              strokeWidth="10"
              strokeDasharray="18 14"
            />
            <circle
              cx={route.b[0]}
              cy={route.b[1]}
              r="135"
              fill="#f8d89118"
              stroke="#ffe4ae"
              strokeWidth="5"
            />
            <text
              x={route.b[0]}
              y={route.b[1] + 175}
              textAnchor="middle"
              fill="#fff2d5"
              fontSize="34"
            >
              CLICK TO MOVE · UNDO AVAILABLE
            </text>
          </g>
        )}
        {flight.map((m) => (
          <g key={m.key} pointerEvents="none">
            <path
              className="ship-flight-trail"
              d={`M${m.fromPoint.join(" ")} Q${(m.fromPoint[0] + m.toPoint[0]) / 2} ${(m.fromPoint[1] + m.toPoint[1]) / 2 - 65} ${m.toPoint.join(" ")}`}
              fill="none"
              stroke="#e9dcaa"
              strokeWidth="3"
            />
            <g className="flying-ship">
              <animateMotion
                dur="1.45s"
                fill="freeze"
                calcMode="spline"
                keyTimes="0;1"
                keySplines=".3 0 .25 1"
                path={`M${m.fromPoint.join(" ")} Q${(m.fromPoint[0] + m.toPoint[0]) / 2} ${(m.fromPoint[1] + m.toPoint[1]) / 2 - 65} ${m.toPoint.join(" ")}`}
              />
              <path
                className="ship-thruster"
                d="M-20 0 L-95 -12 L-65 0 L-95 12Z"
                fill="#ead29c"
              />
              <image
                href={sprite(m.owner, "ship", m.damaged)}
                x="-31"
                y="-26.5"
                width="62"
                height="53"
              />
            </g>
          </g>
        ))}
        <MapActionEffects effects={actionEffects} />
        <CombatEffects game={game} centers={CENTERS} slots={slotCoords} />
        {mv && !game._replay && (
          <g
            key={`${game.revision}-${movement.from}-${movement.to}`}
            className="movement-trail"
            pointerEvents="none"
          >
            <path
              d={`M${mv.a.join(" ")} Q1264 888 ${mv.b.join(" ")}`}
              fill="none"
              stroke={game.players[movement.owner]?.color}
              strokeWidth="7"
              strokeDasharray="12 15"
            />
          </g>
        )}
      </svg>
    </div>
  );
}
