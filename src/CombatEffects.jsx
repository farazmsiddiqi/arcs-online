import { useEffect, useRef, useState } from "react";
export default function CombatEffects({ game, centers, slots }) {
  const seen = useRef(game.log?.at(-1)?.id ?? 0),
    prior = useRef(game.pieces),
    timer = useRef(null),
    [effects, setEffects] = useState([]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (game.log?.at(-1)?.history) {
      seen.current = game.log.at(-1).id;
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
        return { ...effect, id: e.id, x, y, expires: Date.now() + 1500 };
      })
      .filter(Boolean);
    prior.current = game.pieces;
    if (!next.length) return;
    setEffects((old) =>
      [...old.filter((e) => e.expires > Date.now()), ...next].slice(-40),
    );
  }, [game.revision]);
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
              <path
                className="hit-bolt"
                d="M-165 -125 L0 0"
                stroke="#fff0a3"
                strokeWidth="12"
              />
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
              <text
                className="impact-label"
                y="-65"
                textAnchor="middle"
                fill="#ffdfb4"
                fontSize="27"
              >
                {e.type === "destroy"
                  ? `${e.pieceType.toUpperCase()} DESTROYED`
                  : "DAMAGED"}
              </text>
            </>
          )}
        </g>
      ))}
    </g>
  );
}
