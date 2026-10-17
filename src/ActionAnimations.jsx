import { useEffect, useRef, useState } from "react";
import { Radio } from "lucide-react";
import {
  actionChanges,
  animationTargets,
  isForwardUpdate,
} from "./actionAnimations.js";
import { CENTERS, slotCoords } from "./mapGeometry.js";

export function useActionAnimations(game, tableId) {
  const previous = useRef({ game, tableId });
  const [effects, setEffects] = useState([]);
  const [activity, setActivity] = useState(null);
  const sequence = useRef(0);
  useEffect(() => {
    const before = previous.current;
    previous.current = { game, tableId };
    if (before.tableId !== tableId || !isForwardUpdate(before.game, game)) {
      if (
        before.game.revision !== game.revision ||
        before.tableId !== tableId
      ) {
        setEffects([]);
        setActivity(null);
      }
      return;
    }
    const changes = actionChanges(before.game, game);
    const fresh = (game.log ?? []).filter(
      (e) => e.id > (before.game.log?.at(-1)?.id ?? 0),
    );
    const now = Date.now(),
      batch = ++sequence.current;
    const spatial = changes
      .filter((c) =>
        [
          "build",
          "repair",
          "reshape",
          "tax",
          "battle",
          "remove",
          "damage",
        ].includes(c.kind),
      )
      .filter(
        (c) =>
          !["damage", "remove"].includes(c.kind) ||
          !fresh.some((e) => e.effect?.system === c.system),
      )
      .map((c, i) => {
        const piece = game.pieces.find((p) => p.id === c.piece);
        let point = CENTERS[c.system];
        if (piece && piece.type !== "ship" && !piece.cloud) {
          const buildings = game.pieces.filter(
            (p) => p.system === c.system && p.type !== "ship" && !p.cloud,
          );
          point =
            slotCoords[c.system]?.[
              buildings.findIndex((p) => p.id === piece.id)
            ] ?? point;
        }
        return { ...c, point, id: `${batch}-${i}`, expires: now + 1800 };
      });
    setEffects((old) =>
      [...old.filter((e) => e.expires > now), ...spatial].slice(-32),
    );
    const tokens = changes
      .filter((c) => c.kind === "resource" || c.kind === "power")
      .map((c) => ({ ...c, name: game.players[c.owner]?.name }));
    if (fresh.length || tokens.length)
      setActivity({
        id: batch,
        text: fresh.map((e) => e.text).join(" ") || "Resources updated",
        tokens,
        expires: now + 6500,
      });
    else if (changes.some((c) => c.kind === "turn"))
      setActivity({
        id: batch,
        text: `${game.players[game.current]?.name ?? "Table"} · ${game.turn?.prelude ? "Prelude" : game.phase === "turn" ? "Taking actions" : game.phase}`,
        expires: now + 4000,
      });
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const selectors = new Set(changes.flatMap(animationTargets));
    const animations = [];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        animations.push(
          element.animate(
            reduced
              ? [
                  {
                    outlineColor: "#e8c785",
                    outlineStyle: "solid",
                    outlineWidth: "2px",
                  },
                  {
                    outlineColor: "transparent",
                    outlineStyle: "solid",
                    outlineWidth: "2px",
                  },
                ]
              : [
                  { filter: "brightness(1)", transform: "translateY(0)" },
                  {
                    filter: "brightness(1.4)",
                    transform: "translateY(-3px)",
                    offset: 0.2,
                  },
                  { filter: "brightness(1)", transform: "translateY(0)" },
                ],
            { duration: reduced ? 1200 : 900, easing: "ease-out" },
          ),
        );
      }
    }
    return () => animations.forEach((a) => a.cancel());
  }, [game.revision, tableId]);
  useEffect(() => {
    if (!effects.length && !activity) return;
    const expiry = Math.min(
      ...effects.map((e) => e.expires),
      activity?.expires ?? Infinity,
    );
    const timer = setTimeout(
      () => {
        const now = Date.now();
        setEffects((old) => old.filter((e) => e.expires > now));
        setActivity((old) => (old?.expires > now ? old : null));
      },
      Math.max(0, expiry - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [effects, activity]);
  return { effects, activity };
}
export function ActionActivity({ activity, onHistory }) {
  return (
    <div className="action-activity" aria-live="polite" aria-atomic="true">
      {activity && (
        <button
          key={activity.id}
          onClick={onHistory}
          title="Open the full action history"
        >
          <Radio size={14} />
          <span>{activity.text}</span>
          {activity.tokens?.slice(0, 3).map((t, i) => (
            <span
              className="action-token-change"
              key={i}
              title={`${t.name}: ${t.delta > 0 ? "+" : ""}${t.delta} ${t.resource ?? "Power"}`}
            >
              {t.resource ? (
                <img src={`/assets/${t.resource}.webp`} alt={t.resource} />
              ) : (
                "✦"
              )}
              {t.delta > 0 ? "+" : ""}
              {t.delta}
            </span>
          ))}
        </button>
      )}
    </div>
  );
}
export function MapActionEffects({ effects }) {
  return (
    <g className="map-action-effects" pointerEvents="none" aria-hidden="true">
      {effects
        .filter((e) => e.point)
        .map((e) => (
          <g key={e.id} transform={`translate(${e.point.join(" ")})`}>
            <g className={`map-action-pulse ${e.kind}`}>
              <circle
                r="75"
                fill="none"
                stroke="currentColor"
                strokeWidth="5"
              />
              <circle r="100" fill="currentColor" opacity=".09" />
              {e.kind === "build" && (
                <image
                  href={`/assets/${["r", "y", "b", "w"][e.owner]}-${e.pieceType}${e.damaged ? "-damaged" : ""}.webp`}
                  x="-35"
                  y="-48"
                  width="70"
                  height="70"
                />
              )}
              <text
                y="-100"
                textAnchor="middle"
                fill="currentColor"
                fontSize="27"
              >
                {e.kind === "build"
                  ? "BUILT"
                  : e.kind === "repair"
                    ? "REPAIRED"
                    : e.kind === "tax"
                      ? "TAX"
                      : e.kind === "battle"
                        ? "BATTLE"
                        : e.kind === "remove"
                          ? "REMOVED"
                          : e.kind === "damage"
                            ? "DAMAGED"
                            : "RESHAPED"}
              </text>
              {e.kind === "tax" && e.resource && (
                <image
                  href={`/assets/${e.resource}.webp`}
                  x="-32"
                  y="-42"
                  width="64"
                  height="64"
                />
              )}
              {e.kind === "battle" && (
                <text y="12" textAnchor="middle" fontSize="60">
                  ⚔
                </text>
              )}
              {e.kind === "repair" && (
                <path
                  d="M-18 0 H18 M0 -18 V18"
                  stroke="currentColor"
                  strokeWidth="8"
                />
              )}
            </g>
          </g>
        ))}
    </g>
  );
}
