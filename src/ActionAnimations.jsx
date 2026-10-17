import { actionSound, playCue } from "./gameAudio.js";
import { piecePoint, animationEvents } from "./pieceMotion.js";
import { tokenMotion } from "./tokenMotion.js";
import { useEffect, useRef, useState } from "react";
import { Radio } from "lucide-react";
import {
  actionChanges,
  animationTargets,
  isForwardUpdate,
} from "./actionAnimations.js";
import { CENTERS } from "./mapGeometry.js";

export function useActionAnimations(game, tableId, scopeRef, audible = true) {
  const previous = useRef({ game, tableId });
  const [effects, setEffects] = useState([]);
  const [activity, setActivity] = useState(null);
  const sequence = useRef(0);
  const transfers = useRef([]);
  useEffect(() => () => transfers.current.forEach((stop) => stop()), []);
  useEffect(() => {
    const before = previous.current;
    previous.current = { game, tableId };
    if (!audible && !game._replay) {
      transfers.current.forEach((stop) => stop());
      transfers.current = [];
      setEffects([]);
      setActivity(null);
      return;
    }
    if (before.tableId !== tableId || !isForwardUpdate(before.game, game)) {
      if (
        before.game.revision !== game.revision ||
        before.tableId !== tableId ||
        game._replay
      ) {
        setEffects([]);
        setActivity(null);
      }
      return;
    }
    const changes = actionChanges(before.game, game);
    const fresh = animationEvents(before.game, game);
    if (audible)
      playCue(actionSound(changes, fresh), {
        reverse: game._replay?.direction < 0,
      });
    const now = Date.now(),
      batch = ++sequence.current;
    const spatial = changes
      .filter((c) =>
        [
          "move",
          "build",
          "repair",
          "reshape",
          "tax",
          "battle",
          "remove",
          "damage",
        ].includes(c.kind),
      )
      .map((c, i) => {
        const source = c.kind === "remove" ? before.game : game;
        const piece = source.pieces.find((p) => p.id === c.piece);
        const point = piece ? piecePoint(source, piece) : CENTERS[c.system];
        return {
          ...c,
          point,
          reverse: game._replay?.direction < 0,
          draw: !(
            ["damage", "remove"].includes(c.kind) &&
            !(game._replay?.direction < 0) &&
            fresh.some((e) => e.effect?.system === c.system)
          ),
          id: `${batch}-${i}`,
          expires: now + 1700,
        };
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
    transfers.current.push(
      tokenMotion(changes, fresh, game, scopeRef?.current),
    );
    if (transfers.current.length > 20) transfers.current.shift()();
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const selectors = new Set(changes.flatMap(animationTargets));
    const animations = [];
    for (const selector of selectors) {
      for (const element of (scopeRef?.current ?? document).querySelectorAll(
        selector,
      )) {
        if (
          scopeRef?.current &&
          element.closest("[data-animation-scope]") !== scopeRef.current
        )
          continue;
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
  }, [game.revision, game._replay?.sequence, tableId, audible]);
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
        .filter((e) => e.point && e.kind !== "move" && e.draw !== false)
        .map((e) => {
          const piece =
            e.pieceType &&
            `/assets/${["r", "y", "b", "w"][e.owner]}-${e.pieceType}${e.damaged ? "-damaged" : ""}.webp`;
          return (
            <g key={e.id} transform={`translate(${e.point.join(" ")})`}>
              {e.kind === "build" && (
                <g className="construction-sequence">
                  <ellipse
                    className="construction-platform"
                    rx="64"
                    ry="20"
                    cy="36"
                    fill="#bce3e626"
                    stroke="#bce3e6"
                    strokeWidth="2"
                  />
                  <path
                    className="construction-scaffold"
                    d="M-52 35 V-42 H52 V35 M-52 -10 H52 M-52 14 H52 M-26 -42 V35 M0 -42 V35 M26 -42 V35"
                    fill="none"
                    stroke="#bce3e6"
                    strokeWidth="2"
                  />
                  <image
                    className="constructed-piece"
                    href={piece}
                    x={e.pieceType === "ship" ? -31 : -43}
                    y={e.pieceType === "ship" ? -26.5 : -45}
                    width={e.pieceType === "ship" ? 62 : 86}
                    height={e.pieceType === "ship" ? 53 : 86}
                  />
                  {Array.from({ length: 8 }, (_, i) => (
                    <g
                      key={i}
                      transform={`translate(${((i % 4) - 1.5) * 28} ${i < 4 ? -25 : 20}) rotate(${i * 45})`}
                    >
                      <path
                        className="welding-spark"
                        style={{ animationDelay: `${i * 65}ms` }}
                        d="M0 0 l20 -20 M0 0 l-12 -18"
                        fill="none"
                        stroke="#fff0ba"
                        strokeWidth="3"
                      />
                    </g>
                  ))}
                  <path
                    className="welding-scan"
                    d="M-57 0 H57"
                    stroke="#fbe9ae"
                    strokeWidth="5"
                  />
                </g>
              )}
              {e.kind === "repair" && (
                <g className="repair-sequence">
                  <image
                    className="repair-piece"
                    href={piece}
                    x={e.pieceType === "ship" ? -31 : -43}
                    y={e.pieceType === "ship" ? -26.5 : -45}
                    width={e.pieceType === "ship" ? 62 : 86}
                    height={e.pieceType === "ship" ? 53 : 86}
                  />
                  <path
                    className="repair-scan"
                    d="M-55 0 H55"
                    stroke="#a4f6c5"
                    strokeWidth="6"
                  />
                  <circle
                    className="repair-orbit"
                    r="62"
                    fill="none"
                    stroke="#a4f6c5"
                    strokeDasharray="12 24"
                    strokeWidth="4"
                  />
                </g>
              )}
              {e.kind === "remove" && (
                <image
                  className="removed-piece"
                  href={piece}
                  x="-43"
                  y="-45"
                  width="86"
                  height="86"
                />
              )}
              {e.kind === "damage" && (
                <g className="replay-damage">
                  <path d="M-80 -50 L0 0" stroke="#ffbc7d" strokeWidth="7" />
                  <circle
                    className="impact-ring"
                    r="25"
                    fill="none"
                    stroke="#ffbc7d"
                    strokeWidth="5"
                  />
                </g>
              )}
              {e.kind === "tax" && (
                <g className="tax-extraction">
                  <path d="M-25 10 L-45 -80 H45 L25 10Z" fill="#ead99525" />
                  <path
                    d="M-30 -20 H30 M-36 -40 H36 M-42 -60 H42"
                    stroke="#ead995"
                    strokeWidth="3"
                  />
                </g>
              )}
              {e.kind === "battle" && (
                <g className="battle-crossfire">
                  <ellipse
                    className="battle-shield"
                    rx="140"
                    ry="90"
                    fill="none"
                    stroke="#f2bd79"
                    strokeWidth="3"
                  />
                  {[-30, 0, 30].map((y, i) => (
                    <path
                      key={y}
                      className="battle-laser"
                      style={{ animationDelay: `${i * 120}ms` }}
                      d={`M-150 ${y - 80} L110 ${y + 35}`}
                      stroke={i % 2 ? "#e68c62" : "#eedd9f"}
                      strokeWidth="5"
                    />
                  ))}
                </g>
              )}
              {e.kind === "reshape" && (
                <circle
                  className="repair-orbit"
                  r="90"
                  fill="none"
                  stroke="#cca6ec"
                  strokeWidth="6"
                />
              )}
              <text
                className="physical-action-label"
                y="-80"
                textAnchor="middle"
                fontSize="24"
                fill="#f6e6bc"
              >
                {e.reverse
                  ? "REWIND"
                  : e.kind === "build"
                    ? "CONSTRUCTION"
                    : e.kind === "repair"
                      ? "REPAIR"
                      : ""}
              </text>
            </g>
          );
        })}
    </g>
  );
}
