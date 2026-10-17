import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { areas } from "./mapGeometry.js";
import {
  worldScenery,
  quietEncounter,
  REACH_STARS,
} from "./boardAtmosphere.js";

// Decorative layer: never reads private hands, changes game state or takes clicks.
function LivingBoard({ clusters, overrides, enabled, quiet, selected }) {
  const root = useRef(null),
    sequence = useRef(0);
  const [visible, setVisible] = useState(false),
    [encounter, setEncounter] = useState(null);
  const clip = `reach-atmosphere-${useId().replace(/:/g, "")}`;
  // Polling creates fresh arrays; preserve the encounter schedule until geography changes.
  const geography = JSON.stringify([clusters, overrides ?? {}]);
  const worlds = useMemo(() => {
    const [active, resources] = JSON.parse(geography);
    return worldScenery(active, resources);
  }, [geography]);
  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }
    let inView = false;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () =>
      setVisible(inView && !document.hidden && !reduced.matches);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    });
    observer.observe(root.current.ownerSVGElement.closest(".map-viewport"));
    document.addEventListener("visibilitychange", update);
    reduced.addEventListener("change", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      reduced.removeEventListener("change", update);
    };
  }, [enabled]);
  useEffect(() => {
    setEncounter(null);
    if (!visible || quiet) return;
    let expire, next;
    const visit = () => {
      setEncounter(quietEncounter(worlds, sequence.current++));
      expire = setTimeout(() => setEncounter(null), 9000);
      next = setTimeout(visit, 33000);
    };
    next = setTimeout(visit, 7000);
    return () => {
      clearTimeout(next);
      clearTimeout(expire);
    };
  }, [visible, quiet, worlds]);
  if (!enabled) return null;
  return (
    <g
      ref={root}
      className="living-board"
      data-paused={!visible}
      data-quiet={quiet}
      pointerEvents="none"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clip}>
          {areas.map(
            (path, i) =>
              clusters.includes(i + 1) && (
                <path
                  key={i}
                  d={path}
                  transform="scale(1.35404392 1.35365854)"
                />
              ),
          )}
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <g className="reach-starlight">
          {REACH_STARS.map((star, i) => (
            <circle
              key={i}
              cx={star.x}
              cy={star.y}
              r={star.radius}
              style={{ animationDelay: `${star.delay}s` }}
            />
          ))}
        </g>
        {worlds.map((world) => (
          <g
            key={world.id}
            data-world-atmosphere={world.id}
            className={`world-atmosphere world-${world.kind} ${selected === world.id ? "world-focused" : ""}`}
            transform={`translate(${world.x} ${world.y})`}
            style={{
              "--world-ink": world.color,
              "--world-phase": `${world.phase}s`,
            }}
          >
            {world.kind !== "gate" && (
              <g className="planet-weather">
                <defs>
                  <radialGradient id={`${clip}-${world.id}-corona`}>
                    <stop
                      offset=".55"
                      stopColor={world.color}
                      stopOpacity="0"
                    />
                    <stop
                      offset=".82"
                      stopColor={world.color}
                      stopOpacity=".06"
                    />
                    <stop
                      offset=".94"
                      stopColor={world.color}
                      stopOpacity=".38"
                    />
                    <stop offset="1" stopColor={world.color} stopOpacity="0" />
                  </radialGradient>
                </defs>
                <ellipse
                  className="planet-corona"
                  rx="138"
                  ry="116"
                  style={{ fill: `url(#${clip}-${world.id}-corona)` }}
                />
                <g className="planet-cloud-bands">
                  <path d="M-90 -26 Q-38 -66 25 -36 T104 -31 M-104 20Q-30 -12 40 20T100 18" />
                  <path d="M-74 57Q-14 32 62 51" />
                </g>
                <path
                  className="planet-sunrise"
                  d="M-116 22A118 108 0 0 1 -30 -103"
                />
              </g>
            )}
            <ellipse
              className="world-halo"
              rx={world.kind === "gate" ? 48 : 98}
              ry={world.kind === "gate" ? 48 : 64}
            />
            {world.kind === "gate" ? (
              <g className="gate-tide">
                <circle r="39" />
                <path d="M-50 0h12 M38 0h12 M0 -50v12 M0 38v12" />
                <circle className="gate-signal" r="22" />
              </g>
            ) : (
              <>
                <g className="world-orbit">
                  <ellipse rx="112" ry="67" />
                  <circle cx="112" r="3" />
                </g>
                {world.kind === "material" && (
                  <g className="foundry-beacons">
                    {[
                      [-42, 23],
                      [-24, 32],
                      [13, 44],
                      [34, 20],
                      [-9, -30],
                      [47, -8],
                    ].map(([x, y], i) => (
                      <circle
                        key={i}
                        cx={x}
                        cy={y}
                        r={i % 2 ? 2 : 3}
                        style={{ animationDelay: `${world.phase + i * 0.9}s` }}
                      />
                    ))}
                    <circle cx="3" cy="5" r="3" />
                    <circle cx="-22" cy="17" r="2" />
                  </g>
                )}
                {world.kind === "fuel" && (
                  <g className="fuel-aurora">
                    <path d="M-84 8Q-42 -42 0 0T84 -8 M-78 19Q-32 -26 9 12T84 8" />
                    <path d="M-66 29Q-24 -6 16 24T77 22" />
                  </g>
                )}
                {world.kind === "weapon" && (
                  <g className="watch-station">
                    <path d="M-32 -18Q0 -50 32 -18 M-22 -7Q0 -28 22 -7 M0 -3v34 M-12 31h24" />
                    <circle className="watch-signal" cy="-5" r="7" />
                  </g>
                )}
                {world.kind === "relic" && (
                  <g className="relic-constellation">
                    <path d="M0 -44L38 22H-38Z M0 44L-38 -22H38Z" />
                    <circle r="51" strokeDasharray="2 19" />
                    <circle r="16" />
                  </g>
                )}
                {world.kind === "psionic" && (
                  <g className="psionic-tides">
                    <path d="M-88 50C-70 -80 5 70 42 -60S85 -20 98 -50" />
                    <path d="M-77 55C-52 -63 16 78 54 -50S95 -8 108 -38" />
                    <path d="M-64 59C-34 -45 30 84 66 -36S104 6 116 -20" />
                  </g>
                )}
              </>
            )}
          </g>
        ))}
        {encounter && (
          <g
            key={encounter.sequence}
            className="quiet-encounter"
            data-encounter={encounter.kind}
            transform={`translate(${encounter.world.x} ${encounter.world.y - 85})`}
          >
            <g className={`encounter-flight encounter-${encounter.kind}`}>
              {encounter.kind === "wanderer" ? (
                <g className="star-wanderer">
                  <path d="M-68 3Q-35 -26 8 -11Q30 -4 48 -20L39 1L54 13L28 9Q-7 31 -48 16L-68 3Z" />
                  <path className="wanderer-fin" d="M-18 7Q-24 34 -4 41L4 9" />
                  <circle cx="-43" cy="4" r="2" />
                </g>
              ) : encounter.kind === "comet" ? (
                <g className="quiet-comet">
                  <path d="M-160 23Q-80 -9 0 0" />
                  <path d="M-90 12L0 0" />
                  <circle r="4" />
                </g>
              ) : (
                <g className="quiet-courier">
                  <path d="M-13 0L13 -6L7 0L13 6Z M-22 -3h-12 M-25 4h-19" />
                  <circle cx="-57" r="1.5" />
                </g>
              )}
            </g>
          </g>
        )}
      </g>
    </g>
  );
}
export default memo(LivingBoard);
