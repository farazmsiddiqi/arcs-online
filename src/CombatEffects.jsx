import { piecePoint } from "./pieceMotion.js";
import { useEffect, useRef, useState } from "react";
export default function CombatEffects({ game, centers, slots }) {
  const seen = useRef(game.log?.at(-1)?.id ?? 0),
    prior = useRef(game.pieces),
    timer = useRef(null),
    [effects, setEffects] = useState([]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (
      (!game._replay && game.log?.at(-1)?.history) ||
      (game._replay && (!game._replay.animate || game._replay.direction < 0))
    ) {
      seen.current = game.log?.at(-1)?.id ?? 0;
      prior.current = game.pieces;
      setEffects([]);
      return;
    }
    const fresh = (game.log ?? []).filter(
      (e) => e.id > seen.current && e.effect?.system,
    );
    seen.current = Math.max(seen.current, game.log?.at(-1)?.id ?? 0);
    const next = fresh
      .map((e) => {
        const effect = e.effect,
          pieces = prior.current,
          piece = pieces.find((p) => p.id === effect.piece),
          center = centers[effect.system];
        if (!center) return null;
        let [x, y] = center;
        if (piece?.type === "ship") {
          const i = pieces
            .filter((p) => p.system === piece.system && p.type === "ship")
            .findIndex((p) => p.id === piece.id);
          x += -54 + (i % 4) * 45;
          y += -14 + Math.floor(i / 4) * 35;
        } else if (piece) {
          const i = pieces
            .filter(
              (p) => p.system === piece.system && p.type !== "ship" && !p.cloud,
            )
            .findIndex((p) => p.id === piece.id);
          [x, y] = slots[piece.system]?.[i] ?? center;
        }
        const attacker = pieces.find(
          (p) =>
            p.system === effect.system &&
            p.owner === effect.dealer &&
            p.type === "ship",
        );
        const start = attacker
          ? piecePoint({ pieces }, attacker)
          : [x - 165, y - 125];
        return {
          ...effect,
          id: `${game._replay?.sequence ?? 0}-${e.id}`,
          x,
          y,
          origin: [start[0] - x, start[1] - y],
          destroyedSprite: piece
            ? `/assets/${["r", "y", "b", "w"][piece.owner]}-${piece.type}${piece.damaged ? "-damaged" : ""}.webp`
            : null,
          expires: Date.now() + 1500,
        };
      })
      .filter(Boolean);
    prior.current = game.pieces;
    if (!next.length) return;
    setEffects((old) =>
      [...old.filter((e) => e.expires > Date.now()), ...next].slice(-40),
    );
  }, [game.revision, game._replay?.sequence]);
  useEffect(() => {
    if (!effects.length) return;
    timer.current = setTimeout(
      () => setEffects((old) => old.filter((e) => e.expires > Date.now())),
      Math.max(0, Math.min(...effects.map((e) => e.expires)) - Date.now()),
    );
    return () => clearTimeout(timer.current);
  }, [effects]);
  return (
    <g className="combat-effects" pointerEvents="none" aria-hidden="true">
      {effects.map((e) => (
        <g
          key={e.id}
          transform={`translate(${e.x} ${e.y})`}
          className={`combat-effect effect-${e.type}`}
        >
          {e.type === "loot" ? (
            <g className="loot-lift">
              <circle r="60" fill="#ddba6033" />
              <image
                href={
                  e.resource
                    ? `/assets/${e.resource}.webp`
                    : "/assets/card-back.webp"
                }
                x="-35"
                y="-35"
                width="70"
                height="70"
              />
              <text y="-60" textAnchor="middle" fill="#ffe6a3" fontSize="29">
                RAID · {game.players[e.owner]?.name}
              </text>
            </g>
          ) : (
            <>
              {e.type === "destroy" && e.destroyedSprite && (
                <image
                  className="destroyed-piece"
                  href={e.destroyedSprite}
                  x="-40"
                  y="-40"
                  width="80"
                  height="80"
                />
              )}
              <path
                className="hit-bolt"
                d={`M${e.origin.join(" ")} L0 0`}
                stroke="#fff0a3"
                strokeWidth="12"
              />
              <ellipse
                className="blast-shockwave"
                rx="50"
                ry="24"
                fill="none"
                stroke="#ffc98d"
                strokeWidth="9"
              />
              <circle
                className="blast-cloud"
                r={e.type === "destroy" ? 85 : 48}
                fill="#f47e3a"
              />
              {Array.from({ length: 14 }, (_, i) => (
                <g key={`debris-${i}`} transform={`rotate(${i * 137.5})`}>
                  <path
                    className="blast-debris"
                    style={{ animationDelay: `${(i % 4) * 35}ms` }}
                    d={`M${25 + (i % 3) * 9} 0 l${10 + (i % 4) * 6} 0`}
                    stroke={i % 2 ? "#ffe6a3" : "#e97947"}
                    strokeWidth={3 + (i % 3)}
                  />
                </g>
              ))}
              <circle
                className="impact-ring"
                r="22"
                fill="none"
                stroke={e.type === "destroy" ? "#ff9c55" : "#f8df91"}
                strokeWidth="8"
              />
              <circle
                className="impact-flash"
                r={e.type === "destroy" ? 48 : 28}
                fill="#ffe6ac"
              />
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <g key={i} transform={`rotate(${i * 45})`}>
                  <path
                    className="impact-spark"
                    d="M20 0 L68 0"
                    stroke={e.type === "destroy" ? "#fa854e" : "#ffe99b"}
                    strokeWidth="7"
                  />
                </g>
              ))}
              {e.type === "destroy" && e.pieceType !== "ship" && (
                <g className="city-embers">
                  <path
                    d="M-24 15 Q-50 -30 -9 -75 Q-12 -30 12 -55 Q62 5 25 25Z"
                    fill="#fa884bbb"
                  />
                  <path
                    d="M-10 22 Q-28 -18 4 -43 Q6 -4 23 19Z"
                    fill="#ffdc8c"
                  />
                </g>
              )}
            </>
          )}
        </g>
      ))}
    </g>
  );
}
